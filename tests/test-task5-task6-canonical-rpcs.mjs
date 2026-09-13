import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const task5 = readFileSync(new URL('../supabase/production-convergence-migrations/20260906120000_p0_deploy_01_task5_public_qr_convergence.sql', import.meta.url), 'utf8');
const task6 = readFileSync(new URL('../supabase/production-convergence-migrations/20260906120100_p0_deploy_01_task6_token_issuance_rotation.sql', import.meta.url), 'utf8');
for (const name of ['assert_public_qr_ordering_entitlement','get_public_qr_order_context','submit_public_qr_order','get_public_qr_order_status']) assert.match(task5, new RegExp(`function public\\.${name}`));
assert.match(task5, /name_snapshot,base_price,unit_price,category_snapshot/, 'public submission must satisfy immutable order-item snapshot columns');
assert.match(task6, /function public\.issue_public_qr_table_token/);
assert.match(task6, /extensions\.gen_random_bytes\(32\)/, 'issuer must resolve random-byte generation through the installed extension schema');
console.log('Task 5/6 canonical RPC regression: PASS');
