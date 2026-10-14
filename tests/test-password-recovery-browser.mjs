import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Real browser + real bundled Auth SDK; all backend calls terminate in this
// local mock, which enforces one-time codes and the SDK's actual PKCE challenge.
const root = fileURLToPath(new URL('../', import.meta.url));
const user = { id: 'c48666ef-d71d-4d0e-a141-68221e8cfe11', email: 'staff@example.com' };
const callback = 'https://app.aveniq.com.au/reset-password';
const normalSessionKey = 'aveniq-owner-session';
const verifierKey = 'aveniq-password-recovery:mock.invalid-code-verifier';
const calls = [], codes = new Map(), tokens = new Set();
let sequence = 0, latestChallenge = '', recoverStatus = 200;
function jwt(method, exp = Math.floor(Date.now() / 1000) + 3600) {
  return ['eyJhbGciOiJFUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, amr: [{ method, timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url'), 'mock-signature'].join('.');
}
function session(method = 'recovery') {
  const access_token = jwt(method);
  tokens.add(access_token);
  return { access_token, refresh_token: 'mock-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
}
function issueCode(method = 'recovery') {
  assert.ok(latestChallenge, 'Request recovery before issuing a mocked callback');
  const code = 'one-time-' + (++sequence);
  codes.set(code, { challenge: latestChallenge, method });
  return code;
}
function mockAuth({ url, options }) {
  calls.push({ url, options });
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.includes('/recover')) {
    assert.equal(new URL(url).searchParams.get('redirect_to'), callback);
    assert.equal(body.code_challenge_method, 's256');
    assert.equal(body.email, 'staff@example.com');
    latestChallenge = body.code_challenge;
    return { status: recoverStatus, data: recoverStatus === 200 ? {} : { msg: 'Account does not exist' } };
  }
  if (url.includes('grant_type=pkce')) {
    const entry = codes.get(body.auth_code);
    codes.delete(body.auth_code);
    if (!entry || createHash('sha256').update(body.code_verifier).digest('base64url') !== entry.challenge) {
      return { status: 400, data: { msg: 'Invalid or expired code', code: 'flow_state_not_found' } };
    }
    return { status: 200, data: session(entry.method) };
  }
  const token = options.headers.authorization?.replace('Bearer ', '');
  if (url.includes('/user')) {
    if (!tokens.has(token)) return { status: 401, data: { msg: 'Invalid JWT', code: 'bad_jwt' } };
    return { status: 200, data: user };
  }
  if (url.includes('/logout')) { tokens.delete(token); return { status: 200, data: {} }; }
  if (url.includes('/rest/v1/')) return { status: 200, data: [] };
  throw new Error('Unexpected mocked endpoint: ' + url);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/__mock-auth') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const { status, data } = mockAuth(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    let path = new URL(req.url, 'http://localhost').pathname;
    if (!/\.(js|css|png|svg|webmanifest)$/.test(path)) path = '/index.html';
    const body = path === '/supabase-config.js'
      ? 'window.TABLEORDER_SUPABASE={url:"https://mock.invalid",publishableKey:"sb_publishable_mock"};'
      : await readFile(join(root, path.startsWith('/vendor/') ? 'dist' + path : path));
    res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    if (req.url === '/__mock-auth') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error.message }));
    } else { res.writeHead(404); res.end(); }
  }
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
function updateCount() { return calls.filter(call => call.options.method === 'PUT').length; }

