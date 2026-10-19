import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.argv[2] === "--root" && process.argv[3] ? path.resolve(process.argv[3]) : defaultRoot;
const manifestPath = path.join(root, "supabase", "catalog-manifest.json");
const inventoryPath = path.join(root, "supabase", "migration-inventory.json");
const migrationsDir = path.join(root, "supabase", "migrations");
const checksumPath = path.join(root, "supabase", "catalog-manifest.sha256");
const hash = (value) => createHash("sha256").update(value.replace(/\r\n/g, "\n"), "utf8").digest("hex");
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const errors = [];
// This source-reviewed allowlist is the independent trust anchor. The adjacent
// manifest checksum detects accidental edits; it must not be the sole authority.
const approvedChain = [
  ["001", "001_initial_schema.sql", "516c883ac75bd806cf6dbe22a50f811df0d9d49c28149459cbf344ab41d36fa8"], ["002", "002_platform_admin.sql", "3d46078eaafecf7144603671ed6a6e6a4bb479cc962e7c5192edf1a2a1146dea"], ["003", "003_restaurant_staff_invites.sql", "0ef8efc03a8ffcc68ab5a750aa4d7d8513081430617d2d1bc43866227c55240d"], ["004", "004_role_hardening.sql", "4e187f41c38d9bef1419c4fb8849e65b86b6e77782f12ed5cf261a052c7b27ad"], ["005", "005_all_round_staff.sql", "acec1d91b1ad6f232b64863fc0dd458cf3cb96b6f7e39a3d9a298faad97f3fe0"], ["006", "006_function_permission_hardening.sql", "00236c27084a9a48d3fe8ea483268c4e0b2f1e8ef63209ebd4f9b2d249638803"], ["007", "007_explicit_data_api_grants.sql", "aff6ad54b657888a2ca5582478209805ab86ff113b0b030cd280041845c13b4c"], ["008", "008_authoritative_option_pricing.sql", "695e60406d54bdca547a75497ba8ce81100269d10e5e0b16fdaafa9c3a974321"], ["009", "009_reporting_layer.sql", "e2b0637e600933aecdaefe009486a035b9134b04d8929bfeaee9ee14de795d27"], ["010", "010_advisor_index_rls_tuning.sql", "6d39a195dac68c579c923c0aa4f57517276e9ff3c261ef26be5580890bf1479c"], ["014", "014_payment_records.sql", "69fbefaa75d0d5ae1c0a954872a72dfd2b90ebc3f3505224dcc74abed5efc918"], ["016", "016_seed_sake_street_test_tenant.sql", "13343b6d5a2f6f8cbaf05a100b9a9d8cedc96883f48d0b3980fa76c363565c80"], ["017", "017_seed_sake_street_categories.sql", "fbb7027cdb6c03fb1f5d085b2b1d20d53855ad8d16196445f7383bd9c306fd9b"], ["018", "018_record_restaurant_order_payment.sql", "c134a858d2a2635bb1e9d283f531addf0c7a8a31af9b8c7aead4a16dc301d25a"], ["20260816150000", "20260816150000_reconcile_role_rls_acl_contract.sql", "c82482e2f06dc7630e184609399bd2148d9103add489667ad9f3cb1d7b2d74ae"], ["20260816150100", "20260816150100_repair_targeted_security_definer_paths.sql", "0eacd529912329a44763ba86efff7ff8506525b2ca819eb77428f4c6cd755021"], ["20260816150200", "20260816150200_repair_kitchen_print_contract.sql", "f391442af105ac84d36e9a61579e99ff4cd281aa95d2250170735ecaabddb883"], ["20260817055036", "20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql", "27efd5b9ec5b1fdc91fcd1bb2f7dfeae9090a2a3fa86b061195e6f6bb91292f8"], ["20260817081037", "20260817081037_p0_02_batch2a_authenticated_definer_search_path_hardening.sql", "51bdcb3e3ef2d64bdbcec988455cf0b3df5584b430997e8911aeb616e46eeea0"], ["20260817085228", "20260817085228_p0_02_batch2b_public_qr_definer_search_path_hardening.sql", "3e4a185edef8ea507a969a0c752109c15badab212692adcbd83b05a8ce2c640f"]
];
approvedChain.push(["20260817100000", "20260817100000_p0_03_authoritative_payment_operations.sql", "57fa7ac3465b5778dc66a93d8a2e51f3769d5e0691eb19a63d4f4d2aa7afb5a0"]);
approvedChain.push(["20260817110000", "20260817110000_p0_04_public_qr_ordering_boundary.sql", "4110fa49d4075717bb83e56230ed6504e0c24f15302b305f7da5f5d33dd8636a"]);

async function loadJson(file, label) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { errors.push(`${label} is unreadable JSON: ${error.message}`); return null; }
}

const manifestText = await readFile(manifestPath, "utf8").catch((error) => { errors.push(`manifest missing: ${error.message}`); return null; });
const manifest = manifestText === null ? null : await loadJson(manifestPath, "manifest");
const inventory = await loadJson(inventoryPath, "historical inventory");
if (manifestText !== null) {
  const expectedChecksum = (await readFile(checksumPath, "utf8").catch((error) => { errors.push(`manifest checksum missing: ${error.message}`); return ""; })).trim();
  const actualChecksum = hash(manifestText);
  if (!isHash(expectedChecksum) || expectedChecksum !== actualChecksum) errors.push("manifest checksum mismatch or malformed approval metadata");
}

