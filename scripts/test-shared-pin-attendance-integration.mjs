import process from "node:process";

const required = ["AVENIQ_SUPABASE_URL","AVENIQ_SUPABASE_PUBLISHABLE_KEY","AVENIQ_ATTENDANCE_MANAGER_EMAIL","AVENIQ_ATTENDANCE_MANAGER_PASSWORD","AVENIQ_ATTENDANCE_MANAGER_B_EMAIL","AVENIQ_ATTENDANCE_MANAGER_B_PASSWORD","AVENIQ_ATTENDANCE_RESTAURANT_A_ID","AVENIQ_ATTENDANCE_STAFF_A_ID","AVENIQ_ATTENDANCE_RESTAURANT_B_ID","AVENIQ_ATTENDANCE_STAFF_B_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) { console.log(`SKIP integration test: missing ${missing.join(", ")}`); process.exit(0); }
const base = process.env.AVENIQ_SUPABASE_URL.replace(/\/$/, ""); const key = process.env.AVENIQ_SUPABASE_PUBLISHABLE_KEY;
const A = process.env.AVENIQ_ATTENDANCE_RESTAURANT_A_ID, B = process.env.AVENIQ_ATTENDANCE_RESTAURANT_B_ID, staffA = process.env.AVENIQ_ATTENDANCE_STAFF_A_ID, staffB = process.env.AVENIQ_ATTENDANCE_STAFF_B_ID;
let token = ""; let failed = 0;
function result(name, pass, detail = "") { console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failed++; }
async function call(path, body, auth = true) { const response = await fetch(`${base}/${auth ? "rest/v1/" : "auth/v1/"}${path}`, { method:"POST", headers:{apikey:key,Authorization:`Bearer ${auth ? token : key}`,"Content-Type":"application/json"}, body:JSON.stringify(body) }); const text = await response.text(); let data; try { data=text?JSON.parse(text):null; } catch { data=text; } return {status:response.status,data}; }
async function rpc(name, body) { return call(`rpc/${name}`, body); }
const login = await call("token?grant_type=password", {email:process.env.AVENIQ_ATTENDANCE_MANAGER_EMAIL,password:process.env.AVENIQ_ATTENDANCE_MANAGER_PASSWORD}, false); token=login.data?.access_token || ""; if (!token) throw new Error("Manager login failed.");
async function setPin(restaurant, staff, pin) { return rpc("set_staff_attendance_pin", {p_restaurant_id:restaurant,p_staff_user_id:staff,p_pin:pin,p_enabled:true}); }
async function identify(restaurant, pin, device) { return rpc("identify_attendance_pin", {p_restaurant_id:restaurant,p_pin:pin,p_device_id:device}); }
async function action(actionToken, action) { return rpc("shared_attendance_action", {p_action_token:actionToken,p_action:action}); }

const pinA = "1837", pinB = "1837", deviceA = `attendance-test-${Date.now()}`;
const setTenantA = await setPin(A,staffA,pinA); result("set tenant A PIN", setTenantA.status === 204, `HTTP ${setTenantA.status}${setTenantA.data?.code ? ` ${setTenantA.data.code}` : ""}`);
const managerAToken = token;
const loginB = await call("token?grant_type=password", {email:process.env.AVENIQ_ATTENDANCE_MANAGER_B_EMAIL,password:process.env.AVENIQ_ATTENDANCE_MANAGER_B_PASSWORD}, false); token=loginB.data?.access_token || ""; if (!token) throw new Error("Tenant B manager login failed.");
const setTenantB = await setPin(B,staffB,pinB); result("same PIN allowed in tenant B", setTenantB.status === 204, `HTTP ${setTenantB.status}${setTenantB.data?.code ? ` ${setTenantB.data.code}` : ""}`);
token = managerAToken;
for (let i=1;i<=5;i++) { const response=await identify(A,"9999",deviceA); result(`failed PIN ${i}`, response.status===200 && response.data?.status === "PIN_NOT_RECOGNISED", `HTTP ${response.status} ${response.data?.status || response.data?.code || ""}${response.data?.message ? ` ${response.data.message}` : ""}`); }
const locked = await identify(A,pinA,deviceA); result("locked valid PIN is generic", locked.status===200 && !locked.data?.action_token && locked.data?.status === "PIN_NOT_RECOGNISED", `HTTP ${locked.status} ${locked.data?.status || locked.data?.code || ""}`);
await new Promise((resolve)=>setTimeout(resolve,31000));
const identified = await identify(A,pinA,deviceA); result("unlock after timeout", identified.status===200 && Boolean(identified.data?.action_token));
const duplicate = await Promise.all([action(identified.data?.action_token,"clock_in"),action(identified.data?.action_token,"clock_in")]);
const successfulClockIns = duplicate.filter((r)=>r.status===200).length;
result("clock in", successfulClockIns===1);
result("simultaneous duplicate clock in", successfulClockIns===1);
const breakPin = await identify(A,pinA,`${deviceA}-3`); result("break start", (await action(breakPin.data?.action_token,"break_start")).status===200);
const onBreak = await identify(A,pinA,`${deviceA}-4`); result("clock out while on break", (await action(onBreak.data?.action_token,"clock_out")).status>=400);
const endBreak = await identify(A,pinA,`${deviceA}-5`); result("break end", (await action(endBreak.data?.action_token,"break_end")).status===200);
const expiring = await identify(A,pinA,`${deviceA}-6`); await new Promise((resolve)=>setTimeout(resolve,21000)); result("expired token", (await action(expiring.data?.action_token,"clock_out")).status>=400);
const reusable = await identify(A,pinA,`${deviceA}-7`); const first=await action(reusable.data?.action_token,"clock_out"), second=await action(reusable.data?.action_token,"clock_out"); result("reused token", first.status===200 && second.status>=400);
const prior = await identify(A,pinA,`${deviceA}-8`); await setPin(A,staffA,"2846"); result("PIN reset invalidates old token", (await action(prior.data?.action_token,"clock_in")).status>=400); result("old PIN rejected", !(await identify(A,pinA,`${deviceA}-9`)).data?.action_token);
const crossTenant = await identify(B,pinB,`${deviceA}-b`); result("cross-tenant identify rejected", crossTenant.status===200 && !crossTenant.data?.action_token);
process.exitCode = failed ? 1 : 0;
