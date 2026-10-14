import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('let passwordRecoveryCooldownTimer ='),source.indexOf('async function initializeAccountFlow('));
function harness(reset=false,valid=true,error=null){
 const nodes=new Map();const get=id=>{if(!nodes.has(id)){const classes=new Set(),attributes=new Map();nodes.set(id,{value:'long-password-123',disabled:false,textContent:'',setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name),removeAttribute:name=>attributes.delete(name),addEventListener:()=>{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},reset(){get('passwordRecoveryNew').value='';get('passwordRecoveryConfirm').value='';}});}return nodes.get(id);};
 let calls=0,cooldown=0;const context={document:{getElementById:get},APP_ROUTE:{area:reset?'reset-password':'forgot-password'},setInterval:()=>1,clearInterval:()=>{},setGatewayVisible:()=>{},setOwnerFlowError:(m)=>get('passwordRecoveryError').textContent=m,window:{addEventListener:()=>{},TableOrderCloud:{getPasswordRecoveryCooldown:()=>cooldown,consumePasswordRecovery:async()=>valid,updatePassword:async()=>{calls++;if(error)throw error;},requestPasswordRecovery:async()=>{calls++;cooldown=60;if(error)throw error;}}}};
 vm.createContext(context);vm.runInContext(functions,context);return {context,get,calls:()=>calls,setCooldown:value=>cooldown=value};
}
let h=harness(true);await h.context.showPasswordRecovery(true);assert.equal(h.get('passwordRecoveryEmail').disabled,true);assert.equal(h.get('passwordRecoveryNew').disabled,false);assert.equal(h.get('passwordRecoveryConfirm').required,true);
await h.context.handlePasswordRecovery({preventDefault(){}});assert.equal(h.calls(),1);assert.match(h.get('passwordRecoverySuccess').textContent,/updated/);assert.equal(h.get('passwordRecoveryNew').value,'');assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));
h=harness(true,false);await h.context.showPasswordRecovery(true);assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));assert.match(h.get('passwordRecoveryDescription').textContent,/expired/);assert.equal(h.calls(),0);
h=harness();await h.context.showPasswordRecovery();await h.context.handlePasswordRecovery({preventDefault(){}});assert.match(h.get('passwordRecoverySuccess').textContent,/If an account is eligible/);
h=harness(true,true,new Error('The passwords do not match.'));await h.context.showPasswordRecovery(true);await h.context.handlePasswordRecovery({preventDefault(){}});assert.match(h.get('passwordRecoveryError').textContent,/match/);assert.equal(h.get('passwordRecoverySubmit').disabled,false);
h=harness(true,true,new Error('PASSWORD_RECOVERY_SESSION_MISSING'));await h.context.showPasswordRecovery(true);await h.context.handlePasswordRecovery({preventDefault(){}});assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));assert.ok(!h.get('passwordRecoveryRetry').classList.contains('hidden'));
h=harness();h.get('passwordRecoverySubmit').disabled=true;await h.context.handlePasswordRecovery({preventDefault(){}});assert.equal(h.calls(),0);
h=harness();h.setCooldown(60);await h.context.showPasswordRecovery();assert.equal(h.get('passwordRecoverySubmit').disabled,true);assert.equal(h.get('passwordRecoveryRetry').getAttribute('aria-disabled'),'true');assert.match(h.get('passwordRecoveryRetry').textContent,/60/);await h.context.handlePasswordRecovery({preventDefault(){}});assert.equal(h.calls(),0,'Shared cooldown prevents UI submission');h.setCooldown(0);h.context.refreshPasswordRecoveryCooldown();assert.equal(h.get('passwordRecoverySubmit').disabled,false);assert.notEqual(h.get('passwordRecoveryRetry').getAttribute('aria-disabled'),'true');
const controls=source.slice(source.indexOf('function renderMobileCustomerControls('),source.indexOf('function showOwnerAuth('));
for (const area of ['forgot-password','reset-password']) {
  const nodes=new Map(['mobileCartDock','mobileBottomNav','mobileCartCount','mobileCartTotal'].map(id=>[id,{hidden:false,classList:{toggle(name,on){nodes.get(id).hidden=on;}}}]));
  const context={document:{getElementById:id=>nodes.get(id)},APP_ROUTE:{area},staffUser:null,activeView:'customer',cartEntries:()=>[],cartTotal:()=>0,money:()=>'$0'};
  vm.createContext(context);vm.runInContext(controls,context);context.renderMobileCustomerControls();assert.equal(nodes.get('mobileBottomNav').hidden,true);assert.equal(nodes.get('mobileCartDock').hidden,true);
}
// Recovery code navigations bypass runtime caching, including offline fallback.
const handlers = new Map();
let fetchResult = 'online', cacheOpens = 0, response;
const worker = {self:{location:{origin:'https://app.aveniq.com.au'},addEventListener:(name,handler)=>handlers.set(name,handler)},URL,fetch:async()=>{if(fetchResult==='offline')throw new Error('offline');return fetchResult;},caches:{open:()=>{cacheOpens++;},match:async()=> 'offline-shell'}};
vm.runInNewContext(readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),worker);
handlers.get('fetch')({request:{method:'GET',mode:'navigate',url:'https://app.aveniq.com.au/reset-password?code=one-time'},respondWith:value=>response=value});
assert.equal(await response,'online');assert.equal(cacheOpens,0);
fetchResult='offline';
handlers.get('fetch')({request:{method:'GET',mode:'navigate',url:'https://app.aveniq.com.au/reset-password?code=one-time'},respondWith:value=>response=value});
assert.equal(await response,'offline-shell');assert.equal(cacheOpens,0);
console.log('Password recovery UI state regressions: PASS');
