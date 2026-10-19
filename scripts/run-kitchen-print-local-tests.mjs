import { readFile, realpath } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (!args.includes('--local') || args.some(arg => /linked|https?:|postgres:|supabase\.co/.test(arg))) throw new Error('Only --local isolated kitchen fixtures are permitted');
const workspaceArg = args[args.indexOf('--workspace') + 1];
if (!args.includes('--workspace') || !workspaceArg) throw new Error('--workspace must name the isolated materialized candidate');
const workspace = await realpath(path.resolve(root, workspaceArg));
const relative = path.relative(root, workspace);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Local workspace escaped implementation worktree');
const marker = JSON.parse(await readFile(path.join(workspace, 'kitchen-local.json'), 'utf8'));
if (marker.localOnly !== true || !/^aveniq-kitchen-[a-z0-9-]+$/.test(marker.projectId)) throw new Error('Missing isolated local project marker');
const container = `supabase_db_${marker.projectId}`;
function docker(argv, input) {
  const result = spawnSync('docker', argv, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Local Docker operation failed');
  return result.stdout;
}
const info = JSON.parse(docker(['inspect', container]))[0];
if (info.Config.Labels['com.supabase.cli.project'] !== marker.projectId || path.resolve(info.Config.Labels['com.supabase.cli.workdir']) !== workspace) throw new Error('Isolated Docker project/workspace identity mismatch');
const suite = args[args.indexOf('--suite') + 1];
const suites = { access: ['access', 'config', 'safety-followups'], dispatch: ['dispatch', 'compatibility'], delivery: ['delivery', 'history'], concurrency: ['concurrency'], acceptance: ['access','config','safety-followups','dispatch','compatibility','delivery','history','rollback'] };
if (!suites[suite]) throw new Error('Unknown local suite');
if (suite === 'concurrency') {
  const orderTenant=randomUUID(), table=randomUUID();
  docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],`insert into public.restaurants(id,name,slug) values('${orderTenant}','Synthetic order locking','kp-lock-${orderTenant}'); insert into public.tables(id,restaurant_id,table_name,name,local_id,table_token) values('${table}','${orderTenant}','T','T','t','${randomUUID()}');`);
  const commits=await Promise.all([1,2].map(()=>new Promise(resolve=>{
    const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{windowsHide:true});
    let err='';child.stderr.on('data',v=>err+=v);child.on('close',code=>resolve({code,err}));
    child.stdin.end(`begin; set local statement_timeout='10s'; insert into public.orders(restaurant_id,table_id) values('${orderTenant}','${table}'); select pg_sleep(1); commit;`);
  })));
  if(commits.some(result=>result.code!==0)) throw new Error('Concurrent order commits failed: '+commits.map(result=>result.err).join('\n'));
  console.log('PASS two concurrent order commits with printing disabled');
  const tenant = randomUUID(), operator = randomUUID(), printer = randomUUID();
  const devices = Array.from({ length: 20 }, () => randomUUID());
  const setup = `begin; insert into auth.users(id) values('${operator}'); insert into public.restaurants(id,name,slug) values('${tenant}','Synthetic concurrency','kp-concurrency-${tenant}'); insert into public.restaurant_staff(restaurant_id,user_id,role) values('${tenant}','${operator}','kitchen'); insert into public.kitchen_printers(id,restaurant_id,name,ip,updated_by) values('${printer}','${tenant}','Concurrency','192.168.3.60','${operator}'); ${devices.map(id => `insert into public.kitchen_print_devices(id,restaurant_id,operator_id,device_name,secret_hash,last_heartbeat) values('${id}','${tenant}','${operator}','Synthetic concurrency tablet',encode(extensions.digest(repeat('e',64),'sha256'),'hex'),clock_timestamp()); insert into public.kitchen_print_device_printers values('${tenant}','${id}','${printer}');`).join(' ')} select set_config('request.jwt.claims','{"sub":"${operator}","role":"authenticated"}',true); select public.request_kitchen_test_print('${printer}',gen_random_uuid()) from generate_series(1,20); commit;`;
  docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],setup);
  const started = performance.now();
  const results = await Promise.all(devices.map(id => new Promise((resolve,reject) => {
    const child = spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{windowsHide:true});
    let out='',err=''; child.stdout.on('data',v=>out+=v); child.stderr.on('data',v=>err+=v); child.on('error',reject); child.on('close',code=>code===0?resolve(out):reject(new Error(err)));
    child.stdin.end(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${operator}","role":"authenticated"}',true); select coalesce(public.claim_kitchen_printer_job('${id}',repeat('e',64))::text,'NO_CLAIM'); commit;`);
  })));
  if (results.filter(value=>value.includes('claimToken')).length!==1) throw new Error('Expected one live claim among twenty competing sessions');
  const count=docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],`select count(*) from public.kitchen_print_jobs where restaurant_id='${tenant}' and state='leased';`).trim();
  if(count!=='1') throw new Error('Concurrent live claim count differs from one');
  console.log(`PASS twenty competing sessions; one live claim; ${Math.round(performance.now()-started)}ms host elapsed (not a latency guarantee)`);
  const deviceIndex=results.findIndex(value=>value.includes('claimToken'));
  const claim=JSON.parse(results[deviceIndex].trim().split(/\r?\n/).find(value=>value.includes('claimToken')));
  const device=devices[deviceIndex], attempt=randomUUID();
  docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],`begin; select set_config('request.jwt.claims','{"sub":"${operator}","role":"authenticated"}',true); select public.begin_kitchen_print_attempt('${device}',repeat('e',64),'${claim.jobId}','${claim.claimToken}','${attempt}',${claim.configRevision}); update public.kitchen_print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${claim.jobId}'; commit;`);
  let locked;
  const deviceLocked=new Promise(resolve=>locked=resolve);
  const finishing=new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{windowsHide:true});let out='',err='';
    child.stdout.on('data',value=>{out+=value;if(out.includes('DEVICE_LOCKED'))locked();});child.stderr.on('data',value=>err+=value);child.on('error',reject);child.on('close',code=>{locked();code===0?resolve(out):reject(new Error(err));});
    child.stdin.end(`begin; set local statement_timeout='10s'; select set_config('request.jwt.claims','{"sub":"${operator}","role":"authenticated"}',true); select public.kitchen_auth_device('${device}',repeat('e',64)) is not null; select 'DEVICE_LOCKED'; select pg_sleep(1); select public.finish_kitchen_print_attempt('${device}',repeat('e',64),'${claim.jobId}','${claim.claimToken}','${attempt}','transmitted',null); commit;`);
  });
  await deviceLocked;
  docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],`begin; set local statement_timeout='10s'; select public.kitchen_reconcile_jobs('${tenant}'); commit;`);
  const finishOutput=await finishing;
  if(!finishOutput.includes('uncertain'))throw new Error('Late finish downgraded authoritative timeout uncertainty');
  console.log('PASS synchronized device lock / timeout reconciliation / late finish: no deadlock, uncertainty retained');
  const explain=`begin;
create temporary table workload_tenants as select gen_random_uuid() as id from generate_series(1,4);
insert into public.restaurants(id,name,slug) select id,'Synthetic explain','kp-explain-'||id from workload_tenants;
create temporary table workload_printers as select gen_random_uuid() as id,t.id as restaurant_id,n from workload_tenants t cross join generate_series(1,3) n;
insert into public.kitchen_printers(id,restaurant_id,name,ip,updated_by) select id,restaurant_id,'Explain fixture','192.168.5.'||(n+10),'${operator}' from workload_printers;
insert into public.kitchen_print_jobs(restaurant_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision,state,next_attempt_at) select p.restaurant_id,p.id,'test','{}','synthetic','Kitchen',1,case when sample.n%10=0 then 'queued' when sample.n%10=1 then 'retry_wait' else 'transmitted' end,clock_timestamp()+case when sample.n%10=1 then interval '1 hour' else interval '-1 second' end from workload_printers p cross join generate_series(1,850) as sample(n);
analyze public.kitchen_print_jobs;
select restaurant_id as perf_tenant,id as perf_printer from workload_printers limit 1
\\gset
explain(analyze,buffers) select id from public.kitchen_print_jobs j where j.restaurant_id=:'perf_tenant' and j.printer_id=:'perf_printer' and j.state in('queued','retry_wait') and j.next_attempt_at<=clock_timestamp() and j.attempt_count<5 and (j.kind<>'automatic' or exists(select 1 from public.kitchen_print_controls c where c.restaurant_id=j.restaurant_id and c.enabled and c.protocol_version=2)) order by j.created_at,j.id limit 1 for no key update skip locked;
update public.kitchen_print_jobs set state='failed' where restaurant_id=:'perf_tenant' and printer_id=:'perf_printer' and state in('queued','retry_wait');
explain(analyze,buffers) select id from public.kitchen_print_jobs j where j.restaurant_id=:'perf_tenant' and j.printer_id=:'perf_printer' and j.state in('queued','retry_wait') and j.next_attempt_at<=clock_timestamp() and j.attempt_count<5 order by j.created_at,j.id limit 1 for no key update skip locked;
rollback;`;
  console.log(docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],explain));
  process.exit(0);
}
for (const name of suites[suite]) {
  const sql = await readFile(path.join(root, `tests/sql/kitchen-printing-${name}.sql`), 'utf8');
  process.stdout.write(docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], sql));
}
console.log(`PASS local ${suite}; isolated project ${marker.projectId}`);






