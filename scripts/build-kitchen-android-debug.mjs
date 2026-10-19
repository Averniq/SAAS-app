import { readFile,writeFile,copyFile,realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateLocalBackend} from './kitchen-local-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);if(![2,4].includes(args.length)||args[0]!=='--workspace'||args.length===4&&args[2]!=='--fault-proxy-port')throw new Error('Use --workspace for an isolated local project');
const workspace=await realpath(path.resolve(root,args[1]));if(!workspace.startsWith(path.join(root,'.kitchen-local')+path.sep))throw new Error('Workspace must be isolated inside .kitchen-local');
const marker=JSON.parse(await readFile(path.join(workspace,'kitchen-local.json'),'utf8'));if(marker.localOnly!==true||!/^aveniq-kitchen-[a-z0-9-]+$/.test(marker.projectId))throw new Error('Local project marker required');
function run(command,argv,options={}){const result=spawnSync(command,argv,{cwd:root,encoding:'utf8',windowsHide:true,...options});if(result.status!==0)throw new Error('Local build command failed: '+path.basename(command));return result.stdout;}
const container=JSON.parse(run('docker',['inspect','supabase_db_'+marker.projectId]))[0];if(container.Config.Labels['com.supabase.cli.project']!==marker.projectId||path.resolve(container.Config.Labels['com.supabase.cli.workdir'])!==workspace)throw new Error('Local Docker project identity mismatch');
const status=JSON.parse(run(path.join(root,'.tools/supabase-2.114.0/supabase.exe'),['status','--workdir',workspace,'-o','json']));
let local=validateLocalBackend({origin:status.API_URL,publishableKey:status.ANON_KEY});if(args.length===4){const port=Number(args[3]);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Explicit local fault-proxy port required');const health=await(await fetch('http://127.0.0.1:'+port+'/__kitchen_fault_health',{signal:AbortSignal.timeout(3000)})).json();if(health.localOnly!==true||health.projectId!==marker.projectId||health.upstream!==local.origin)throw Error('Fault proxy must identify this isolated upstream');local={...local,origin:'http://127.0.0.1:'+port};}
const publicConfig=path.join(workspace,'native-public-config.json');await writeFile(publicConfig,JSON.stringify(local));
run(process.execPath,['scripts/build-site.mjs'],{env:{...process.env,KITCHEN_LOCAL_CONFIG:publicConfig,KITCHEN_NATIVE_DEBUG:'1'}});
run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android']);
await writeFile(path.join(root,'android/capacitor.settings.gradle'),"// Portable dependency path, normalized after Capacitor sync.\ninclude ':capacitor-android'\nproject(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')\n");
await copyFile(path.join(root,'dist/kitchen-print-backend.json'),path.join(root,'android/app/src/main/assets/kitchen-print-backend.json'));
console.log('Android debug assets use only the verified isolated local API; no private status credentials were packaged.');
