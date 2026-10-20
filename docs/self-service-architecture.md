# Self-service signup architecture

## Current architecture

Aveniq is a static, vanilla JavaScript single-page application. `index.html` loads `app.js` and `supabase-client.js`; the build process compiles Tailwind CSS and copies the static application to `dist`. Netlify serves the result and rewrites browser routes to `index.html`.

The backend is Supabase: GoTrue/Supabase Auth for password accounts and email links, and Supabase Postgres exposed through the Data API/RPCs. There is no separate application server. The browser uses the Supabase publishable key only. The database migrations are SQL files under `supabase/migrations`.

## Relevant models and tables

- `auth.users`: Supabase-managed identity, password hash, email-confirmation timestamp and user metadata.
- `restaurants`: the current tenant/venue record. It has `owner_user_id`, a unique slug and status.
- `restaurant_staff`: the membership table, scoped by `restaurant_id` and `user_id`, with owner/manager/kitchen/cashier roles.
- Tenant-owned tables (`categories`, `tables`, `menu_items`, `orders`, `order_items`) carry `restaurant_id`.
- `platform_admins`: separate platform-wide administrator membership.
- `restaurant_invites`: invitation records used by the existing staff invitation flow.

For self-service registration, `full_name`, `business_name`, `country`, acceptance timestamps and a `registration_type` marker are stored in `auth.users.raw_user_meta_data`. This is deliberately identity metadata, not a new tenant table: no restaurant, membership, venue or trial is created before a later provisioning task.

## Routes, APIs and services

- `/signup`: public registration form.
- `/verify`: email-verification pending, success and recoverable error states.
- `/forgot-password` and `/reset-password`: minimal Supabase Auth recovery flow.
- `/login`: existing staff/platform login screen.
- `/join/:token`: existing restaurant invitation path.
- `/dashboard/:restaurant/:area`, `/order/:restaurant/:table`, and `/r/:restaurant`: existing tenant/customer routes.

`supabase-client.js` calls Supabase Auth endpoints for signup, resend confirmation, recovery, password update and password login. It calls the PostgREST API/RPCs for application data. The `/verify` and `/reset-password` callbacks consume the one-time session fragment Supabase returns and remove it from the browser address bar.

## Authentication flow

Public signup normalizes email in the browser and validates every form field. Supabase Auth repeats server-side email and duplicate-account validation. Migration `012_self_service_signup_validation.sql` supplies a Supabase Before User Created database hook that rejects a self-service registration when the required business metadata or legal acceptances are absent. The browser requires a 12-character password containing lower-case, upper-case, digit and symbol characters; production must set the matching Supabase Auth password minimum/required-character policy. Local configuration enables confirmations, a one-hour verification-token expiry and limits sign-up/email/token verification requests.

Supabase sends the confirmation email and owns its expiring, hashed verification token. The database trigger provisions the tenant at verification; login also retries the authenticated, no-argument provisioning RPC when a verified self-service Owner has no membership. The resend API is protected by Supabase Auth rate limits and a one-minute browser cooldown. Recovery uses Supabase's standard `recover` and authenticated `user` update endpoints, preserving account-enumeration resistance in the user-facing response.

Production must configure the matching password policy, email confirmation, site URL, allowed redirects, SMTP sender and Auth rate limits in the hosted Supabase project. `supabase/config.toml` provides the local development configuration.

## Tenant isolation findings

Tenant context is resolved from the URL restaurant slug, then matched against the signed-in user's `restaurant_staff` membership. Database access is primarily constrained by Postgres RLS helpers such as `is_restaurant_staff`, `has_restaurant_role` and report-access checks. Later migrations also revoke broad Data API grants and grant only the necessary authenticated operations.

The main risk is historical owner onboarding: `create_restaurant_for_owner` creates a restaurant and owner membership after login. The new public signup path never calls it. A future provisioning task must make that explicit handoff and must not infer a tenant from unverified metadata.

## Security concerns and reusable components

- Reusable: shared account gateway cards, `auth-form`, safe error regions, `authRequest`, session storage and Supabase Auth callbacks.
- The browser configuration contains only a publishable key; service-role keys remain server/script-only.
- The current app is static. Auth password policy, duplicate enforcement, token expiry and email rate limits are enforced by Supabase; the Before User Created hook also enforces the required self-service metadata before the Auth user exists.
- User metadata is not an authorization source and must not be used in RLS policies. The validation hook only protects account creation; it does not grant a tenant role or access.
- Hosted Supabase redirect URLs must be kept narrow. Add the deployed `/verify` and `/reset-password` callback URLs, not wildcards.
- Existing invitation signup still uses Supabase Auth and remains separate from public registration.

