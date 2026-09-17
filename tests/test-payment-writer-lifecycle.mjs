import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function harness(role = 'owner') {
  const order = { cloudId: 'order-a', status: 'New', total: 10, items: [{ price: 10, quantity: 1 }] };
  const c = vm.createContext({
    staffUser: { role, restaurantId: 'tenant-a' }, state: { orders: [order] },
    paymentSubmissionInProgress: false, paymentSubmissionGeneration: 0,
    cloudSyncBusy: false, cloudSyncInitialized: false, knownCloudOrderIds: new Set(),
    lastCloudSyncAt: null, soundEnabled: false,
    createPublicOrderIdempotencyKey: randomUUID,
    orderTotal: (o) => o.items.reduce((s, i) => s + i.price * i.quantity, 0),
    document: { getElementById: () => ({ value: '' }) },
    window: { TableOrderCloud: {} }, snapshots: [], messages: [],
    render() {}, renderKitchen() {}, renderFrontDesk() {}, renderReports() {},
    setCloudSyncStatus() {}, cloudSyncSummary() {}, showKitchenNewOrderAlert() {},
    cloudOrderToLocal: (o) => ({ ...o }),
  });
  vm.runInContext(`function saveState(){ snapshots.push(JSON.stringify(state.orders)); }
    function showOrderToast(message){ messages.push(message); }
    ${section('function paymentAmountCents(', 'function tableTokenFromUrl(')}
    ${section('async function syncCloudOrders(', 'function startCloudOrderSync(')}
    ${section('async function markOrdersPaid(', 'function renderKitchen(')}`, c);
  c.window.TableOrderCloud.loadOrders = async () => JSON.parse(JSON.stringify(c.state.orders));
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => ({ paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000 });
  return c;
}
for (const role of ['staff', 'platform_admin', 'kitchen', 'customer']) test(`${role} is denied before submission`, async () => {
  const c = harness(role); let calls = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { calls++; };
  await c.markOrdersPaid(c.state.orders);
  assert.equal(calls, 0); assert.match(c.messages[0], /permission is not available/);
});
for (const role of ['owner', 'manager', 'cashier']) test(`${role} confirmed payment clears UUID`, async () => {
  const c = harness(role); await c.markOrdersPaid(c.state.orders);
  assert.equal(c.state.orders[0].status, 'Paid'); assert.equal(c.state.orders[0].paymentAttempt, undefined);
});
test('ambiguous failure retains identical payload and UUID across refresh with payment metadata', async () => {
  const c = harness();
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('network lost'); };
  await c.markOrdersPaid(c.state.orders);
  const pending = JSON.stringify(c.state.orders[0].paymentAttempt);
  c.window.TableOrderCloud.loadOrders = async () => [{ cloudId: 'order-a', status: 'New', payment: { method: 'Card', paidAt: null }, items: [{ price: 10, quantity: 1 }] }];
  await c.syncCloudOrders({ notify: false });
  assert.equal(JSON.stringify(c.state.orders[0].paymentAttempt), pending);
  await c.markOrdersPaid(c.state.orders);
  assert.equal(JSON.stringify(c.state.orders[0].paymentAttempt), pending);
});
test('batch partial failure clears successful attempt and retains failed attempt', async () => {
  const c = harness(); c.state.orders.push({ ...c.state.orders[0], cloudId: 'order-b' });
  c.window.TableOrderCloud.recordAuthoritativePayment = async (id) => {
    if (id === 'order-b') throw new Error('network lost');
    return { paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000 };
  };
  await c.markOrdersPaid(c.state.orders);
  assert.equal(c.state.orders[0].status, 'Paid');
  assert.equal(c.state.orders[0].paymentAttempt, undefined);
  assert.ok(c.state.orders[1].paymentAttempt);
});
test('duplicate confirm during pending response submits once', async () => {
  const c = harness(); let finish; let calls = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = () => { calls++; return new Promise(r => { finish = r; }); };
  const pending = c.markOrdersPaid(c.state.orders); await c.markOrdersPaid(c.state.orders);
  finish({ paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000 }); await pending;
  assert.equal(calls, 1);
});
test('stale cloud response cannot overwrite a newly confirmed payment', async () => {
  const c = harness(); let finish;
  c.window.TableOrderCloud.loadOrders = () => new Promise(r => { finish = r; });
  const sync = c.syncCloudOrders({ notify: false });
  await c.markOrdersPaid(c.state.orders);
  finish([{ cloudId: 'order-a', status: 'New', items: [{ price: 10, quantity: 1 }] }]); await sync;
  assert.equal(c.state.orders[0].status, 'Paid');
});
test('failure does not release fence before another batch request settles', async () => {
  const c = harness(); c.state.orders.push({ ...c.state.orders[0], cloudId: 'order-b' });
  let finish; let calls = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = (id) => {
    calls++;
    if (id === 'order-a') return Promise.reject(new Error('network lost'));
    return new Promise(r => { finish = r; });
  };
  const pending = c.markOrdersPaid(c.state.orders);
  await new Promise(r => setImmediate(r));
  assert.equal(c.paymentSubmissionInProgress, true);
  await c.markOrdersPaid(c.state.orders); assert.equal(calls, 2);
  finish({ paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000 });
  await pending;
  assert.equal(c.paymentSubmissionInProgress, false);
  assert.equal(c.state.orders[1].paymentAttempt, undefined);
});
test('reload retries exact persisted payload despite new form selections', async () => {
  const first = harness();
  first.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('response lost'); };
  await first.markOrdersPaid(first.state.orders, 'Cash');
  const saved = first.snapshots.at(-1);
  const second = harness(); second.state.orders = JSON.parse(saved); let sent;
  second.window.TableOrderCloud.recordAuthoritativePayment = async (id, attempt) => {
    sent = JSON.stringify(attempt);
    return { paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000 };
  };
  await second.markOrdersPaid(second.state.orders, 'Card');
  assert.equal(sent, JSON.stringify(JSON.parse(saved)[0].paymentAttempt));
  assert.equal(second.state.orders[0].paymentAttempt, undefined);
});
test('a projection alone cannot clear an ambiguous attempt', async () => {
  const c = harness(); c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('response lost'); };
  await c.markOrdersPaid(c.state.orders);
  const key = c.state.orders[0].paymentAttempt.idempotencyKey;
  c.window.TableOrderCloud.loadOrders = async () => [{ cloudId: 'order-a', status: 'Paid', payment: { method: 'Card', paidAt: '2026-09-17' } }];
  await c.syncCloudOrders({ notify: false });
  assert.equal(c.state.orders[0].paymentAttempt.idempotencyKey, key);
  assert.equal(c.state.orders[0].status, 'New');
});
