import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/018_record_restaurant_order_payment.sql', 'utf8');

assert.match(sql, /create table public\.payment_operations/i, 'the clean baseline must include the active payment ledger');
assert.match(sql, /create or replace function public\.record_authoritative_payment/i, 'the client payment RPC must exist after a clean reset');
assert.match(sql, /revoke all on function public\.record_restaurant_order_payment[\s\S]*authenticated/i, 'the obsolete direct payment writer must be unavailable');
assert.match(sql, /grant execute on function public\.record_authoritative_payment[\s\S]*to authenticated/i, 'authorized Front Desk users need the ledger RPC');
const writer = sql.slice(sql.indexOf('create or replace function public.record_authoritative_payment'));
assert.doesNotMatch(writer, /set status\s*=/i, 'payments must not manufacture a Kitchen lifecycle state');

console.log('Clean baseline current-payment contract: PASS');
