import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start); const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing ${start}`); return source.slice(from, to);
};
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = () => ({ id: 'order-a', cloudId: 'order-a', paymentRestaurantId: 'tenant-a', status: 'New', total: 10, tableId: 'table-a', items: [{ price: 10, quantity: 1 }] });
const operation = (amountCents, extra = {}) => ({ id: randomUUID(), orderId: 'order-a', amountCents, paymentMethod: 'Card', reference: '', note: '', recordedAt: '2026-09-23T00:00:00Z', recordedBy: 'owner-a', ...extra });

function page({ storage = new Map(), operations = [], cloudRow = row() } = {}) {
  let currentOperations = operations;
  const fields = new Map(['paymentMethod', 'paymentReference', 'paymentNote'].map(id => [id, { value: id === 'paymentMethod' ? 'Card' : '', addEventListener() {} }]));
  const c = vm.createContext({
    APP_ROUTE: { area: 'frontdesk', restaurantSlug: 'tenant-a' }, MENU_VERSION: 1, defaultRestaurant: {}, selectedTableId: '', selectedFrontTableId: 'table-a',
    staffUser: null, onboardingRestaurant: null, paymentFinancialContext: null, paymentSubmissionInProgress: false, paymentSubmissionGeneration: 0,
    cloudSyncBusy: false, cloudSyncInitialized: false, knownCloudOrderIds: new Set(), lastCloudSyncAt: null, cloudSyncTimer: null, soundEnabled: false,
    isAuthenticatedDashboardRoute: () => true, isCanonicalPublicOrderRoute: () => false, STORAGE_KEY: 'state',
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    createPublicOrderIdempotencyKey: randomUUID, orderTotal: order => order.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    document: { getElementById: id => fields.get(id) || { value: '' } }, window: { clearInterval() {}, setInterval: () => 1, TableOrderCloud: {} },
    cloudOrderToLocal: value => ({ ...value }), render() {}, renderKitchen() {}, renderFrontDesk() {}, renderReports() {}, renderStaffSession() {},
    setCloudSyncStatus() {}, cloudSyncSummary() {}, showKitchenNewOrderAlert() {}, showOrderToast() {}, console: { warn() {} }
  });
  vm.runInContext(`${source.split('\n').find(line => line.startsWith('let state ='))}
    function saveState(){ persistPaymentFinancialState(); }
    ${section('function paymentAmountCents(', 'function tableTokenFromUrl(')}
    ${section('async function syncCloudOrders(', 'function startCloudOrderSync(')}
    ${section('async function markOrdersPaid(', 'function renderKitchen(')}
    globalThis.getOrders = () => state.orders;`, c);
  const profile = { id: 'owner-a', role: 'owner', restaurantId: 'tenant-a', restaurantSlug: 'tenant-a' };
  c.staffUser = profile; c.beginPaymentFinancialSession(profile);
  c.window.TableOrderCloud.loadOrders = async () => [clone(cloudRow)];
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => clone(currentOperations);
  let submittedIdempotencyKey = null;
  c.window.TableOrderCloud.recordAuthoritativePayment = async (_orderId, attempt) => {
    submittedIdempotencyKey = attempt.idempotencyKey;
    const error = new Error('P0001 PAYMENT_EXCEEDS_REMAINING_BALANCE');
    error.code = 'P0001';
    throw error;
  };
  return { c, storage, submittedIdempotencyKey: () => submittedIdempotencyKey, setOperations: (next) => { currentOperations = next; } };
}

test('fresh device hydrates a fully paid order from the canonical ledger', async () => {
  const { c } = page({ operations: [operation(1000)] });
  await c.syncCloudOrders();
  assert.equal(c.getOrders()[0].status, 'Paid');
  assert.equal(c.getOrders()[0].confirmedPayment.remainingCents, 0);
});

test('fresh device derives a partial remaining balance from canonical operations', async () => {
  const { c } = page({ operations: [operation(400)] });
  await c.syncCloudOrders();
  assert.equal(c.getOrders()[0].confirmedPayment.paymentStatus, 'partial');
  assert.equal(c.paymentAmountCents(c.getOrders()[0]), 600);
});

test('hydration uses the cloud order total instead of stale item-line totals', async () => {
  const { c } = page({ cloudRow: { ...row(), total: 15 }, operations: [operation(1000)] });
  await c.syncCloudOrders();
  assert.equal(c.getOrders()[0].confirmedPayment.paymentStatus, 'partial');
  assert.equal(c.paymentAmountCents(c.getOrders()[0]), 500);
});

test('second terminal reconciles payment recorded by another terminal before payment', async () => {
  const { c } = page({ operations: [operation(1000)] });
  await c.syncCloudOrders();
  assert.equal(c.getOrders()[0].status, 'Paid');
});

test('ledger hydration preserves an unresolved locally persisted UUID', async () => {
  const storage = new Map(); const pending = { idempotencyKey: randomUUID(), amountCents: 1000, method: 'Card', reference: '', note: '' };
  storage.set('aveniq-payment-financial-v1:tenant-a', JSON.stringify({ restaurantId: 'tenant-a', records: { 'order-a': { paymentAttempt: pending } } }));
  const { c } = page({ storage, operations: [operation(400)] });
  await c.syncCloudOrders();
  assert.deepEqual(clone(c.getOrders()[0].paymentAttempt), pending);
  assert.equal(c.getOrders()[0].confirmedPayment.remainingCents, 600);
});

test('canonical ledger state overrides stale local confirmed payment proof', async () => {
  const storage = new Map();
  storage.set('aveniq-payment-financial-v1:tenant-a', JSON.stringify({ restaurantId: 'tenant-a', records: { 'order-a': { confirmedPayment: { paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000, paidCents: 1000, remainingCents: 0, method: 'Card', confirmedAt: '2026-09-22T00:00:00Z' } } } }));
  const { c } = page({ storage, operations: [operation(400)] });
  await c.syncCloudOrders();
  assert.equal(c.getOrders()[0].status, 'New');
  assert.equal(c.getOrders()[0].confirmedPayment.remainingCents, 600);
});

test('overpayment conflict reconciles first, then retires the known-rejected UUID', async () => {
  const { c, submittedIdempotencyKey, setOperations } = page();
  await c.syncCloudOrders();
  setOperations([operation(400)]);
  await c.markOrdersPaid(c.getOrders()); await tick();
  assert.equal(c.getOrders()[0].paymentAttempt, undefined);
  assert.ok(submittedIdempotencyKey());
  assert.equal(c.getOrders()[0].confirmedPayment.remainingCents, 600);
  setOperations([operation(400), operation(600)]);
  let replacementKey = null;
  c.window.TableOrderCloud.recordAuthoritativePayment = async (_orderId, attempt) => {
    replacementKey = attempt.idempotencyKey;
    return { paymentId: randomUUID(), amountCents: 600, paidCents: 1000, remainingCents: 0, paymentStatus: 'paid' };
  };
  await c.markOrdersPaid(c.getOrders());
  assert.notEqual(replacementKey, submittedIdempotencyKey());
  assert.equal(c.getOrders()[0].status, 'Paid');
});
