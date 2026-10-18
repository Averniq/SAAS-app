import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';


// Isolated real Chrome. Auth and REST terminate in a localhost mock; external
// requests and DNS are blocked, so these tests cannot contact Production.
const root = fileURLToPath(new URL('../', import.meta.url));
const user={id:'synthetic-owner',email:'owner@example.com'};
const restaurant={id:'rest-one',slug:'fixture',name:'Synthetic Restaurant',status:'active',is_open:true,theme_config:{},tax_rate:10};
const original={id:'cloud-four',local_id:'local-four',restaurant_id:restaurant.id,table_name:'Table 4',name:'Table 4',table_number:4,sort_order:4,table_token:'synthetic-internal-original'};
const publicOriginal='synthetic-public-original';
let table={...original}, role='owner', failPatch=false, patchCount=0;
const order={id:'70000000-0000-4000-8000-000000000001',local_id:'order-local',restaurant_id:restaurant.id,table_id:original.id,order_number:42,status:'preparing',total:4,subtotal:3.64,tax:.36,created_at:new Date().toISOString(),order_items:[{id:'item-1',menu_item_id:'menu-1',item_name:'Soup',price:4,quantity:1,options:[]}]};
const calls=[];
function session(){return {access_token:'synthetic-normal-token',expires_at:Math.floor(Date.now()/1000)+3600,user};}
const server=createServer(async(req,res)=>{try{
 if(req.url==='/__mock-auth'){
  const chunks=[];for await(const c of req)chunks.push(c);const call=JSON.parse(Buffer.concat(chunks).toString());calls.push(call);
  const url=new URL(call.url), body=call.options.body?JSON.parse(call.options.body):{};let data=[];
  if(url.pathname.endsWith('/platform_admins'))data=[];
  else if(url.pathname.endsWith('/restaurant_staff'))data=[{restaurant_id:restaurant.id,role,restaurants:restaurant}];
  else if(url.pathname.endsWith('/restaurants'))data=[restaurant];
  else if(url.pathname.endsWith('/tables')){
   if(call.options.method==='PATCH'){
    patchCount++;await delay(120);
    if(failPatch){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Synthetic failure'}));return;}
    assert.deepEqual(body,{name:body.name,table_name:body.name},'Rename sends only display names');
    assert.equal(url.searchParams.get('id'),'eq.'+original.id);assert.equal(url.searchParams.get('restaurant_id'),'eq.'+restaurant.id);
    if(['owner','manager'].includes(role))Object.assign(table,body);
    data=['owner','manager'].includes(role)?[table]:[];
   }else data=[table];
  }
  else if(url.pathname.endsWith('/menu_items'))data=[{id:'menu-1',local_id:'m1',name:'Soup',category:'Soups',price:4,is_available:true,tags:[]}];
  else if(url.pathname.endsWith('/orders'))data=[{...order,tables:{local_id:table.local_id,table_name:table.table_name}}];
  else if(url.pathname.endsWith('/list_restaurant_team'))data={members:[],invites:[]};
  else if(url.pathname.endsWith('/get_public_qr_table_token_metadata'))data=[{table_id:table.id,has_active_token:true}];
  else if(url.pathname.endsWith('/get_public_qr_order_context')){
   assert.equal(body.p_token,publicOriginal,'Existing printed URL is reused');
   data={restaurant,table:{id:table.id,name:table.table_name,number:4},menu_items:[{id:'menu-1',name:'Soup',category:'Soups',price:4}],categories:[]};
  }
  else if(url.pathname.includes('/get_sales_report'))data={rows:[],summary:{}};
  else if(url.pathname.includes('/get_table_report'))data={rows:[{table_id:table.id,table_name:table.table_name,sales:4,order_count:1,average_spend:4}]};
  else if(url.pathname.includes('/get_report_dashboard'))data={};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
 }
 let path=new URL(req.url,'http://localhost').pathname;
 if(!/\.(js|css|png|svg|webmanifest|webp)$/.test(path))path='/index.html';
 const data=path==='/supabase-config.js'?'window.TABLEORDER_SUPABASE={url:"https://mock.invalid",publishableKey:"sb_publishable_mock"};':await readFile(join(root,path.startsWith('/vendor/')?'dist'+path:path));
 res.writeHead(200,{'Content-Type':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);
 }catch(error){res.writeHead(500);res.end(JSON.stringify({message:error.message}));}
});
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
  console.error(await evaluate('({staff:staffUser,tables:state.tables,orders:state.orders,status:document.getElementById("cloudSyncDetail")?.textContent})')); throw new Error('Browser state timed out: ' + label);
}

try {
  await readFile(join(root, 'dist/vendor/recovery-auth.js')); // Run npm run build first.
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  profile = await mkdtemp(join(tmpdir(), 'aveniq-tenant-browser-'));
  const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let debugPort;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { debugPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(50); }
  }
  assert.ok(debugPort, 'Chrome did not start; set CHROME_PATH to an installed Chrome executable');
  const pages = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  ws.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id && pending.has(event.id)) {
      const command = pending.get(event.id);
      pending.delete(event.id); clearTimeout(command.timer);
      if (event.error) command.reject(new Error(JSON.stringify(event.error))); else command.resolve(event.result);
    } else if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
   const originalFetch=window.fetch.bind(window);
   window.fetch=(input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    if(url.startsWith('https://mock.invalid/'))return originalFetch('/__mock-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,pagePath:location.pathname,options:{...options,headers:Object.fromEntries(new Headers(options.headers))}})});
    if(new URL(url,location.href).origin!==location.origin)throw new Error('External fetch blocked');
    return originalFetch(input,options);
   };
  `});
  await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['https://*','http://mock.invalid/*']});
  async function navigate(path){await send('Page.navigate',{url:origin+path});await waitFor('document.readyState === "complete" && Boolean(window.TableOrderCloud)','page load');}
  await navigate('/login');
  await mkdir(join(root,'artifacts/table-rename'),{recursive:true});
  for(const width of [375,768,1280]){
   table={...original};role='owner';failPatch=false;
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
   await evaluate('localStorage.clear();localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');
   await navigate('/dashboard/fixture/dashboard');
   await waitFor('Boolean(staffUser) && state.tables.length===1 && state.orders.some(o=>o.cloudId=== "70000000-0000-4000-8000-000000000001")','staff/cloud orders');
   await evaluate('setView("setup");document.querySelector("[data-rename-table]").click()');
   await waitFor('Boolean(document.getElementById("tableRenameInput"))','rename form');
   await evaluate('document.getElementById("tableRenameInput").value="   ";document.querySelector("[data-table-rename-form]").requestSubmit()');
   assert.match(await evaluate('document.getElementById("tableRenameError").textContent'),/Enter a table name/);
   await evaluate('document.querySelector("[data-cancel-table-rename]").click()');
   assert.equal(await evaluate('Boolean(document.querySelector("[data-table-rename-form]"))'),false,'Cancel closes without request');
   await evaluate('document.querySelector("[data-rename-table]").click();document.getElementById("tableRenameInput").value="  Patio 1  ";document.querySelector("[data-table-rename-form]").requestSubmit()');
   assert.equal(await evaluate('state.tables[0].name'),'Table 4','Old name remains until cloud confirms');
   await waitFor('state.tables[0].name==="Patio 1"','confirmed rename');
   assert.deepEqual({...table,name:original.name,table_name:original.table_name},original,'Backend identity and internal token unchanged');
   assert.equal(await evaluate('state.orders.find(o=>o.cloudId==="70000000-0000-4000-8000-000000000001").tableId'),'local-four','Open order keeps table');
   await evaluate('setView("kitchen")');assert.match(await evaluate('document.getElementById("kitchenBoard").textContent'),/Patio 1/);
   await evaluate('setView("frontdesk")');assert.match(await evaluate('document.getElementById("frontTableList").textContent'),/Patio 1/);
   await evaluate('setView("reports");activeReportTab="tables";loadReports({refreshDashboard:true})');
   await waitFor('!reportLoading','reports refresh');assert.match(await evaluate('document.getElementById("reportWorkspace").textContent'),/Patio 1/);
   await evaluate('setView("setup");document.querySelector("[data-rename-table]").click()');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow');
   await evaluate('document.getElementById("tableRenameInput").scrollIntoView({behavior:"instant",block:"center"})');
   const screen=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'artifacts/table-rename/rename-'+width+'.png'),Buffer.from(screen.data,'base64'));
   await evaluate('document.querySelector("[data-cancel-table-rename]").click()');
   failPatch=true;await evaluate('document.querySelector("[data-rename-table]").click();document.getElementById("tableRenameInput").value="Not saved";document.querySelector("[data-table-rename-form]").requestSubmit()');
   await waitFor('Boolean(tableRenameDraft?.error)','failed save');assert.equal(await evaluate('state.tables[0].name'),'Patio 1');failPatch=false;
   await evaluate('document.querySelector("[data-cancel-table-rename]").click()');
   // A user-controlled display name must render as text on every consumer.
   const unsafe='<img src=x onerror="window.renameXss=true">';table.name=table.table_name=unsafe;
   await evaluate('state.tables[0].name='+JSON.stringify(unsafe)+';render();setView("kitchen");setView("frontdesk")');
   assert.equal(await evaluate('Boolean(window.renameXss || document.querySelector("#kitchenBoard img[src=x],#frontTableList img[src=x],#invoicePanel img[src=x]"))'),false,'Renamed label cannot inject markup');
   table.name=table.table_name='Patio 1';
   await evaluate('localStorage.clear()');await navigate('/order/'+publicOriginal);
   await waitFor('state.tables[0]?.name==="Patio 1"','same printed QR resolves renamed table');
   assert.equal(await evaluate('document.getElementById("customerTableName").textContent'),'Patio 1');
   assert.equal(await evaluate('state.tables[0].cloudId'),'cloud-four');
   console.log('PASS rename/cloud confirmation, Kitchen/Front Desk/Reports/customer QR and layout at '+width+'px');
  }
  for(const deniedRole of ['staff','cashier','kitchen']){
   role=deniedRole;await evaluate('localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');await navigate('/dashboard/fixture/dashboard');
   await waitFor('Boolean(staffUser) && state.tables.length===1','role startup');
   await evaluate('renderTableAdmin()');assert.equal(await evaluate('document.querySelectorAll("[data-rename-table]").length'),0,'Unauthorized role has no rename');
   const before=patchCount;await evaluate('startTableRename(state.tables[0].id)');assert.equal(patchCount,before,'Unauthorized invocation sends no PATCH');
  }
  assert.ok(!calls.some(c=>/issue_public_qr|revoke|rotate/.test(c.url)),'Rename never invokes QR mutation');
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
