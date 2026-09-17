import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Intentionally fixed to the disposable local fixture: no remote URL or environment override.
const args = ["exec", "-i", "supabase_db_p0d01final20260908", "psql", "-X", "-U", "postgres", "-d", "prod_shape_20260915", "-v", "ON_ERROR_STOP=1", "-At"];
const tag = `pay-concurrency-${randomUUID()}`;
const ids = new Map();
const fixtureId = (old) => {
  if (!ids.has(old)) ids.set(old, randomUUID());
  return ids.get(old);
};
const source = readFileSync(new URL("./task4-clean-replay-runtime.sql", import.meta.url), "utf8");
const prefix = source.split("set local role authenticated;")[0];
assert.ok(prefix.includes("insert into public.orders"), "expected fixture setup prefix");
const setup = prefix.replace(/9[0-5]000000-0000-0000-0000-00000000000[1-4]/g, fixtureId).replaceAll("task4-", `${tag}-`);
const id = (kind, number) => ids.get(`9${kind}000000-0000-0000-0000-00000000000${number}`);
const restaurant = id(2, 1);
const user = id(0, 1);
const quoteList = (values) => values.map((value) => `'${value}'`).join(",");
function sql(input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}
function session(input) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  child.stdin.on("error", () => {});
  if (input !== undefined) child.stdin.end(input);
  return { child, done, output: () => stdout };
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 20000;
  while (!check()) {
    assert.ok(Date.now() < deadline, description);
    await delay(50);
  }
}
async function race(order, keys, name) {
  const blocker = session();
  const contenders = [];
  try {
    blocker.child.stdin.write(`begin; select id from public.orders where id='${order}' for update;\n\\echo LOCK_HELD\n`);
    await until(() => blocker.output().includes("LOCK_HELD"), "fixture row lock acquired");
    for (let index = 0; index < 2; index++) {
      contenders.push(session(`set application_name='${tag}-${name}-${index}';
begin; set local statement_timeout='25s'; set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"${user}"}',true);
select public.record_authoritative_payment('${restaurant}','${order}',1000,'Cash','','','${keys[index]}');
commit;`));
    }
    await until(() => Number(sql(`select count(*) from pg_stat_activity where application_name like '${tag}-${name}-%' and wait_event_type='Lock';`)) === 2,
      "both real PostgreSQL sessions overlap while blocked on payment locks");
  } finally {
    blocker.child.stdin.end("commit;\n");
    const release = await blocker.done;
    assert.equal(release.status, 0, release.stderr);
    await Promise.all(contenders.map((entry) => entry.done));
  }
  return Promise.all(contenders.map((entry) => entry.done));
}
let created = false;
try {
  sql(`${setup}\ncommit;`);
  created = true;
  const key = randomUUID();
  const replay = await race(id(4, 1), [key, key], "same");
  replay.forEach((result) => assert.equal(result.status, 0, result.stderr));
  const responses = replay.map((result) => JSON.parse(result.stdout.split(/\r?\n/).find((line) => line.startsWith("{") && line.includes('"payment_id"'))));
  assert.equal(responses[0].payment_id, responses[1].payment_id);
  assert.deepEqual(responses.map((result) => result.idempotent_replay).sort(), [false, true]);
  responses.forEach((result) => assert.equal(result.payment_status, "paid"));
  assert.equal(sql(`select count(*) || ':' || sum(amount_cents) from public.payment_operations where order_id='${id(4, 1)}';`), "1:1000");
  const distinct = await race(id(4, 2), [randomUUID(), randomUUID()], "distinct");
  assert.equal(distinct.filter((result) => result.status === 0).length, 1);
  assert.equal(distinct.filter((result) => result.status !== 0).length, 1);
  assert.match(distinct.find((result) => result.status !== 0).stderr, /PAYMENT_EXCEEDS_REMAINING_BALANCE/);
  assert.equal(sql(`select count(*) || ':' || sum(amount_cents) from public.payment_operations where order_id='${id(4, 2)}';`), "1:1000");
  console.log("Payment writer concurrency: 2/2 PASS (two overlapping PostgreSQL sessions per scenario)");
} finally {
  if (created) {
    const restaurants = quoteList([id(2, 1), id(2, 2)]);
    const users = quoteList([1, 2, 3, 4].map((number) => id(0, number)));
    sql(`begin;
delete from public.payment_operations where restaurant_id in (${restaurants});
delete from public.orders where restaurant_id in (${restaurants});
delete from public.tables where restaurant_id in (${restaurants});
delete from public.restaurant_staff where restaurant_id in (${restaurants});
delete from public.restaurants where id in (${restaurants});
delete from public.organizations where id in (${quoteList([id(1, 1), id(1, 2)])});
delete from auth.users where id in (${users});
commit;`);
    assert.equal(sql(`select (select count(*) from public.payment_operations where restaurant_id in (${restaurants})) + (select count(*) from public.restaurants where id in (${restaurants})) + (select count(*) from auth.users where id in (${users}));`), "0");
    console.log("Synthetic concurrency fixture cleanup: PASS");
  }
}
