import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const app = read("app.js");
const client = read("supabase-client.js");
const cutover = read("remediation/payment-writer-cutover-candidate.sql");

assert.match(client, /rpc\/record_authoritative_payment/, "the browser payment adapter must call the canonical ledger RPC");
assert.match(client, /p_amount_cents/, "the browser payment adapter must send integer cents");
assert.match(client, /p_idempotency_key/, "the browser payment adapter must send a UUID idempotency key");
assert.doesNotMatch(client, /rpc\/record_restaurant_order_payment/, "the legacy order-payment writer must not be reachable from the browser client");
assert.match(app, /paymentAttempt/, "a pending payment attempt must persist with the local order state");
assert.match(app, /if \(previous\?\.paymentAttempt\) \{\s*order\.paymentAttempt = previous\.paymentAttempt;/,
  "a cloud refresh must retain an unconfirmed payment attempt for a same-UUID retry");
assert.match(app, /delete order\.paymentAttempt;/, "a confirmed canonical success must clear the pending payment UUID");
assert.match(app, /Payment permission is not available for your role\./, "disallowed staff and platform roles must receive an explicit payment denial");
assert.match(app, /paymentStatus !== "paid"/, "the UI must use the canonical ledger result, not a manual status write");
assert.doesNotMatch(app, /recordOrderPayment/, "the application must not retain the legacy payment wrapper call");
assert.doesNotMatch(app, /updateOrderStatus\(order\.cloudId, "Paid"\)/, "payment must never fall back to a Paid status transition");
assert.match(cutover, /revoke all on function public\.record_restaurant_order_payment\(uuid,uuid,text\) from public, anon, authenticated/i,
  "the final convergence state must revoke the resurrected legacy writer");
assert.doesNotMatch(cutover, /grant execute on function public\.record_restaurant_order_payment/i,
  "the cutover must not regrant the legacy writer");
assert.doesNotMatch(cutover, /record_restaurant_payment|void_restaurant_payment/i,
  "the cutover must not change the other legacy payment contracts");

console.log("Payment writer cutover contract: PASS");
