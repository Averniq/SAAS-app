import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir).find((name) => name.includes('harden_kitchen_order_lifecycle'));

assert.ok(migrationName, 'a clean-state Kitchen lifecycle migration must exist');

const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

for (const action of ['Preparing', 'Ready', 'Served', 'Cancelled']) {
  assert.match(sql, new RegExp(`p_action[^\\n]*${action}|${action}[^\\n]*p_action`, 'i'), `migration must recognize ${action}`);
}

assert.match(sql, /for update/i, 'status transition must lock the current order row');
assert.match(sql, /status = 'new'.*p_action = 'Preparing'/is, 'only New may start Preparing');
assert.match(sql, /status = 'preparing'.*p_action = 'Ready'/is, 'only Preparing may become Ready');
assert.match(sql, /status = 'ready'.*p_action = 'Served'/is, 'only Ready may become Served');
assert.match(sql, /target_role not in \('owner','manager','staff','kitchen'\)/i, 'only Kitchen-capable restaurant members may progress');
assert.match(sql, /p_action = 'Cancelled'.*target_role not in \('owner','manager'\)/is, 'only owner or manager may cancel');
assert.match(sql, /p_action = 'Cancelled'.*paid_at is not null/is, 'a paid order must not be cancelled through Kitchen status');
assert.doesNotMatch(sql, /['"]Paid['"]/i, 'Kitchen RPC must never accept Paid');

console.log('Kitchen lifecycle database contract: PASS');
