import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const targetUrl = process.argv[2];
const assertCustomerStartup = process.argv.includes("--assert-customer-startup");
const assertReviewOrder = process.argv.includes("--assert-review-order");
if (!targetUrl) throw new Error("Usage: node scripts/diagnose-local-token-browser.mjs <token-route-url>");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = "C:\\Users\\WindVeil\\AppData\\Local\\Temp\\aveniq-p0-browser-diagnostic-profile";
const port = 19223;
const redact = (value) => String(value || "").replace(/(\/order\/)[^/?#]+/g, "$1<redacted>");

await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
const browser = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check", "about:blank"
], { stdio: "ignore", windowsHide: true });

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

let socket;
let requestId = 0;
const pending = new Map();
const consoleEntries = [];
const exceptions = [];
const requests = [];
const submissionRequests = [];

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  let page;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { page = (await json(`http://127.0.0.1:${port}/json`)).find((entry) => entry.type === "page"); } catch { /* wait */ }
    if (page) break;
    await delay(200);
  }
  if (!page) throw new Error("Chrome DevTools did not start");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", async ({ data }) => {
    const event = JSON.parse(data);
    if (event.id && pending.has(event.id)) {
      const waiter = pending.get(event.id);
      pending.delete(event.id);
      event.error ? waiter.reject(new Error(event.error.message)) : waiter.resolve(event.result);
      return;
    }
    if (event.method === "Runtime.consoleAPICalled") consoleEntries.push({ type: event.params.type, text: event.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ") });
    if (event.method === "Runtime.exceptionThrown") exceptions.push(event.params.exceptionDetails.text || event.params.exceptionDetails.exception?.description || "exception");
    if (event.method === "Network.requestWillBeSent" && /get_public_qr_order_context/.test(event.params.request.url)) requests.push({ requestId: event.params.requestId, url: redact(event.params.request.url), method: event.params.request.method });
    if (event.method === "Network.requestWillBeSent" && /submit_public_qr_order/.test(event.params.request.url)) submissionRequests.push({ url: redact(event.params.request.url), method: event.params.request.method });
    if (event.method === "Network.responseReceived") {
      const record = requests.find((entry) => entry.requestId === event.params.requestId);
      if (record) { record.status = event.params.response.status; record.mimeType = event.params.response.mimeType; }
    }
  });

  await send("Runtime.enable");
  await send("Network.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: targetUrl });
  await delay(3500);
  const runtime = await send("Runtime.evaluate", { expression: `JSON.stringify({ title: document.title, body: document.body.innerText.slice(0, 800), route: window.TableOrderCloud?.routeContext?.(), cloud: Boolean(window.TableOrderCloud), config: Boolean(window.TABLEORDER_SUPABASE), restaurant: typeof restaurant === 'function' ? restaurant()?.name : null, selectedTableId: typeof selectedTableId === 'undefined' ? null : selectedTableId, tables: typeof state === 'undefined' ? null : state.tables?.map((t) => t.name), menuCount: typeof state === 'undefined' ? null : state.menuItems?.length })`, returnByValue: true });
  for (const request of requests) {
    try {
      const body = await send("Network.getResponseBody", { requestId: request.requestId });
      const parsed = JSON.parse(body.body);
      request.body = { restaurant: parsed.restaurant?.name, table: parsed.table?.name, categories: parsed.categories?.length, menuItems: parsed.menu_items?.length, hasOptions: Boolean(parsed.menu_items?.some((item) => item.option_config?.length)), error: parsed.message || parsed.error || parsed.code || null };
    } catch (error) { request.bodyError = error.message; }
  }
  const runtimeState = JSON.parse(runtime.result.value);
  if (runtimeState.route?.token) runtimeState.route.token = "<redacted>";
  let review = null;
  if (assertReviewOrder) {
    const reviewResult = await send("Runtime.evaluate", { expression: `(() => {
      const card = [...document.querySelectorAll('.menu-card')].find((entry) => entry.querySelector('h3')?.textContent.trim() === 'Karaage ramen');
      if (!card) return { error: 'Karaage ramen not rendered' };
      const item = state.menuItems.find((entry) => entry.name === 'Karaage ramen');
      const spice = item?.optionConfig?.find((group) => group.id === 'spice')?.choices?.find((choice) => choice.id === 'hot');
      const addon = item?.optionConfig?.find((group) => group.id === 'addon')?.choices?.find((choice) => Number(choice.price) > 0);
      if (!spice || !addon) return { error: 'authoritative Karaage option_config lacks Hot and a priced add-on' };
      const beforeOrders = state.orders.length;
      card.querySelector('[data-add]').click();
      const choose = (label) => {
        const input = [...document.querySelectorAll('#optionGroups label')].find((entry) => entry.innerText.includes(label))?.querySelector('input');
        if (!input) return false;
        input.click();
        return true;
      };
      if (!choose(spice.name) || !choose(addon.name)) return { error: 'authoritative option labels did not render' };
      document.getElementById('confirmOptions').click();
      const note = document.getElementById('orderNote');
      note.value = 'Please keep the broth hot'; note.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('submitOrder').click();
      return JSON.stringify({ beforeOrders, afterOrders: state.orders.length, modalOpen: !document.getElementById('reviewOrderModal').classList.contains('hidden'), reviewText: document.getElementById('reviewOrderModal').innerText, cartCta: document.getElementById('submitOrder').textContent, expectedOptions: [{ group: 'Spice level', name: spice.name, price: Number(spice.price) }, { group: 'Add-on', name: addon.name, price: Number(addon.price) }] });
    })()`, returnByValue: true });
    review = typeof reviewResult.result.value === 'string' ? JSON.parse(reviewResult.result.value) : reviewResult.result.value;
    await delay(400);
  }
  const postRequests = requests.filter((request) => request.method === "POST");
  const report = { browser: "chromium-headless", runtime: runtimeState, review, console: consoleEntries.map((entry) => ({ ...entry, text: redact(entry.text) })), exceptions: exceptions.map(redact), contextRequests: postRequests, submissionRequests };
  console.log(JSON.stringify(report, null, 2));
  if (assertCustomerStartup) {
    const hasSuccessfulContext = postRequests.some((request) => request.status === 200 && request.body?.restaurant && request.body?.table && request.body?.categories && request.body?.menuItems);
    const staysOnLoadingShell = /TableOrder MVP|Loading table/.test(runtimeState.body) || runtimeState.restaurant === "Loading…" || !runtimeState.selectedTableId || !runtimeState.menuCount;
    if (!hasSuccessfulContext || staysOnLoadingShell || exceptions.length) {
      throw new Error("Customer startup regression: canonical token route did not materialize restaurant, table, categories, and menu.");
    }
  }
  if (assertReviewOrder) {
    const reviewText = review?.reviewText || "";
    const selectedOptionsRender = (review?.expectedOptions || []).every(({ group, name, price }) => reviewText.includes(`${group}: ${name}`) && (price === 0 || reviewText.includes(`+$${price.toFixed(2)}`)));
    if (review?.error || !review?.modalOpen || review.beforeOrders !== review.afterOrders || review.cartCta !== "Review Order" || !["Karaage ramen", "Please keep the broth hot"].every((text) => reviewText.includes(text)) || !selectedOptionsRender || submissionRequests.length) {
      throw new Error("Review Order regression: opening review must retain rich cart details without creating an order or calling the submission RPC.");
    }
  }
} finally {
  if (socket) socket.close();
  browser.kill();
}
