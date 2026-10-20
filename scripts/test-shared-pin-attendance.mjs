import fs from "node:fs";

const sql = fs.readFileSync(new URL("../supabase/migrations/029_harden_shared_pin_attendance.sql", import.meta.url), "utf8");
const rateSql = fs.readFileSync(new URL("../supabase/migrations/030_shared_pin_rate_limit.sql", import.meta.url), "utf8");
const managementSql = fs.readFileSync(new URL("../supabase/migrations/033_staff_attendance_pin_management.sql", import.meta.url), "utf8");
const checks = [
  ["one open shift constraint", "staff_shifts_one_open_shift_idx"],
  ["one open break constraint", "staff_shift_breaks_one_open_break_idx"],
  ["single-use action tokens", "set used_at=now()"],
  ["token invalidated on PIN reset", "delete from public.attendance_action_tokens"],
  ["clock-out rejects open break", "raise exception 'OPEN_BREAK'"],
  ["tenant isolation in action query", "restaurant_id=t.restaurant_id"],
  ["hardened definer search path", "set search_path=public,pg_temp"],
  ["no direct token/event table access", "revoke all on table public.attendance_action_tokens,public.attendance_events"]
  ,["five failures trigger a lock", "v_attempts>=5"]
  ,["30-second lock", "interval '30 seconds'"]
  ,["two-minute failure window", "interval '2 minutes'"]
  ,["failure cleanup", "interval '24 hours'"]
  ,["PIN not stored in limiter", "No attempted PIN or hash is stored"]
  ,["PIN management requires owner/admin or manager permission", "can_manage_restaurant_staff(p_restaurant_id)"]
  ,["PIN set and reset events are audited", "'PIN_SET'"]
  ,["PIN reset event is audited", "'PIN_RESET'"]
  ,["PIN audit records acting user only", "jsonb_build_object('acted_by',auth.uid())"]
  ,["staff status projection excludes PIN hash", "'attendance_pin_configured'"]
];
let failed = 0;
for (const [name, expected] of checks) {
  const pass = sql.includes(expected) || rateSql.includes(expected) || managementSql.includes(expected) || (name === "one open shift constraint" && fs.readFileSync(new URL("../supabase/migrations/027_staff_attendance.sql", import.meta.url), "utf8").includes(expected));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) failed++;
}
const teamProjectionSql = managementSql.slice(managementSql.indexOf("create or replace function public.list_restaurant_team"));
for (const [name, pass] of [
  ["staff list never returns PIN hash", !teamProjectionSql.includes("'attendance_pin_hash'")],
  ["PIN audit metadata omits raw PIN", !managementSql.includes("jsonb_build_object('pin'") && !managementSql.includes("jsonb_build_object('pin_hash'")],
  ["unused tokens are invalidated on PIN change", managementSql.includes("and used_at is null")]
]) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) failed++;
}
if (failed) process.exitCode = 1;
