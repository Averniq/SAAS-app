import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, client, migration] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/042_harden_atomic_kitchen_voids.sql", import.meta.url), "utf8")
]);

assert.match(app, /More actions for Order/);
assert.match(app, /More actions for \$\{escapeHtml\(item\.name\)\}/);
assert.match(app, /Select item to void/);
assert.match(app, /Void entire order\?/);
assert.match(app, /canApplyKitchenStatus/);
assert.match(app, /Void requires a synced order so it can be securely audited/);
assert.match(app, /voidOrderItemsWithReason\(itemIds, orderId, reason, note, managerPin\)/);
assert.doesNotMatch(app, /money\(item\.price \* item\.quantity\)/);
assert.doesNotMatch(app, /data-void-item/);
assert.match(app, /pointerType !== "touch"/);
assert.match(client, /rpc\/void_restaurant_order_items/);
assert.match(migration, /coalesce\(v_role,''\) not in/);
assert.match(migration, /create or replace function public\.void_restaurant_order_items/);
assert.match(migration, /for i in select \* from public\.order_items/);
assert.match(migration, /perform public\.write_order_audit/);
assert.match(migration, /for update/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|order_items)/i);
console.log("Kitchen void UI and atomic audit contract checks passed.");
