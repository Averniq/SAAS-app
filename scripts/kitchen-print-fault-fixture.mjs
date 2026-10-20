import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const container = "supabase_db_aveniq-kitchen-mainline-20261020";
export const localOrigin = "http://127.0.0.1:58031";
export async function localConfig() {
  const raw = await readFile(".local-print/api-config.raw", "utf8");
  const c = JSON.parse(raw.slice(raw.indexOf("{")));
  assert.equal(c.API_URL, localOrigin);
  return c;
}
export function localSql(sql) {
  const label = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}',
      container,
    ],
    { encoding: "utf8" },
  );
  assert.equal(label.status, 0);
  assert.equal(label.stdout.trim(), "aveniq-kitchen-mainline-20261020");
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (r.status) throw Error(r.stderr);
  return r.stdout.trim();
}
export async function createFaultFixture(port) {
  assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
  const c = await localConfig();
  async function request(path, body, token = c.ANON_KEY) {
    const r = await fetch(localOrigin + path, {
      method: "POST",
      headers: {
        apikey: c.ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        "Local fixture HTTP " +
          r.status +
          ": " +
          (data.message || data.error || path),
      );
    return data;
  }
  const email = randomUUID() + "@fault.kitchen.local",
    password = randomBytes(24).toString("hex") + "Aa1!";
  const user = await request(
    "/auth/v1/admin/users",
    { email, password, email_confirm: true },
    c.SERVICE_ROLE_KEY,
  );
  const login = await request("/auth/v1/token?grant_type=password", {
    email,
    password,
  });
  const rid = randomUUID(),
    table = randomUUID(),
    menu = randomUUID(),
    token = randomBytes(32).toString("hex");
  localSql(`begin;
    insert into public.restaurants(id,name,slug,status,is_active,is_open) values('${rid}','SYNTHETIC FAULT','fault-${rid}','active',true,true);
    insert into public.restaurant_staff(restaurant_id,user_id,role) values('${rid}','${user.id}','owner');
    insert into public.tables(id,restaurant_id,name,table_name,local_id,table_token) values('${table}','${rid}','Fault Table','Fault Table','t-fault','${randomUUID()}');
    insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values('${menu}','${rid}','SYNTHETIC LONG TICKET ${"X".repeat(300)}',10,'fault-item','Kitchen','[]');
    insert into public.public_order_tokens(restaurant_id,table_id,token_hash,created_by,expires_at) values('${rid}','${table}','${createHash("sha256").update(token).digest("hex")}','${user.id}',now()+interval '2 days');commit;`);
  const rpc = (name, body) =>
    request("/rest/v1/rpc/" + name, body, login.access_token);
  const printer = await rpc("save_kitchen_printer", {
    p_restaurant_id: rid,
    p_printer_id: null,
    p_config: {
      name: "FAULT SIMULATOR ONLY",
      ip: "10.0.2.2",
      port,
      copies: 1,
      auto_cut: true,
      auto_print: true,
      destination: "Kitchen",
    },
  });
  await rpc("set_kitchen_print_control", {
    p_restaurant_id: rid,
    p_enabled: true,
    p_allow_test_orders: false,
  });
  // Real trusted QR endpoint creates an immutable >4KiB snapshot using a long synthetic menu name; main ignores per-item request notes.
  const order = await request("/rest/v1/rpc/submit_public_qr_order", {
    p_token: token,
    p_items: Array.from({ length: 24 }, (_, i) => ({
      menu_item_id: menu,
      quantity: 1,
      notes: "LINE " + i + " " + "synthetic note ".repeat(24),
      options: [],
    })),
    p_customer_name: "",
    p_note: "Fault injection synthetic only",
    p_idempotency_key: randomUUID(),
  });
  const history = await rpc("list_kitchen_print_history", {
    p_restaurant_id: rid,
    p_limit: 50,
  });
  const job = history.find((j) => j.order_id === order.id);
  assert(job);
  return {
    rid,
    uid: user.id,
    printerId: printer.id,
    jobId: job.id,
    accessToken: login.access_token,
    expiresAt: login.expires_at,
    rpc,
  };
}
export function jobEvidence(f) {
  return JSON.parse(
    localSql(
      `select json_build_object('state',j.state,'attemptCount',j.attempt_count,'lastOutcome',j.last_outcome,'attemptRows',(select count(distinct a.attempt_id) from public.kitchen_print_attempts a where a.job_id=j.id),'auditEventRows',(select count(*) from public.kitchen_print_attempts a where a.job_id=j.id),'orderStatus',(select status from public.orders where id=j.order_id),'paidAt',(select paid_at from public.orders where id=j.order_id),'orderFingerprint',(select md5(to_jsonb(o)::text) from public.orders o where o.id=j.order_id),'itemsFingerprint',(select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from public.order_items i where i.order_id=j.order_id),'paymentsFingerprint',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) from public.payment_operations p where p.order_id=j.order_id)) from public.kitchen_print_jobs j where j.id='${f.jobId}' and j.restaurant_id='${f.rid}';`,
    ),
  );
}
