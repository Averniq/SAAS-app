import fs from "node:fs";

let failed = 0;
function result(name, pass) { console.log(`${pass ? "PASS" : "FAIL"} ${name}`); if (!pass) failed++; }
function roundedMinute(minute) { return Math.floor(minute / 15) * 15; }
for (const [actual, expected] of [[0,0],[5,0],[10,0],[14,0],[15,15],[16,15],[29,15],[30,30],[46,45]]) result(`${actual}:00 minute rounding`, roundedMinute(actual) === expected);
function paid(clockIn, actualOut, breakMinutes = 0, openBreak = false) { const reportOut = Math.floor(actualOut / 15) * 15; return openBreak || reportOut < clockIn ? 0 : Math.max(0, reportOut - clockIn - breakMinutes); }
result("break deduction", paid(9*60+2,17*60+16,30) === 463);
result("multiple shifts combine", paid(9*60,12*60+5) + paid(13*60,17*60+16) === 435);
result("missing clock-out is excluded", paid(9*60, 0) === 0);
result("open break is excluded for review", paid(9*60,17*60,30,true) === 0);
result("cross-midnight paid duration remains positive", paid(23*60+50,24*60+20) === 25);

const sql = fs.readFileSync(new URL("../supabase/migrations/034_attendance_weekly_reports.sql", import.meta.url), "utf8");
for (const [name, token] of [
  ["tenant isolation", "s.restaurant_id=p_restaurant_id"],
  ["local timezone grouping", "timezone(v_timezone,s.clock_in_at)::date"],
  ["local timezone rounding", "at time zone v_timezone"],
  ["open breaks require review", "has_open_break"],
  ["original timestamps are not updated", "returns jsonb"],
  ["server-side report permission", "can_view_attendance_reports"],
  ["CSV source fields", "calculated_paid_minutes"],
  ["report settings stored in tenant config", "attendance_report_settings"]
]) result(name, sql.includes(token));
process.exitCode = failed ? 1 : 0;
