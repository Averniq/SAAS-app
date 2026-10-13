import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('async function showPasswordRecovery('),source.indexOf('async function initializeAccountFlow('));
function harness(reset=false,valid=true,error=null){
 const nodes=new Map();const get=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{value:'long-password-123',disabled:false,textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},reset(){get('passwordRecoveryNew').value='';get('passwordRecoveryConfirm').value='';}});}return nodes.get(id);};
 let calls=0;const context={document:{getElementById:get},APP_ROUTE:{area:reset?'reset-password':'forgot-password'},setGatewayVisible:()=>{},setOwnerFlowError:(m)=>get('passwordRecoveryError').textContent=m,window:{TableOrderCloud:{consumePasswordRecovery:async()=>valid,updatePassword:async()=>{calls++;if(error)throw error;},requestPasswordRecovery:async()=>{calls++;if(error)throw error;}}}};
 vm.createContext(context);vm.runInContext(functions,context);return {context,get,calls:()=>calls};
}
let h=harness(true);await h.context.showPasswordRecovery(true);assert.equal(h.get('passwordRecoveryEmail').disabled,true);assert.equal(h.get('passwordRecoveryNew').disabled,false);assert.equal(h.get('passwordRecoveryConfirm').required,true);
await h.context.handlePasswordRecovery({preventDefault(){}});assert.equal(h.calls(),1);assert.match(h.get('passwordRecoverySuccess').textContent,/updated/);assert.equal(h.get('passwordRecoveryNew').value,'');assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));
h=harness(true,false);await h.context.showPasswordRecovery(true);assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));assert.match(h.get('passwordRecoveryDescription').textContent,/expired/);assert.equal(h.calls(),0);
h=harness();await h.context.showPasswordRecovery();await h.context.handlePasswordRecovery({preventDefault(){}});assert.match(h.get('passwordRecoverySuccess').textContent,/If an account is eligible/);
h=harness(true,true,new Error('The passwords do not match.'));await h.context.showPasswordRecovery(true);await h.context.handlePasswordRecovery({preventDefault(){}});assert.match(h.get('passwordRecoveryError').textContent,/match/);assert.equal(h.get('passwordRecoverySubmit').disabled,false);
h=harness(true,true,new Error('PASSWORD_RECOVERY_SESSION_MISSING'));await h.context.showPasswordRecovery(true);await h.context.handlePasswordRecovery({preventDefault(){}});assert.ok(h.get('passwordRecoveryForm').classList.contains('hidden'));assert.ok(!h.get('passwordRecoveryRetry').classList.contains('hidden'));
h=harness();h.get('passwordRecoverySubmit').disabled=true;await h.context.handlePasswordRecovery({preventDefault(){}});assert.equal(h.calls(),0);
const controls=source.slice(source.indexOf('function renderMobileCustomerControls('),source.indexOf('function showOwnerAuth('));
for (const area of ['forgot-password','reset-password']) {
  const nodes=new Map(['mobileCartDock','mobileBottomNav','mobileCartCount','mobileCartTotal'].map(id=>[id,{hidden:false,classList:{toggle(name,on){nodes.get(id).hidden=on;}}}]));
  const context={document:{getElementById:id=>nodes.get(id)},APP_ROUTE:{area},staffUser:null,activeView:'customer',cartEntries:()=>[],cartTotal:()=>0,money:()=>'$0'};
  vm.createContext(context);vm.runInContext(controls,context);context.renderMobileCustomerControls();assert.equal(nodes.get('mobileBottomNav').hidden,true);assert.equal(nodes.get('mobileCartDock').hidden,true);
}
console.log('Password recovery UI state regressions: PASS');
