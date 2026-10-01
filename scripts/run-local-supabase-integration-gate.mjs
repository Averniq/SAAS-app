#!/usr/bin/env node
// Exercises the deployed interfaces of a fresh, isolated local Supabase stack.
// It never accepts database URLs or credentials and always creates a unique
// Docker network, containers, credentials, and frontend origin.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tag = `aveniq-api-gate-${randomUUID().slice(0, 8)}`;
const names = { network: tag, db: `${tag}-db`, auth: `${tag}-auth`, rest: `${tag}-rest`, kong: `${tag}-kong` };
const secret = randomBytes(32).toString('hex');
const jwtKeys = JSON.stringify([{ kty: 'oct', kid: 'local-integration-gate', use: 'sig', key_ops: ['sign', 'verify'], alg: 'HS256', k: Buffer.from(secret).toString('base64url') }]);
const password = `Gate-${randomBytes(12).toString('base64url')}`;
const anonKey = sign({ role: 'anon' });
const serviceKey = sign({ role: 'service_role' });
const holds = process.argv.includes('--hold');
let appServer;
let apiPort;
let appPort;
let kongFile;
let cleaned = false;
let checks = 0;
let completed = false;

function sign(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issued = Math.floor(Date.now() / 1000);
  const body = encode({ aud: 'authenticated', iss: 'local-integration-gate', iat: issued - 30, exp: issued + 3600, ...payload });
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${body}.${createHmac('sha256', secret).update(`${encode({ alg: 'HS256', typ: 'JWT' })}.${body}`).digest('base64url')}`;
}
function command(args, input = '') {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolveResult({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function ok(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
async function docker(args, input, label) { return ok(await command(args, input), label || args.join(' ')); }
async function port() {
  const server = createNetServer();
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
  const value = server.address().port;
  await new Promise(resolveClosed => server.close(resolveClosed));
  return value;
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
async function sql(input) { return docker(['exec', '-e', 'PGPASSWORD=postgres', '-i', names.db, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input, 'psql'); }
function pass(label) { checks += 1; console.log(`PASS ${label}`); }
async function api(path, { method = 'GET', token, body, key = anonKey } = {}) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method,
    headers: { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, text };
}
function denied(response, label, matcher = /PUBLIC_TOKEN_NOT_FOUND|permission denied|RESTAURANT_ACCESS_DENIED/i) {
  assert.ok(response.status >= 400, `${label}: request unexpectedly succeeded (${response.status})`);
  assert.match(JSON.stringify(response.data), matcher, `${label}: unexpected denial ${response.status} ${response.text}`);
  pass(label);
}
async function createUser(email) {
  const created = await api('/auth/v1/admin/users', { method: 'POST', key: serviceKey, token: serviceKey, body: { email, password, email_confirm: true } });
  assert.equal(created.status, 200, `create ${email}: ${created.text}`);
  const login = await api('/auth/v1/token?grant_type=password', { method: 'POST', key: anonKey, body: { email, password } });
  assert.equal(login.status, 200, `password login ${email}: ${login.text}`);
  assert.ok(login.data.access_token && login.data.user?.id, `session missing for ${email}`);
  return { id: login.data.user.id, email, token: login.data.access_token };
}
function contentType(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8' })[extname(file)] || 'application/octet-stream';
}
async function startApp() {
  const dist = join(root, 'dist');
  appPort = await port();
  appServer = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://127.0.0.1:${appPort}`);
    if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/')) {
      const body = ['GET', 'HEAD'].includes(request.method || '') ? undefined : request;
      const upstream = await fetch(`http://127.0.0.1:${apiPort}${url.pathname}${url.search}`, { method: request.method, headers: request.headers, body, ...(body ? { duplex: 'half' } : {}) });
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !['connection', 'transfer-encoding'].includes(key))));
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    if (url.pathname === '/supabase-config.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`window.TABLEORDER_SUPABASE={url:${JSON.stringify(`http://127.0.0.1:${appPort}`)},publishableKey:${JSON.stringify(anonKey)},restaurantSlug:'',staffUsername:'',staffEmail:''};`);
      return;
    }
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
    let file = resolve(join(dist, relative || 'index.html'));
    if (!file.startsWith(dist)) { response.writeHead(400); response.end('invalid path'); return; }
    try { await readFile(file); } catch { file = join(dist, 'index.html'); }
    const headers = { 'content-type': contentType(file), 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=0', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" };
    response.writeHead(200, headers); response.end(await readFile(file));
  });
  await new Promise(resolveReady => appServer.listen(appPort, '127.0.0.1', resolveReady));
}
async function clean() {
  if (cleaned) return;
  cleaned = true;
  if (appServer) await new Promise(resolveClosed => appServer.close(resolveClosed));
  for (const name of [names.kong, names.rest, names.auth, names.db]) await command(['rm', '-f', name]);
  await command(['network', 'rm', names.network]);
  if (kongFile) await rm(kongFile, { force: true });
}
process.on('SIGINT', () => clean().finally(() => process.exit(0)));
process.on('SIGTERM', () => clean().finally(() => process.exit(0)));

