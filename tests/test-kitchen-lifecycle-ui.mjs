import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

console.log('Kitchen lifecycle UI policy: PASS');
