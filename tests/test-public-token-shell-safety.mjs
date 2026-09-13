#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobileShell = readFileSync(new URL("../mobile-shell.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

assert.match(mobileShell, /isLocalhost/, "localhost preview must be identified explicitly");
assert.match(mobileShell, /getRegistrations\(\)/, "localhost preview must retire prior task service-worker registrations");
assert.match(mobileShell, /\^aveniq-\(shell\|runtime\)-/, "localhost cleanup must be limited to Aveniq task caches");
assert.match(mobileShell, /if \(isNative \|\| isLocalhost/, "localhost preview must not register the production-style service worker");

assert.match(serviceWorker, /const APP_SHELL_CACHE = "aveniq-shell-v\d+"/, "the shell cache must have an explicit release version");
assert.match(serviceWorker, /const RUNTIME_CACHE = "aveniq-runtime-v\d+"/, "the runtime cache must have an explicit release version");
assert.ok(serviceWorker.includes("/^aveniq-(shell|runtime)-/.test(key) && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE"), "activation must only retire older Aveniq caches");
assert.match(serviceWorker, /isMutableShellAsset\(url\)/, "mutable shell assets must be identified separately from immutable assets");
assert.match(serviceWorker, /if \(request\.mode === "navigate" \|\| isMutableShellAsset\(url\)\) \{\s*event\.respondWith\(networkFirst\(request\)\)/, "navigation and mutable shell assets must be network-first to avoid cross-version mixing");

assert.match(app, /document\.getElementById\("confirmReviewOrder"\)\?\.addEventListener\("click", submitOrder\)/, "a missing review confirmation control must not abort public-token startup");
assert.match(app, /loadCloudDataIntoApp\(\{ silent: true \}\)/, "public-token startup must still load canonical cloud context");
assert.doesNotMatch(netlify, /https:\/\/\*\.supabase\.(co|in)/i, "the local-only candidate must not retain hosted Supabase CSP references");

console.log("Public token shell safety regression: PASS");
