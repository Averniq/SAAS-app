import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    let failTableCreates = false;
    vm.runInNewContext(readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8'), { window, URLSearchParams,
      fetch: async (url, options) => {
        if (failTableCreates && url === `${appUrl}/rest/v1/tables` && options.method === 'POST') {
          return { ok: false, status: 400, text: async () => JSON.stringify({ message: 'Simulated failed table creation' }) };
        }
        return fetch(url, options);
      } });
    const cloud = window.TableOrderCloud;
    await cloud.signInWithPassword(ownerEmail, password);
    const profile = await cloud.getStaffProfile();
    assert.equal(profile.role, 'owner');
    const before = await cloud.loadRestaurantData();
    assert.deepEqual(Array.from(before.tables, t => t.table_number).sort((a, b) => a - b), [1, 2]);
    const original = Array.from(before.tables, t => t.id).sort();

    // Run the real UI creation and cloud-reload functions, replacing only rendering/DOM.
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const extract = (start, end) => {
      const offset = app.indexOf(start);
      const limit = app.indexOf(end, offset);
      assert.ok(offset >= 0 && limit > offset);
      return app.slice(offset, limit);
    };
    const input = { value: '' };
    const state = { restaurant: { cloudId: profile.restaurantId }, tables: [] };
    let timestamp = 1791631349336;
    let failures = 0;
    const warnings = [];
    const ui = vm.createContext({ window, state, staffUser: profile,
      document: { getElementById: id => id === 'tableName' ? input : null },
      Date: { now: () => timestamp++ }, allTables: () => state.tables, restaurant: () => state.restaurant,
      defaultRestaurant: { taxRate: 10 }, APP_ROUTE: { area: 'tables' }, lockedTableToken: '',
      isAuthenticatedDashboardRoute: () => true, tableTokenFromUrl: () => '',
      renderMenu() {}, render() {}, saveState() {}, setDatabaseStatus() {}, restorePublicOrderDraft() {},
      sakeStreetMenuPhotoUrl: () => '', optionConfigForTemplate: () => [],
      showOrderToast(message, level) { if (level === 'warning') { failures++; warnings.push(message); } } });
    vm.runInContext(`${extract('async function loadCloudDataIntoApp(options', 'function readPhotoAsDataUrl(')}
      ${extract('async function addTable(event)', 'async function deleteTable(')}
      this.reloadTables = loadCloudDataIntoApp; this.addTable = addTable;`, ui);
    assert.equal(await ui.reloadTables(), true);
    assert.equal(state.tables.length, 2);

    // Reproduce stale local-only additions, then recover through supported cloud reload.
    failTableCreates = true;
    for (const number of [3, 4, 5]) {
      input.value = `Failed Table ${number}`;
      await ui.addTable({ preventDefault() {} });
    }
    assert.equal(failures, 3);
    assert.equal(state.tables.length, 5);
    assert.equal((await cloud.loadRestaurantData()).tables.length, 2);
    failTableCreates = false;
    assert.equal(await ui.reloadTables(), true);
    assert.deepEqual(Array.from(state.tables, t => t.number), [1, 2]);
    console.log('Table Manager stale-state recovery: PASS (failed local additions cleared by cloud reload; database seeds preserved)');

    for (const number of [3, 4, 5, 6, 7, 8, 9]) {
      input.value = `Table ${number}`;
      await ui.addTable({ preventDefault() {} });
      assert.equal(failures, 3, `Table ${number} must not fail: ${warnings.at(-1) || ''}`);
      const reloaded = await cloud.loadRestaurantData();
      const table = reloaded.tables.find(t => t.table_number === number);
      assert.ok(table);
      assert.equal(table.table_name, `Table ${number}`);
      assert.equal(table.restaurant_id, profile.restaurantId);
      assert.equal(table.sort_order, number);
      assert.equal(table.is_active, true);
      assert.equal(state.tables.length, number);
    }
    const after = await cloud.loadRestaurantData();
    assert.deepEqual(Array.from(after.tables, t => t.table_number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(Array.from(after.tables).filter(t => t.table_number <= 2).map(t => t.id).sort(), original);
    assert.equal(after.tables.filter(t => t.is_active).length, 9);
    assert.equal(new Set(Array.from(after.tables, t => t.table_number)).size, 9);
    assert.ok(after.tables.every(t => t.table_number >= 1 && t.table_number <= 9));
    assert.equal(await ui.reloadTables(), true);
    assert.deepEqual(Array.from(state.tables, t => t.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    console.log('Table Manager local persistence: PASS (real UI/owner API, Table 3–9 names/tenant/sort persisted, seeds preserved, nine unique active numbers, UI reload)');

  });
} finally {
  await cleanupLocalGate();
}
