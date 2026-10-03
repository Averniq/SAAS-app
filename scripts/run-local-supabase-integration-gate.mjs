#!/usr/bin/env node
// Exercises the deployed interfaces of a fresh, isolated local Supabase stack.
// It never accepts database URLs or credentials and always creates a unique
// Docker network, containers, credentials, and frontend origin.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer, createConnection } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tag = `aveniq-api-gate-${randomUUID().slice(0, 8)}`;
const names = { network: tag, db: `${tag}-db`, auth: `${tag}-auth`, rest: `${tag}-rest`, kong: `${tag}-kong` };
const secret = randomBytes(32).toString('hex');
const jwtKeys = JSON.stringify([{ kty: 'oct', kid: 'local-integration-gate', use: 'sig', key_ops: ['sign', 'verify'], alg: 'HS256', k: Buffer.from(secret).toString('base64url') }]);
const password = `Gate-${randomBytes(12).toString('base64url')}`;
const anonKey = sign({ role: 'anon' });
const serviceKey = sign({ role: 'service_role' });
const holds = process.argv.includes('--hold') || process.argv.includes('--browser-ipc') || process.argv.includes('--browser-port');
let appServer;
let apiPort;
let appPort;
let kongFile;
let cleaned = false;
let checks = 0;
let completed = false;
let browserState;
let gatePhase = 'local-stack';

