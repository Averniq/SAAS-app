import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {runLocalGate,withLocalBrowserCredentials,withLocalGateDatabase,withLocalGateServerCredentials,cleanupLocalGate} from '../scripts/run-local-supabase-integration-gate.mjs';
let checks=0;const pass=x=>{checks++;console.log('PASS '+x)};
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
try{
 await runLocalGate();let db;await withLocalGateDatabase(x=>db=x);let service;await withLocalGateServerCredentials(x=>service=x.serverKey);
 const sql=s=>{const r=spawnSync('docker',['exec','-e','PGPASSWORD=postgres','-i',db,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
 await withLocalBrowserCredentials(async({appUrl,ownerEmail,password})=>{
  assert.equal(new URL(appUrl).hostname,'127.0.0.1');const window={};vm.runInNewContext(await(await fetch(appUrl+'/supabase-config.js')).text(),{window});const key=window.TABLEORDER_SUPABASE.publishableKey;
  const api=async(name,token,body)=>{const r=await fetch(appUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:token===service?service:key,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
  const login=await fetch(appUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email:ownerEmail,password})});const owner=await login.json();assert.ok(owner.access_token);
  const tenant=sql("select id from public.restaurants where slug='sake-street'");const original=readFileSync(new URL('../supabase/migrations/20261018044445_staff_management.sql',import.meta.url),'utf8');
  const fixName=readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(x=>x.endsWith('_staff_invitation_transport_boundary.sql'));const fixed=readFileSync(new URL('../supabase/migrations/'+fixName,import.meta.url),'utf8');
  // RED: restore only the exact reviewed 4159 invitation definitions and their original ACLs inside this disposable DB.
  sql(original.slice(original.indexOf('create or replace function staff_private.reserve_invitation'),original.indexOf('-- Re-declare existing direct-role consumers'))+"grant execute on function public.create_restaurant_invite(uuid,text,text) to authenticated; notify pgrst,'reload schema';");
  await new Promise(r=>setTimeout(r,500));
  const direct=await api('create_staff_invitation',owner.access_token,{p_restaurant_id:tenant,p_email:'red-direct@transport.local',p_role:'staff',p_display_name:'RED',p_request_id:randomUUID()});assert.equal(direct.status,200);assert.ok(direct.data.token);pass('RED reviewed base authenticated client retrieves invitation bearer token directly');
  const target=randomUUID();sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(target)},'red-owner@transport.local',now());`);
  const legacy=await api('create_restaurant_invite',owner.access_token,{p_restaurant_id:tenant,p_email:'red-owner@transport.local',p_role:'owner'});assert.equal(legacy.status,200);assert.ok(legacy.data.token);
  const pointer=sql(`select owner_user_id from public.restaurants where id=${q(tenant)}`);
  sql(`begin;set local role authenticated; select set_config('request.jwt.claim.sub',${q(target)},true);select public.accept_restaurant_invite(${q(legacy.data.token)});commit;`);
  assert.equal(sql(`select owner_user_id from public.restaurants where id=${q(tenant)}`),target);pass('RED reviewed base legacy Owner invitation changes owner pointer');
  sql(`delete from public.staff_management_audit where membership_id in(select id from public.restaurant_staff where user_id=${q(target)});delete from public.restaurant_staff where user_id=${q(target)};update public.restaurants set owner_user_id=${q(pointer)} where id=${q(tenant)};update public.restaurant_invites set status='pending' where token=${q(legacy.data.token)};`);
  sql(fixed);await new Promise(r=>setTimeout(r,500));
  const deny=async(p,label,pattern=/permission denied|STAFF_|INVITATION_|INVALID_/i)=>{const r=await p;assert.ok(r.status>=400,label);assert.match(JSON.stringify(r.data),pattern);pass(label)};
  const base={p_restaurant_id:tenant,p_email:'green@transport.local',p_role:'staff',p_display_name:'Green',p_request_id:randomUUID()};
  await deny(api('create_staff_invitation',owner.access_token,base),'GREEN direct new invitation RPC denied');
  await deny(api('create_restaurant_invite',owner.access_token,{p_restaurant_id:tenant,p_email:'owner-denied@transport.local',p_role:'owner'}),'GREEN direct legacy Owner invitation denied');
  const args={p_actor_user_id:owner.user.id,...base};await deny(api('reserve_staff_invitation_for_delivery',owner.access_token,args),'browser cannot impersonate actor through service transport RPC');
  let r=await api('reserve_staff_invitation_for_delivery',service,args);assert.equal(r.status,200);assert.ok(r.data.token);assert.equal(r.data.delivery_required,true);const first=r.data;pass('trusted transport obtains one ordinary invitation');
  r=await api('reserve_staff_invitation_for_delivery',service,args);assert.equal(r.status,200);assert.equal(r.data.delivery_required,false);assert.equal(r.data.id,first.id);pass('idempotency never redelivers request');
  await deny(api('reserve_staff_invitation_for_delivery',service,{...args,p_request_id:randomUUID()}),'shared cooldown survives trusted transport retries');
  await deny(api('reserve_staff_invitation_for_delivery',service,{...args,p_email:'owner@transport.local',p_request_id:randomUUID(),p_role:'owner'}),'trusted transport cannot provision Owner');
  const foreign=randomUUID();sql(`insert into public.restaurants(id,name,slug,status) values(${q(foreign)},'Foreign transport tenant',${q('transport-'+foreign)},'active');`);
  await deny(api('reserve_staff_invitation_for_delivery',service,{...args,p_restaurant_id:foreign,p_request_id:randomUUID()}),'explicit actor requires current tenant authority');
  const race={...args,p_email:'race@transport.local',p_request_id:randomUUID()};const races=await Promise.all([api('reserve_staff_invitation_for_delivery',service,race),api('reserve_staff_invitation_for_delivery',service,race)]);assert.ok(races.every(x=>x.status===200));assert.equal(races.filter(x=>x.data.delivery_required).length,1);pass('concurrent request ID has exactly one delivery winner');
  r=await api('list_restaurant_team',owner.access_token,{p_restaurant_id:tenant});assert.equal(r.status,200);assert.ok(r.data.invites.length);assert.ok(r.data.invites.every(x=>!Object.keys(x).some(k=>/token|link|url/i.test(k))));pass('team listing never discloses invitation bearer material');
  const accepted=spawnSync('docker',['exec','-e','PGPASSWORD=postgres','-i',db,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(target)},true);select public.accept_restaurant_invite(${q(legacy.data.token)});commit;`,encoding:'utf8'});assert.notEqual(accepted.status,0);assert.match(accepted.stderr,/INVALID_STAFF_ROLE/);assert.equal(sql(`select owner_user_id from public.restaurants where id=${q(tenant)}`),pointer);assert.equal(sql(`select count(*) from public.restaurant_staff where user_id=${q(target)}`),'0');pass('preexisting Owner invitation cannot create ownership or change pointer');
  assert.equal(sql("select has_function_privilege('authenticated','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','EXECUTE'),has_function_privilege('anon','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','EXECUTE'),has_function_privilege('service_role','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','EXECUTE')"),'f|f|t');pass('catalog verifies service-only transport execution grants');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='staff_private' and has_function_privilege('authenticated',p.oid,'EXECUTE')"),'0');pass('all private helper execution denied to browser role');
  const matrix=JSON.parse(sql("select json_agg(json_build_object('function',p.proname,'definer',p.prosecdef,'search_path',p.proconfig,'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','staff_private') and p.proname in ('reserve_staff_invitation_for_delivery','reserve_invitation_for_actor','create_staff_invitation','create_restaurant_invite','accept_restaurant_invite','list_restaurant_team','update_restaurant_staff','revoke_restaurant_invite')"));
  assert.equal(matrix.length,8);for(const fn of matrix){assert.equal(fn.definer,true);assert.ok(fn.search_path.includes('search_path=\"\"'));if(['accept_restaurant_invite','list_restaurant_team','update_restaurant_staff','revoke_restaurant_invite'].includes(fn.function)){assert.equal(fn.authenticated,true);assert.equal(fn.anon,false)}}pass('all eight changed invitation and mutation SECURITY DEFINER contracts have explicit safe search paths and expected browser ACLs');
 });console.log('STAFF TRANSPORT BOUNDARY PASS '+checks);
}finally{await cleanupLocalGate()}
