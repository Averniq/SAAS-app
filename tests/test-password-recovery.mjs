import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { AuthClient } from '@supabase/auth-js';

const source = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const callback = 'https://app.aveniq.com.au/reset-password';
const user = { id: 'c48666ef-d71d-4d0e-a141-68221e8cfe11', email: 'staff@example.com' };
const sessionKey = 'aveniq-owner-session';
const verifierKey = 'aveniq-password-recovery:mock.invalid-code-verifier';
function jwt(method, exp = Math.floor(Date.now() / 1000) + 3600) {
  return ['eyJhbGciOiJFUzI1NiJ9', Buffer.from(JSON.stringify({sub:user.id, exp, amr:[{method, timestamp:Math.floor(Date.now()/1000)}]})).toString('base64url'), 'mock-signature'].join('.');
}
function harness({ storage = new Map(), method = 'recovery', fail = '', fragment = '', search = '', path = '/reset-password', fetchOverride = null, logoutStatus = 200 } = {}) {
  const calls = [], codes = new Map(), tokens = new Set();
  let challenge = '', sequence = 0;
  function session(authenticationMethod = method) {
    const access_token = jwt(authenticationMethod);
    tokens.add(access_token);
    return {access_token, refresh_token:'test-refresh', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, token_type:'bearer', user};
  }
  const fetch = async (url, options = {}) => {
    calls.push({url, options});
    const body = options.body ? JSON.parse(options.body) : {};
    const response = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
    if (url.includes('/recover')) {
      if (fail) return response({msg:'Account does not exist', code:'provider_failure'}, Number(fail));
      challenge = body.code_challenge;
      assert.equal(body.code_challenge_method, 's256');
      return response({});
    }
    if (url.includes('grant_type=pkce')) {
      const entry = codes.get(body.auth_code);
      codes.delete(body.auth_code);
      if (!entry || createHash('sha256').update(body.code_verifier).digest('base64url') !== entry.challenge) return response({msg:'Invalid or expired code', code:'flow_state_not_found'}, 400);
      return response(session(entry.method));
    }
    if (url.includes('grant_type=password') || url.includes('/signup?')) return response(session('password'));
    const token = options.headers?.Authorization?.replace('Bearer ', '');
    if (url.includes('/user')) {
      if (!tokens.has(token)) return response({msg:'Invalid JWT',code:'bad_jwt'}, 401);
      return response(user);
    }
    if (url.includes('/logout')) { if (logoutStatus !== 200) return response({msg:'Mocked logout failure'}, logoutStatus); tokens.delete(token); return response({}); }
    throw new Error('Unexpected mocked endpoint: ' + url);
  };
  const window = {
    crypto:webcrypto, navigator:{locks:{request:async (name, options, callback) => (callback || options)({name,mode:'exclusive'})}},
    AveniqRecoveryAuth:{AuthClient}, TABLEORDER_SUPABASE:{url:'https://mock.invalid', publishableKey:'sb_publishable_test'},
    btoa:value=>Buffer.from(value,'binary').toString('base64'), atob:value => Buffer.from(value, 'base64').toString('binary'),
    location:{pathname:path, search, hash:fragment, origin:'https://preview.example', href:'https://preview.example'+path+search+fragment},
    localStorage:{getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)},
    history:{replaceState(){window.location.hash='';window.location.search='';}}
  };
  vm.runInNewContext(source, {window, URLSearchParams, URL, Date, Map, TextEncoder, console, fetch: fetchOverride || fetch});
  return { cloud:window.TableOrderCloud, window, calls, storage, fetch, expireCode: code => codes.delete(code),
    code(authenticationMethod=method) { const code='one-time-'+(++sequence); codes.set(code,{challenge,method:authenticationMethod}); window.location.search='?code='+code;return code; }
  };
}

// Original P1 repro: valid ordinary credentials in a forged implicit fragment.
for (const accessToken of [jwt('password'), 'arbitrary-token']) {
  const h = harness({fragment:'#type=recovery&access_token='+accessToken+'&refresh_token=arbitrary&expires_in=3600&token_type=bearer'});
  assert.equal(await h.cloud.consumePasswordRecovery(), false);
  await assert.rejects(() => h.cloud.updatePassword('long-password-123', 'long-password-123'), /PASSWORD_RECOVERY_SESSION_MISSING/);
  assert.equal(h.calls.length, 0, 'Implicit tokens must never be sent to Auth');
  assert.equal(h.window.location.hash, '');
}
const ordinaryStorage = new Map([[sessionKey, JSON.stringify({access_token:jwt('password'),refresh_token:'normal-refresh',expires_at:9999999999,user})]]);
let h = harness({storage:ordinaryStorage});
assert.equal(await h.cloud.consumePasswordRecovery(), false);
await assert.rejects(() => h.cloud.updatePassword('long-password-123', 'long-password-123'), /PASSWORD_RECOVERY_SESSION_MISSING/);
assert.equal(h.calls.length, 0);
assert.equal(h.storage.size, 1);

