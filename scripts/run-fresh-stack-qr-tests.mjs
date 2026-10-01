#!/usr/bin/env node
// Always starts an empty, uniquely named local container. Never accepts a remote
// database URL, existing container, or production credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = `aveniq-fresh-qr-${randomUUID()}`;
if (process.argv.slice(2).some(argument=>argument!=='--pg15')) throw new Error('Only --pg15 is supported; database targets cannot be overridden.');
const image = process.argv.includes('--pg15')
  ? 'public.ecr.aws/supabase/postgres:15.8.1.085'
  : 'public.ecr.aws/supabase/postgres:17.6.1.167';
let created = false;
let checks = 0;
function command(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function succeeded(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const sql = input => command(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const pass = label => { checks += 1; console.log(`PASS ${label}`); };
const query = async input => succeeded(await sql(input), 'database assertion');
const json = async input => JSON.parse((await query(input)).split(/\r?\n/).at(-1));
const as = (role, user, statement) => `begin; set local role ${role}; select set_config('request.jwt.claim.sub',${quote(user || '')},true); select set_config('request.jwt.claims',${quote(JSON.stringify({ role, sub: user || '' }))},true); ${statement}; commit;`;
async function denied(input, label, error = /ERROR:/) {
  const result = await sql(input);
  assert.notEqual(result.code, 0, `${label}: unauthorized operation succeeded`);
  assert.match(result.stderr, error, `${label}: wrong denial: ${result.stderr}`);
  pass(label);
}
const users = Object.fromEntries(['owner', 'manager', 'staff', 'kitchen', 'cashier', 'outsider', 'nonmember'].map(role => [role, randomUUID()]));
const otherRestaurant = randomUUID(), otherTable = randomUUID(), otherItem = randomUUID();
async function waitForSleeper(marker) {
  for (let attempt=0;attempt<30;attempt+=1) {
    if (await query(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event='PgSleep';`) === '1') return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error(`lock-holder session never became ready: ${marker}`);
}

async function run() {
  succeeded(await command(['run', '-d', '--rm', '--name', container, '-e', `POSTGRES_PASSWORD=${randomUUID()}`, image]), 'start disposable database');
  created = true;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    // The image first runs a socket-only temporary initialization server. Wait
    // for TCP readiness so migration replay cannot race that server's shutdown.
    const tcp = await command(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
    const ready = await sql("select (to_regclass('auth.users') is not null and to_regprocedure('auth.uid()') is not null)::text;");
    if (tcp.code === 0 && ready.code === 0 && ready.stdout.trim() === 'true') break;
    if (attempt === 89) throw new Error(`Supabase auth bootstrap not ready: ${ready.stderr}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(await query("select count(*) from pg_tables where schemaname='public';"), '0', 'application schema must start empty');
  const files = readdirSync(path.join(root, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    succeeded(await sql(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8')), `migration ${file}`);
    console.log(`APPLIED ${file}`);
  }
  pass(`complete empty-database replay (${files.length} canonical migrations)`);
  const seed = await json("select json_build_object('restaurant',r.id,'categories',(select count(*) from public.categories where restaurant_id=r.id),'items',(select count(*) from public.menu_items where restaurant_id=r.id),'tables',(select count(*) from public.tables where restaurant_id=r.id)) from public.restaurants r where slug='sake-street';");
  assert.equal(seed.categories, 12); assert.equal(seed.items, 71); assert.equal(seed.tables, 2);
  pass('Sake Street seed: 12 categories, 71 items, 2 tables');
  const restaurant = seed.restaurant;
  const tableIds = (await query(`select id from public.tables where restaurant_id='${restaurant}' order by table_number;`)).split(/\r?\n/);
  const [table, secondTable] = tableIds;
  const item = await json(`select json_build_object('id',id,'price',price) from public.menu_items where restaurant_id='${restaurant}' and is_active and is_available and not sold_out and option_config='[]'::jsonb and price>0 order by id limit 1;`);
  await query(`insert into auth.users(id,email) values ${Object.values(users).map(id => `('${id}','${id}@example.invalid')`).join(',')};
    insert into public.restaurants(id,name,slug,status) values ('${otherRestaurant}','Foreign fixture','foreign-${otherRestaurant}','active');
    insert into public.restaurant_staff(restaurant_id,user_id,role) values ${Object.entries(users).filter(([role]) => !['outsider','nonmember'].includes(role)).map(([role,id]) => `('${restaurant}','${id}','${role}')`).join(',')},('${otherRestaurant}','${users.outsider}','owner');
    insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values ('${otherTable}','${otherRestaurant}',1,'Other','other','Other','${randomUUID()}');
    insert into public.menu_items(id,restaurant_id,name,price,local_id,category) values ('${otherItem}','${otherRestaurant}','Foreign',999,'foreign','Other');`);
  const issue = (who, target = table, tenant = restaurant, expires = 'null') => as('authenticated', users[who], `select public.issue_public_qr_table_token('${tenant}','${target}',${expires})`);
  const ownerToken = await json(issue('owner')); assert.ok(ownerToken.token); assert.equal(ownerToken.rotated, false);
  const managerToken = await json(issue('manager', secondTable)); assert.ok(managerToken.token);
  pass('owner and manager token issuance');
  assert.equal(await query(`select token_hash=encode(extensions.digest(${quote(ownerToken.token)},'sha256'),'hex') and created_by='${users.owner}' from public.public_order_tokens where id='${ownerToken.token_id}';`),'t');
  assert.equal(await query(`select count(*) from public.public_order_token_issuance_audit where restaurant_id='${restaurant}' and actor_user_id in ('${users.owner}','${users.manager}') and action='issued';`),'2');
  pass('token hash storage and issuer audit attribution');
  await denied(issue('owner', table, restaurant,"now()-interval '1 minute'"),'past token expiry rejected',/INVALID_TOKEN_EXPIRY/);
  for (const who of ['owner','manager']) {
    const metadata = await json(as('authenticated', users[who], `select jsonb_agg(x) from public.get_public_qr_table_token_metadata('${restaurant}') x`));
    assert.equal(metadata.length, 2); assert.ok(metadata.every(row => row.has_active_token));
    assert.deepEqual(Object.keys(metadata[0]).sort(), ['has_active_token','table_id']);
  }
  pass('dashboard metadata contains active flags and no token secrets');
  for (const who of ['staff','kitchen','cashier','outsider','nonmember']) {
    await denied(issue(who), `${who} cannot administer QR tokens`);
    await denied(as('authenticated', users[who], `select * from public.get_public_qr_table_token_metadata('${restaurant}')`), `${who} cannot read QR administration metadata`);
  }
  await denied(issue('owner', otherTable), 'owner cannot bind token to another tenant table');
  await denied(as('anon', null, `select public.issue_public_qr_table_token('${restaurant}','${table}',null)`), 'anonymous issuance denied', /permission denied/);
  const token = ownerToken.token;
  const contextSql = value => as('anon', null, `select public.get_public_qr_order_context(${quote(value)})`);
  const context = await json(contextSql(token));
  assert.equal(context.restaurant.id, restaurant); assert.equal(context.table.id, table);
  assert.ok(context.menu_items.some(row => row.id === item.id)); assert.equal(context.categories.length, 12);
  assert.ok(context.menu_items.every(row => row.id !== otherItem));
  pass('anonymous /order/<token> context and tenant-scoped catalogue');
  for (const invalid of ['', 'invalid', randomUUID(), 'x'.repeat(4096)]) await denied(contextSql(invalid), 'invalid token fails closed');
  const submit = (value, key, quantity = 1, menuItem = item.id, options = []) => as('anon', null, `select public.submit_public_qr_order(${quote(value)},${quote(JSON.stringify([{menu_item_id:menuItem,quantity,options}]))}::jsonb,'Fixture customer','Fixture note','${key}')`);
  const key = randomUUID();
  const initialOrderCount=Number(await query(`select count(*) from public.orders where restaurant_id='${restaurant}';`));
  const order = await json(submit(token, key)); assert.ok(order.id); assert.equal(order.idempotent_replay, false);
  const replay = await json(submit(token, key)); assert.equal(replay.id, order.id); assert.equal(replay.idempotent_replay, true);
  assert.equal(Number(await query(`select count(*) from public.orders where restaurant_id='${restaurant}';`)),initialOrderCount+1);
  assert.equal(Number(await query(`select total from public.orders where id='${order.id}';`)), Number(item.price));
  pass('public submission, server-owned price and same-key retry');
  await denied(submit(token,key,2), 'changed payload cannot reuse idempotency key', /IDEMPOTENCY_KEY_REUSED/);
  await denied(submit(token,randomUUID(),1,otherItem), 'foreign menu item rejected');
  await denied(submit(token,randomUUID(),0), 'zero quantity rejected');
  await denied(submit(token,randomUUID(),1,item.id,[{groupId:'fake',choiceId:'free'}]), 'unconfigured options rejected');
  const richItem=randomUUID();
  await query(`insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values
    ('${richItem}','${restaurant}','Option test',10,'${richItem}','Mains','[{"id":"size","name":"Size","choices":[{"id":"regular","name":"Regular","price":0},{"id":"large","name":"Large","price":2.5}]}]');`);
  const richOrder=await json(submit(token,randomUUID(),2,richItem,[{groupId:'size',choiceId:'large',price:-1000,choiceName:'Forged'}]));
  const richSnapshot=await json(`select json_build_object('total',o.total,'unit',i.unit_price,'options',i.options,'balanced',o.total=o.subtotal+o.tax) from public.orders o join public.order_items i on i.order_id=o.id where o.id='${richOrder.id}';`);
  assert.equal(Number(richSnapshot.total),25); assert.equal(Number(richSnapshot.unit),12.5); assert.equal(richSnapshot.balanced,true);
  assert.equal(richSnapshot.options[0].choiceName,'Large'); assert.equal(Number(richSnapshot.options[0].price),2.5);
  pass('authoritative option prices/names and balanced tax snapshot ignore client forgery');
  await denied(submit(token,randomUUID(),1,richItem,[]),'required option group cannot be omitted');
  await denied(submit(token,randomUUID(),1,richItem,[{groupId:'size',choiceId:'unknown'}]),'unknown option choice rejected');
  await denied(submit(token,randomUUID(),1,richItem,[{groupId:'wrong',choiceId:'large'}]),'wrong option group rejected');
  await denied(submit(token,randomUUID(),1,richItem,[{groupId:'size',choiceId:'large'},{groupId:'size',choiceId:'regular'}]),'duplicate option groups rejected');
  const raceKey = randomUUID();
  const beforeRace=Number(await query(`select count(*) from public.orders where restaurant_id='${restaurant}';`));
  const racing = await Promise.all(Array.from({length:4},() => sql(submit(token,raceKey))));
  const results = racing.map(result => JSON.parse(succeeded(result,'concurrent submission').split(/\r?\n/).at(-1)));
  assert.equal(new Set(results.map(result => result.id)).size,1);
  assert.equal(results.filter(result => !result.idempotent_replay).length,1);
  assert.equal(Number(await query(`select count(*) from public.orders where restaurant_id='${restaurant}';`)),beforeRace+1);
  pass('four concurrent same-key submissions create exactly one order');
  const conflictKey = randomUUID();
  const conflicting = await Promise.all([sql(submit(token,conflictKey)),sql(submit(token,conflictKey,2))]);
  assert.equal(conflicting.filter(result => result.code === 0).length,1);
  assert.match(conflicting.find(result => result.code !== 0).stderr,/IDEMPOTENCY_KEY_REUSED/);
  pass('concurrent changed-payload idempotency conflict');
  const statusSql = (value,id) => as('anon',null,`select public.get_public_qr_order_status(${quote(value)},'${id}')`);
  const status = await json(statusSql(token,order.id)); assert.equal(status.status,'new'); assert.ok(status.items.length);
  pass('customer tracking returns own order');
  // Execute the shipped adapter against real database responses. Only HTTP
  // transport is replaced; each RPC runs with the anonymous database role.
  const window={TABLEORDER_SUPABASE:{url:'https://disposable.example.invalid',publishableKey:'local-only'},location:{pathname:`/order/${token}`,search:''},localStorage:{getItem:()=>null}};
  const client=vm.createContext({window,URLSearchParams,console,fetch:async(url,options)=>{
    const body=JSON.parse(options.body);
    let statement;
    if (url.endsWith('/rpc/get_public_qr_order_context')) statement=`select public.get_public_qr_order_context(p_token=>${quote(body.p_token)})`;
    else if (url.endsWith('/rpc/submit_public_qr_order')) statement=`select public.submit_public_qr_order(p_token=>${quote(body.p_token)},p_items=>${quote(JSON.stringify(body.p_items))}::jsonb,p_customer_name=>${quote(body.p_customer_name)},p_note=>${quote(body.p_note)},p_idempotency_key=>${quote(body.p_idempotency_key)}::uuid)`;
    else if (url.endsWith('/rpc/get_public_qr_order_status')) statement=`select public.get_public_qr_order_status(p_token=>${quote(body.p_token)},p_order_id=>${quote(body.p_order_id)}::uuid)`;
    else throw new Error(`Unexpected frontend request: ${url}`);
    const result=await json(as('anon',null,statement));
    return {ok:true,status:200,text:async()=>JSON.stringify(result)};
  }});
  vm.runInContext(readFileSync(path.join(root,'supabase-client.js'),'utf8'),client);
  const loaded=await window.TableOrderCloud.loadRestaurantData();
  assert.equal(loaded.tables[0].table_number,1); assert.equal(loaded.tables[0].table_name,'Table 1');
  assert.equal(loaded.restaurant.id,restaurant); assert.equal(loaded.publicToken,token); assert.ok(loaded.menuItems.some(row=>row.id===item.id));
  pass('shipped /order/<token> adapter maps live database table number and catalogue');
  const draft={idempotencyKey:randomUUID(),customerName:'Adapter customer',note:'Adapter note',items:[{menuItemCloudId:item.id,quantity:1,options:[]}]};
  const fromAdapter=await window.TableOrderCloud.submitOrder(draft);
  const retriedAdapter=await window.TableOrderCloud.submitOrder(draft);
  assert.equal(fromAdapter.id,retriedAdapter.id); assert.ok(Number.isInteger(fromAdapter.number));
  const adapterStatus=await window.TableOrderCloud.loadCustomerOrderStatus(fromAdapter.id); assert.equal(adapterStatus.status,'new');
  assert.equal(await query(`select customer_name||':'||note from public.orders where id='${fromAdapter.id}';`),'Adapter customer:Adapter note');
  pass('shipped adapter submits/retries/tracks live order with correct named RPC arguments');
  await denied(statusSql(managerToken.token,order.id),'different table token cannot read order');
  const foreignToken = await json(issue('outsider',otherTable,otherRestaurant));
  await denied(statusSql(foreignToken.token,order.id),'cross-tenant token cannot read order');
  await denied(statusSql(token,randomUUID()),'unknown order denied');
  const rotated = await json(issue('manager')); assert.equal(rotated.rotated,true);
  assert.equal(await query(`select count(*) from public.public_order_tokens where table_id='${table}' and revoked_at is null;`),'1');
  assert.equal(await query(`select count(*) from public.public_order_token_issuance_audit where token_id='${rotated.token_id}' and actor_user_id='${users.manager}' and action='rotated';`),'1');
  pass('rotation retains one current token and attributed audit history');
  await denied(contextSql(token),'rotated token context denied');
  await denied(submit(token,key),'rotated token cannot replay existing order');
  await denied(statusSql(token,order.id),'rotated token tracking denied');
  await json(contextSql(rotated.token));
  await denied(statusSql(rotated.token,order.id),'new token cannot read order created by previous token');
  await query(`update public.public_order_tokens set expires_at=now()-interval '1 second' where id='${rotated.token_id}';`);
  await denied(contextSql(rotated.token),'expired token denied');
  const renewed = await json(issue('owner'));
  await query(`update public.public_order_tokens set revoked_at=now() where id='${renewed.token_id}';`);
  await denied(contextSql(renewed.token),'revoked token denied');
  const active = await json(issue('owner'));
  await query(`update public.restaurants set is_open=false where id='${restaurant}';`);
  await denied(submit(active.token,randomUUID()),'closed restaurant submission denied');
  await query(`update public.restaurants set is_open=true where id='${restaurant}'; update public.tables set is_active=false where id='${table}';`);
  await denied(contextSql(active.token),'inactive table denied');
  await query(`update public.tables set is_active=true where id='${table}';`);
  const acl = await json("select coalesce(json_agg(p.proname order by p.proname),'[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE');");
  assert.deepEqual(acl,['get_public_qr_order_context','get_public_qr_order_status','submit_public_qr_order']);
  pass('anon SECURITY DEFINER EXECUTE allowlist is exactly three public QR RPCs');
  assert.equal(await query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_public_restaurant','submit_order','get_customer_order_status') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));"),'0');
  pass('legacy public RPCs unavailable to every browser role');
  for (const name of ['restaurants','tables','menu_items','categories','orders','order_items','public_order_tokens','public_qr_order_operations','payment_operations']) {
    const access = await sql(as('anon',null,`select count(*) from public.${name}`));
    if (access.code === 0) assert.equal(access.stdout.trim().split(/\r?\n/).at(-1),'0',`anonymous data leak: ${name}`);
    else assert.match(access.stderr,/permission denied/,`unexpected table error ${name}`);
  }
  pass('anonymous table reads reveal no application data');
  for (const name of ['tables','menu_items','orders','order_items']) assert.equal((await query(as('authenticated',users.outsider,`select count(*) from public.${name} where restaurant_id='${restaurant}'`))).split(/\r?\n/).at(-1),'0');
  pass('authenticated outsider RLS cannot read another tenant operational data');
  for (const who of ['staff','outsider','nonmember']) await denied(as('authenticated',users[who], 'select * from public.public_order_tokens'),`${who} cannot read token hashes directly`,/permission denied/);
  const rls = await query("select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('public_order_tokens','public_qr_order_operations','public_order_token_issuance_audit','payment_operations');");
  assert.equal(rls,'t'); pass('token, operation, issuance audit and payment tables have RLS');
  await denied(as('authenticated',users.outsider,`select public.update_restaurant_order_status('${restaurant}','${order.id}','Preparing')`),'cross-tenant Kitchen transition denied');
  await denied(as('authenticated',users.cashier,`select public.update_restaurant_order_status('${restaurant}','${order.id}','Preparing')`),'cashier Kitchen transition denied');
  for (const [who,next] of [['kitchen','Preparing'],['staff','Ready'],['owner','Served']]) await query(as('authenticated',users[who],`select public.update_restaurant_order_status('${restaurant}','${order.id}','${next}')`));
  assert.equal(await query(`select status from public.orders where id='${order.id}';`),'completed');
  await denied(as('authenticated',users.owner,`select public.update_restaurant_order_status('${restaurant}','${order.id}','Preparing')`),'Kitchen terminal regression denied');
  pass('Kitchen lifecycle New → Preparing → Ready → Served');
  const payable = await json(submit(active.token,randomUUID()));
  const payment = (who,amount,key=randomUUID()) => as('authenticated',users[who],`select public.record_authoritative_payment('${restaurant}','${payable.id}',${amount},'Cash','','','${key}')`);
  for (const who of ['staff','kitchen','outsider','nonmember']) {
    await denied(payment(who,1),`${who} payment writer denied`);
    await denied(as('authenticated',users[who],`select public.list_authoritative_payment_operations('${restaurant}',null)`),`${who} payment reader denied`);
  }
  const paymentKey=randomUUID(), cents=Math.round(Number(item.price)*100);
  const partial=await json(payment('cashier',1,paymentKey)); assert.equal(partial.payment_status,'partial');
  assert.equal((await json(payment('cashier',1,paymentKey))).idempotent_replay,true);
  await denied(payment('owner',cents),'payment overbalance denied',/PAYMENT_EXCEEDS_REMAINING_BALANCE/);
  const paid=await json(payment('manager',cents-1)); assert.equal(paid.payment_status,'paid');
  const ledger=await json(as('authenticated',users.owner,`select public.list_authoritative_payment_operations('${restaurant}','${payable.id}')`));
  assert.equal(ledger.length,2); assert.equal(ledger.reduce((sum,row)=>sum+row.amount_cents,0),cents);
  const projection=await json(`select json_build_object('status',status,'paid',paid_at is not null) from public.orders where id='${payable.id}';`);
  assert.equal(projection.status,'new'); assert.equal(projection.paid,true);
  pass('canonical payment partial/full ledger, retry, exact balance and independent Kitchen state');
  // Queue real role calls behind a token lock and let the token expire before
  // releasing it. A lookup performed before blocking must never authorize later.
  for (const [label,statement] of [['context',contextSql(active.token)],['status',statusSql(active.token,payable.id)],['submit',submit(active.token,randomUUID())]]) {
    await query(`update public.public_order_tokens set expires_at=clock_timestamp()+interval '2 seconds' where id='${active.token_id}';`);
    const marker=`qr-expiry-${randomUUID()}`;
    const held=sql(`begin; set local application_name='${marker}'; select id from public.public_order_tokens where id='${active.token_id}' for update; select pg_sleep(3); commit;`);
    await waitForSleeper(marker);
    await denied(statement,`${label} rechecks expiry after waiting on token lock`,/PUBLIC_TOKEN_NOT_FOUND/);
    succeeded(await held,'token lock holder');
    await query(`update public.public_order_tokens set expires_at=null where id='${active.token_id}';`);
  }
  // The submitter owns the token lock first; issuance then owns the table lock.
  // Its table lock must remain compatible with the order FK's KEY SHARE lock.
  const marker=`qr-rotate-race-${randomUUID()}`;
  const heldSubmit=sql(`begin; set local application_name='${marker}'; select id from public.public_order_tokens where id='${active.token_id}' for update; select pg_sleep(3); set local role anon; select public.submit_public_qr_order(${quote(active.token)},${quote(JSON.stringify([{menu_item_id:item.id,quantity:1,options:[]}]))}::jsonb,'Race','Race','${randomUUID()}'); commit;`);
  await waitForSleeper(marker);
  const racingIssue=sql(issue('manager'));
  const [submittedWhileRotating,issuedWhileSubmitting]=await Promise.all([heldSubmit,racingIssue]);
  succeeded(submittedWhileRotating,'submission during rotation'); succeeded(issuedWhileSubmitting,'rotation during submission');
  assert.equal(await query(`select count(*) from public.public_order_tokens where table_id='${table}' and revoked_at is null;`),'1');
  pass('deterministic token/table lock race: submission and rotation complete without deadlock');
  console.log(`Fresh canonical QR rehearsal: ${checks} checks passed; ${files.length} migrations; image=${image}`);
}

try { await run(); }
finally {
  if (created) {
    const removed=await command(['rm','-f',container]);
    if (removed.code !== 0) console.error(`Disposable container cleanup failed: ${container}: ${removed.stderr}`);
    else console.log('Disposable rehearsal container removed.');
  }
}
