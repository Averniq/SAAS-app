import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';


// Isolated real Chrome. Auth and REST terminate in a localhost mock; external
// requests and DNS are blocked, so these tests cannot contact Production.
const root = fileURLToPath(new URL('../', import.meta.url));
const user = {id:'c48666ef-d71d-4d0e-a141-68221e8cfe11',email:'staff@example.com'};
const one={id:'rest-one',slug:'sake-street',name:'Sake Street',status:'active'};
const calls=[];
let memberships=[], platform=false, failurePath="";
let holdApp=false, releaseApp=null, heldApp=false, holdMembership=false, releaseMembership=null, heldMembership=false, holdData=false, releaseData=null, heldData=false;
function membership(restaurant){return {id:'membership-'+restaurant.id,restaurant_id:restaurant.id,role:'manager',restaurants:restaurant};}
function session(){return {access_token:'mock-normal-token',refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user};}
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/__mock-auth'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const call=JSON.parse(Buffer.concat(chunks).toString());calls.push(call);
   const url=new URL(call.url);let data=[];
   if(failurePath&&url.pathname.endsWith(failurePath)){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Restaurant access is temporarily unavailable. Please try again.'}));return;}
   if(url.pathname.endsWith('/token'))data=session();
   else if(url.pathname.endsWith('/user'))data=user;
   else if(url.pathname.endsWith('/platform_admins'))data=platform?[{user_id:user.id}]:[];
   else if(url.pathname.endsWith('/restaurant_staff')){if(holdMembership){heldMembership=true;await new Promise(r=>releaseMembership=r);}data=memberships;}
   else if(url.pathname.endsWith('/rpc/get_public_qr_order_context'))data={restaurant:{...one,is_open:true,tax_rate:10},table:{id:'table-six',name:'Table 6',number:6},menu_items:[],categories:[]};
   else if(url.pathname.endsWith('/restaurants'))data=url.searchParams.has('id')?[one]:[one];
   if(holdData&&!['/auth/v1/token','/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(url.pathname)){heldData=true;await new Promise(r=>{const prior=releaseData;releaseData=()=>{prior?.();r();};});}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
  }
  let path=new URL(req.url,'http://localhost').pathname;
  if(!/\.(js|css|png|svg|webmanifest)$/.test(path))path='/index.html';
  if(path==='/app.js'&&holdApp){heldApp=true;await new Promise(r=>releaseApp=r);}
  const data=path==='/supabase-config.js'?'window.TABLEORDER_SUPABASE={url:"https://mock.invalid",publishableKey:"sb_publishable_mock",restaurantSlug:"demo"};':await readFile(join(root,path.startsWith('/vendor/')?'dist'+path:path));
  res.writeHead(200,{'Content-Type':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}
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
  throw new Error('Browser state timed out: ' + label);
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
   window.__startupCustomerPaints=JSON.parse(sessionStorage.getItem("__startupCustomerPaints")||"[]");
   function sampleCustomerPaint(){
    const e=document.getElementById('customer');
    if(!location.pathname.startsWith('/order/')&&e&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden'){window.__startupCustomerPaints.push({path:location.pathname,text:e.innerText.slice(0,180)});sessionStorage.setItem('__startupCustomerPaints',JSON.stringify(window.__startupCustomerPaints));}
    requestAnimationFrame(sampleCustomerPaint);
   }
   requestAnimationFrame(sampleCustomerPaint);
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
  const visible = id => evaluate('(()=>{const e=document.getElementById('+JSON.stringify(id)+');return Boolean(e&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=="hidden");})()');
  async function neutral(label){
   const text=await evaluate('document.body.innerText');
   assert.match(text,/Aveniq/,label+': branded loading');
   assert.match(text,/Loading Aveniq/i,label+': neutral first-paint loading');
   assert.doesNotMatch(text,/SCANNED TABLE|Link unavailable|Dashboard catalogue loading|Ordering Closed|Cart|Customer|Demo Restaurant/i,label+': no customer/default shell');
   assert.equal(await visible('customer'),false,label+': customer view hidden');
   assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,label+': no horizontal overflow');
  }
  async function begin(path,stored=true){
   await evaluate('localStorage.clear();sessionStorage.removeItem("__startupCustomerPaints")');
   if(stored)await evaluate('localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');
   memberships=[membership(one)];platform=false;calls.length=0;
   holdApp=true;heldApp=false;releaseApp=null;
   await send('Page.navigate',{url:origin+path});
   for(let n=0;n<100&&!heldApp;n++)await delay(30);
   assert.ok(heldApp,'App script is held before execution');
   await neutral(path+' before app execution');
   assert.equal(calls.length,0,'No Auth/customer/tenant request before script startup');
  }
  for(const width of [375,768,1280]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
   for(const path of ['/dashboard/sake-street/dashboard','/','/login']){
    await begin(path);holdMembership=true;heldMembership=false;
    holdApp=false;releaseApp();
    for(let n=0;n<100&&!heldMembership;n++)await delay(30);
    assert.ok(heldMembership,path+': memberships deliberately delayed');
    await neutral(path+' during unresolved membership');
    assert.ok(calls.every(c=>['/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(new URL(c.url).pathname)),'No tenant/customer requests before membership resolution');
    holdData=true;heldData=false;holdMembership=false;releaseMembership();
    for(let n=0;n<100&&!heldData;n++)await delay(30);
    assert.ok(heldData,path+': restaurant data deliberately delayed');
    await neutral(path+' during dashboard data loading');
    holdData=false;releaseData();releaseData=null;
    await waitFor('location.pathname === "/dashboard/sake-street/dashboard" && document.getElementById("setup").classList.contains("active-view") && !document.body.classList.contains("startup-pending")','authorized dashboard directly');
    assert.equal(await visible('customer'),false,'Dashboard never reveals customer view');
    assert.deepEqual(await evaluate('window.__startupCustomerPaints'),[],'No rendered frame contains customer shell during authenticated startup');
   }
   for(const path of ['/','/login']){
    await begin(path,false);holdApp=false;releaseApp();
    await waitFor('!document.getElementById("accountGateway").classList.contains("hidden") && !document.body.classList.contains("startup-pending")','login gateway');
    assert.equal(await visible('customer'),false,'Login hides customer UI');
    assert.deepEqual(await evaluate('window.__startupCustomerPaints'),[],'Login does not paint customer shell');
    assert.ok(calls.every(c=>['/auth/v1/user'].includes(new URL(c.url).pathname)),'Unauthenticated login makes no tenant/customer calls');
   }
   await begin('/',false);holdApp=false;releaseApp();
   await waitFor('!document.getElementById("accountGateway").classList.contains("hidden") && !document.body.classList.contains("startup-pending")','root login form');
   holdMembership=true;heldMembership=false;
   await evaluate('document.getElementById("ownerEmail").value="staff@example.com";document.getElementById("ownerPassword").value="long-password-123";document.getElementById("ownerAuthForm").requestSubmit()');
   for(let n=0;n<100&&!heldMembership;n++)await delay(30);
   assert.ok(heldMembership,'Root form login waits for membership');
   assert.equal(await visible('customer'),false,'Root form login does not reveal customer while authenticating');
   assert.ok(calls.every(c=>['/auth/v1/token','/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(new URL(c.url).pathname)),'Root form login has no unresolved tenant/customer calls');
   holdData=true;heldData=false;holdMembership=false;releaseMembership();
   for(let n=0;n<100&&!heldData;n++)await delay(30);
   assert.ok(heldData,'Root form login waits for canonical dashboard data');
   await neutral('root form login canonical dashboard loading');
   holdData=false;releaseData();releaseData=null;
   await waitFor('location.pathname === "/dashboard/sake-street/dashboard" && document.getElementById("setup").classList.contains("active-view") && !document.body.classList.contains("startup-pending")','root form login direct dashboard');
   assert.deepEqual(await evaluate('window.__startupCustomerPaints'),[],'Root form login never paints customer shell');
   for(const failed of ['/platform_admins','/restaurant_staff']){
    await begin('/dashboard/sake-street/dashboard');failurePath=failed;holdApp=false;releaseApp();
    await waitFor('!document.body.classList.contains("startup-pending") && document.getElementById("ownerAuthError").textContent.includes("temporarily unavailable")','failed account startup shows login error');
    assert.equal(await visible('customer'),false,'Failed startup never reveals customer UI');
    assert.equal(await visible('ownerAuthPanel'),true,'Failed startup releases loader into login gateway');
    assert.deepEqual(await evaluate('window.__startupCustomerPaints'),[],'Failed startup has no customer frames');
    assert.ok(calls.every(c=>['/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(new URL(c.url).pathname)),'Failed authorization lookup has no tenant data calls');
    failurePath='';
   }
   await begin('/order/test-opaque-token',false);holdApp=false;releaseApp();
   await waitFor('document.getElementById("customerTableName").textContent === "Table 6" && !document.body.classList.contains("startup-pending")','public QR ordering resolves');
   assert.equal(await visible('customer'),true,'Public QR ordering retains customer UI');
   assert.ok(calls.some(c=>new URL(c.url).pathname.endsWith('/rpc/get_public_qr_order_context')),'Public QR resolves its real catalogue adapter');
   assert.ok(!calls.some(c=>new URL(c.url).pathname.endsWith('/restaurant_staff')),'Public QR does not load staff memberships');
   console.log('PASS neutral HTML first paint; delayed root/login/dashboard startup; direct dashboard reveal; login/public ordering at '+width+'px');
  }
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
  console.log('PASS startup flash browser regression at 375/768/1280 without Production networking.');
} finally {
  holdApp=false;releaseApp?.();holdMembership=false;releaseMembership?.();holdData=false;releaseData?.();
  for (const command of pending.values()) clearTimeout(command.timer);
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(2000)]);
  }
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve());
  if (profile && resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
