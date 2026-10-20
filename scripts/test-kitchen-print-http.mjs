import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const raw = await readFile(".local-print/api-config.raw", "utf8");
const config = JSON.parse(raw.slice(raw.indexOf("{")));
const origin = "http://127.0.0.1:57631";
if (config.API_URL !== origin) throw Error("Local stack only");
const anon = config.ANON_KEY,
  service = config.SERVICE_ROLE_KEY;
async function request(path, body, token = anon, expected = 200) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (r.status !== expected && !(expected === 200 && r.ok))
    throw Error(
      "Local API " + path + ": " + r.status + " " + JSON.stringify(data),
    );
  return data;
}
const email = randomUUID() + "@kitchen.local",
  password = randomBytes(24).toString("hex") + "Aa1!";
const owner = await request(
  "/auth/v1/admin/users",
  { email, password, email_confirm: true },
  service,
);
const login = await request("/auth/v1/token?grant_type=password", {
  email,
  password,
});
const uid = owner.id,
  rid = randomUUID(),
  other = randomUUID(),
  tableId = randomUUID(),
  itemId = randomUUID(),
  token = randomBytes(32).toString("hex");
const q = (s) => "'" + s + "'";
const sql = [
  "begin;",
  "insert into public.restaurants(id,name,slug,status,is_active,is_open,ordering_enabled) values(" +
    q(rid) +
    ",'SYNTHETIC KITCHEN'," +
    q("print-" + rid) +
    ",'active',true,true,true),(" +
    q(other) +
    ",'OTHER TENANT'," +
    q("print-" + other) +
    ",'active',true,true,true);",
  "insert into public.restaurant_staff(restaurant_id,user_id,role) values(" +
    q(rid) +
    "," +
    q(uid) +
    ",'owner');",
  "insert into public.public_qr_ordering_entitlements(restaurant_id,active,expires_at) values(" +
    q(rid) +
    ",true,now()+interval '2 days');",
  "insert into public.tables(id,restaurant_id,name,table_name,local_id,table_token) values(" +
    q(tableId) +
    "," +
    q(rid) +
    ",'Table 5','Table 5','t5'," +
    q(randomUUID()) +
    ");",
  "insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values(" +
    q(itemId) +
    "," +
    q(rid) +
    ",'SYNTHETIC WAGYU',10,'wagyu','Kitchen','[]');",
  "insert into public.public_order_tokens(restaurant_id,table_id,token_hash,expires_at) values(" +
    q(rid) +
    "," +
    q(tableId) +
    "," +
    q(createHash("sha256").update(token).digest("hex")) +
    ",now()+interval '2 days');",
  "commit;",
].join("\n");
const container = "supabase_db_aveniq-kitchen-p0-20261020";
const check = spawnSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
    container,
  ],
  { encoding: "utf8" },
);
if (check.status || check.stdout.trim() !== "aveniq-kitchen-p0-20261020")
  throw Error("Stack marker");
const seeded = spawnSync(
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
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8" },
);
if (seeded.status) throw Error(seeded.stderr);
const rpc = (name, body, t = login.access_token) =>
  request("/rest/v1/rpc/" + name, body, t);
const printer = await rpc("save_kitchen_printer", {
  p_restaurant_id: rid,
  p_printer_id: null,
  p_config: {
    name: "Emulator simulator",
    ip: "10.0.2.2",
    port: 19100,
    copies: 2,
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
const key = randomUUID(),
  payload = {
    p_token: token,
    p_items: [
      { menu_item_id: itemId, quantity: 2, notes: "No onion", options: [] },
    ],
    p_customer_name: "",
    p_note: "Synthetic acceptance only",
    p_idempotency_key: key,
  };
const orders = await Promise.all(
  Array.from({ length: 10 }, () =>
    rpc("submit_public_qr_order", payload, anon),
  ),
);
assert.equal(new Set(orders.map((o) => o.id)).size, 1);
const history = await rpc("list_kitchen_print_history", {
  p_restaurant_id: rid,
  p_before: null,
  p_before_id: null,
  p_limit: 50,
});
assert.equal(history.length, 1);
const headers = {
  apikey: anon,
  Authorization: "Bearer " + login.access_token,
  "Content-Type": "application/json",
};
const wrongTenant = await fetch(origin + "/rest/v1/rpc/list_kitchen_printers", {
  method: "POST",
  headers,
  body: JSON.stringify({ p_restaurant_id: other }),
});
assert.equal(wrongTenant.status, 403);
for (const table of [
  "kitchen_print_jobs",
  "kitchen_print_devices",
  "kitchen_print_pairings",
]) {
  const response = await fetch(origin + "/rest/v1/" + table + "?select=*", {
    headers,
  });
  assert.equal(response.status, 403);
}
const badLimit = await fetch(
  origin + "/rest/v1/rpc/list_kitchen_print_history",
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_restaurant_id: rid,
      p_limit: null,
      p_before: null,
      p_before_id: null,
    }),
  },
);
assert.ok(!badLimit.ok, "NULL history limit must be rejected");

