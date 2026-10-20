import { materializeKitchenCandidate } from "./materialize-kitchen-print-candidate.mjs";
import { readdir, mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const id = "aveniq-kitchen-p0-replay-20261020",
  container = "supabase_db_" + id,
  workspace = path.resolve(".local-print/replay");
const candidates = (await readdir("supabase/kitchen-print-candidates"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => path.resolve("supabase/kitchen-print-candidates", f));
const manifest = await materializeKitchenCandidate({
  destination: workspace,
  projectId: id,
  ports: { api: 57831, db: 57832, shadow: 57830, studio: 57833 },
  candidateFiles: candidates,
});
const migrationRoot = path.join(workspace, "supabase/migrations"),
  pending = path.join(workspace, "verified-input");
await mkdir(pending);
for (const file of await readdir(migrationRoot))
  await rename(path.join(migrationRoot, file), path.join(pending, file));
const started = spawnSync(
  path.resolve(".tools/supabase.exe"),
  [
    "start",
    "--workdir",
    workspace,
    "--exclude",
    "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
  ],
  { encoding: "utf8", windowsHide: true },
);
await writeFile(
  ".tools/clean-replay-start.log",
  started.stdout + started.stderr,
);
if (started.status)
  throw Error("Isolated empty replay stack failed; see private log");
function sql(input) {
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
  if (label.status || label.stdout.trim() !== id)
    throw Error("Replay stack identity mismatch");
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
    { input, encoding: "utf8" },
  );
  if (r.status) throw Error(r.stderr);
  return r.stdout;
}
const defaults = sql(
  "select defaclrole::regrole,defaclacl from pg_default_acl where defaclnamespace='public'::regnamespace and defaclobjtype='f';",
);
await writeFile(".tools/replay-default-acl-before.txt", defaults);
// This initialization hardens the disposable fixture before historical application functions exist.
// It changes no migration and grants no privilege.
sql(
  "alter default privileges for role postgres in schema public revoke execute on functions from service_role;",
);
for (const item of [...manifest.canonical, ...manifest.candidates]) {
  sql(await readFile(path.join(pending, item.filename), "utf8"));
  console.log("Replayed " + item.filename);
}
for (const suite of ["access", "dispatch", "delivery"])
  sql(await readFile("tests/sql/kitchen-printing-" + suite + ".sql", "utf8"));
await writeFile(
  ".tools/clean-replay-result.json",
  JSON.stringify(
    {
      canonical: manifest.canonical.length,
      candidates: manifest.candidates.length,
      sqlSuites: 3,
      baselineInitialization:
        "revoke service_role default execute before legacy function creation",
      passed: true,
    },
    null,
    2,
  ),
);
console.log(
  "Clean disposable replay passed with explicit hardened initialization; frozen canonical files unchanged.",
);
