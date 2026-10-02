import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrapInitialOwner } from '../scripts/bootstrap-initial-owner.mjs';
import { validateSupabaseOrigin } from '../scripts/supabase-origin.mjs';

const secret = ['sb', 'secret', 'adversarial_runtime_only'].join('_');
const options = { serviceKey: secret, email: 'owner@example.invalid', restaurantSlug: 'sake-street' };
const invalid = ['http://example.com', 'https://example.com', 'https://project.supabase.co.attacker.example', 'https://supabase.co.attacker.example', 'https://project.supabase.co/rest/v1', 'https://project.supabase.co/other', 'https://project.supabase.co/a/..', 'https://project.supabase.co?x=1', 'https://project.supabase.co#x', 'https://user:pass@project.supabase.co', 'not a url', 'https://project.supabase.co:444', 'http://192.168.1.2:54321'];
for (const url of invalid) {
  let requests = 0;
  await assert.rejects(bootstrapInitialOwner({ ...options, url, allowLocal: true }, async () => { requests++; }), /SUPABASE_URL_INVALID/);
  assert.equal(requests, 0, 'untrusted destination must receive zero requests');
}
for (const url of ['http://127.1:54321', 'http://2130706433:54321', 'http://0x7f000001:54321']) assert.throws(() => validateSupabaseOrigin(url, { allowLocal: true }), /SUPABASE_URL_INVALID/);
assert.equal(validateSupabaseOrigin('https://project.supabase.co/'), 'https://project.supabase.co');
for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
  assert.equal(validateSupabaseOrigin(url, { allowLocal: true }), url);
  assert.throws(() => validateSupabaseOrigin(url), /SUPABASE_URL_INVALID/);
}
for (const fetchImpl of [async () => { throw new Error(secret); }, async () => new Response(JSON.stringify({ message: secret }), { status: 500 })]) {
  let failure;
  try { await bootstrapInitialOwner({ ...options, url: 'https://project.supabase.co' }, fetchImpl); }
  catch (error) { failure = String(error); }
  assert.equal(typeof failure, 'string', 'unexpected remote/transport response must fail');
  assert.equal(failure.includes(secret), false, 'error must not echo credential');
  assert.match(failure, /INITIAL_OWNER_(TRANSPORT|REMOTE)_FAILURE/);
}
let attackerHits = 0;
const attacker = createServer((req, res) => { attackerHits++; res.end('unexpected'); });
await new Promise(resolve => attacker.listen(0, '127.0.0.1', resolve));
const redirector = createServer((req, res) => { res.writeHead(307, { location: `http://127.0.0.1:${attacker.address().port}/` }); res.end(secret); });
await new Promise(resolve => redirector.listen(0, '127.0.0.1', resolve));
try {
  await assert.rejects(bootstrapInitialOwner({ ...options, url: `http://127.0.0.1:${redirector.address().port}`, allowLocal: true }), /TRANSPORT_FAILURE/);
  assert.equal(attackerHits, 0, 'redirect destination must receive no credential request');
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/bootstrap-initial-owner.mjs', '--allow-local', '--email', options.email, '--restaurant-slug', options.restaurantSlug], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, AVENIQ_SUPABASE_URL: `http://127.0.0.1:${redirector.address().port}`, AVENIQ_SUPABASE_SERVICE_ROLE_KEY: secret }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
  });
  assert.notEqual(output.code, 0);
  assert.equal(output.stdout.includes(secret), false);
  assert.equal(output.stderr.includes(secret), false);
  assert.equal(attackerHits, 0);
} finally {
  await Promise.all([new Promise(resolve => redirector.close(resolve)), new Promise(resolve => attacker.close(resolve))]);
}
console.log('Cutover URL and credential safety: PASS');
