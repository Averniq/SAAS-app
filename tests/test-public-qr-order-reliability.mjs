import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, client, migration] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260817110000_p0_04_public_qr_ordering_boundary.sql", import.meta.url), "utf8")
]);

assert.match(app, /const cartStorageKey = `aveniq-public-order:\$\{token\}`/);
assert.match(app, /sessionStorage\.setItem\(cartStorageKey/);
assert.match(app, /clearPublicOrderDraft\(\)/);
assert.match(app, /submittedNote, publicOrderIdempotencyKey\)/);
assert.match(client, /p_idempotency_key: idempotencyKey/);
assert.match(migration, /public_qr_order_operations/);
assert.match(migration, /idempotent_replay/);
assert.match(migration, /IDEMPOTENCY_KEY_REQUIRED/);
console.log("Public QR order reliability guards passed.");
