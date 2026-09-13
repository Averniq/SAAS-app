#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const harness = resolve(root, 'scripts', 'run-task6-token-concurrency.mjs');
assert.ok(existsSync(harness), 'Task 6 independent-session concurrency harness must exist');
const source = readFileSync(harness, 'utf8');
assert.match(source, /Promise\.all/, 'harness must launch independent issuance sessions concurrently');
assert.match(source, /ISSUANCE_CONCURRENCY_GREEN/, 'harness must prove final token and audit invariants');
assert.match(source, /rollback/i, 'harness must prove no audit residue from a rolled-back issuance');
assert.doesNotMatch(source, /console\.log\([^)]*token/i, 'harness must not emit plaintext token values');
console.log('Task 6 concurrency harness regression: PASS');