for (const role of ["manager", "staff", "kitchen", "cashier", "customer"]) {
  const credentials = {
    email: randomUUID() + "@roles.kitchen.local",
    password: randomBytes(20).toString("hex") + "Aa1!",
  };
  const person = await request(
    "/auth/v1/admin/users",
    { ...credentials, email_confirm: true },
    service,
  );
  const logged = await request(
    "/auth/v1/token?grant_type=password",
    credentials,
  );
  if (role !== "customer") {
    const roleSeed = spawnSync(
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
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input:
          "insert into public.restaurant_staff(restaurant_id,user_id,role) values(" +
          q(rid) +
          "," +
          q(person.id) +
          "," +
          q(role) +
          ");",
        encoding: "utf8",
      },
    );
    if (roleSeed.status) throw Error(roleSeed.stderr);
  }
  const headers = {
    apikey: anon,
    Authorization: "Bearer " + logged.access_token,
    "Content-Type": "application/json",
  };
  const read = await fetch(origin + "/rest/v1/rpc/list_kitchen_printers", {
    method: "POST",
    headers,
    body: JSON.stringify({ p_restaurant_id: rid }),
  });
  assert.equal(
    read.status,
    ["manager", "staff", "kitchen"].includes(role) ? 200 : 403,
    "read permission " + role,
  );
  const save = await fetch(origin + "/rest/v1/rpc/save_kitchen_printer", {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_restaurant_id: rid,
      p_printer_id: null,
      p_config: { name: "Synthetic " + role, ip: null },
    }),
  });
  assert.equal(
    save.status,
    role === "manager" ? 200 : 403,
    "configure permission " + role,
  );
}
const concurrencyPrinter = await rpc("save_kitchen_printer", {
  p_restaurant_id: rid,
  p_printer_id: null,
  p_config: { name: "Concurrency only", ip: "10.0.2.2", port: 19110 },
});
const deviceIds = [];
for (let i = 0; i < 2; i++) {
  const secret = randomBytes(32).toString("hex");
  const pair = await rpc("begin_kitchen_print_pairing", {
    p_restaurant_id: rid,
    p_device_name: "Concurrent " + i,
    p_secret_hash: createHash("sha256").update(secret).digest("hex"),
  });
  await rpc("approve_kitchen_print_pairing", {
    p_pairing_id: pair.id,
    p_printer_ids: [concurrencyPrinter.id],
  });
  const device = await rpc("activate_kitchen_print_pairing", {
    p_pairing_id: pair.id,
    p_secret: secret,
  });
  deviceIds.push({ p_device_id: device.deviceId, p_device_secret: secret });
}
const testKey = randomUUID();
const testId = await rpc("request_kitchen_test_print", {
  p_printer_id: concurrencyPrinter.id,
  p_request_key: testKey,
});
assert.equal(
  testId,
  await rpc("request_kitchen_test_print", {
    p_printer_id: concurrencyPrinter.id,
    p_request_key: testKey,
  }),
);
const claims = await Promise.all(
  Array.from({ length: 20 }, (_, i) =>
    rpc("claim_kitchen_printer_job", deviceIds[i % 2]),
  ),
);
const claimed = claims
  .map((value, index) => ({ value, index }))
  .filter((x) => x.value);
assert.equal(
  claimed.length,
  1,
  "20 concurrent claims / 2 tablets must yield one live claim",
);
const winner = claimed[0],
  proof = deviceIds[winner.index % 2],
  attempt = randomUUID(),
  claim = winner.value;
