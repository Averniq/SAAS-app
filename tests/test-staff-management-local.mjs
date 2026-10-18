import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {runLocalGate,withLocalBrowserCredentials,withLocalGateServerCredentials,withLocalGateDatabase,cleanupLocalGate} from '../scripts/run-local-supabase-integration-gate.mjs';
const migration=readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(x=>x.endsWith('_staff_management.sql'));
const source=readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8');
assert.match(source,/create or replace function public.update_restaurant_staff/i,'audited owner mutation must exist');
const docker=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
let checks=0;const pass=label=>{checks++;console.log('PASS '+label)};
try {
 await runLocalGate();
 let ownDb;await withLocalGateDatabase(db=>{ownDb=db});
 const sql=q=>docker(['exec','-e','PGPASSWORD=postgres','-i',ownDb,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],q);
 let serverKey; await withLocalGateServerCredentials(credentials=>{serverKey=credentials.serverKey});
 const q=x=>"'"+String(x).replaceAll("'","''")+"'";
 await withLocalBrowserCredentials(async({appUrl,ownerEmail,password})=>{
  assert.equal(new URL(appUrl).hostname,'127.0.0.1');
  const config=await(await fetch(appUrl+'/supabase-config.js')).text();// public local config is loaded without logging credentials
  const vm=await import('node:vm');const window={};vm.runInNewContext(config,{window});const key=window.TABLEORDER_SUPABASE.publishableKey;
  const api=async(path,token,body,method='POST')=>{const r=await fetch(appUrl+path,{method,headers:{apikey:key,...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
  const login=async email=>{const r=await api('/auth/v1/token?grant_type=password',null,{email,password});assert.equal(r.status,200);return {token:r.data.access_token,id:r.data.user.id,email}};
  const owner=await login(ownerEmail);const sake=sql("select id from public.restaurants where slug='sake-street'");
  const other=randomUUID();sql(`insert into public.restaurants(id,name,slug,status) values(${q(other)},'Other staff tenant',${q('staff-'+other)},'active');`);
  // Create confirmed synthetic identities locally through SQL; sign-in still uses real local GoTrue.
  const create=async(email,role)=>{const id=randomUUID();sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('00000000-0000-0000-0000-000000000000',${q(id)},'authenticated','authenticated',${q(email)},extensions.crypt(${q(password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''); insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(${q(id)},${q(id)},${q(id)},jsonb_build_object('sub',${q(id)},'email',${q(email)}),'email',now(),now(),now()); insert into public.restaurant_staff(restaurant_id,user_id,role) values(${q(sake)},${q(id)},${q(role)});`);return login(email)};
  const member=await create('managed@staff.local','staff');const manager=await create('manager@staff.local','manager');
  sql(`insert into public.restaurant_staff(restaurant_id,user_id,role) values(${q(other)},${q(member.id)},'staff');`);
  const fingerprint=()=>sql(`select md5(coalesce((select string_agg(concat_ws('|',id,table_id,token_hash),',' order by id) from public.public_order_tokens where restaurant_id=${q(sake)}),''))||'|'||md5(coalesce((select string_agg(concat_ws('|',id,table_id),',' order by id) from public.orders where restaurant_id=${q(sake)}),''));`);const originalFingerprint=fingerprint();
  const membership=JSON.parse(sql(`select row_to_json(s) from public.restaurant_staff s where restaurant_id=${q(sake)} and user_id=${q(member.id)}`));
  const rpc=(name,user,body)=>api('/rest/v1/rpc/'+name,user.token,body);
  const inviteRpc=(user,body)=>api('/rest/v1/rpc/reserve_staff_invitation_for_delivery',serverKey,{p_actor_user_id:user.id,...body});
  const args={p_restaurant_id:sake,p_membership_id:membership.id,p_display_name:'Patio employee',p_role:'cashier',p_is_active:true,p_expected_version:1};
  const deny=async(p,label)=>{const r=await p;assert.ok(r.status>=400,label);assert.doesNotMatch(JSON.stringify(r.data),/PGRST202|PGRST301|schema cache|function.*not find/i,label+' must fail authorization, not missing endpoint');assert.match(JSON.stringify(r.data),/STAFF_|INVALID_|VERSION_|ACCESS_DENIED|ROLE_REQUIRED|INVITATION_|INVITE_/i,label+' expected explicit rejection');pass(label)};
  await deny(rpc('update_restaurant_staff',manager,args),'Manager cannot edit membership');await deny(rpc('update_restaurant_staff',member,args),'Staff cannot edit membership');
  await deny(rpc('update_restaurant_staff',owner,{...args,p_restaurant_id:other}),'cross tenant target denied');await deny(rpc('update_restaurant_staff',owner,{...args,p_role:'owner'}),'owner promotion denied');await deny(rpc('update_restaurant_staff',owner,{...args,p_display_name:'   '}),'blank display name denied');
  await deny(rpc('update_restaurant_staff',owner,{...args,p_display_name:'\t \r\n'}),'whitespace-only display name denied by server');
  await deny(rpc('update_restaurant_staff',owner,{...args,p_display_name:'\u00a0\ufeff'}),'Unicode whitespace-only display name denied by server');
  let r=await rpc('update_restaurant_staff',owner,args);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.id,membership.id);assert.equal(r.data.version,2);pass('Owner changes name and role preserving membership identity');
  await deny(rpc('update_restaurant_staff',owner,args),'stale version denied');
  const races=await Promise.all([rpc('update_restaurant_staff',owner,{...args,p_expected_version:2,p_display_name:'Winner A'}),rpc('update_restaurant_staff',owner,{...args,p_expected_version:2,p_display_name:'Winner B'})]);assert.equal(races.filter(x=>x.status===200).length,1);pass('concurrent membership edits serialize with exactly one version winner');
  // Pre-migration invitations and outstanding manager-issued invites must not restore privileges.
  const staleToken=randomUUID();sql(`insert into public.restaurant_invites(restaurant_id,email,role,invited_by,token) values(${q(sake)},${q(member.email)},'manager',${q(owner.id)},${q(staleToken)});`);
  r=await rpc('update_restaurant_staff',owner,{...args,p_expected_version:3,p_is_active:false});assert.equal(r.status,200);pass('Owner disables access');
  for(const table of ['restaurants','tables','orders','categories','menu_items']){const filter=table==='restaurants'?'id':'restaurant_id';r=await api('/rest/v1/'+table+'?'+filter+'=eq.'+sake,member.token,undefined,'GET');assert.equal(r.status,200);assert.equal(r.data.length,0,table);pass('retained JWT denied protected '+table+' read')}
  r=await api('/rest/v1/restaurants?id=eq.'+other,member.token,undefined,'GET');assert.equal(r.data.length,1);pass('same Auth identity retains other tenant access');
  for(const [name,body] of [['list_restaurant_team',{p_restaurant_id:sake}],['get_report_dashboard',{p_restaurant_id:sake}],['get_public_qr_table_token_metadata',{p_restaurant_id:sake}],['update_restaurant_order_status',{p_restaurant_id:sake,p_order_id:randomUUID(),p_action:'Preparing'}],['list_authoritative_payment_operations',{p_restaurant_id:sake,p_order_id:null}],['record_authoritative_payment',{p_restaurant_id:sake,p_order_id:randomUUID(),p_amount_cents:1,p_method:'Cash',p_reference:'',p_note:'',p_idempotency_key:randomUUID()}]])await deny(rpc(name,member,body),'disabled valid JWT denied '+name);
  await deny(rpc('accept_restaurant_invite',member,{p_token:staleToken}),'preexisting invite cannot restore suspended access');
  await deny(inviteRpc(owner,{p_restaurant_id:sake,p_email:member.email,p_role:'manager',p_display_name:'Existing',p_request_id:randomUUID()}),'invitation cannot reactivate or relabel existing membership');
  r=await rpc('update_restaurant_staff',owner,{...args,p_expected_version:4,p_is_active:true});assert.equal(r.status,200);assert.equal(r.data.version,5);pass('Owner reactivates same membership');
  const ownerId=sql(`select id from public.restaurant_staff where restaurant_id=${q(sake)} and user_id=${q(owner.id)}`);await deny(rpc('update_restaurant_staff',owner,{...args,p_membership_id:ownerId}),'Owner membership immutable including self');
  const inviteArgs={p_restaurant_id:sake,p_email:'new-person@staff.local',p_role:'staff',p_display_name:'New Person',p_request_id:randomUUID()};r=await inviteRpc(manager,inviteArgs);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.delivery_required,true);const initial=r.data;
  r=await inviteRpc(manager,inviteArgs);assert.equal(r.status,200);assert.equal(r.data.id,initial.id);assert.equal(r.data.delivery_required,false);pass('invitation request idempotency prevents duplicate email delivery');
  await deny(inviteRpc(owner,{...inviteArgs,p_request_id:randomUUID()}),'shared invitation cooldown enforced across callers');
  await deny(rpc('accept_restaurant_invite',member,{p_token:initial.token}),'wrong email invitation rejected');
  const audit=JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.staff_management_audit a where restaurant_id=${q(sake)}`));assert.ok(audit.length>=5);assert.ok(audit.every(x=>!JSON.stringify(x).includes(initial.token)));pass('audit written atomically without invitation credentials');
  assert.equal(fingerprint(),originalFingerprint);pass('all public token hashes and historical order-table associations preserved');
  const managerMembership=JSON.parse(sql(`select row_to_json(s) from public.restaurant_staff s where restaurant_id=${q(sake)} and user_id=${q(manager.id)}`));
  r=await rpc('update_restaurant_staff',owner,{...args,p_membership_id:managerMembership.id,p_role:'manager',p_expected_version:1,p_is_active:false});assert.equal(r.status,200);
  await deny(rpc('list_restaurant_team',manager,{p_restaurant_id:sake}),'disabled Manager JWT loses team listing');await deny(inviteRpc(manager,{p_restaurant_id:sake,p_email:'denied@staff.local',p_role:'staff',p_display_name:'Denied',p_request_id:randomUUID()}),'disabled Manager cannot reserve through verified-actor transport');
  r=await api('/rest/v1/restaurant_staff?id=eq.'+membership.id,owner.token,{role:'owner'},'PATCH');assert.ok(r.status>=400);pass('direct membership writes remain ungranted');
  // Fixture-only suspension of an Owner checks authoritative predicates without exposing such a product action.
  sql(`update public.restaurant_staff set is_active=false where id=${q(ownerId)};`);
  await deny(rpc('list_restaurant_team',owner,{p_restaurant_id:sake}),'disabled Owner existing JWT cannot list staff');
  await deny(inviteRpc(owner,{p_restaurant_id:sake,p_email:'disabled-owner@staff.local',p_role:'staff',p_display_name:'Denied',p_request_id:randomUUID()}),'disabled Owner existing JWT cannot invite');
  await deny(rpc('update_restaurant_staff',owner,{...args,p_expected_version:5}),'disabled Owner existing JWT cannot edit');
  sql(`update public.restaurant_staff set is_active=true where id=${q(ownerId)};`);
  pass('Owner fixture restored; no Auth identity or historical record removed');
 });
 console.log('STAFF MANAGEMENT LOCAL PASS '+checks);
}finally{await cleanupLocalGate()}
