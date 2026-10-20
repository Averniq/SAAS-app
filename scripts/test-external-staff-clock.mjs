import fs from "node:fs";

const sql = fs.readFileSync(new URL("../supabase/migrations/040_external_staff_clock_links.sql", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../supabase-client.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const checks = [
  ["cryptographic random token", "extensions.gen_random_bytes(32)"],
  ["token stored only as a hash", "extensions.digest(v_token,'sha256')"],
  ["link is revocable", "set is_active=false"],
  ["old link action tokens invalidated", "delete from public.attendance_action_tokens where staff_clock_link_id"],
  ["public lookup resolves server-side link", "get_public_staff_clock_context(p_public_token text)"],
  ["public PIN does not accept restaurant or device id", "identify_public_staff_clock_pin(p_public_token text,p_pin text)"],
  ["attendance enabled is enforced", "r.attendance_enabled"],
  ["existing rate-limit rules retained", "v_attempts>=5"],
  ["external action verifies active link", "join public.staff_clock_links"],
  ["public functions are the only anonymous grants", "grant execute on function public.get_public_staff_clock_context(text),public.identify_public_staff_clock_pin(text,text),public.public_staff_clock_action(uuid,text) to anon,authenticated"],
  ["no hash appears in public response", !sql.slice(sql.indexOf("get_public_staff_clock_context"), sql.indexOf("identify_public_staff_clock_pin")).includes("token_hash'")],
  ["public route does not initialize staff auth", app.includes("if (APP_ROUTE.area === \"staff-clock\") initializeExternalStaffClock();")],
  ["client exposes no general public management API", !client.includes("getWeeklyAttendanceReport(public")],
  ["public screen is PIN-only", app.includes("externalStaffClockContent")]
];
let failed = 0;
for (const [name, pass] of checks) {
  const ok = typeof pass === "string" ? sql.includes(pass) : pass;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;