## Required signup changes delivered

The public route collects full name, business name, email, password confirmation, country, Terms acceptance and Privacy acceptance. Recoverable validation errors retain non-sensitive form values. Password values are never persisted. Verification has pending, success, error and resend states. Password recovery is implemented without an account-management redesign.

## Database migrations

Migration `012_self_service_signup_validation.sql` adds only a validation function and grants it solely to Supabase Auth. It does not change an application table or any tenant data. This is backward compatible: existing users, restaurants and memberships are preserved, and the function leaves the established invitation/staff registration flow untouched. To roll back, first disable the Before User Created hook in Supabase Auth, then drop the function in a later additive migration.

## Environment and email configuration

`.env.example` documents the optional script-only variables. No new browser environment variable or secret is needed. For production, configure SMTP and these Supabase Auth settings outside Git: email confirmations, one-hour OTP expiry, Site URL, allowed redirect URLs, password policy and rate limits. After applying migration 012, enable the **Before User Created** hook in Supabase Auth with `pg-functions://postgres/public/validate_self_service_signup`. Local development can use `supabase start`; its mail catcher exposes confirmation/recovery messages without real email credentials.

## Rollback considerations

Revert the static UI/client/configuration changes and remove the hosted callback URLs only after confirming no pending verification or recovery messages use them. Existing users and tenants remain intact. Do not disable email confirmation until the legacy invite flow has been reviewed, because invitation account creation now follows the same confirmation policy.

## Verified self-service provisioning

Migration 013 adds organizations, organization memberships, a private self-service registration snapshot and onboarding progress. It also adds nullable organization and venue-status fields to restaurants, leaving existing tenants untouched. On verified self-service signup, one database transaction creates the organization, Owner memberships, first restaurant venue and setup-progress record. It sets venue status to setup required and disables ordering.

The provisioner locks the registration record and has unique owner, membership and progress constraints. If any creation step fails, its PostgreSQL exception block rolls back the partial graph, records a safe failure status and permits a later no-argument retry. Invited staff, platform admins, pre-existing accounts with restaurant access, unverified accounts and all accounts without the private self-service snapshot are excluded. No client-provided organization or venue identifier is accepted.

Country can set a currency where it is clear. Timezone defaults to UTC and requires later confirmation unless the country has a safe single default in the mapping. The new private provisioning tables have RLS enabled and no anon or authenticated Data API permissions; existing restaurant RLS remains the tenant-isolation control.

For hosted Supabase, apply migrations in numeric order, including 012, 013, 015 and 019 after the existing 014 and later payment/order migrations, then enable the existing Before User Created Auth hook for migration 012. No new secret is required. The server-side Auth table triggers in migration 013 run on verification independently of the browser. If local Supabase validation is unavailable, run the read-only Provisioning Verification SQL file after creating and verifying a dedicated test account; it checks trigger presence, helper permissions, one-time graph counts, setup defaults and RLS.

## Organisation and restaurant relationship review

The exact parent link is public restaurants organization_id referencing public organizations id with delete restricted. Migration 015 also requires every managed venue, identified by a non-null venue status, to have a non-null organization ID; legacy restaurants remain compatible because their venue status is null. The provisioning function writes the organization ID in the same transaction that creates the first restaurant, so every newly provisioned restaurant is linked to exactly one organization.

Organization memberships and restaurant staff memberships are intentionally distinct. The former records organisation ownership for future organisation-level administration. Restaurant staff records venue-scoped operational access and remain the source of truth for current Data API and RLS authorization. A self-service registrant receives both an organisation Owner membership and an Owner restaurant staff membership for the first venue in the provisioning transaction.

Current RLS protects data by restaurant ID through restaurant staff checks. This prevents cross-restaurant access and, because each new organisation Owner receives no restaurant access without a matching restaurant staff record, prevents cross-organisation access in the present model. RLS does not yet grant access based on organisation membership alone; any future organisation-wide authorization must add explicit organisation-aware policies rather than assuming the membership table is sufficient.

Deleting an organization with restaurants is blocked by the restaurant foreign key, so it cannot leave orphaned restaurants. There is currently no organisation disable status or disable operation. A future disable feature must define an explicit transaction that disables its venues and ordering state; it must not delete or detach restaurants.

## Trial and plan foundation

Migration 019 and migration 041 centralize Trial, Starter, Growth and Enterprise definitions in plan definitions. The Trial definition grants one organisation, one restaurant, five tables, ten menu items and one employee account (the Owner is excluded), live ordering and a 90-day free trial without a card. Plan limits belong to the organization entitlement; restaurant roles and RLS remain operational permissions, not subscription ownership.

