import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {validateLocalBackend} from './kitchen-local-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
export async function loadLocalKitchenEnvironment(input){
 const workspace=await realpath(path.resolve(root,input));if(!workspace.startsWith(path.join(root,'.kitchen-local')+path.sep))throw Error('Owned local workspace required');
 const marker=JSON.parse(await readFile(path.join(workspace,'kitchen-local.json'),'utf8'));if(marker.localOnly!==true||!/^aveniq-kitchen-[a-z0-9-]+$/.test(marker.projectId))throw Error('Local project marker required');
 const container='supabase_db_'+marker.projectId;
 function docker(args,sql){const result=spawnSync('docker',args,{input:sql,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw Error(result.stderr||'Local Docker failed');return result.stdout;}
 const info=JSON.parse(docker(['inspect',container]))[0];if(info.Config.Labels['com.supabase.cli.project']!==marker.projectId||path.resolve(info.Config.Labels['com.supabase.cli.workdir'])!==workspace)throw Error('Local Docker identity mismatch');
 const query=sql=>docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],sql).trim();
 const files=(await readdir(path.join(root,'supabase/kitchen-print-candidates'))).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();const candidates=[];
 for(const filename of files){const source=await readFile(path.join(root,'supabase/kitchen-print-candidates',filename),'utf8'),materialized=await readFile(path.join(workspace,'supabase/migrations',filename),'utf8');if(hash(source)!==hash(materialized))throw Error('Applied candidate file differs: '+filename);candidates.push({filename,sha256:hash(source),status:'local-candidate-not-release-approved'});}
 const versions=JSON.parse(query('select coalesce(json_agg(version order by version),\'[]\'::json) from supabase_migrations.schema_migrations;'));const expected=[...marker.canonicalChain.map(entry=>entry.version),...candidates.map(entry=>entry.filename.slice(0,14))].sort();if(JSON.stringify(versions)!==JSON.stringify(expected))throw Error('Local applied migration inventory differs from explicit chain');
 // Existing interactive candidate applications are catalog-verified before updating the local marker.
 marker.candidates=candidates;await writeFile(path.join(workspace,'kitchen-local.json'),JSON.stringify(marker,null,2)+'\n');
 const config=validateLocalBackend(JSON.parse(await readFile(path.join(workspace,'public-config.json'),'utf8')));const origin=new URL(config.origin);if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||Number(origin.port)!==marker.ports.api||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw Error('Explicit isolated loopback API required');
 async function request(route,{token=null,body,method=body===undefined?'GET':'POST',allowError=false}={}){if(!route.startsWith('/auth/v1/')&&!route.startsWith('/rest/v1/'))throw Error('Local API path required');const response=await fetch(origin.origin+route,{method,headers:{apikey:config.publishableKey,Authorization:'Bearer '+(token||config.publishableKey),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});const value=await response.json();if(!response.ok&&!allowError)throw Error('Local HTTP failed '+response.status+': '+(value.code||'API_ERROR'));return {status:response.status,ok:response.ok,value};}
 const rpc=async(name,body,token)=> (await request('/rest/v1/rpc/'+name,{body,token})).value;
 return {root,workspace,marker,container,query,request,rpc,origin:origin.origin,publishableKey:config.publishableKey};
}
