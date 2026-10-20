import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [migration, integrityMigration, client, app, verificationSql] = await Promise.all([
  readFile(new URL("../supabase/migrations/013_verified_self_service_provisioning.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/015_organization_restaurant_integrity.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/PROVISIONING_VERIFICATION.sql", import.meta.url), "utf8")
]);

for (const table of ["organizations", "organization_memberships", "self_service_registrations", "onboarding_progress"]) {
  assert.match(migration, new RegExp("create table if not exists public\\." + table), "missing " + table);
}
assert.match(migration, /after update of email_confirmed_at on auth\.users/);
assert.match(migration, /registration_type' is distinct from 'self_service'/);
assert.match(migration, /email_confirmed_at is null/);
assert.match(migration, /for update;/);
assert.match(migration, /unique \(owner_user_id\)/);
assert.match(migration, /unique \(organization_id, user_id\)/);
assert.match(migration, /status = 'failed'/);
assert.match(migration, /status = 'provisioned'/);
assert.match(migration, /ordering_enabled, timezone_confirmation_required/);
assert.match(migration, /'setup_required', false/);
assert.match(integrityMigration, /venue_status is null or organization_id is not null/);
assert.match(migration, /revoke all on function public\.provision_self_service_account_for_user\(uuid\) from public, anon, authenticated/);
assert.doesNotMatch(migration, /\b(trial|subscription|stripe|sample menu)\b/i);
assert.match(client, /provisionSelfServiceAccount/);
assert.match(app, /venueStatus === "setup_required"/);
assert.match(verificationSql, /provision_verified_self_service_account/);
assert.match(verificationSql, /count\(distinct o\.id\) <> 1/);
console.log("Self-service provisioning structural checks passed.");
