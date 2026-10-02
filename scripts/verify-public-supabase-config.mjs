#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { validateSupabaseOrigin, isPublishableCredential, isServiceCredential } from './supabase-origin.mjs';

function value(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${flag} is required.`);
  return process.argv[index + 1];
}

try {
const baseUrl = new URL(value('--base-url'));
const expectedUrl = new URL(validateSupabaseOrigin(value('--expected-url'), { allowLocal: process.argv.includes('--allow-local') }));
assert.equal(expectedUrl.pathname, '/', '--expected-url must be an origin-only Supabase URL');
assert.equal(expectedUrl.search, '', '--expected-url must not contain a query string');
assert.equal(expectedUrl.hash, '', '--expected-url must not contain a fragment');
const response = await fetch(new URL('/supabase-config.js', baseUrl), { redirect: 'error' });
assert.equal(response.status, 200, `served config returned ${response.status}`);
const source = await response.text();
if (isServiceCredential(source)) throw new Error('served config contains forbidden service-role or secret material');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { timeout: 1000 });
const config = context.window.TABLEORDER_SUPABASE;
assert.ok(config?.url && config?.publishableKey, 'served config must include URL and publishable key');
const configuredUrl = new URL(validateSupabaseOrigin(config.url, { allowLocal: process.argv.includes('--allow-local') }));
assert.equal(configuredUrl.pathname, '/', 'served config URL must be an origin-only Supabase URL');
assert.equal(configuredUrl.search, '', 'served config URL must not contain a query string');
assert.equal(configuredUrl.hash, '', 'served config URL must not contain a fragment');
assert.equal(configuredUrl.origin, expectedUrl.origin, 'served config targets the wrong Supabase project');
assert.ok(isPublishableCredential(config.publishableKey), 'served config contains an invalid or service credential');
console.log(`PUBLIC_SUPABASE_CONFIG_VERIFIED origin=${expectedUrl.origin}`);
} catch {
  console.error('PUBLIC_SUPABASE_CONFIG_REJECTED: invalid origin-only URL, public credential, or served configuration');
  process.exitCode = 1;
}
