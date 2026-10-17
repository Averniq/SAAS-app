import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('let tableRenameDraft =');
assert.ok(start>=0,'Table Manager must implement confirmed-cloud rename');
const section=app.slice(start,app.indexOf('function renderQrCanvases()',start));
const client=readFileSync(new URL('../supabase-client.js',import.meta.url),'utf8');
const tenant='20000000-0000-4000-8000-000000000001';
function harness(role='owner') {
 const table={id:'local-four',cloudId:'40000000-0000-4000-8000-000000000004',name:'Table 4',number:4,token:'synthetic-internal-token',hasActivePublicQrToken:true};
 const order={id:'order-open',tableId:table.id,status:'Preparing'};
 const state={tables:[table],orders:[order]};const calls=[],toasts=[];
 let response,release,fail=false; const stored=new Map([['aveniq-owner-session',JSON.stringify({access_token:'synthetic-session',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'owner-id'}})]]);
 const window={TABLEORDER_SUPABASE:{url:'https://fixture.invalid',publishableKey:'fixture-public-key'},localStorage:{getItem:k=>stored.get(k)},location:{pathname:'/dashboard/sake-street/dashboard',search:''}};
 const fetch=async(url,options)=>{calls.push({url,options});if(release)await new Promise(done=>{release.done=done});if(fail)throw Error('Synthetic network failure');return {ok:true,text:async()=>JSON.stringify(response===undefined?[{id:table.cloudId,local_id:table.id,restaurant_id:tenant,name:'Patio 1',table_name:'Patio 1'}]:response)}};
 vm.runInNewContext(client,{window,fetch,URLSearchParams});
 const list={innerHTML:'',querySelectorAll:()=>[]};
 const context=vm.createContext({window,state,staffUser:{id:'owner-id',restaurantId:tenant,role},qrSessionGeneration:1,reportRequestId:3,reportLoading:true,reportDashboard:{old:true},reportData:{tables:{old:true}},reportError:'',
 allTables:()=>state.tables,restaurant:()=>({cloudId:tenant}),openOrdersForTable:()=>[order],issuedQrUrl:()=> 'https://fixture.invalid/order/synthetic-public-original',hasUnrecoverablePublicQrToken:()=>false,canManagePublicQrTokens:()=>false,qrCardActionLabel:()=> 'Rotate',
 escapeHtml:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),showOrderToast:m=>toasts.push(m),saveState(){},render(){},document:{getElementById:()=>list},console});
 vm.runInContext(section,context);
 return {context,table,order,state,calls,toasts,list,run:s=>vm.runInContext(s,context),response:v=>response=v,fail:()=>fail=true,hold:()=>release={},release:()=>release.done()};
}
for(const role of ['owner','manager']) {
 const h=harness(role);const before=JSON.parse(JSON.stringify(h.table));const order=JSON.stringify(h.order);
 h.run('startTableRename("local-four")');assert.match(h.list.innerHTML,/Save/);assert.match(h.list.innerHTML,/Cancel/);
 h.hold();const pending=h.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:"  Patio 1  "}}}})');
 await new Promise(setImmediate);assert.equal(h.table.name,'Table 4','Never optimistically rename');
 await h.run('saveTableRename({preventDefault(){}})');assert.equal(h.calls.length,1,'Duplicate submissions blocked');
 h.release();await pending;
 assert.equal(h.table.name,'Patio 1');assert.deepEqual({...h.table,name:before.name},before,'Every identity/QR field preserved');assert.equal(JSON.stringify(h.order),order,'Existing open order association preserved');
 const call=h.calls[0];assert.equal(call.options.method,'PATCH');assert.deepEqual(JSON.parse(call.options.body),{name:'Patio 1',table_name:'Patio 1'});assert.equal(call.options.headers.Prefer,'return=representation');
 const url=new URL(call.url);assert.equal(url.searchParams.get('id'),'eq.'+h.table.cloudId);assert.equal(url.searchParams.get('restaurant_id'),'eq.'+tenant);
 assert.equal(h.run('reportDashboard'),null);assert.equal(h.run('Object.keys(reportData).length'),0);assert.equal(h.run('reportLoading'),false);assert.equal(h.run('reportRequestId'),4,'In-flight old reports fenced');
}
for(const role of ['staff','cashier','kitchen','waitstaff','platform_admin','']) {const h=harness(role);h.run('startTableRename("local-four")');assert.equal(h.run('tableRenameDraft'),null);assert.equal(h.calls.length,0);h.run('renderTableAdmin()');assert.doesNotMatch(h.list.innerHTML,/data-rename-table/);}
for(const name of ['', '   ', '\t\n']) {const h=harness();h.run('startTableRename("local-four")');h.context.input=name;await h.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:input}}}})');assert.equal(h.calls.length,0);assert.equal(h.table.name,'Table 4');assert.match(h.list.innerHTML,/Enter a table name/);}
for(const result of [[],[{id:'foreign',restaurant_id:tenant,name:'Patio 1',table_name:'Patio 1'}],[{id:'40000000-0000-4000-8000-000000000004',restaurant_id:'foreign',name:'Patio 1',table_name:'Patio 1'}]]) {const h=harness();h.response(result);h.run('startTableRename("local-four")');await h.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:"Patio 1"}}}})');assert.equal(h.table.name,'Table 4','Unconfirmed/mismatched response cannot rename');}
for(const mutation of ['staffUser.id="other"','staffUser.restaurantId="other"','staffUser.role="staff"','qrSessionGeneration++','state.tables[0].cloudId="other"']) {const h=harness();h.run('startTableRename("local-four")');h.hold();const pending=h.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:"Patio 1"}}}})');await new Promise(setImmediate);h.run(mutation);h.release();await pending;assert.equal(h.table.name,'Table 4','Stale response rejected: '+mutation);}
const failed=harness();failed.fail();failed.run('startTableRename("local-four")');await failed.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:"Patio 1"}}}})');assert.equal(failed.table.name,'Table 4');assert.match(failed.list.innerHTML,/could not be saved/);
const canceled=harness();canceled.run('startTableRename("local-four");cancelTableRename()');assert.equal(canceled.run('tableRenameDraft'),null);assert.equal(canceled.calls.length,0);
const duplicate=harness();duplicate.state.tables.push({id:'other-local',cloudId:'other-cloud',name:'Patio 1'});duplicate.run('startTableRename("local-four")');await duplicate.run('saveTableRename({preventDefault(){},currentTarget:{elements:{tableDisplayName:{value:"Patio 1"}}}})');assert.equal(duplicate.table.name,'Patio 1','Duplicate display names remain allowed');
console.log('PASS confirmed name-only tenant PATCH, owner/manager, validation, duplicate-submit, failure and stale response guards; identities, QR and open orders preserved');
