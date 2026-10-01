import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const container = `aveniq-kitchen-soak-${randomUUID().slice(0, 8)}`;
const root = process.cwd();
const run = (args, input = '') => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const sql = (input) => run(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input);
const sqlAsync = (input) => new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']);
  let output = '', error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error || output)));
  child.stdin.end(input);
});
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const id = () => randomUUID();
const iterations = 50;
const restaurant = id();
const table = id();
const users = Object.fromEntries(['owner', 'manager', 'staff', 'kitchen'].map((role) => [role, id()]));
const asUser = (user, statement) => `begin; select set_config('request.jwt.claim.sub',${q(user)},true); ${statement} commit;`;
const action = (user, orderId, name) => sqlAsync(asUser(user, `select public.update_restaurant_order_status(${q(restaurant)}::uuid,${q(orderId)}::uuid,${q(name)});`));
const pay = (user, orderId) => sqlAsync(asUser(user, `select public.record_authoritative_payment(${q(restaurant)}::uuid,${q(orderId)}::uuid,1000,'Card','','',${q(id())}::uuid);`));
const order = (status) => { const orderId = id(); sql(`insert into public.orders(id,restaurant_id,table_id,status,subtotal,tax,total,local_id) values (${q(orderId)}::uuid,${q(restaurant)}::uuid,${q(table)}::uuid,${q(status)},10,0,10,${q(orderId)});`); return orderId; };
const settled = async (...calls) => Promise.all(calls.map((call) => call.then(() => 'success', () => 'rejected')));
const summary = Object.fromEntries(['newPreparing','prepareCancel','readyStalePreparing','completeCancel','duplicateCompleted','paymentCancel'].map((name) => [name, { attempted: 0, successes: 0, rejections: 0, unexpected: 0 }]));
const record = (name, results) => { const entry = summary[name]; entry.attempted += 1; entry.successes += results.filter((result) => result === 'success').length; entry.rejections += results.filter((result) => result === 'rejected').length; };

try {
  run(['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  for (let attempt = 0; attempt < 30; attempt += 1) { if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) break; if (attempt === 29) throw new Error('PostgreSQL did not become ready'); await new Promise((resolve) => setTimeout(resolve, 250)); }
  sql(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema extensions; create extension pgcrypto with schema extensions; create publication supabase_realtime;`);
  for (const file of ['001_initial_schema.sql','002_platform_admin.sql','003_restaurant_staff_invites.sql','004_role_hardening.sql','005_all_round_staff.sql','006_function_permission_hardening.sql','007_explicit_data_api_grants.sql','008_authoritative_option_pricing.sql','009_reporting_layer.sql','010_advisor_index_rls_tuning.sql','011_consolidate_rls_policies.sql','014_payment_records.sql','018_record_restaurant_order_payment.sql']) sql(readFileSync(`${root}/supabase/migrations/${file}`, 'utf8'));
  sql(`insert into auth.users(id,email) values ${Object.values(users).map((user) => `(${q(user)}::uuid,${q(`${user}@test.invalid`)})`).join(',')}; insert into public.restaurants(id,owner_user_id,name,slug,status) values (${q(restaurant)}::uuid,${q(users.owner)}::uuid,'Soak','soak-${restaurant.slice(0,8)}','active'); insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values (${q(table)}::uuid,${q(restaurant)}::uuid,1,'One','one','One','soak-token'); insert into public.restaurant_staff(restaurant_id,user_id,role) values ${Object.entries(users).map(([role,user]) => `(${q(restaurant)}::uuid,${q(user)}::uuid,${q(role)})`).join(',')};`);
  for (let i = 0; i < iterations; i += 1) {
    let target = order('new'); let results = await settled(action(users.owner,target,'Preparing'), action(users.kitchen,target,'Preparing')); record('newPreparing', results); assert.deepEqual(results.sort(), ['rejected','success']); assert.equal(sql(`select status from public.orders where id=${q(target)}::uuid`), 'preparing');
    target = order('new'); results = await settled(action(users.kitchen,target,'Preparing'), action(users.owner,target,'Cancelled')); record('prepareCancel', results); assert.ok(results.includes('success')); assert.ok(['preparing','cancelled'].includes(sql(`select status from public.orders where id=${q(target)}::uuid`)));
    target = order('preparing'); results = await settled(action(users.kitchen,target,'Ready'), action(users.owner,target,'Preparing')); record('readyStalePreparing', results); assert.deepEqual(results.sort(), ['rejected','success']); assert.equal(sql(`select status from public.orders where id=${q(target)}::uuid`), 'ready');
    target = order('ready'); results = await settled(action(users.kitchen,target,'Served'), action(users.owner,target,'Cancelled')); record('completeCancel', results); assert.deepEqual(results.sort(), ['rejected','success']); assert.equal(sql(`select status from public.orders where id=${q(target)}::uuid`), 'completed');
    target = order('ready'); results = await settled(action(users.owner,target,'Served'), action(users.kitchen,target,'Served')); record('duplicateCompleted', results); assert.deepEqual(results.sort(), ['rejected','success']); assert.equal(sql(`select status from public.orders where id=${q(target)}::uuid`), 'completed');
    target = order('new'); results = await settled(pay(users.owner,target), action(users.owner,target,'Cancelled')); record('paymentCancel', results); assert.deepEqual(results.sort(), ['rejected','success']); assert.ok(['new','cancelled'].includes(sql(`select status from public.orders where id=${q(target)}::uuid`))); assert.equal(sql(`select (paid_at is not null)::text || ':' || status from public.orders where id=${q(target)}::uuid`), results.includes('success') && sql(`select status from public.orders where id=${q(target)}::uuid`) === 'cancelled' ? 'false:cancelled' : 'true:new');
  }
  console.log(`Kitchen concurrency soak: PASS ${JSON.stringify(summary)}`);
} finally { spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' }); }
