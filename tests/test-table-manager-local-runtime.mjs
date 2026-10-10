import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { runLocalGate, withLocalBrowserCredentials, cleanupLocalGate } from '../scripts/run-local-supabase-integration-gate.mjs';

// The gate provisions only unique disposable Docker resources; it accepts no hosted config.
try {
  await runLocalGate();
  await withLocalBrowserCredentials(async ({ appUrl, ownerEmail, password }) => {
    assert.equal(new URL(appUrl).hostname, '127.0.0.1');
    const storage = new Map();
    const window = { location: { pathname: '/dashboard/sake-street/tables', search: '' },
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
    vm.runInNewContext(await (await fetch(`${appUrl}/supabase-config.js`)).text(), { window });
    assert.equal(window.TABLEORDER_SUPABASE.url, appUrl);
    vm.runInNewContext(readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8'), { window, URLSearchParams, fetch });
    const cloud = window.TableOrderCloud;
    await cloud.signInWithPassword(ownerEmail, password);
    const profile = await cloud.getStaffProfile();
    assert.equal(profile.role, 'owner');
    const before = await cloud.loadRestaurantData();
    assert.deepEqual(Array.from(before.tables, t => t.table_number).sort((a, b) => a - b), [1, 2]);
    const original = Array.from(before.tables, t => t.id).sort();
    for (const number of [3, 4, 5, 6, 7, 8, 9]) {
      const rows = await cloud.createRestaurantTable(profile.restaurantId,
        { id: `table_${1791631349333 + number}`, name: `Table ${number}` }, number);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].table_number, number);
    }
    const after = await cloud.loadRestaurantData();
    assert.deepEqual(Array.from(after.tables, t => t.table_number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(Array.from(after.tables).filter(t => t.table_number <= 2).map(t => t.id).sort(), original);
    assert.equal(after.tables.filter(t => t.is_active).length, 9);
    console.log('Table Manager local persistence: PASS (authenticated owner, Table 3–9 persisted, seeds preserved, nine active tables)');

    const authorizationEnv = { ...process.env, AVENIQ_SUPABASE_URL: appUrl,
        AVENIQ_SUPABASE_PUBLISHABLE_KEY: window.TABLEORDER_SUPABASE.publishableKey,
        AVENIQ_REQUIRE_ROLE_TESTS: '0' };
    for (const key of Object.keys(authorizationEnv)) {
      if (/^AVENIQ_(?:OWNER|MANAGER|ALLROUND|KITCHEN|CASHIER|PLATFORM)_/.test(key)) delete authorizationEnv[key];
    }
    const authorizationStatus = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/test-authorization.mjs'], {
        cwd: new URL('../', import.meta.url), env: authorizationEnv, stdio: ['ignore', 'inherit', 'inherit']
      });
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(authorizationStatus, 0, 'Disposable public authorization suite must pass');
  });
} finally {
  await cleanupLocalGate();
}
