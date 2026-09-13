import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/production-convergence-migrations/20260910120000_p0_deploy_01_platform_admin_dashboard_authorization_convergence.sql', import.meta.url), 'utf8');

assert.match(client, /getPlatformDashboardProfile/, 'platform dashboard entry must resolve an explicit route slug');
assert.match(client, /slug=eq\.\$\{encodeURIComponent\(slug\)\}/, 'platform lookup must scope its restaurant query to the route slug');
assert.match(client, /PLATFORM_RESTAURANT_NOT_FOUND/, 'unknown platform dashboard slugs must fail closed');
assert.match(client, /activePlatformDashboard\?\.userId === session\?\.user\?\.id/, 'a platform dashboard context must never survive into another authenticated user session');
assert.doesNotMatch(client, /memberships\[0\]/, 'platform access must never select a membership implicitly');
assert.match(app, /const master = await window\.TableOrderCloud\.getPlatformProfile\(\);/, 'dashboard entry must check platform access before staff membership');
assert.match(app, /getPlatformDashboardProfile\(route\.restaurantSlug\)/, 'dashboard entry must resolve the exact route restaurant');
assert.match(app, /platform_admin/, 'platform dashboard capability must remain explicit rather than masquerading as owner');

for (const table of ['tables', 'categories', 'menu_items', 'orders', 'order_items']) {
  assert.match(migration, new RegExp(`on public\\.${table}`, 'i'), `${table} must have an explicit platform authorization policy`);
}
for (const fn of ['update_restaurant_order_status', 'record_restaurant_order_payment', 'issue_public_qr_table_token', 'get_public_qr_table_token_metadata']) {
  assert.match(migration, new RegExp(`function public\\.${fn}`, 'i'), `${fn} must retain an explicit platform branch`);
}
assert.match(migration, /grant execute on function public\.record_restaurant_order_payment\(uuid,uuid,text\) to authenticated/i, 'the current Front Desk payment RPC must remain callable by authenticated platform administrators');
assert.match(migration, /function reporting\.assert_report_access/i, 'reports must authorize platform administrators explicitly');
assert.doesNotMatch(migration, /submit_public_qr_order\s*\(/i, 'Task 7 public submission must remain unchanged');
assert.doesNotMatch(migration, /get_public_qr_order_context\s*\(/i, 'Task 5/7 public context must remain unchanged');
console.log('Platform-admin dashboard authorization contract: PASS');
