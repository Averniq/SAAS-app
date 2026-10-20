import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [migration, client, app, html] = await Promise.all([
  readFile(new URL("../supabase/migrations/041_self_service_trial_recovery_and_limits.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

assert.match(migration, /on conflict \(organization_id,user_id\) do nothing/);
assert.match(migration, /on conflict \(restaurant_id,user_id\) do nothing/);
assert.match(migration, /on conflict \(venue_id\) do nothing/);
assert.match(migration, /on conflict \(organization_id\) do nothing/);
assert.match(migration, /EMAIL_NOT_VERIFIED/);
assert.match(migration, /EXISTING_ACCOUNT_ACCESS/);
assert.match(migration, /public\.platform_admins/);
assert.match(migration, /self_service_default_trial boolean/);
assert.match(migration, /make_interval\(days=>trial_duration_days\)/);
assert.match(migration, /TRIAL_LIMIT_REACHED/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /before update of organization_id/);
assert.match(client, /provisionSelfServiceAccount/);
assert.match(app, /showProvisioningRecovery/);
assert.match(app, /retrySelfServiceProvisioning/);
assert.match(html, /id="provisioningRecoveryPanel"/);
assert.match(html, /id="retryProvisioning"/);
console.log("Self-service recovery and Trial limit structural checks passed.");
