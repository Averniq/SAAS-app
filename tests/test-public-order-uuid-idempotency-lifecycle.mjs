#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");

assert.match(app, /const PUBLIC_ORDER_DRAFT_STORAGE_PREFIX = "aveniq-public-order:"/,
  "canonical public carts need token-scoped sessionStorage drafts");
assert.match(app, /function createPublicOrderIdempotencyKey\(\)/,
  "a new unsent public cart must receive a UUID idempotency key");
assert.match(app, /crypto\.randomUUID\?\.\(\)/,
  "the browser UUID generator must be preferred for public order idempotency");
assert.match(app, /function isValidPublicOrderIdempotencyKey\(value\)/,
  "restored public drafts must validate their UUID before submitting");
assert.match(app, /function restorePublicOrderDraft\(\)/,
  "refresh must restore the token-scoped public cart draft");
assert.match(app, /idempotencyKey: publicOrderIdempotencyKey/,
  "the display/local order id and canonical idempotency UUID must remain separate");
assert.match(app, /if \(!isValidPublicOrderIdempotencyKey\(publicOrderIdempotencyKey\)\) publicOrderIdempotencyKey = createPublicOrderIdempotencyKey\(\);/,
  "missing or legacy draft identifiers must upgrade once without discarding the cart");
assert.match(app, /sessionStorage\.setItem\(publicOrderDraftStorageKey\(\), JSON\.stringify\(\{ cart: state\.cart, note: publicOrderDraftNote\(\), idempotencyKey: publicOrderIdempotencyKey \}\)\)/,
  "cart, modifiers, note, and UUID must persist together");
assert.match(app, /clearPublicOrderDraft\(\);\s*publicOrderIdempotencyKey = "";/,
  "only a successful canonical submission may clear the draft UUID");
assert.match(app, /const isPublicOrder = isCanonicalPublicOrderRoute\(\);\s*if \(isPublicOrder && publicOrderSubmissionInProgress\) return;/,
  "duplicate customer confirmation clicks must not create duplicate local success records");
assert.match(app, /const isPublicOrder = isCanonicalPublicOrderRoute\(\);\s*if \(isPublicOrder && publicOrderSubmissionInProgress\) return;[\s\S]*?if \(isPublicOrder\) publicOrderSubmissionInProgress = true;[\s\S]*?await loadCloudDataIntoApp\(\{ silent: true \}\);/,
  "the public duplicate-confirm fence must engage before an awaited table refresh");
assert.match(app, /document\.getElementById\("clearCart"\)\.addEventListener\("click", \(\) => \{\s*state\.cart = \[\];\s*if \(isCanonicalPublicOrderRoute\(\)\) publicOrderIdempotencyKey = "";/,
  "discarding an unsent public cart must make the next logical order receive a fresh UUID");
assert.match(app, /Your order may have reached the kitchen\. Keep this cart unchanged and retry, or ask staff before creating a new order\./,
  "an ambiguous public-order failure must not imply that a new logical order is safe");
assert.match(app, /if \(isCanonicalPublicOrderRoute\(\)\) \{[\s\S]*?state\.orders\.unshift\(order\);[\s\S]*?state\.cart = \[\];[\s\S]*?clearPublicOrderDraft\(\);/,
  "a public cart must clear only after the canonical submission resolves");

assert.match(client, /function isUuid\(value\)/,
  "the client wrapper must validate the canonical UUID at the RPC boundary");
assert.match(client, /if \(!isUuid\(order\.idempotencyKey\)\) throw new Error\("A valid public order idempotency key is required\."\);/,
  "invalid legacy order IDs must fail client-side rather than reaching PostgreSQL");
assert.match(client, /submitPublicQrOrder\(token, items, order\.note, order\.customerName, order\.idempotencyKey\)/,
  "the wrapper must send only the UUID idempotencyKey");
assert.doesNotMatch(client, /order\.idempotencyKey \|\| order\.id/,
  "the legacy ord_<timestamp> fallback must never reach p_idempotency_key");

console.log("Public order UUID idempotency lifecycle regression: PASS");
