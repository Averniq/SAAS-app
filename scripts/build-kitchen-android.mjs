import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const check = spawnSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
    "supabase_db_aveniq-kitchen-mainline-20261020",
  ],
  { encoding: "utf8" },
);
if (
  check.status !== 0 ||
  check.stdout.trim() !== "aveniq-kitchen-mainline-20261020"
)
  throw Error("Isolated local stack required");
const raw = await readFile(".local-print/api-config.raw", "utf8");
const config = JSON.parse(raw.slice(raw.indexOf("{")));
if (process.argv.slice(2).some((arg) => arg !== "--fault-injection"))
  throw Error("Unknown local build argument");
const url = "http://10.0.2.2:58031",
  nativeUrl = process.argv.includes("--fault-injection")
    ? "http://10.0.2.2:58035"
    : url,
  key = config.ANON_KEY;
if (!key || config.API_URL !== "http://127.0.0.1:58031")
  throw Error("Only isolated local backend builds are authorized");
if (process.env.CONTEXT)
  throw Error("Native local build must not run in a deployment context");
const built = spawnSync(process.execPath, ["scripts/build-site.mjs"], {
  encoding: "utf8",
  env: {
    ...process.env,
    AVENIQ_PUBLIC_CONFIG_MODE: "development",
    AVENIQ_SUPABASE_URL: "http://127.0.0.1:58031",
    AVENIQ_SUPABASE_PUBLISHABLE_KEY: key,
  },
});
if (built.status !== 0)
  throw Error("Configured local web build failed: " + built.stderr);
await writeFile(
  "dist/supabase-config.js",
  "window.TABLEORDER_SUPABASE = " +
    JSON.stringify({
      url,
      publishableKey: key,
      restaurantSlug: "",
      staffUsername: "",
      staffEmail: "",
    }) +
    ";",
);
await mkdir("android/app/src/main/assets", { recursive: true });
await writeFile(
  "android/app/src/main/assets/kitchen-backend.json",
  JSON.stringify({ url: nativeUrl, publishableKey: key }),
);
console.log(
  "Native build targets only isolated local Supabase; no hosted backend configured.",
);
