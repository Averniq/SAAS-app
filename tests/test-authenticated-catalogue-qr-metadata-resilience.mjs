#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const restaurantId = "246ebdf9-1ac2-4211-84ff-9b5163608374";
const userId = "10000000-0000-4000-8000-000000000001";
const restaurant = { id: restaurantId, slug: "sake-street", name: "Sake Street", status: "active", is_open: true };
const tables = [
  { id: "20000000-0000-4000-8000-000000000001", table_name: "Sake Table 1", table_number: 1 },
  { id: "20000000-0000-4000-8000-000000000002", table_name: "Sake Table 2", table_number: 2 }
];
const menuItems = Array.from({ length: 71 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: `Dish ${index + 1}` }));

function reply(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

function createClient({ role = "owner", metadata = "available", platform = false, catalogueFailure = false } = {}) {
  const storage = new Map([["aveniq-owner-session", JSON.stringify({
    access_token: "local-test-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, email: "test@example.invalid" }
  })]]);
  const requests = [];
  const window = {
    TABLEORDER_SUPABASE: { url: "https://local.example.invalid", publishableKey: "local-publishable" },
    location: { pathname: "/dashboard/sake-street/frontdesk", search: "", hash: "", href: "https://local.example.invalid/dashboard/sake-street/frontdesk" },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  };
  const context = vm.createContext({ window, URLSearchParams, console: { warn() {} }, fetch: async (url) => {
    requests.push(url);
    if (url.includes("restaurant_staff?")) return reply([{ restaurant_id: restaurantId, role, restaurants: restaurant }]);
    if (url.includes("platform_admins?")) return reply(platform ? [{ user_id: userId }] : []);
    if (url.includes("restaurants?") && url.includes("slug=eq.sake-street")) return reply([{ id: restaurantId, slug: "sake-street", name: "Sake Street", status: "active" }]);
    if (url.includes("restaurants?") && url.includes(`id=eq.${restaurantId}`)) {
      if (catalogueFailure) return reply({ code: "42501", message: "catalogue access denied" }, 403);
      return reply([restaurant]);
    }
    if (url.includes("tables?")) return reply(tables);
    if (url.includes("menu_items?")) return reply(menuItems);
    if (url.endsWith("/rpc/get_public_qr_table_token_metadata")) {
      if (metadata === "available") return reply([{ table_id: tables[0].id, has_active_token: true }, { table_id: tables[1].id, has_active_token: false }]);
      if (metadata === "missing") return reply({ code: "PGRST202", message: "Could not find the function public.get_public_qr_table_token_metadata in the schema cache" }, 404);
      if (metadata === "denied") return reply({ code: "RESTAURANT_ACCESS_DENIED", message: "RESTAURANT_ACCESS_DENIED" }, 403);
      return reply({ code: "XX000", message: "Unexpected metadata backend failure" }, 500);
    }
    throw new Error(`Unexpected request: ${url}`);
  }});
  vm.runInContext(readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8"), context);
  return { cloud: window.TableOrderCloud, requests };
}

function assertCatalogue(result, availability) {
  assert.equal(result.restaurant.name, "Sake Street");
  assert.equal(result.tables.length, 2);
  assert.equal(result.menuItems.length, 71);
  assert.equal(result.publicQrTokenMetadataAvailability, availability);
}

for (const role of ["owner", "manager", "staff", "cashier"]) {
  const { cloud } = createClient({ role, metadata: "missing" });
  assertCatalogue(await cloud.loadRestaurantData(), "unavailable");
}

{
  const { cloud } = createClient({ platform: true, metadata: "missing" });
  await cloud.getPlatformDashboardProfile("sake-street");
  assertCatalogue(await cloud.loadRestaurantData(), "unavailable");
}

for (const role of ["owner", "manager"]) {
  const { cloud } = createClient({ role, metadata: "available" });
  const result = await cloud.loadRestaurantData();
  assertCatalogue(result, "available");
  assert.deepEqual(JSON.parse(JSON.stringify(result.publicQrTokenMetadata)), [
    { table_id: tables[0].id, has_active_token: true },
    { table_id: tables[1].id, has_active_token: false }
  ]);
}

for (const role of ["staff", "cashier"]) {
  const { cloud } = createClient({ role, metadata: "denied" });
  const result = await cloud.loadRestaurantData();
  assertCatalogue(result, "unavailable");
  assert.deepEqual(JSON.parse(JSON.stringify(result.publicQrTokenMetadata)), []);
}

{
  const { cloud } = createClient({ platform: true, metadata: "denied" });
  await cloud.getPlatformDashboardProfile("sake-street");
  const result = await cloud.loadRestaurantData();
  assertCatalogue(result, "unavailable");
  assert.deepEqual(JSON.parse(JSON.stringify(result.publicQrTokenMetadata)), []);
}

{
  const { cloud } = createClient({ role: "owner", metadata: "unexpected" });
  const result = await cloud.loadRestaurantData();
  assertCatalogue(result, "error");
  assert.deepEqual(JSON.parse(JSON.stringify(result.publicQrTokenMetadata)), []);
}

{
  const { cloud } = createClient({ role: "owner", metadata: "missing", catalogueFailure: true });
  await assert.rejects(() => cloud.loadRestaurantData(), /catalogue access denied/,
    "a required catalogue failure must not be hidden as optional QR metadata unavailability");
}

console.log("Authenticated catalogue QR metadata resilience: PASS (5 missing-RPC roles, 2 metadata-authorized roles, 3 denied roles, unexpected-failure isolation, required-catalogue failure propagation)");
