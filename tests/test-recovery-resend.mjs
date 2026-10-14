import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { AuthClient } from '@supabase/auth-js';

const source = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const callback = 'https://app.aveniq.com.au/reset-password';
const verifierKey = 'aveniq-password-recovery:mock.invalid-code-verifier';
const cooldownKey = verifierKey + '-resend-after';
const user = {id:'c48666ef-d71d-4d0e-a141-68221e8cfe11', email:'staff@example.com'};
const tick = () => new Promise(resolve => setImmediate(resolve));
function lockManager() {
  const tails = new Map();
  return {request(name, options, callback) {
    if (typeof options === 'function') callback = options;
    if (options?.ifAvailable && tails.has(name)) return Promise.resolve(callback(null));
    const previous = tails.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => callback({name, mode:'exclusive'}));
    tails.set(name, next);
    return next.finally(() => {if(tails.get(name) === next) tails.delete(name);});
  }};
}
function fixture({locks = lockManager()} = {}) {
  const storage = new Map(), calls = [], codes = new Map(), tokens = new Set();
  let time = Date.now(), status = 200, challenge = '', codeIndex = 0, gate = null, logoutGate = null;
  class Clock extends Date {static now() {return time;}}
  const response = (data, code = 200) => new Response(JSON.stringify(data), {status:code, headers:{'Content-Type':'application/json'}});
  function jwt(method) {
    return ['eyJhbGciOiJFUzI1NiJ9', Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(time/1000)+3600,amr:[{method}]})).toString('base64url'),'mock-signature'].join('.');
  }
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({url, options, body});
    if (url.includes('/recover')) {
      assert.equal(new URL(url).searchParams.get('redirect_to'), callback);
      assert.equal(body.code_challenge_method, 's256');
      assert.equal(body.email, 'staff@example.com');
      // Supabase creates/replaces PKCE flow state before email-send rate limiting.
      // All unconsumed email links must match this most recent challenge.
      challenge = body.code_challenge;
      if (gate) await gate;
      if (status === 'network') throw new Error('mock network failure');
      if (status !== 200) return response({msg:'Mock provider failure',code:'mock_failure'},status);
      return response({});
    }
    if (url.includes('grant_type=pkce')) {
      const method = codes.get(body.auth_code);
      codes.delete(body.auth_code);
      if (!method || createHash('sha256').update(body.code_verifier).digest('base64url') !== challenge) return response({msg:'Invalid or expired code',code:'flow_state_not_found'},400);
      const access_token = jwt(method);
      tokens.add(access_token);
      return response({access_token,refresh_token:'mock-refresh',expires_in:3600,token_type:'bearer',user});
    }
    const token = options.headers?.Authorization?.replace('Bearer ','');
    if (url.includes('/user')) {
      if (!tokens.has(token)) return response({msg:'Invalid JWT'},401);
      return response(user);
    }
    if (url.includes('/logout')) {if(logoutGate) await logoutGate;tokens.delete(token);return response({});}
    throw new Error('Unexpected mocked endpoint: '+url);
  };
  function tab() {
    const window = {
      TABLEORDER_SUPABASE:{url:'https://mock.invalid',publishableKey:'sb_publishable_test'},
      AveniqRecoveryAuth:{AuthClient}, crypto:webcrypto, navigator:{locks},
      btoa:value=>Buffer.from(value,'binary').toString('base64'), atob:value=>Buffer.from(value,'base64').toString('binary'),
      location:{pathname:'/reset-password',search:'',hash:'',origin:'https://app.aveniq.com.au',href:callback},
      localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
      history:{replaceState(){window.location.search='';window.location.hash='';}}
    };
    vm.runInNewContext(source,{window,URL,URLSearchParams,Date:Clock,Map,TextEncoder,console,fetch});
    return {cloud:window.TableOrderCloud,window};
  }
  return {storage,calls,tab,
    advance(ms){time+=ms;}, status(value){status=value;},
    pauseLogout(){let resume;logoutGate=new Promise(resolve=>{resume=resolve;});return ()=>{logoutGate=null;resume();};},
    pause(){let resume;gate=new Promise(resolve=>{resume=resolve;});return ()=>{gate=null;resume();};},
    code(tab,method='recovery'){const code='one-time-'+(++codeIndex);codes.set(code,method);tab.window.location.search='?code='+code;return code;},
    invalidate(code){codes.delete(code);},
    recoverCalls(){return calls.filter(call=>call.url.includes('/recover'));}
  };
}

