import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => { const i = source.indexOf(start); const j = source.indexOf(end, i); assert.ok(i >= 0 && j > i); return source.slice(i, j); };
const tick = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
const row = id => ({ cloudId: id, id, tableId: 'table-a', status: 'New', items: [{ price: 10, quantity: 1 }], createdAt: '2026-09-17' });
const paid = () => ({ paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000, paidCents: 1000, remainingCents: 0 });
const ledgerOperation = (amountCents = 1000, orderId = 'order-a') => ({ id: randomUUID(), orderId, amountCents, paymentMethod: 'Card', reference: '', note: '', recordedAt: '2026-09-23T00:00:00Z', recordedBy: 'user-a' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function page(storage = new Map(), restaurantId = 'tenant-a') {
  const profile = { id: 'user-a', role: 'owner', restaurantId, restaurantSlug: restaurantId, restaurantName: restaurantId };
  const c = vm.createContext({
    APP_ROUTE: { area: 'frontdesk', restaurantSlug: restaurantId }, MENU_VERSION: 1, defaultRestaurant: {},
    isAuthenticatedDashboardRoute: () => true, isCanonicalPublicOrderRoute: () => false,
    selectedTableId: '', selectedFrontTableId: '', localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, STORAGE_KEY: 'app-state',
    paymentFinancialContext: null, staffUser: null, onboardingRestaurant: null,
    paymentSubmissionInProgress: false, paymentSubmissionGeneration: 0,
    cloudSyncTimer: null, cloudSyncBusy: false, cloudSyncInitialized: false, knownCloudOrderIds: new Set(), lastCloudSyncAt: null, soundEnabled: false,
    createPublicOrderIdempotencyKey: randomUUID, orderTotal: o => o.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    document: { getElementById: () => ({ value: '' }) },
    window: { clearInterval() {}, setInterval: () => 1, TableOrderCloud: { getPlatformProfile: async () => null, getStaffProfile: async () => profile, routeContext: () => ({ area: 'frontdesk', restaurantSlug: restaurantId }) } },
    render() {}, renderKitchen() {}, renderFrontDesk() {}, renderReports() {}, renderStaffSession() {},
    setGatewayVisible() {}, checkDatabaseConnection: async () => {}, setView() {},
    setCloudSyncStatus() {}, cloudSyncSummary() {}, showKitchenNewOrderAlert() {}, showOrderToast() {},
    cloudOrderToLocal: o => ({ ...o }), console: { warn() {} }
  });
  vm.runInContext(`${source.split('\n').find(line => line.startsWith('let state ='))}
    ${section('function saveState(', 'function money(')}
    ${section('function paymentAmountCents(', 'function tableTokenFromUrl(')}
    ${section('async function syncCloudOrders(', 'async function handleStaffLogin(')}
    ${section('async function markOrdersPaid(', 'function renderKitchen(')}
    ${section('async function continueOwnerSession(', 'function setPlatformError(')}
    function loadCloudDataIntoApp(){ saveState(); return Promise.resolve(true); }
    globalThis.getState = () => state;`, c);
  c.window.TableOrderCloud.loadOrders = async () => [row('order-a')];
  c.selectedFrontTableId = 'table-a';
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [];
  return { c, storage, profile };
}
test('actual dashboard initializer and owner-session bootstrap restore persisted UUID after catalogue save', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('response lost'); };
  await c.markOrdersPaid(c.getState().orders); await tick();
  const original = clone(c.getState().orders[0].paymentAttempt); assert.ok(original.idempotencyKey);
  const { c: reloaded } = page(storage);
  assert.equal(reloaded.getState().orders.length, 0, 'real dashboard begins with empty orders');
  assert.equal(reloaded.getState().menuItems.length, 0, 'never restore stored catalogue');
  await reloaded.continueOwnerSession(); await tick();
  assert.ok(reloaded.getState().orders[0].paymentAttempt, 'pending UUID was lost across real dashboard bootstrap');
  assert.deepEqual(clone(reloaded.getState().orders[0].paymentAttempt), original);
});
test('scope store contains only financial records and survives save before profile hydration', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('offline'); };
  await c.markOrdersPaid(c.getState().orders); await tick();
  const key = 'aveniq-payment-financial-v1:tenant-a'; const before = storage.get(key);
  assert.doesNotMatch(before, /items|menuItems|tables/);
  const { c: reloaded } = page(storage); reloaded.saveState(); assert.equal(storage.get(key), before);
  await reloaded.continueOwnerSession(); await tick(); assert.ok(reloaded.getState().orders[0].paymentAttempt);
});
test('same restaurant scope hydrates only cloud-returned order IDs and retains omitted records for later', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('lost'); };
  await c.markOrdersPaid(c.getState().orders); await tick(); const original = c.getState().orders[0].paymentAttempt.idempotencyKey;
  const { c: reloaded } = page(storage); reloaded.window.TableOrderCloud.loadOrders = async () => [row('order-b')];
  await reloaded.continueOwnerSession(); await tick(); assert.equal(reloaded.getState().orders[0].cloudId, 'order-b');
  assert.equal(reloaded.getState().orders[0].paymentAttempt, undefined);
  reloaded.window.TableOrderCloud.loadOrders = async () => [row('order-a')]; await reloaded.syncCloudOrders();
  assert.equal(reloaded.getState().orders[0].paymentAttempt.idempotencyKey, original);
});
test('different restaurant scope cannot display or reuse another tenant financial state', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('lost'); };
  await c.markOrdersPaid(c.getState().orders); await tick();
  const { c: tenantB } = page(storage, 'tenant-b'); await tenantB.continueOwnerSession(); await tick();
  assert.equal(tenantB.getState().orders[0].paymentAttempt, undefined);
  assert.equal(tenantB.getState().orders[0].paymentRestaurantId, 'tenant-b');
  assert.ok(JSON.parse(storage.get('aveniq-payment-financial-v1:tenant-a')).records['order-a'].paymentAttempt);
});
test('legacy unscoped application storage is not imported as financial proof', async () => {
  const storage = new Map([['app-state', JSON.stringify({ orders: [{ ...row('order-a'), paymentAttempt: { idempotencyKey: randomUUID(), amountCents: 1000 }, confirmedPayment: paid() }], menuItems: [{ name: 'Old tenant dish' }] })]]);
  const { c } = page(storage); await c.continueOwnerSession(); await tick();
  assert.equal(c.getState().orders[0].paymentAttempt, undefined); assert.equal(c.getState().orders[0].confirmedPayment, undefined);
  assert.equal(c.getState().menuItems.length, 0);
});
test('confirmed receipt survives actual owner-session reload', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => paid(); await c.markOrdersPaid(c.getState().orders); await tick();
  const { c: reloaded } = page(storage); reloaded.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  await reloaded.continueOwnerSession(); await tick();
  assert.equal(reloaded.getState().orders[0].status, 'Paid'); assert.equal(reloaded.getState().orders[0].paymentAttempt, undefined);
});
test('stale sync response after restaurant/profile switch cannot replace current orders', async () => {
  const { c } = page(); await c.continueOwnerSession(); await tick(); const response = deferred();
  c.window.TableOrderCloud.loadOrders = () => response.promise; const oldSync = c.syncCloudOrders();
  c.window.TableOrderCloud.getStaffProfile = async () => ({ id: 'user-b', role: 'owner', restaurantId: 'tenant-b', restaurantSlug: 'tenant-b' });
  c.window.TableOrderCloud.loadOrders = async () => [row('order-b')]; await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation(1000, 'order-b')];
  response.resolve([row('order-a')]); await oldSync;
  assert.deepEqual(Array.from(c.getState().orders, order => order.cloudId), ['order-b']);
});
test('stale payment response cannot mutate new tenant or release its active submission fence', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick(); const oldResponse = deferred(); const newResponse = deferred(); let newConfirmed = false;
  c.window.TableOrderCloud.recordAuthoritativePayment = () => oldResponse.promise; const oldPayment = c.markOrdersPaid(c.getState().orders); await tick();
  c.window.TableOrderCloud.getStaffProfile = async () => ({ id: 'user-b', role: 'cashier', restaurantId: 'tenant-b', restaurantSlug: 'tenant-b' });
  c.window.TableOrderCloud.loadOrders = async () => [row('order-b')]; await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => newConfirmed ? [ledgerOperation(1000, 'order-b')] : [];
  c.window.TableOrderCloud.recordAuthoritativePayment = () => newResponse.promise; const newPayment = c.markOrdersPaid(c.getState().orders); await tick();
  oldResponse.resolve(paid()); await oldPayment;
  assert.equal(c.paymentSubmissionInProgress, true); assert.equal(c.getState().orders[0].confirmedPayment, undefined);
  assert.ok(JSON.parse(storage.get('aveniq-payment-financial-v1:tenant-a')).records['order-a'].paymentAttempt);
  newConfirmed = true; newResponse.resolve(paid()); await newPayment; await tick(); assert.equal(c.getState().orders[0].status, 'Paid');
});
test('persistence corruption or unavailable storage blocks RPC before submission', async () => {
  for (const mode of ['corrupt', 'unavailable']) {
    const { c, storage } = page(); await c.continueOwnerSession(); await tick(); let calls = 0;
    c.window.TableOrderCloud.recordAuthoritativePayment = async () => { calls++; return paid(); };
    if (mode === 'corrupt') storage.set('aveniq-payment-financial-v1:tenant-a', '{broken');
    else c.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    await c.markOrdersPaid(c.getState().orders); await tick(); assert.equal(calls, 0);
  }
});
test('two tabs saving different order records do not overwrite each other', async () => {
  const storage = new Map(); const { c: a } = page(storage); const { c: b } = page(storage);
  b.window.TableOrderCloud.loadOrders = async () => [row('order-b')];
  await a.continueOwnerSession(); await b.continueOwnerSession(); await tick();
  a.window.TableOrderCloud.recordAuthoritativePayment = b.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('lost'); };
  await a.markOrdersPaid(a.getState().orders); await b.markOrdersPaid(b.getState().orders); await tick();
  const stored = JSON.parse(storage.get('aveniq-payment-financial-v1:tenant-a')).records;
  assert.ok(stored['order-a'].paymentAttempt); assert.ok(stored['order-b'].paymentAttempt);
});
test('observed competing same-order UUID fails closed before second RPC', async () => {
  const storage = new Map(); const { c: a } = page(storage); const { c: b } = page(storage);
  await a.continueOwnerSession(); await b.continueOwnerSession(); await tick();
  a.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('lost'); };
  await a.markOrdersPaid(a.getState().orders); await tick(); let calls = 0;
  b.window.TableOrderCloud.recordAuthoritativePayment = async () => { calls++; return paid(); };
  await b.markOrdersPaid(b.getState().orders); await tick(); assert.equal(calls, 0);
  assert.equal(JSON.parse(storage.get('aveniq-payment-financial-v1:tenant-a')).records['order-a'].paymentAttempt.idempotencyKey, a.getState().orders[0].paymentAttempt.idempotencyKey);
});
test('temporary persistence failure after canonical confirmation cannot resurrect confirmed UUID', async () => {
  const { c, storage } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  const write = c.localStorage.setItem; let rejected = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => {
    c.localStorage.setItem = (key, value) => {
      if (key.startsWith('aveniq-payment-financial-v1:') && rejected++ < 2) throw new Error('Temporary storage failure');
      write(key, value);
    };
    return paid();
  };
  await c.markOrdersPaid(c.getState().orders); await tick();
  assert.equal(c.getState().orders[0].status, 'Paid');
  assert.equal(c.getState().orders[0].paymentAttempt, undefined, 'confirmed UUID resurrected from stale disk state');
  assert.equal(JSON.parse(storage.get('aveniq-payment-financial-v1:tenant-a')).records['order-a'].paymentAttempt, undefined);
});
test('public-route staff sync and logout preserve unsent local and tracked customer orders', async () => {
  const { c, profile } = page(); c.APP_ROUTE.area = 'customer'; c.isAuthenticatedDashboardRoute = () => false;
  c.getState().orders.push({ id: 'unsent', cloudStatus: 'local', status: 'New', items: [] }, { id: 'tracked', cloudId: 'tracked-cloud', customerTracked: true, status: 'New', items: [] });
  c.staffUser = profile; c.startCloudOrderSync(); await tick();
  assert.ok(c.getState().orders.some(order => order.id === 'unsent'), 'staff login/sync discarded unsent customer order');
  assert.ok(c.getState().orders.some(order => order.id === 'tracked'), 'staff login/sync discarded tracked customer order');
  c.stopCloudOrderSync();
  assert.deepEqual(Array.from(c.getState().orders, order => order.id).sort(), ['tracked', 'unsent']);
});
test('confirmed partial UUID does not clear a distinct subsequent ambiguous attempt', async () => {
  const { c } = page(); await c.continueOwnerSession(); await tick();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation(500)];
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => ({ ...paid(), paymentStatus: 'partial', remainingCents: 500 });
  await c.markOrdersPaid(c.getState().orders); await tick();
  const confirmedKey = c.getState().orders[0].confirmedPayment.idempotencyKey;
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('Next payment response lost'); };
  await c.markOrdersPaid(c.getState().orders); await tick();
  const pendingKey = c.getState().orders[0].paymentAttempt.idempotencyKey;
  assert.notEqual(pendingKey, confirmedKey); await c.syncCloudOrders();
  assert.equal(c.getState().orders[0].paymentAttempt.idempotencyKey, pendingKey);
  assert.equal(c.getState().orders[0].paymentAttempt.amountCents, 500);
});
