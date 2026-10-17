import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { runLocalGate, withLocalBrowserCredentials, cleanupLocalGate } from '../scripts/run-local-supabase-integration-gate.mjs';

// Own a unique disposable local stack. Never accept a hosted URL or credentials.
const docker=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||'Local Docker failed');return r.stdout.trim()};
const previous=new Set(docker(['ps','--format','{{.Names}}']).split('\n'));
try {
 await runLocalGate();
 const databases=docker(['ps','--format','{{.Names}}']).split('\n').filter(n=>!previous.has(n)&&/^aveniq-api-gate-[a-f0-9]+-db$/.test(n));
 assert.equal(databases.length,1,'Only the uniquely created local database is inspected');
 const sql=q=>docker(['exec','-e','PGPASSWORD=postgres','-i',databases[0],'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],q);
 await withLocalBrowserCredentials(async({appUrl,ownerEmail,password})=>{
  assert.equal(new URL(appUrl).hostname,'127.0.0.1');
  const storage=new Map();const window={crypto:webcrypto,location:{pathname:'/dashboard/sake-street/tables',search:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  vm.runInNewContext(await(await fetch(appUrl+'/supabase-config.js')).text(),{window});
  assert.equal(window.TABLEORDER_SUPABASE.url,appUrl);
  vm.runInNewContext(readFileSync(new URL('../supabase-client.js',import.meta.url),'utf8'),{window,URLSearchParams,fetch});
  const cloud=window.TableOrderCloud;await cloud.signInWithPassword(ownerEmail,password);const profile=await cloud.getStaffProfile();
  let data=await cloud.loadRestaurantData();
  for(const n of [3,4])await cloud.createRestaurantTable(profile.restaurantId,{id:'rename-local-'+n,name:'Table '+n},n);
  data=await cloud.loadRestaurantData();const table=data.tables.find(t=>t.table_number===4);assert.ok(table);
  const issued=await cloud.issuePublicQrTableToken(profile.restaurantId,table.id);assert.ok(issued.token);
  const tokenHash=createHash('sha256').update(issued.token).digest('hex');
  const snapshot=()=>sql(`select jsonb_build_object('table',to_jsonb(t)-'name'-'table_name'-'updated_at','tokens',(select jsonb_agg(to_jsonb(p) order by p.id) from public.public_order_tokens p where p.table_id=t.id)) from public.tables t where id='${table.id}'::uuid;`);
  const before=snapshot();assert.ok(before.includes(tokenHash),'Hash-only persisted public token');assert.ok(!before.includes(issued.token),'Raw public token never persisted');
  sql(`insert into public.orders(restaurant_id,table_id,status,note,subtotal,tax,total) values ('${profile.restaurantId}','${table.id}','preparing','Synthetic rename regression',3.64,.36,4);`);
  const orderIds=()=>sql(`select id,table_id,status,total from public.orders where table_id='${table.id}' order by id;`);
  const orderBefore=orderIds();
  const qr=()=>cloud.getPublicQrOrderContext(issued.token);
  assert.equal((await qr()).table.name,'Table 4');
  for(const email of [ownerEmail,'manager@local.integration']) {
   await cloud.signInWithPassword(email,password);
   const rows=await cloud.updateRestaurantTable(table.id,{name:'  Patio 1  '},profile.restaurantId,{returnRepresentation:true});
   assert.equal(rows.length,1);assert.equal(rows[0].table_name,'Patio 1');assert.equal(rows[0].local_id,table.local_id);
   assert.equal(snapshot(),before,'All identity and QR token/hash rows unchanged');assert.equal(orderIds(),orderBefore,'Open order remains attached');
   const context=await qr();assert.equal(context.table.id,table.id);assert.equal(context.table.name,'Patio 1','Original printed QR resolves current name');
  }
  for(const email of ['staff@local.integration','kitchen@local.integration','cashier@local.integration']) {
   await cloud.signInWithPassword(email,password);
   const rows=await cloud.updateRestaurantTable(table.id,{name:'Denied'},profile.restaurantId,{returnRepresentation:true});assert.equal(rows.length,0,'RLS rejects '+email.split('@')[0]);
   assert.equal((await qr()).table.name,'Patio 1');
  }
  await cloud.signInWithPassword(ownerEmail,password);
  const foreign=await cloud.updateRestaurantTable(table.id,{name:'Wrong tenant'},'99999999-9999-4999-8999-999999999999',{returnRepresentation:true});assert.equal(foreign.length,0);
  assert.throws(()=>cloud.updateRestaurantTable(table.id,{name:'   '},profile.restaurantId),/Enter a table name/);
  assert.equal(snapshot(),before);assert.equal(orderIds(),orderBefore);
  const loaded=await cloud.loadOrders(profile.restaurantId);assert.ok(loaded.some(o=>o.table_id===table.id&&o.tables.table_name==='Patio 1'));
  console.log('PASS disposable Supabase: owner/manager rename, staff/kitchen/cashier and wrong-tenant denial; exact identity/token-hash preservation; original QR and open-order joins resolve Patio 1');
 });
} finally {await cleanupLocalGate();}
