// Local-only legacy-three authorization rehearsal. Each case is transactional
// and rolls back; this never targets a hosted database.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const container = 'supabase_db_p0d01final20260908';
const database = 'legacy_three_auth_20260918';
const baseline = process.argv.includes('--baseline');
const read = path => readFileSync(new URL(path, root), 'utf8');
const actor = '10000000-0000-0000-0000-000000000001';
const r1 = '20000000-0000-0000-0000-000000000001';
const r2 = '20000000-0000-0000-0000-000000000002';
const o1 = '30000000-0000-0000-0000-000000000001';
const p1 = '50000000-0000-0000-0000-000000000001';
const key = '40000000-0000-0000-0000-000000000001';

function psql(sql, db = database) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-At'], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'psql failed');
  return result.stdout;
}
if (psql(`select count(*) from pg_database where datname='${database}'`, 'postgres').trim() === '0') psql(`create database ${database}`, 'postgres');
assert.equal(psql("select count(*) from pg_tables where schemaname in ('public','auth')").trim(), '0', 'fixture database must start empty');

const legacy3 = read('supabase/migrations/018_record_restaurant_order_payment.sql');
const detailed = read('remediation/reference-record_restaurant_payment.sql');
const voidFn = read('remediation/reference-void_restaurant_payment.sql');
const candidate = baseline ? '' : read('remediation/payment-legacy-three-authorization-candidate.sql');
const setup = `begin;
create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.restaurants(id uuid primary key);
create table public.restaurant_staff(restaurant_id uuid not null references public.restaurants(id),user_id uuid not null references auth.users(id),role text not null,unique(restaurant_id,user_id));
create table public.platform_admins(user_id uuid primary key);
create table public.orders(id uuid primary key,restaurant_id uuid not null,total numeric not null,status text not null default 'new',paid_at timestamptz,payment_method text,closed_at timestamptz,updated_at timestamptz,payment_status text not null default 'unpaid');
create table public.payments(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null,order_id uuid not null,split_bill_id uuid,amount_cents integer not null,payment_method text,note text,idempotency_key uuid,recorded_by uuid,cash_received_cents integer,change_given_cents integer,payment_reference text,rounding_adjustment_cents integer,status text not null default 'completed',voided_at timestamptz,voided_by uuid,void_reason text);
create table public.split_bills(id uuid primary key,restaurant_id uuid not null,order_id uuid not null,total_cents integer not null,paid_cents integer not null default 0,status text not null default 'unpaid');
${legacy3}
${detailed};
${voidFn};
grant usage on schema public, auth to authenticated, anon;
revoke all on all functions in schema public from public, anon;
grant execute on function public.record_restaurant_order_payment(uuid,uuid,text) to authenticated;
grant execute on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text) to authenticated;
grant execute on function public.void_restaurant_payment(uuid,uuid,text) to authenticated;
insert into auth.users values ('${actor}');
insert into public.restaurants values ('${r1}'),('${r2}');
insert into public.orders(id,restaurant_id,total,status) values ('${o1}','${r1}',100,'new');
select set_config('request.jwt.claim.sub','${actor}',true);
${baseline ? '' : `${candidate}\n${candidate}`}
`;

const calls = {
  order: `public.record_restaurant_order_payment('${r1}','${o1}','Card')`,
  payment: `public.record_restaurant_payment('${r1}','${o1}',100,'Card','',null,'${key}',null,null,'')`,
  void: `public.void_restaurant_payment('${r1}','${p1}','correction')`,
};
const mutationSnapshot = `
  select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb) ||
         coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) ||
         coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
  from (select * from public.orders) o
  full join (select * from public.payments) p on false
  full join (select * from public.split_bills) s on false`;
function roleSql(role) {
  if (role === 'platform-admin') return `insert into public.platform_admins values ('${actor}');`;
  if (role === 'cross-tenant') return `insert into public.restaurant_staff values ('${r2}','${actor}','owner');`;
  if (role === 'null-role') return ''; // a missing row is the production-reachable NULL target_role state.
  return role ? `insert into public.restaurant_staff values ('${r1}','${actor}','${role}');` : '';
}
function seed(kind) { return kind === 'void' ? `insert into public.payments(id,restaurant_id,order_id,amount_cents,payment_method,status) values ('${p1}','${r1}','${o1}',100,'Card','completed');` : ''; }
function run({ kind, role, allowed, anonymous = false }) {
  const denied = `begin perform ${calls[kind]}; raise exception using errcode='P0002', message='UNAUTHORIZED_SUCCESS'; exception when sqlstate 'P0001' then null; end;`;
  const assertSql = allowed ? `perform ${calls[kind]};` : denied;
  const sql = `${setup}${roleSql(role)}${seed(kind)}
create temp table mutation_before as select (${mutationSnapshot}) as value;
set local role ${anonymous ? 'anon' : 'authenticated'};
do $$ begin ${anonymous ? `begin perform ${calls[kind]}; raise exception using errcode='P0002', message='ANON_SUCCESS'; exception when sqlstate '42501' then null; end;` : assertSql} end $$;
reset role;
do $$ begin ${allowed ? '' : `if (select value from mutation_before) is distinct from (${mutationSnapshot}) then raise exception 'DENIED_MUTATION'; end if;`} end $$;
rollback;`;
  psql(sql);
}

