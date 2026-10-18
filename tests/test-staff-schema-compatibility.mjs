import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
const catalogPath=process.argv[2];assert.ok(catalogPath,'Provide the read-only catalog snapshot path, never a database URL');
const expected=JSON.parse(readFileSync(catalogPath,'utf8')).catalog;
const name='aveniq-staff-schema-'+randomUUID().slice(0,8);
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:60000});assert.equal(r.status,0,'Local schema verification Docker command failed: '+r.stderr);return r.stdout.trim()};
const sql=q=>run(['exec','-e','PGPASSWORD=postgres','-i',name,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],'set role postgres;\n'+q);
try{
 run(['run','-d','--rm','--name',name,'--network','none','-e','POSTGRES_USER=supabase_admin','-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','-e','JWT_SECRET='+randomBytes(32).toString('hex'),'public.ecr.aws/supabase/postgres:15.8.1.085']);
 let ready=false;for(let i=0;i<90;i++){
  const r=spawnSync('docker',['exec','-e','PGPASSWORD=postgres',name,'psql','-h','127.0.0.1','-X','-qAt','-U','supabase_admin','-d','postgres','-c',"select to_regclass('auth.users') is not null"],{encoding:'utf8'});
  if(r.status===0&&r.stdout.trim()==='t'){ready=true;break}await new Promise(r=>setTimeout(r,500))
 }assert.ok(ready,'Disposable Postgres did not become ready');
 const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
 const added=migrations.filter(n=>/staff_management\.sql$|staff_invitation_transport_boundary\.sql$/.test(n));
 assert.equal(added.length,2,'Exactly two append-only Staff Management migrations');
 for(const n of migrations.filter(n=>!added.includes(n)))sql(readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8'));
 const columns=JSON.parse(sql("select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('restaurant_staff','restaurant_invites','restaurants','orders');"));
 assert.deepEqual(columns,expected.columns,'Approved baseline columns/defaults match current read-only Production catalog');
 const functions=JSON.parse(sql("select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'definition_md5',md5(pg_get_functiondef(p.oid))) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_restaurant_staff','has_restaurant_role','can_manage_restaurant_staff','create_restaurant_invite','accept_restaurant_invite','revoke_restaurant_invite','list_restaurant_team','update_restaurant_order_status','record_authoritative_payment','list_authoritative_payment_operations','claim_initial_restaurant_owner');"));
 assert.deepEqual(functions,expected.functions,'Approved baseline function definitions/ACLs match current read-only Production catalog');
 const policies=JSON.parse(sql("set search_path=public,pg_catalog; select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) order by tablename,policyname) from pg_policies where schemaname='public' and tablename in ('restaurant_staff','restaurant_invites','restaurants','tables','orders');"));
 assert.deepEqual(policies,expected.policies,'Approved baseline RLS matches current read-only Production catalog');
 assert.equal(expected.new_objects_absent,true,'Staff schema has not already been applied in Production');
 for(const n of added)sql(readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8'));
 const grant=JSON.parse(sql("select jsonb_build_object('browser',has_function_privilege('authenticated','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','execute'),'anonymous',has_function_privilege('anon','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','execute'),'server',has_function_privilege('service_role','public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid)','execute'));"));
 assert.deepEqual(grant,{browser:false,anonymous:false,server:true});
 console.log('PASS read-only Production catalog matches approved baseline: '+columns.length+' columns, '+functions.length+' function definitions/ACLs, '+policies.length+' policies; both migrations replay locally and transport grant is server-only');
}finally{spawnSync('docker',['rm','-f',name],{encoding:'utf8'})}
