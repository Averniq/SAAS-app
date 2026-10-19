import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, client, html, css, migration] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260817100000_p0_03_authoritative_payment_operations.sql", import.meta.url), "utf8")
]);

assert.match(html, /id="paymentModal"/);
assert.match(app, /function openPaymentModal\(/);
assert.match(app, /Amount due/);
assert.match(app, /Already paid/);
assert.match(app, /Remaining/);
assert.match(app, /Cash received/);
assert.match(app, /Confirm \$\{payment\.method === "Card"/);
assert.match(app, /cashReceivedCents < amountCents/);
assert.match(app, /payment\.submitting = true/);
assert.match(app, /Processing…/);
assert.match(app, /idempotencyKey: crypto\.randomUUID\(\)/);
assert.match(app, /Next \$5/);
assert.match(app, /Next \$10/);
assert.match(app, /handlePaymentModalKeys/);
assert.match(app, /payment-modal-open/);
assert.match(client, /rpc\/record_authoritative_payment/);
assert.match(client, /p_idempotency_key: payment\.idempotencyKey/);
assert.doesNotMatch(client, /rpc\/record_restaurant_payment/);
assert.match(migration, /create table public\.payment_operations/);
assert.match(migration, /payment_reference text/);
assert.match(migration, /OTHER_PAYMENT_NOTE_REQUIRED/);
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/);
assert.match(migration, /idempotent_replay/);
assert.match(migration, /for update/);
assert.match(app, /result\.remaining_cents > 0/);
assert.match(css, /payment-modal/);
console.log("Payment confirmation UI and server guard checks passed.");
