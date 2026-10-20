import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [html, app, client, config, signupMigration] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase-client.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/012_self_service_signup_validation.sql", import.meta.url), "utf8")
]);

for (const id of ["signupFullName", "signupBusinessName", "signupEmail", "signupPassword", "signupConfirmPassword", "signupCountry", "signupTerms", "signupPrivacy"]) {
  assert.match(html, new RegExp(`id="${id}"`), `missing signup field: ${id}`);
}
assert.match(app, /function validateSelfServiceSignup\(values\)/);
assert.match(app, /passwords do not match/);
assert.match(app, /Terms of Service/);
assert.match(app, /Privacy Policy/);
assert.match(app, /resendVerification/);
assert.match(client, /authRequest\("resend"/);
assert.match(client, /authRequest\("recover"/);
assert.match(client, /authRequest\("user", \{ method: "PUT"/);
assert.match(client, /The root sign-in page has no restaurant context/);
assert.match(client, /\? route\.restaurantSlug\s*:\s*""/);
assert.match(app, /signUp\(email, password, \{\}, `\/join\/\$\{encodeURIComponent\(inviteToken\)\}`\)/);
assert.match(app, /user_metadata\?\.registration_type === "self_service"/);
assert.match(config, /enable_confirmations = true/);
assert.match(config, /email_sent = 3/);
assert.match(config, /max_frequency = "1m"/);
assert.match(config, /otp_expiry = 3600/);
assert.match(signupMigration, /validate_self_service_signup/);
assert.match(signupMigration, /registration_type/);
assert.match(signupMigration, /terms_accepted_at/);
assert.match(signupMigration, /privacy_accepted_at/);
assert.match(signupMigration, /@\[\^@\[:space:\]\]\+\\\.\[\^@\[:space:\]\]\+\$/);
assert.doesNotMatch(signupMigration, /insert into public\.(restaurants|restaurant_staff|tables)/i);

const signupHandler = app.match(/async function handleSelfServiceSignup[\s\S]*?\n}\n\nasync function handleResendVerification/)?.[0] || "";
assert.doesNotMatch(signupHandler, /createRestaurant|createTables|completeOnboarding|platformCreateRestaurant/);
console.log("Self-service signup structural checks passed.");
