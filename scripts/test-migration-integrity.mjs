import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const inventoryPath = path.join(repoRoot, "supabase", "migration-inventory.json");
const hash = (value) => createHash("sha256").update(value.replace(/\r\n/g, "\n"), "utf8").digest("hex");
const errors = [];
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));

if (inventory.schemaVersion !== 3 || inventory.status !== "reconciliation-blocked" || inventory.inventoryKind !== "frozen-historical-reconciliation-evidence" || !Array.isArray(inventory.migrations) || inventory.migrations.length !== 44) errors.push("historical inventory is not the approved 44-entry frozen reconciliation-evidence register");
const anomalies = inventory.preservedAnomalies;
if (anomalies?.mutatedHistorical011?.canonicalTreatment !== "excluded" || anomalies?.mutatedHistorical011?.filename !== "011_consolidate_rls_policies.sql") errors.push("mutated historical 011 is not preserved as excluded evidence");
if (!Array.isArray(anomalies?.duplicateLegacy022) || anomalies.duplicateLegacy022.length !== 2 || new Set(anomalies.duplicateLegacy022.map((entry) => entry.identity)).size !== 2 || anomalies.duplicateLegacy022.some((entry) => entry.canonicalTreatment !== "excluded")) errors.push("duplicate 022 evidence is not preserved as two excluded identities");
if (anomalies?.laterUntrackedSql?.entryCount !== 28 || anomalies.laterUntrackedSql.canonicalTreatment !== "excluded") errors.push("later untracked SQL evidence is not visibly excluded");

const expectedByName = new Map((inventory.migrations ?? []).map((entry) => [entry.filename, entry]));
const filenames = (await readdir(migrationsDir)).filter((filename) => filename.endsWith(".sql"));
for (const [filename, entry] of expectedByName) {
  const content = await readFile(path.join(migrationsDir, filename), "utf8").catch(() => null);
  if (content === null) { errors.push(`frozen historical evidence missing: ${filename}`); continue; }
  const expected = filename === "011_consolidate_rls_policies.sql" ? anomalies?.mutatedHistorical011?.observedWorkingTreeSha256 : entry.immutableSha256;
  if (!/^[a-f0-9]{64}$/.test(expected ?? "") || hash(content) !== expected) errors.push(`frozen historical evidence hash mismatch: ${filename}`);
}
for (const filename of filenames) if (!expectedByName.has(filename) && !["20260816150000_reconcile_role_rls_acl_contract.sql", "20260816150100_repair_targeted_security_definer_paths.sql", "20260816150200_repair_kitchen_print_contract.sql", "20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql", "20260817081037_p0_02_batch2a_authenticated_definer_search_path_hardening.sql", "20260817085228_p0_02_batch2b_public_qr_definer_search_path_hardening.sql", "20260817100000_p0_03_authoritative_payment_operations.sql", "20260817110000_p0_04_public_qr_ordering_boundary.sql"].includes(filename)) errors.push(`migration file lacks both canonical and frozen-evidence classification: ${filename}`);

const canonical = spawnSync(process.execPath, ["scripts/test-canonical-release-control.mjs"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
if (canonical.status !== 0) errors.push(`canonical release control failed:\n${canonical.stderr || canonical.stdout}`);
if (errors.length) {
  console.error(`Migration integrity FAILED (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else console.log("Migration integrity passed: frozen evidence is intact and the separate canonical release chain is approved.");
