import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cloudSource = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const continuation = appSource.slice(appSource.indexOf('async function continueOwnerSession()')).match(/^async function continueOwnerSession\(\) \{[\s\S]*?\n\}/)[0];
const member = (slug, name = slug) => ({id:'staff-'+slug, restaurant_id:'restaurant-'+slug, role:'manager', restaurants:{id:'restaurant-'+slug,slug,name,status:'active'}});
const user = {id:'authenticated-user', email:'staff@example.invalid'};

function harness({path='/', search='', memberships=[member('sake-street')], admin=false, defaultSlug='demo'} = {}) {
  const calls=[], events=[];
  const storage = new Map([['aveniq-owner-session', JSON.stringify({access_token:'ordinary-login', expires_at:9999999999, user})]]);
  const window = {
    TABLEORDER_SUPABASE:{url:'https://mock.invalid',publishableKey:'sb_publishable_mock',restaurantSlug:defaultSlug},
    location:{pathname:path,search,hash:'',href:'https://app.example.invalid'+path+search},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    history:{replaceState(...args){events.push(['history',...args]);}}
  };
  const fetch = async (url, options={}) => {
    calls.push({url,options});
    assert.equal(options.headers.Authorization,'Bearer ordinary-login','Membership lookups must use authenticated public-client session');
    let data;
    if(url.includes('/restaurant_staff?')) { assert.ok(url.includes('user_id=eq.authenticated-user')); data=memberships; }
    else if(url.includes('/platform_admins?')) data=admin?[{user_id:user.id}]:[];
    else if(url.includes('/restaurants?')) data=[member(path.split('/')[2]).restaurants];
    else throw new Error('Unexpected tenant-specific request before resolution: '+url);
    return new Response(JSON.stringify(data),{status:200});
  };
  const context=vm.createContext({window,URL,URLSearchParams,Date,Map,TextEncoder,console,fetch,APP_ROUTE:{area:'app'},staffUser:null,onboardingRestaurant:null,
    clearIssuedQrSessionState(){events.push(['clear']);},beginPaymentFinancialSession(){events.push(['financial']);},
    showPlatformConsole(master){events.push(['platform',master]);},showRestaurantSelector(entries){events.push(['selector',entries]);},
    setGatewayVisible(value){events.push(['gateway',value]);},loadCloudDataIntoApp(){events.push(['tenant-data']);},checkDatabaseConnection(){events.push(['connection']);},
    renderStaffSession(){events.push(['staff']);},startCloudOrderSync(){events.push(['sync']);},setView(area){events.push(['view',area]);},
    showOwnerAuth(){events.push(['login']);},setOwnerFlowError(message){events.push(['error',message]);}
  });
  vm.runInContext(cloudSource,context);
  vm.runInContext(appSource.match(/^function isUnscopedAccountEntry[^\n]*/m)[0]+'\n'+continuation,context);
  return {cloud:window.TableOrderCloud,window,calls,events,run:()=>vm.runInContext('continueOwnerSession()',context),context};
}

