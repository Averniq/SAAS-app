import fs from "node:fs";
import process from "node:process";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const configSource = fs.readFileSync(new URL("../supabase-config.js", import.meta.url), "utf8");

function configValue(name) {
  return configSource.match(new RegExp(`${name}\\s*:\\s*["']([^"']+)["']`))?.[1] || "";
}

const supabaseUrl = (process.env.AVENIQ_SUPABASE_URL || configValue("url")).replace(/\/$/, "");
const publishableKey = process.env.AVENIQ_SUPABASE_PUBLISHABLE_KEY || configValue("publishableKey");
const requireRoleTests = process.env.AVENIQ_REQUIRE_ROLE_TESTS === "1";
const otherRestaurantId = process.env.AVENIQ_OTHER_RESTAURANT_ID || "";
const results = [];

if (!supabaseUrl || !publishableKey || /SUPABASE_/.test(`${supabaseUrl}${publishableKey}`)) {
  throw new Error("Aveniq Supabase URL and publishable key are required.");
}

function record(status, name, detail = "") {
  results.push({ status, name, detail });
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status.padEnd(4)} ${name}${suffix}`);
}

function expect(name, condition, detail = "") {
  record(condition ? "PASS" : "FAIL", name, condition ? "" : detail);
  return condition;
}

function skip(name, detail) {
  record("SKIP", name, detail);
}

async function apiRequest(path, { method = "GET", token = publishableKey, body, auth = false } = {}) {
  const response = await fetch(`${supabaseUrl}/${auth ? "auth/v1" : "rest/v1"}/${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { status: response.status, data };
}

function messageOf(response) {
  return String(response?.data?.message || response?.data?.msg || response?.data?.error_description || "");
}

function isEmptyRows(response) {
  return response.status === 200 && Array.isArray(response.data) && response.data.length === 0;
}

async function runPublicBoundaryTests() {
  console.log("\nPublic Data API boundary");

  const restaurants = await apiRequest("restaurants?select=id&limit=1");
  expect(
    "anon cannot select restaurants",
    [401, 403].includes(restaurants.status) && restaurants.data?.code === "42501",
    `expected 401/403 permission denial, received ${restaurants.status}`
  );

  const publicRestaurant = await apiRequest("rpc/get_public_restaurant", {
    method: "POST",
    body: { p_slug: "codex-authorization-probe-does-not-exist", p_table_ref: "" }
  });
  expect(
    "anon can execute get_public_restaurant",
    publicRestaurant.status === 400 && publicRestaurant.data?.code !== "42501",
    `expected application validation response, received ${publicRestaurant.status}`
  );

  const submitOrder = await apiRequest("rpc/submit_order", {
    method: "POST",
    body: {
      p_restaurant_id: ZERO_UUID,
      p_table_id: ZERO_UUID,
      p_local_id: "x",
      p_note: "",
      p_items: [],
      p_customer_name: ""
    }
  });
  expect(
    "anon can execute submit_order",
    submitOrder.status === 400 && submitOrder.data?.code !== "42501",
    `expected application validation response, received ${submitOrder.status}`
  );

  const customerStatus = await apiRequest("rpc/get_customer_order_status", {
    method: "POST",
    body: { p_order_id: ZERO_UUID, p_local_id: "none", p_table_token: "none" }
  });
  expect(
    "anon can execute get_customer_order_status",
    customerStatus.status === 200,
    `expected 200, received ${customerStatus.status}`
  );

  const privilegedUpdate = await apiRequest("rpc/update_restaurant_order_status", {
    method: "POST",
    body: { p_restaurant_id: ZERO_UUID, p_order_id: ZERO_UUID, p_action: "Ready" }
  });
  expect(
    "anon cannot execute staff order update",
    [401, 403].includes(privilegedUpdate.status) && privilegedUpdate.data?.code === "42501",
    `expected 401/403 permission denial, received ${privilegedUpdate.status}`
  );

  const reportDashboard = await apiRequest("rpc/get_report_dashboard", {
    method: "POST",
    body: { p_restaurant_id: ZERO_UUID }
  });
  expect(
    "anon cannot execute report RPCs",
    [401, 403].includes(reportDashboard.status) && reportDashboard.data?.code === "42501",
    `expected 401/403 permission denial, received ${reportDashboard.status}`
  );
}

