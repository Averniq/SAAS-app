# Production cutover checkpoint 2 — verification

Date: 2026-10-05 (Australia/Sydney).
Target: Aveniq-Production-New / wxdihentihrijtfkmwgq / ap-southeast-2 / Postgres 17.11.0.002.
Approved release: 47dbe4dc68ced5856fe3a337dc6c1289c7748429.

## Migration result

22/22 canonical migrations were already recorded before this continuation began. No migrations were replayed. Read-only inspection of supabase_migrations.schema_migrations found exactly the expected 22 names in lexical source order, with every recorded SQL body equal to the corresponding git-show release body after surrounding whitespace was trimmed. No convergence migrations appear in that history. This verifies existing application; it does not claim migrations were executed during this turn.

## Auth baseline

Read-only dashboard verification: Email enabled; signup enabled; confirm email enabled; anonymous sign-in disabled; manual linking disabled. Custom SMTP switch enabled. SMTP credential fields were never read, printed, or exposed.

Site URL: https://app.aveniq.com.au/ (equivalent trailing slash).
Exactly three allowed redirects: https://app.aveniq.com.au/, https://app.aveniq.com.au/verify, https://app.aveniq.com.au/reset-password.

GET /auth/v1/health succeeded, version v2.197.0. GET /auth/v1/settings confirmed external.email=true, disable_signup=false, mailer_autoconfirm=false, external.anonymous_users=false. Requests targeted only the new project, used its publishable key, and output only health/configuration flags.

Disposable signup/confirmation/reset email smoke was not performed: no controlled disposable mailbox was supplied, and there is no configured test identity/cleanup capability in the Supabase connector. No identity was invented and no email was sent. SMTP delivery and end-to-end confirmation/reset redirects remain unverified. This checkpoint's optional email smoke is recorded as a limitation; Auth configuration and service health passed.

## Seed and isolation

Sake Street, slug sake-street: 12 categories, 71 menu items, 2 bootstrap/test tables. Owner remains NULL. Final counts: Auth users 0, memberships 0, initial-owner claims 0, QR tokens 0, issuance audit events 0, orders 0, payments 0. Table 3–9 were not created.

## Security and QA

Independent read-only security reviewer found no confirmed material blocker. All 14 public tables have RLS enabled. Anon has no public table privileges. Authenticated ACLs match canonical grants, with no DELETE/TRUNCATE/REFERENCES/TRIGGER privileges. Public schema CREATE is denied to anon/authenticated.

Initial-owner bootstrap RPC exists, uses empty search_path and a service-role guard. EXECUTE is denied to PUBLIC/anon/authenticated and granted to service_role; direct anon/authenticated runtime calls returned permission denied. No owner binding was attempted.

Payment RPC definitions reject NULL membership explicitly. Runtime probes returned AUTH_REQUIRED for missing subject, CASHIER_ROLE_REQUIRED for a nonmember payment attempt, and FINANCIAL_READ_ACCESS_DENIED for a nonmember ledger read. Direct authenticated payment-table reads returned permission denied. Authenticated outsider queries saw zero rows in restaurants/categories/menu_items/tables/orders/staff.

Public QR anon surface matches the approved three token-scoped RPCs: get_public_qr_order_context, get_public_qr_order_status, submit_public_qr_order. Invalid-token probes returned PUBLIC_TOKEN_NOT_FOUND for all three. Legacy public ordering and legacy payment access remain revoked. QR probes used rollback transactions and issued no tokens. Initial read-only context/status probes encountered SELECT FOR SHARE restrictions; subsequent rollback-only probes reached and passed the intended token denial checks.

Supabase security advisors ran after the existing 22 migrations: 5 intentional RLS-without-policy INFO notices; 3 anon and 19 authenticated SECURITY DEFINER warnings for approved, guarded RPC access; 1 unaccent-in-public warning. The unaccent extension is explicitly created in approved migration 001, uses invoker privileges, and the independent reviewer found no demonstrated authorization bypass. Advisors are not warning-free; no material security finding was confirmed and no patch/grant was applied. Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ; https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public ; https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable ; https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

## Protected resources and validation scope

No operations were issued against old Production Supabase. No Netlify/DNS/backend-binding/frontend-publishing changes were made. Read-only Netlify dashboard inspection confirmed Published & locked deploy 6ab9159972636300087c5022 at commit c465448f024640977ddc2c7b90d494b548594570, with Publishing is locked to this deploy.

Validation performed: git status, git rev-parse, git ls-tree, git show of approved package.json and migrations; Supabase project/migration/catalog/seed queries; role-scoped denial and zero-visibility queries; security advisors; read-only browser Auth/Netlify settings inspection; Auth HTTP health/settings requests via Invoke-RestMethod. Initial sandbox HTTP requests could not access the network; authorized escalated read-only requests succeeded.

Approved package scripts inspected: build, build:css, build:site, test:authorization, provisioning, serving and mobile scripts. Frontend build/lint/type tests were not run because no application code changed and these checks do not validate hosted bootstrap. Existing authorization-user provisioning was not run because creating/binding users is outside checkpoint scope. Only this evidence document was added locally; pre-existing workspace changes were preserved.

Checkpoint stops here. No initial owner, additional tables, production QR issuance, traffic switch or deployment is authorized by this result.

PRODUCTION CUTOVER CHECKPOINT 2: GO — NEW BACKEND BOOTSTRAPPED
