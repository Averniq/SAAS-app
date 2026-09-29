import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const start = app.indexOf('function kitchenActionsFor(');
const end = app.indexOf('\nfunction ', start + 1);
assert.ok(start >= 0, 'Kitchen action policy must be a named pure helper');
const kitchenActionsFor = new Function(`${app.slice(start, end)}; return kitchenActionsFor;`)();

assert.deepEqual(kitchenActionsFor('New', 'kitchen'), [{ status: 'Preparing', label: 'Start Preparing', primary: true }]);
assert.deepEqual(kitchenActionsFor('New', 'owner'), [
  { status: 'Preparing', label: 'Start Preparing', primary: true },
  { status: 'Cancelled', label: 'Cancel', danger: true }
]);
assert.deepEqual(kitchenActionsFor('Preparing', 'manager'), [
  { status: 'Ready', label: 'Mark Ready', primary: true },
  { status: 'Cancelled', label: 'Cancel', danger: true }
]);
assert.deepEqual(kitchenActionsFor('Ready', 'staff'), [{ status: 'Served', label: 'Mark Served', primary: true }]);
assert.deepEqual(kitchenActionsFor('Served', 'owner'), []);
assert.deepEqual(kitchenActionsFor('Cancelled', 'manager'), []);
assert.deepEqual(kitchenActionsFor('New', 'cashier'), []);

const updateStart = app.indexOf('async function updateOrderStatus(');
const updateEnd = app.indexOf('\n}\n\nasync function markOrdersPaid(', updateStart) + 2;
assert.ok(updateStart >= 0 && updateEnd > updateStart, 'status update function exists');
const order = { id: 'local-order', cloudId: 'cloud-order', status: 'New' };
let resolveFirst;
let calls = 0;
const context = createContext({
  state: { orders: [order] }, kitchenStatusUpdateIds: new Set(),
  saveState() {}, render() {}, renderKitchen() {}, setCloudSyncStatus() {}, cloudSyncSummary() { return ''; },
  showOrderToast() {}, syncCloudOrders: async () => {},
  window: { TableOrderCloud: { updateOrderStatus: async () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); } } }
});
runInContext(app.slice(updateStart, updateEnd), context);
const first = context.updateOrderStatus('local-order', 'Preparing');
await new Promise((resolve) => setImmediate(resolve));
await context.updateOrderStatus('local-order', 'Ready');
assert.equal(order.status, 'Preparing', 'a duplicate click must not mutate optimistic state while the first transition is in flight');
assert.equal(calls, 1, 'only the first transition may reach the RPC');
resolveFirst();
await first;

console.log('Kitchen lifecycle UI policy: PASS');