const roleAccounts = [
  { label: "manager", expectedRole: "manager", prefix: "MANAGER" },
  { label: "all-round staff", expectedRole: "staff", prefix: "ALLROUND" },
  { label: "kitchen", expectedRole: "kitchen", prefix: "KITCHEN" },
  { label: "cashier", expectedRole: "cashier", prefix: "CASHIER" },
  { label: "owner", expectedRole: "owner", prefix: "OWNER", optional: true }
];

function credentialsFor(account) {
  return {
    email: process.env[`AVENIQ_${account.prefix}_EMAIL`] || "",
    password: process.env[`AVENIQ_${account.prefix}_PASSWORD`] || "",
    restaurantId: process.env[`AVENIQ_${account.prefix}_RESTAURANT_ID`] || ""
  };
}

async function signIn(email, password) {
  return apiRequest("token?grant_type=password", {
    auth: true,
    method: "POST",
    body: { email, password }
  });
}

async function probeOrderAction(token, restaurantId, action) {
  return apiRequest("rpc/update_restaurant_order_status", {
    method: "POST",
    token,
    body: { p_restaurant_id: restaurantId, p_order_id: ZERO_UUID, p_action: action }
  });
}

async function runCrossTenantReads(label, token, ownRestaurantId) {
  if (!otherRestaurantId) {
    skip(`${label}: cross-restaurant isolation`, "set AVENIQ_OTHER_RESTAURANT_ID");
    return;
  }
  if (otherRestaurantId === ownRestaurantId) {
    record("FAIL", `${label}: cross-restaurant isolation`, "other restaurant ID matches the account restaurant");
    return;
  }

  const encoded = encodeURIComponent(otherRestaurantId);
  const checks = [
    ["restaurants", `restaurants?select=id&id=eq.${encoded}`],
    ["restaurant_staff", `restaurant_staff?select=id&restaurant_id=eq.${encoded}`],
    ["categories", `categories?select=id&restaurant_id=eq.${encoded}`],
    ["tables", `tables?select=id&restaurant_id=eq.${encoded}`],
    ["menu_items", `menu_items?select=id&restaurant_id=eq.${encoded}`],
    ["orders", `orders?select=id&restaurant_id=eq.${encoded}`],
    ["order_items", `order_items?select=id&restaurant_id=eq.${encoded}`]
  ];

  for (const [table, path] of checks) {
    const response = await apiRequest(path, { token });
    expect(
      `${label}: foreign ${table} rows are hidden`,
      isEmptyRows(response),
      `expected an empty 200 response, received ${response.status}`
    );
  }

  const rpcProbe = await probeOrderAction(token, otherRestaurantId, "AUTHORIZATION_PROBE");
  expect(
    `${label}: foreign order RPC is denied before validation`,
    rpcProbe.status === 400 && /RESTAURANT_ACCESS_DENIED/.test(messageOf(rpcProbe)),
    `expected RESTAURANT_ACCESS_DENIED, received ${rpcProbe.status} ${messageOf(rpcProbe)}`
  );

  const reportProbe = await apiRequest("rpc/get_report_dashboard", {
    method: "POST",
    token,
    body: { p_restaurant_id: otherRestaurantId }
  });
  expect(
    `${label}: foreign report RPC is denied`,
    reportProbe.status === 400 && /REPORT_ACCESS_DENIED/.test(messageOf(reportProbe)),
    `expected REPORT_ACCESS_DENIED, received ${reportProbe.status} ${messageOf(reportProbe)}`
  );
}

