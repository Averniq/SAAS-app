import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const head = html.match(/<head>[\s\S]*?<\/head>/)?.[0] || "";

assert.match(head, /id="app-startup-visibility-guard"/);
assert.match(head, /body\.app-starting > \.app-header/);
assert.ok(head.indexOf("app-startup-visibility-guard") < head.indexOf('rel="stylesheet"'), "startup guard must load before the external stylesheet");
console.log("Startup visibility guard is inlined before application styles.");