if (manifest) {
  if (manifest.schemaVersion !== 1 || manifest.status !== "approved-local-canonical-chain" || manifest.canonicalSourceCommit !== "38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c") errors.push("manifest approval metadata is not the approved Group 5 schema/status/source");
  if (!Array.isArray(manifest.canonicalChain) || manifest.canonicalChain.length !== 22) errors.push("canonical chain must contain exactly 22 entries");
  const entries = Array.isArray(manifest.canonicalChain) ? manifest.canonicalChain : [];
  const versions = new Set(); const filenames = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expected = approvedChain[index];
    if (!entry || entry.order !== index + 1) errors.push(`canonical entry ${index + 1} has non-deterministic order`);
    if (!/^\d{3}$|^\d{14}$/.test(entry?.version ?? "")) errors.push(`canonical entry ${index + 1} has invalid version`);
    if (!entry?.filename || !isHash(entry.sha256) || entry.approvalStatus !== "approved" || typeof entry.provenance !== "string") errors.push(`canonical entry ${index + 1} is structurally incomplete`);
    if (versions.has(entry?.version)) errors.push(`duplicate canonical version ${entry?.version}`); versions.add(entry?.version);
    if (filenames.has(entry?.filename)) errors.push(`duplicate canonical filename ${entry?.filename}`); filenames.add(entry?.filename);
    if (!expected || entry?.version !== expected[0] || entry?.filename !== expected[1] || entry?.sha256 !== expected[2]) errors.push(`canonical entry ${index + 1} differs from the source-reviewed approved chain`);
    const content = await readFile(path.join(migrationsDir, entry?.filename ?? ""), "utf8").catch(() => null);
    if (content === null) errors.push(`approved migration missing: ${entry?.filename}`);
    else if (hash(content) !== entry.sha256) errors.push(`approved migration hash mismatch: ${entry.filename}`);
  }
  if (entries.length !== approvedChain.length) errors.push("canonical chain differs from the source-reviewed approved entry count");
  const forward = ["20260816150000_reconcile_role_rls_acl_contract.sql", "20260816150100_repair_targeted_security_definer_paths.sql", "20260816150200_repair_kitchen_print_contract.sql", "20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql", "20260817081037_p0_02_batch2a_authenticated_definer_search_path_hardening.sql", "20260817085228_p0_02_batch2b_public_qr_definer_search_path_hardening.sql", "20260817100000_p0_03_authoritative_payment_operations.sql", "20260817110000_p0_04_public_qr_ordering_boundary.sql"];
  for (const filename of forward) if (!filenames.has(filename)) errors.push(`approved Group 1-3/15A migration missing: ${filename}`);
  const evidence = manifest.historicalEvidence;
  if (evidence?.treatment !== "frozen-noncanonical-evidence" || evidence?.mutated011?.canonicalTreatment !== "excluded") errors.push("mutated historical 011 is not visibly excluded as noncanonical evidence");
  if (!Array.isArray(evidence?.duplicate022) || evidence.duplicate022.length !== 2 || new Set(evidence.duplicate022.map((item) => item.identity)).size !== 2 || evidence.duplicate022.some((item) => item.canonicalTreatment !== "excluded")) errors.push("duplicate 022 evidence must retain two distinct excluded identities");
  if (evidence?.laterUntrackedSql?.canonicalTreatment !== "excluded" || evidence.laterUntrackedSql.inventoryEntryCount !== 28) errors.push("untracked historical SQL evidence is not visibly excluded");
}

if (!inventory || inventory.status !== "reconciliation-blocked" || !Array.isArray(inventory.migrations) || inventory.migrations.length !== 44) errors.push("historical inventory must remain a 44-entry reconciliation-blocked evidence register");
else {
  const names = new Set(inventory.migrations.map((entry) => entry.filename));
  for (const filename of ["011_consolidate_rls_policies.sql", "022_exclude_test_orders_from_reporting.sql", "022_staff_presence.sql"]) if (!names.has(filename)) errors.push(`required historical evidence is missing: ${filename}`);
}

const actualFiles = await readdir(migrationsDir).catch((error) => { errors.push(`migration directory unreadable: ${error.message}`); return []; });
if (manifest?.canonicalChain) {
  const canonicalNames = new Set(manifest.canonicalChain.map((entry) => entry.filename));
  const inventoryNames = new Set((inventory?.migrations ?? []).map((entry) => entry.filename));
  for (const filename of actualFiles.filter((name) => name.endsWith(".sql") && !canonicalNames.has(name))) if (!inventoryNames.has(filename)) errors.push(`unapproved migration is neither canonical nor frozen evidence: ${filename}`);
}

if (errors.length) {
  console.error(`Canonical release control FAILED (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else console.log("Canonical release control passed: approved 22-migration chain is hash-protected and historical evidence remains noncanonical.");
