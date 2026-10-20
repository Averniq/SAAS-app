import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [migration, trialUpdateMigration, safeTriggerMigration, triggerPermissionMigration, client, app, html, verificationSql] = await Promise.all([
  readFile(new URL("../supabase/migrations/019_trial_entitlement_foundation.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/041_self_service_trial_recovery_and_limits.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/023_fix_staff_invite_entitlement_trigger.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/024_harden_entitlement_trigger_permissions.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../supabase/TRIAL_ENTITLEMENT_VERIFICATION.sql", import.meta.url), "utf8")
]);

assert.match(migration, /create table if not exists public\.plan_definitions/);
assert.match(migration, /create table if not exists public\.organization_entitlements/);
assert.match(migration, /'trial', 'starter', 'growth', 'enterprise'/);
assert.match(migration, /trial_duration_days.*14|14.*trial_duration_days/s);
assert.match(trialUpdateMigration, /trial_duration_days = 90/);
assert.match(trialUpdateMigration, /"max_tables":5,"max_menu_items":10,"max_staff_accounts":1/);
assert.match(trialUpdateMigration, /role <> 'owner'/);
assert.match(trialUpdateMigration, /TRIAL_LIMIT_REACHED/);
assert.match(migration, /after insert on public\.organizations/);
assert.match(migration, /on conflict \(organization_id\) do nothing/);
assert.match(migration, /clock_timestamp\(\)/);
assert.match(migration, /status in \('trial', 'active', 'past_due', 'cancelled', 'expired', 'suspended'\)/);
assert.match(migration, /revoke all on table public\.plan_definitions, public\.organization_entitlements from public/);
assert.match(migration, /grant execute on function public\.get_restaurant_entitlement\(uuid\) to authenticated/);
assert.match(migration, /TRIAL_EXPIRED/);
assert.match(migration, /before insert on public\.orders/);
assert.match(migration, /before insert on public\.tables/);
assert.match(migration, /before insert on public\.menu_items/);
assert.match(migration, /before insert on public\.restaurant_staff/);
assert.match(migration, /get_restaurant_entitlement\(p_restaurant_id uuid\)/);
assert.match(migration, /not public\.is_restaurant_staff\(p_restaurant_id\)/);
assert.match(migration, /target_organization_id is null then return/);
assert.match(safeTriggerMigration, /if tg_table_name = 'restaurants' then\s+if new\.organization_id is not null then/);
assert.doesNotMatch(safeTriggerMigration, /tg_table_name = 'restaurants' and new\.organization_id/i);
assert.match(triggerPermissionMigration, /revoke all on function public\.enforce_restaurant_entitlement_limits\(\)/);
assert.doesNotMatch(migration, /create\s+table[^;]*\bstripe\b/is);
assert.doesNotMatch(migration, /create\s+table[^;]*\binvoices?\b/is);
assert.doesNotMatch(migration, /\b(billing_provider|stripe_customer|checkout_session)\b/i);
assert.match(client, /getRestaurantEntitlement/);
assert.match(app, /loadPlanEntitlement/);
assert.match(html, /id="planEntitlementPanel"/);
assert.match(verificationSql, /TRIAL_TEST_EMAIL/);
assert.match(verificationSql, /TRIAL_EXPIRED/);
assert.match(verificationSql, /where lower\(u\.email\) = lower\('TRIAL_TEST_EMAIL'\)/);
console.log("Trial entitlement structural checks passed.");
