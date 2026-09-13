import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
assert.ok(source.includes("if (!slug) {"), 'unscoped route must have an explicit selection branch');
assert.ok(source.includes("TENANT_SELECTION_REQUIRED"), 'unscoped authenticated entry must require tenant selection');
assert.ok(!source.includes("|| (!slug ? memberships[0] : null)"), 'membership ordering must not select a tenant');
assert.ok(source.includes("entry.restaurants?.slug === slug"), 'explicit tenant route must remain authorization-scoped');
console.log('App-host unscoped membership routing regression: PASS');
