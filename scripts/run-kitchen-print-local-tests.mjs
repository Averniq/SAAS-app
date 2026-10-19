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
const suites = { access: ['access', 'config'], dispatch: ['dispatch', 'compatibility'], delivery: ['delivery', 'history'], concurrency: ['concurrency'], acceptance: ['acceptance'] };
if (!suites[suite]) throw new Error('Unknown local suite');
if (suite === 'concurrency') {
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
  const explain=`begin; insert into public.kitchen_print_jobs(restaurant_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision) select '${tenant}','${printer}','test','{}','synthetic','Kitchen',1 from generate_series(1,10000); analyze public.kitchen_print_jobs; explain(analyze,buffers) select id from public.kitchen_print_jobs where restaurant_id='${tenant}' and state in('queued','retry_wait') and next_attempt_at<=clock_timestamp() order by created_at,id limit 1; rollback;`;
  console.log(docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1'],explain));
  process.exit(0);
}
for (const name of suites[suite]) {
  const sql = await readFile(path.join(root, `tests/sql/kitchen-printing-${name}.sql`), 'utf8');
  process.stdout.write(docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], sql));
}
console.log(`PASS local ${suite}; isolated project ${marker.projectId}`);

