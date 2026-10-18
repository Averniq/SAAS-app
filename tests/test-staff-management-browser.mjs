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
let role='owner', failUpdate=false, updateDelay=120, updateCount=0, inviteCount=0, passwordCount=0, failAccept=false, teamDelay=0, failInviteResponse=false;
const seedMembers=()=>[
 {restaurant_id:restaurant.id,id:'member-owner',user_id:user.id,email:user.email,display_name:'Restaurant Owner',role:'owner',is_current:true,is_active:true,version:1},
 {restaurant_id:restaurant.id,id:'member-staff',user_id:'synthetic-staff',email:'staff@example.com',display_name:'Alex Staff',role:'staff',is_current:false,is_active:true,version:1},
 {restaurant_id:restaurant.id,id:'member-disabled',user_id:'synthetic-disabled',email:'disabled@example.com',display_name:'Disabled Member',role:'cashier',is_current:false,is_active:false,version:1}
];
let members=seedMembers(), invites=[];
const calls=[], inviteRequestIds=new Map();
function session(){return {access_token:'synthetic-normal-token',expires_at:Math.floor(Date.now()/1000)+3600,user};}
const server=createServer(async(req,res)=>{try{
 if(req.url==='/__mock-auth'){
  const chunks=[];for await(const c of req)chunks.push(c);const call=JSON.parse(Buffer.concat(chunks).toString());calls.push(call);
  const url=new URL(call.url), body=call.options.body?JSON.parse(call.options.body):{};let data=[];
  if(url.pathname.endsWith('/auth/v1/user')){if(call.options.method==='PUT')passwordCount++;data={...user,email_confirmed_at:new Date().toISOString()};}
  else if(url.pathname.endsWith('/accept_restaurant_invite')){if(failAccept){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'This invitation is invalid or has expired.'}));return;}assert.equal(body.p_token,'synthetic-invite');data={restaurant_slug:restaurant.slug,restaurant_id:restaurant.id,role:'staff'};}
  else if(url.pathname.endsWith('/platform_admins'))data=[];
  else if(url.pathname.endsWith('/restaurant_staff'))data=[{restaurant_id:restaurant.id,id:'member-owner',restaurant_id:restaurant.id,role,is_active:true,restaurants:restaurant}];
  else if(url.pathname.endsWith('/restaurants'))data=[restaurant];
  else if(url.pathname.endsWith('/tables'))data=[{id:'cloud-four',local_id:'local-four',restaurant_id:restaurant.id,table_name:'Table 4',name:'Table 4',table_number:4}];
  else if(url.pathname.endsWith('/menu_items'))data=[{id:'menu-1',local_id:'m1',name:'Soup',category:'Soups',price:4,is_available:true,tags:[]}];
  else if(url.pathname.endsWith('/orders'))data=[];
  else if(url.pathname.endsWith('/list_restaurant_team')){data=structuredClone({staff:members,invites});await delay(teamDelay);}
  else if(url.pathname.endsWith('/get_public_qr_table_token_metadata'))data=[{table_id:'cloud-four',has_active_token:true}];
  else if(url.pathname.endsWith('/update_restaurant_staff')){
   updateCount++;await delay(updateDelay);
   if(failUpdate){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'This staff member changed. Refresh and try again.'}));return;}
   const member=members.find(m=>m.id===body.p_membership_id);assert.ok(member,'Known target membership');
   assert.equal(body.p_restaurant_id,restaurant.id,'Tenant scoped update');
   Object.assign(member,{display_name:body.p_display_name??member.display_name,role:body.p_role??member.role,is_active:body.p_is_active??member.is_active,version:member.version+1});data={...member};
  }
  else if(url.pathname.endsWith('/staff-invite')){
   inviteCount++;await delay(120);const key=body.requestId;assert.ok(key,'Invitation idempotency key required');if(!inviteRequestIds.has(key)){const invite={id:'invite-'+inviteCount,email:body.email,display_name:body.displayName,role:body.role,expires_at:new Date(Date.now()+86400000).toISOString()};invites.push(invite);inviteRequestIds.set(key,invite);}if(failInviteResponse){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Synthetic ambiguous delivery response'}));return;}data={status:'accepted',delivery:'requested'};
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
 }
 let path=new URL(req.url,'http://localhost').pathname;
 if(!/\.(js|css|png|svg|webmanifest|webp)$/.test(path))path='/index.html';
 const data=path==='/supabase-config.js'?'window.TABLEORDER_SUPABASE={url:"https://mock.invalid",publishableKey:"sb_publishable_mock"};':await readFile(join(root,path.startsWith('/vendor/')?'dist'+path:path));
 res.writeHead(200,{'Content-Type':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);
 }catch(error){res.writeHead(500);res.end(JSON.stringify({message:error.message}));}
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, ws, profile, acceptDialog=true;
const dialogs=[];
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
  console.error(await evaluate('({staff:staffUser,error:document.getElementById("restaurantTeamError")?.textContent,html:document.getElementById("restaurantTeamList")?.textContent})')); throw new Error('Browser state timed out: ' + label);
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
    } else if (event.method === 'Page.javascriptDialogOpening') { dialogs.push(event.params.message); send('Page.handleJavaScriptDialog',{accept:acceptDialog}).catch(()=>{}); } else if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails);
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
  await mkdir(join(root,'artifacts/staff-management'),{recursive:true});
  async function openTeam(width,actorRole='owner'){
   role=actorRole;await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});
   await evaluate('localStorage.clear();localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');
   await navigate('/dashboard/fixture/dashboard');
   await waitFor('Boolean(staffUser) && state.tables.length===1','staff startup');
   await evaluate('setView("setup")');
   if(['owner','manager'].includes(role))await waitFor('document.getElementById("restaurantTeamList").textContent.includes("owner@example.com")','team list');
  }
  for(const width of [375,768,1280]){
   members=seedMembers();invites=[];await openTeam(width);
   assert.ok(await evaluate('Boolean(document.getElementById("disabledRestaurantTeamList"))'),'Disabled members have a separate list');
   assert.equal(await evaluate('document.querySelectorAll("[data-edit-staff=member-owner]").length'),0,'Owner cannot be edited');
   assert.equal(await evaluate('document.querySelectorAll("[data-toggle-staff=member-owner]").length'),0,'Owner cannot be disabled');
   assert.equal(await evaluate('Array.from(document.getElementById("restaurantInviteRole").options).some(o=>o.value==="owner")'),false,'No Owner invitation');
   await evaluate('document.querySelector("[data-edit-staff=member-staff]").click()');
   await waitFor('Boolean(document.querySelector("#staffEditForm"))','edit form');
   const before=updateCount;
   await evaluate('document.querySelector("[name=displayName]").value="   ";document.querySelector("#staffEditForm").requestSubmit()');
   assert.equal(updateCount,before,'Blank name rejected before server call');
   await evaluate('document.querySelector("[name=displayName]").value="  Alex Updated  ";document.querySelector("[name=role]").value="kitchen";document.querySelector("#staffEditForm").requestSubmit();document.querySelector("#staffEditForm")?.requestSubmit()');
   await waitFor('document.getElementById("restaurantTeamList").textContent.includes("Alex Updated")','confirmed edit');
   assert.equal(updateCount,before+1,'Duplicate save blocked');
   assert.equal(members.find(m=>m.id==='member-staff').role,'kitchen');
   await evaluate('document.querySelector("[data-edit-staff=member-staff]").click();document.querySelector("[name=displayName]").value="Not saved";document.querySelector("#staffEditForm").querySelector("[data-cancel-staff]").click()');
   assert.equal(updateCount,before+1,'Cancel has no request');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow');
   await evaluate('document.getElementById("restaurantTeamList").scrollIntoView({behavior:"instant",block:"center"})');
   const screen=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'artifacts/staff-management/staff-management-'+width+'.png'),Buffer.from(screen.data,'base64'));
   await evaluate('document.querySelector("[data-edit-staff=member-staff]").click();document.getElementById("staffEditForm").scrollIntoView({behavior:"instant",block:"center"})');
   const editor=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'artifacts/staff-management/staff-editor-'+width+'.png'),Buffer.from(editor.data,'base64'));
   console.log('PASS Staff Management Owner edit/validation/cancel/layout at '+width+'px');
  }
  // Owner suspension/reactivation confirmations, cancellation, server errors and retry.
  members=seedMembers();await openTeam(1280);
  acceptDialog=false;let before=updateCount;
  await evaluate('document.querySelector("[data-toggle-staff=member-staff]").click()');
  assert.equal(updateCount,before,'Canceled disable has no RPC');
  acceptDialog=true;
  await evaluate('document.querySelector("[data-toggle-staff=member-staff]").click();document.querySelector("[data-toggle-staff=member-staff]")?.click()');
  await waitFor('document.getElementById("disabledRestaurantTeamList").textContent.includes("Alex Staff")','disabled staff list');
  assert.equal(updateCount,before+1,'Duplicate disable blocked');
  assert.equal(members.find(m=>m.id==='member-staff').is_active,false);
  await evaluate('document.querySelector("[data-toggle-staff=member-staff]").click()');
  await waitFor('document.getElementById("restaurantTeamList").textContent.includes("Alex Staff")','reactivated list');
  assert.equal(members.find(m=>m.id==='member-staff').is_active,true);
  // Legacy membership without a display name may have a valid email longer
  // than the display-name limit; status changes must not reuse that email as name.
  const legacy=members.find(m=>m.id==='member-staff');
  legacy.display_name='';legacy.email='a'.repeat(64)+'@'+'b'.repeat(40)+'.example.com';
  const legacyIdentity={id:legacy.id,user_id:legacy.user_id,restaurant_id:legacy.restaurant_id,role:legacy.role};
  await evaluate('loadRestaurantTeam()');
  await evaluate('document.querySelector("[data-toggle-staff=member-staff]").click()');
  await waitFor('document.getElementById("disabledRestaurantTeamList").textContent.includes('+JSON.stringify(legacy.email)+')','legacy long-email member disabled');
  assert.equal(legacy.is_active,false,'Empty display name does not prevent suspension');
  assert.equal(legacy.display_name,'Staff','Status uses bounded safe display-name fallback');
  await evaluate('document.querySelector("[data-toggle-staff=member-staff]").click()');
  await waitFor('document.getElementById("restaurantTeamList").textContent.includes('+JSON.stringify(legacy.email)+')','legacy long-email member reactivated');
  assert.equal(legacy.is_active,true);
  assert.deepEqual({id:legacy.id,user_id:legacy.user_id,restaurant_id:legacy.restaurant_id,role:legacy.role},legacyIdentity,'Status retains membership, tenant, user and role identities');
  legacy.display_name='Alex Staff';legacy.email='staff@example.com';await evaluate('loadRestaurantTeam()');
  failUpdate=true;await evaluate('document.querySelector("[data-edit-staff=member-staff]").click();document.querySelector("[name=displayName]").value="Retry Name";document.getElementById("staffEditForm").requestSubmit()');
  await waitFor('!document.querySelector("#staffEditForm button[type=submit]")?.disabled','server error releases editor');
  assert.equal(members.find(m=>m.id==='member-staff').display_name,'Alex Staff','Failed edit preserves old name');
  assert.match(await evaluate('document.getElementById("restaurantTeamError").textContent'),/changed|try again|save|Refresh/i);
  failUpdate=false;await evaluate('document.getElementById("staffEditForm").requestSubmit()');
  await waitFor('document.getElementById("restaurantTeamList").textContent.includes("Retry Name")','retry succeeds');
  // User controlled names/emails are inert text, including disabled members and invites.
  members[1].display_name='<img src=x onerror="window.staffXss=true">';
  await evaluate('loadRestaurantTeam()');
  assert.equal(await evaluate('Boolean(window.staffXss || document.querySelector("#restaurantTeamList img,#disabledRestaurantTeamList img"))'),false,'Names cannot inject markup');
  // Owner email invitation uses only public bearer transport to server function.
  before=inviteCount;
  await evaluate('document.getElementById("restaurantInviteName").value="New Member";document.getElementById("restaurantInviteEmail").value="NEW@example.com";document.getElementById("restaurantInviteRole").value="staff";document.getElementById("restaurantInviteForm").requestSubmit();document.getElementById("restaurantInviteForm").requestSubmit()');
  await waitFor('!document.getElementById("createRestaurantInvite").disabled','invitation request completes');
  assert.equal(inviteCount,before+1,'Duplicate invitation blocked');
  assert.equal(invites.at(-1).email,'new@example.com','Email normalized');
  assert.ok(!calls.some(c=>/auth\/v1\/admin/.test(c.url)),'Browser never calls Auth Admin');
  // An ambiguous transport response reuses the operation key on unchanged retry.
  const countBeforeAmbiguous=invites.length;failInviteResponse=true;
  await evaluate('document.getElementById("restaurantInviteEmail").value="retry@example.com";document.getElementById("restaurantInviteForm").requestSubmit()');
  await waitFor('!document.getElementById("createRestaurantInvite").disabled','ambiguous invitation failure');
  const failedRequest=calls.filter(c=>c.url.endsWith('/staff-invite')).at(-1);
  failInviteResponse=false;await evaluate('document.getElementById("restaurantInviteForm").requestSubmit()');
  await waitFor('!document.getElementById("createRestaurantInvite").disabled','idempotent invitation retry');
  const retriedRequest=calls.filter(c=>c.url.endsWith('/staff-invite')).at(-1);
  assert.equal(JSON.parse(failedRequest.options.body).requestId,JSON.parse(retriedRequest.options.body).requestId,'Ambiguous retry preserves operation key');
  assert.equal(invites.length,countBeforeAmbiguous+1,'Ambiguous retry creates only one invitation');
  // Existing Manager invitation rights remain, management actions are Owner only.
  await openTeam(768,'manager');
  assert.equal(await evaluate('document.querySelectorAll("[data-edit-staff],[data-toggle-staff]").length'),0,'Manager cannot edit or disable');
  assert.equal(await evaluate('document.getElementById("createRestaurantInvite").disabled'),false,'Manager invitation remains available');
  await openTeam(375,'staff');
  for(const view of ['customer','kitchen','frontdesk']){
   await evaluate('setView('+JSON.stringify(view)+')');
   assert.equal(await evaluate('activeView'),view,'All-round Staff can open '+view);
  }
  await evaluate('setView("setup")');
  assert.notEqual(await evaluate('activeView'),'setup','Staff cannot open Admin');
  assert.equal(await evaluate('Boolean(document.querySelector("[data-view=setup]:not(.hidden)"))'),false,'Staff has no Admin navigation');
  // A delayed request cannot re-render privileged member state after logout.
  members=seedMembers();await openTeam(1280);updateDelay=350;
  await evaluate('document.querySelector("[data-edit-staff=member-staff]").click();document.querySelector("[name=displayName]").value="Delayed";document.getElementById("staffEditForm").requestSubmit();document.getElementById("staffLogoutButton").click()');
  await delay(500);
  assert.equal(await evaluate('Boolean(staffUser)'),false,'Logout remains logged out after delayed response');
  assert.equal(await evaluate('Boolean(staffEditDraft)'),false,'Delayed result cannot restore privileged editor');
  assert.equal(await evaluate('document.querySelectorAll("[data-edit-staff],[data-toggle-staff],[data-staff-member]").length'),0,'Owner team DOM scrubbed on logout');
  assert.ok(dialogs.some(d=>/disable|access/i.test(d)),'Status change requires explicit confirmation');
  console.log('PASS suspension/reactivation, cancellation, failed-save retry, escaping, invites, Manager/Staff boundaries and stale logout');
  // A pending old team load cannot repopulate data after the session ends.
  await openTeam(1280);teamDelay=300;
  await evaluate('loadRestaurantTeam();document.getElementById("staffLogoutButton").click()');
  await delay(450);teamDelay=0;
  assert.equal(await evaluate('restaurantTeamData.staff.length'),0,'Old team response rejected after logout');
  // Signed-in invite acceptance does not create a second Auth account and can
  // keep its password; optional setup validates confirmation before Auth update.
  role='staff';await evaluate('localStorage.setItem("aveniq-owner-session",'+JSON.stringify(JSON.stringify(session()))+')');
  await navigate('/join/synthetic-invite');
  await waitFor('!document.getElementById("invitePasswordSetupForm").classList.contains("hidden")','authenticated invite setup');
  let passwordBefore=passwordCount;
  await evaluate('document.getElementById("inviteSetupPassword").value="Synthetic-pass-123";document.getElementById("inviteSetupConfirm").value="Different-pass-123";document.getElementById("invitePasswordSetupForm").requestSubmit()');
  await waitFor('document.getElementById("inviteAuthError").textContent.includes("match")','password mismatch feedback');
  assert.equal(passwordCount,passwordBefore,'Mismatch cannot update password');
  await evaluate('document.getElementById("inviteSetupConfirm").value="Synthetic-pass-123";document.getElementById("invitePasswordSetupForm").requestSubmit()');
  await waitFor('location.pathname==="/dashboard/fixture/dashboard" && typeof staffUser!=="undefined" && Boolean(staffUser)','invited staff dashboard');
  assert.equal(passwordCount,passwordBefore+1,'Password updated once through public Auth');
  await navigate('/join/synthetic-invite');
  await waitFor('!document.getElementById("invitePasswordSetupForm").classList.contains("hidden")','existing password continuation');
  passwordBefore=passwordCount;await evaluate('document.getElementById("skipInvitePassword").click()');
  await waitFor('location.pathname==="/dashboard/fixture/dashboard"','keep password dashboard');
  assert.equal(passwordCount,passwordBefore,'Existing account can keep its password');
  assert.ok(!calls.some(c=>/auth\/v1\/signup/.test(c.url)),'Existing account invite does not create a duplicate Auth identity');
  failAccept=true;await navigate('/join/synthetic-invite');
  await waitFor('document.getElementById("inviteAuthError").textContent.includes("expired")','expired invitation feedback');
  assert.equal(await evaluate('document.getElementById("invitePasswordSetupForm").classList.contains("hidden")'),true,'Expired invitation cannot enter setup');
  console.log('PASS existing-account invitation setup, mismatch validation, password update and keep-password continuation');
  assert.equal(await evaluate('document.querySelectorAll("[data-copy-team-invite]").length'),0,'Browser cannot copy raw invitation tokens');
  assert.ok(!calls.some(c=>/create_staff_invitation|create_restaurant_invite|reserve_staff_invitation_for_delivery/.test(c.url)),'Browser never directly reserves raw-token invitations');
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