async function runRoleAccount(account) {
  const credentials = credentialsFor(account);
  console.log(`\nRole: ${account.label}`);

  if (!credentials.email && !credentials.password) {
    skip(`${account.label}: authenticated tests`, `set AVENIQ_${account.prefix}_EMAIL and AVENIQ_${account.prefix}_PASSWORD`);
    return;
  }
  if (!credentials.email || !credentials.password) {
    record("FAIL", `${account.label}: credentials`, "both email and password are required");
    return;
  }

  const login = await signIn(credentials.email, credentials.password);
  if (!expect(`${account.label}: login`, login.status === 200 && Boolean(login.data?.access_token), `received ${login.status}`)) return;

  const token = login.data.access_token;
  const userId = login.data.user?.id;
  const memberships = await apiRequest(
    `restaurant_staff?select=id,restaurant_id,role,restaurants(id,slug,name,status)&user_id=eq.${encodeURIComponent(userId)}`,
    { token }
  );
  if (!expect(`${account.label}: memberships load`, memberships.status === 200 && Array.isArray(memberships.data), `received ${memberships.status}`)) return;

  const membership = memberships.data.find((entry) =>
    entry.role === account.expectedRole && (!credentials.restaurantId || entry.restaurant_id === credentials.restaurantId)
  );
  if (!expect(`${account.label}: expected role`, Boolean(membership), `expected database role ${account.expectedRole}`)) return;

  const restaurantId = membership.restaurant_id;
  const ownRestaurant = await apiRequest(`restaurants?select=id&id=eq.${encodeURIComponent(restaurantId)}`, { token });
  expect(`${account.label}: own restaurant is readable`, ownRestaurant.status === 200 && ownRestaurant.data?.length === 1, `received ${ownRestaurant.status}`);

  const ownOrders = await apiRequest(`orders?select=id&restaurant_id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { token });
  expect(`${account.label}: own orders are readable`, ownOrders.status === 200 && Array.isArray(ownOrders.data), `received ${ownOrders.status}`);

  const platformRole = await apiRequest(`platform_admins?select=user_id&user_id=eq.${encodeURIComponent(userId)}`, { token });
  expect(`${account.label}: Master role is not inherited`, isEmptyRows(platformRole), `expected no platform role, received ${platformRole.status}`);

  const team = await apiRequest("rpc/list_restaurant_team", {
    method: "POST",
    token,
    body: { p_restaurant_id: restaurantId }
  });
  const canManageTeam = ["owner", "manager"].includes(account.expectedRole);
  expect(
    `${account.label}: team-management boundary`,
    canManageTeam
      ? team.status === 200
      : team.status === 400 && /STAFF_MANAGEMENT_ACCESS_DENIED/.test(messageOf(team)),
    `received ${team.status} ${messageOf(team)}`
  );

  const dashboardReport = await apiRequest("rpc/get_report_dashboard", {
    method: "POST",
    token,
    body: { p_restaurant_id: restaurantId }
  });
  const canViewReports = ["owner", "manager"].includes(account.expectedRole);
  expect(
    `${account.label}: report-access boundary`,
    canViewReports
      ? dashboardReport.status === 200
      : dashboardReport.status === 400 && /REPORT_ACCESS_DENIED/.test(messageOf(dashboardReport)),
    `received ${dashboardReport.status} ${messageOf(dashboardReport)}`
  );

  const preparing = await probeOrderAction(token, restaurantId, "Preparing");
  const paid = await probeOrderAction(token, restaurantId, "Paid");
  const canUseKitchen = ["owner", "manager", "staff", "kitchen"].includes(account.expectedRole);
  const canUseFrontDesk = ["owner", "manager", "staff", "cashier"].includes(account.expectedRole);

  expect(
    `${account.label}: kitchen action boundary`,
    preparing.status === 400 && new RegExp(canUseKitchen ? "ORDER_NOT_FOUND" : "KITCHEN_ROLE_REQUIRED").test(messageOf(preparing)),
    `received ${preparing.status} ${messageOf(preparing)}`
  );
  expect(
    `${account.label}: front-desk action boundary`,
    paid.status === 400 && new RegExp(canUseFrontDesk ? "ORDER_NOT_FOUND" : "CASHIER_ROLE_REQUIRED").test(messageOf(paid)),
    `received ${paid.status} ${messageOf(paid)}`
  );

  await runCrossTenantReads(account.label, token, restaurantId);
}

async function main() {
  console.log("Aveniq authorization verification (read-only / zero-ID probes)");
  await runPublicBoundaryTests();
  for (const account of roleAccounts) await runRoleAccount(account);

  const skippedRequiredCoverage = results.some((result) =>
    result.status === "SKIP" && !result.name.startsWith("owner:")
  );
  if (requireRoleTests && skippedRequiredCoverage) {
    record("FAIL", "required role coverage", "one or more required role or cross-restaurant checks were skipped");
  }

  console.log(`\nSummary: ${results.filter((r) => r.status === "PASS").length} passed, ${results.filter((r) => r.status === "FAIL").length} failed, ${results.filter((r) => r.status === "SKIP").length} skipped.`);
  process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
}

main().catch((error) => {
  console.error(`FAIL test runner - ${error.message}`);
  process.exitCode = 1;
});
