#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.P0_LOCAL_APP_URL || "http://localhost:4177";
const container = "supabase_db_aveniq-p0-ui-runtime-20260908-local";
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = "C:\\Users\\WindVeil\\AppData\\Local\\Temp\\aveniq-p0-platform-dashboard-browser-profile";
const port = 19224;
const master = { id: "217b5769-c632-4875-86d3-0920291b2948", email: "master@aveniq.test" };
const sakeOwner = { id: "9c3f932f-cc9d-413d-999f-9baec4e238f5", email: "sake.owner@aveniq.test" };

function dockerSecret() {
  const result = spawnSync("docker", ["exec", container, "sh", "-lc", "printf %s \"$JWT_SECRET\""], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) throw new Error("Task-local JWT signing secret is unavailable.");
  return result.stdout.trim();
}

function tokenFor(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", role: "authenticated", sub: user.id, email: user.email, iat: now - 60, exp: now + 600 })}`;
  return `${signed}.${createHmac("sha256", dockerSecret()).update(signed).digest("base64url")}`;
}

await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
const browser = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore", windowsHide: true });

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
  return response.json();
}

let socket;
let requestId = 0;
const pending = new Map();
const exceptions = [];
function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function navigateWith(user, pathname) {
  const session = { access_token: tokenFor(user), expires_at: Math.floor(Date.now() / 1000) + 600, user };
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('aveniq-owner-session', ${JSON.stringify(JSON.stringify(session))});` });
  await send("Page.navigate", { url: `${baseUrl}${pathname}` });
  await delay(4500);
  const result = await send("Runtime.evaluate", { expression: "(async () => { const session = JSON.parse(localStorage.getItem('aveniq-owner-session')); const response = await fetch(window.TABLEORDER_SUPABASE.url + '/rest/v1/platform_admins?select=user_id&user_id=eq.' + session.user.id, { headers: { apikey: window.TABLEORDER_SUPABASE.publishableKey, Authorization: 'Bearer ' + session.access_token } }); return JSON.stringify({ path: location.pathname, session: Boolean(session), api: window.TABLEORDER_SUPABASE?.url || null, platformProbe: { status: response.status, body: await response.text() }, staff: typeof staffUser === 'undefined' ? null : staffUser && { role: staffUser.role, slug: staffUser.restaurantSlug, id: staffUser.restaurantId }, restaurant: typeof restaurant === 'function' ? restaurant()?.name : null, menuCount: typeof state === 'undefined' ? null : state.menuItems?.length, menuNames: typeof state === 'undefined' ? [] : state.menuItems?.map(item => item.name), body: document.body.innerText.slice(0, 500) }); })()", awaitPromise: true, returnByValue: true });
  return { ...JSON.parse(result.result.value), exceptions };
}

async function traceRotationBoundary() {
  const result = await send("Runtime.evaluate", { expression: "(() => { window.__qrTrace = { confirms: [], rpcCalls: 0 }; window.confirm = message => { window.__qrTrace.confirms.push(message); return false; }; const original = window.TableOrderCloud.issuePublicQrTableToken; window.TableOrderCloud.issuePublicQrTableToken = (...args) => { window.__qrTrace.rpcCalls += 1; return original(...args); }; const button = document.querySelector('[data-reset-token]'); if (!button) return JSON.stringify({ error: 'QR rotation control not rendered' }); button.click(); return JSON.stringify({ tableId: button.dataset.resetToken, ...window.__qrTrace }); })()", returnByValue: true });
  return JSON.parse(result.result.value);
}

async function traceAcceptedRotationArguments() {
  const result = await send("Runtime.evaluate", { expression: "(() => { window.__qrAcceptedTrace = { calls: [] }; window.confirm = () => true; window.TableOrderCloud.issuePublicQrTableToken = (...args) => { window.__qrAcceptedTrace.calls.push(args); return Promise.reject(new Error('TEST_QR_RPC_BOUNDARY')); }; const button = document.querySelector('[data-reset-token]'); if (!button) return JSON.stringify({ error: 'QR rotation control not rendered' }); button.click(); return new Promise(resolve => setTimeout(() => resolve(JSON.stringify({ tableId: button.dataset.resetToken, calls: window.__qrAcceptedTrace.calls })), 50)); })()", awaitPromise: true, returnByValue: true });
  return JSON.parse(result.result.value);
}

try {
  let page;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { page = (await json(`http://127.0.0.1:${port}/json`)).find((entry) => entry.type === "page"); } catch { /* wait for Chrome */ }
    if (page) break;
    await delay(200);
  }
  if (!page) throw new Error("Chrome DevTools did not start.");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);
    if (!event.id || !pending.has(event.id)) return;
    const waiter = pending.get(event.id);
    pending.delete(event.id);
    event.error ? waiter.reject(new Error(event.error.message)) : waiter.resolve(event.result);
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Runtime.evaluate", { expression: "window.exceptions = []" });
  socket.addEventListener("message", ({ data }) => { const event = JSON.parse(data); if (event.method === "Runtime.exceptionThrown") exceptions.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text); });

  const sake = await navigateWith(master, "/dashboard/sake-street/dashboard");
  assert.deepEqual(sake.staff, { role: "platform_admin", slug: "sake-street", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, `master must enter the exact Sake route context: ${JSON.stringify(sake)}`);
  assert.equal(sake.restaurant, "Sake Street", "master Sake dashboard must load Sake only");
  assert.equal(sake.menuCount, 70, "master Sake dashboard must expose the 70-item canonical visible catalogue");
  assert.ok(!sake.menuNames.includes("Spicy edamame"), "hidden Spicy edamame must not appear in the dashboard catalogue");
  assert.ok(["Edamame - salty", "Edamame - spicy or garlic & cheese"].every((name) => sake.menuNames.includes(name)), "the two approved Edamame items must remain visible");
  const masterQrBoundary = await traceRotationBoundary();
  assert.ok(masterQrBoundary.tableId, "Master must render the Sake Table QR rotation control");
  assert.equal(masterQrBoundary.confirms.length, 1, "Master QR rotation must reach explicit confirmation");
  assert.equal(masterQrBoundary.rpcCalls, 0, "declining confirmation must not call Task 6");
  const masterQrArgs = await traceAcceptedRotationArguments();
  assert.deepEqual(masterQrArgs.calls, [["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a1000000-0000-4000-8000-000000000001", null]], "Master would call Task 6 with the exact Sake restaurant and selected table UUID");

  const platform = await navigateWith(master, "/platform");
  assert.equal(platform.staff, null, "returning to Platform must not retain a dashboard staff context");
  const coffee = await navigateWith(master, "/dashboard/coffee-shop/dashboard");
  assert.deepEqual(coffee.staff, { role: "platform_admin", slug: "coffee-shop", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, "master must enter the exact Coffee route context");
  assert.equal(coffee.restaurant, "Coffee Shop", "master Coffee dashboard must not retain Sake context");

  const unknown = await navigateWith(master, "/dashboard/no-such-restaurant/dashboard");
  assert.equal(unknown.staff, null, "an unknown platform route must fail closed without a prior tenant fallback");
  const ownerSake = await navigateWith(sakeOwner, "/dashboard/sake-street/dashboard");
  assert.equal(ownerSake.staff?.slug, "sake-street", "normal Sake owner must retain normal staff access");
  const ownerQrBoundary = await traceRotationBoundary();
  assert.ok(ownerQrBoundary.tableId, "Sake owner must render the QR rotation control");
  assert.equal(ownerQrBoundary.confirms.length, 1, "Sake owner QR rotation must reach explicit confirmation");
  assert.equal(ownerQrBoundary.rpcCalls, 0, "declining owner confirmation must not call Task 6");
  const ownerCoffee = await navigateWith(sakeOwner, "/dashboard/coffee-shop/dashboard");
  assert.equal(ownerCoffee.staff, null, "normal Sake owner must not enter Coffee by URL");
  console.log("Platform-admin dashboard browser regression: PASS");
} finally {
  if (socket) socket.close();
  browser.kill();
}
