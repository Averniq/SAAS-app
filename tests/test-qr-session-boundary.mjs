#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("const issuedQrUrls = new Map();");
const end = source.indexOf("const qrMath", start);
assert.ok(start >= 0 && end > start, "QR session helpers must remain independently testable");

const context = vm.createContext({
  publicQrTokenMetadataAvailability: "available",
  staffUser: { role: "owner", restaurantId: "restaurant-a" },
  window: { TableOrderCloud: {} }
});
vm.runInContext(`
  let publicQrTokenMetadataAvailability = globalThis.publicQrTokenMetadataAvailability;
  let staffUser = globalThis.staffUser;
  ${source.slice(start, end)}
  globalThis.setRole = role => { staffUser = { role, restaurantId: "restaurant-a" }; publicQrTokenMetadataAvailability = "available"; };
  globalThis.canManage = () => canManagePublicQrTokens();
  globalThis.seedIssuedUrl = () => issuedQrUrls.set("table-a", "https://customer.example.invalid/order/plaintext-token");
  globalThis.issuedCount = () => issuedQrUrls.size;
  globalThis.clearSession = () => clearIssuedQrSessionState();
  globalThis.availability = () => publicQrTokenMetadataAvailability;
`, context);

for (const role of ["owner", "manager"]) {
  context.setRole(role);
  assert.equal(context.canManage(), true, `${role} may administer QR tokens when metadata is available`);
}
for (const role of ["staff", "cashier", "platform_admin", "kitchen"]) {
  context.setRole(role);
  assert.equal(context.canManage(), false, `${role} must not administer QR tokens`);
}

context.setRole("owner");
context.seedIssuedUrl();
assert.equal(context.issuedCount(), 1, "owner-issued plaintext URL is present only for the current session");
context.clearSession();
assert.equal(context.issuedCount(), 0, "session boundary must clear plaintext QR URLs");
assert.equal(context.availability(), "unavailable", "session boundary must not retain metadata authorization state");
assert.equal(context.canManage(), false, "cleared metadata prevents QR administration until a new authorized metadata load");

console.log("QR session boundary: PASS (owner/manager only; plaintext QR URLs cleared on session boundary)");
