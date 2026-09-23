import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// Runs the current production functions, with deterministic transport and storage.
// It does not start a browser, contact any service, or mutate a database.
// This suite was introduced by 61f2033; its RED baseline is that commit's parent.
const source = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', 'd2c008bf8b90d4d4490807e40e998b4e0eb9cf59:app.js'], { encoding: 'utf8' })
  : readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const paid = (extra = {}) => ({ paymentId: randomUUID(), paymentStatus: 'paid', amountCents: 1000, paidCents: 1000, remainingCents: 0, ...extra });
const order = (cloudId = 'order-a') => ({ id: cloudId, cloudId, paymentRestaurantId: 'tenant-a', status: 'New', total: 10, tableId: 'table-a', createdAt: '2026-09-17T00:00:00Z', items: [{ name: 'Test dish', price: 10, quantity: 1 }] });
const ledgerOperation = (amountCents = 1000, orderId = 'order-a') => ({ id: randomUUID(), orderId, amountCents, paymentMethod: 'Card', reference: '', note: '', recordedAt: '2026-09-23T00:00:00Z', recordedBy: 'owner-a' });
function harness() {
  const storage = new Map();
  const fields = new Map(['paymentMethod', 'paymentReference', 'paymentNote', 'markPaid', 'printInvoice'].map(id => [id, { value: id === 'paymentMethod' ? 'Card' : '', addEventListener() {} }]));
  const panel = { set innerHTML(value) { this.html = value; for (const [id, field] of fields) field.value = id === 'paymentMethod' ? 'Card' : ''; } };
  fields.set('invoicePanel', panel);
  const c = vm.createContext({
    staffUser: { role: 'owner', restaurantId: 'tenant-a' }, state: { orders: [order()] },
    isAuthenticatedDashboardRoute: () => true,
    paymentSubmissionInProgress: false, paymentSubmissionGeneration: 0,
    paymentFinancialContext: null, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    cloudSyncBusy: false, cloudSyncInitialized: false, knownCloudOrderIds: new Set(),
    lastCloudSyncAt: null, soundEnabled: false, selectedFrontTableId: 'table-a',
    createPublicOrderIdempotencyKey: randomUUID,
    orderTotal: o => o.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    document: { getElementById: id => fields.get(id) },
    window: { TableOrderCloud: {} }, snapshots: [], messages: [],
    render() {}, renderKitchen() {}, renderFrontDesk() {}, renderReports() {},
    setCloudSyncStatus() {}, cloudSyncSummary() {}, showKitchenNewOrderAlert() {},
    cloudOrderToLocal: row => ({ ...row }), console: { warn() {} },
    allTables: () => [{ id: 'table-a', name: 'Test table' }], restaurant: () => ({ name: 'Fixture restaurant' }),
    money: String, escapeHtml: String, optionSummary: () => '', printInvoice() {},
    orderSubtotal: o => o.total, orderTax: () => 0,
  });
  vm.runInContext(`function saveState(){ if (typeof persistPaymentFinancialState === 'function') persistPaymentFinancialState(); snapshots.push(JSON.stringify(state.orders)); }
    function showOrderToast(message){ messages.push(message); }
    function openOrdersForTable(){ return state.orders.filter(o => o.status !== 'Paid'); }
    ${section('function paymentAmountCents(', 'function tableTokenFromUrl(')}
    ${section('async function syncCloudOrders(', 'function startCloudOrderSync(')}
    ${section('async function updateOrderStatus(', 'async function markOrdersPaid(')}
    ${section('async function markOrdersPaid(', 'function renderKitchen(')}
    ${section('function renderInvoice(', 'const REPORT_TAB_LABELS')}`, c);
  if (c.beginPaymentFinancialSession) c.beginPaymentFinancialSession(c.staffUser);
  c.state.orders = [order()];
  c.window.TableOrderCloud.loadOrders = async () => clone(c.state.orders);
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [];
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => paid();
  return { c, fields };
}

