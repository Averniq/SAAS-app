import { materializeKitchenCandidate } from "./materialize-kitchen-print-candidate.mjs";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
if (process.argv.slice(2).join(" ") !== "--local")
  throw Error("Explicit --local only; no hosted or linked target accepted");
const cli = process.env.SUPABASE_CLI || path.resolve(".tools/supabase.exe");
const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
if (version.status || version.stdout.trim() !== "2.121.0")
  throw Error(
    "Install tested Supabase CLI2.121.0 at .tools/supabase.exe or SUPABASE_CLI",
  );
const destination = path.resolve(".local-print/mainline");
const manifest = await materializeKitchenCandidate({
  destination,
  projectId: "aveniq-kitchen-mainline-20261020",
  ports: { api: 58031, db: 58032, shadow: 58030, studio: 58033 },
  candidateFiles: (await readdir("supabase/kitchen-print-candidates"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.resolve("supabase/kitchen-print-candidates", f)),
});
await mkdir(".local-print", { recursive: true });
const started = spawnSync(
  cli,
  [
    "start",
    "--workdir",
    destination,
    "--exclude",
    "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
  ],
  { encoding: "utf8", windowsHide: true },
);
await writeFile(
  ".local-print/start-private.log",
  started.stdout + started.stderr,
);
if (started.status)
  throw Error(
    "Task-local start failed; inspect ignored private log, do not reset another stack",
  );
const status = spawnSync(
  cli,
  ["status", "--workdir", destination, "--output", "json"],
  { encoding: "utf8", windowsHide: true },
);
if (status.status) throw Error("Local status failed");
const text = status.stdout,
  config = JSON.parse(text.slice(text.indexOf("{")));
if (config.API_URL !== "http://127.0.0.1:58031")
  throw Error("Local origin mismatch");
await writeFile(".local-print/api-config.raw", text);
console.log(
  "Created only " +
    manifest.projectId +
    " with " +
    manifest.canonical.length +
    " unchanged main migrations and " +
    manifest.candidates.length +
    " candidates. API127.0.0.1:58031. Private local credentials remain ignored.",
);