await rpc("begin_kitchen_print_attempt", {
  ...proof,
  p_job_id: claim.jobId,
  p_claim_token: claim.claimToken,
  p_attempt_id: attempt,
  p_config_revision: claim.configRevision,
});
await rpc("finish_kitchen_print_attempt", {
  ...proof,
  p_job_id: claim.jobId,
  p_claim_token: claim.claimToken,
  p_attempt_id: attempt,
  p_outcome: "uncertain",
  p_error_code: "SYNTHETIC_ACK_LOSS",
});
assert.equal(
  await rpc("claim_kitchen_printer_job", deviceIds[1]),
  null,
  "uncertain endpoint must not retry",
);
await rpc("resolve_kitchen_print_uncertainty", {
  p_job_id: claim.jobId,
  p_resolution: "agent_stopped",
  p_reason: "Synthetic agents stopped; no bytes sent by HTTP test",
});
await rpc("disable_kitchen_printer", {
  p_printer_id: concurrencyPrinter.id,
  p_reason: "Synthetic concurrency test complete",
});
for (const proof of deviceIds) {
  await rpc("revoke_kitchen_print_device", {
    p_device_id: proof.p_device_id,
    p_reason: "Synthetic device test complete",
  });
  const denied = await fetch(
    origin + "/rest/v1/rpc/claim_kitchen_printer_job",
    { method: "POST", headers, body: JSON.stringify(proof) },
  );
  assert.equal(denied.status, 403);
}
const categoryBar = randomUUID(),
  categoryDessert = randomUUID(),
  barItem = randomUUID(),
  dessertItem = randomUUID();
const routesSql =
  "insert into public.categories(id,restaurant_id,name) values(" +
  q(categoryBar) +
  "," +
  q(rid) +
  ",'Synthetic Bar'),(" +
  q(categoryDessert) +
  "," +
  q(rid) +
  ",'Synthetic Dessert'); insert into public.menu_items(id,restaurant_id,category_id,name,price,local_id,category,option_config) values(" +
  q(barItem) +
  "," +
  q(rid) +
  "," +
  q(categoryBar) +
  ",'Synthetic Soda',3,'soda','Synthetic Bar','[]'),(" +
  q(dessertItem) +
  "," +
  q(rid) +
  "," +
  q(categoryDessert) +
  ",'Synthetic Cake',5,'cake','Synthetic Dessert','[]');";
const routesSeed = spawnSync(
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
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: routesSql, encoding: "utf8" },
);
if (routesSeed.status) throw Error(routesSeed.stderr);
await rpc("save_kitchen_printer", {
  p_restaurant_id: rid,
  p_printer_id: printer.id,
  p_config: {
    ...printer,
    categoryRoutes: [
      { categoryId: categoryBar, destination: "Bar" },
      { categoryId: categoryDessert, destination: "Dessert" },
    ],
  },
});
const bar = await rpc("save_kitchen_printer", {
  p_restaurant_id: rid,
  p_printer_id: null,
  p_config: {
    name: "Bar simulator route",
    ip: "10.0.2.2",
    port: 19120,
    destination: "Bar",
    auto_print: true,
  },
});
const dessert = await rpc("save_kitchen_printer", {
  p_restaurant_id: rid,
  p_printer_id: null,
  p_config: {
    name: "Dessert simulator route",
    ip: "10.0.2.2",
    port: 19121,
    destination: "Dessert",
    auto_print: true,
  },
});
const routed = await rpc(
  "submit_public_qr_order",
  {
    ...payload,
    p_idempotency_key: randomUUID(),
    p_items: [
      { menu_item_id: barItem, quantity: 1, options: [] },
      { menu_item_id: dessertItem, quantity: 1, options: [] },
    ],
  },
  anon,
);
const routedJobs = await rpc("list_kitchen_print_history", {
  p_restaurant_id: rid,
  p_before: null,
  p_before_id: null,
  p_limit: 50,
});
assert.deepEqual(
  routedJobs
    .filter((j) => j.order_id === routed.id)
    .map((j) => j.printer_id)
    .sort(),
  [bar.id, dessert.id].sort(),
);
console.log(
  "Extended HTTP matrix passed: manager/staff/kitchen/cashier/customer roles, 20 claims across two devices, explicit test idempotency, uncertain quarantine, revocation, Bar/Dessert routing.",
);

await writeFile(
  ".local-print/emulator-fixture.json",
  JSON.stringify(
    {
      rid,
      uid,
      printerId: printer.id,
      accessToken: login.access_token,
      expiresAt: login.expires_at,
      jobId: history[0].id,
      email,
      password,
    },
    null,
    2,
  ),
);
console.log(
  "HTTP acceptance passed: local Auth, 10 concurrent QR submissions, one job, cross-tenant denial, direct table denial, bounded history. Private synthetic emulator fixture saved.",
);
