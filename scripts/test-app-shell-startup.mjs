import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [html, css, app] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/tailwind.css", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8")
]);

assert.match(html, /<body class="app-starting">/);
assert.match(css, /body\.app-starting > \.app-header/);
assert.match(css, /body\.account-flow-active > \.mobile-bottom-nav/);
assert.match(css, /body\.account-flow-active > \.mobile-cart-dock/);
assert.match(css, /body\.account-flow-active \{ overflow: hidden; \}/);
assert.match(app, /async function bootApplicationShell/);
assert.match(app, /const isPublicTenant = await initializePublicTenantMenu\(\);/);
assert.match(app, /if \(isPublicTenant\)[\s\S]*?return;/);
const boot = app.slice(app.indexOf("async function bootApplicationShell"));
assert.ok(boot.indexOf("const isPublicTenant = await initializePublicTenantMenu();") < boot.indexOf("render();"), "public route must resolve before the default app is rendered");
assert.match(app, /document\.body\.classList\.remove\("app-starting"\)/);
console.log("Application shell startup regression checks passed.");
