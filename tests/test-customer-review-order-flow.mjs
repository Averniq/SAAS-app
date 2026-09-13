#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");

assert.match(html, /id="submitOrder">Review Order</,
  "a non-empty customer cart must lead to Review Order, not direct kitchen submission");
assert.match(html, /id="reviewOrderModal"/,
  "Review Order must use a dedicated review-only modal");
assert.match(html, /id="confirmReviewOrder"[^>]*>Confirm &amp; Send to Kitchen</,
  "only the explicit final confirmation may send an order");

assert.match(app, /function openReviewOrder\(\)/,
  "the cart primary action must open a review state");
const reviewBody = app.match(/function openReviewOrder\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.doesNotMatch(reviewBody, /submitOrder\(|submitPublicQrOrder|state\.orders\.unshift/,
  "opening Review Order must not submit or create an order row");
assert.match(app, /function renderReviewOrder\(entries, note\)/,
  "review must render cart entries and note from the existing rich cart state");
assert.match(app, /optionSummary\(options\)/,
  "review must preserve selected modifier group/option labels and surcharges");
assert.match(app, /money\(unitPrice \* quantity\)/,
  "review must display per-item totals");
assert.match(app, /document\.getElementById\("confirmReviewOrder"\)\?\.addEventListener\("click", submitOrder\)/,
  "only explicit final confirmation may invoke canonical submission");
assert.match(client, /submitPublicQrOrder\(token, items, note, customerName, idempotencyKey\)/,
  "final submission must retain the canonical rich Task 7 RPC wrapper");
assert.match(client, /options: \(item\.options \|\| \[\]\)\.map\(\(option\) => \(\{ groupId: option\.groupId, choiceId: option\.choiceId \}\)\)/,
  "final payload must retain selected modifier group and option IDs without client prices");

console.log("Customer Review Order flow regression: PASS");
