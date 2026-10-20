import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/035_order_integrity_audit.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../supabase-client.js", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.order_audit_log/i);
assert.match(migration, /alter table public\.order_audit_log enable row level security/i);
assert.match(migration, /revoke all on public\.order_audit_log from anon,authenticated/i);
assert.match(migration, /create or replace function public\.void_restaurant_order/i);
assert.match(migration, /create or replace function public\.void_restaurant_order_item/i);
assert.match(migration, /MANAGER_PIN_INVALID/);
assert.match(migration, /for update/);
assert.match(migration, /locked_order_access_attempt/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|order_items|payments)/i);
assert.match(client, /rpc\/void_restaurant_order/);
assert.match(client, /rpc\/void_restaurant_order_item/);
assert.match(client, /rpc\/get_order_activity/);
assert.match(app, /Void order/);
assert.match(app, /Void item/);
assert.match(app, /View activity/);
assert.match(app, /Locked — history and receipt only/);
console.log("Order integrity migration and UI contract checks passed.");
