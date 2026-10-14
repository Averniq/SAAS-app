import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const stateSection=app.slice(app.indexOf('const issuedQrUrls ='),app.indexOf('const qrMath ='));
const exportSection=app.slice(app.indexOf('function downloadQrPng('),app.indexOf('function renderBrand('));
function harness(){
 const tables=[{id:'t1',cloudId:'c1',name:'Table <One>',hasActivePublicQrToken:true},{id:'t2',cloudId:'c2',name:'Table Two',hasActivePublicQrToken:true}];
 const events={downloads:[],prints:0,issued:0,confirms:0,toasts:[],blobs:[],draws:[],printHtml:[]};
 const elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{id,textContent:'',disabled:false,open:false,classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false},focus(){},addEventListener(){},setAttribute(){},querySelector(){return null}});return elements.get(id);}
 const canvas={width:240,height:240,dataset:{qrTable:'t1'},toDataURL:()=> 'data:image/png;base64,c3ludGhldGlj',getContext:()=>new Proxy({},{get:()=>()=>{}})};
 const document={getElementById:element,querySelectorAll:()=>tables.map(t=>({...canvas,dataset:{qrTable:t.id}})),createElement(tag){if(tag==='canvas')return {...canvas};return {click(){events.downloads.push({href:this.href,download:this.download});},remove(){}}},body:{appendChild(){}}};
 const context=vm.createContext({document,window:{setTimeout(){},location:{href:'https://app.aveniq.com.au/dashboard/sake-street/dashboard'},confirm(){events.confirms++;return true},TableOrderCloud:{async issuePublicQrTableToken(){events.issued++;return {token:'synthetic-public-token'}}}},URL:class extends URL {static createObjectURL(blob){events.blobs.push(blob);return 'blob:synthetic'} static revokeObjectURL(){}},Blob,setTimeout(){},allTables:()=>tables,restaurant:()=>({name:'Restaurant <script>alert(1)</script>',slug:'sake-street'}),staffUser:{role:'owner',restaurantId:'r1'},publicQrTokenMetadataAvailability:'available',showOrderToast:message=>events.toasts.push(message),escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),renderQrCanvases(){},drawQrCanvas(canvas,url){events.draws.push(url);},fullLogoFor:()=>'',setPrintContent(html){events.prints++;events.printHtml.push(html)},printPreparedContent(){},console});
 vm.runInContext(stateSection+'\n'+exportSection,context);
 return {context,tables,events,elements,run:source=>vm.runInContext(source,context)};
}
const h=harness();
h.run('downloadQrPng("t1")');assert.equal(h.events.downloads.length,0,'Missing plaintext never exports blank PNG');
h.run('downloadAllQrCodes();printQrSheet()');assert.equal(h.events.downloads.length,0,'Incomplete set never exports complete sheet');assert.equal(h.events.prints,0,'Incomplete set never prints blank QR cards');
await h.run('issueQrForTable(allTables()[0])');assert.equal(h.events.issued,1);assert.equal(h.run('issuedQrUrls.size'),1);
assert.equal(h.run('pendingQrExport'),true,'Issuance creates unsaved-export obligation');
assert.equal(h.elements.get('qrExportDialog')?.open,true,'Immediate export dialog is mandatory');
await assert.rejects(h.run('issueQrForTable(allTables()[1])'),'Another issuance blocked until operator saves and acknowledges');assert.equal(h.events.issued,1);
assert.equal(h.run('downloadQrPackage()'),false,'Default package rejects partial table set');
assert.equal(h.run('downloadQrPackage({allowPartial:true})'),true,'Explicit current-session subset can be saved');
assert.equal(h.events.downloads.length,1);
const html=await h.events.blobs.at(-1).text();assert.match(html,/data:image\/png;base64,/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/synthetic-public-token/,'Safe offline artifact contains synthetic original URL');
h.run('clearIssuedQrSessionState()');assert.equal(h.run('issuedQrUrls.size'),0);assert.equal(h.run('pendingQrExport'),false);
for(const role of ['staff','cashier','kitchen']){const denied=harness();denied.context.staffUser.role=role;await assert.rejects(denied.run('issueQrForTable(allTables()[0])'));assert.equal(denied.events.issued,0);}
const rotate=harness();rotate.context.window.confirm=()=>false;assert.equal(await rotate.run('issueQrForTable(allTables()[0],{rotate:true})'),'');assert.equal(rotate.events.issued,0,'Cancelled explicit rotation never issues');
const busy=harness();let release;busy.context.window.TableOrderCloud.issuePublicQrTableToken=()=>new Promise(resolve=>{release=resolve});const first=busy.run('issueQrForTable(allTables()[0])');await assert.rejects(busy.run('issueQrForTable(allTables()[1])'),'Concurrent issuance blocked');busy.run('clearIssuedQrSessionState()');release({token:'synthetic-stale-token'});await assert.rejects(first,'Late issuance result cannot repopulate cleared session');assert.equal(busy.run('issuedQrUrls.size'),0);assert.equal(busy.run('pendingQrExport'),false);
const failed=harness();failed.context.window.TableOrderCloud.issuePublicQrTableToken=async()=>{throw new Error('Synthetic network failure')};await assert.rejects(failed.run('issueQrForTable(allTables()[0])'));assert.equal(failed.run('qrIssuanceBusy'),false);assert.equal(failed.run('issuedQrUrls.size'),0);
const complete=harness();complete.run('issuedQrUrls.set("t1","https://example.invalid/order/synthetic-1");issuedQrUrls.set("t2","https://example.invalid/order/synthetic-2")');assert.equal(complete.run('downloadQrPackage()'),true);assert.match(await complete.events.blobs[0].text(),/Complete package/);
complete.context.document.querySelectorAll=()=>[];complete.events.draws.length=0;
complete.run('downloadAllQrCodes()');assert.equal(complete.events.draws.length,2,'Bulk PNG draws both actual QR URLs even without mounted DOM canvases');assert.equal(complete.events.downloads.length,2,'Complete combined PNG is downloadable');
complete.events.draws.length=0;complete.run('printQrSheet()');assert.equal(complete.events.draws.length,2,'Print draws both actual QR URLs even without mounted DOM canvases');assert.equal(complete.events.prints,1);assert.equal((complete.events.printHtml[0].match(/class="print-qr-card"/g)||[]).length,2,'No QR print card omitted');assert.match(complete.events.printHtml[0],/synthetic-1/);assert.match(complete.events.printHtml[0],/synthetic-2/);


const metadataFailure=harness();
await metadataFailure.run('issueQrForTable(allTables()[0])');
metadataFailure.run('publicQrTokenMetadataAvailability="unavailable"');
assert.equal(metadataFailure.run('downloadQrPackage({allowPartial:true})'),true,'Metadata outage must not strand saving already issued URLs');
metadataFailure.run('staffUser.role="staff"');
assert.equal(metadataFailure.run('downloadQrPackage({allowPartial:true})'),false,'Role change still denies retained QR export');

console.log('PASS QR export guards, mandatory package, safe offline HTML, role/rotation, session cleanup and metadata failure resilience');
