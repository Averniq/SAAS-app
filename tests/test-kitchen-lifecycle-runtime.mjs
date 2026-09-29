import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const container = `aveniq-kitchen-${randomUUID().slice(0, 8)}`;
const migration = readFileSync('supabase/migrations/20260929000000_harden_kitchen_order_lifecycle.sql', 'utf8');
const run = (args, input = '') => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const sql = (input) => run(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const id = () => randomUUID();
const restaurant = id(), otherRestaurant = id(), table = id();
const users = Object.fromEntries(['owner', 'manager', 'staff', 'kitchen', 'cashier', 'outsider'].map((role) => [role, id()]));
const asUser = (user, statement) => `begin; select set_config('request.jwt.claim.sub',${literal(user)},true); ${statement} commit;`;
const order = (status = 'new', paid = false) => {
  const orderId = id();
  sql(`insert into public.orders(id,restaurant_id,status,paid_at) values (${literal(orderId)}::uuid,${literal(restaurant)}::uuid,${literal(status)},${paid ? 'now()' : 'null'});`);
  return orderId;
};
const action = (user, orderId, name) => sql(asUser(user, `select public.update_restaurant_order_status(${literal(restaurant)}::uuid,${literal(orderId)}::uuid,${literal(name)});`));
const denied = (user, orderId, name, code) => assert.throws(() => action(user, orderId, name), new RegExp(code));

try {
  run(['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
    if (ready.status === 0) break;
    if (attempt === 29) throw new Error('local PostgreSQL did not become ready');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  sql(`create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table public.restaurant_staff(restaurant_id uuid not null,user_id uuid not null,role text not null,unique(restaurant_id,user_id));
create table public.orders(id uuid primary key,restaurant_id uuid not null,status text not null,paid_at timestamptz,served_at timestamptz,closed_at timestamptz,updated_at timestamptz not null default now());
${migration}`);
  sql(`insert into public.restaurant_staff(restaurant_id,user_id,role) values
(${literal(restaurant)}::uuid,${literal(users.owner)}::uuid,'owner'),(${literal(restaurant)}::uuid,${literal(users.manager)}::uuid,'manager'),(${literal(restaurant)}::uuid,${literal(users.staff)}::uuid,'staff'),(${literal(restaurant)}::uuid,${literal(users.kitchen)}::uuid,'kitchen'),(${literal(restaurant)}::uuid,${literal(users.cashier)}::uuid,'cashier'),(${literal(otherRestaurant)}::uuid,${literal(users.outsider)}::uuid,'owner');`);
  const happy = order();
  assert.match(action(users.kitchen, happy, 'Preparing'), /preparing/);
  assert.match(action(users.staff, happy, 'Ready'), /ready/);
  assert.match(action(users.owner, happy, 'Served'), /completed/);
  denied(users.owner, happy, 'Preparing', 'INVALID_KITCHEN_TRANSITION');
  for (const [from, next] of [['new', 'Ready'], ['new', 'Served'], ['preparing', 'Served'], ['ready', 'Preparing'], ['completed', 'Ready'], ['cancelled', 'Preparing']]) denied(users.owner, order(from), next, 'INVALID_KITCHEN_TRANSITION');
  denied(users.cashier, order(), 'Preparing', 'KITCHEN_ROLE_REQUIRED');
  denied(users.outsider, order(), 'Preparing', 'RESTAURANT_ACCESS_DENIED');
  assert.throws(() => sql(`select public.update_restaurant_order_status(${literal(restaurant)}::uuid,${literal(order())}::uuid,'Preparing');`), /AUTH_REQUIRED/);
  for (const role of ['owner', 'manager']) { const target = order(); assert.match(action(users[role], target, 'Cancelled'), /cancelled/); }
  for (const role of ['staff', 'kitchen', 'cashier']) denied(users[role], order(), 'Cancelled', 'CANCELLATION_ROLE_REQUIRED');
  denied(users.owner, order('ready'), 'Cancelled', 'INVALID_KITCHEN_TRANSITION');
  denied(users.owner, order('new', true), 'Cancelled', 'PAID_ORDER_CANNOT_BE_CANCELLED');
  const stale = order(); action(users.owner, stale, 'Preparing'); action(users.kitchen, stale, 'Ready'); denied(users.manager, stale, 'Cancelled', 'INVALID_KITCHEN_TRANSITION');
  console.log('Kitchen lifecycle runtime: PASS');
} finally {
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
}
