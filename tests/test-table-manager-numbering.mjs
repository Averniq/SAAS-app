import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tenant = '20000000-0000-4000-8000-000000000001';
const requests = [];
const session = JSON.stringify({ access_token: 'fixture-owner-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: '10000000-0000-4000-8000-000000000001' } });
const window = {
  TABLEORDER_SUPABASE: { url: 'https://fixture.invalid', publishableKey: 'fixture-public-key' },
  localStorage: { getItem: () => session },
  location: { pathname: '/dashboard/sake-street/tables', search: '' }
};
vm.runInNewContext(readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8'), {
  window, URLSearchParams,
  fetch: async (url, options) => {
    assert.equal(url, 'https://fixture.invalid/rest/v1/tables');
    requests.push({ options, body: JSON.parse(options.body) });
    return { ok: true, text: async () => JSON.stringify([{ id: 'fixture-table', ...JSON.parse(options.body) }]) };
  }
});

// A timestamp local ID must never override the caller's intended sequence.
for (const number of [3, 4, 5, 6, 7, 8, 9]) {
  const table = { id: `table_${1791631349333 + number}`, name: `Table ${number}` };
  const rows = await window.TableOrderCloud.createRestaurantTable(tenant, table, number);
  const { options, body } = requests.at(-1);
  assert.equal(body.table_number, number, `Table ${number} must use its supplied sequence, not its timestamp ID`);
  assert.equal(body.sort_order, number);
  assert.equal(body.local_id, table.id);
  assert.equal(body.restaurant_id, tenant);
  assert.equal(body.table_name, table.name);
  assert.equal(body.name, table.name);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer fixture-owner-token');
  assert.equal(rows[0].table_number, number);
}

// Seed-style local identities still map to the explicit sequence supplied by management.
for (const number of [1, 2]) {
  await window.TableOrderCloud.createRestaurantTable(tenant, { id: `sake-table-${number}`, name: `Table ${number}` }, number);
  assert.equal(requests.at(-1).body.table_number, number);
}
await window.TableOrderCloud.createRestaurantTable(tenant, { id: 'table_1791631349336', name: 'First table' });
assert.equal(requests.at(-1).body.table_number, 1, 'An omitted sequence defaults to one, never timestamp digits');

// Exercise the actual Table Manager caller with the real client adapter above.
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = app.indexOf('async function addTable(event)');
const end = app.indexOf('async function deleteTable(', start);
assert.ok(start >= 0 && end > start);
const initialTables = [{ id: 'sake-table-1', name: 'Table 1' }, { id: 'sake-table-2', name: 'Table 2' }];
const input = { value: '' };
const state = { tables: [...initialTables] };
const ui = vm.createContext({ window, state, staffUser: { restaurantId: tenant },
  document: { getElementById: () => input }, allTables: () => state.tables,
  restaurant: () => ({ cloudId: tenant }), saveState() {}, render() {},
  showOrderToast(message, level) { assert.notEqual(level, 'warning', message); },
  loadCloudDataIntoApp: async () => {} });
vm.runInContext(`${app.slice(start, end)}\nthis.runAddTable = addTable;`, ui);
for (const number of [3, 4, 5, 6, 7, 8, 9]) {
  input.value = `Table ${number}`;
  await ui.runAddTable({ preventDefault() {} });
  assert.equal(requests.at(-1).body.table_number, number);
  assert.equal(requests.at(-1).body.sort_order, number);
  assert.equal(state.tables.length, number);
}
assert.equal(state.tables[0], initialTables[0]);
assert.equal(state.tables[1], initialTables[1]);
console.log('Table Manager numbering: PASS (timestamp Table 3–9, seed-style Table 1–2, sequence default, tenant/auth payload)');