test('01 response lost: retry replays exactly one server operation', async () => {
  const { c } = harness(); const ledger = new Map(); const sent = []; let lost = true;
  c.window.TableOrderCloud.recordAuthoritativePayment = async (_, attempt) => {
    sent.push(JSON.stringify(attempt));
    if (!ledger.has(attempt.idempotencyKey)) ledger.set(attempt.idempotencyKey, paid());
    if (lost) { lost = false; throw new Error('HTTP response lost after commit'); }
    return ledger.get(attempt.idempotencyKey);
  };
  await c.markOrdersPaid(c.state.orders); await tick();
  const key = c.state.orders[0].paymentAttempt.idempotencyKey;
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(ledger.size, 1); assert.equal(sent[0], sent[1]);
  assert.ok(key); assert.equal(c.state.orders[0].paymentAttempt, undefined);
});
test('02 refresh attempted while committed response waits is fenced', async () => {
  const { c } = harness(); const response = deferred(); let reads = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = () => response.promise;
  c.window.TableOrderCloud.loadOrders = async () => { reads++; return clone(c.state.orders); };
  const pending = c.markOrdersPaid(c.state.orders);
  await c.syncCloudOrders(); assert.equal(reads, 0);
  response.resolve(paid()); await pending; await tick(); assert.equal(c.state.orders[0].status, 'Paid');
});
test('03 refresh begun before payment cannot overwrite confirmation', async () => {
  const { c } = harness(); const response = deferred();
  c.window.TableOrderCloud.loadOrders = () => response.promise;
  const refresh = c.syncCloudOrders(); await c.markOrdersPaid(c.state.orders);
  response.resolve([order()]); await refresh; assert.equal(c.state.orders[0].status, 'Paid');
});
test('04 refreshes cannot complete out of order because only one runs', async () => {
  const { c } = harness(); const response = deferred(); let reads = 0;
  c.window.TableOrderCloud.loadOrders = () => { reads++; return response.promise; };
  const first = c.syncCloudOrders(); await c.syncCloudOrders();
  assert.equal(reads, 1); response.resolve([order()]); await first;
});
test('05 mixed batch clears confirmed attempt and keeps ambiguous attempt', async () => {
  const { c } = harness(); c.state.orders.push(order('order-b'));
  c.window.TableOrderCloud.recordAuthoritativePayment = async id => { if (id === 'order-b') throw new Error('response lost'); return paid(); };
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(c.state.orders[0].status, 'Paid'); assert.equal(c.state.orders[0].paymentAttempt, undefined);
  assert.ok(c.state.orders[1].paymentAttempt); assert.notEqual(c.state.orders[1].status, 'Paid');
});
test('06 retry after interruption keeps amount, method, note and reference', async () => {
  const { c, fields } = harness(); fields.get('paymentNote').value = 'Bank transfer'; fields.get('paymentReference').value = 'REF-1';
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('interruption'); };
  await c.markOrdersPaid(c.state.orders, 'Other'); await tick(); const initial = JSON.stringify(c.state.orders[0].paymentAttempt);
  fields.get('paymentNote').value = 'Changed'; fields.get('paymentReference').value = 'REF-2'; let actual;
  c.window.TableOrderCloud.recordAuthoritativePayment = async (_, attempt) => { actual = JSON.stringify(attempt); return paid(); };
  await c.markOrdersPaid(c.state.orders, 'Cash'); assert.equal(actual, initial);
});
test('07 reload restores pending attempt and reuses the UUID', async () => {
  const { c } = harness(); c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('offline'); };
  await c.markOrdersPaid(c.state.orders); await tick(); const stored = c.snapshots.at(-1);
  const { c: reloaded } = harness(); reloaded.state.orders = JSON.parse(stored); let sent;
  reloaded.window.TableOrderCloud.recordAuthoritativePayment = async (_, attempt) => { sent = attempt.idempotencyKey; return paid(); };
  await reloaded.markOrdersPaid(reloaded.state.orders); assert.equal(sent, JSON.parse(stored)[0].paymentAttempt.idempotencyKey);
});
test('08 projection with pending UUID retains attempt until exact canonical replay', async () => {
  const { c } = harness(); c.window.TableOrderCloud.recordAuthoritativePayment = async () => { throw new Error('response lost'); };
  await c.markOrdersPaid(c.state.orders); await tick(); const key = c.state.orders[0].paymentAttempt.idempotencyKey;
  c.window.TableOrderCloud.loadOrders = async () => [{ ...order(), status: 'Paid', payment: { method: 'Card', paidAt: '2026-09-17' } }];
  await c.syncCloudOrders(); assert.equal(c.state.orders[0].paymentAttempt.idempotencyKey, key);
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => paid({ idempotentReplay: true });
  await c.markOrdersPaid(c.state.orders); await tick(); assert.equal(c.state.orders[0].paymentAttempt, undefined);
});
test('09 canonical ledger refresh cannot reopen confirmed order', async () => {
  const { c } = harness(); c.window.TableOrderCloud.loadOrders = async () => [order()];
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(c.state.orders[0].status, 'Paid', 'post-confirmation refresh must preserve authoritative confirmation');
});
test('10 duplicate click sends one RPC and creates one UUID', async () => {
  const { c } = harness(); const response = deferred(); let calls = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = () => { calls++; return response.promise; };
  const first = c.markOrdersPaid(c.state.orders); await c.markOrdersPaid(c.state.orders);
  response.resolve(paid()); await first; assert.equal(calls, 1);
});
test('11 rendering failure after canonical success is not reported as payment failure', async () => {
  const { c } = harness(); let renders = 0;
  c.render = () => { if (++renders === 2) throw new Error('UI rendering failed after commit'); };
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(c.state.orders[0].status, 'Paid'); assert.equal(c.state.orders[0].paymentAttempt, undefined);
  assert.equal(c.messages.some(message => message.includes('Payment was not confirmed')), false, 'must distinguish committed payment from subsequent UI callback failure');
});
test('12 three orders reconcile independent results in request order', async () => {
  const { c } = harness(); c.state.orders.push(order('order-b'), order('order-c'));
  const responses = [deferred(), deferred(), deferred()]; let i = 0;
  c.window.TableOrderCloud.recordAuthoritativePayment = () => responses[i++].promise;
  const batch = c.markOrdersPaid(c.state.orders);
  responses[2].resolve(paid()); responses[0].resolve(paid()); responses[1].reject(new Error('lost'));
  await batch; await tick(); assert.deepEqual(Array.from(c.state.orders, o => o.status), ['Paid', 'New', 'Paid']);
});
test('confirmed partial response clears UUID without falsely marking order Paid', async () => {
  // Client line total is $10; authoritative total is $15 (e.g. a stale client).
  // The server accepted the sent 1000 cents and truthfully reports $5 remaining.
  const { c } = harness(); const unresolvedLedger = deferred();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = () => unresolvedLedger.promise;
  c.window.TableOrderCloud.recordAuthoritativePayment = async () => paid({ paymentStatus: 'partial', amountCents: 1000, paidCents: 1000, remainingCents: 500 });
  await c.markOrdersPaid(c.state.orders);
  assert.notEqual(c.state.orders[0].status, 'Paid');
  assert.equal(c.state.orders[0].payment.paidAt, null);
  assert.equal(c.state.orders[0].paymentAttempt, undefined, 'confirmed partial success is not ambiguous and must not replay forever');
});
test('invoice refresh preserves unsubmitted method, note and reference', async () => {
  const { c, fields } = harness(); c.renderInvoice();
  fields.get('paymentMethod').value = 'Other'; fields.get('paymentNote').value = 'Approved bank transfer'; fields.get('paymentReference').value = 'REF-9';
  c.renderFrontDesk = () => c.renderInvoice(); await c.syncCloudOrders();
  assert.equal(fields.get('paymentMethod').value, 'Other');
  assert.equal(fields.get('paymentNote').value, 'Approved bank transfer');
  assert.equal(fields.get('paymentReference').value, 'REF-9');
});
test('currency cents handles decimal item prices without fractional cents', () => {
  const { c } = harness();
  for (const [prices, expected] of [[[0.1, 0.2], 30], [[19, 2.5], 2150], [[10.01, 10.02], 2003]]) {
    assert.equal(c.paymentAmountCents({ items: prices.map(price => ({ price, quantity: 1 })) }), expected);
  }
  for (const price of [0, -1, Infinity, NaN]) assert.throws(() => c.paymentAmountCents({ items: [{ price, quantity: 1 }] }));
});
test('confirmed partial receipt survives stale refresh and next attempt uses remaining cents with new UUID', async () => {
  const { c } = harness(); const sent = []; const unresolvedLedger = deferred();
  c.window.TableOrderCloud.listAuthoritativePaymentOperations = () => unresolvedLedger.promise;
  c.window.TableOrderCloud.loadOrders = async () => [order()];
  c.window.TableOrderCloud.recordAuthoritativePayment = async (_, attempt) => {
    sent.push(clone(attempt));
    return sent.length === 1
      ? paid({ paymentStatus: 'partial', amountCents: 1000, paidCents: 1000, remainingCents: 500 })
      : paid({ amountCents: 500, paidCents: 1500 });
  };
  await c.markOrdersPaid(c.state.orders);
  assert.equal(c.state.orders[0].confirmedPayment.paidCents, 1000);
  assert.equal(c.state.orders[0].confirmedPayment.remainingCents, 500);
  assert.equal(c.state.orders[0].status, 'New');
  c.renderInvoice();
  assert.match(c.document.getElementById('invoicePanel').html, /Remaining after confirmed payments/);
  await c.markOrdersPaid(c.state.orders);
  assert.equal(sent[1].amountCents, 500); assert.notEqual(sent[0].idempotencyKey, sent[1].idempotencyKey);
  assert.equal(c.state.orders[0].status, 'Paid');
});
test('confirmed receipt persists across app reload through canonical ledger hydration', async () => {
  const { c } = harness(); c.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  await c.markOrdersPaid(c.state.orders); await tick();
  const { c: reloaded } = harness(); reloaded.state.orders = JSON.parse(c.snapshots.at(-1));
  reloaded.window.TableOrderCloud.loadOrders = async () => [order()];
  reloaded.window.TableOrderCloud.listAuthoritativePaymentOperations = async () => [ledgerOperation()];
  await reloaded.syncCloudOrders(); assert.equal(reloaded.state.orders[0].status, 'Paid');
  assert.equal(reloaded.state.orders[0].confirmedPayment.remainingCents, 0);
});
test('legacy paid timestamps alone do not assert ledger-confirmed Paid', () => {
  const { c } = harness(); c.dateLabel = value => value;
  vm.runInContext(section('function cloudOrderToLocal(', 'async function syncCloudOrders('), c);
  const converted = c.cloudOrderToLocal({ id: 'order-a', status: 'completed', table_id: 'table-a', paid_at: '2026-09-17', payment_method: 'Cash', order_items: [] });
  assert.equal(converted.status, 'Served'); assert.equal(converted.confirmedPayment, undefined);
});
test('invoice payment fields do not transfer to a different table', () => {
  const { c, fields } = harness(); c.renderInvoice();
  fields.get('paymentMethod').value = 'Other'; fields.get('paymentNote').value = 'Table A only'; fields.get('paymentReference').value = 'A';
  c.allTables = () => [{ id: 'table-a', name: 'A' }, { id: 'table-b', name: 'B' }]; c.selectedFrontTableId = 'table-b';
  c.renderInvoice();
  assert.equal(fields.get('paymentMethod').value, 'Card'); assert.equal(fields.get('paymentNote').value, ''); assert.equal(fields.get('paymentReference').value, '');
});
test('manual Paid status invocation is denied before mutation or RPC regardless of casing', async () => {
  const { c } = harness(); let calls = 0; c.window.TableOrderCloud.updateOrderStatus = async () => { calls++; };
  for (const status of ['Paid', 'paid', 'PAID', ' Paid ']) await c.updateOrderStatus('order-a', status);
  assert.equal(calls, 0); assert.equal(c.state.orders[0].status, 'New'); assert.equal(c.snapshots.length, 0);
});
test('repeated render failure after success settles without losing confirmed receipt', async () => {
  const { c } = harness(); let renders = 0;
  c.render = () => { if (++renders > 1) throw new Error('persistent render failure'); };
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(c.state.orders[0].confirmedPayment.paymentStatus, 'paid');
  assert.equal(c.state.orders[0].paymentAttempt, undefined); assert.equal(c.paymentSubmissionInProgress, false);
  assert.match(c.messages[0], /Payment was recorded/);
});
test('cloud list omission cannot discard a pending UUID or confirmed receipt', async () => {
  const { c } = harness(); c.state.orders.push(order('order-b'));
  c.window.TableOrderCloud.recordAuthoritativePayment = async id => { if (id === 'order-b') throw new Error('lost'); return paid(); };
  c.window.TableOrderCloud.loadOrders = async () => [];
  await c.markOrdersPaid(c.state.orders); await tick();
  assert.equal(c.state.orders.length, 2);
  assert.equal(c.state.orders.find(o => o.cloudId === 'order-a').confirmedPayment.paymentStatus, 'paid');
  assert.ok(c.state.orders.find(o => o.cloudId === 'order-b').paymentAttempt.idempotencyKey);
});
