#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
const client = readFileSync(resolve(root, 'supabase-client.js'), 'utf8');

assert.doesNotMatch(app, /function\s+tableOrderingLink\s*\(/, 'legacy deterministic table links must be removed');
assert.doesNotMatch(app, /\/order\/\$\{encodeURIComponent\([^)]*slug[^)]*\)\}\/\$\{encodeURIComponent\(/, 'active slug/table customer URL generation must be removed');
assert.doesNotMatch(app, /\/order\/\$\{encodeURIComponent\([^)]*slug[^)]*\)\}\/table-1/, 'Platform must not invent table-1');
assert.match(app, /\/order\/\$\{encodeURIComponent\(token\)\}/, 'token-only customer URL construction is required');
assert.match(client, /issuePublicQrTableToken/, 'canonical QR issuer wrapper is required');
assert.match(client, /getPublicQrOrderContext/, 'canonical public context wrapper is required');
assert.match(client, /submitPublicQrOrder/, 'canonical public submit wrapper is required');
assert.match(client, /getPublicQrOrderStatus/, 'canonical public status wrapper is required');
assert.doesNotMatch(client, /rpc\/get_public_restaurant/, 'legacy context RPC must not remain active');
assert.doesNotMatch(client, /rpc\/submit_order/, 'legacy submit RPC must not remain active');
assert.doesNotMatch(client, /rpc\/get_customer_order_status/, 'legacy status RPC must not remain active');
console.log('Task 5 token UI cutover regression: PASS');
