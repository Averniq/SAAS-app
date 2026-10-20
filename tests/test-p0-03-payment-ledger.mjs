import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20260817100000_p0_03_authoritative_payment_operations.sql", import.meta.url);
const [app, client, migration, p02Assertions, localRunner, localMatrix] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(new URL("../scripts/p0-02-batch2a-local-assertions.sql", import.meta.url), "utf8"),
  readFile(new URL("../scripts/run-p0-03-local-ledger-tests.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/p0-03-local-assertions.sql", import.meta.url), "utf8")
]);

assert.match(migration, /create table(?: if not exists)? public\.payment_operations/i);
assert.match(migration, /restaurant_id uuid not null/i);
assert.match(migration, /order_id uuid not null/i);
assert.match(migration, /amount_cents integer not null check \(amount_cents > 0\)/i);
assert.match(migration, /payment_method text not null check \(payment_method in \('Cash','Card','EFTPOS','Other'\)\)/i);
assert.match(migration, /idempotency_key uuid not null/i);
assert.match(migration, /payload_fingerprint text not null/i);
assert.match(migration, /unique \(restaurant_id, idempotency_key\)/i);
assert.match(migration, /foreign key \(restaurant_id, order_id\) references public\.orders\(restaurant_id, id\)/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /create policy "payment operations finance read"/i);
assert.match(migration, /array\['owner','manager','cashier'\]/i);
assert.match(migration, /create or replace function public\.record_authoritative_payment/i);
assert.match(migration, /security definer set search_path=public,pg_temp/i);
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/i);
assert.match(migration, /PAYMENT_EXCEEDS_REMAINING_BALANCE/i);
assert.match(migration, /extensions\.digest/i);
assert.match(migration, /for update/i);
assert.match(migration, /update public\.orders\s+set paid_at/i);
assert.match(migration, /paid_at = case when v_paid_cents = v_total_cents then coalesce\(paid_at, now\(\)\) else null end/i);
assert.match(migration, /payment_method = case when v_paid_cents = v_total_cents then p_method else payment_method end/i);
assert.match(migration, /closed_at = case when v_paid_cents = v_total_cents then coalesce\(closed_at, now\(\)\) else closed_at end/i);
const paymentFunction = migration.match(/create or replace function public\.record_authoritative_payment[\s\S]*?\n\$\$;/i)?.[0] ?? "";
assert.doesNotMatch(paymentFunction, /\bstatus\s*=/i);
assert.match(migration, /revoke all on table public\.payment_operations from public, anon, authenticated/i);
assert.match(migration, /revoke all on function public\.record_restaurant_order_payment\(uuid,uuid,text\) from public, anon, authenticated/i);
assert.match(migration, /p\.proname in \('record_restaurant_payment','void_restaurant_payment'\)/i);
assert.match(migration, /PAID_STATUS_REQUIRES_PAYMENT_LEDGER/i);
assert.match(migration, /when 'Served' then 'served'/i);
const orderStatusFunction = migration.match(/create or replace function public\.update_restaurant_order_status[\s\S]*?\n\$\$;/i)?.[0] ?? "";
assert.doesNotMatch(orderStatusFunction, /write_order_audit/i);
assert.match(p02Assertions, /expected\.signature <> 'public\.record_restaurant_order_payment\(uuid,uuid,text\)'/);
assert.match(p02Assertions, /B2A_REVOKED_LEGACY_PAYMENT_RPC_STILL_EXECUTABLE/);
assert.match(localRunner, /Promise\.all\(\[psql\(/);
assert.match(localRunner, /hosted databases are refused/i);
assert.match(localMatrix, /set local role authenticated/i);
assert.match(localMatrix, /direct ledger read accepted/i);
assert.match(localMatrix, /set local role postgres/i);
assert.match(localMatrix, /direct orders PATCH accepted/i);
assert.match(localMatrix, /PAID_STATUS_REQUIRES_PAYMENT_LEDGER/i);
assert.doesNotMatch(client, /rpc\/record_restaurant_payment/);
assert.doesNotMatch(client, /payments\?select=/);
assert.match(client, /rpc\/record_authoritative_payment/);
assert.doesNotMatch(app, /recordOrderPayment\(/);
assert.match(app, /recordFrontdeskPayment/);
console.log("P0-03 payment ledger static contract passed.");
