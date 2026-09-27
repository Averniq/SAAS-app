// Local-only proof for the standalone canonical-only transition. Each scenario
// creates a fresh disposable PostgreSQL database and executes the SQL artifact verbatim.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const container = 'supabase_db_p0d01final20260908';
const source = 'supabase_db_p0d01t4h02cd79b9c6';
const transition = readFileSync(path.join(root, 'remediation', 'canonical-only-payment-transition-candidate.sql'), 'utf8');
assert.doesNotMatch(transition, /\blimit\s+1000\b/i, 'a per-order authoritative ledger read must not silently truncate payment operations');
const detailed = readFileSync(path.join(root, 'remediation', 'reference-record_restaurant_payment.sql'), 'utf8');
const voidPayment = readFileSync(path.join(root, 'remediation', 'reference-void_restaurant_payment.sql'), 'utf8');
const fixtureAudit = `do $$ begin
 if to_regprocedure('public.record_restaurant_order_payment(uuid,uuid,text)') is null or to_regprocedure('public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)') is null or to_regprocedure('public.void_restaurant_payment(uuid,uuid,text)') is null then raise exception 'FIXTURE_LEGACY_RPC_SHAPE_DRIFT'; end if;
 if to_regprocedure('public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)') is not null or to_regprocedure('public.list_authoritative_payment_operations(uuid,uuid)') is not null then raise exception 'FIXTURE_CANONICAL_RPC_PRESENT'; end if;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='payments' and column_name in ('id','restaurant_id','order_id','split_bill_id','amount_cents','payment_method','note','idempotency_key','payment_reference','status','paid_at','created_at','updated_at','recorded_by','cash_received_cents','change_given_cents','rounding_adjustment_cents'))<>17 then raise exception 'FIXTURE_PAYMENTS_COLUMN_DRIFT'; end if;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='split_bills' and column_name in ('id','restaurant_id','order_id','total_cents','paid_cents','status'))<>6 then raise exception 'FIXTURE_SPLITS_COLUMN_DRIFT'; end if;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('id','restaurant_id','status','payment_status','paid_at','closed_at','payment_method','total','updated_at'))<>9 then raise exception 'FIXTURE_ORDER_PROJECTION_DRIFT'; end if;
 if not exists(select 1 from pg_index i join pg_class c on c.oid=i.indrelid where c.relname='payments' and i.indisunique and pg_get_indexdef(i.indexrelid) like '%restaurant_id, idempotency_key%') then raise exception 'FIXTURE_PAYMENT_IDEMPOTENCY_INDEX_DRIFT'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.restaurant_staff'::regclass and contype='u' and pg_get_constraintdef(oid) like 'UNIQUE (restaurant_id, user_id)%') then raise exception 'FIXTURE_MEMBERSHIP_CONSTRAINT_DRIFT'; end if;
 if not (select prosecdef from pg_proc where oid='public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure) or not (select prosecdef from pg_proc where oid='public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)'::regprocedure) or not (select prosecdef from pg_proc where oid='public.void_restaurant_payment(uuid,uuid,text)'::regprocedure) then raise exception 'FIXTURE_LEGACY_SECURITY_DEFINER_DRIFT'; end if;
 if coalesce((select array_to_string(proconfig,',') from pg_proc where oid='public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure),'') <> 'search_path=public' or coalesce((select array_to_string(proconfig,',') from pg_proc where oid='public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)'::regprocedure),'') <> 'search_path=public, pg_temp' or coalesce((select array_to_string(proconfig,',') from pg_proc where oid='public.void_restaurant_payment(uuid,uuid,text)'::regprocedure),'') <> 'search_path=public' then raise exception 'FIXTURE_LEGACY_SEARCH_PATH_DRIFT'; end if;
 if not has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute') or not has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute') or not has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute') then raise exception 'FIXTURE_LEGACY_ACL_DRIFT'; end if;
end $$;`;
const readCsv = (name) => {
  const [header, ...lines] = readFileSync(path.join('C:', 'Users', 'WindVeil', 'Downloads', name), 'utf8').trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(keys.map((key, index) => [key, line.split(',')[index]])));
};
const payments = readCsv('Supabase Snippet Untitled query (1).csv');
const orders = readCsv('Supabase Snippet Untitled query (2).csv');
assert.equal(payments.length, 11); assert.equal(orders.length, 9);
// Captured production audit identity. `afterData` is constructed with the
// historical key set: rows 1-5 omit the later cash/reference keys entirely.
const auditManifest = [
  ['503dbaac-0d2b-4f77-89ca-3f1e448fe1a9','436aebc212a7b471cfb859da93ad2927','540b6f61-83fc-40a9-9f48-60bd0394a803'],
  ['af640062-126f-4cc8-8533-db85012c3826','8273d4a96bd966ebce455c44988208dd','540b6f61-83fc-40a9-9f48-60bd0394a803'],
  ['857d2f7b-154a-4c2c-8418-8c40d026a72f','87312d12f714ee32d358820375166696','540b6f61-83fc-40a9-9f48-60bd0394a803'],
  ['2ac9af5d-37d3-4d96-8c3d-3f6b4b3e0c4e','ffca783771bd823853477c1584f29778','540b6f61-83fc-40a9-9f48-60bd0394a803'],
  ['a6094ae2-c9a4-49f2-b3f2-236a32a18750','1f7b6ee69f885156f3dcccb552a7f2f4','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['db45f903-ef82-4888-b1c1-3c11ef4444c8','914426cdb38e6dfe57df19accc8a0749','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['b13b661f-2c37-4fc8-860b-7d027b7766e1','70a1877d4db68f1c470b1f3e0a5046d9','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['8d3f5d3e-d812-4047-ba8f-1d4de00fa236','b7aedea52d8d1e12a4951017ea3437b6','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['fed926c9-77e4-49c8-bcaa-8fcb128b8488','dea3756cd3aaa6bf0aab53b611d72237','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['6a8bc5bd-d1fa-4624-a224-55dfe552b1f6','325cb04b7398aaece6cd554015bb0cce','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352'],
  ['f45850c5-add5-434b-af38-b045a1f06ad0','42250bb759e65b14028a9e8d5bacb539','51bb9fb6-a0b0-4f9a-ba29-7d0f0417e352']
].map(([audit_id, after_data_md5, recorded_by], index) => {
  const payment = payments[index];
  const after_data = {
    id: payment.payment_id, note: payment.note, status: 'completed',
    paid_at: payment.paid_at.replace(' ', 'T').replace('+00', '+00:00'), order_id: payment.order_id,
    voided_at: null, voided_by: null, created_at: payment.paid_at.replace(' ', 'T').replace('+00', '+00:00'),
    updated_at: payment.paid_at.replace(' ', 'T').replace('+00', '+00:00'), recorded_by, void_reason: '',
    amount_cents: Number(payment.amount_cents), restaurant_id: payment.restaurant_id,
    split_bill_id: null, payment_method: payment.payment_method, idempotency_key: payment.idempotency_key
  };
  if (index >= 5) Object.assign(after_data, {
    payment_reference: null,
    change_given_cents: index === 10 ? 1600 : null,
    cash_received_cents: index === 10 ? 10000 : null,
    rounding_adjustment_cents: 0
  });
  return { audit_id, after_data_md5, payment, after_data };
});
const unrelatedAuditFixturePath = process.env.AVENIQ_UNRELATED_AUDIT_FIXTURE;
const withUnrelatedAudit = process.argv.includes('--with-unrelated-audit');
if (!withUnrelatedAudit) throw new Error('Use --with-unrelated-audit with AVENIQ_UNRELATED_AUDIT_FIXTURE pointing to the approved canonical-text export.');
function loadUnrelatedAuditFixture() {
  assert.ok(unrelatedAuditFixturePath, 'AVENIQ_UNRELATED_AUDIT_FIXTURE is required with --with-unrelated-audit');
  const fixture = JSON.parse(readFileSync(unrelatedAuditFixturePath, 'utf8'));
  assert.equal(fixture.count, 17, 'canonical unrelated-audit export must declare 17 rows');
  assert.equal(fixture.fingerprint, '9a3422b54cefc8a5e3c6b50ead07bd95', 'canonical unrelated-audit export fingerprint must match the approved baseline');
  assert.equal(fixture.rows.length, 17, 'canonical unrelated-audit export must include 17 rows');
  const rows = fixture.rows.map(({ id, row_md5, canonical_text_base64 }) => {
    const canonicalText = Buffer.from(canonical_text_base64, 'base64').toString('utf8');
    assert.equal(createHash('md5').update(canonicalText).digest('hex'), row_md5, `canonical unrelated-audit row ${id} must retain its MD5`);
    const row = JSON.parse(canonicalText);
    assert.equal(row.id, id, 'canonical text row ID must match export metadata');
    return { id, row_md5, canonicalText, row };
  });
  const aggregate = createHash('md5').update([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(({ canonicalText }) => canonicalText).join('|')).digest('hex');
  assert.equal(aggregate, fixture.fingerprint, 'canonical unrelated-audit aggregate must match the approved fingerprint');
  return rows;
}
const unrelatedAuditRows = withUnrelatedAudit ? loadUnrelatedAuditFixture() : [];
const run = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'docker command failed');
  return result.stdout;
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
function fixture() {
  const db = `canonical_transition_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  run(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', db]);
  const dump = run(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--clean', '--if-exists', '--schema=public', '--schema=auth', '--schema=extensions']);
  run(['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1'], dump);
  const sql = (input) => run(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], input).trim();
  const restaurant = payments[0].restaurant_id, owner = randomUUID(), organization = randomUUID(), table = randomUUID();
  sql(`create extension if not exists pgcrypto with schema extensions;
insert into auth.users(id,email) values (${literal(owner)}::uuid,'transition-test@example.invalid');
insert into public.organizations(id,owner_user_id,name,slug,country) values (${literal(organization)}::uuid,${literal(owner)}::uuid,'Fixture','transition-fixture','AU');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,status,venue_status) values (${literal(restaurant)}::uuid,${literal(owner)}::uuid,${literal(organization)}::uuid,'Fixture','transition-fixture','active','active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values (${literal(restaurant)}::uuid,${literal(owner)}::uuid,'owner');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values (${literal(table)}::uuid,${literal(restaurant)}::uuid,1,'Fixture','fixture','Fixture','fixture');
create table public.split_bills(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id) on delete restrict,order_id uuid not null references public.orders(id) on delete cascade,name text not null,split_type text not null,subtotal_cents integer not null default 0,gst_cents integer not null default 0,total_cents integer not null default 0,paid_cents integer not null default 0,status text not null default 'unpaid',created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(paid_cents>=0 and paid_cents<=total_cents),check(subtotal_cents+gst_cents=total_cents),check(gst_cents>=0),check(length(trim(name)) between 1 and 80),check(split_type in ('equal','item','custom')),check(status in ('unpaid','partial','paid','voided')),check(subtotal_cents>=0),check(total_cents>=0)); create index split_bills_order_idx on public.split_bills(restaurant_id,order_id); alter table public.split_bills enable row level security; create policy fixture_split_read on public.split_bills for select to authenticated using(public.has_restaurant_role(restaurant_id,array['owner','manager','staff','kitchen','cashier'])); create trigger split_bills_updated_at before update on public.split_bills for each row execute function public.set_updated_at();
create table public.payments(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id) on delete restrict,order_id uuid not null references public.orders(id) on delete restrict,split_bill_id uuid references public.split_bills(id) on delete restrict,amount_cents integer not null check(amount_cents>0),payment_method text not null check(payment_method in ('Cash','Card','Other')),status text not null default 'completed' check(status in ('completed','voided')),note text not null default '',idempotency_key uuid not null default gen_random_uuid(),recorded_by uuid references auth.users(id) on delete set null,paid_at timestamptz not null default now(),voided_at timestamptz,voided_by uuid references auth.users(id) on delete set null,void_reason text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cash_received_cents integer check(cash_received_cents is null or cash_received_cents>=0),change_given_cents integer check(change_given_cents is null or change_given_cents>=0),payment_reference text,rounding_adjustment_cents integer not null default 0 check(rounding_adjustment_cents=0),unique(restaurant_id,idempotency_key)); create index payments_order_idx on public.payments(restaurant_id,order_id,paid_at desc); alter table public.payments enable row level security; create policy fixture_payment_read on public.payments for select to authenticated using(public.has_restaurant_role(restaurant_id,array['owner','manager','staff','kitchen','cashier'])); create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();`);
  sql(`${detailed};\n${voidPayment};`);
  sql(fixtureAudit);
  sql(orders.map((order) => `insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id,payment_status,paid_at,closed_at,payment_method) values (${literal(order.order_id)}::uuid,${literal(restaurant)}::uuid,${literal(table)}::uuid,'completed',${order.order_total},${order.order_total},${literal('manifest-' + order.order_id)},'paid',${literal(order.paid_at)}::timestamptz,${literal(order.closed_at)}::timestamptz,${literal(order.payment_method)});`).join('\n'));
  sql(payments.map((payment) => `insert into public.payments(id,restaurant_id,order_id,amount_cents,payment_method,note,status,idempotency_key,payment_reference,paid_at,recorded_by) values (${literal(payment.payment_id)}::uuid,${literal(payment.restaurant_id)}::uuid,${literal(payment.order_id)}::uuid,${payment.amount_cents},${literal(payment.payment_method)},${literal(payment.note)},'completed',${literal(payment.idempotency_key)}::uuid,null,${literal(payment.paid_at)}::timestamptz,${literal(owner)}::uuid);`).join('\n'));
  sql(`create table public.order_audit_log(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id) on delete restrict,order_id uuid references public.orders(id) on delete restrict,order_item_id uuid references public.order_items(id) on delete restrict,payment_id uuid references public.payments(id) on delete restrict,actor_user_id uuid references auth.users(id) on delete set null,actor_name text not null default '',actor_role text not null default '',action text not null,entity_type text not null,before_data jsonb not null default '{}'::jsonb,after_data jsonb not null default '{}'::jsonb,reason text not null default '',note text not null default '',approved_by uuid references auth.users(id) on delete set null,device_or_session_id text not null default '',created_at timestamptz not null default now()); create index order_audit_log_restaurant_action_created_idx on public.order_audit_log(restaurant_id,action,created_at desc); create index order_audit_log_restaurant_order_created_idx on public.order_audit_log(restaurant_id,order_id,created_at); alter table public.order_audit_log enable row level security; create policy "cash-handling staff read order audit" on public.order_audit_log for select to authenticated using(public.has_restaurant_role(restaurant_id,array['owner','manager','staff','kitchen','cashier']));`);
  sql(auditManifest.map(({ audit_id, payment, after_data }) => `insert into public.order_audit_log(id,restaurant_id,order_id,payment_id,actor_user_id,actor_role,action,entity_type,before_data,after_data,created_at) values (${literal(audit_id)}::uuid,${literal(payment.restaurant_id)}::uuid,${literal(payment.order_id)}::uuid,${literal(payment.payment_id)}::uuid,${literal(owner)}::uuid,'owner','payment_added','payment','{}'::jsonb,${literal(JSON.stringify(after_data))}::jsonb,${literal(payment.paid_at)}::timestamptz);`).join('\n'));
  assert.equal(sql(`select count(*) from public.order_audit_log a join (values ${auditManifest.map(({ audit_id, after_data_md5 }) => `(${literal(audit_id)}::uuid,${literal(after_data_md5)})`).join(',')}) m(id,digest) on a.id=m.id where md5(a.before_data::text)='99914b932bd37a50b983c5e7c90ae93b' and md5(a.after_data::text)=m.digest`), '11', 'fixture audit JSON must retain the captured MD5 identities');
  if (withUnrelatedAudit) {
    const supportOrders = [...new Map(unrelatedAuditRows.map(({ row }) => [row.order_id, row])).values()];
    const supportItems = [...new Map(unrelatedAuditRows.filter(({ row }) => row.order_item_id).map(({ row }) => [row.order_item_id, row])).values()];
    const supportActors = [...new Set(unrelatedAuditRows.map(({ row }) => row.actor_user_id).filter(Boolean))];
    assert.equal(new Set(unrelatedAuditRows.map(({ row }) => row.restaurant_id)).size, 1, 'canonical unrelated-audit rows must reference one restaurant');
    assert.equal(unrelatedAuditRows[0].row.restaurant_id, restaurant, 'canonical unrelated-audit rows must reference the fixture restaurant');
    sql(supportActors.map((id, index) => `insert into auth.users(id,email) values (${literal(id)}::uuid,${literal(`audit-support-${index}@example.invalid`)}) on conflict(id) do nothing;`).join('\n'));
    sql(supportOrders.map(({ order_id }, index) => `insert into public.orders(id,restaurant_id,table_id,order_number,status,subtotal,total,local_id,payment_status) values (${literal(order_id)}::uuid,${literal(restaurant)}::uuid,${literal(table)}::uuid,${900000 + index},'new',1,1,${literal(`audit-support-${index}`)},'unpaid') on conflict(id) do nothing;`).join('\n'));
    sql(supportItems.map(({ order_item_id, order_id }) => `insert into public.order_items(id,restaurant_id,order_id,item_name,quantity,price,name_snapshot,base_price,unit_price) values (${literal(order_item_id)}::uuid,${literal(restaurant)}::uuid,${literal(order_id)}::uuid,'fixture audit support',1,1,'fixture audit support',1,1) on conflict(id) do nothing;`).join('\n'));
    sql(unrelatedAuditRows.map(({ canonicalText }) => `insert into public.order_audit_log(id,restaurant_id,order_id,order_item_id,payment_id,actor_user_id,actor_name,actor_role,action,entity_type,before_data,after_data,reason,note,approved_by,device_or_session_id,created_at) select id,restaurant_id,order_id,order_item_id,payment_id,actor_user_id,actor_name,actor_role,action,entity_type,before_data,after_data,reason,note,approved_by,device_or_session_id,created_at from jsonb_to_record(${literal(canonicalText)}::jsonb) as x(id uuid,restaurant_id uuid,order_id uuid,order_item_id uuid,payment_id uuid,actor_user_id uuid,actor_name text,actor_role text,action text,entity_type text,before_data jsonb,after_data jsonb,reason text,note text,approved_by uuid,device_or_session_id text,created_at timestamptz);`).join('\n'));
    const unrelatedValues = unrelatedAuditRows.map(({ id, row_md5 }) => `(${literal(id)}::uuid,${literal(row_md5)})`).join(',');
    assert.equal(sql(`select count(*),count(distinct a.id),count(*) filter(where a.payment_id is null),count(*) filter(where a.order_item_id is not null),count(*) filter(where md5(to_jsonb(a)::text)=m.digest),md5(string_agg(to_jsonb(a)::text,'|' order by a.id)) from public.order_audit_log a join (values ${unrelatedValues}) m(id,digest) on m.id=a.id`), '17|17|17|3|17|9a3422b54cefc8a5e3c6b50ead07bd95', 'fixture must preserve the exact unrelated-audit Production fingerprint');
  }
  return { db, sql, restaurant, owner };
}
function snapshot(sql) {
  return sql(`select (select count(*) from public.payments),(select count(*) from public.order_audit_log),(select count(*) from public.orders where id in (${orders.map((order) => literal(order.order_id) + '::uuid').join(',')}) and payment_status='paid' and paid_at is not null and closed_at is not null and payment_method is not null),to_regclass('public.payment_operations') is null,to_regprocedure('public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)') is null,to_regprocedure('public.list_authoritative_payment_operations(uuid,uuid)') is null,has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute');`);
}
function assertAtomicRollback(sql, name) {
  assert.equal(sql(`select count(*) from public.payments where id in (${payments.map(({ payment_id }) => `${literal(payment_id)}::uuid`).join(',')})`), '11', `${name}: all approved payments must remain after rollback`);
  assert.equal(sql(`select count(*) from public.order_audit_log where id in (${auditManifest.map(({ audit_id }) => `${literal(audit_id)}::uuid`).join(',')})`), '11', `${name}: all approved audit rows must remain after rollback`);
  assert.equal(sql(`select count(*) from public.orders where id in (${orders.map(({ order_id }) => `${literal(order_id)}::uuid`).join(',')}) and payment_status='paid' and paid_at is not null and closed_at is not null and payment_method is not null`), '9', `${name}: no order projection cleanup may persist after rollback`);
  assert.equal(sql(`select to_regclass('public.payment_operations') is null,to_regprocedure('public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)') is null,to_regprocedure('public.list_authoritative_payment_operations(uuid,uuid)') is null,has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute')`), 't|t|t|t|t|t', `${name}: canonical objects and legacy ACLs must remain at the pre-transition state`);
}
let passed = 0;
const successOnly = process.argv.includes('--success-only');
const driftOnly = process.argv.includes('--drift-only');
const permittedOnly = process.argv.includes('--permitted-only');
const transitionOnly = process.argv.includes('--transition-only');
const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1];
};
const driftFrom = Number(option('--drift-from', 1));
const driftTo = Number(option('--drift-to', Number.MAX_SAFE_INTEGER));
const permittedFrom = Number(option('--permitted-from', 1));
const permittedTo = Number(option('--permitted-to', Number.MAX_SAFE_INTEGER));
function expectRollback(name, mutation, expected) {
  const { sql } = fixture();
  const before = snapshot(sql);
  assert.throws(() => sql(`begin isolation level serializable;\n${mutation}\n${transition}`), new RegExp(expected));
  assert.equal(snapshot(sql), before, `${name}: transaction leaked a partial state`);
  assertAtomicRollback(sql, name);
  console.log(`PASS drift/${name}`); passed++;
}
function expectApprovedMetadataDeletion(name, mutation) {
  const { sql } = fixture();
  sql(mutation);
  sql(transition);
  assert.equal(sql('select count(*) from public.payments'), '0', `${name}: approved test payments remain deletable after metadata drift`);
  assert.equal(sql('select count(*) from public.order_audit_log'), '17', `${name}: unrelated audit rows must survive metadata drift cleanup`);
  console.log(`PASS permitted-metadata/${name}`); passed++;
}
if (!successOnly && !permittedOnly) {
  const driftCases = [
    ['missing-payment', `delete from public.order_audit_log where payment_id=${literal(payments[0].payment_id)}::uuid; delete from public.payments where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-order', `update public.payments set order_id=${literal(orders[1].order_id)}::uuid where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['unrelated-payment-add', (() => { const orderId = randomUUID(); return `insert into public.orders(id,restaurant_id,table_id,order_number,status,subtotal,total,local_id,payment_status) select ${literal(orderId)}::uuid,restaurant_id,id,999999,'new',1,1,'unrelated-payment-drift','unpaid' from public.tables limit 1; insert into public.payments(id,restaurant_id,order_id,amount_cents,payment_method,status,idempotency_key,paid_at,recorded_by) values (${literal(randomUUID())}::uuid,${literal(payments[0].restaurant_id)}::uuid,${literal(orderId)}::uuid,1,'Cash','completed',${literal(randomUUID())}::uuid,now(),(select recorded_by from public.payments limit 1));`; })(), 'MANIFEST_UNRELATED_PAYMENT_DRIFT'],
    ['order-projection', `update public.orders set payment_status='unpaid' where id=${literal(orders[0].order_id)}::uuid;`, 'MANIFEST_ORDER_DRIFT'],
    ['split-association', `with inserted_split as (insert into public.split_bills(id,restaurant_id,order_id,name,split_type,subtotal_cents,gst_cents,total_cents,paid_cents,status) values (${literal(randomUUID())}::uuid,${literal(payments[0].restaurant_id)}::uuid,${literal(payments[0].order_id)}::uuid,'fixture split','equal',0,0,0,0,'unpaid') returning id) update public.payments set split_bill_id=(select id from inserted_split) where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['linked-split', `insert into public.split_bills(id,restaurant_id,order_id,name,split_type,subtotal_cents,gst_cents,total_cents,paid_cents,status) values (${literal(randomUUID())}::uuid,${literal(payments[0].restaurant_id)}::uuid,${literal(payments[0].order_id)}::uuid,'fixture split','equal',0,0,0,0,'unpaid');`, 'MANIFEST_SPLIT_DRIFT']
    ,['audit-missing', `delete from public.order_audit_log where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-payment-map', `update public.order_audit_log set payment_id=${literal(payments[1].payment_id)}::uuid where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-order', `update public.order_audit_log set order_id=${literal(orders[1].order_id)}::uuid where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-restaurant', `insert into public.restaurants(id,owner_user_id,organization_id,name,slug,status,venue_status) select '00000000-0000-4000-8000-000000000001'::uuid,owner_user_id,organization_id,'Fixture other','fixture-other','active','active' from public.restaurants limit 1; update public.order_audit_log set restaurant_id='00000000-0000-4000-8000-000000000001'::uuid where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-action', `update public.order_audit_log set action='other' where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-entity', `update public.order_audit_log set entity_type='other' where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_DRIFT']
    ,['audit-extra', `insert into public.order_audit_log(id,restaurant_id,order_id,payment_id,actor_role,action,entity_type,before_data,after_data) select ${literal(randomUUID())}::uuid,restaurant_id,order_id,payment_id,'owner','payment_added','payment','{}'::jsonb,'{}'::jsonb from public.order_audit_log where id=${literal(auditManifest[0].audit_id)}::uuid;`, 'MANIFEST_AUDIT_EXTRA']
    ,['unrelated-audit-modify', `update public.order_audit_log set note='fixture drift' where id=${literal(unrelatedAuditRows[0]?.id)}::uuid;`, 'MANIFEST_UNRELATED_AUDIT_DRIFT']
    ,['unrelated-audit-add', `insert into public.order_audit_log(id,restaurant_id,order_id,actor_name,actor_role,action,entity_type,before_data,after_data) select ${literal(randomUUID())}::uuid,restaurant_id,order_id,actor_name,actor_role,action,entity_type,before_data,after_data from public.order_audit_log where id=${literal(unrelatedAuditRows[0]?.id)}::uuid;`, 'MANIFEST_UNRELATED_AUDIT_DRIFT']
    ,['unrelated-audit-delete', `delete from public.order_audit_log where id=${literal(unrelatedAuditRows[0]?.id)}::uuid;`, 'MANIFEST_UNRELATED_AUDIT_DRIFT']
  ];
  driftCases.slice(driftFrom - 1, driftTo).forEach(([name, mutation, expected]) => expectRollback(name, mutation, expected));
}
if (!successOnly && !driftOnly) {
  [
    ['payment-amount', `update public.payments set amount_cents=amount_cents+1 where id=${literal(payments[0].payment_id)}::uuid;`],
    ['payment-status', `update public.payments set status='voided' where id=${literal(payments[0].payment_id)}::uuid;`],
    ['payment-idempotency-key', `update public.payments set idempotency_key=${literal(randomUUID())}::uuid where id=${literal(payments[0].payment_id)}::uuid;`],
    ['payment-note', `update public.payments set note='changed' where id=${literal(payments[0].payment_id)}::uuid;`],
    ['payment-reference', `update public.payments set payment_reference='unexpected-reference' where id=${literal(payments[0].payment_id)}::uuid;`],
    ['payment-created-at', `update public.payments set created_at=created_at+interval '1 microsecond' where id=${literal(payments[0].payment_id)}::uuid;`],
    ['audit-role', `update public.order_audit_log set actor_role='staff' where id=${literal(auditManifest[0].audit_id)}::uuid;`],
    ['audit-created-at', `update public.order_audit_log set created_at=created_at+interval '1 microsecond' where id=${literal(auditManifest[0].audit_id)}::uuid;`],
    ['audit-before-data', `update public.order_audit_log set before_data='{"changed":true}'::jsonb where id=${literal(auditManifest[0].audit_id)}::uuid;`],
    ['audit-after-data', `update public.order_audit_log set after_data='{"changed":true}'::jsonb where id=${literal(auditManifest[0].audit_id)}::uuid;`]
  ].slice(permittedFrom - 1, permittedTo).forEach(([name, mutation]) => expectApprovedMetadataDeletion(name, mutation));
}
if (!driftOnly && !permittedOnly) {
  const { sql, restaurant } = fixture();
  assert.equal(sql('select count(*) from public.payments'), '11');
  sql(transition);
  assert.equal(sql('select count(*) from public.payments'), '0');
  assert.equal(sql(`select count(*) from public.order_audit_log`), withUnrelatedAudit ? '17' : '0', 'only the approved payment audit rows may be deleted');
  if (withUnrelatedAudit) assert.equal(sql(`select md5(string_agg(to_jsonb(a)::text,'|' order by a.id)) from public.order_audit_log a`), '9a3422b54cefc8a5e3c6b50ead07bd95', 'successful transition must preserve the unrelated audit fingerprint');
  assert.equal(sql(`select count(*) from public.orders where id in (${orders.map((order) => literal(order.order_id) + '::uuid').join(',')}) and status='completed' and payment_status='unpaid' and paid_at is null and closed_at is null and payment_method is null`), '9');
  assert.equal(sql('select count(*) from public.payment_operations'), '0');
  assert.equal(sql(`select has_function_privilege('authenticated','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)','execute'),has_function_privilege('authenticated','public.list_authoritative_payment_operations(uuid,uuid)','execute'),has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute')`), 't|t|f|f|f');
  if (!transitionOnly) {
  const payableOrderId = orders[0].order_id;
  const payerId = sql(`select user_id from public.restaurant_staff where restaurant_id=${literal(restaurant)}::uuid and role='owner' limit 1`);
  const paymentContext = `begin; set local role authenticated; select set_config('request.jwt.claim.sub',${literal(payerId)},true); `;
  assert.throws(
    () => sql(`${paymentContext}select public.record_authoritative_payment(${literal(restaurant)}::uuid,${literal(payableOrderId)}::uuid,1,'Card',null,null); rollback;`),
    /(IDEMPOTENCY_KEY_REQUIRED|function .*record_authoritative_payment.*does not exist)/i,
    'omitting p_idempotency_key must not create a server-generated payment key'
  );
  assert.throws(
    () => sql(`${paymentContext}select public.record_authoritative_payment(${literal(restaurant)}::uuid,${literal(payableOrderId)}::uuid,1,'Card',null,null,null); rollback;`),
    /IDEMPOTENCY_KEY_REQUIRED/i,
    'an explicit null key must fail closed'
  );
  const idempotencyKey = randomUUID();
  const invocation = `select public.record_authoritative_payment(${literal(restaurant)}::uuid,${literal(payableOrderId)}::uuid,1,'Card','terminal','test',${literal(idempotencyKey)}::uuid);`;
  const paymentResult = (statement) => JSON.parse(sql(statement).split(/\r?\n/).find((line) => line.startsWith('{')));
  const first = paymentResult(`${paymentContext}${invocation} commit;`);
  const replay = paymentResult(`${paymentContext}${invocation} commit;`);
  assert.equal(replay.payment_operation_id, first.payment_operation_id, 'same UUID must replay one operation');
  assert.equal(replay.idempotent_replay, true, 'same UUID must report replay');
  assert.throws(
    () => sql(`${paymentContext}select public.record_authoritative_payment(${literal(restaurant)}::uuid,${literal(payableOrderId)}::uuid,2,'Card','terminal','test',${literal(idempotencyKey)}::uuid); rollback;`),
    /IDEMPOTENCY_KEY_REUSED/i,
    'divergent reuse must fail'
  );
  }
  console.log('PASS success/cleanup-acl'); passed++;
}
const expected = successOnly ? 1 : driftOnly ? Math.max(0, Math.min(16, driftTo) - driftFrom + 1) : permittedOnly ? Math.max(0, Math.min(10, permittedTo) - permittedFrom + 1) : 27;
console.log(`Canonical-only standalone transition: ${passed}/${expected} PASS (${successOnly ? 'success fixture' : driftOnly ? 'isolated drift fixtures' : 'drift fixtures plus success fixture'})`);