async function startStack() {
  apiPort = await port();
  kongFile = join(tmpdir(), `${tag}.kong.yml`);
  await writeFile(kongFile, `\n_format_version: \"1.1\"\nservices:\n  - name: auth\n    url: http://auth:9999/\n    routes:\n      - name: auth-route\n        strip_path: true\n        paths: [/auth/v1/]\n    plugins: [{ name: cors }]\n  - name: rest\n    url: http://rest:3000/\n    routes:\n      - name: rest-route\n        strip_path: true\n        paths: [/rest/v1/]\n    plugins: [{ name: cors }]\n`);
  await docker(['network', 'create', names.network]);
  await docker(['run', '-d', '--rm', '--name', names.db, '--network', names.network, '--network-alias', 'db', '-e', 'POSTGRES_USER=supabase_admin', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=postgres', '-e', `JWT_SECRET=${secret}`, '-e', 'JWT_EXP=3600', 'public.ecr.aws/supabase/postgres:15.8.1.085']);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const ready = await command(['exec', names.db, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres']);
    const auth = await command(['exec', '-e', 'PGPASSWORD=postgres', names.db, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-c', "select to_regclass('auth.users') is not null"]);
    if (ready.code === 0 && auth.code === 0 && auth.stdout.trim() === 't') break;
    if (attempt === 89) throw new Error(`disposable database bootstrap did not become ready: ${auth.stderr}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  const migrations = (await readdir(join(root, 'supabase/migrations'))).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrations) await sql(await readFile(join(root, 'supabase/migrations', file), 'utf8'));
  await sql("alter role authenticator password 'postgres'; alter role supabase_auth_admin password 'postgres';");
  pass(`fresh canonical replay (${migrations.length} migrations)`);
  await docker(['run', '-d', '--name', names.auth, '--network', names.network, '--network-alias', 'auth', '-e', 'GOTRUE_API_HOST=0.0.0.0', '-e', 'GOTRUE_API_PORT=9999', '-e', 'GOTRUE_DB_DRIVER=postgres', '-e', 'GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@db:5432/postgres', '-e', `GOTRUE_JWT_SECRET=${secret}`, '-e', `GOTRUE_JWT_KEYS=${jwtKeys}`, '-e', 'GOTRUE_JWT_AUD=authenticated', '-e', 'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated', '-e', `GOTRUE_JWT_ISSUER=http://127.0.0.1:${apiPort}/auth/v1`, '-e', `API_EXTERNAL_URL=http://127.0.0.1:${apiPort}/auth/v1`, '-e', 'GOTRUE_JWT_EXP=3600', '-e', 'GOTRUE_JWT_ADMIN_ROLES=service_role', '-e', 'GOTRUE_SITE_URL=http://127.0.0.1', '-e', 'GOTRUE_URI_ALLOW_LIST=http://127.0.0.1', '-e', 'GOTRUE_DISABLE_SIGNUP=false', '-e', 'GOTRUE_MAILER_AUTOCONFIRM=true', '-e', 'GOTRUE_EXTERNAL_EMAIL_ENABLED=true', '-e', 'GOTRUE_MAILER_OTP_EXP=3600', '-e', 'GOTRUE_PASSWORD_MIN_LENGTH=8', 'public.ecr.aws/supabase/gotrue:v2.196.0']);
  await docker(['run', '-d', '--name', names.rest, '--network', names.network, '--network-alias', 'rest', '-e', 'PGRST_DB_URI=postgresql://authenticator:postgres@db:5432/postgres', '-e', 'PGRST_DB_SCHEMAS=public,graphql_public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_DB_EXTRA_SEARCH_PATH=public,extensions', '-e', 'PGRST_DB_MAX_ROWS=1000', '-e', `PGRST_JWT_SECRET=${JSON.stringify({ keys: JSON.parse(jwtKeys) })}`, '-e', 'PGRST_JWT_AUD=authenticated', 'public.ecr.aws/supabase/postgrest:v16.2']);
  await docker(['create', '--name', names.kong, '--network', names.network, '-p', `127.0.0.1:${apiPort}:8000`, '-e', 'KONG_DATABASE=off', '-e', 'KONG_DECLARATIVE_CONFIG=/home/kong/kong.yml', '-e', 'KONG_PLUGINS=cors', 'public.ecr.aws/supabase/kong:2.8.1']);
  await docker(['cp', kongFile, `${names.kong}:/home/kong/kong.yml`]);
  await docker(['start', names.kong]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = await fetch(`http://127.0.0.1:${apiPort}/rest/v1/`).catch(() => null);
    if (health && health.status < 500) break;
    if (attempt === 59) throw new Error('Kong/PostgREST did not become ready');
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
}

async function verifyApi() {
  const sake = (await sql("select id from public.restaurants where slug='sake-street';")).trim();
  const tables = (await sql(`select id from public.tables where restaurant_id=${quote(sake)} order by table_number;`)).split(/\r?\n/);
  const item = (await sql(`select id from public.menu_items where restaurant_id=${quote(sake)} and is_active and is_available and not sold_out order by sort_order,id limit 1;`)).trim();
  assert.ok(sake && tables.length >= 2 && item, 'Sake Street fresh seed is incomplete');
  pass('Sake Street seed is present');
  const owner = await createUser('owner@local.integration');
  const manager = await createUser('manager@local.integration');
  const staff = await createUser('staff@local.integration');
  const kitchen = await createUser('kitchen@local.integration');
  const cashier = await createUser('cashier@local.integration');
  const outsider = await createUser('outsider@local.integration');
  await sql(`insert into public.restaurant_staff(restaurant_id,user_id,role) values (${quote(sake)},${quote(owner.id)},'owner'),(${quote(sake)},${quote(manager.id)},'manager'),(${quote(sake)},${quote(staff.id)},'staff'),(${quote(sake)},${quote(kitchen.id)},'kitchen'),(${quote(sake)},${quote(cashier.id)},'cashier');`);
  const session = await api('/auth/v1/user', { token: owner.token });
  assert.equal(session.status, 200); assert.equal(session.data.id, owner.id); pass('Auth password login and session acquisition');
  const membership = await api(`/rest/v1/restaurant_staff?select=restaurant_id,role,restaurants(id,slug)&user_id=eq.${owner.id}`, { token: owner.token });
  assert.equal(membership.status, 200, membership.text); assert.equal(membership.data[0].restaurants.slug, 'sake-street'); pass('authenticated membership/profile resolution');
  const catalogue = await api(`/rest/v1/menu_items?select=id,name,price&restaurant_id=eq.${sake}`, { token: owner.token });
  assert.equal(catalogue.status, 200); assert.ok(catalogue.data.length >= 71); pass('authenticated restaurant catalogue loading');
  const issue = async (who, table = tables[0], expiresAt = null) => api('/rest/v1/rpc/issue_public_qr_table_token', { method: 'POST', token: who.token, body: { p_restaurant_id: sake, p_table_id: table, p_expires_at: expiresAt } });
  const issued = await issue(owner); assert.equal(issued.status, 200, issued.text); assert.ok(issued.data.token); pass('owner QR token issuance via PostgREST');
  const managerIssued = await issue(manager, tables[1]); assert.equal(managerIssued.status, 200, managerIssued.text); pass('manager QR token issuance via PostgREST');
  denied(await issue(staff), 'unauthorised staff QR administration', /RESTAURANT_ACCESS_DENIED/);
  const metadata = await api('/rest/v1/rpc/get_public_qr_table_token_metadata', { method: 'POST', token: owner.token, body: { p_restaurant_id: sake } });
  assert.equal(metadata.status, 200); assert.ok(metadata.data.every(row => Object.keys(row).sort().join(',') === 'has_active_token,table_id')); pass('owner QR metadata has no token plaintext');
  const context = async token => api('/rest/v1/rpc/get_public_qr_order_context', { method: 'POST', body: { p_token: token } });
  const submit = async (token, key, quantity = 1) => api('/rest/v1/rpc/submit_public_qr_order', { method: 'POST', body: { p_token: token, p_items: [{ menu_item_id: item, quantity, options: [] }], p_customer_name: 'Local browser customer', p_note: 'API gate', p_idempotency_key: key } });
  const status = async (token, orderId) => api('/rest/v1/rpc/get_public_qr_order_status', { method: 'POST', body: { p_token: token, p_order_id: orderId } });
  const goodContext = await context(issued.data.token); assert.equal(goodContext.status, 200, goodContext.text); assert.equal(goodContext.data.restaurant.id, sake); assert.equal(goodContext.data.table.id, tables[0]); pass('anonymous token-scoped context');
  denied(await context('not-a-token'), 'invalid token denied');
  const key = randomUUID(); const placed = await submit(issued.data.token, key); assert.equal(placed.status, 200, placed.text); assert.equal(placed.data.idempotent_replay, false);
  const replay = await submit(issued.data.token, key); assert.equal(replay.status, 200); assert.equal(replay.data.id, placed.data.id); assert.equal(replay.data.idempotent_replay, true);
  const orders = await api(`/rest/v1/orders?select=id&restaurant_id=eq.${sake}&id=eq.${placed.data.id}`, { token: owner.token }); assert.equal(orders.data.length, 1); pass('anonymous submit idempotency creates one order');
  const correctStatus = await status(issued.data.token, placed.data.id); assert.equal(correctStatus.status, 200); assert.equal(correctStatus.data.id, placed.data.id); pass('customer tracking is token/order scoped');
  denied(await status(managerIssued.data.token, placed.data.id), 'cross-token customer tracking denied', /PUBLIC_ORDER_NOT_FOUND/);
  const rotated = await issue(owner); assert.equal(rotated.status, 200); assert.equal(rotated.data.rotated, true); pass('owner QR rotation via PostgREST');
  denied(await context(issued.data.token), 'revoked/rotated token denied');
  denied(await status(rotated.data.token, placed.data.id), 'replacement token cannot read prior token order', /PUBLIC_ORDER_NOT_FOUND/);
  const expiring = await issue(owner, tables[0], new Date(Date.now() + 900).toISOString()); assert.equal(expiring.status, 200);
  await new Promise(resolveWait => setTimeout(resolveWait, 1200)); denied(await context(expiring.data.token), 'expired token denied');
  const current = await issue(owner); assert.equal((await context(current.data.token)).status, 200);
  const kitchenStart = await api('/rest/v1/rpc/update_restaurant_order_status', { method: 'POST', token: kitchen.token, body: { p_restaurant_id: sake, p_order_id: placed.data.id, p_action: 'Preparing' } });
  assert.equal(kitchenStart.status, 200, kitchenStart.text);
  const kitchenReady = await api('/rest/v1/rpc/update_restaurant_order_status', { method: 'POST', token: kitchen.token, body: { p_restaurant_id: sake, p_order_id: placed.data.id, p_action: 'Ready' } }); assert.equal(kitchenReady.status, 200, kitchenReady.text);
  const kitchenServed = await api('/rest/v1/rpc/update_restaurant_order_status', { method: 'POST', token: kitchen.token, body: { p_restaurant_id: sake, p_order_id: placed.data.id, p_action: 'Served' } }); assert.equal(kitchenServed.status, 200, kitchenServed.text); pass('Kitchen lifecycle via authenticated PostgREST');
  const total = Number((await sql(`select round(total*100)::integer from public.orders where id=${quote(placed.data.id)};`)).trim());
  const payment = await api('/rest/v1/rpc/record_authoritative_payment', { method: 'POST', token: cashier.token, body: { p_restaurant_id: sake, p_order_id: placed.data.id, p_amount_cents: total, p_method: 'Card', p_reference: 'local-gate', p_note: '', p_idempotency_key: randomUUID() } }); assert.equal(payment.status, 200, payment.text); assert.equal(payment.data.payment_status, 'paid'); pass('Front Desk canonical payment via authenticated PostgREST');
  const foreign = randomUUID(); const foreignTable = randomUUID();
  await sql(`insert into public.restaurants(id,name,slug,status) values (${quote(foreign)},'Foreign gate tenant',${quote(`foreign-${foreign}`)},'active'); insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values (${quote(foreignTable)},${quote(foreign)},1,'Foreign','foreign','Foreign',${quote(randomUUID())}); insert into public.restaurant_staff(restaurant_id,user_id,role) values (${quote(foreign)},${quote(outsider.id)},'owner');`);
  const foreignIssue = await api('/rest/v1/rpc/issue_public_qr_table_token', { method: 'POST', token: outsider.token, body: { p_restaurant_id: foreign, p_table_id: foreignTable, p_expires_at: null } }); assert.equal(foreignIssue.status, 200, foreignIssue.text);
  denied(await status(foreignIssue.data.token, placed.data.id), 'cross-tenant/token access denied', /PUBLIC_ORDER_NOT_FOUND/);
  return { owner, kitchen, cashier, token: current.data.token, orderId: placed.data.id, restaurantId: sake };
}

async function main() {
  try {
    await startStack();
    const state = await verifyApi();
    await startApp();
    completed = true;
    if (holds) {
      // Browser credentials are emitted only for an explicitly held local run,
      // after the caller has approved entering the disposable password.
      console.log(`BROWSER_READY ${JSON.stringify({ appUrl: `http://127.0.0.1:${appPort}`, ownerEmail: state.owner.email, password, token: state.token, orderId: state.orderId })}`);
      await new Promise(resolveHeld => setInterval(resolveHeld, 60_000));
    }
    console.log(`COMPLETED ${JSON.stringify({ appUrl: `http://127.0.0.1:${appPort}`, apiUrl: `http://127.0.0.1:${apiPort}`, checks })}`);
  } finally {
    if (!holds || !completed) await clean();
  }
}
main().catch(async error => { console.error(error.stack || error.message); await clean(); process.exitCode = 1; });
