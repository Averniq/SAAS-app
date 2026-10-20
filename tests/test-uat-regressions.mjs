import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, client, migration, sakeStreetRedirect] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/037_owner_boundary_and_payment_integrity.sql", import.meta.url), "utf8"),
  readFile(new URL("../netlify/sake-street-redirect/_redirects", import.meta.url), "utf8")
]);
const platformRenderer = app.slice(app.indexOf("function renderPlatformRestaurants()"), app.indexOf("function canUseKitchenVoidActions()"));

assert.match(app, /const targetPath = `\/dashboard\/\$\{encodeURIComponent\(staffUser\.restaurantSlug\)\}\/\$\{routeName\}`;/);
assert.match(app, /window\.location\.assign\(targetPath\);/);
assert.match(client, /const membershipRestaurant = \(entry\) => Array\.isArray\(entry\.restaurants\) \? entry\.restaurants\[0\] : entry\.restaurants;/);
assert.match(client, /getStaffProfile\(\{ preferActiveRestaurant = false \} = \{\}\)/);
assert.match(client, /\(!preferActiveRestaurant && memberships\.find\(\(entry\) => membershipRestaurant\(entry\)\?\.slug === slug\)\)/);
assert.match(client, /restaurants\(id,slug,name,status,is_active,venue_status\)/);
assert.match(client, /restaurant\?\.status === "active" \|\| restaurant\?\.is_active === true/);
assert.match(app, /getStaffProfile\(\{ preferActiveRestaurant: true \}\)/);
assert.match(app, /function isPayableOrder\(order\)/);
assert.match(app, /return \!\["Paid", "Served", "Completed", "Voided", "Cancelled"\]\.includes\(order\.status\);/);
assert.match(app, /Select one open order before recording payment/);
assert.doesNotMatch(platformRenderer, /\b(?:staffList|board|restaurantTeamData)\b/, "platform restaurant rendering must not depend on restaurant dashboard UI state");
assert.match(app, /const DEFAULT_LOGO_DATA = "\/assets\/brand\/aveniq-leaf-logo-reverse\.png"/);
assert.match(await readFile(new URL("../index.html", import.meta.url), "utf8"), /rel="icon" href="\/assets\/brand\/aveniq-leaf-logo-reverse\.png"/);
assert.match(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"), /"src":"\/assets\/brand\/aveniq-leaf-logo-reverse\.png"/);
assert.match(await readFile(new URL("../index.html", import.meta.url), "utf8"), /app\.js\?v=20260807-review-order/);
assert.match(await readFile(new URL("../service-worker.js", import.meta.url), "utf8"), /aveniq-shell-v32/);
assert.match(await readFile(new URL("../service-worker.js", import.meta.url), "utf8"), /aveniq-runtime-v32/);
assert.match(await readFile(new URL("../service-worker.js", import.meta.url), "utf8"), /app\.js\?v=20260807-review-order/);
assert.match(sakeStreetRedirect, /^\/\*\s+https:\/\/app\.aveniq\.com\.au\/order\/sake-street\/sake-table-1\s+302$/m);
assert.match(migration, /ONLY_OWNER_CAN_INVITE_PRIVILEGED_ROLE/);
assert.match(migration, /ONLY_OWNER_CAN_MANAGE_ATTENDANCE_PINS/);
assert.match(migration, /PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER/);
assert.match(migration, /ri\.role\s*<>\s*'owner'/);
assert.match(migration, /to public/);

console.log("UAT regression guard checks passed.");
