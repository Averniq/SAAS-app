#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

globalThis.window = {};
await import("../supabase-config.js");

const config = globalThis.window.TABLEORDER_SUPABASE;

if (!config?.url || !config?.publishableKey) {
  throw new Error("Missing Supabase URL or publishable key in supabase-config.js.");
}

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

loadDotEnvLocal();

const serviceKey = process.env.AVENIQ_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  throw new Error("Missing AVENIQ_SUPABASE_SERVICE_ROLE_KEY. Put it in .env.local or the current shell.");
}

const restaurantSlug = process.env.AVENIQ_TEST_RESTAURANT_SLUG || "demo";

const accounts = [
  ...(process.env.AVENIQ_OWNER_PASSWORD ? [{
    label: "owner",
    email: process.env.AVENIQ_OWNER_EMAIL || "aveniq.owner.test@example.com",
    password: process.env.AVENIQ_OWNER_PASSWORD,
    role: "owner"
  }] : []),
  {
    label: "manager",
    email: process.env.AVENIQ_MANAGER_EMAIL || "aveniq.manager.test@example.com",
    password: process.env.AVENIQ_MANAGER_PASSWORD,
    role: "manager"
  },
  {
    label: "all-round staff",
    email: process.env.AVENIQ_ALLROUND_EMAIL || "aveniq.staff.test@example.com",
    password: process.env.AVENIQ_ALLROUND_PASSWORD,
    role: "staff"
  },
  {
    label: "kitchen",
    email: process.env.AVENIQ_KITCHEN_EMAIL || "aveniq.kitchen.test@example.com",
    password: process.env.AVENIQ_KITCHEN_PASSWORD,
    role: "kitchen"
  },
  {
    label: "cashier",
    email: process.env.AVENIQ_CASHIER_EMAIL || "aveniq.cashier.test@example.com",
    password: process.env.AVENIQ_CASHIER_PASSWORD,
    role: "cashier"
  }
];

const missingPasswords = accounts.filter((account) => !account.password);
if (missingPasswords.length) {
  throw new Error(`Missing test passwords for: ${missingPasswords.map((account) => account.label).join(", ")}`);
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: serviceHeaders(options.headers || {})
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || text || response.statusText;
    const error = new Error(`${response.status} ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=100`, {
      headers: { "Content-Type": "application/json" }
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 100) break;
  }
  return null;
}

async function createOrUpdateUser(account) {
  try {
    const created = await request("/auth/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { test_account: true, role_fixture: account.role }
      })
    });
    return { user: created, action: "created" };
  } catch (error) {
    if (error.status !== 422 && error.status !== 400) throw error;
    const existing = await findUserByEmail(account.email);
    if (!existing?.id) throw error;
    const updated = await request(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), test_account: true, role_fixture: account.role }
      })
    });
    return { user: updated, action: "updated" };
  }
}

async function getRestaurantId(slug) {
  const rows = await request(`/rest/v1/restaurants?slug=eq.${encodeURIComponent(slug)}&select=id`, {
    headers: { Accept: "application/json" }
  });
  const restaurant = Array.isArray(rows) ? rows[0] : null;
  if (!restaurant?.id) throw new Error(`Restaurant slug not found: ${slug}`);
  return restaurant.id;
}

async function upsertMembership(restaurantId, userId, role) {
  const rows = await request("/rest/v1/restaurant_staff?on_conflict=restaurant_id,user_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([{ restaurant_id: restaurantId, user_id: userId, role }])
  });
  return Array.isArray(rows) ? rows[0] : null;
}

const restaurantId = await getRestaurantId(restaurantSlug);
console.log(`Provisioning authorization users for restaurant "${restaurantSlug}".`);

for (const account of accounts) {
  const { user, action } = await createOrUpdateUser(account);
  if (!user?.id) throw new Error(`No user id returned for ${account.email}.`);
  const membership = await upsertMembership(restaurantId, user.id, account.role);
  console.log(`${account.email} -> ${action}, role=${membership?.role || account.role}`);
}

console.log("Provisioning complete. Run pnpm run test:authorization with the same account environment variables.");