function sign(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issued = Math.floor(Date.now() / 1000);
  const body = encode({ aud: 'authenticated', iss: 'local-integration-gate', iat: issued - 30, exp: issued + 3600, ...payload });
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${body}.${createHmac('sha256', secret).update(`${encode({ alg: 'HS256', typ: 'JWT' })}.${body}`).digest('base64url')}`;
}
function run(program, args, input = '', env = process.env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(program, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolveResult({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function command(args, input = '') { return run('docker', args, input); }
function ok(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
async function docker(args, input, label) { return ok(await command(args, input), label || 'local Docker operation'); }
async function node(args, env = {}) {
  return run(process.execPath, args, '', { ...process.env, ...env });
}
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
  return loginUser(email);
}
async function loginUser(email) {
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
  const localBuild = await node(['scripts/build-site.mjs'], {
    AVENIQ_PUBLIC_CONFIG_MODE: 'preview',
    AVENIQ_SUPABASE_URL: `http://127.0.0.1:${appPort}`,
    AVENIQ_SUPABASE_PUBLISHABLE_KEY: anonKey
  });
  assert.equal(localBuild.code, 0, localBuild.stderr || localBuild.stdout);
  const builtConfig = await readFile(join(dist, 'supabase-config.js'), 'utf8');
  assert.ok(builtConfig.includes(`http://127.0.0.1:${appPort}`), 'local browser build must use generated disposable config');
  assert.ok(!builtConfig.includes(serviceKey), 'local browser build must not contain service-role key');
  appServer = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://127.0.0.1:${appPort}`);
    if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/')) {
      const body = ['GET', 'HEAD'].includes(request.method || '') ? undefined : request;
      const upstream = await fetch(`http://127.0.0.1:${apiPort}${url.pathname}${url.search}`, { method: request.method, headers: request.headers, body, ...(body ? { duplex: 'half' } : {}) });
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !['connection', 'transfer-encoding'].includes(key))));
      response.end(Buffer.from(await upstream.arrayBuffer()));
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
  for (const file of migrations) {
    const source = await readFile(join(root, 'supabase/migrations', file), 'utf8');
    if (file === '20261003090000_initial_owner_bootstrap_claim.sql') {
      gatePhase = 'initial-owner-migration-atomicity';
      // Fail after SECURITY DEFINER creation but before its ACL is tightened.
      // A disconnected failed psql session must leave neither object visible.
      const injected = source.replace(/\nrevoke all on function/i, '\nselect 1 / 0;\nrevoke all on function');
      assert.notEqual(injected, source, 'migration fault injection must reach the ACL boundary');
      const failed = await command(['exec', '-e', 'PGPASSWORD=postgres', '-i', names.db, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], injected);
      assert.notEqual(failed.code, 0, 'injected migration failure must abort');
      assert.ok(/division by zero/i.test(failed.stderr), 'failure must reach the injected post-function/pre-ACL boundary');
      assert.equal((await sql("select to_regclass('public.initial_owner_bootstrap_claims') is null, to_regprocedure('public.claim_initial_restaurant_owner(uuid,uuid,boolean)') is null;")).trim(), 't|t', 'failed migration must not leave a table or default-public SECURITY DEFINER RPC');
    }
    gatePhase = 'canonical-migration-replay';
    await sql(source);
  }
  await sql("alter role authenticator password 'postgres'; alter role supabase_auth_admin password 'postgres';");
  pass(`fresh canonical replay (${migrations.length} migrations; initial-owner migration fault rollback verified)`);
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
  assert.equal((await sql(`select count(*) from public.restaurant_staff where restaurant_id=${quote(sake)} and role='owner';`)).trim(), '0');
  const bootstrapArgs = ['scripts/bootstrap-initial-owner.mjs', '--email', 'owner@local.integration', '--restaurant-slug', 'sake-street', '--allow-local'];
  const bootstrapEnv = { AVENIQ_SUPABASE_URL: `http://127.0.0.1:${apiPort}`, AVENIQ_SUPABASE_SERVICE_ROLE_KEY: serviceKey };
  const bootstrapDryRun = await node([...bootstrapArgs, '--dry-run'], bootstrapEnv);
  assert.equal(bootstrapDryRun.code, 0, bootstrapDryRun.stderr || bootstrapDryRun.stdout);
  assert.match(bootstrapDryRun.stdout, /"status":"dry_run"/);
  assert.equal((await sql(`select count(*) from public.restaurant_staff where restaurant_id=${quote(sake)};`)).trim(), '0');
  assert.doesNotMatch(`${bootstrapDryRun.stdout}${bootstrapDryRun.stderr}`, new RegExp(password));
  pass('initial owner bootstrap dry run via local GoTrue/PostgREST');
  const bootstrap = await node(bootstrapArgs, bootstrapEnv);
  assert.equal(bootstrap.code, 0, bootstrap.stderr || bootstrap.stdout);
  assert.match(bootstrap.stdout, /"action":"owner_bound"/);
  const bootstrapRepeat = await node(bootstrapArgs, bootstrapEnv);
  assert.notEqual(bootstrapRepeat.code, 0, 'repeat must explicitly fail');
  assert.match(bootstrapRepeat.stderr, /INITIAL_OWNER_ALREADY_BOUND/);
  pass('initial owner bootstrap binds once and is conflict-safe on retry');
  const bootstrapRaceRestaurant = randomUUID();
  const bootstrapRaceSlug = `bootstrap-race-${bootstrapRaceRestaurant.slice(0, 8)}`;
  await sql(`insert into public.restaurants(id,name,slug,status) values (${quote(bootstrapRaceRestaurant)},'Bootstrap race',${quote(bootstrapRaceSlug)},'active');`);
  const bootstrapRaceOne = await createUser('bootstrap-race-one@local.integration');
  const bootstrapRaceTwo = await createUser('bootstrap-race-two@local.integration');
  const [bootstrapRaceOneResult, bootstrapRaceTwoResult] = await Promise.all([
    node(['scripts/bootstrap-initial-owner.mjs', '--email', bootstrapRaceOne.email, '--restaurant-slug', bootstrapRaceSlug, '--allow-local'], bootstrapEnv),
    node(['scripts/bootstrap-initial-owner.mjs', '--email', bootstrapRaceTwo.email, '--restaurant-slug', bootstrapRaceSlug, '--allow-local'], bootstrapEnv)
  ]);
  const raceResults = [bootstrapRaceOneResult, bootstrapRaceTwoResult];
  assert.equal(raceResults.filter(result => result.code === 0).length, 1, `exactly one concurrent bootstrap may succeed: ${raceResults.map(result => result.stderr || result.stdout).join(' | ')}`);
  assert.ok(raceResults.some(result => /INITIAL_OWNER_ALREADY_BOUND/.test(`${result.stderr}${result.stdout}`)), 'the losing concurrent bootstrap must fail closed');
  assert.equal((await sql(`select count(*) from public.restaurant_staff where restaurant_id=${quote(bootstrapRaceRestaurant)} and role='owner';`)).trim(), '1');
  assert.equal((await sql(`select count(*) from public.initial_owner_bootstrap_claims where restaurant_id=${quote(bootstrapRaceRestaurant)};`)).trim(), '1');
  assert.equal((await sql(`select count(*) from public.initial_owner_bootstrap_claims c join public.restaurant_staff s on s.restaurant_id=c.restaurant_id and s.user_id=c.user_id and s.role='owner' join public.restaurants r on r.id=c.restaurant_id and r.owner_user_id=c.user_id where c.restaurant_id=${quote(bootstrapRaceRestaurant)};`)).trim(), '1');
  pass('initial owner bootstrap atomically rejects concurrent owner claims');
  assert.equal((await sql(`select count(*) from public.restaurant_staff where restaurant_id=${quote(bootstrapRaceRestaurant)};`)).trim(), '1');
  assert.equal((await sql(`select count(*) from public.platform_admins where user_id in (${quote(bootstrapRaceOne.id)},${quote(bootstrapRaceTwo.id)});`)).trim(), '0');
  assert.equal((await sql("select has_function_privilege('anon','public.claim_initial_restaurant_owner(uuid,uuid,boolean)','execute'),has_function_privilege('authenticated','public.claim_initial_restaurant_owner(uuid,uuid,boolean)','execute'),has_function_privilege('service_role','public.claim_initial_restaurant_owner(uuid,uuid,boolean)','execute');")).trim(), 'f|f|t');
  pass('bootstrap RPC ACL is service-only and race leaves no partial membership or admin privilege');
  const conflictRestaurant = randomUUID();
  await sql(`insert into public.restaurants(id,name,slug,status) values (${quote(conflictRestaurant)},'Conflict test',${quote(`conflict-${conflictRestaurant}`)},'active'); insert into public.restaurant_staff(restaurant_id,user_id,role) values (${quote(conflictRestaurant)},${quote(bootstrapRaceOne.id)},'staff');`);
  const serviceClaim = (restaurantId, userId) => api('/rest/v1/rpc/claim_initial_restaurant_owner', { method: 'POST', key: serviceKey, token: serviceKey, body: { p_restaurant_id: restaurantId, p_user_id: userId } });
  denied(await serviceClaim(conflictRestaurant, bootstrapRaceOne.id), 'existing staff membership cannot be silently escalated', /INITIAL_OWNER_MEMBERSHIP_CONFLICT/);
  denied(await serviceClaim(randomUUID(), bootstrapRaceOne.id), 'missing restaurant fails closed', /INITIAL_OWNER_RESTAURANT_NOT_FOUND/);
  denied(await serviceClaim(conflictRestaurant, randomUUID()), 'missing Auth user fails closed', /INITIAL_OWNER_USER_NOT_FOUND/);
  assert.equal((await sql(`select role from public.restaurant_staff where restaurant_id=${quote(conflictRestaurant)};`)).trim(), 'staff');
  assert.equal((await sql(`select count(*) from public.initial_owner_bootstrap_claims where restaurant_id=${quote(conflictRestaurant)};`)).trim(), '0');
  pass('failed bootstrap leaves original membership and zero claims');
  const rollbackRestaurant = randomUUID();
  await sql(`insert into public.restaurants(id,name,slug,status) values (${quote(rollbackRestaurant)},'Rollback test',${quote(`rollback-${rollbackRestaurant}`)},'active'); create function public.local_gate_reject_membership() returns trigger language plpgsql as $$ begin if new.restaurant_id=${quote(rollbackRestaurant)}::uuid then raise exception 'LOCAL_FORCED_INSERT_FAILURE'; end if; return new; end $$; create trigger local_gate_reject_membership before insert on public.restaurant_staff for each row execute function public.local_gate_reject_membership();`);
  denied(await serviceClaim(rollbackRestaurant, bootstrapRaceOne.id), 'post-claim insert failure rolls back atomically', /LOCAL_FORCED_INSERT_FAILURE/);
  assert.equal((await sql(`select (select count(*) from public.initial_owner_bootstrap_claims where restaurant_id=${quote(rollbackRestaurant)}),(select count(*) from public.restaurant_staff where restaurant_id=${quote(rollbackRestaurant)}),(select owner_user_id is null from public.restaurants where id=${quote(rollbackRestaurant)});`)).trim(), '0|0|t');
  await sql('drop trigger local_gate_reject_membership on public.restaurant_staff; drop function public.local_gate_reject_membership();');
  pass('forced failure leaves no claim, owner pointer, or partial membership');
  const secondOwner = await createUser('second-owner@local.integration');
  const invitation = await api('/rest/v1/rpc/create_restaurant_invite', { method: 'POST', token: owner.token, body: { p_restaurant_id: sake, p_email: secondOwner.email, p_role: 'owner' } });
  assert.equal(invitation.status, 200, invitation.text);
  const accepted = await api('/rest/v1/rpc/accept_restaurant_invite', { method: 'POST', token: secondOwner.token, body: { p_token: invitation.data.token } });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal((await sql(`select count(*) from public.restaurant_staff where restaurant_id=${quote(sake)} and role='owner';`)).trim(), '2');
  pass('normal approved invitation can add an additional owner after bootstrap');
  const manager = await createUser('manager@local.integration');
  const staff = await createUser('staff@local.integration');
  const kitchen = await createUser('kitchen@local.integration');
  const cashier = await createUser('cashier@local.integration');
  const outsider = await createUser('outsider@local.integration');
  await sql(`insert into public.restaurant_staff(restaurant_id,user_id,role) values (${quote(sake)},${quote(manager.id)},'manager'),(${quote(sake)},${quote(staff.id)},'staff'),(${quote(sake)},${quote(kitchen.id)},'kitchen'),(${quote(sake)},${quote(cashier.id)},'cashier');`);
  const platformCandidate = await createUser('platform-owner@local.integration');
  await sql(`insert into public.platform_admins(user_id) values (${quote(platformCandidate.id)});`);
  const platformConflict = await node(['scripts/bootstrap-initial-owner.mjs', '--email', platformCandidate.email, '--restaurant-slug', 'sake-street', '--allow-local', '--dry-run'], bootstrapEnv);
  assert.notEqual(platformConflict.code, 0, 'platform administrator bootstrap must be denied');
  assert.match(`${platformConflict.stderr}${platformConflict.stdout}`, /PLATFORM_ADMIN_CONFLICT/);
  pass('initial owner bootstrap rejects platform administrator identity');
  const session = await api('/auth/v1/user', { token: owner.token });
  assert.equal(session.status, 200); assert.equal(session.data.id, owner.id); pass('Auth password login and session acquisition');
  denied(await api('/rest/v1/rpc/claim_initial_restaurant_owner', { method: 'POST', token: owner.token, body: { p_restaurant_id: sake, p_user_id: owner.id } }), 'authenticated user cannot call initial-owner claim', /permission denied/i);
  denied(await api('/rest/v1/rpc/claim_initial_restaurant_owner', { method: 'POST', body: { p_restaurant_id: sake, p_user_id: owner.id } }), 'anonymous user cannot call initial-owner claim', /permission denied/i);
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

