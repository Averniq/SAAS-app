#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/production-convergence-migrations/20260909120000_p0_deploy_01_task8_qr_token_metadata.sql", import.meta.url), "utf8");
const client = readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(migration, /function public\.get_public_qr_table_token_metadata\(p_restaurant_id uuid\)/,
  "Task 8 must expose staff-authorized token-existence metadata");
assert.match(migration, /has_active_token/,
  "metadata must distinguish a live QR/link from no live token");
assert.doesNotMatch(migration, /jsonb_build_object\([^)]*token_hash/s,
  "metadata response must not expose token hashes");
assert.match(client, /getPublicQrTableTokenMetadata\(profile\.restaurantId\)/,
  "dashboard data loading must request safe token metadata");
assert.match(app, /hasActivePublicQrToken/,
  "safe token-existence state must be carried to table cards");
assert.match(app, /Regenerate \/ Rotate QR/,
  "existing nonrecoverable tokens must be labelled as rotation");
assert.match(app, /previous customer QR\/link will stop working/,
  "rotation must visibly warn that the existing QR/link is invalidated");
assert.doesNotMatch(app, /localStorage\.[^(]+\([^)]*result\.token/s,
  "plaintext issuer tokens must not be persisted to browser storage");

console.log("Task 8 QR token-metadata UI regression: PASS");
