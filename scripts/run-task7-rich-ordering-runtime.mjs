#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const container = process.env.P0_DB_CONTAINER;
if (!container) throw new Error('P0_DB_CONTAINER is required for this disposable local Task 7 runtime harness.');
const ids = Object.fromEntries(['owner','manager','org','restaurant','table','category','item','foreignOrg','foreignRestaurant','foreignCategory','foreignItem'].map(key => [key, randomUUID()]));
const marker = `task7-${randomUUID()}`;

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec','-i',container,'psql','-q','-t','-A','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], { stdio: ['pipe','pipe','pipe'], shell: false });
    let stdout='', stderr=''; child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr })); child.stdin.end(sql);
  });
}
function ok(result, label) { assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`); return result.stdout.trim(); }
function expectFailure(result, label, code) { assert.notEqual(result.code, 0, `${label} unexpectedly succeeded`); assert.match(result.stderr, new RegExp(code), `${label}: ${result.stderr}`); }
function quoted(value) { return String(value).replace(/'/g, "''"); }
function authSql(userId) { return `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); select set_config('request.jwt.claim.role','authenticated',true);`; }
function issueSql() { return `${authSql(ids.manager)} select public.issue_public_qr_table_token('${ids.restaurant}','${ids.table}',null); commit;`; }
function submitSql(token, key, selections, quantity = 1) {
  const payload = JSON.stringify([{ menu_item_id: ids.item, quantity, options: selections }]);
  return `begin; set local role anon; select public.submit_public_qr_order('${token}','${quoted(payload)}'::jsonb,'Task 7','${marker}','${key}'::uuid); commit;`;
}

async function setup() {
  ok(await psql(`begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('${ids.owner}','authenticated','authenticated','${marker}-owner@example.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
 ('${ids.manager}','authenticated','authenticated','${marker}-manager@example.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency) values ('${ids.org}','${ids.owner}','Task 7 Org','${marker}','AU','Australia/Sydney','AUD'),('${ids.foreignOrg}','${ids.manager}','Task 7 Foreign','${marker}-foreign','AU','Australia/Sydney','AUD');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,country,currency_code,ordering_enabled,venue_status,is_open,logo_url,subtitle,theme_config,tax_rate) values
 ('${ids.restaurant}','${ids.owner}','${ids.org}','Sake Task 7','${marker}','AU','AUD',true,'active',true,'/assets/sake.webp','Japanese QR Table Ordering','{"primaryColor":"#b21f24"}',10),
 ('${ids.foreignRestaurant}','${ids.manager}','${ids.foreignOrg}','Coffee Task 7','${marker}-coffee','AU','AUD',true,'active',true,'','','{}',10);
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('${ids.restaurant}','${ids.owner}','owner'),('${ids.restaurant}','${ids.manager}','manager');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values ('${ids.table}','${ids.restaurant}',1,'Sake Table','${marker}','Sake Table','${marker}');
insert into public.categories(id,restaurant_id,name,sort_order) values ('${ids.category}','${ids.restaurant}','Mains',1),('${ids.foreignCategory}','${ids.foreignRestaurant}','Coffee',1);
insert into public.menu_items(id,restaurant_id,category_id,name,description,price,image_url,local_id,category,tags,option_template,option_config,is_active,is_available,sold_out,sort_order) values
 ('${ids.item}','${ids.restaurant}','${ids.category}','Ramen','Rich broth',10,'/assets/ramen.webp','${marker}','Mains','["Spicy"]','spiceAddons','[{"id":"spice","name":"Spice","choices":[{"id":"mild","name":"Mild","price":0},{"id":"hot","name":"Hot","price":0}]},{"id":"addon","name":"Add-on","choices":[{"id":"egg","name":"Egg","price":2.5},{"id":"rice","name":"Rice","price":3}]}]',true,true,false,1),
 ('${ids.foreignItem}','${ids.foreignRestaurant}','${ids.foreignCategory}','Coffee','Foreign',99,'/assets/coffee.webp','${marker}-coffee','Coffee','[]','none','[]',true,true,false,1);
insert into public.public_qr_ordering_entitlements(restaurant_id,active) values ('${ids.restaurant}',true);
commit;`), 'fixture setup');
}

async function issue() { return JSON.parse(ok(await psql(issueSql()), 'manager issuance').split(/\r?\n/).at(-1)); }
async function run() {
  await setup(); const issued = await issue(); assert.equal(typeof issued.token, 'string');
  const token = issued.token;
  const context = JSON.parse(ok(await psql(`begin; set local role anon; select public.get_public_qr_order_context('${token}'); commit;`), 'rich context').split(/\r?\n/).at(-1));
  assert.equal(context.restaurant.name, 'Sake Task 7'); assert.equal(context.restaurant.logo_url, '/assets/sake.webp'); assert.equal(context.table.name, 'Sake Table');
  assert.equal(context.categories[0].name, 'Mains'); assert.equal(context.menu_items[0].image_url, '/assets/ramen.webp'); assert.deepEqual(context.menu_items[0].tags, ['Spicy']); assert.equal(context.menu_items[0].option_config.length, 2);
  const selections=[{groupId:'spice',choiceId:'hot'},{groupId:'addon',choiceId:'egg'}]; const key=randomUUID();
  const first=JSON.parse(ok(await psql(submitSql(token,key,selections,2)), 'rich submit').split(/\r?\n/).at(-1)); assert.equal(first.idempotent_replay,false);
  const replay=JSON.parse(ok(await psql(submitSql(token,key,selections,2)), 'rich replay').split(/\r?\n/).at(-1)); assert.equal(replay.id,first.id); assert.equal(replay.idempotent_replay,true);
  const snapshot=JSON.parse(ok(await psql(`select json_build_object('total',o.total,'base_price',i.base_price,'unit_price',i.unit_price,'options',i.options) from public.orders o join public.order_items i on i.order_id=o.id where o.id='${first.id}';`), 'authoritative snapshot'));
  assert.equal(Number(snapshot.total),25); assert.equal(Number(snapshot.base_price),10); assert.equal(Number(snapshot.unit_price),12.5); assert.equal(snapshot.options[1].choiceName,'Egg'); assert.equal(Number(snapshot.options[1].price),2.5);
  const status=JSON.parse(ok(await psql(`begin; set local role anon; select public.get_public_qr_order_status('${token}','${first.id}'); commit;`), 'rich status').split(/\r?\n/).at(-1)); assert.equal(status.items[0].options[0].choiceName,'Hot');
  expectFailure(await psql(submitSql(token,randomUUID(),[{groupId:'spice',choiceId:'egg'},{groupId:'addon',choiceId:'egg'}])), 'wrong-group option','INVALID_ORDER_OPTIONS');
  expectFailure(await psql(submitSql(token,randomUUID(),[{groupId:'spice',choiceId:'hot'}])), 'missing group','INVALID_ORDER_OPTIONS');
  expectFailure(await psql(submitSql(token,randomUUID(),[{groupId:'spice',choiceId:'hot'},{groupId:'spice',choiceId:'mild'}])), 'duplicate group','INVALID_ORDER_OPTIONS');
  const foreignPayload=JSON.stringify([{menu_item_id:ids.foreignItem,quantity:1,options:[]}]);
  expectFailure(await psql(`begin; set local role anon; select public.submit_public_qr_order('${token}','${quoted(foreignPayload)}'::jsonb,'','', '${randomUUID()}'::uuid); commit;`), 'foreign menu item','INVALID_ORDER_ITEM');
  expectFailure(await psql(submitSql(token,key,[{groupId:'spice',choiceId:'mild'},{groupId:'addon',choiceId:'egg'}],2)), 'changed selections same key','IDEMPOTENCY_KEY_REUSED');
  const raceKey=randomUUID(); const [a,b]=await Promise.all([psql(submitSql(token,raceKey,selections)),psql(submitSql(token,raceKey,selections))]);
  const raced=[a,b].map(r=>JSON.parse(ok(r,'same-payload concurrency').split(/\r?\n/).at(-1))); assert.equal(raced.filter(r=>r.idempotent_replay===false).length,1); assert.equal(raced.filter(r=>r.idempotent_replay===true).length,1);
  const conflictKey=randomUUID(); const [left,right]=await Promise.all([psql(submitSql(token,conflictKey,selections)),psql(submitSql(token,conflictKey,[{groupId:'spice',choiceId:'mild'},{groupId:'addon',choiceId:'egg'}]))]);
  assert.equal([left,right].filter(r=>r.code===0).length,1); expectFailure([left,right].find(r=>r.code!==0),'different-selection concurrency','IDEMPOTENCY_KEY_REUSED');
  console.log('TASK7_RICH_RUNTIME_GREEN');
}
async function cleanup() { await psql(`begin; delete from public.public_qr_order_operations where restaurant_id='${ids.restaurant}'; delete from public.order_items where restaurant_id='${ids.restaurant}'; delete from public.orders where restaurant_id='${ids.restaurant}'; delete from public.public_order_token_issuance_audit where restaurant_id='${ids.restaurant}'; delete from public.public_order_tokens where restaurant_id='${ids.restaurant}'; delete from public.public_qr_ordering_entitlements where restaurant_id='${ids.restaurant}'; delete from public.menu_items where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}'); delete from public.categories where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}'); delete from public.restaurant_staff where restaurant_id='${ids.restaurant}'; delete from public.tables where id='${ids.table}'; delete from public.restaurants where id in ('${ids.restaurant}','${ids.foreignRestaurant}'); delete from public.organizations where id in ('${ids.org}','${ids.foreignOrg}'); delete from auth.users where id in ('${ids.owner}','${ids.manager}'); commit;`); }
try { await run(); } finally { await cleanup(); }