export async function runLocalGate() {
  try {
    await startStack();
    gatePhase = 'api-contracts';
    const state = await verifyApi();
    gatePhase = 'frontend-build';
    await startApp();
    gatePhase = 'local-browser-channel';
    completed = true;
    browserState = { appUrl: `http://127.0.0.1:${appPort}`, ownerEmail: state.owner.email, token: state.token, orderId: state.orderId };
    if (holds && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
      // Password travels only through an inherited process IPC channel, never logs.
      if (process.argv.includes('--browser-ipc')) {
        if (!process.send) throw new Error('LOCAL_BROWSER_IPC_REQUIRED');
        process.send({ ...browserState, password });
      }
      if (process.argv.includes('--browser-port')) {
        const port = Number(process.argv[process.argv.indexOf('--browser-port') + 1]);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LOCAL_BROWSER_PORT_INVALID');
        await new Promise((resolveSent, reject) => {
          // Explicit operator opt-in; loopback only, carries disposable password,
          // never the service credential. Receiver keeps it in memory only.
          const socket = createConnection({ host: '127.0.0.1', port });
          socket.once('error', reject);
          socket.once('connect', () => socket.end(JSON.stringify({ ...browserState, password })));
          socket.once('close', resolveSent);
        });
      }
      console.log(`BROWSER_READY ${JSON.stringify({ appUrl: `http://127.0.0.1:${appPort}`, ownerEmail: state.owner.email, orderId: state.orderId })}`);
      await new Promise(resolveHeld => setInterval(resolveHeld, 60_000));
    }
    console.log(`COMPLETED ${JSON.stringify({ appUrl: `http://127.0.0.1:${appPort}`, apiUrl: `http://127.0.0.1:${apiPort}`, checks })}`);
    return browserState;
  } catch (error) {
    const safeCode = ['ENOENT', 'EACCES', 'EPERM', 'ECONNREFUSED'].includes(error?.code) ? error.code : 'REJECTED';
    throw new Error(`LOCAL_SUPABASE_GATE_FAILED phase=${gatePhase} code=${safeCode}`);
  } finally {
    if ((!holds && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) || !completed) await clean();
  }
}
export async function withLocalBrowserCredentials(action) {
  if (!completed || !browserState || cleaned) throw new Error('Local gates must pass before browser credentials are used');
  return action({ ...browserState, password });
}
export const cleanupLocalGate = clean;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalGate().catch(async error => { console.error(error.message); await clean(); process.exitCode = 1; });
}
