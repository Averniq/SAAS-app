import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const products = Array.from({ length: 71 }, (_, i) => ({ id: `item-${i}`, local_id: `item-${i}`, name: `Product ${i}`, category: `Category ${i % 12}`, price: 19, tags: [], is_available: true, option_config: [{ id: 'addon', name: 'Add-on', choices: [{ id: 'egg', name: 'Egg', price: 2.5 }] }] }));
const response = { restaurant: { id: 'venue', slug: 'sake-street', name: 'Sake Street', is_open: true }, tables: [], menu_items: products };
function source(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
function cloudFixture(path, result = response, status = 200) {
  const calls = [];
  const sandbox = { URLSearchParams, window: { TABLEORDER_SUPABASE: { url: 'https://fixture.invalid', publishableKey: 'fixture-key' }, location: { pathname: path, search: '' }, localStorage: { getItem: () => null } }, fetch: async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return { ok: status === 200, status, text: async () => JSON.stringify(result) };
  } };
  runInContext(client, createContext(sandbox));
  return { cloud: sandbox.window.TableOrderCloud, calls };
}
test('menu-only response bypasses staff auth and missing canonical RPCs', async () => {
  const { cloud, calls } = cloudFixture('/r/sake-street');
  const data = await cloud.loadRestaurantData();
  assert.equal(data.restaurant.name, 'Sake Street');
  assert.equal(data.menuItems.length, 71);
  assert.equal(data.tables.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fixture.invalid/rest/v1/rpc/get_public_restaurant');
  assert.deepEqual(calls[0].body, { p_slug: 'sake-street', p_table_ref: '' });
});
test('missing canonical context rejects without attempting legacy submission', async () => {
  const { cloud, calls } = cloudFixture('/order/synthetic-scope', { code: 'PGRST202', message: 'Missing function' }, 404);
  await assert.rejects(cloud.loadRestaurantData(), error => error.code === 'PGRST202');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /get_public_qr_order_context$/);
});
test('future canonical context retains canonical table and catalogue', async () => {
  const { cloud } = cloudFixture('/order/synthetic-scope', { ...response, table: { id: 'real-table', name: 'Sake Table 1', number: 1 } });
  const data = await cloud.loadRestaurantData();
  assert.equal(data.tables[0].id, 'real-table');
  assert.equal(data.menuItems.length, 71);
});

function uiFixture(area, cloud) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', value: '', disabled: false, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const storage = new Map([['aveniq-public-order:synthetic-scope', '{"cart":[{"itemId":"item-0","quantity":2}],"note":"Keep me","idempotencyKey":"11111111-1111-4111-8111-111111111111"}']]);
  const sandbox = { APP_ROUTE: { area }, customerAvailabilityState: 'loading', state: { restaurant: { name: 'Loading…', isOpen: false }, tables: [], menuItems: [], cart: [], orders: [] }, document: { getElementById: node, querySelectorAll: () => [] }, window: { TableOrderCloud: cloud }, selectedTableId: '', selectedFrontTableId: '', lockedTableToken: area === 'order' ? 'synthetic-scope' : '', defaultRestaurant: { taxRate: 10 }, activeCategory: 'All', publicOrderDraftRestored: false,
    isAuthenticatedDashboardRoute: () => false, restaurant: () => sandbox.state.restaurant, allTables: () => sandbox.state.tables, allMenuItems: () => sandbox.state.menuItems, currentTable: () => sandbox.state.tables[0], applyLockedTableSelection: () => sandbox.state.tables[0],
    escapeHtml: x => String(x), money: x => `$${x}`, itemSoldOut: () => false, normalizePhotoUrl: () => '', optionTemplateLabel: () => 'Options', optionConfigForTemplate: () => [],
    restorePublicOrderDraft() {}, saveState() {}, setDatabaseStatus() {}, renderAlsoOrdered() {}, renderBrand() { node('restaurantTitle').textContent = sandbox.state.restaurant.name; },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, console: { error() {} }
  };
  const ctx = createContext(sandbox);
  runInContext(['loadCloudDataIntoApp', 'renderTablePicker', 'renderMenu', 'renderCustomerAvailability'].map(source).join('\n'), ctx);
  sandbox.render = () => { node('restaurantTitle').textContent = sandbox.state.restaurant.name; sandbox.renderCustomerAvailability(); sandbox.renderTablePicker(); sandbox.renderMenu(); };
  return { sandbox, node, storage };
}
test('71-item zero-table menu renders without demo/table substitution and disables ordering', async () => {
  const { cloud } = cloudFixture('/r/sake-street');
  const { sandbox, node } = uiFixture('restaurant', cloud);
  assert.equal(await sandbox.loadCloudDataIntoApp({ silent: true }), true);
  assert.equal(node('restaurantTitle').textContent, 'Sake Street');
  assert.equal((node('menuGrid').innerHTML.match(/<article/g) || []).length, 71);
  assert.equal(sandbox.state.tables.length, 0);
  assert.equal(sandbox.state.restaurant.isOpen, false);
  assert.equal(node('customerTableName').textContent, 'Menu only');
  assert.doesNotMatch(node('menuGrid').innerHTML, /Demo Restaurant|Table 6/);
  assert.match(node('customerAvailability').textContent, /contact staff/i);
});
test('PGRST202 finishes loading with unavailable UI and leaves draft bytes intact', async () => {
  const { cloud, calls } = cloudFixture('/order/synthetic-scope', { code: 'PGRST202', message: 'Missing function' }, 404);
  const { sandbox, node, storage } = uiFixture('order', cloud);
  const before = JSON.stringify([...storage]);
  assert.equal(await sandbox.loadCloudDataIntoApp({ silent: true }), false);
  assert.equal(sandbox.customerAvailabilityState, 'unavailable');
  assert.match(node('customerAvailability').textContent, /temporarily unavailable/i);
  assert.doesNotMatch(node('customerTableName').textContent, /Loading|Table 6/);
  assert.equal(JSON.stringify([...storage]), before);
  assert.equal(calls.length, 1);
});
test('future canonical success re-enables real ordering without rewriting options', async () => {
  const { cloud } = cloudFixture('/order/synthetic-scope', { ...response, table: { id: 'real-table', name: 'Sake Table 1' } });
  const { sandbox, node } = uiFixture('order', cloud);
  assert.equal(await sandbox.loadCloudDataIntoApp({ silent: true }), true);
  assert.equal(sandbox.customerAvailabilityState, 'ready');
  assert.equal(sandbox.state.restaurant.isOpen, true);
  assert.equal(node('customerTableName').textContent, 'Sake Table 1');
  assert.equal(JSON.stringify(sandbox.state.menuItems[0].optionConfig), JSON.stringify(products[0].option_config));
});
test('menu loadState ignores demo tables but never changes stored cart bytes', () => {
  const saved = JSON.stringify({ tables: [{ id: 't6', name: 'Table 6' }], cart: [{ quantity: 2 }], restaurant: { name: 'Demo Restaurant' } });
  const ctx = createContext({ APP_ROUTE: { area: 'restaurant' }, MENU_VERSION: 'v1', defaultMenuItems: [], defaultRestaurant: { name: 'Demo Restaurant' }, defaultTables: [{ id: 't6' }], localStorage: { getItem: () => saved }, STORAGE_KEY: 'fixture', STYLE_VERSION: 'v1' });
  runInContext(source('loadState'), ctx);
  const state = ctx.loadState();
  assert.equal(state.tables.length, 0);
  assert.equal(state.menuItems.length, 0);
  assert.notEqual(state.restaurant.name, 'Demo Restaurant');
});
