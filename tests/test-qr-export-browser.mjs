import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';


// Isolated real Chrome. Auth and REST terminate in a localhost mock; external
// requests and DNS are blocked, so these tests cannot contact Production.
const root=fileURLToPath(new URL('../',import.meta.url));
const app=await readFile(join(root,'app.js'),'utf8');
const index=await readFile(join(root,'index.html'),'utf8');
const actual=app.slice(app.indexOf('const issuedQrUrls ='),app.indexOf('const qrMath ='))+'\n'+app.slice(app.indexOf('function downloadQrPng('),app.indexOf('function renderBrand('));
const qrDraw=app.slice(app.indexOf('function drawQrCanvas('),app.indexOf('function staffCanAccess('));
const qrVendor=await readFile(join(root,'dist/vendor/qrcode.js'),'utf8');
const bindings=app.slice(app.indexOf('  document.getElementById("qrExportDialog").addEventListener'),app.indexOf('  document.getElementById("passwordRecoveryForm").addEventListener'));
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/styles.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(await readFile(join(root,'styles.css')));return;}res.writeHead(200,{'Content-Type':'text/html'});res.end(index.replace(/<script[\s\S]*?<\/script>/g,''));}catch(error){res.writeHead(500);res.end('Test resource error');}});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, ws, profile;
let commandId = 0;
const pending = new Map(), exceptions = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await delay(30);
  }
  throw new Error('Browser state timed out: ' + label);
}

try {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 profile=await mkdtemp(join(tmpdir(),'aveniq-qr-export-browser-'));
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:'ignore',windowsHide:true});
 let debugPort;for(let attempt=0;attempt<100;attempt++){try{debugPort=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(50);}}
 assert.ok(debugPort,'Isolated Chrome starts');
 const pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 ws.addEventListener('message',({data})=>{const event=JSON.parse(data);if(event.id&&pending.has(event.id)){const command=pending.get(event.id);pending.delete(event.id);clearTimeout(command.timer);if(event.error)command.reject(new Error(JSON.stringify(event.error)));else command.resolve(event.result);}else if(event.method==='Runtime.exceptionThrown')exceptions.push(event.params.exceptionDetails);});
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 for(const width of [375,768,1280]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});await send('Page.navigate',{url:origin+'/'});await waitFor('document.readyState==="complete"','markup load');
  await evaluate("window.testBlobs=[];const originalBlobUrl=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{testBlobs.push(blob);return originalBlobUrl(blob)};window.testTables=[{id:'t1',cloudId:'c1',name:'Table One',hasActivePublicQrToken:true},{id:'t2',cloudId:'c2',name:'Table Two',hasActivePublicQrToken:true}];window.testDownloads=[];window.testIssues=0;window.testPrints=0;window.staffUser={role:'owner',restaurantId:'r1'};window.publicQrTokenMetadataAvailability='available';window.allTables=()=>testTables;window.restaurant=()=>({name:'Test Restaurant',slug:'test-restaurant'});window.showOrderToast=()=>{};window.escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');window.renderQrCanvases=()=>{};window.drawQrCanvas=(canvas)=>{canvas.width=240;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(10,10,200,200)};window.fullLogoFor=()=>'';window.setPrintContent=()=>{testPrints++};window.printPreparedContent=()=>{};window.TableOrderCloud={issuePublicQrTableToken:async()=>{testIssues++;return {token:'synthetic-public-token'}}};HTMLAnchorElement.prototype.click=function(){testDownloads.push({download:this.download,href:this.href})};");
  await evaluate(qrVendor+'\n'+qrDraw+'\n'+actual+'\n'+bindings);
  await evaluate('downloadQrPng("t1");downloadAllQrCodes();printQrSheet()');assert.equal(await evaluate('testDownloads.length+testPrints'),0,'Missing originals block blank exports');
  await evaluate('issueQrForTable(testTables[0])');
  assert.equal(await evaluate('pendingQrExport'),true,'Issuance requires save');
  assert.equal(await evaluate('(()=>{const event=new Event("cancel",{cancelable:true});document.getElementById("qrExportDialog").dispatchEvent(event);return event.defaultPrevented})()'),true,'Escape cannot dismiss unsaved issuance');
  assert.equal(await evaluate('(()=>{const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()'),true,'Navigation warns while unsaved');
  assert.equal(await evaluate('document.activeElement.id'),'saveQrPackage','Download receives accessible focus');
  assert.equal(await evaluate('document.getElementById("confirmQrSaved").disabled'),true,'Operator cannot acknowledge before downloading');
  await evaluate('document.getElementById("saveQrPackage").click()');
  assert.equal(await evaluate('testDownloads.length'),1);
  const html=await evaluate('testBlobs.at(-1).text()');assert.match(html,/Partial package: other tables are not included/);assert.match(html,/img-src data:/);assert.match(html,/data:image\/png;base64,/);assert.match(html,/synthetic-public-token/);assert.doesNotMatch(html,/<script/,'Offline export has no executable script');
  assert.equal(await evaluate('document.getElementById("confirmQrSaved").disabled'),false,'Download enables acknowledgment');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow');
  const rect=await evaluate('(()=>{const e=document.getElementById("qrExportDialog");const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}})()');assert.ok(rect.width>0&&rect.left>=0&&rect.right<=width,'Export dialog fits '+width+'px');
  await evaluate('document.getElementById("confirmQrSaved").click()');assert.equal(await evaluate('pendingQrExport'),false,'Acknowledgment releases pending state');assert.equal(await evaluate('document.getElementById("qrExportDialog").open'),false,'Acknowledgment closes dialog');
  assert.equal(await evaluate('(()=>{const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()'),false,'Acknowledged export no longer warns');
  await evaluate('issueQrForTable(testTables[1])');assert.equal(await evaluate('testIssues'),2,'Next table issuance is allowed after acknowledgment');assert.equal(await evaluate('document.getElementById("confirmQrSaved").disabled'),true,'Each new issuance needs fresh save');
  console.log('PASS mandatory QR export dialog, incomplete-export guards and layout at '+width+'px');
 }
 assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
} finally {
  for (const command of pending.values()) clearTimeout(command.timer);
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(2000)]);
  }
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve());
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
