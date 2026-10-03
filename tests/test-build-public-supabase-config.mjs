#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const cwd = fileURLToPath(root);
const serviceRoleSentinel = ['sb', 'secret', 'adversarial_runtime_only'].join('_');
const serviceJwtSentinel = [Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'), Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'), 'signature'].join('.');

function build(overrides = {}) {
  return spawnSync(process.execPath, ['scripts/build-site.mjs'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CONTEXT: '', AVENIQ_PUBLIC_CONFIG_MODE: '', AVENIQ_SUPABASE_URL: '', AVENIQ_SUPABASE_PUBLISHABLE_KEY: '', ...overrides }
  });
}

function generatedConfig() {
  const source = readFileSync(new URL('../dist/supabase-config.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  return { source, config: context.window.TABLEORDER_SUPABASE };
}

function assertSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
}

// Regressions: Netlify preview contexts and local development must not inherit
// the checked-in hosted backend, even when a development override is supplied.
for (const overrides of [
  { CONTEXT: 'deploy-preview' },
  { CONTEXT: 'branch-deploy' },
  { CONTEXT: 'deploy-preview', AVENIQ_PUBLIC_CONFIG_MODE: 'development' },
  { CONTEXT: 'branch-deploy', AVENIQ_PUBLIC_CONFIG_MODE: 'development' },
  { CONTEXT: 'deploy-preview', AVENIQ_PUBLIC_CONFIG_MODE: 'production' },
  { CONTEXT: 'branch-deploy', AVENIQ_PUBLIC_CONFIG_MODE: 'production' },
  { AVENIQ_PUBLIC_CONFIG_MODE: 'preview' },
  { AVENIQ_PUBLIC_CONFIG_MODE: 'development' },
  {}
]) {
  const disabled = build({ ...overrides, AVENIQ_SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel });
  assertSuccess(disabled, 'unconfigured preview/development must publish a safe disabled artifact');
  const { source, config } = generatedConfig();
  assert.equal(config.url, '', 'unconfigured preview must have no backend URL');
  assert.equal(config.publishableKey, '', 'unconfigured preview must have no backend credential');
  assert.ok(!source.includes(serviceRoleSentinel));
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /Backend disabled/i);
  assert.doesNotMatch(html, /<script\b|<iframe\b|<link\b|https?:\/\//i, 'disabled entrypoint must not load the app or external resources');
  assert.match(html, /connect-src 'none'/, 'disabled entrypoint must prohibit connections');
  let requests = 0;
  const browser = vm.createContext({ window: { TABLEORDER_SUPABASE: config, localStorage: { getItem: () => null } }, fetch: () => { requests++; throw new Error('unexpected request'); } });
  vm.runInContext(readFileSync(new URL('../dist/supabase-client.js', import.meta.url), 'utf8'), browser);
  await assert.rejects(browser.window.TableOrderCloud.request('restaurants'), /configuration is missing/i);
  await assert.rejects(browser.window.TableOrderCloud.signInWithPassword('local@example.invalid', 'unused-test-value'), /configuration is missing/i);
  assert.equal(requests, 0, 'even directly invoked disabled REST/Auth clients must make zero requests');
  const checkedIn = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(new URL('../supabase-config.js', import.meta.url), 'utf8'), checkedIn);
  for (const file of readdirSync(new URL('../dist/', import.meta.url), { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const content = readFileSync(`${file.parentPath}/${file.name}`, 'utf8');
    for (const value of [checkedIn.window.TABLEORDER_SUPABASE.url, checkedIn.window.TABLEORDER_SUPABASE.publishableKey, serviceRoleSentinel]) {
      assert.ok(!value || !content.includes(value), 'disabled artifact must exclude checked-in backend and service credentials');
    }
  }
}

for (const context of ['deploy-preview', 'branch-deploy']) {
  const explicit = build({ CONTEXT: context, AVENIQ_SUPABASE_URL: 'https://disposable-preview.supabase.co', AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_disposable_preview' });
  assertSuccess(explicit, 'Netlify preview must accept a validated explicit disposable pair');
  assert.equal(generatedConfig().config.url, 'https://disposable-preview.supabase.co');
  assert.equal(generatedConfig().config.publishableKey, 'sb_publishable_disposable_preview');
  assert.notEqual(build({ CONTEXT: context, AVENIQ_SUPABASE_URL: 'https://disposable-preview.supabase.co' }).status, 0, 'incomplete preview pair must fail closed');
  assert.notEqual(build({ CONTEXT: context, AVENIQ_SUPABASE_URL: 'https://disposable-preview.supabase.co/rest/v1', AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_disposable_preview' }).status, 0, 'preview pair must use strict origin validation');
  const secretRejected = build({ CONTEXT: context, AVENIQ_SUPABASE_URL: 'https://disposable-preview.supabase.co', AVENIQ_SUPABASE_PUBLISHABLE_KEY: serviceRoleSentinel });
  assert.notEqual(secretRejected.status, 0);
  assert.ok(!`${secretRejected.stdout}${secretRejected.stderr}`.includes(serviceRoleSentinel));
}

const production = build({
  CONTEXT: 'production',
  AVENIQ_PUBLIC_CONFIG_MODE: 'production',
  AVENIQ_SUPABASE_URL: 'https://new-project.supabase.co',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new_project',
  AVENIQ_SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel
});
assertSuccess(production, 'production build must accept complete public config');
const configured = generatedConfig();
assert.equal(configured.config.url, 'https://new-project.supabase.co');
assert.equal(configured.config.publishableKey, 'sb_publishable_new_project');
assert.equal(configured.source.includes(serviceRoleSentinel), false, 'build output must never contain the service-role value');
for (const file of readdirSync(new URL('../dist/', import.meta.url), { recursive: true, withFileTypes: true })) {
  if (file.isFile()) assert.equal(readFileSync(`${file.parentPath}/${file.name}`).includes(Buffer.from(serviceRoleSentinel)), false, 'dist file must not contain runtime service secret');
}
for (const file of ['scripts/build-site.mjs','scripts/bootstrap-initial-owner.mjs','scripts/supabase-origin.mjs','scripts/verify-public-supabase-config.mjs','scripts/run-local-supabase-integration-gate.mjs','docs/production-clean-state-cutover-runbook-2026-10-02.md','supabase/migrations/20261003090000_initial_owner_bootstrap_claim.sql','tests/test-cutover-credential-safety.mjs','tests/test-build-public-supabase-config.mjs','tests/test-initial-owner-bootstrap-contract.mjs','tests/test-initial-owner-bootstrap-database-contract.mjs']) {
  assert.equal(readFileSync(new URL(`../${file}`, import.meta.url)).includes(Buffer.from(serviceRoleSentinel)), false, 'intended source file must not contain runtime service secret');
}

const productionMissingPublicValue = build({
  AVENIQ_PUBLIC_CONFIG_MODE: 'production',
  AVENIQ_SUPABASE_URL: '',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: ''
});
assert.notEqual(productionMissingPublicValue.status, 0, 'explicit production mode must fail closed without public config');
assert.match(`${productionMissingPublicValue.stderr}${productionMissingPublicValue.stdout}`, /AVENIQ_SUPABASE_URL.*AVENIQ_SUPABASE_PUBLISHABLE_KEY/i);

const netlifyProductionMissingPublicValue = build({
  CONTEXT: 'production', AVENIQ_PUBLIC_CONFIG_MODE: '', AVENIQ_SUPABASE_URL: '', AVENIQ_SUPABASE_PUBLISHABLE_KEY: ''
});
assert.notEqual(netlifyProductionMissingPublicValue.status, 0, 'Netlify production context must fail closed without public config');

const netlifyProductionPreviewOverride = build({
  CONTEXT: 'production', AVENIQ_PUBLIC_CONFIG_MODE: 'preview', AVENIQ_SUPABASE_URL: '', AVENIQ_SUPABASE_PUBLISHABLE_KEY: ''
});
assert.notEqual(netlifyProductionPreviewOverride.status, 0, 'a production deployment must not be downgraded to preview mode by an override');

const netlifyProductionDevelopmentOverride = build({
  CONTEXT: 'production', AVENIQ_PUBLIC_CONFIG_MODE: 'development',
  AVENIQ_SUPABASE_URL: 'https://new-project.supabase.co', AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new_project'
});
assert.notEqual(netlifyProductionDevelopmentOverride.status, 0, 'even a complete pair must not downgrade Production to development');

const productionServiceRole = build({
  AVENIQ_PUBLIC_CONFIG_MODE: 'production',
  AVENIQ_SUPABASE_URL: 'https://new-project.supabase.co',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: serviceJwtSentinel
});
assert.notEqual(productionServiceRole.status, 0, 'a service-role credential must be rejected as a publishable key');
assert.match(`${productionServiceRole.stderr}${productionServiceRole.stdout}`, /service credential|publishable key/i);

const productionSecretKey = build({
  AVENIQ_PUBLIC_CONFIG_MODE: 'production',
  AVENIQ_SUPABASE_URL: 'https://new-project.supabase.co',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: serviceRoleSentinel
});
assert.notEqual(productionSecretKey.status, 0, 'a modern Supabase secret key must never be emitted as a publishable key');
assert.ok(!`${productionSecretKey.stdout}${productionSecretKey.stderr}`.includes(serviceRoleSentinel), 'failed build must not disclose secret');
assert.match(`${productionSecretKey.stderr}${productionSecretKey.stdout}`, /service credential|publishable key/i);

const pathBearingUrl = build({
  AVENIQ_PUBLIC_CONFIG_MODE: 'production',
  AVENIQ_SUPABASE_URL: 'https://new-project.supabase.co/rest/v1',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new_project'
});
assert.notEqual(pathBearingUrl.status, 0, 'a path-bearing Supabase URL would produce doubled API paths and must fail closed');
assert.match(`${pathBearingUrl.stderr}${pathBearingUrl.stdout}`, /origin-only/i);

const preview = build({
  AVENIQ_PUBLIC_CONFIG_MODE: 'preview',
  AVENIQ_SUPABASE_URL: 'http://127.0.0.1:54321',
  AVENIQ_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview_key'
});
assertSuccess(preview, 'preview build must allow its explicit disposable public config');
assert.deepEqual(JSON.parse(JSON.stringify(generatedConfig().config)), {
  url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_preview_key', restaurantSlug: '', staffUsername: '', staffEmail: ''
});

let servedConfig = readFileSync(new URL('../dist/supabase-config.js', import.meta.url));
const server = createServer((request, response) => {
  if (request.url === '/supabase-config.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end(servedConfig);
    return;
  }
  response.writeHead(404); response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
function verifyServedConfig() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-public-supabase-config.mjs', '--base-url', `http://127.0.0.1:${port}`, '--expected-url', 'http://127.0.0.1:54321', '--allow-local'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.once('error', reject);
    child.once('close', status => resolve({ status, stdout, stderr }));
  });
}
try {
  const verify = await verifyServedConfig();
  assertSuccess(verify, 'served public config verification');
  assert.match(verify.stdout, /PUBLIC_SUPABASE_CONFIG_VERIFIED/);
  servedConfig = "window.TABLEORDER_SUPABASE={url:'http://127.0.0.1:54321/rest/v1',publishableKey:'sb_publishable_preview_key'};";
  const pathRejected = await verifyServedConfig();
  assert.notEqual(pathRejected.status, 0, 'served verifier must reject a path-bearing URL even when its origin matches');
  assert.match(`${pathRejected.stdout}${pathRejected.stderr}`, /origin-only/i);
  servedConfig = `window.TABLEORDER_SUPABASE={url:'http://127.0.0.1:54321',publishableKey:'${serviceRoleSentinel}'};`;
  const secretRejected = await verifyServedConfig();
  assert.notEqual(secretRejected.status, 0, 'served verifier must reject a modern secret key');
  assert.match(`${secretRejected.stdout}${secretRejected.stderr}`, /PUBLIC_SUPABASE_CONFIG_REJECTED/i);
  assert.ok(!`${secretRejected.stdout}${secretRejected.stderr}`.includes(serviceRoleSentinel), 'verifier must not disclose secret');
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('Build-time public Supabase config: PASS');
