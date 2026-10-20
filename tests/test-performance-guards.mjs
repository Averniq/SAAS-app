import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [app, serviceWorker] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8")
]);

assert.match(app, /!staffUser\?\.restaurantId \|\| cloudSyncBusy \|\| document\.hidden/);
assert.match(app, /if \(activeView === "kitchen"\) renderKitchen\(\);/);
assert.match(app, /if \(activeView === "frontdesk"\) renderFrontDesk\(\);/);
assert.match(app, /activeView === "setup" && \["owner", "manager"\]/);
assert.match(serviceWorker, /aveniq-shell-v34/);
for (const asset of ["mobile-shell.js", "supabase-config.js", "supabase-client.js", "vendor/qrcode.js"]) {
  assert.match(serviceWorker, new RegExp(asset.replaceAll(".", "\\.")));
}

console.log("Performance guards passed.");