// Original live defect: SDK cleanup on a rate-limited resend erased the first verifier.
for (const failure of [429,400,500,'network']) {
  const f=fixture(), t=f.tab();
  await t.cloud.requestPasswordRecovery(' Staff@Example.com ');
  const original=f.storage.get(verifierKey);
  assert.ok(original,'first request persists verifier');
  const firstCode=f.code(t);
  f.advance(61000);f.status(failure);
  await t.cloud.requestPasswordRecovery('staff@example.com');
  assert.equal(f.storage.get(verifierKey),original,`${failure} must preserve the active verifier and original creation time`);
  assert.equal(f.recoverCalls().length,2);
  assert.equal(f.recoverCalls()[1].body.code_challenge,f.recoverCalls()[0].body.code_challenge);
  assert.equal(await t.cloud.consumePasswordRecovery(),true,`first email exchanges after ${failure} resend`);
  await t.cloud.updatePassword('long-password-123','long-password-123');
  assert.equal(f.storage.has(verifierKey),false);
  assert.equal(f.storage.has(cooldownKey),false);
  t.window.location.search='?code='+firstCode;
  assert.equal(await t.cloud.consumePasswordRecovery(),false,'consumed recovery code cannot replay');
}
console.log('Resend provider failures preserve the verifier and first-email PKCE exchange: PASS');

{
  const f=fixture(),t=f.tab();
  await t.cloud.requestPasswordRecovery('staff@example.com');
  const original=f.storage.get(verifierKey);
  const codes=[f.code(t)];
  for(let index=0;index<3;index++){
    f.advance(61000);
    await t.cloud.requestPasswordRecovery('staff@example.com');
    assert.equal(f.storage.get(verifierKey),original,'resends cannot renew the original lifetime');
    codes.push(f.code(t));
  }
  assert.equal(new Set(f.recoverCalls().map(call=>call.body.code_challenge)).size,1,'successful resends use one stable challenge');
  // Every valid issued code can be independently exchanged in a new callback tab.
  for(const code of codes){
    // A real SDK exchange consumes local verifier. Restore fixture state solely to
    // test each alternate callback against the same pre-consumption browser state.
    f.storage.set(verifierKey,original);
    const callbackTab=f.tab();callbackTab.window.location.search='?code='+code;
    assert.equal(await callbackTab.cloud.consumePasswordRecovery(),true);
    await callbackTab.cloud.updatePassword('long-password-123','long-password-123');
  }
}
console.log('Multiple successful resends use the same verifier without extending its lifetime: PASS');

{
  const f=fixture(),a=f.tab(),b=f.tab();const resume=f.pause();
  const first=a.cloud.requestPasswordRecovery('staff@example.com');
  for(let index=0;index<20&&!f.recoverCalls().length;index++)await tick();
  assert.equal(f.recoverCalls().length,1);
  const second=b.cloud.requestPasswordRecovery('staff@example.com');
  await tick();assert.equal(f.recoverCalls().length,1,'cross-tab simultaneous requests are serialized');
  resume();await Promise.all([first,second]);
  assert.equal(f.recoverCalls().length,1,'queued duplicate observes the shared cooldown');
  assert.ok(a.cloud.getPasswordRecoveryCooldown()>0);
  assert.equal(a.cloud.getPasswordRecoveryCooldown(),b.cloud.getPasswordRecoveryCooldown());
  f.advance(59000);await b.cloud.requestPasswordRecovery('staff@example.com');
  assert.equal(f.recoverCalls().length,1,'cooldown applies in another tab');
  f.advance(2000);await b.cloud.requestPasswordRecovery('staff@example.com');
  assert.equal(f.recoverCalls().length,2);
}
console.log('Cross-tab serialization and shared 60-second cooldown: PASS');

