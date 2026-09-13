import assert from 'node:assert/strict';
import { classifyIndependentConcurrency } from '../scripts/task4-concurrency-adapter.mjs';

const expected = classifyIndependentConcurrency({
  attempts: [
    { exitCode: 0, stderr: '' },
    { exitCode: 1, stderr: 'ERROR:  PAYMENT_EXCEEDS_REMAINING_BALANCE\nSQLSTATE: P0001' },
  ],
  operationCount: 1,
  amountCents: 600,
  orderStatus: 'new',
  paidAtIsNull: true,
});
assert.deepEqual(expected, { pass: true, expectedRejections: 1 });

assert.deepEqual(classifyIndependentConcurrency({
  attempts: [{ exitCode: 0, stderr: '' }, { exitCode: 0, stderr: '' }],
  operationCount: 2, amountCents: 1200, orderStatus: 'new', paidAtIsNull: true,
}), { pass: false, expectedRejections: 0 });

console.log('Task 4 concurrency adapter regression: PASS');
