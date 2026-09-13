#!/usr/bin/env node
// Local-only Task 4 sensitive fixture builder. It never prints CSV data or IDs.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(import.meta.url);
const root = resolve(dirname(file), '..');
const fail = message => { throw new Error(`Task 4 historical fixture refusal: ${message}`); };
const sha = data => createHash('sha256').update(data).digest('hex');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const ident = value => `"${value.replaceAll('"', '""')}"`;
const csv = text => {
  const rows=[]; let row=[], field='', quote=false;
  for (let i=0;i<text.length;i++) { const c=text[i]; if (quote) { if (c==='"' && text[i+1]==='"') { field+='"'; i++; } else if (c==='"') quote=false; else field+=c; } else if (c==='"') quote=true; else if (c===',') { row.push(field); field=''; } else if (c==='\r') {} else if (c==='\n') { row.push(field); if(row.length>1) rows.push(row); row=[]; field=''; } else field+=c; }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};
const expectedColumns=['id','restaurant_id','order_id','split_bill_id','amount_cents','payment_method','status','note','idempotency_key','recorded_by','paid_at','voided_at','voided_by','void_reason','created_at','updated_at','cash_received_cents','change_given_cents','payment_reference','rounding_adjustment_cents'];
const authorizedNullColumns=new Set(['split_bill_id','voided_at','voided_by','cash_received_cents','change_given_cents','payment_reference']);
export function parseHistoricalPaymentCsv(text) {
  const data=csv(text); const headers=data.shift();
  return data.map(values=>Object.fromEntries(headers.map((key,index)=>[key,authorizedNullColumns.has(key)&&['','null'].includes(values[index])?null:values[index]])));
}
function assertHistoricalPreseed(rows) {
  const expected={row_count:11,split_bill_id:11,recorded_by:0,voided_at:11,voided_by:11,cash_received_cents:10,change_given_cents:10,payment_reference:11};
  if(rows.length!==expected.row_count) fail('historical row-count mismatch');
  for(const [column,want] of Object.entries(expected).filter(([column])=>column!=='row_count')) {
    if(rows.filter(row=>row[column]===null).length!==want) fail(`historical ${column} NULL-count mismatch`);
  }
  if(rows.some(row=>row.split_bill_id!==null)) fail('historical split_bill_id non-NULL count mismatch');
}
function verified(path, expected) { const bytes=readFileSync(path); if (sha(bytes)!==expected) fail(`hash mismatch: ${path}`); return bytes; }
function verifiedSidecar(path) {
  const expected=readFileSync(`${path}.sha256`,'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected)) fail(`invalid SHA-256 sidecar: ${path}`);
  return verified(path,expected);
}
function capturedTask4Functions() {
  const path=resolve(root,'evidence/p0-deploy-01-task4-production-evidence-closure-bundle-20260905/functions-full/p0-deploy-01-task4-production-evidence-closure-20260905T133200Z.json');
  const capture=JSON.parse(verifiedSidecar(path));
  const expected=new Map([
    ['public.order_payment_audit_trigger()',['public, pg_temp','{postgres=X/postgres}']]
  ]);
  const result=new Map();
  for (const [identity,[searchPath,acl]] of expected) {
    const fn=capture.functions?.find(candidate=>candidate.identity===identity);
    if (!fn || fn.owner!=='postgres' || fn.security_definer!==true || fn.search_path!==searchPath || fn.acl!==acl || !fn.definition || sha(fn.definition)!==fn.definition_sha256) fail(`incomplete Task 4 Production function capture: ${identity}`);
    result.set(identity,fn);
  }
  return result;
}
function definitionSql(r) {
  const columns=r.columns.sort((a,b)=>a.ordinal-b.ordinal).map(c => `${ident(c.name)} ${c.type}${c.collation ? ` COLLATE ${c.collation}` : ''}${c.default==null ? '' : ` DEFAULT ${c.default}`}${c.not_null?' NOT NULL':''}`).join(',\n  ');
  const constraints=r.constraints.map(c=>`CONSTRAINT ${ident(c.name)} ${c.definition}`).join(',\n  ');
  const constraintNames=new Set(r.constraints.map(c=>c.name));
  return `CREATE TABLE public.${ident(r.name)} (\n  ${columns}${constraints ? `,\n  ${constraints}`:''}\n);\n${r.indexes.filter(i=>!i.is_primary&&!constraintNames.has(i.name)).map(i=>`${i.definition};`).join('\n')}\nALTER TABLE public.${ident(r.name)} OWNER TO postgres;\n${r.rls_enabled?`ALTER TABLE public.${ident(r.name)} ENABLE ROW LEVEL SECURITY;`:''}\n${r.rls_forced?`ALTER TABLE public.${ident(r.name)} FORCE ROW LEVEL SECURITY;`:''}`;
}
function deterministicUuid(seed) { const h=sha(seed); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`; }
function paymentFingerprintSql() { return `SELECT count(*)::text || '|' || coalesce(encode(digest(string_agg(row_sha,'' order by row_sha),'sha256'),'hex'),'') FROM (SELECT encode(digest(to_jsonb(p)::text,'sha256'),'hex') AS row_sha FROM public.payments p) s;`; }
export function buildHistoricalFixtureSql() {
  const sensitive=resolve(root,'evidence/task4-payments-history-fixture');
  const manifest=JSON.parse(verified(resolve(sensitive,'manifest.json'),'193cf836e312bf479afcd6634f04d313d52e5f46b5805d518b32b0e43ba24dda'));
  const csvBytes=verified(resolve(sensitive,'payments-history.csv'),manifest.files['payments-history.csv'].sha256);
  const data=csv(csvBytes.toString('utf8')); const headers=data.shift(); if (JSON.stringify(headers)!==JSON.stringify(expectedColumns) || data.length!==11) fail('sensitive CSV shape mismatch');
  const rows=parseHistoricalPaymentCsv(csvBytes.toString('utf8'));
  assertHistoricalPreseed(rows);
  const splitCapture=JSON.parse(verified(resolve(root,'evidence/vp0-deploy-01-task4-split-bills-production-relation-capture/p0-deploy-01-task4-split-bills-production-relation-capture-20260905T131338Z.json'),'8f8672867daa7c1746ee3b145705851595d91c23091cb648bbb1039edf150577')).relation;
  const paymentsCapture=JSON.parse(verified(resolve(root,'evidence/p0-deploy-01-task4-payments-production-relation/p0-deploy-01-task4-payments-production-relation-capture-20260905T021514Z.json'),'05438f27cd43f3ae64a072bfbafb1eb7f57e9db8cb1cf269454523084de6ed55')).relation;
  const productionFunctions=capturedTask4Functions();
  const orderMap=new Map(); const splitMap=new Map(); const restaurants=new Set(); const users=new Set();
  for (const p of rows) { restaurants.add(p.restaurant_id); orderMap.set(p.order_id,p.restaurant_id); if(p.recorded_by) users.add(p.recorded_by); if(p.voided_by) users.add(p.voided_by); if(p.split_bill_id) { const prior=splitMap.get(p.split_bill_id); const pair=`${p.restaurant_id}|${p.order_id}`; if(prior && prior!==pair) fail('captured split bill maps to conflicting payment order/restaurant'); splitMap.set(p.split_bill_id,pair); } }
  if(splitMap.size!==0) fail('historical split-bill parent rows are required after NULL reconstruction');
  const sql=['BEGIN;','SET LOCAL client_min_messages=warning;'];
  // Existing approved C3 schemas supply auth.users/restaurants/tables/orders. Parent data below is synthetic identity support only.
  for (const id of users) sql.push(`INSERT INTO auth.users(id,email) VALUES (${q(id)}::uuid,${q(`fixture-${sha(id).slice(0,16)}@invalid.example`)}) ON CONFLICT (id) DO NOTHING;`);
  for (const id of restaurants) sql.push(`INSERT INTO public.restaurants(id,name,slug,status) VALUES (${q(id)}::uuid,${q(`fixture-${sha(id).slice(0,16)}`)},${q(`fixture-${sha(id).slice(0,16)}`)},'active') ON CONFLICT (id) DO NOTHING;`);
  const tableNumbers=new Map();
  for (const [orderId,restaurantId] of orderMap) { const tableId=deterministicUuid(`task4-table:${orderId}`); const tableNumber=(tableNumbers.get(restaurantId)||0)+1; tableNumbers.set(restaurantId,tableNumber); sql.push(`INSERT INTO public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) VALUES (${q(tableId)}::uuid,${q(restaurantId)}::uuid,${tableNumber},${q(`fixture-${sha(orderId).slice(0,16)}`)},${q(`fixture-${sha(orderId).slice(0,16)}`)},${q(`fixture-${sha(orderId).slice(0,16)}`)},${q(`fixture-${sha(orderId).slice(0,16)}`)}) ON CONFLICT (id) DO NOTHING;`); sql.push(`INSERT INTO public.orders(id,restaurant_id,table_id,order_number,status,subtotal,total,local_id) VALUES (${q(orderId)}::uuid,${q(restaurantId)}::uuid,${q(tableId)}::uuid,1,'new',0,0,${q(`fixture-${sha(orderId).slice(0,16)}`)}) ON CONFLICT (id) DO NOTHING;`); }
  sql.push(definitionSql(splitCapture));
  for (const [splitId,pair] of splitMap) { const [restaurantId,orderId]=pair.split('|'); const label=`fixture-${sha(splitId).slice(0,16)}`; sql.push(`INSERT INTO public.split_bills(id,restaurant_id,order_id,name,split_type,subtotal_cents,gst_cents,total_cents,paid_cents,status,created_at,updated_at) VALUES (${q(splitId)}::uuid,${q(restaurantId)}::uuid,${q(orderId)}::uuid,${q(label)},'equal',0,0,0,0,'unpaid','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z');`); }
  sql.push(definitionSql(paymentsCapture));
  sql.push(`${productionFunctions.get('public.order_payment_audit_trigger()').definition.trim()};`);
  // User-defined triggers are intentionally installed after the historical INSERT: no synthetic audit/activity history is generated. Internal FK triggers stay enabled.
  const cols=expectedColumns.map(ident).join(',');
  for (const r of rows) sql.push(`INSERT INTO public.payments(${cols}) VALUES (${expectedColumns.map(c=>r[c]===null?'NULL':q(r[c])).join(',')});`);
  for (const t of paymentsCapture.triggers) sql.push(`${t.definition};`);
  for (const t of splitCapture.triggers) sql.push(`${t.definition};`);
  for (const p of paymentsCapture.policies) sql.push(`CREATE POLICY ${ident(p.name)} ON public.payments AS ${p.permissive} FOR ${p.command} TO ${p.roles.map(ident).join(',')} USING (${p.using});`);
  for (const p of splitCapture.policies) sql.push(`CREATE POLICY ${ident(p.name)} ON public.split_bills AS ${p.permissive} FOR ${p.command} TO ${p.roles.map(ident).join(',')} USING (${p.using});`);
  sql.push('COMMIT;'); return sql.join('\n')+'\n';
}
export { paymentFingerprintSql };
if (process.argv[1]===file) { const i=process.argv.indexOf('--output'); if(i<0) fail('--output required'); writeFileSync(process.argv[i+1],buildHistoricalFixtureSql()); }