// Exercise the real official SDK, not a mocked exchange/event implementation.
h = harness();
await h.cloud.requestPasswordRecovery(' Staff@Example.com ');
const recover = h.calls.find(call => call.url.includes('/recover'));
assert.equal(new URL(recover.url).searchParams.get('redirect_to'), callback);
assert.equal(JSON.parse(recover.options.body).email, 'staff@example.com');
assert.ok(h.storage.has(verifierKey));
assert.ok(![...h.storage.values()].some(value => value.includes('access_token')));
h.code();
assert.equal(await h.cloud.consumePasswordRecovery(), true);
assert.equal(h.window.location.search, '');
assert.equal(h.storage.has(verifierKey), true, 'Active verifier remains bounded until the password update completes');
assert.ok(![...h.storage.values()].some(value => value.includes('access_token')), 'Recovery session is memory-only');
await assert.rejects(() => h.cloud.updatePassword('short', 'short'), /12/);
await assert.rejects(() => h.cloud.updatePassword('long-password-123', 'different-password'), /match/);
await h.cloud.updatePassword('long-password-123', 'long-password-123');
assert.equal(h.storage.has(verifierKey), false, 'Password update removes the recovery verifier');
assert.equal(h.storage.has(verifierKey + '-resend-after'), false, 'Password update removes cooldown metadata');
const update = h.calls.find(call => call.options.method === 'PUT');
assert.equal(JSON.parse(update.options.body).password, 'long-password-123');
assert.ok(h.calls.some(call => call.url.includes('/logout?scope=local')));
await assert.rejects(() => h.cloud.updatePassword('long-password-123', 'long-password-123'), /PASSWORD_RECOVERY_SESSION_MISSING/);
assert.equal(await h.cloud.consumePasswordRecovery(), false);
assert.equal(h.calls.filter(call=>call.options.method==='PUT').length,1);

// Ordinary code even with the SDK's recovery marker is not recovery authority.
h = harness();await h.cloud.requestPasswordRecovery('staff@example.com');h.code('password');
assert.equal(await h.cloud.consumePasswordRecovery(), false);
await assert.rejects(() => h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
assert.equal(h.calls.filter(call=>call.options.method==='PUT').length,0);

// Missing local verifier, wrong-code, expired verifier and malformed URL fail closed.
for (const scenario of ['missing','invalid','expired','expired-code','duplicate','error','fragment','nonrecovery-marker']) {
  h = harness();
  if (scenario !== 'missing') await h.cloud.requestPasswordRecovery('staff@example.com');
  const code = h.code();
  if (scenario === 'invalid') h.window.location.search='?code=unknown';
  if (scenario === 'expired-code') h.expireCode(code);
  if (scenario === 'expired') {const entry=JSON.parse(h.storage.get(verifierKey));entry.createdAt-=3600001;h.storage.set(verifierKey,JSON.stringify(entry));}
  if (scenario === 'duplicate') h.window.location.search='?code='+code+'&code=other';
  if (scenario === 'error') h.window.location.search+='&error=expired';
  if (scenario === 'fragment') h.window.location.hash='#type=recovery';
  if (scenario === 'nonrecovery-marker') {const entry=JSON.parse(h.storage.get(verifierKey));entry.value=entry.value.replace('/PASSWORD_RECOVERY','');h.storage.set(verifierKey,JSON.stringify(entry));}
  assert.equal(await h.cloud.consumePasswordRecovery(), false, scenario);
  await assert.rejects(() => h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
}

// Successful recovery preserves an ordinary login's storage and uses its own token.
const existing = new Map([[sessionKey, JSON.stringify({access_token:jwt('password'),expires_at:9999999999,user})]]);
h = harness({storage:existing});const storedLogin=existing.get(sessionKey);
await h.cloud.requestPasswordRecovery('staff@example.com');h.code();
assert.equal(await h.cloud.consumePasswordRecovery(),true);
await h.cloud.updatePassword('long-password-123','long-password-123');
assert.equal(existing.get(sessionKey),storedLogin);
assert.notEqual(h.calls.find(call=>call.options.method==='PUT').options.headers.Authorization, 'Bearer '+jwt('password'));

// The verifier survives same-origin page loads; code and verifier cannot be reused.
h = harness();await h.cloud.requestPasswordRecovery('staff@example.com');
const code = h.code();
const next = harness({storage:h.storage, fetchOverride:h.fetch, search:'?code='+code});
assert.equal(await next.cloud.consumePasswordRecovery(), true);
await next.cloud.updatePassword('long-password-123','long-password-123');
next.window.location.search='?code='+code;
assert.equal(await next.cloud.consumePasswordRecovery(),false);
assert.equal(h.calls.filter(call=>call.options.method==='PUT').length,1);

// Local recovery authority is cleared even if remote logout fails.
h = harness({logoutStatus:500});await h.cloud.requestPasswordRecovery('staff@example.com');h.code();
assert.equal(await h.cloud.consumePasswordRecovery(),true);
await h.cloud.updatePassword('long-password-123','long-password-123');
await assert.rejects(() => h.cloud.updatePassword('long-password-123','long-password-123'),/PASSWORD_RECOVERY_SESSION_MISSING/);
assert.equal(h.storage.size,0);

for (const status of ['400','429','500']) {h=harness({fail:status});await h.cloud.requestPasswordRecovery('missing@example.com');}
h=harness({path:'/login'});await h.cloud.signInWithPassword('OWNER@example.com','existing-password');assert.equal(JSON.parse(h.calls[0].options.body).email,'owner@example.com');assert.ok(h.storage.has(sessionKey));
h=harness({path:'/signup'});await h.cloud.signUp(' NEW@example.com ','existing-password');assert.ok(h.calls[0].url.includes('/signup?redirect_to='));
h=harness({path:'/join/invite',fragment:'#type=signup&access_token=existing&refresh_token=existing&expires_in=3600'});assert.ok(h.cloud.consumeAuthRedirect());assert.ok(h.storage.has(sessionKey));
console.log('Password recovery real-SDK PKCE and adversarial regressions: PASS');