When the server-side self-service provisioner inserts a new organization, an organization trigger creates one Trial entitlement only if the private registration is in provisioning state. The insert is part of the existing transaction, so a failed provision rolls back its Trial too. The entitlement has a unique organization key and conflict-safe insert, therefore retries cannot duplicate a subscription or reset the end timestamp. Existing organizations, including Sake Street and legacy restaurants without organization IDs or entitlements, are neither backfilled nor restricted.

Migration 041 fixes the recovery gap in the original provisioner: a retry now reconciles the existing organization, restaurant, Owner memberships, entitlement and onboarding record independently instead of trusting a prior `provisioned` status. Login retries only the signed-in, verified self-service account and displays a retry/sign-out screen only after that recovery fails. It excludes platform administrators, invited users and accounts with unrelated memberships. New self-service entitlements carry an explicit source marker; existing Trial end dates are deliberately left unchanged because prior records have no reliable way to distinguish a default 14-day value from a manual override.

Server-side insert triggers enforce configured venue, table, menu-item and staff limits. The order insert trigger checks the organization entitlement; when the Trial has elapsed it blocks all new live orders with TRIAL EXPIRED while preserving login, reads and all existing tenant data. This task does not expose a post-expiry test-order mode, so test orders are also unavailable after expiry. The dashboard calls a membership-checked, restaurant-scoped plan RPC; it can display only the caller's restaurant organization, never a caller-supplied arbitrary organization.

Plan definitions and entitlements have RLS enabled with no direct anon or authenticated Data API permissions. Only a no-argument organization trigger, internal server helpers, and the restaurant-membership-checked read RPC access them. No Stripe, checkout, invoice, payment-provider record or automatic organization deletion is introduced. Use the Trial Entitlement Verification SQL file for the exact hosted-Supabase checks when local runtime validation is unavailable.

## Remaining work for the next task

## Persisted self-service onboarding

Migration 020 adds private, per-venue step records for the provisioned self-service owner. The server resolves the organization and first venue from both organization Owner and restaurant Owner memberships; browser requests never send either identifier. Business details, venue details, menu choice and tables choice are required. Branding, QR setup and test-order acknowledgement may be skipped. Completion is idempotent, marks venue readiness through the server function only, and deliberately keeps ordering disabled. Existing/legacy tenants and invitation staff have no eligible onboarding record and continue to their normal dashboard.

Routing is intentionally split: a provisioned self-service Owner whose venue status is `setup_required` and whose persisted onboarding status is incomplete is sent to `/onboarding`; the route resumes the saved step (or a checklist hash target). On completion the server changes venue readiness while retaining disabled ordering, and subsequent logins go to the restaurant dashboard. Existing tenants retain the legacy `restaurant.status = onboarding` wizard, and invited staff have no eligible self-service record, so neither is redirected into the new flow. The dashboard checklist is displayed only for an eligible Owner with incomplete persisted progress and collapses on completion.

## Sample data, QR and test orders

Migration 021 is self-service Owner scoped. It creates idempotent v1 sample categories/items/tables with explicit sample markers, leaves non-sample records untouched on removal, stores only SHA-256 hashes of unpredictable QR tokens, and permits only trusted owner RPCs to create zero-value `is_test_order` onboarding orders. A test order is allowed for an expired Trial only through this owner RPC; live ordering still requires an active entitlement. Venue activation remains server-side and requires persisted business/venue/menu/tables/QR/test-order completion plus an active entitlement.

## Test-order reporting audit

Migration 022 changes the single reporting source, `reporting.order_facts`, to exclude `is_test_order`. All financial dashboard/report RPCs and CSV exports derive through this view: daily, weekly, monthly, table and hourly sales; item/category sales; order summaries; `get_report_dashboard`; `get_sales_report`; `get_menu_report`; `get_table_report`; `get_hourly_report`; and `get_order_report`. Therefore revenue, KPI counts, averages, product/category revenue and CSV exports exclude tests server-side. Kitchen/front-desk order loading intentionally does not use reporting facts, so Test orders remain operationally visible. No separate payment-record, settlement, accountant export, customer purchase-statistics or financial-export module exists in this repository; payment data is stored on `orders` and has no independent aggregate.

Implement a deliberately initiated setup experience that lets the new Owner confirm timezone and currency and configure the first venue. It must not create sample data, QR codes, billing, checkout or a paid-plan flow until separately authorised.
