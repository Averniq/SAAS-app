#!/usr/bin/env node
import assert from 'node:assert/strict';
import { localPg17ServiceExclusions } from '../scripts/materialize-p0-deploy-01-convergence-workspace.mjs';

assert.ok(localPg17ServiceExclusions.includes('vector'), 'PG17-only materialization must exclude the unrelated Vector service');
assert.ok(localPg17ServiceExclusions.includes('gotrue'), 'PG17-only materialization must retain its existing auth-service exclusion');

console.log('P0-DEPLOY-01 local PG17 service selection regression: PASS');
