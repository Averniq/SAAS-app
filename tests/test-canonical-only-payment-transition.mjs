// Local-only proof for the standalone canonical-only transition. Each scenario
// creates a fresh disposable PostgreSQL database and executes the SQL artifact verbatim.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
const run = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'docker command failed');
  return result.stdout;
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
function fixture(mutator = '') {
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
  const unrelatedOrder = randomUUID(), unrelatedPayment = randomUUID();
  sql(`insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id,payment_status) values (${literal(unrelatedOrder)}::uuid,${literal(restaurant)}::uuid,${literal(table)}::uuid,'new',1,1,'unrelated','unpaid');
insert into public.payments(id,restaurant_id,order_id,amount_cents,payment_method,status,idempotency_key,paid_at,recorded_by) values (${literal(unrelatedPayment)}::uuid,${literal(restaurant)}::uuid,${literal(unrelatedOrder)}::uuid,100,'Cash','completed',${literal(randomUUID())}::uuid,now(),${literal(owner)}::uuid);${mutator}`);
  return { db, sql, restaurant, owner, unrelatedPayment };
}
function snapshot(sql) {
  return sql(`select (select count(*) from public.payments),(select count(*) from public.orders where id in (${orders.map((order) => literal(order.order_id) + '::uuid').join(',')}) and payment_status='paid' and paid_at is not null and closed_at is not null and payment_method is not null),to_regclass('public.payment_operations') is null,has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute');`);
}
let passed = 0;
const successOnly = process.argv.includes('--success-only');
const driftOnly = process.argv.includes('--drift-only');
const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1];
};
const driftFrom = Number(option('--drift-from', 1));
const driftTo = Number(option('--drift-to', Number.MAX_SAFE_INTEGER));
function expectRollback(name, mutation, expected) {
  const { sql } = fixture(mutation);
  const before = snapshot(sql);
  assert.throws(() => sql(transition), new RegExp(expected));
  assert.equal(snapshot(sql), before, `${name}: transaction leaked a partial state`);
  console.log(`PASS drift/${name}`); passed++;
}
if (!successOnly) {
  const driftCases = [
    ['missing-payment', `delete from public.payments where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-order', `update public.payments set order_id=${literal(orders[1].order_id)}::uuid where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-amount', `update public.payments set amount_cents=amount_cents+1 where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-status', `update public.payments set status='voided' where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-idempotency-key', `update public.payments set idempotency_key=${literal(randomUUID())}::uuid where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-note', `update public.payments set note='changed' where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['payment-reference', `update public.payments set payment_reference='unexpected-reference' where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['order-projection', `update public.orders set payment_status='unpaid' where id=${literal(orders[0].order_id)}::uuid;`, 'MANIFEST_ORDER_DRIFT'],
    ['split-association', `with inserted_split as (insert into public.split_bills(id,restaurant_id,order_id,name,split_type,subtotal_cents,gst_cents,total_cents,paid_cents,status) values (${literal(randomUUID())}::uuid,${literal(payments[0].restaurant_id)}::uuid,${literal(payments[0].order_id)}::uuid,'fixture split','equal',0,0,0,0,'unpaid') returning id) update public.payments set split_bill_id=(select id from inserted_split) where id=${literal(payments[0].payment_id)}::uuid;`, 'MANIFEST_PAYMENT_DRIFT'],
    ['linked-split', `insert into public.split_bills(id,restaurant_id,order_id,name,split_type,subtotal_cents,gst_cents,total_cents,paid_cents,status) values (${literal(randomUUID())}::uuid,${literal(payments[0].restaurant_id)}::uuid,${literal(payments[0].order_id)}::uuid,'fixture split','equal',0,0,0,0,'unpaid');`, 'MANIFEST_SPLIT_DRIFT']
  ];
  driftCases.slice(driftFrom - 1, driftTo).forEach(([name, mutation, expected]) => expectRollback(name, mutation, expected));
}
if (!driftOnly) {
  const { sql, unrelatedPayment, restaurant } = fixture();
  assert.equal(sql('select count(*) from public.payments'), '12');
  sql(transition);
  assert.equal(sql('select count(*) from public.payments'), '1');
  assert.equal(sql(`select count(*) from public.payments where id=${literal(unrelatedPayment)}::uuid`), '1');
  assert.equal(sql(`select count(*) from public.orders where id in (${orders.map((order) => literal(order.order_id) + '::uuid').join(',')}) and status='completed' and payment_status='unpaid' and paid_at is null and closed_at is null and payment_method is null`), '9');
  assert.equal(sql('select count(*) from public.payment_operations'), '0');
  assert.equal(sql(`select has_function_privilege('authenticated','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)','execute'),has_function_privilege('authenticated','public.list_authoritative_payment_operations(uuid,uuid)','execute'),has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute')`), 't|t|f|f|f');
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
  console.log('PASS success/cleanup-acl'); passed++;
}
const expected = successOnly ? 1 : driftOnly ? Math.max(0, Math.min(10, driftTo) - driftFrom + 1) : 11;
console.log(`Canonical-only standalone transition: ${passed}/${expected} PASS (${successOnly ? 'success fixture' : driftOnly ? 'ten isolated drift fixtures' : 'ten isolated drift fixtures plus success fixture'})`);
