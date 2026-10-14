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
const two={id:'rest-two',slug:'second & sushi',name:'Second <Sushi>',status:'active'};
const calls=[];
let memberships=[], platform=false;
function membership(restaurant){return {id:'membership-'+restaurant.id,restaurant_id:restaurant.id,role:'manager',restaurants:restaurant};}
function session(){return {access_token:'mock-normal-token',refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user};}
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/__mock-auth'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const call=JSON.parse(Buffer.concat(chunks).toString());calls.push(call);
   const url=new URL(call.url);let data=[];
   if(url.pathname.endsWith('/token'))data=session();
   else if(url.pathname.endsWith('/user'))data=user;
   else if(url.pathname.endsWith('/platform_admins'))data=platform?[{user_id:user.id}]:[];
   else if(url.pathname.endsWith('/restaurant_staff')){await new Promise(r=>setTimeout(r,40));data=memberships;}
   else if(url.pathname.endsWith('/restaurants'))data=url.searchParams.has('id')?[one]:platform?[one,two]:[one];
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
  }
  let path=new URL(req.url,'http://localhost').pathname;
  if(!/\.(js|css|png|svg|webmanifest)$/.test(path))path='/index.html';
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
  async function fresh(path,entries,{stored=false,admin=false}={}){
   memberships=entries.map(membership);platform=admin;
   await evaluate('localStorage.clear()');
   if(stored)await evaluate('localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');
   calls.length=0;await navigate(path);
   if(!stored){await waitFor('!document.getElementById("ownerAuthPanel").classList.contains("hidden")','login');await evaluate('document.getElementById("ownerEmail").value="staff@example.com";document.getElementById("ownerPassword").value="long-password-123";document.getElementById("ownerAuthForm").requestSubmit()');}
  }
  function assertUnscopedCalls(){
   const premature=calls.filter(call=>['/','/login'].includes(call.pagePath)&&!['/auth/v1/token','/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(new URL(call.url).pathname));
   assert.deepEqual(premature,[],'No tenant-specific startup/data requests before selection');
   assert.ok(!calls.some(call=>call.url.includes('slug=eq.demo')),'Synthetic demo never queried');
  }
  async function layout(label){assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,label+': horizontal overflow');}
  await navigate('/login');
  for(const width of [375,768,1280]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
   for(const path of ['/','/login'])for(const stored of [false,true]){
    await fresh(path,[one],{stored});
    await waitFor('location.pathname === "/dashboard/sake-street/dashboard"','one membership canonical redirect');
    await waitFor('document.getElementById("accountGateway").classList.contains("hidden")','authorized dashboard');
    assertUnscopedCalls();await layout('canonical dashboard');
   }
   for(const path of ['/','/login']){
    await fresh(path,[one,two]);
    await waitFor('document.getElementById("restaurantSelectionPanel") && !document.getElementById("restaurantSelectionPanel").classList.contains("hidden")','explicit tenant selector');
    assert.equal(await evaluate('location.pathname'),path,'Multiple memberships do not auto-select');
    assert.equal(await evaluate('document.activeElement.id'),'restaurantSelectionTitle','Selector heading receives accessible focus');
    assert.equal(await evaluate('document.getElementById("restaurantSelectionList").getAttribute("aria-label")'),'Available restaurants');
    const links=await evaluate('Array.from(document.querySelectorAll("#restaurantSelectionList a")).map(a=>({href:a.getAttribute("href"),text:a.textContent.trim(),height:a.getBoundingClientRect().height}))');
    assert.equal(links.length,2);
    assert.deepEqual(links.map(a=>a.href),['/dashboard/sake-street/dashboard','/dashboard/second%20%26%20sushi/dashboard']);
    assert.ok(links[1].text.includes('Second <Sushi>'),'Restaurant name safely rendered as text');
    assert.ok(links.every(a=>a.height>=40),'Selector targets support touch');
    assertUnscopedCalls();await layout('tenant selector');
    assert.doesNotMatch(await evaluate('document.body.innerText'),/TENANT_SELECTION_REQUIRED/);
    await evaluate('document.querySelector("#restaurantSelectionList a").click()');
    await waitFor('location.pathname === "/dashboard/sake-street/dashboard"','explicit selector navigation');
   }
   await fresh('/',[]);
   await waitFor('document.getElementById("ownerAuthError").textContent.includes("This account has not been assigned platform or restaurant access.")','zero memberships existing account message');
   assertUnscopedCalls();await layout('account access message');
   await fresh('/dashboard/sake-street/dashboard',[one]);
   await waitFor('document.getElementById("accountGateway").classList.contains("hidden")','authorized direct dashboard');
   for(let attempt=0;attempt<100&&!calls.some(call=>new URL(call.url).pathname==='/rest/v1/restaurants');attempt++)await delay(30);
   assert.ok(calls.some(call=>new URL(call.url).pathname==='/rest/v1/restaurants'),'Authorized route loads tenant');
   await fresh('/dashboard/unauthorized/dashboard',[one]);
   await waitFor('document.getElementById("ownerAuthError").textContent.includes("This account does not have access to this restaurant.")','unauthorized direct route denied');
   assert.equal(calls.filter(call=>call.pagePath==='/dashboard/unauthorized/dashboard'&&!['/auth/v1/token','/auth/v1/user','/rest/v1/platform_admins','/rest/v1/restaurant_staff'].includes(new URL(call.url).pathname)).length,0,'Unauthorized route does not load tenant');
   await fresh('/',[one,two],{admin:true});
   await waitFor('!document.getElementById("platformConsole").classList.contains("hidden")','platform admin precedence');
   assert.equal(await evaluate('location.pathname'),'/platform','Platform admin retains console flow');
   assert.equal(calls.filter(call=>new URL(call.url).pathname==='/rest/v1/restaurant_staff').length,0,'Platform admin precedes membership selection');
   await layout('platform console');
   console.log('PASS tenant routing browser and UX at '+width+'px');
  }
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
  console.log('PASS root/login login and stored-session routing; explicit selector; account access; direct authorization; platform precedence; scoped request isolation at 375/768/1280.');
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
