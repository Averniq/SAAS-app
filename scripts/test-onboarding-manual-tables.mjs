import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [app, client] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8")
]);
assert.match(app, /name="table_count"/, "Manual table setup must ask how many tables to create.");
assert.match(app, /step === "tables" && details\.choice === "create_manually"\) await window\.TableOrderCloud\.createCurrentOnboardingTables\(Number\(details\.table_count\)\)/, "Manual table setup must create the requested tables before continuing.");
assert.match(client, /function createCurrentOnboardingTables\(count\)/, "The client must provide a tenant-scoped manual-table action.");
console.log("Manual-tables onboarding regression check passed.");