{
  const f=fixture(),t=f.tab();await t.cloud.requestPasswordRecovery('staff@example.com');
  const original=f.storage.get(verifierKey);
  for(let index=0;index<4;index++){f.advance(61000);await t.cloud.requestPasswordRecovery('staff@example.com');assert.equal(f.storage.get(verifierKey),original);}
  const code=f.code(t);f.advance(3600001);
  assert.equal(await t.cloud.consumePasswordRecovery(),false,'expired local recovery fails closed');
  assert.equal(f.storage.has(verifierKey),false,'expiry removes verifier');
  assert.equal(f.storage.has(cooldownKey),false,'expiry removes cooldown state');
  await assert.rejects(()=>t.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
  await t.cloud.requestPasswordRecovery('staff@example.com');
  assert.notEqual(f.storage.get(verifierKey),original,'request after expiry creates new bounded state');
  assert.notEqual(f.recoverCalls().at(-1).body.code_challenge,f.recoverCalls()[0].body.code_challenge);
  t.window.location.search='?code='+code;
  // This old email was invalidated by Supabase, independently of local PKCE state.
  f.invalidate(code);assert.equal(await t.cloud.consumePasswordRecovery(),false);
}
console.log('Bounded verifier lifetime, expiry cleanup and invalidated server tokens: PASS');

{
  const f=fixture(),t=f.tab();await t.cloud.requestPasswordRecovery('staff@example.com');
  const old=f.code(t);f.advance(61000);await t.cloud.requestPasswordRecovery('staff@example.com');
  f.invalidate(old);t.window.location.search='?code='+old;
  assert.equal(await t.cloud.consumePasswordRecovery(),false,'preserved verifier never resurrects Supabase-invalidated email tokens');
  await assert.rejects(()=>t.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
}
console.log('Recovery resend real-SDK regressions: PASS');




// Browsers without cross-tab locking must not send recovery requests or exchange
// codes under an unsafe per-tab-only fallback.
{
  const f=fixture({locks:null}),t=f.tab();
  await t.cloud.requestPasswordRecovery('staff@example.com');
  assert.equal(f.calls.length,0,'unsupported browser cannot start an unserialized recovery request');
  assert.equal(f.storage.size,0);
  f.code(t);
  assert.equal(await t.cloud.consumePasswordRecovery(),false);
  assert.equal(f.calls.length,0,'unsupported browser cannot exchange callback codes');
  await assert.rejects(()=>t.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
}
console.log('Missing cross-tab locks fail closed without Auth requests: PASS');
// An unexpected callback parsing exception must keep the lock until asynchronous
// logout and verifier cleanup finish. A resend in another tab cannot race cleanup.
{
  const f=fixture(), callbackTab=f.tab(), requestTab=f.tab();
  await callbackTab.cloud.requestPasswordRecovery('staff@example.com');
  f.code(callbackTab);
  callbackTab.window.atob=()=>{throw new Error('Mock malformed JWT claims');};
  const resume=f.pauseLogout();
  const consumption=callbackTab.cloud.consumePasswordRecovery();
  for(let index=0;index<30&&!f.calls.some(call=>call.url.includes('/logout'));index++)await tick();
  assert.ok(f.calls.some(call=>call.url.includes('/logout')),'malformed callback reached asynchronous cleanup');
  f.advance(61000);
  try {
    await requestTab.cloud.requestPasswordRecovery('staff@example.com');
    assert.equal(f.recoverCalls().length,1,'another tab cannot dispatch while failed-callback cleanup holds the lock');
  } finally {resume();assert.equal(await consumption,false);}
  assert.equal(f.storage.has(verifierKey),false,'failed callback clears its bounded state');
  await requestTab.cloud.requestPasswordRecovery('staff@example.com');
  assert.equal(f.recoverCalls().length,2,'explicit retry after cleanup obtains the released lock');
  const newVerifier=f.storage.get(verifierKey);
  assert.ok(newVerifier,'new request establishes new bounded state');
  await tick();
  assert.equal(f.storage.get(verifierKey),newVerifier,'completed older cleanup cannot erase the new verifier');
  f.code(requestTab);
  assert.equal(await requestTab.cloud.consumePasswordRecovery(),true,'new verifier remains usable');
  await requestTab.cloud.updatePassword('long-password-123','long-password-123');
  assert.equal(f.storage.has(verifierKey),false);
}
console.log('Thrown callback errors retain the lock through logout and verifier cleanup: PASS');

// The first request may send mail even when its response is lost. Its verifier
// must be usable without claiming a confirmed provider success.
{
  const f=fixture(),t=f.tab();f.status('network');
  await t.cloud.requestPasswordRecovery('staff@example.com');
  assert.ok(f.storage.get(verifierKey));
  assert.ok(t.cloud.getPasswordRecoveryCooldown()>0);
  f.code(t);
  assert.equal(await t.cloud.consumePasswordRecovery(),true,'ambiguous initial request retains matching verifier');
  await t.cloud.updatePassword('long-password-123','long-password-123');
  assert.equal(f.storage.has(verifierKey),false);
}
console.log('Ambiguous initial issuance retains bounded usable PKCE state: PASS');
