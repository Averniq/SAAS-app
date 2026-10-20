import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [publicOrder, payment, attendance, attendanceActions, externalClock, reporting, authorization] = await Promise.all([
  read("../supabase/migrations/021_sample_qr_test_order_activation.sql"),
  read("../supabase/migrations/039_payment_confirmation_metadata.sql"),
  read("../supabase/migrations/032_fix_pin_rate_limit_window_column.sql"),
  read("../supabase/migrations/029_harden_shared_pin_attendance.sql"),
  read("../supabase/migrations/040_external_staff_clock_links.sql"),
  read("../supabase/migrations/022_exclude_test_orders_from_reporting.sql"),
  read("../scripts/test-authorization.mjs")
]);

// Public customers must resolve restaurant/table server-side and prices must come from that tenant's menu.
assert.match(publicOrder, /token_hash=encode\(digest\(p_token,'sha256'\),'hex'\) and revoked_at is null/);
assert.match(publicOrder, /m\.restaurant_id=t\.restaurant_id and m\.is_active and m\.is_available/);
assert.match(publicOrder, /insert into public\.orders\(restaurant_id,table_id[\s\S]*?t\.restaurant_id,t\.table_id/);
assert.match(publicOrder, /is_test_order\) values[\s\S]*?false\)/, "public QR submissions must be live orders");

// Payment retries, concurrency, overpayment, terminal orders, and tenant scoping are guarded in the database.
assert.match(payment, /where id=p_order_id and restaurant_id=p_restaurant_id for update/);
assert.match(payment, /where restaurant_id=p_restaurant_id and idempotency_key=p_idempotency_key/);
assert.match(payment, /IDEMPOTENCY_KEY_REUSED/);
assert.match(payment, /PAYMENT_EXCEEDS_REMAINING_BALANCE/);
assert.match(payment, /PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER/);
assert.match(payment, /CASHIER_ROLE_REQUIRED/);

// Attendance actions are short-lived, single-use, tenant-scoped, serialized, and rate limited.
assert.match(attendanceActions, /expires_at>(?:clock_timestamp|now)\(\) for update/);
assert.match(attendanceActions, /used_at is null/);
assert.match(attendanceActions, /restaurant_id=t\.restaurant_id and staff_user_id=t\.staff_user_id/);
assert.match(attendance, /v_attempts>=5/);
assert.match(attendance, /(?:clock_timestamp|now)\(\)-interval '2 minutes'/);
assert.match(externalClock, /join public\.staff_clock_links l on l\.id=t\.staff_clock_link_id[\s\S]*?and l\.is_active/);

// Test orders must be excluded from live reporting, and the authorization suite must probe foreign tenants.
assert.match(reporting, /is_test_order/);
assert.match(reporting, /where o\.is_test_order is not true/);
assert.match(authorization, /foreign .* rows are hidden/);
assert.match(authorization, /foreign order RPC is denied before validation/);
assert.match(authorization, /foreign report RPC is denied/);

console.log("Critical server-side security and integrity guard checks passed.");
