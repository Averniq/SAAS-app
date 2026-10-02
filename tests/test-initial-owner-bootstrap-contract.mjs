#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const serviceRoleSentinel = [Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'), Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'), 'signature'].join('.');
const requested = [];
let platformAdmin = false;
let existingOwner = false;
const server = createServer(async (request, response) => {
  const body = await new Promise(resolve => { let value = ''; request.on('data', chunk => { value += chunk; }); request.on('end', () => resolve(value)); });
  requested.push({ method: request.method, url: request.url, body, authorization: request.headers.authorization || '' });
  response.setHeader('content-type', 'application/json');
  if (request.method === 'GET' && request.url.startsWith('/rest/v1/restaurants?')) return response.end(JSON.stringify([{ id: '11111111-1111-1111-1111-111111111111', slug: 'sake-street' }]));
  if (request.method === 'GET' && request.url.startsWith('/auth/v1/admin/users')) return response.end(JSON.stringify({ users: [{ id: '22222222-2222-2222-2222-222222222222', email: 'owner@example.invalid' }] }));
  if (request.method === 'POST' && request.url === '/rest/v1/rpc/claim_initial_restaurant_owner') {
    if (platformAdmin) { response.statusCode = 409; return response.end(JSON.stringify({ message: 'PLATFORM_ADMIN_CONFLICT' })); }
    if (existingOwner) { response.statusCode = 409; return response.end(JSON.stringify({ message: 'INITIAL_OWNER_ALREADY_BOUND' })); }
    const payload = JSON.parse(body);
    return response.end(JSON.stringify({ action: payload.p_dry_run ? 'would_bind_owner' : 'owner_bound' }));
  }
  response.statusCode = 500; response.end(JSON.stringify({ message: `unexpected ${request.method} ${request.url}` }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const args = ['scripts/bootstrap-initial-owner.mjs', '--email', 'owner@example.invalid', '--restaurant-slug', 'sake-street', '--allow-local'];
const env = { ...process.env, AVENIQ_SUPABASE_URL: `http://127.0.0.1:${port}`, AVENIQ_SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel };
function runBootstrap({ dryRun = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args, ...(dryRun ? ['--dry-run'] : [])], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
    child.once('error', reject); child.once('close', status => resolve({ status, stdout, stderr }));
  });
}
try {
  const bootstrapSource = readFileSync(new URL('../scripts/bootstrap-initial-owner.mjs', import.meta.url), 'utf8');
  assert.match(bootstrapSource, /validateSupabaseOrigin\(url, \{ allowLocal \}\)/, 'bootstrap must validate the hosted/loopback origin before sending its service credential');
  const dryRun = await runBootstrap({ dryRun: true });
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /"status":"dry_run"/);
  assert.doesNotMatch(`${dryRun.stdout}${dryRun.stderr}`, /service_role|signature/);
  assert.ok(requested.some(entry => entry.method === 'POST' && entry.url === '/rest/v1/rpc/claim_initial_restaurant_owner' && /"p_dry_run":true/.test(entry.body)), 'dry run must validate the atomic claim without mutation');
  assert.ok(requested.every(entry => entry.authorization === `Bearer ${serviceRoleSentinel}`), 'operator requests must use the runtime service credential');
  requested.length = 0; platformAdmin = true;
  const denied = await runBootstrap({ dryRun: true });
  assert.notEqual(denied.status, 0, 'platform administrator identity must never become the bootstrap owner');
  assert.match(`${denied.stderr}${denied.stdout}`, /PLATFORM_ADMIN_CONFLICT/);
  requested.length = 0; platformAdmin = false; existingOwner = true;
  const ownerConflict = await runBootstrap();
  assert.notEqual(ownerConflict.status, 0, 'a different existing owner must block bootstrap');
  assert.match(`${ownerConflict.stderr}${ownerConflict.stdout}`, /INITIAL_OWNER_ALREADY_BOUND/);
  assert.ok(!requested.some(entry => entry.method === 'POST' && entry.url === '/auth/v1/admin/users'), 'bootstrap must never provision an Auth user');
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Initial owner bootstrap contract: PASS');
