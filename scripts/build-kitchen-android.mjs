import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const check = spawnSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
    "supabase_db_aveniq-kitchen-p0-20261020",
  ],
  { encoding: "utf8" },
);
if (check.status !== 0 || check.stdout.trim() !== "aveniq-kitchen-p0-20261020")
  throw Error("Isolated local stack required");
const raw = await readFile(".local-print/api-config.raw", "utf8");
const config = JSON.parse(raw.slice(raw.indexOf("{")));
const url = "http://10.0.2.2:57631",
  key = config.ANON_KEY;
if (!key || !String(config.API_URL).startsWith("http://127.0.0.1:57631"))
  throw Error("Only isolated local backend builds are authorized");
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
  JSON.stringify({ url, publishableKey: key }),
);
console.log(
  "Native build targets only isolated local Supabase; no hosted backend configured.",
);
