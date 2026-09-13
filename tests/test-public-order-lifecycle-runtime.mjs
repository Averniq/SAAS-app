import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

// Execute the real lifecycle functions with an in-memory DOM/storage boundary.
// No browser profile, customer credential, HTTP request, or database is used.
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function source(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `function ${name} exists`);
  const end = app.indexOf('\n}', start) + 2;
  return app.slice(start, end);
}
const functions = ['isCanonicalPublicOrderRoute', 'publicOrderDraftStorageKey',
  'createPublicOrderIdempotencyKey', 'isValidPublicOrderIdempotencyKey',
  'publicOrderDraftNote', 'persistPublicOrderDraft', 'restorePublicOrderDraft',
  'clearPublicOrderDraft', 'submitOrder'];
function fixture(storage = new Map()) {
  const note = { value: 'Preserve this note' };
  const item = { id: 'ramen', cloudId: 'test-menu-id', name: 'Ramen', price: 19 };
  const sandbox = {
    crypto: webcrypto, APP_ROUTE: { area: 'order' }, lockedTableToken: 'synthetic-test-scope',
    PUBLIC_ORDER_DRAFT_STORAGE_PREFIX: 'aveniq-public-order:',
    publicOrderIdempotencyKey: '', publicOrderDraftRestored: false,
    publicOrderSubmissionInProgress: false, selectedTableId: 'table1', lastConfirmedOrderId: '',
    state: { cart: [{ itemId: 'ramen', quantity: 2, options: [{ groupId: 'addon', choiceId: 'egg', price: 2.5 }] }], orders: [] },
    document: { getElementById: () => note },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    restaurant: () => ({ isOpen: true, cloudId: 'venue', taxRate: 10 }),
    allTables: () => [{ id: 'table1', cloudId: 'table' }],
    cartEntries: () => sandbox.state.cart.map(line => ({ ...line, item, unitPrice: 21.5 })),
    cartTotal: () => 43, cartTax: () => 3.91, subtotalBeforeTax: () => 39.09,
    nowLabel: () => 'now', closeReviewOrder() {}, applyLockedTableSelection: () => true,
    loadCloudDataIntoApp: async () => true, renderCart() {}, renderCustomerOrderStatus() {}, syncCustomerOrderStatuses() {},
    showOrderSuccessModal() {}, showOrderToast: message => sandbox.messages.push(message), messages: [],
    console: { error() {} }, window: { TableOrderCloud: {} }
  };
  const context = createContext(sandbox);
  runInContext(functions.map(source).join('\n'), context);
  sandbox.saveState = () => sandbox.persistPublicOrderDraft();
  sandbox.persistPublicOrderDraft();
  return { sandbox, storage, note };
}

const failed = fixture();
const originalKey = failed.sandbox.publicOrderIdempotencyKey;
const originalCart = JSON.stringify(failed.sandbox.state.cart);
let attempts = [];
failed.sandbox.window.TableOrderCloud.submitOrder = async order => {
  attempts.push(order.idempotencyKey);
  throw new Error('response lost after server commit');
};
await failed.sandbox.submitOrder();
assert.equal(failed.sandbox.publicOrderIdempotencyKey, originalKey);
assert.equal(JSON.stringify(failed.sandbox.state.cart), originalCart);
assert.equal(failed.sandbox.state.orders.length, 0);
assert.equal(failed.note.value, 'Preserve this note');
assert.match(failed.sandbox.messages.at(-1), /may have reached the kitchen/);
assert.equal(failed.sandbox.publicOrderSubmissionInProgress, false);

