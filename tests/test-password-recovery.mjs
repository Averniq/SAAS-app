import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const valid = '#type=recovery&access_token=recovery-token&refresh_token=refresh&expires_in=3600&token_type=bearer';
function harness(path='/reset-password', hash=valid, status=200, stored=null) {
  const calls=[], storage=new Map(stored ? [['aveniq-owner-session', JSON.stringify(stored)]] : []);
  const window={TABLEORDER_SUPABASE:{url:'https://wxdihentihrijtfkmwgq.supabase.co',publishableKey:'sb_publishable_test'},location:{href:'https://preview.example'+path,pathname:path,search:'',hash,origin:'https://preview.example'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},history:{replaceState:()=>{window.location.hash='';}}};
  vm.runInNewContext(source,{window,URLSearchParams,URL,Date,console,fetch:async (url, options)=>{calls.push({url,options});return {ok:status===200,status,text:async()=>JSON.stringify(status===200 ? {id:'user',access_token:'login-token',refresh_token:'login-refresh',expires_in:3600,user:{id:'user'}} : {msg:'Account does not exist'})};}});
  return {cloud:window.TableOrderCloud,window,calls,storage};
}
let h=harness('/forgot-password','');
await h.cloud.requestPasswordRecovery(' Person@Example.com ');
assert.equal(h.calls[0].url,'https://wxdihentihrijtfkmwgq.supabase.co/auth/v1/recover?redirect_to='+encodeURIComponent('https://app.aveniq.com.au/reset-password'));
assert.equal(JSON.parse(h.calls[0].options.body).email,'person@example.com');
for (const status of [400,429,500]) {h=harness('/forgot-password','',status);await h.cloud.requestPasswordRecovery('missing@example.com');}
h=harness();assert.equal(await h.cloud.consumePasswordRecovery(),true);assert.equal(h.window.location.hash,'');assert.equal(h.storage.size,0);
await assert.rejects(()=>h.cloud.updatePassword('short','short'),/12/);
await assert.rejects(()=>h.cloud.updatePassword('long-password-123','different-password'),/match/);
await h.cloud.updatePassword('long-password-123','long-password-123');
assert.equal(h.calls.find(call => call.options.method === 'PUT').options.method,'PUT');assert.equal(h.calls.find(call => call.options.method === 'PUT').options.headers.Authorization,'Bearer recovery-token');
assert.deepEqual(JSON.parse(h.calls.find(call => call.options.method === 'PUT').options.body),{password:'long-password-123'});
await assert.rejects(()=>h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
for (const hash of ['', '#error=access_denied&error_code=otp_expired', valid.replace('type=recovery','type=signup'),valid.replace('&refresh_token=refresh',''),valid.replace('expires_in=3600','expires_in=-1'),valid+'&expires_at=1']) {
 h=harness('/reset-password',hash,200,{access_token:'existing-login',expires_at:9999999999});assert.equal(await h.cloud.consumePasswordRecovery(),false);await assert.rejects(()=>h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);assert.equal(h.window.location.hash,'');
}
h=harness('/reset-password',valid,401);assert.equal(await h.cloud.consumePasswordRecovery(),false);
h=harness();await h.cloud.consumePasswordRecovery();await assert.rejects(()=>h.cloud.updatePassword('', ''),/12/);
h=harness('/signup','');await h.cloud.signUp(' NEW@Example.com ','existing-password');assert.ok(h.calls[0].url.includes('/signup?redirect_to='));assert.equal(JSON.parse(h.calls[0].options.body).email,'new@example.com');
h=harness('/login','');await assert.rejects(()=>h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);

h=harness('/login',valid);h.cloud.consumeAuthRedirect();assert.equal(h.storage.size,0);assert.equal(h.window.location.pathname,'/reset-password');
h=harness('/login','');await h.cloud.signInWithPassword('OWNER@example.com','existing-password');assert.ok(h.calls[0].url.endsWith('/token?grant_type=password'));assert.equal(JSON.parse(h.calls[0].options.body).email,'owner@example.com');assert.equal(h.storage.size,1);
h=harness('/join/invite',valid.replace('type=recovery','type=signup'));assert.ok(h.cloud.consumeAuthRedirect());assert.equal(h.storage.size,1);
for (const file of ['app.js','supabase-client.js','index.html']) {const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(!/sb_secret_[\w-]+/.test(text));for(const match of text.matchAll(/\b[\w-]+\.([\w-]+)\.[\w-]+\b/g)){try{assert.notEqual(JSON.parse(Buffer.from(match[1],'base64url')).role,'service_role');}catch(error){if(error.code==='ERR_ASSERTION')throw error;}}}
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/href="\/forgot-password"[^>]*>Forgot password\?/);
console.log('Password recovery Auth regressions: PASS');
