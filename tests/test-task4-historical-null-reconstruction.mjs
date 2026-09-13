#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildHistoricalFixtureSql, parseHistoricalPaymentCsv } from '../scripts/task4-historical-prestate.mjs';

const headers = [
  'id', 'restaurant_id', 'order_id', 'split_bill_id', 'amount_cents',
  'payment_method', 'status', 'note', 'idempotency_key', 'recorded_by',
  'paid_at', 'voided_at', 'voided_by', 'void_reason', 'created_at',
  'updated_at', 'cash_received_cents', 'change_given_cents',
  'payment_reference', 'rounding_adjustment_cents'
];

const row = [
  'synthetic-payment', 'synthetic-restaurant', 'synthetic-order', '', '100',
  'cash', 'completed', '', 'synthetic-key', 'synthetic-user',
  '2000-01-01T00:00:00Z', '', '', '', '2000-01-01T00:00:00Z',
  '2000-01-01T00:00:00Z', '', '', '', '0'
];

const parsed = parseHistoricalPaymentCsv(`${headers.join(',')}\n${row.join(',')}\n`);
assert.equal(parsed.length, 1, 'one synthetic row must parse');

for (const column of [
  'split_bill_id', 'voided_at', 'voided_by', 'cash_received_cents',
  'change_given_cents', 'payment_reference'
]) {
  assert.equal(parsed[0][column], null, `${column} empty CSV field must reconstruct SQL NULL`);
}

assert.equal(parsed[0].note, '', 'NOT NULL note must retain its legitimate empty string');
assert.equal(parsed[0].void_reason, '', 'NOT NULL void_reason must retain its legitimate empty string');

const literalNullRow = row.map((value, index) => (
  ['split_bill_id', 'voided_at', 'voided_by', 'cash_received_cents', 'change_given_cents', 'payment_reference'].includes(headers[index])
    ? 'null'
    : value
));
const literalNullParsed = parseHistoricalPaymentCsv(`${headers.join(',')}\n${literalNullRow.join(',')}\n`);
for (const column of [
  'split_bill_id', 'voided_at', 'voided_by', 'cash_received_cents',
  'change_given_cents', 'payment_reference'
]) {
  assert.equal(literalNullParsed[0][column], null, `${column} literal null token must reconstruct SQL NULL`);
}
assert.equal(literalNullParsed[0].note, '', 'NOT NULL note must retain its legitimate empty string with literal null fields');
assert.equal(literalNullParsed[0].void_reason, '', 'NOT NULL void_reason must retain its legitimate empty string with literal null fields');

const historicalFixtureSql = buildHistoricalFixtureSql();
const auditHelperOffset = historicalFixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.order_payment_audit_trigger()');
const paymentTriggerOffset = historicalFixtureSql.indexOf('CREATE TRIGGER payments_audit_append_only');
assert.ok(auditHelperOffset >= 0, 'captured payment audit trigger helper must be materialized');
assert.ok(auditHelperOffset < paymentTriggerOffset, 'captured payment audit trigger helper must precede its trigger');

const tableParentKeys = [...historicalFixtureSql.matchAll(/INSERT INTO public\.tables\(id,restaurant_id,table_number,[\s\S]*?VALUES \('[^']+'::uuid,'([^']+)'::uuid,(\d+),/g)]
  .map(([, restaurantId, tableNumber]) => `${restaurantId}:${tableNumber}`);
assert.equal(new Set(tableParentKeys).size, tableParentKeys.length, 'synthetic parent tables must satisfy each restaurant/table-number unique constraint');

const paymentIdempotencyConstraintMentions = historicalFixtureSql.match(/payments_restaurant_id_idempotency_key_key/g) ?? [];
assert.equal(paymentIdempotencyConstraintMentions.length, 1, 'a captured unique constraint must not be emitted again as a duplicate backing index');

console.log('Task 4 historical NULL reconstruction regression: PASS');
