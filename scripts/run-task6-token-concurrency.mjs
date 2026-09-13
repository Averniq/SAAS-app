#!/usr/bin/env node
// Local-only Task 6 concurrency proof. Every fixture identifier is unique and
// cleanup targets only those IDs, preserving the established Sake Street data.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const container = process.env.P0_DB_CONTAINER || 'supabase_db_p0d01t4h02cd79b9c6';
const ownerId = randomUUID(), managerId = randomUUID(), organizationId = randomUUID(), restaurantId = randomUUID(), tableId = randomUUID();
const marker = `task6-concurrency-${randomBytes(8).toString('hex')}`;
const digest = value => createHash('sha256').update(value).digest('hex');

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-q', '-t', '-A', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr })); child.stdin.end(sql);
  });
}
function succeed(result, label) { assert.equal(result.code, 0, `${label} failed: ${result.stderr || result.stdout}`); return result.stdout.trim(); }
function issueSql(actorId, finish = 'commit') {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actorId}',true); select set_config('request.jwt.claim.role','authenticated',true); select public.issue_public_qr_table_token('${restaurantId}','${tableId}',null); ${finish};`;
}
function parseIssuance(result, label) { return JSON.parse(succeed(result, label).split(/\r?\n/).at(-1)); }

async function createFixture() {
  succeed(await psql(`begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('${ownerId}','authenticated','authenticated','${marker}-owner@example.invalid','','{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
 ('${managerId}','authenticated','authenticated','${marker}-manager@example.invalid','','{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency) values ('${organizationId}','${ownerId}','Task 6 isolated concurrency','${marker}','AU','Australia/Sydney','AUD');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,country,currency_code,ordering_enabled,venue_status) values ('${restaurantId}','${ownerId}','${organizationId}','Task 6 isolated concurrency','${marker}','AU','AUD',true,'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('${restaurantId}','${ownerId}','owner'),('${restaurantId}','${managerId}','manager');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values ('${tableId}','${restaurantId}',1,'Concurrency table','${marker}','Concurrency table','${marker}');
commit;`), 'Task 6 isolated fixture setup');
}

async function verifyRace() {
  const [owner, manager] = await Promise.all([psql(issueSql(ownerId)), psql(issueSql(managerId))]);
  const issuances = [parseIssuance(owner, 'owner issuance'), parseIssuance(manager, 'manager issuance')];
  assert.equal(issuances.filter(value => value.rotated === false).length, 1, 'one call must issue');
  assert.equal(issuances.filter(value => value.rotated === true).length, 1, 'the other call must rotate');
  const final = issuances.find(value => value.rotated === true);
  const observed = succeed(await psql(`select token_hash,organization_id,restaurant_id,table_id,(select count(*) from public.public_order_tokens where table_id='${tableId}'),(select count(*) from public.public_order_token_issuance_audit where table_id='${tableId}') from public.public_order_tokens where table_id='${tableId}';`), 'final-state query').split('|');
  assert.deepEqual(observed.slice(1, 4), [organizationId, restaurantId, tableId], 'final token linkage must remain authoritative');
  assert.equal(observed[0], digest(final.token), 'persisted hash must belong to final winner');
  assert.equal(observed[4], '1', 'exactly one token row may exist for the table');
  assert.equal(observed[5], '2', 'audit must contain exactly the two committed operations');
  const rolledBack = parseIssuance(await psql(issueSql(ownerId, 'rollback')), 'rolled-back issuance');
  assert.equal(typeof rolledBack.token, 'string');
  const auditCount = succeed(await psql(`select count(*) from public.public_order_token_issuance_audit where table_id='${tableId}';`), 'rollback audit check');
  assert.equal(auditCount, '2', 'rolled-back issuance must leave no audit residue');
  console.log('ISSUANCE_CONCURRENCY_GREEN');
}

async function cleanup() {
  succeed(await psql(`begin; delete from public.public_order_token_issuance_audit where table_id='${tableId}'; delete from public.public_order_tokens where table_id='${tableId}'; delete from public.restaurant_staff where restaurant_id='${restaurantId}'; delete from public.tables where id='${tableId}'; delete from public.restaurants where id='${restaurantId}'; delete from public.organizations where id='${organizationId}'; delete from auth.users where id in ('${ownerId}','${managerId}'); commit;`), 'Task 6 isolated fixture cleanup');
}

try { await createFixture(); await verifyRace(); } finally { await cleanup(); }
