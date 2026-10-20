import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// This runner intentionally accepts only a disposable local PostgreSQL URL.
const databaseUrl = process.env.P0_03_LOCAL_DATABASE_URL;
let parsedUrl;
try { parsedUrl = new URL(databaseUrl); } catch { throw new Error("Set P0_03_LOCAL_DATABASE_URL to a disposable localhost PostgreSQL URL; hosted databases are refused."); }
if (!/^postgres(?:ql)?:$/.test(parsedUrl.protocol) || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedUrl.hostname)) {
  throw new Error("Set P0_03_LOCAL_DATABASE_URL to a disposable localhost PostgreSQL URL; hosted databases are refused.");
}
for (const file of ["scripts/p0-03-local-assertions.sql", "scripts/p0-03-local-concurrency-setup.sql", "scripts/p0-03-local-concurrency-verify.sql", "scripts/p0-03-local-concurrency-teardown.sql"]) {
  if (!existsSync(file)) throw new Error(`Local P0-03 test file is missing: ${file}`);
}

function psql(args, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...(quiet ? ["-qAt"] : []), ...args], { windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`Unable to start local psql: ${error.message}`)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function vars(fixture) {
  return Object.entries(fixture).flatMap(([name, value]) => ["-v", `${name}=${value}`]);
}

const behavior = await psql(["-f", "scripts/p0-03-local-assertions.sql"]);
process.stdout.write(behavior.stdout); process.stderr.write(behavior.stderr);
if (behavior.status !== 0) process.exit(behavior.status ?? 1);

const fixture = Object.fromEntries(["restaurant_id", "table_id", "cashier_id", "order_id", "idempotency_a", "idempotency_b"].map((name) => [name, randomUUID()]));
let fixtureCreated = false;
try {
  const setup = await psql([...vars(fixture), "-f", "scripts/p0-03-local-concurrency-setup.sql"]);
  process.stdout.write(setup.stdout); process.stderr.write(setup.stderr);
  if (setup.status !== 0) process.exit(setup.status ?? 1);
  fixtureCreated = true;
  const claim = JSON.stringify({ role: "authenticated", sub: fixture.cashier_id }).replace(/'/g, "''");
  const paymentSql = (key) => `begin; set local role authenticated; select set_config('request.jwt.claims', '${claim}', true); select public.record_authoritative_payment('${fixture.restaurant_id}'::uuid,'${fixture.order_id}'::uuid,600,'Cash','','','${key}'::uuid); commit;`;
  const attempts = await Promise.all([psql(["-c", paymentSql(fixture.idempotency_a)]), psql(["-c", paymentSql(fixture.idempotency_b)])]);
  const succeeded = attempts.filter((attempt) => attempt.status === 0).length;
  if (succeeded !== 1) throw new Error(`Concurrent settlement expected exactly one success, received ${succeeded}.\n${attempts.map((attempt) => attempt.stderr).join("\n")}`);
  const verified = await psql([...vars(fixture), "-f", "scripts/p0-03-local-concurrency-verify.sql"]);
  process.stdout.write(verified.stdout); process.stderr.write(verified.stderr);
  if (verified.status !== 0) process.exit(verified.status ?? 1);
  console.log("P0-03 disposable local integration matrix passed.");
} finally {
  if (fixtureCreated) {
    const cleanup = await psql([...vars(fixture), "-f", "scripts/p0-03-local-concurrency-teardown.sql"]);
    process.stdout.write(cleanup.stdout); process.stderr.write(cleanup.stderr);
    if (cleanup.status !== 0 && !process.exitCode) process.exitCode = cleanup.status ?? 1;
  }
}