try {
  await readFile(join(root, 'dist/vendor/recovery-auth.js')); // Run npm run build first.
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  profile = await mkdtemp(join(tmpdir(), 'aveniq-pkce-browser-'));
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
  const browserInit = `
    const nativeNow = Date.now.bind(Date);
    Date.now = () => Number(localStorage.getItem('__recoveryNow')) || nativeNow();
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('https://mock.invalid/')) {
        return nativeFetch('/__mock-auth', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url,options:{...options,headers:Object.fromEntries(new Headers(options.headers))}})});
      }
      if (new URL(url, location.href).origin !== location.origin) throw new Error('External fetch blocked: ' + url);
      return nativeFetch(input, options);
    };
  `;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: browserInit });
  // Network safety also blocks non-fetch external resources.
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://mock.invalid/*'] });
  async function navigate(path) {
    await send('Page.navigate', { url: origin + path });
    await waitFor('document.readyState === "complete" && Boolean(window.TableOrderCloud)', 'page load');
    if (path.startsWith('/reset-password')) await waitFor('document.getElementById("passwordRecoveryDescription").textContent !== "Checking your reset link…"', 'callback resolution');
    else await waitFor('!document.getElementById("' + (path === '/login' ? 'ownerAuthPanel' : 'passwordRecoveryPanel') + '").classList.contains("hidden")', 'auth screen');
  }
  async function assertLayout(label) {
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, label + ': horizontal overflow');
    for (const id of ['mobileBottomNav', 'mobileCartDock']) assert.equal(await evaluate(`document.getElementById('${id}').classList.contains('hidden')`), true, label + ': customer chrome');
  }
  async function requestRecovery() {
    await navigate('/forgot-password');
    await evaluate(`localStorage.setItem('__recoveryNow', String(Date.now() + 61000));window.refreshPasswordRecoveryCooldown?.()`);
    await assertLayout('forgot password');
    await evaluate(`document.getElementById('passwordRecoveryEmail').value='staff@example.com';document.getElementById('passwordRecoveryForm').requestSubmit()`);
    await waitFor(`!document.getElementById('passwordRecoverySuccess').classList.contains('hidden')`, 'generic recovery response');
    assert.match(await evaluate(`document.getElementById('passwordRecoverySuccess').textContent`), /If an account is eligible/);
  }
  async function assertRejected(path) {
    const before = updateCount();
    await navigate(path);
    await assertLayout('invalid callback');
    assert.match(await evaluate(`document.getElementById('passwordRecoveryDescription').textContent`), /invalid or has expired/);
    assert.equal(await evaluate(`document.getElementById('passwordRecoveryForm').classList.contains('hidden')`), true);
    assert.equal(await evaluate(`document.getElementById('passwordRecoveryRetry').classList.contains('hidden')`), false);
    const error = await evaluate(`window.TableOrderCloud.updatePassword('long-password-123','long-password-123').then(()=> 'unexpected success',error=>error.message)`);
    assert.equal(error, 'PASSWORD_RECOVERY_SESSION_MISSING');
    assert.equal(updateCount(), before, 'Rejected callback must never update password');
  }

  // An independent page target shares only browser-managed origin storage and
  // Web Locks with the first tab; it has its own Auth client and JS globals.
  async function openSecondTab() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json();
    const socket = new WebSocket(targets.find(page => page.id === targetId).webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const commands = new Map();
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data), command = commands.get(event.id);
      if (command) { commands.delete(event.id); event.error ? command.reject(new Error(JSON.stringify(event.error))) : command.resolve(event.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id; commands.set(next, { resolve, reject });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
    const run = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await command('Page.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: browserInit });
    await command('Network.enable');
    await command('Network.setBlockedURLs', { urls: ['https://*', 'http://mock.invalid/*'] });
    await command('Page.navigate', { url: origin + '/forgot-password' });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await run('document.readyState === "complete" && Boolean(window.TableOrderCloud)')) break;
      await delay(30);
    }
    assert.equal(await run('Boolean(window.TableOrderCloud)'), true, 'Second tab loaded');
    return { run, close: async () => { socket.close(); await send('Target.closeTarget', { targetId }); } };
  }

  await navigate('/forgot-password');
  await evaluate('localStorage.clear()');
  const secondTab = await openSecondTab();
  try {
    const recoverCount = () => calls.filter(call => call.url.includes('/recover')).length;
    const before = recoverCount();
    await Promise.all([
      evaluate(`window.TableOrderCloud.requestPasswordRecovery('staff@example.com')`),
      secondTab.run(`window.TableOrderCloud.requestPasswordRecovery('staff@example.com')`)
    ]);
    assert.equal(recoverCount(), before + 1, 'Simultaneous independent tabs issue one request');
    const preserved = await evaluate(`localStorage.getItem('${verifierKey}')`);
    assert.ok(preserved);
    assert.equal(await secondTab.run(`localStorage.getItem('${verifierKey}')`), preserved, 'Tabs share the active verifier');
    assert.ok(await evaluate('window.TableOrderCloud.getPasswordRecoveryCooldown()') > 0);
    assert.ok(await secondTab.run('window.TableOrderCloud.getPasswordRecoveryCooldown()') > 0);
    await secondTab.run('new Promise(resolve => setTimeout(resolve, 1100))');
    assert.equal(await secondTab.run(`document.getElementById('passwordRecoverySubmit').disabled`), true, 'Other tab UI reflects shared cooldown');
    await Promise.all([
      evaluate(`window.TableOrderCloud.requestPasswordRecovery('staff@example.com')`),
      secondTab.run(`window.TableOrderCloud.requestPasswordRecovery('staff@example.com')`)
    ]);
    assert.equal(recoverCount(), before + 1, 'Cooldown suppresses both tabs');
    await evaluate(`localStorage.setItem('__recoveryNow', String(Date.now() + 61000))`);
    await secondTab.run(`window.TableOrderCloud.requestPasswordRecovery('staff@example.com')`);
    assert.equal(recoverCount(), before + 2, 'Resend available in another tab after shared cooldown');
    assert.equal(await evaluate(`localStorage.getItem('${verifierKey}')`), preserved, 'Resend keeps verifier and original lifetime');
  } finally { await secondTab.close(); }

  for (const width of [375, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await navigate('/forgot-password');
    await evaluate('localStorage.clear()');
    await requestRecovery();
    const requestCount = calls.filter(call => call.url.includes('/recover')).length;
    await evaluate(`document.getElementById('passwordRecoveryRetry').click();document.getElementById('passwordRecoveryRetry').click()`);
    assert.equal(calls.filter(call => call.url.includes('/recover')).length, requestCount, 'Rapid retry clicks do not submit within cooldown');
    assert.equal(await evaluate(`document.getElementById('passwordRecoveryRetry').getAttribute('aria-disabled')`), 'true', 'Retry announces cooldown');
    assert.match(await evaluate(`document.getElementById('passwordRecoveryRetry').textContent`), /\d+.*s|\d+.*second/i, 'Retry explains wait');
    await assertLayout('recovery cooldown');
    const successText = await evaluate(`document.getElementById('passwordRecoverySuccess').textContent`);
    const firstCode = issueCode();
    const activeVerifier = await evaluate(`localStorage.getItem('${verifierKey}')`);
    recoverStatus = 429;
    await requestRecovery();
    assert.equal(await evaluate(`document.getElementById('passwordRecoverySuccess').textContent`), successText, 'Provider failure must not enumerate accounts');
    assert.equal(await evaluate(`localStorage.getItem('${verifierKey}')`), activeVerifier, '429 cannot delete or extend active verifier');
    recoverStatus = 200;
    const code = firstCode;
    await navigate('/reset-password?code=' + code);
    await assertLayout('valid callback');
    assert.equal(await evaluate(`document.getElementById('passwordRecoveryNew').disabled`), false, 'Genuine callback enables password form');
    assert.equal(await evaluate('location.search + location.hash'), '', 'Callback credentials stripped');
    assert.ok(await evaluate(`localStorage.getItem('${verifierKey}')`), 'Bounded verifier retained until successful password update');
    assert.equal(await evaluate(`localStorage.getItem('${normalSessionKey}')`), null, 'Recovery never populates login session');
    let before = updateCount();
    await evaluate(`document.getElementById('passwordRecoveryNew').value='short';document.getElementById('passwordRecoveryConfirm').value='short';document.getElementById('passwordRecoveryForm').requestSubmit()`);
    await waitFor(`document.getElementById('passwordRecoveryError').textContent.includes('at least 12')`, 'minimum-length validation');
    assert.equal(await evaluate(`document.getElementById('passwordRecoveryNew').minLength`), 12, 'HTML minimum-length constraint');
    assert.equal(await evaluate(`window.TableOrderCloud.updatePassword('short','short').then(()=> 'unexpected success',error=>error.message)`), 'Use at least 12 characters for your new password.');
    assert.equal(updateCount(), before);
    await evaluate(`document.getElementById('passwordRecoveryNew').value='long-password-123';document.getElementById('passwordRecoveryConfirm').value='long-password-456';document.getElementById('passwordRecoveryForm').requestSubmit()`);
    await waitFor(`document.getElementById('passwordRecoveryError').textContent.includes('do not match')`, 'mismatch validation');
    assert.equal(updateCount(), before);
    await evaluate(`document.getElementById('passwordRecoveryConfirm').value='long-password-123';document.getElementById('passwordRecoveryForm').requestSubmit();document.getElementById('passwordRecoveryForm').requestSubmit()`);
    await waitFor(`document.getElementById('passwordRecoverySuccess').textContent.includes('updated')`, 'password success');
    assert.equal(updateCount(), before + 1, 'Duplicate submissions update once');
    assert.equal(await evaluate(`localStorage.getItem('${verifierKey}')`), null, 'Successful password update clears verifier');
    assert.ok(calls.some(call => call.url.includes('/logout')), 'Recovery session ends after update');
    assert.equal(await evaluate(`window.TableOrderCloud.updatePassword('long-password-123','long-password-123').then(()=> 'unexpected success',error=>error.message)`), 'PASSWORD_RECOVERY_SESSION_MISSING', 'Successful credentials cannot replay');
    assert.equal(updateCount(), before + 1);
    await assertRejected('/reset-password?code=' + code);
    await requestRecovery();
    await assertRejected('/reset-password?code=invalid-or-expired');
    await requestRecovery();
    const expiredCode = issueCode(); codes.delete(expiredCode);
    await assertRejected('/reset-password?code=' + expiredCode);
    await requestRecovery();
    await assertRejected('/reset-password?code=' + issueCode('password'));
    await requestRecovery();
    const staleCode = issueCode();
    await evaluate(`const verifier=JSON.parse(localStorage.getItem('${verifierKey}'));verifier.createdAt=Date.now()-3600001;localStorage.setItem('${verifierKey}',JSON.stringify(verifier))`);
    await assertRejected('/reset-password?code=' + staleCode);
    await assertRejected('/reset-password#error=access_denied&error_code=otp_expired');
    for (const token of [jwt('password'), 'arbitrary-access-token']) {
      const count = calls.length;
      await assertRejected('/reset-password#type=recovery&access_token=' + token + '&refresh_token=forged&expires_in=3600');
      assert.equal(calls.length, count, 'Forged implicit token never reaches Auth');
    }
    const ordinarySession = JSON.stringify(session('password'));
    await evaluate(`localStorage.setItem('${normalSessionKey}',${JSON.stringify(ordinarySession)})`);
    const count = calls.length;
    await assertRejected('/reset-password');
    assert.equal(calls.length, count, 'Stored normal login never reaches recovery Auth');
    assert.equal(await evaluate(`localStorage.getItem('${normalSessionKey}')`), ordinarySession, 'Recovery leaves ordinary login intact');
    await evaluate('localStorage.clear()');
    await navigate('/login');
    assert.equal(await evaluate(`document.querySelector('a[href="/forgot-password"]').textContent`), 'Forgot password?');
    assert.equal(await evaluate(`document.getElementById('ownerAuthPanel').classList.contains('hidden')`), false);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Login layout');
    console.log(`PASS browser recovery workflow at ${width}px (real bundled PKCE SDK)`);
  }
  assert.deepEqual(exceptions, [], 'No uncaught browser exceptions');
  console.log('PASS password recovery browser QA: independent-tab request serialization/shared cooldown, preserved verifier after 429, rapid retry clicks, genuine/invalid/expired/replayed callbacks, validation, duplicate update, forged tokens, stored login isolation, and login at 375/768/1280px.');
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
