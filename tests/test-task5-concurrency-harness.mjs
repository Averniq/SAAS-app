#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const harness = resolve(root, 'scripts', 'run-task5-public-qr-concurrency.mjs');

assert.ok(existsSync(harness), 'Task 5 independent-session concurrency harness must exist');
const source = readFileSync(harness, 'utf8');
assert.doesNotMatch(source, /on\s+conflict\s*\(\s*table_id\s*\)/i, 'a DEFERRABLE table_id constraint cannot be an ON CONFLICT arbiter');
assert.match(source, /update\s+public\.public_order_tokens/i, 'harness must use compatible UPDATE-then-INSERT seed logic');
assert.match(source, /TASK5_SEED_VERIFIED/, 'harness must verify its seed before launching races');
assert.match(source, /Promise\.all/, 'harness must launch genuinely independent sessions concurrently');
console.log('Task 5 concurrency harness regression: PASS');
