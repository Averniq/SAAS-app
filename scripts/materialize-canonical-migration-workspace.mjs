import { mkdir, readFile, rm, copyFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/materialize-canonical-migration-workspace.mjs <destination>");
const validation = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "test-canonical-release-control.mjs")], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
if (validation.status !== 0) throw new Error(`Refusing to materialize an invalid release-control chain:\n${validation.stderr || validation.stdout}`);
const manifest = JSON.parse(await readFile(path.join(repoRoot, "supabase", "catalog-manifest.json"), "utf8"));
if (manifest.status !== "approved-local-canonical-chain" || manifest.canonicalChain?.length !== 22) throw new Error("Refusing to materialize a non-approved canonical chain");
const workspace = path.resolve(destination);
await rm(workspace, { recursive: true, force: true });
await mkdir(path.join(workspace, "supabase", "migrations"), { recursive: true });
await copyFile(path.join(repoRoot, "supabase", "config.toml"), path.join(workspace, "supabase", "config.toml"));
for (const entry of manifest.canonicalChain) await copyFile(path.join(repoRoot, "supabase", "migrations", entry.filename), path.join(workspace, "supabase", "migrations", entry.filename));
await writeFile(path.join(workspace, "supabase", "catalog-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Materialized ${manifest.canonicalChain.length} approved migrations at ${workspace}`);