for(const path of ['/', '/login']) {
  for(const search of ['', '?restaurant=demo']) {
    const h=harness({path,search});
    assert.equal(h.cloud.routeContext().restaurantSlug,'',path+' must stay unscoped regardless of default/query tenant');
    await h.run();
    assert.equal(h.window.location.href,'/dashboard/sake-street/dashboard');
    assert.equal(h.calls.filter(call=>call.url.includes('/restaurant_staff?')).length,1);
    assert.ok(!h.events.some(([event])=>['tenant-data','financial','sync','selector'].includes(event)),'Canonical redirect must precede tenant-specific startup');
  }
}
for(const path of ['/', '/login']) {
  const memberships=[member('sake-street','Sake Street'),member('other-tenant','Other Tenant')];
  const h=harness({path,memberships}); await h.run();
  assert.equal(h.window.location.href,'https://app.example.invalid'+path,'Multiple memberships must not arbitrarily redirect');
  const selection=h.events.find(([event])=>event==='selector');
  assert.ok(selection,'Multiple memberships must show an explicit selector');
  assert.deepEqual(JSON.parse(JSON.stringify(selection[1])),memberships);
  assert.ok(!h.events.some(([event])=>['tenant-data','financial','sync'].includes(event)));
}
for(const path of ['/', '/login']) {
  const h=harness({path,memberships:[]}); await h.run();
  assert.ok(h.events.some(([event])=>event==='login'));
  assert.equal(h.events.find(([event])=>event==='error')[1],'This account has not been assigned platform or restaurant access.');
  assert.ok(!h.events.some(([event,...args])=>event==='error'&&String(args).includes('ONBOARDING_REQUIRED')));
}
for(const path of ['/', '/login', '/platform']) {
  const h=harness({path,admin:true}); await h.run();
  assert.ok(h.events.some(([event])=>event==='platform'));
  assert.equal(h.calls.filter(call=>call.url.includes('/restaurant_staff?')).length,0,'Platform-admin precedence must skip membership selection');
}
{
  const h=harness({path:'/dashboard/sake-street/dashboard'});
  const profile=await h.cloud.getStaffProfile();
  assert.equal(profile.restaurantSlug,'sake-street'); assert.equal(profile.restaurantId,'restaurant-sake-street');
  await h.run(); assert.ok(h.events.some(([event])=>event==='tenant-data'));
}
{
  const h=harness({path:'/dashboard/other-tenant/dashboard'});
  await assert.rejects(h.cloud.getStaffProfile(),/This account does not have access to this restaurant/);
  await assert.rejects(h.run(),/This account does not have access to this restaurant/);
  assert.ok(!h.events.some(([event])=>['tenant-data','financial','sync'].includes(event)),'Unauthorized route must not load tenant data');
}
{
  const h=harness();
  await assert.rejects(h.cloud.getStaffProfile(),/TENANT_SELECTION_REQUIRED/,'Direct unscoped tenant-data adapter must still fail closed');
}
console.log('Behavioral app-host membership routing regression: PASS (root/login, selector, onboarding, admin precedence, direct membership authorization, tenant-data gating)');

// Execute the real startup statements, with network entry points observed rather than invoked.
const startup = appSource.slice(appSource.lastIndexOf('\nrenderTabs();'));
const routeHelpers = appSource.slice(0, appSource.indexOf('\nconst DEFAULT_LOGO_SVG'));
for(const path of ['/', '/login']) {
  const h=harness({path,memberships:[member('sake-street'),member('other-tenant')]});
  const observed=[];
  const context={window:h.window,document:{addEventListener(){}},staffUser:null,
    renderTabs(){},bindGlobalActions(){},render(){},
    checkDatabaseConnection(){observed.push('connection');},loadCloudDataIntoApp(){observed.push('tenant-data');},
    initializeStaffAuth(){observed.push('staff-auth');},initializeAccountFlow(){observed.push('account-flow');},
    startCustomerOrderStatusSync(){observed.push('customer-sync');}
  };
  vm.runInNewContext(routeHelpers+'\n'+startup,context);
  assert.deepEqual(observed,['account-flow'],path+' startup must resolve account selection before tenant/customer requests');
}
console.log('Unscoped authenticated startup request gating: PASS');




const friendlyErrors = appSource.slice(appSource.indexOf('function setOwnerFlowError(')).match(/^function setOwnerFlowError\([^\n]*\) \{[\s\S]*?\n\}/)[0];
{
  const node={textContent:'',classList:{toggle(){}}};
  const context={document:{getElementById:()=>node}};
  vm.createContext(context); vm.runInContext(friendlyErrors,context);
  context.setOwnerFlowError('TENANT_SELECTION_REQUIRED');
  assert.equal(node.textContent,'Choose a restaurant to continue.');
  context.setOwnerFlowError('This account does not have access to this restaurant.');
  assert.equal(node.textContent,'This account does not have access to this restaurant.');
}
console.log('Friendly tenant-selection error mapping: PASS');
