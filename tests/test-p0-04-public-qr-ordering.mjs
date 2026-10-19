import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, client, migration, matrix] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260817110000_p0_04_public_qr_ordering_boundary.sql", import.meta.url), "utf8"),
  readFile(new URL("../scripts/p0-04-local-assertions.sql", import.meta.url), "utf8")
]);

assert.match(client, /getPublicQrOrderContext\(token\).*get_public_qr_order_context/s);
assert.match(client, /submitPublicQrOrder\(token, items, customerName, note, idempotencyKey\).*submit_public_qr_order/s);
assert.doesNotMatch(client, /function submitPublicTokenOrder/);
assert.match(app, /getPublicQrOrderContext\(token\)/);
assert.match(app, /submitPublicQrOrder\(token, submittedCart, submittedCustomerName, submittedNote, publicOrderIdempotencyKey\)/);
assert.doesNotMatch(app, /submitPublicTokenOrder\(/);

for (const name of ["get_public_qr_order_context", "submit_public_qr_order", "get_public_qr_order_status"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
  assert.match(migration, new RegExp(`alter function public\\.${name}[\\s\\S]*? owner to postgres`));
}
assert.match(migration, /expires_at timestamptz/);
assert.match(migration, /token_hash/);
assert.match(migration, /for update/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /payload_fingerprint/);
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/);
assert.match(migration, /INVALID_ORDER_OPTIONS/);
assert.match(migration, /category_snapshot/);
for (const legacyName of ["submit_order", "get_public_restaurant", "get_customer_order_status"]) {
  assert.match(migration, new RegExp(`revoke all on function[\\s\\S]*?public\\.${legacyName}`));
}
assert.match(migration, /p\.proname in \('get_public_order_context','submit_public_token_order','resolve_public_order_token'\)/);
assert.match(migration, /set search_path=public,pg_temp/);
assert.match(matrix, /P0-04/);
assert.match(matrix, /IDEMPOTENCY_KEY_REUSED/);
assert.match(matrix, /set local role anon/);
assert.match(matrix, /concurren/i);

console.log("P0-04 public QR ordering regression guards passed.");
