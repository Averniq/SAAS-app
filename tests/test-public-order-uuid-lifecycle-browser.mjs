#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const targetUrl = process.env.P0_LOCAL_CUSTOMER_URL;
assert.match(targetUrl || "", /^http:\/\/localhost:4177\/order\/[^/?#]+$/, "Set P0_LOCAL_CUSTOMER_URL to a local canonical token route.");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = "C:\\Users\\WindVeil\\AppData\\Local\\Temp\\aveniq-p0-public-order-uuid-profile";
const port = 19224;
const redact = (value) => String(value || "").replace(/(\/order\/)[^/?#]+/g, "$1<redacted>");

await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
const browser = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore", windowsHide: true });
const pending = new Map();
const submissionRequests = [];
let socket;
let requestId = 0;

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function devtoolsJson() {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text || "unknown exception"}`);
  if (typeof result.result.value !== "string") throw new Error(`Browser evaluation returned ${result.result.type || "no value"}`);
  return JSON.parse(result.result.value);
}

try {
  let page;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { page = (await devtoolsJson()).find((entry) => entry.type === "page"); } catch { /* wait for Chrome */ }
    if (page) break;
    await delay(200);
  }
  if (!page) throw new Error("Chrome DevTools did not start");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);
    if (event.id && pending.has(event.id)) {
      const waiter = pending.get(event.id); pending.delete(event.id);
      event.error ? waiter.reject(new Error(event.error.message)) : waiter.resolve(event.result);
    }
    if (event.method === "Network.requestWillBeSent" && /submit_public_qr_order/.test(event.params.request.url)) submissionRequests.push(redact(event.params.request.url));
  });
  await send("Runtime.enable"); await send("Network.enable"); await send("Page.enable");
  await send("Page.navigate", { url: targetUrl });
  let menuReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(250);
    const readiness = await send("Runtime.evaluate", { expression: "JSON.stringify({ menuCount: typeof state === 'undefined' ? 0 : state.menuItems?.length || 0, tableCount: typeof state === 'undefined' ? 0 : state.tables?.length || 0 })", returnByValue: true });
    const value = JSON.parse(readiness.result.value || "{}");
    if (value.menuCount && value.tableCount) { menuReady = true; break; }
  }
  assert.ok(menuReady, "canonical public token route must materialize its menu before lifecycle testing");

  const created = await evaluate(`(() => {
    const item = state.menuItems.find((entry) => entry.name === "Karaage ramen");
    const spice = item.optionConfig.find((group) => group.id === "spice").choices.find((choice) => choice.id === "hot");
    const addon = item.optionConfig.find((group) => group.id === "addon").choices.find((choice) => choice.id === "egg");
    addToCart(item.id, [{ groupId: "spice", groupName: "Spice level", choiceId: spice.id, choiceName: spice.name, price: spice.price }, { groupId: "addon", groupName: "Add-on", choiceId: addon.id, choiceName: addon.name, price: addon.price }]);
    const note = document.getElementById("orderNote"); note.value = "UUID lifecycle browser test"; note.dispatchEvent(new Event("input", { bubbles: true }));
    const before = JSON.parse(sessionStorage.getItem(publicOrderDraftStorageKey()));
    openReviewOrder(); closeReviewOrder();
    return JSON.stringify({ draft: before, reviewKey: publicOrderIdempotencyKey, cart: state.cart });
  })()`);
  assert.match(created.draft.idempotencyKey, /^[0-9a-f-]{36}$/i, "new public draft must receive a UUID");
  assert.equal(created.reviewKey, created.draft.idempotencyKey, "opening/closing review must retain the UUID");
  assert.equal(created.cart[0].options.length, 2, "draft must preserve selected modifiers");

  await evaluate(`(() => { const draft = JSON.parse(sessionStorage.getItem(publicOrderDraftStorageKey())); draft.idempotencyKey = "ord_1789131609083"; sessionStorage.setItem(publicOrderDraftStorageKey(), JSON.stringify(draft)); return JSON.stringify({}); })()`);
  await send("Page.reload"); await delay(3500);
  const restored = await evaluate(`(() => { const draft = JSON.parse(sessionStorage.getItem(publicOrderDraftStorageKey())); return JSON.stringify({ draft, cart: state.cart, note: document.getElementById("orderNote").value, key: publicOrderIdempotencyKey }); })()`);
  assert.match(restored.key, /^[0-9a-f-]{36}$/i, "legacy draft key must upgrade to UUID");
  assert.notEqual(restored.key, "ord_1789131609083", "legacy identifier must never be reused as UUID");
  assert.equal(restored.draft.idempotencyKey, restored.key, "upgraded UUID must persist immediately");
  assert.equal(restored.cart[0].options.length, 2, "legacy upgrade must retain modifiers");
  assert.equal(restored.note, "UUID lifecycle browser test", "legacy upgrade must retain note");

  await send("Page.reload"); await delay(3500);
  const refreshed = await evaluate(`JSON.stringify({ key: publicOrderIdempotencyKey, cart: state.cart, note: document.getElementById("orderNote").value })`);
  assert.equal(refreshed.key, restored.key, "refresh must retain the upgraded UUID without regenerating it");
  assert.deepEqual(refreshed.cart, restored.cart, "refresh must retain quantities and modifiers");
  assert.equal(refreshed.note, restored.note, "refresh must retain the order note");

  const failed = await evaluate(`(async () => {
    window.__uuidLifecycleAttempts = [];
    window.TableOrderCloud.submitOrder = async (order) => { window.__uuidLifecycleAttempts.push(order.idempotencyKey); throw new Error("simulated ambiguous network failure"); };
    await submitOrder();
    const draft = JSON.parse(sessionStorage.getItem(publicOrderDraftStorageKey()));
    return JSON.stringify({ key: publicOrderIdempotencyKey, draft, cart: state.cart, note: document.getElementById("orderNote").value, orders: state.orders.length });
  })()`);
  assert.equal(failed.key, restored.key, "failed submission must retain UUID");
  assert.equal(failed.draft.idempotencyKey, restored.key, "failed submission must retain persisted UUID");
  assert.equal(failed.cart.length, 1, "failed submission must retain cart");
  assert.equal(failed.note, "UUID lifecycle browser test", "failed submission must retain note");
  assert.equal(failed.orders, 0, "failed submission must not create a local order record");

  const successful = await evaluate(`(async () => {
    let resolveSubmission;
    window.TableOrderCloud.submitOrder = async (order) => { window.__uuidLifecycleAttempts.push(order.idempotencyKey); return new Promise(resolve => { resolveSubmission = resolve; }); };
    const firstConfirm = submitOrder();
    await submitOrder();
    resolveSubmission({ id: "00000000-0000-4000-8000-000000000001", number: 777 });
    await firstConfirm;
    await submitOrder();
    const previousKey = window.__uuidLifecycleAttempts[0];
    const cleared = sessionStorage.getItem(publicOrderDraftStorageKey());
    const clearedKey = publicOrderIdempotencyKey;
    const successRecords = state.orders.length;
    const item = state.menuItems.find((entry) => entry.name === "Karaage ramen"); addToCart(item.id, []);
    return JSON.stringify({ attempts: window.__uuidLifecycleAttempts, cleared, clearedKey, successRecords, cart: state.cart.length, nextKey: publicOrderIdempotencyKey, previousKey });
  })()`);
  assert.deepEqual(successful.attempts, [restored.key, restored.key], "retry must reuse the same UUID");
  assert.equal(successful.cleared, null, "successful submission must clear the submitted draft");
  assert.equal(successful.clearedKey, "", "successful submission must clear the in-memory UUID");
  assert.equal(successful.successRecords, 1, "concurrent and repeated confirmation must create only one local success record");
  assert.equal(successful.cart, 1, "next draft must begin normally");
  assert.match(successful.nextKey, /^[0-9a-f-]{36}$/i, "next draft must receive a UUID");
  assert.notEqual(successful.nextKey, successful.previousKey, "next draft must receive a new UUID");
  assert.equal(submissionRequests.length, 0, "browser lifecycle test must not submit a real order");
  console.log("Public order UUID browser lifecycle regression: PASS");
} finally {
  if (socket) socket.close();
  browser.kill();
}
