import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");

assert.match(app, /function isAuthenticatedDashboardRoute\(\)/, "dashboard customer previews need an explicit authenticated-route boundary");
assert.match(app, /menuItems: \[\]/, "dashboard startup must begin with no demo catalogue");
assert.match(app, /Dashboard catalogue loading/, "dashboard customer preview must show an explicit loading state");
assert.match(app, /Dashboard catalogue unavailable/, "dashboard customer preview must show an explicit load failure state");
assert.doesNotMatch(app, /function tenantMenuPhotoFallback/, "item-specific Sake image fabrication must be removed");
assert.doesNotMatch(app, /Spicy edamame.*spicy-edamame\.webp/s, "Spicy edamame must not receive fabricated product imagery");
assert.doesNotMatch(app, /Karaage ramen.*karaage-ramen\.webp/s, "Karaage ramen must not receive fabricated product imagery");
assert.match(app, /Authenticated restaurant catalogue/, "dashboard connection status must be restaurant-scoped, not token-seed-based");
assert.match(app, /selectedTableId = allTables\(\)\[0\]\?\.id \|\| ""/, "empty authenticated dashboard startup must tolerate no table before context loads");
assert.match(client, /menu_items\?select=\*&restaurant_id=eq\.\$\{encodeURIComponent\(profile\.restaurantId\)\}&is_active=eq\.true&is_available=eq\.true&sold_out=eq\.false/, "dashboard catalogue must apply the same visibility predicate as Task 7");
console.log("Dashboard customer catalogue authority regression: PASS");
