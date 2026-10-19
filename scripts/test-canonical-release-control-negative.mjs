import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "p0-01d-group5-negative-"));
const manifestPath = path.join(fixtureRoot, "supabase", "catalog-manifest.json");
const run = () => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "test-canonical-release-control.mjs"), "--root", fixtureRoot], { encoding: "utf8", windowsHide: true });
async function resetFixture() { await rm(path.join(fixtureRoot, "supabase"), { recursive: true, force: true }); await cp(path.join(repoRoot, "supabase"), path.join(fixtureRoot, "supabase"), { recursive: true }); }
async function expectFailure(name, mutate) { await resetFixture(); await mutate(); const manifestText = await readFile(manifestPath, "utf8"); await writeFile(path.join(fixtureRoot, "supabase", "catalog-manifest.sha256"), `${createHash("sha256").update(manifestText.replace(/\r\n/g, "\n"), "utf8").digest("hex")}\n`); if (run().status === 0) throw new Error(`${name}: validator unexpectedly passed`); console.log(`negative case passed: ${name}`); }
try {
  await expectFailure("changed approved migration hash", async () => { const file = path.join(fixtureRoot, "supabase", "migrations", "001_initial_schema.sql"); await writeFile(file, `${await readFile(file, "utf8")}\n-- fixture mutation\n`); });
  await expectFailure("missing approved migration", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.canonicalChain.pop(); await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("added unapproved canonical migration", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.canonicalChain.push({ ...manifest.canonicalChain[17], order: 19, version: "20260817055037", filename: "043_public_qr_order_idempotency.sql" }); await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("duplicate canonical version", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.canonicalChain[17].version = manifest.canonicalChain[16].version; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("reordered manifest", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); [manifest.canonicalChain[0], manifest.canonicalChain[1]] = [manifest.canonicalChain[1], manifest.canonicalChain[0]]; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("historical evidence promoted", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.historicalEvidence.mutated011.canonicalTreatment = "approved"; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("historical SQL substituted into the canonical chain", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.canonicalChain[10] = { ...manifest.canonicalChain[10], version: "022", filename: "022_staff_presence.sql", sha256: "0c3eca85e37b1ec0199d2ed49188794c74130693e12d451caa2cb29cc55e477b" }; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("altered manifest approval metadata", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.status = "draft"; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
  await expectFailure("altered canonical source metadata", async () => { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.canonicalSourceCommit = "not-a-real-commit"; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); });
} finally { await rm(fixtureRoot, { recursive: true, force: true }); }
