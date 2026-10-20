import {readFile} from 'node:fs/promises'; import assert from 'node:assert/strict';
const sql=await readFile(new URL('../supabase/migrations/021_sample_qr_test_order_activation.sql',import.meta.url),'utf8');
for(const term of ['is_sample','public_order_tokens','gen_random_bytes(32)','digest(raw','create_onboarding_test_order','is_test_order','activate_current_venue','ACTIVE_ENTITLEMENT_REQUIRED']) assert.match(sql,new RegExp(term.replace(/[()]/g,'\\$&')));
assert.match(sql,/on conflict\(restaurant_id,local_id\) do nothing/); assert.match(sql,/ONBOARDING_ACCESS_DENIED/); console.log('Task 6 structural checks passed.');
