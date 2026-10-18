import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));let files=0;
function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const path=join(dir,entry.name);if(entry.isDirectory()){assert.ok(!['node_modules','supabase','tests','artifacts','.git'].includes(entry.name),'Private directory in public artifact');scan(path);continue;}
 const data=readFileSync(path),text=data.toString('utf8');files++;
 assert.ok(!/sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(text),'Private credential material found in '+relative(root,path));
 for(const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
  let payload;try{payload=JSON.parse(Buffer.from(token[0].split('.')[1],'base64url').toString())}catch{continue}
  assert.notEqual(payload.role,'service_role','Privileged JWT found in public artifact');
 }
 assert.ok(!/(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SMTP_PASSWORD)\s*[:=]\s*["'][^"']+["']/.test(text),'Private config assigned in '+entry.name);
 assert.ok(!/^\.env(?:\.|$)/.test(entry.name),'Environment file in public artifact');
}}
scan(root);
const config=readFileSync(new URL('../dist/supabase-config.js',import.meta.url),'utf8');
assert.ok(!/service_role|sb_secret_/.test(config),'Generated browser configuration must be public only');
console.log('PASS public artifact credential/packaging scan: '+files+' files; no private credentials or backend/test sources');
