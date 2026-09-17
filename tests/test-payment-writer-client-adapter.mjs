import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const storage = new Map([["aveniq-owner-session", JSON.stringify({
  access_token: "local-test-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "10000000-0000-4000-8000-000000000001" }
})]]);
const requests = [];
let rejectCanonical = false;
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
  if (url.endsWith("/rpc/record_authoritative_payment")) return response({
    payment_id: "30000000-0000-4000-8000-000000000001", amount_cents: 2150, paid_cents: 2150,
    remaining_cents: 0, payment_status: "paid", idempotent_replay: false
  });
  throw new Error(`Unexpected request: ${url}`);
}});
vm.runInContext(readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8"), context);

await window.TableOrderCloud.getStaffProfile();
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
console.log("Payment writer client adapter: PASS");
