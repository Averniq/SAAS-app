import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["scripts/test-migration-integrity.mjs"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
if (result.status !== 0) {
  console.error("Migration release gate FAILED:");
  console.error(result.stderr || result.stdout);
  process.exitCode = 1;
} else console.log("Migration release-control gate passed. This static approval gate requires the documented isolated replay and hosted read-only preflight before deployment authorization.");
