import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, html, css] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/tailwind.css", import.meta.url), "utf8")
]);

assert.match(html, /id="reviewOrderModal"/);
assert.match(html, /id="reviewOrderContent" tabindex="-1"/);
assert.match(app, /function openReviewOrder\(\)/);
assert.match(app, /function renderReviewOrder\(\)/);
assert.match(app, /function changeReviewOrderQuantity\(lineId, change\)/);
assert.match(app, /data-review-note=/, "Review Order must support existing per-item notes.");
assert.match(app, /data-review-remove=/, "Review Order must expose a visible remove action.");
assert.match(app, /notes: line\.notes \|\| ""/, "Cart lines must retain item instructions.");
assert.match(app, /document\.getElementById\("submitOrder"\)\.addEventListener\("click", openReviewOrder\)/);
assert.match(app, /const submission = submitOrder\(\);/, "Confirm Order must call the existing submission function.");
assert.match(app, /Confirm order · \$\{money\(cartTotal\(\)\)\}/);
assert.match(app, /document\.getElementById\("categoryRow"\)\?\.scrollIntoView/, "Continue Ordering must return to the menu.");
assert.match(app, /document\.getElementById\("reviewOrderContent"\)\?\.focus\(\)/, "Review Order must initially focus the dialog container.");
assert.doesNotMatch(app, /document\.getElementById\("confirmReviewOrder"\)\?\.focus\(\)/, "Review Order must not initially focus the final action.");
assert.match(app, /function restoreReviewOrderControlFocus\(attribute, lineId\)/, "Review controls must restore focus after rerendering.");
assert.match(app, /\[dialog, first\]\.includes\(document\.activeElement\)/, "Reverse tabbing from initial dialog focus must remain trapped.");
assert.match(app, /body > \.app-header, body > main, body > \.mobile-bottom-nav, body > \.mobile-cart-dock/);
assert.match(app, /#reviewOrderModal button:not\(\[disabled\]\), #reviewOrderModal input:not\(\[disabled\]\), #reviewOrderModal textarea:not\(\[disabled\]\)/);
assert.match(app, /let orderSubmissionInProgress = false;/);
assert.match(app, /let reviewOrderConfirmPending = false;/);
assert.match(app, /if \(orderSubmissionInProgress \|\| !restaurant\(\)\.isOpen\) return/);
assert.match(app, /const submittedLines = entries\.map/);
assert.match(app, /line\.quantity = Math\.max\(0, Number\(line\.quantity \|\| 0\) - quantity\)/);
assert.match(app, /function addToCart\(itemId, options = \[\]\) \{\s*if \(orderSubmissionInProgress\) return;/);
assert.match(app, /data-dec="\$\{lineId\}" \$\{orderSubmissionInProgress \? "disabled" : ""\}/);
assert.match(app, /document\.getElementById\("clearCart"\)\.disabled = orderSubmissionInProgress;/);
assert.doesNotMatch(app, /reviewOrderCart|reviewOrderItems/, "Review Order must not create a parallel cart state.");
assert.match(app, /trackedCustomerOrders\(\)/, "Submitted orders must remain in the existing customer order-status flow.");
assert.match(app, /class="customer-order-history"/);
assert.match(app, /Review order \(\$\{itemCount\}\)/, "Public QR ordering must review before sending.");
assert.match(css, /\.review-order-modal/);
assert.match(css, /\.review-quantity button \{ width: 48px; height: 48px;/, "Quantity controls must be touch friendly.");
assert.match(css, /\.review-order-dock \{ position: sticky; bottom: 0;/, "Totals and actions must remain sticky.");
assert.match(css, /html\.review-order-open, body\.review-order-open \{ overflow: hidden/);

const quantityFunctionSource = app.slice(
  app.indexOf("function changeReviewOrderQuantity"),
  app.indexOf("function renderReviewOrder")
);
const quantityHarness = new Function(
  "state",
  "normalizeCart",
  "saveState",
  "renderCart",
  "renderReviewOrder",
  "orderSubmissionInProgress",
  "reviewOrderConfirmPending",
  "lastConfirmedOrderId",
  "reviewOrderError",
  `${quantityFunctionSource}; return changeReviewOrderQuantity;`
);
const state = { cart: [{ id: "line-1", quantity: 1 }] };
let saveCount = 0;
let renderCount = 0;
const changeQuantity = quantityHarness(
  state,
  () => {},
  () => { saveCount += 1; },
  () => { renderCount += 1; },
  () => { renderCount += 1; },
  false,
  false,
  "",
  ""
);
changeQuantity("line-1", 1);
assert.equal(state.cart[0].quantity, 2, "Review quantity increases must update state.cart.");
changeQuantity("line-1", -2);
assert.deepEqual(state.cart, [], "A zero quantity must use the existing remove behaviour.");
assert.equal(saveCount, 2);
assert.equal(renderCount, 4);

const submitFunctionSource = app.slice(
  app.indexOf("async function submitOrder"),
  app.indexOf("async function updateOrderStatus")
);
function makeSubmissionHarness(submitter) {
  const harnessState = { cart: [{ id: "line-1", quantity: 2 }], orders: [] };
  const orderNote = { value: "Serve together" };
  const calls = { cloud: 0, success: 0 };
  const factory = new Function(
    "state", "restaurant", "lockedTableToken", "applyLockedTableSelection", "loadCloudDataIntoApp",
    "showOrderToast", "cartEntries", "lastConfirmedOrderId", "document", "cartTotal", "cartTax",
    "subtotalBeforeTax", "selectedTableId", "nowLabel", "currentTable", "allTables", "window",
    "closeReviewOrder", "showOrderSuccessModal", "saveState", "renderCart", "renderCustomerOrderStatus",
    "syncCustomerOrderStatuses", "orderSubmissionInProgress", "console",
    `${submitFunctionSource}; return submitOrder;`
  );
  const submit = factory(
    harnessState,
    () => ({ isOpen: true, cloudId: "restaurant-cloud", taxRate: 10 }),
    false,
    () => true,
    async () => {},
    () => {},
    () => harnessState.cart.map((line) => ({
      lineId: line.id,
      quantity: line.quantity,
      item: { id: "miso", cloudId: "menu-cloud", name: "Miso soup", price: 4 },
      options: [],
      notes: "No spring onion",
      unitPrice: 4
    })),
    "",
    { getElementById: () => orderNote },
    () => 8,
    () => 0.73,
    () => 7.27,
    "table-1",
    () => "10:00 pm",
    () => ({ id: "table-1", cloudId: "table-cloud" }),
    () => [{ id: "table-1", cloudId: "table-cloud" }],
    { TableOrderCloud: { submitOrder: async (...args) => { calls.cloud += 1; return submitter(...args); } } },
    () => {},
    () => { calls.success += 1; },
    () => {},
    () => {},
    () => {},
    () => {},
    false,
    { error: () => {} }
  );
  return { submit, state: harnessState, orderNote, calls };
}

const successHarness = makeSubmissionHarness(async () => ({ id: "cloud-order", number: 1204 }));
const successResult = await successHarness.submit();
assert.equal(successResult.ok, true, "A successful confirmation must resolve through submitOrder.");
assert.equal(successHarness.calls.cloud, 1);
assert.equal(successHarness.calls.success, 1);
assert.equal(successHarness.state.orders.length, 1);
assert.deepEqual(successHarness.state.cart, [], "Only successfully submitted quantities should leave state.cart.");
assert.equal(successHarness.orderNote.value, "");

const failureHarness = makeSubmissionHarness(async () => { throw new Error("Network unavailable"); });
const failureResult = await failureHarness.submit();
assert.equal(failureResult.ok, false);
assert.equal(failureHarness.state.orders.length, 0);
assert.deepEqual(failureHarness.state.cart, [{ id: "line-1", quantity: 2 }], "A failed confirmation must preserve state.cart.");
assert.equal(failureHarness.orderNote.value, "Serve together");

let releaseSubmission;
const pendingHarness = makeSubmissionHarness(() => new Promise((resolve) => { releaseSubmission = resolve; }));
const firstSubmission = pendingHarness.submit();
const duplicateResult = await pendingHarness.submit();
assert.equal(duplicateResult.ok, false, "A duplicate confirmation must be rejected while submission is pending.");
assert.equal(pendingHarness.calls.cloud, 1, "Double taps must not create a second cloud submission.");
releaseSubmission({ id: "cloud-order", number: 1205 });
await firstSubmission;

console.log("Review Order integration checks passed.");