// Recreate page memory, preserving only the token-scoped draft storage.
const restored = fixture(new Map());
restored.storage.clear();
for (const [key, value] of failed.storage) restored.storage.set(key, value);
restored.sandbox.state.cart = [];
restored.sandbox.publicOrderIdempotencyKey = '';
restored.sandbox.restorePublicOrderDraft();
assert.equal(restored.sandbox.publicOrderIdempotencyKey, originalKey);
assert.equal(JSON.stringify(restored.sandbox.state.cart), originalCart);
assert.equal(restored.note.value, 'Preserve this note');
restored.sandbox.window.TableOrderCloud.submitOrder = async order => {
  attempts.push(order.idempotencyKey);
  return { id: 'canonical-order', number: 12 };
};
await restored.sandbox.submitOrder();
await restored.sandbox.submitOrder();
assert.deepEqual(attempts, [originalKey, originalKey]);
assert.equal(restored.sandbox.state.orders.length, 1);
assert.equal(restored.sandbox.state.cart.length, 0);
assert.equal(restored.sandbox.publicOrderIdempotencyKey, '');
assert.equal(restored.storage.size, 0);
assert.equal(restored.note.value, '');
restored.sandbox.state.cart = JSON.parse(originalCart);
restored.sandbox.persistPublicOrderDraft();
assert.notEqual(restored.sandbox.publicOrderIdempotencyKey, originalKey, 'next logical order receives a new UUID');

const legacy = fixture();
const legacyStorageKey = legacy.sandbox.publicOrderDraftStorageKey();
const legacyDraft = JSON.parse(legacy.storage.get(legacyStorageKey));
legacyDraft.idempotencyKey = 'ord_synthetic_legacy';
legacy.storage.set(legacyStorageKey, JSON.stringify(legacyDraft));
legacy.sandbox.restorePublicOrderDraft();
assert.ok(legacy.sandbox.isValidPublicOrderIdempotencyKey(legacy.sandbox.publicOrderIdempotencyKey));
assert.equal(JSON.stringify(legacy.sandbox.state.cart), originalCart);
assert.equal(JSON.parse(legacy.storage.get(legacyStorageKey)).idempotencyKey, legacy.sandbox.publicOrderIdempotencyKey);
const scoped = fixture();
const scopeOne = scoped.sandbox.publicOrderDraftStorageKey();
scoped.sandbox.lockedTableToken = 'different-synthetic-test-scope';
assert.notEqual(scoped.sandbox.publicOrderDraftStorageKey(), scopeOne);

const cleared = fixture();
const clearHandler = app.match(/document\.getElementById\("clearCart"\)\.addEventListener\("click", (\(\) => \{[\s\S]*?\n  \})\);/);
assert.ok(clearHandler, 'use the actual Clear Cart event handler');
runInContext(`(${clearHandler[1]})()`, createContext(cleared.sandbox));
assert.equal(cleared.sandbox.publicOrderIdempotencyKey, '');
assert.equal(cleared.storage.size, 0);

const corrupt = fixture();
corrupt.storage.set(corrupt.sandbox.publicOrderDraftStorageKey(), '{');
assert.doesNotThrow(() => corrupt.sandbox.restorePublicOrderDraft());

// Duplicate confirmation while table recovery is awaiting must also be fenced.
const race = fixture();
let release;
let ready = false;
let submits = 0;
race.sandbox.applyLockedTableSelection = () => ready;
race.sandbox.loadCloudDataIntoApp = () => new Promise(resolve => { release = () => { ready = true; resolve(true); }; });
race.sandbox.window.TableOrderCloud.submitOrder = async () => { submits++; return { id: 'one-order', number: 13 }; };
const first = race.sandbox.submitOrder();
await race.sandbox.submitOrder();
release();
await first;
assert.equal(submits, 1);
assert.equal(race.sandbox.state.orders.length, 1);
assert.equal(race.sandbox.publicOrderSubmissionInProgress, false);

for (const throws of [false, true]) {
  const unavailable = fixture();
  unavailable.sandbox.applyLockedTableSelection = () => false;
  unavailable.sandbox.loadCloudDataIntoApp = async () => { if (throws) throw new Error('offline'); return false; };
  await unavailable.sandbox.submitOrder();
  assert.equal(unavailable.sandbox.publicOrderSubmissionInProgress, false);
  assert.equal(unavailable.sandbox.state.cart.length, 1);
}
console.log('Public order lifecycle runtime: PASS (ambiguous recovery, refresh, same UUID retry, cleanup, repeated/preflight concurrent confirm)');