const policies = {
  order: new Set(['owner','manager','cashier']),
  payment: new Set(['owner','manager','cashier']),
  void: new Set(['owner','manager']),
};
const identities = ['owner','manager','cashier','staff',null,'null-role','cross-tenant','platform-admin'];
let passed = 0;
let failures = 0;
for (const kind of Object.keys(calls)) {
  for (const role of identities) {
    const allowed = policies[kind].has(role);
    try { run({ kind, role, allowed }); console.log(`PASS ${baseline ? 'RED-observation' : 'GREEN'} ${kind}/${role ?? 'nonmember'}`); passed++; }
    catch (error) { console.error(`FAIL ${baseline ? 'RED-observation' : 'GREEN'} ${kind}/${role ?? 'nonmember'}: ${error.message.trim()}`); failures++; }
  }
  try { run({ kind, anonymous: true, allowed: false }); console.log(`PASS ${baseline ? 'RED-observation' : 'GREEN'} ${kind}/anonymous`); passed++; }
  catch (error) { console.error(`FAIL ${baseline ? 'RED-observation' : 'GREEN'} ${kind}/anonymous: ${error.message.trim()}`); failures++; }
}
const compatibility = [
  ['legacy-order-payment', `perform ${calls.order};`, `if not exists(select 1 from public.orders where id='${o1}' and status='completed' and payment_method='Card' and paid_at is not null) then raise exception 'LEGACY_ORDER_PROJECTION'; end if;`],
  ['partial-card-note-reference', `result := public.record_restaurant_payment('${r1}','${o1}',50,'Card','counter note',null,'${key}',null,null,'receipt-1'); if result->>'payment_status' <> 'partial' then raise exception 'PARTIAL_RESULT'; end if;`, `if not exists(select 1 from public.payments where amount_cents=50 and note='counter note' and payment_reference='receipt-1') then raise exception 'METADATA_PROJECTION'; end if;`],
  ['full-card-payment', `result := public.record_restaurant_payment('${r1}','${o1}',10000,'Card','',null,'${key}',null,null,''); if result->>'payment_status' <> 'paid' then raise exception 'FULL_RESULT'; end if;`, `if not exists(select 1 from public.orders where id='${o1}' and payment_status='paid' and status='completed' and payment_method='Card') then raise exception 'FULL_PROJECTION'; end if;`],
  ['cash-tender-change', `result := public.record_restaurant_payment('${r1}','${o1}',100,'Cash','',null,'${key}',150,50,''); if result->>'payment_status' <> 'partial' then raise exception 'CASH_RESULT'; end if;`, `if not exists(select 1 from public.payments where cash_received_cents=150 and change_given_cents=50) then raise exception 'CASH_PROJECTION'; end if;`],
  ['valid-void', `result := ${calls.void}; if result->>'payment_id' <> '${p1}' then raise exception 'VOID_RESULT'; end if;`, `if not exists(select 1 from public.payments where id='${p1}' and status='voided' and void_reason='correction') then raise exception 'VOID_PROJECTION'; end if;`],
];
for (const [name, invoke, verify] of compatibility) {
  const fixture = name === 'valid-void' ? seed('void') : '';
  try {
    psql(`${setup}${roleSql('owner')}${fixture}set local role authenticated; do $$ declare result jsonb; begin ${invoke} end $$; reset role; do $$ begin ${verify} end $$; rollback;`);
    console.log(`PASS COMPAT ${name}`); passed++;
  } catch (error) { console.error(`FAIL COMPAT ${name}: ${error.message.trim()}`); failures++; }
}
try {
  psql(`${setup}${roleSql('owner')}insert into public.split_bills values ('${key}','${r1}','${o1}',100,0,'unpaid'); create temp table split_before as select to_jsonb(s) value from public.split_bills s; set local role authenticated; do $$ begin begin perform public.record_restaurant_payment('${r1}','${o1}',50,'Card','', '${key}','${key}',null,null,''); raise exception using errcode='P0002', message='SPLIT_UNEXPECTED_SUCCESS'; exception when sqlstate '42702' then null; end; end $$; reset role; do $$ begin if (select value from split_before) is distinct from (select to_jsonb(s) from public.split_bills s) then raise exception 'SPLIT_MUTATED_ON_42702'; end if; end $$; rollback;`);
  console.log('PASS COMPAT split-42702-is-atomic'); passed++;
} catch (error) { console.error(`FAIL COMPAT split-42702-is-atomic: ${error.message.trim()}`); failures++; }
{
  const inventory = psql(`${setup}select p.oid::regprocedure::text, pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig::text, exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'), has_function_privilege('anon',p.oid,'execute'), has_function_privilege('authenticated',p.oid,'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_restaurant_order_payment','record_restaurant_payment','void_restaurant_payment') order by 1; rollback;`);
  for (const signature of [
    'record_restaurant_order_payment(uuid,uuid,text)|postgres|t|{search_path=public}|f|f|t',
    'record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)|postgres|t|{"search_path=public, pg_temp"}|f|f|t',
    'void_restaurant_payment(uuid,uuid,text)|postgres|t|{search_path=public}|f|f|t',
  ]) assert.ok(inventory.includes(signature), `metadata drift: ${signature}`);
  console.log(`ACL ${baseline ? 'BASELINE' : 'CANDIDATE'}\n${inventory}`);
}
assert.equal(psql("select count(*) from pg_tables where schemaname in ('public','auth')").trim(), '0', 'all fixture changes must roll back');
console.log(`LEGACY-THREE ${baseline ? 'RED' : 'GREEN'}: ${passed}/${passed + failures} policy assertions passed; ${failures} failed.`);
process.exitCode = failures ? 1 : 0;
