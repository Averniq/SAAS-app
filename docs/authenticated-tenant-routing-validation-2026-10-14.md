# Authenticated tenant routing validation

Base/live approved SHA: 11fe3721b672e88a0656770ebd0a77617841db20.
Worktree: C:/Users/WindVeil/.codex/worktrees/tenant-routing/aveniq-saas.
Branch: codex/authenticated-tenant-routing.
Date: 2026-10-14 (Australia/Sydney).

## Problem and focused change

The behavioral regression failed on the unmodified base: an authenticated root request resolved restaurantSlug to demo instead of staying unscoped. Unscoped /login also previously reached TENANT_SELECTION_REQUIRED without UI selection handling. Authentication and membership records themselves were valid; no data repair is part of this change.

Root and /login now remain unscoped, ignoring synthetic configured defaults and query-supplied tenant hints. Normal authenticated tenant helper resolution cannot fall back to demo. Platform-admin lookup retains precedence. Ordinary users then load their session-scoped memberships: one redirects to /dashboard/{encoded-slug}/dashboard without starting tenant data/financial synchronization on the unscoped page; multiple display an explicit restaurant selector; zero preserves ONBOARDING_REQUIRED and the existing account-access message. The selector builds relative canonical links with encoded slugs and restaurant names via textContent, focuses its heading and reuses existing Auth card/button styles.

Direct restaurant routes retain getStaffProfile membership matching and authenticated tenant-data/RLS boundaries. Selecting a restaurant navigates through those same checks. Root/login startup and visibility handlers do not start connection/catalogue/staff/customer-status requests before membership selection. Friendly owner-flow messages hide TENANT_SELECTION_REQUIRED. Existing scoped onboarding, platform console, invitations and password recovery remain intact.

## Executed verification

- RED before implementation: behavioral root routing assertion observed demo rather than empty tenant scope on exact base 11fe3721.
- pnpm install --frozen-lockfile --ignore-scripts: PASS; pinned dependencies unchanged.
- pnpm run test:tenant-routing: PASS. Uses actual adapter, continuation and startup code, covering root/login one/multiple/zero memberships, configured/query demo rejection, canonical redirect before data startup, admin precedence, authorized/unauthorized direct URLs and friendly internal-error mapping.
- pnpm run test:tenant-routing:browser: PASS. Isolated real Chrome at 375/768/1280 with localhost mocked Auth/REST and external networking blocked. Covers password login and existing sessions, correct canonical redirects, explicit selection, safe names/encoded hrefs, heading focus, labeled navigation, 40px-or-larger targets/no overflow, zero-access message, platform precedence and no scoped startup requests before selection.
- pnpm run test:password-recovery: PASS, including real pinned SDK PKCE/adversarial/login/signup/invite and resend/cleanup/cooldown regressions.
- pnpm run test:password-recovery:browser: PASS at 375/768/1280.
- node tests/test-platform-admin-dashboard-authorization.mjs: PASS.
- node tests/test-qr-session-boundary.mjs: PASS.
- node tests/test-public-token-shell-safety.mjs: PASS.
- node tests/test-dashboard-customer-catalogue-authority.mjs: PASS.
- node tests/test-p0-deploy-01-product-preservation.mjs: PASS.
- node scripts/run-fresh-stack-qr-tests.mjs: PASS 76 checks on one unique disposable local PostgreSQL 17; 22 existing canonical migrations applied only to an empty local test database. Tenant RLS, role denials, Kitchen, payments/idempotency, QR lifecycle/rotation races passed; own container removed.
- Production-mode pnpm run build using new project URL plus disposable public test key: PASS.
- node tests/test-cutover-credential-safety.mjs: PASS.
- node tests/test-cutover-secret-leak-scan.mjs: PASS 13 source and 143 built files; staged changed-file scan also run before commit.
- node --check app.js / supabase-client.js and git diff --check: PASS.

Expected mocked network errors are logged by the SDK during fault injection while all assertions pass. No lint/typecheck script is configured. Existing Browserslist age notice is nonblocking.

## Independent review and boundaries

Security: no confirmed blocker; authenticated membership lookup, direct authorization/RLS, safe selector rendering and startup gating verified. QA/UX: no confirmed blocker at 375/768/1280. No dependency/SDK/CSP, schema/migration/RLS/ACL, Netlify/Supabase Production configuration, membership/role/restaurant data or public QR change. No live Auth writes or Production calls were used. All automated writes used mocks or disposable local fixtures. No merge/deploy/DNS/traffic/QR mutation. Commit and PR title carry skip-Netlify markers to prevent automatic deployments.

Manual live tenant-routing acceptance remains a separately authorized post-deploy check. This focused draft PR does not alter the live release.
