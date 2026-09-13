#!/usr/bin/env node
// Local-only, disposable PG17 proof for Task 5. It intentionally uses two
// separate docker exec/psql processes: neither race is a sequential emulation.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const container = process.env.P0_DB_CONTAINER || 'supabase_db_p0d01t4h02cd79b9c6';
const actorId = randomUUID();
const organizationId = randomUUID();
const restaurantId = randomUUID();
const tableId = randomUUID();
const categoryId = randomUUID();
const menuItemId = randomUUID();
const marker = `task5-concurrency-${randomBytes(8).toString('hex')}`;

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function requireSuccess(result, label) {
  assert.equal(result.code, 0, `${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function createIsolatedFixture() {
  // This fixture is purpose-built and removed by ID; it never touches the
  // established Sake Street tenant or any of its historical rows.
  requireSuccess(await psql(`
begin;
insert into auth.users (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('${actorId}','authenticated','authenticated','${marker}@example.invalid','','{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());
insert into public.organizations (id,owner_user_id,name,slug,country,default_timezone,default_currency)
values ('${organizationId}','${actorId}','Task 5 isolated concurrency','${marker}','AU','Australia/Sydney','AUD');
insert into public.restaurants (id,owner_user_id,organization_id,name,slug,country,currency_code,ordering_enabled,venue_status)
values ('${restaurantId}','${actorId}','${organizationId}','Task 5 isolated concurrency','${marker}','AU','AUD',true,'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('${restaurantId}','${actorId}','owner');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token)
values ('${tableId}','${restaurantId}',1,'Concurrency table','${marker}','Concurrency table','${marker}');
insert into public.categories(id,restaurant_id,name,sort_order) values ('${categoryId}','${restaurantId}','Concurrency',1);
insert into public.menu_items(id,restaurant_id,category_id,name,price,local_id,category,is_active,is_available)
values ('${menuItemId}','${restaurantId}','${categoryId}','Concurrency item',12.34,'${marker}','Concurrency',true,true);
insert into public.public_qr_ordering_entitlements(restaurant_id,active,expires_at) values ('${restaurantId}',true,null);
commit;
`), 'Task 5 isolated fixture setup');
}

async function seedToken() {
  const token = randomBytes(32).toString('hex');
  const sql = `
begin;
delete from public.public_qr_order_operations where table_id='${tableId}';
delete from public.order_items i using public.orders o where i.order_id=o.id and o.note like '${marker}%';
delete from public.orders where note like '${marker}%';
update public.public_order_tokens
   set organization_id='${organizationId}', restaurant_id='${restaurantId}',
       token_hash=encode(extensions.digest('${token}','sha256'),'hex'), revoked_at=null, expires_at=null
 where table_id='${tableId}';
insert into public.public_order_tokens(organization_id,restaurant_id,table_id,token_hash,expires_at)
select '${organizationId}','${restaurantId}','${tableId}',encode(extensions.digest('${token}','sha256'),'hex'),null
where not exists (select 1 from public.public_order_tokens where table_id='${tableId}');
do $seed$ begin
  if (select count(*) from public.public_order_tokens where table_id='${tableId}' and organization_id='${organizationId}' and restaurant_id='${restaurantId}' and token_hash=encode(extensions.digest('${token}','sha256'),'hex') and revoked_at is null) <> 1 then
    raise exception 'TASK5_SEED_INVALID';
  end if;
end $seed$;
commit;
select 'TASK5_SEED_VERIFIED';
`;
  const output = requireSuccess(await psql(sql), 'Task 5 compatible seed');
  assert.match(output, /TASK5_SEED_VERIFIED/, 'seed must be verified before race sessions begin');
  return token;
}

function submitSql(token, idempotencyKey, quantity, suffix) {
  return `begin; set local role anon; select public.submit_public_qr_order('${token}','[{"menu_item_id":"${menuItemId}","quantity":${quantity}}]'::jsonb,'','${marker}-${suffix}','${idempotencyKey}'::uuid)->>'idempotent_replay' as idempotent_replay; commit;`;
}

async function assertCardinality(idempotencyKey, label) {
  const output = requireSuccess(await psql(`
select case when
 (select count(*) from public.public_qr_order_operations where idempotency_key='${idempotencyKey}')=1 and
 (select count(*) from public.orders o join public.public_qr_order_operations q on q.order_id=o.id where q.idempotency_key='${idempotencyKey}')=1 and
 (select count(*) from public.order_items i join public.public_qr_order_operations q on q.order_id=i.order_id where q.idempotency_key='${idempotencyKey}')=1
then '${label}_CARDINALITY_OK' else '${label}_CARDINALITY_INVALID' end;
`), `${label} cardinality check`);
  assert.match(output, new RegExp(`${label}_CARDINALITY_OK`));
}

async function raceSamePayload() {
  const token = await seedToken(); const idempotencyKey = randomUUID();
  const [left, right] = await Promise.all([
    psql(submitSql(token, idempotencyKey, 1, 'same')),
    psql(submitSql(token, idempotencyKey, 1, 'same'))
  ]);
  const outcomes = [requireSuccess(left, 'Race A session one'), requireSuccess(right, 'Race A session two')].join('\n');
  assert.equal((outcomes.match(/false/g) || []).length, 1, 'Race A requires exactly one canonical write');
  assert.equal((outcomes.match(/true/g) || []).length, 1, 'Race A requires exactly one deterministic replay');
  await assertCardinality(idempotencyKey, 'RACE_A');
  return 'RACE_A_GREEN';
}

async function raceDifferentPayload() {
  const token = await seedToken(); const idempotencyKey = randomUUID();
  const [left, right] = await Promise.all([
    psql(submitSql(token, idempotencyKey, 1, 'different-a')),
    psql(submitSql(token, idempotencyKey, 2, 'different-b'))
  ]);
  const succeeded = [left, right].filter(result => result.code === 0);
  const rejected = [left, right].filter(result => result.code !== 0);
  assert.equal(succeeded.length, 1, 'Race B requires exactly one canonical winner');
  assert.equal(rejected.length, 1, 'Race B requires one fail-closed conflict');
  assert.match(rejected[0].stderr, /IDEMPOTENCY_KEY_REUSED/, 'Race B loser must reject with IDEMPOTENCY_KEY_REUSED');
  await assertCardinality(idempotencyKey, 'RACE_B');
  return 'RACE_B_GREEN';
}

async function cleanup() {
  requireSuccess(await psql(`
begin;
delete from public.public_qr_order_operations where table_id='${tableId}';
delete from public.order_items i using public.orders o where i.order_id=o.id and o.restaurant_id='${restaurantId}';
delete from public.orders where restaurant_id='${restaurantId}';
delete from public.public_order_tokens where table_id='${tableId}';
delete from public.public_qr_ordering_entitlements where restaurant_id='${restaurantId}';
delete from public.menu_items where restaurant_id='${restaurantId}';
delete from public.categories where id='${categoryId}';
delete from public.restaurant_staff where restaurant_id='${restaurantId}';
delete from public.tables where id='${tableId}';
delete from public.restaurants where id='${restaurantId}';
delete from public.organizations where id='${organizationId}';
delete from auth.users where id='${actorId}';
commit;
`), 'Task 5 isolated fixture cleanup');
}

try {
  await createIsolatedFixture();
  console.log(await raceSamePayload());
  console.log(await raceDifferentPayload());
} finally {
  await cleanup();
}
