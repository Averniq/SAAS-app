#!/usr/bin/env node

/**
 * Development/test-only Aveniq restaurant operations simulator.
 *
 * This script is intentionally limited to restaurants whose slug starts with
 * "uat-simulator-". A reset archives earlier simulator venues rather than
 * deleting their orders, payments, or audit history.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";

globalThis.window = {};
await import("../supabase-config.js");
const config = globalThis.window.TABLEORDER_SUPABASE;

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(resolve(process.cwd(), ".env.local"));
const serviceKey = process.env.AVENIQ_SUPABASE_SERVICE_ROLE_KEY;
if (!config?.url || !serviceKey) throw new Error("AVENIQ Supabase configuration and service role key are required in .env.local.");

const prefix = "uat-simulator-";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const slug = `${prefix}${runId}`;
const credentialsPath = resolve(process.cwd(), ".env.uat.local");
const password = process.env.AVENIQ_UAT_PASSWORD || `Uat!${randomBytes(18).toString("base64url")}`;
const accounts = [
  ["OWNER", "owner", "owner"], ["MANAGER", "manager", "manager"],
  ["CASHIER_1", "cashier1", "cashier"], ["CASHIER_2", "cashier2", "cashier"],
  ["WAITER_1", "waiter1", "staff"], ["WAITER_2", "waiter2", "staff"], ["WAITER_3", "waiter3", "staff"],
  ["KITCHEN_1", "kitchen1", "kitchen"], ["KITCHEN_2", "kitchen2", "kitchen"]
].map(([key, local, role]) => ({ key, email: `aveniq.uat.${local}@example.com`, role }));

function headers(extra = {}) { return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...extra }; }
async function request(path, options = {}) {
  const response = await fetch(`${config.url}${path}`, { ...options, headers: headers(options.headers) });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(`${response.status} ${data?.message || data?.msg || data?.hint || body || response.statusText}`);
  return data;
}
async function rest(path, options = {}) { return request(`/rest/v1/${path}`, options); }
async function signIn(email) {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) throw new Error(`Unable to sign in ${email} for test payment seeding.`);
  return data.access_token;
}
async function restAsUser(token, path, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(`${response.status} ${data?.message || data?.msg || data?.hint || body || response.statusText}`);
  return data;
}

async function findUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const user = (data?.users || []).find((row) => row.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if ((data?.users || []).length < 100) return null;
  }
  return null;
}
async function ensureUser(account) {
  const existing = await findUser(account.email);
  const payload = { email: account.email, password, email_confirm: true, user_metadata: { uat_simulator: true, fixture_role: account.role } };
  if (!existing) return request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
  return request(`/auth/v1/admin/users/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
}
async function insert(table, rows) {
  return rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) });
}
function cents(value) { return Math.round(Number(value) * 100); }

if (process.argv.includes("--reset")) {
  await rest(`restaurants?slug=like.${encodeURIComponent(`${prefix}*`)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "inactive", is_active: false, is_open: false })
  });
}

const users = {};
for (const account of accounts) users[account.key] = await ensureUser(account);

const [restaurant] = await insert("restaurants", [{
  owner_user_id: users.OWNER.id, name: "Aveniq UAT Bistro", slug, restaurant_type: "Restaurant",
  address: "1 Test Lane, Sydney NSW 2000", phone: "0290000000", timezone: "Australia/Sydney",
  status: "active", subtitle: "Repeatable UAT restaurant simulator", tax_id: "UAT-ABN", tax_rate: 10,
  is_open: true, is_active: true, theme_config: { simulator: true, reset_mode: "archive-and-recreate" }
}]);
const restaurantId = restaurant.id;

await insert("restaurant_staff", accounts.map((account) => ({
  restaurant_id: restaurantId, user_id: users[account.key].id, role: account.role,
  attendance_report_access: account.role === "manager"
})));
const cashierToken = await signIn(accounts.find((account) => account.key === "CASHIER_1").email);
const ownerToken = await signIn(accounts.find((account) => account.key === "OWNER").email);

const categoryNames = ["Starters", "Mains", "Grill", "Sides", "Desserts", "Drinks"];
const categories = await insert("categories", categoryNames.map((name, index) => ({ restaurant_id: restaurantId, name, sort_order: index + 1 })));
const categoryId = Object.fromEntries(categories.map((category) => [category.name, category.id]));
const tables = await insert("tables", Array.from({ length: 10 }, (_, index) => ({
  restaurant_id: restaurantId, local_id: `uat-table-${index + 1}`, table_number: index + 1,
  table_name: `Table ${index + 1}`, name: `Table ${index + 1}`, table_token: `uat-${runId}-t${index + 1}`,
  sort_order: index + 1, is_active: true
})));

const menu = [
  ["Starters", "Garlic Bread", 8.5], ["Starters", "Crispy Calamari", 14.5], ["Starters", "Roasted Pumpkin Soup", 11], ["Starters", "Bruschetta", 12],
  ["Mains", "Chicken Parmigiana", 26], ["Mains", "Beer Battered Fish", 24], ["Mains", "Mushroom Risotto", 23], ["Mains", "Classic Beef Burger", 21.5], ["Mains", "Caesar Salad", 18],
  ["Grill", "Ribeye Steak", 38], ["Grill", "Grilled Salmon", 32], ["Grill", "Lamb Cutlets", 35], ["Grill", "Vegetable Skewers", 20],
  ["Sides", "Seasoned Chips", 8], ["Sides", "Garden Salad", 7.5], ["Sides", "Steamed Vegetables", 8.5], ["Sides", "Onion Rings", 9],
  ["Desserts", "Sticky Date Pudding", 12], ["Desserts", "Chocolate Brownie", 11], ["Desserts", "Vanilla Panna Cotta", 10.5],
  ["Drinks", "Sparkling Water", 5], ["Drinks", "Lemon Lime Bitters", 6], ["Drinks", "House Red Wine", 11], ["Drinks", "Flat White", 4.5], ["Drinks", "Iced Tea", 6]
];
const menuItems = await insert("menu_items", menu.map(([category, name, price], index) => ({
  restaurant_id: restaurantId, category_id: categoryId[category], local_id: `uat-menu-${index + 1}`, category, name,
  description: `${name} prepared for the Aveniq UAT simulator.`, price, tags: index % 5 === 0 ? ["Vegetarian"] : [],
  option_template: index % 4 === 0 ? "spiceAddons" : "none",
  option_config: index % 4 === 0 ? [{ id: "spice", name: "Spice level", choices: [{ id: "mild", name: "Mild", price: 0 }, { id: "hot", name: "Hot", price: 0 }] }, { id: "extra", name: "Extras", choices: [{ id: "cheese", name: "Extra cheese", price: 2 }] }] : [],
  sort_order: index + 1, is_active: true, is_available: index < 23, sold_out: index >= 23
})));

async function seedOrder(index, status, paymentStatus, daysAgo, quantity = 1) {
  const item = menuItems[index % menuItems.length]; const table = tables[index % tables.length];
  const total = Number(item.price) * quantity; const tax = Math.round(total * 10 / 110 * 100) / 100; const subtotal = Math.round((total - tax) * 100) / 100;
  const createdAt = new Date(Date.now() - daysAgo * 86400000 - index * 600000).toISOString();
  // Seed payments through the canonical ledger; order status remains
  // operational presentation, not proof that money was received.
  const initialStatus = paymentStatus === "paid" ? "new" : status;
  const initialPaymentStatus = paymentStatus === "paid" ? "unpaid" : paymentStatus;
  const [order] = await insert("orders", [{ restaurant_id: restaurantId, table_id: table.id, local_id: `uat-order-${runId}-${index}`,
    customer_name: `UAT Customer ${index}`, status: initialStatus, payment_status: initialPaymentStatus, subtotal, tax, total,
    note: index % 3 === 0 ? "No onion; allergy note verified by staff." : "UAT historical order", created_at: createdAt,
    served_at: null, closed_at: null, paid_at: null, payment_method: null
  }]);
  await insert("order_items", [{ restaurant_id: restaurantId, order_id: order.id, menu_item_id: item.id, item_name: item.name, name_snapshot: item.name,
    quantity, price: item.price, base_price: item.price, unit_price: item.price, notes: index % 3 === 0 ? "No onion" : "", options: [] }]);
  if (paymentStatus === "paid" || paymentStatus === "partial") await restAsUser(cashierToken, "rpc/record_authoritative_payment", {
    method: "POST", body: JSON.stringify({ p_restaurant_id: restaurantId, p_order_id: order.id,
      p_amount_cents: paymentStatus === "paid" ? cents(total) : Math.max(1, Math.floor(cents(total) / 2)),
      p_method: paymentStatus === "paid" ? "Card" : "Cash", p_note: "Historical UAT payment", p_idempotency_key: randomUUID() })
  });
  return order;
}

await seedOrder(1, "new", "unpaid", 0, 2);
await seedOrder(2, "completed", "paid", 1, 1);
await seedOrder(3, "cancelled", "unpaid", 2, 1);
await seedOrder(4, "ready", "partial", 0, 2);
for (let index = 5; index < 45; index += 1) await seedOrder(index, "completed", "paid", 3 + (index % 21), 1 + (index % 3));

const attendancePins = {};
for (const [index, account] of accounts.entries()) {
  const pin = String(1001 + index); attendancePins[account.key] = pin;
  await restAsUser(ownerToken, "rpc/set_staff_attendance_pin", { method: "POST", body: JSON.stringify({ p_restaurant_id: restaurantId, p_staff_user_id: users[account.key].id, p_pin: pin, p_enabled: true }) });
  const token = await signIn(account.email);
  const identify = async () => restAsUser(token, "rpc/identify_attendance_pin", { method: "POST", body: JSON.stringify({ p_restaurant_id: restaurantId, p_pin: pin, p_device_id: `uat-kiosk-${index + 1}` }) });
  let state = await identify();
  await restAsUser(token, "rpc/shared_attendance_action", { method: "POST", body: JSON.stringify({ p_action_token: state.action_token, p_action: "clock_in" }) });
  state = await identify();
  await restAsUser(token, "rpc/shared_attendance_action", { method: "POST", body: JSON.stringify({ p_action_token: state.action_token, p_action: "break_start" }) });
  state = await identify();
  await restAsUser(token, "rpc/shared_attendance_action", { method: "POST", body: JSON.stringify({ p_action_token: state.action_token, p_action: "break_end" }) });
  state = await identify();
  await restAsUser(token, "rpc/shared_attendance_action", { method: "POST", body: JSON.stringify({ p_action_token: state.action_token, p_action: "clock_out" }) });
}

const envLines = [
  "# Generated by scripts/seed-uat-restaurant-simulator.mjs. Do not commit.", `AVENIQ_UAT_RESTAURANT_SLUG=${slug}`, `AVENIQ_UAT_RESTAURANT_ID=${restaurantId}`,
  `AVENIQ_UAT_PASSWORD=${password}`, `AVENIQ_UAT_CUSTOMER_QR_PATH=/order/${slug}/${tables[0].table_token}`,
  ...accounts.flatMap((account) => [`AVENIQ_UAT_${account.key}_EMAIL=${account.email}`, `AVENIQ_UAT_${account.key}_PIN=${attendancePins[account.key]}`])
];
writeFileSync(credentialsPath, `${envLines.join("\n")}\n`, { mode: 0o600 });
console.log(`UAT simulator ready: ${slug}`);
console.log(`Credentials were written to ${credentialsPath} (ignored by git).`);
console.log(`Customer QR path: /order/${slug}/${tables[0].table_token}`);
