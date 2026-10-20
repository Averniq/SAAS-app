import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const container = "supabase_db_aveniq-kitchen-p0-20261020";
const suite = process.argv[process.argv.indexOf("--suite") + 1] || "access";
if (!process.argv.includes("--local"))
  throw Error("Explicit --local is mandatory");
const marker = spawnSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
    container,
  ],
  { encoding: "utf8" },
);
if (
  marker.status !== 0 ||
  marker.stdout.trim() !== "aveniq-kitchen-p0-20261020"
)
  throw Error("Isolated stack identity mismatch");
const suites =
  suite === "acceptance" ? ["access", "dispatch", "delivery"] : [suite];
for (const name of suites) {
  if (!["access", "dispatch", "delivery"].includes(name))
    throw Error("Unknown suite");
  const sql = await readFile(
    new URL("../tests/sql/kitchen-printing-" + name + ".sql", import.meta.url),
    "utf8",
  );
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
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status || 1);
}
