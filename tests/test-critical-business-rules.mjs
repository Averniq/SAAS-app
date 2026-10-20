import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

function sourceBetween(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `production source must contain ${start}`);
  assert.notEqual(endIndex, -1, `production source must contain ${end}`);
  return app.slice(startIndex, endIndex);
}

// Execute the production checkout arithmetic instead of duplicating it in a test helper.
const moneySource = sourceBetween("function taxIncludedCents", "function menuCategories");
const moneyFactory = new Function(
  "taxRateBasisPoints",
  "toCents",
  "fromCents",
  `${moneySource}; return { taxIncludedCents, subtotalBeforeTaxCents, taxIncludedIn, subtotalBeforeTax };`
);
const cents = (value) => Math.round((Number(value) || 0) * 100);
const dollars = (value) => (Number(value) || 0) / 100;
const gst = moneyFactory(() => 1000, cents, dollars);

for (const grossCents of [0, 1, 5, 10, 11, 99, 100, 1099, 12345, 999999]) {
  const taxCents = gst.taxIncludedCents(grossCents);
  const subtotalCents = gst.subtotalBeforeTaxCents(grossCents);
  assert.equal(subtotalCents + taxCents, grossCents, `GST allocation must preserve ${grossCents} cents`);
  assert.ok(taxCents >= 0 && subtotalCents >= 0, "GST components cannot be negative");
}
assert.equal(gst.taxIncludedCents(1100), 100, "$11 GST-inclusive must contain $1 GST");
assert.equal(gst.subtotalBeforeTaxCents(1100), 1000);

const splitSource = sourceBetween("function splitEvenly", "function activePaymentsForOrders");
const { splitEvenly, paymentStatus } = new Function(`${splitSource}; return { splitEvenly, paymentStatus };`)();
for (const totalCents of [0, 1, 2, 10, 100, 1001, 999999]) {
  for (const people of [1, 2, 3, 7, 20]) {
    const shares = splitEvenly(totalCents, people);
    assert.equal(shares.length, people);
    assert.equal(shares.reduce((sum, share) => sum + share, 0), totalCents, "equal splits must preserve the bill total");
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, "equal splits may differ by at most one cent");
  }
}
assert.equal(paymentStatus(1000, 0), "Unpaid");
assert.equal(paymentStatus(1000, 1), "Partially Paid");
assert.equal(paymentStatus(1000, 999), "Partially Paid");
assert.equal(paymentStatus(1000, 1000), "Paid");

const orderTotalSource = sourceBetween("function orderTotalCents", "function tableTokenFromUrl");
const orderTotalCents = new Function("toCents", `${orderTotalSource}; return orderTotalCents;`)(cents);
assert.equal(orderTotalCents({ items: [
  { price: 12.35, quantity: 2 },
  { price: 0.1, quantity: 3 },
  { price: 99, quantity: 0 }
]}), 2500, "order totals must use integer cents and ignore zero quantities");
assert.equal(orderTotalCents({ items: [{ price: 5, quantity: -2 }] }), 0, "negative quantities cannot reduce a total");

const itemBillSource = sourceBetween("function itemBillCents", "function allocatedQuantityForLine");
const lines = [
  { key: "ramen", price: 19.95, quantity: 2 },
  { key: "tea", price: 4.1, quantity: 1 }
];
const bills = [
  { allocations: { ramen: 1, tea: 1 } },
  { allocations: { ramen: 1 } }
];
const itemBillCents = new Function(
  "toCents",
  "frontdeskItemBills",
  `${itemBillSource}; return itemBillCents;`
)(cents, bills);
const itemSplitTotal = bills.reduce((sum, bill) => sum + itemBillCents(bill, lines, 4400), 0);
assert.equal(itemSplitTotal, 4400, "a fully allocated item split must preserve the original bill total");

console.log("Critical production checkout arithmetic checks passed.");
