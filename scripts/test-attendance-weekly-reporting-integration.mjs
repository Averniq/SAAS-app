import process from "node:process";

const required = ["AVENIQ_SUPABASE_URL","AVENIQ_SUPABASE_PUBLISHABLE_KEY","AVENIQ_ATTENDANCE_MANAGER_EMAIL","AVENIQ_ATTENDANCE_MANAGER_PASSWORD","AVENIQ_ATTENDANCE_RESTAURANT_A_ID","AVENIQ_ATTENDANCE_RESTAURANT_B_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) { console.log(`SKIP integration test: missing ${missing.join(", ")}`); process.exit(0); }
const base = process.env.AVENIQ_SUPABASE_URL.replace(/\/$/, ""); const key = process.env.AVENIQ_SUPABASE_PUBLISHABLE_KEY;
let token = ""; let failed = 0;
function result(name, pass, detail = "") { console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failed++; }
async function call(path, body, auth = true) { const response = await fetch(`${base}/${auth ? "rest/v1/" : "auth/v1/"}${path}`, { method:"POST", headers:{apikey:key,Authorization:`Bearer ${auth ? token : key}`,"Content-Type":"application/json"},body:JSON.stringify(body) }); const text = await response.text(); let data; try { data=text ? JSON.parse(text) : null; } catch { data=text; } return {status:response.status,data}; }
const login = await call("token?grant_type=password", {email:process.env.AVENIQ_ATTENDANCE_MANAGER_EMAIL,password:process.env.AVENIQ_ATTENDANCE_MANAGER_PASSWORD}, false); token=login.data?.access_token || ""; if (!token) throw new Error("Manager login failed.");
const today = new Date(); const day = today.getDay(); const monday = new Date(today); monday.setDate(today.getDate() - ((day + 6) % 7)); const from=monday.toISOString().slice(0,10); const sunday=new Date(monday); sunday.setDate(monday.getDate()+6); const to=sunday.toISOString().slice(0,10);
const report = await call("rpc/get_weekly_attendance_report", {p_restaurant_id:process.env.AVENIQ_ATTENDANCE_RESTAURANT_A_ID,p_from:from,p_to:to,p_shift_status:"all"});
result("owner/admin weekly report", report.status===200 && Array.isArray(report.data?.staff) && Array.isArray(report.data?.details), `HTTP ${report.status}`);
result("report supplies screen/CSV numeric totals", Number.isInteger(report.data?.summary?.total_paid_minutes), `HTTP ${report.status}`);
const settings = await call("rpc/get_attendance_report_settings", {p_restaurant_id:process.env.AVENIQ_ATTENDANCE_RESTAURANT_A_ID});
result("report settings policy", settings.status===200 && settings.data?.clock_out_rounding === "floor" && settings.data?.clock_out_rounding_interval_minutes === 15, `HTTP ${settings.status}`);
const cross = await call("rpc/get_weekly_attendance_report", {p_restaurant_id:process.env.AVENIQ_ATTENDANCE_RESTAURANT_B_ID,p_from:from,p_to:to,p_shift_status:"all"});
result("cross-tenant report rejected", cross.status >= 400, `HTTP ${cross.status}`);
process.exitCode = failed ? 1 : 0;
