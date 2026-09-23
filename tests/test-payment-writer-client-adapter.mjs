import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { execFileSync } from 'node:child_process';

const storage = new Map([["aveniq-owner-session", JSON.stringify({
  access_token: "local-test-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "10000000-0000-4000-8000-000000000001" }
})]]);
const requests = [];
let rejectCanonical = false;
let canonicalResponse = {
  payment_id: "30000000-0000-4000-8000-000000000001", amount_cents: 2150, paid_cents: 2150,
  remaining_cents: 0, payment_status: "paid", idempotent_replay: false
};
let canonicalOperations = [{
  id: "30000000-0000-4000-8000-000000000002", order_id: "40000000-0000-4000-8000-000000000001",
  amount_cents: 2150, payment_method: "Card", payment_reference: "TERM-1", note: "", recorded_at: "2026-09-23T00:00:00Z",
  recorded_by: "10000000-0000-4000-8000-000000000001"
}];
const response = (data) => ({ ok: true, text: async () => JSON.stringify(data) });
const window = {
  TABLEORDER_SUPABASE: { url: "https://local.example.invalid", publishableKey: "local-publishable" },
  location: { pathname: "/dashboard/sake-street/frontdesk", search: "", hash: "", href: "https://local.example.invalid/dashboard/sake-street/frontdesk" },
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  crypto: globalThis.crypto
};
const context = vm.createContext({ window, URLSearchParams, fetch: async (url, options = {}) => {
  requests.push({ url, options });
  if (rejectCanonical && url.endsWith('/rpc/record_authoritative_payment')) throw new Error('ambiguous network failure');
  if (url.includes("restaurant_staff?")) return response([{ restaurant_id: "20000000-0000-4000-8000-000000000001", role: "cashier", restaurants: { slug: "sake-street", name: "Sake Street", status: "active" } }]);
  if (url.endsWith("/rpc/record_authoritative_payment")) return response(canonicalResponse);
  if (url.endsWith("/rpc/list_authoritative_payment_operations")) return response(canonicalOperations);
  throw new Error(`Unexpected request: ${url}`);
}});
// The canonical client adapter was introduced by d2c008b; use its parent as RED baseline.
const source = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', 'c07f440c750abb6d82a83bfbeefe6a4bc742f7e8:supabase-client.js'], { encoding: 'utf8' })
  : readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");
vm.runInContext(source, context);

await window.TableOrderCloud.getStaffProfile();
const operations = await window.TableOrderCloud.listAuthoritativePaymentOperations("40000000-0000-4000-8000-000000000001");
assert.deepEqual(JSON.parse(JSON.stringify(operations)), [{
  id: "30000000-0000-4000-8000-000000000002", orderId: "40000000-0000-4000-8000-000000000001",
  amountCents: 2150, paymentMethod: "Card", reference: "TERM-1", note: "", recordedAt: "2026-09-23T00:00:00Z",
  recordedBy: "10000000-0000-4000-8000-000000000001"
}]);
const list = requests.find((entry) => entry.url.endsWith("/rpc/list_authoritative_payment_operations"));
assert.deepEqual(JSON.parse(list.options.body), {
  p_restaurant_id: "20000000-0000-4000-8000-000000000001", p_order_id: "40000000-0000-4000-8000-000000000001"
});
const payment = await window.TableOrderCloud.recordAuthoritativePayment("40000000-0000-4000-8000-000000000001", {
  amountCents: 2150, method: "Card", reference: "TERM-1", note: "", idempotencyKey: "50000000-0000-4000-8000-000000000001"
});
assert.deepEqual(JSON.parse(JSON.stringify(payment)), {
  paymentId: "30000000-0000-4000-8000-000000000001", amountCents: 2150, paidCents: 2150,
  remainingCents: 0, paymentStatus: "paid", idempotentReplay: false
});
const canonical = requests.find((entry) => entry.url.endsWith("/rpc/record_authoritative_payment"));
assert.ok(canonical, "canonical writer must be called");
assert.deepEqual(JSON.parse(canonical.options.body), {
  p_restaurant_id: "20000000-0000-4000-8000-000000000001", p_order_id: "40000000-0000-4000-8000-000000000001",
  p_amount_cents: 2150, p_method: "Card", p_reference: "TERM-1", p_note: "", p_idempotency_key: "50000000-0000-4000-8000-000000000001"
});
await assert.rejects(
  () => window.TableOrderCloud.recordAuthoritativePayment("40000000-0000-4000-8000-000000000001", { amountCents: 2150, method: "Card", idempotencyKey: "ord_legacy" }),
  /valid payment idempotency key/i
);
assert.equal(requests.filter((entry) => entry.url.includes("record_restaurant_order_payment")).length, 0, "client must never call the legacy writer");
rejectCanonical = true;
const beforeFailure = requests.length;
await assert.rejects(() => window.TableOrderCloud.recordAuthoritativePayment('40000000-0000-4000-8000-000000000001', {
  amountCents: 2150, method: 'Card', idempotencyKey: '50000000-0000-4000-8000-000000000001'
}), /ambiguous network failure/);
assert.equal(requests.length, beforeFailure + 1, 'failure must not trigger another writer or status fallback');
assert.ok(requests.at(-1).url.endsWith('/rpc/record_authoritative_payment'));
rejectCanonical = false;
const beforeStatus = requests.length;
for (const status of ['Paid', 'paid', 'PAID', ' Paid ']) {
  await assert.rejects(() => window.TableOrderCloud.updateOrderStatus('40000000-0000-4000-8000-000000000001', status), /authoritative payment service/);
}
assert.equal(requests.length, beforeStatus, 'Paid must be rejected before any RPC or PATCH');
const attempt = { amountCents: 2150, method: 'Card', idempotencyKey: '50000000-0000-4000-8000-000000000001' };
const valid = { ...canonicalResponse };
const invalidResponses = [null, {}, { ...valid, payment_id: 'bad' }, { ...valid, amount_cents: 1 },
  { ...valid, paid_cents: 1 }, { ...valid, remaining_cents: -1 }, { ...valid, remaining_cents: 1 },
  { ...valid, paid_cents: 2150.5 }, { ...valid, payment_status: 'partial' }];
for (const invalid of invalidResponses) {
  canonicalResponse = invalid;
  await assert.rejects(() => window.TableOrderCloud.recordAuthoritativePayment('40000000-0000-4000-8000-000000000001', attempt), /could not be verified/);
}
canonicalResponse = { ...valid, remaining_cents: 500, payment_status: 'partial' };
const partial = await window.TableOrderCloud.recordAuthoritativePayment('40000000-0000-4000-8000-000000000001', attempt);
assert.equal(partial.paymentStatus, 'partial'); assert.equal(partial.remainingCents, 500);
const beforeMethod = requests.length;
await assert.rejects(() => window.TableOrderCloud.recordAuthoritativePayment('40000000-0000-4000-8000-000000000001', { ...attempt, method: 'crypto' }), /valid payment method/);
assert.equal(requests.length, beforeMethod);
console.log('Payment writer client adapter: PASS (4 Paid variants denied, 9 malformed responses denied, partial normalized, invalid method denied; existing payload/UUID/network checks passed)');
