import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/production-convergence-migrations/20260906120000_p0_deploy_01_task5_public_qr_convergence.sql', import.meta.url), 'utf8');
assert.equal(sql.includes('TASK5_SUBMISSION_NOT_YET_IMPLEMENTED'), false, 'submit RPC must be runtime complete');
assert.equal(sql.includes("raise exception 'PUBLIC_ORDER_NOT_FOUND'; end $$"), false, 'status RPC must query token-scoped order');
console.log('Task 5 runtime placeholder regression: PASS');
