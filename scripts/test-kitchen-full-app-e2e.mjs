import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const stack = "aveniq-kitchen-p0-20261020",
  container = "supabase_db_" + stack,
  database = "fullapp_e2e2_20261020",
  rest = "aveniq-fullapp-e2e-rest-20261020";
function run(args, input) {
  const r = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.status) throw Error("Docker " + args[0] + " failed: " + r.stderr);
  return r.stdout;
}
function identity() {
  assert.equal(
    run([
      "inspect",
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}',
      container,
    ]).trim(),
    stack,
  );
}
function sql(text, db = database) {
  identity();
  return run(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      db,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}
identity();
const raw = await readFile(".local-print/api-config.raw", "utf8"),
  config = JSON.parse(raw.slice(raw.indexOf("{")));
assert.equal(config.API_URL, "http://127.0.0.1:57631");
const origin = config.API_URL;
const email = randomUUID() + "@fullapp.local",
  password = randomBytes(20).toString("hex") + "Aa1!";
const response = await fetch(origin + "/auth/v1/admin/users", {
  method: "POST",
  headers: {
    apikey: config.ANON_KEY,
    Authorization: "Bearer " + config.SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
assert.ok(response.ok);
const user = await response.json();
assert.equal(
  sql(
    "select count(*) from pg_database where datname='" + database + "';",
    "postgres",
  )
    .trim()
    .split("\n")[2]
    .trim(),
  "0",
);
run(["exec", container, "createdb", "-U", "postgres", database]);
const dump = run([
  "exec",
  container,
  "pg_dump",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "--no-comments",
]);
identity();
run(
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    database,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  dump,
);
const prerequisites = ["013_verified_self_service_provisioning.sql"];
const hashes = [];
for (const f of prerequisites) {
  const body = await readFile("supabase/migrations/" + f, "utf8");
  sql("begin;\n" + body + "\ncommit;");
  hashes.push({
    file: f,
    sha256: createHash("sha256")
      .update(body.replace(/\r\n/g, "\n"))
      .digest("hex"),
  });
}
const rid = randomUUID(),
  tid = randomUUID(),
  mid = randomUUID(),
  slug = "fullapp-" + rid.slice(0, 8),
  q = (s) => "'" + s + "'";
sql(
  `begin;insert into public.restaurants(id,name,slug,status,is_active,is_open,ordering_enabled) values(${q(rid)},'SYNTHETIC FULL APP',${q(slug)},'active',true,true,true);insert into public.restaurant_staff(restaurant_id,user_id,role) values(${q(rid)},${q(user.id)},'owner');insert into public.tables(id,restaurant_id,name,table_name,local_id,table_token) values(${q(tid)},${q(rid)},'Table 5','Table 5','t5',${q(randomUUID())});insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values(${q(mid)},${q(rid)},'E2E WAGYU',10,'e2e-wagyu','Kitchen','[]');commit;`,
);
const info = JSON.parse(run(["inspect", "supabase_rest_" + stack]))[0];
const env = info.Config.Env.filter((v) => v.startsWith("PGRST_")).map((v) =>
  v.startsWith("PGRST_DB_URI=")
    ? v.replace(/\/postgres(\?|$)/, "/" + database + "$1")
    : v,
);
assert.ok(env.find((v) => v.startsWith("PGRST_DB_URI=")).includes(database));
await mkdir(".local-print/fullapp", { recursive: true });
await writeFile(".local-print/fullapp/rest.env", env.join("\n"));
const network = Object.keys(info.NetworkSettings.Networks)[0];
run([
  "run",
  "-d",
  "--name",
  rest,
  "--label",
  "aveniq.test=fullapp-e2e-20261020",
  "--network",
  network,
  "-p",
  "127.0.0.1:57941:3000",
  "--env-file",
  process.cwd() + "/.local-print/fullapp/rest.env",
  info.Config.Image,
]);
await writeFile(
  ".local-print/fullapp/fixture.json",
  JSON.stringify(
    {
      email,
      password,
      userId: user.id,
      restaurantId: rid,
      slug,
      tableId: tid,
      itemId: mid,
      anon: config.ANON_KEY,
      origin,
      database,
      rest,
      prerequisites: hashes,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    database,
    rest,
    prerequisites: hashes,
    syntheticTenant: slug,
  }),
);
