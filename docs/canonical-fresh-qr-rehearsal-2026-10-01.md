# Canonical fresh-stack QR rehearsal — 1 October 2026

Base: `origin/main` = `15322102409718b4b4c886200153843b5a411b87`, fetched before creating branch `codex/canonical-fresh-qr`.

## Root cause and scope

The 19 canonical migrations created the restaurant/staff model, Sake Street catalogue, Kitchen lifecycle and payment ledger, but never created the token-only QR schema used by the current frontend. The newer QR implementations lived only in `production-convergence-migrations`, where they assumed hosted-only organizations, entitlement records and an existing token table. Those files cannot bootstrap an empty database. Canonical migrations also retained execution grants on the obsolete public ordering functions.

The new canonical path uses the existing restaurant membership model directly. It does not import the hosted organization model or run any convergence migration. Existing migrations are unchanged. Sake Street's active restaurant and tables use the same availability model as the canonical schema; closed restaurants cannot accept new orders, and inactive/suspended tenants or inactive tables cannot resolve QR tokens.

## Added migrations

`20261001115919_canonical_public_qr.sql` creates hashed token generations, an attributed issuance/rotation audit, and token-specific idempotency operations. Composite foreign keys bind tokens and operations to restaurant/table/order scope; a partial unique index permits one unrevoked token per table. All three tables have RLS and no browser table grants. Five RPCs implement owner/manager issuance and metadata plus anonymous context, submit and status. Only the three public QR RPCs are granted to anon. Legacy public ordering RPCs are revoked from all browser roles.

Every referenced relation/column already exists in earlier canonical migrations. Token generations are newly created on rotation, so the replacement token cannot acquire access to orders submitted with a previous token. Only the issuer receives the plaintext token; metadata exposes table IDs and active-token booleans. Menu prices, option prices/names, snapshots and inclusive GST are calculated inside the database. The named parameters and response fields match the shipped client, including `table.number`.

`20261001115923_payment_membership_fail_closed.sql` fixes a directly verified authorization defect in the canonical payment reader and writer: `NULL NOT IN (...)` is NULL, so a missing membership did not enter the denial branch. Both functions now explicitly reject a NULL role. Ledger calculations, idempotency, financial projections, Kitchen independence and existing ACL restrictions are preserved. This additive replacement depends only on migration 018's canonical objects.

## Reproducible disposable rehearsal

Run from the repository root:

```sh
node scripts/run-fresh-stack-qr-tests.mjs
node scripts/run-fresh-stack-qr-tests.mjs --pg15
```

The runner always creates a unique `aveniq-fresh-qr-<UUID>` container from `public.ecr.aws/supabase/postgres:17.6.1.167`, or the fixed cached `public.ecr.aws/supabase/postgres:15.8.1.085` image with `--pg15`, with no published port and a generated disposable password. PostgreSQL 15 matches the tracked Supabase configuration; PostgreSQL 17 provides an additional compatibility check. It accepts no database URL, arbitrary image or existing-container target. It waits for the image's real Auth bootstrap and final database server, asserts the public application schema is empty, then applies **every** SQL file in `supabase/migrations/` in sorted order with `psql -X -v ON_ERROR_STOP=1`. It uses the image's real `auth.users`, `auth.uid()` and Supabase roles, not replacement definitions. Test identities use `example.invalid`. The runner removes only the container it created.

Result on **both PostgreSQL 15 and PostgreSQL 17**: all **21 canonical migrations** applied without SQL errors. Sake Street seeded **1 restaurant, 12 categories, 71 menu items and 2 tables**. All **76 runtime checks** passed on each version. Both disposable containers were removed.

Coverage includes owner/manager issuance and metadata; staff/kitchen/cashier/nonmember/cross-tenant denials; hash-only storage and audit attribution; valid/invalid/expired/revoked/rotated token behavior; tenant catalogue scoping; authoritative option prices/names and balanced GST; invalid item/options; sequential and four-way concurrent same-key retry; conflicting-payload races; correct token/order tracking; legacy RPC revocation; exactly three anonymous public SECURITY DEFINER endpoints; direct-table ACLs and cross-tenant RLS; Kitchen lifecycle and denied transitions; payment reader/writer role checks, partial/full settlement, retry, ledger totals and overpayment denial.

The actual `supabase-client.js` executes in a VM against responses from the real disposable database. Its `/order/<token>` context mapping, named submission parameters, same-key retry and order tracking pass. Only HTTP transport is replaced with anonymous SQL calls; this is **not** a browser/PostgREST/GoTrue login end-to-end claim.

Concurrency tests also queue context/status/submission behind token locks until expiry and verify all fail closed. A deliberate issuance/submission lock inversion reproducer confirms rotation and submission complete without deadlock using the table's `FOR NO KEY UPDATE` issuer lock.

## Existing regression checks

The following 32 source/VM suites passed using `node tests/<filename>`:

```text
test-app-host-membership-routing.mjs
test-authenticated-catalogue-qr-metadata-resilience.mjs
test-clean-baseline-current-payment-contract.mjs
test-customer-order-tracking-reload.mjs
test-customer-review-order-flow.mjs
test-dashboard-customer-catalogue-authority.mjs
test-kitchen-lifecycle-contract.mjs
test-kitchen-lifecycle-ui.mjs
test-local-sake-catalogue-importer.mjs
test-p0-deploy-01-local-pg17-services.mjs
test-p0-deploy-01-product-preservation.mjs
test-payment-writer-adversarial.mjs
test-payment-writer-bootstrap.mjs
test-payment-writer-client-adapter.mjs
test-payment-writer-cutover.mjs
test-payment-writer-hydration.mjs
test-payment-writer-lifecycle.mjs
test-platform-admin-dashboard-authorization.mjs
test-public-legacy-rpc-revocation.mjs
test-public-order-lifecycle-runtime.mjs
test-public-order-uuid-idempotency-lifecycle.mjs
test-qr-session-boundary.mjs
test-sake-street-menu-photos.mjs
test-task4-concurrency-adapter.mjs
test-task5-concurrency-harness.mjs
test-task5-legacy-order-route-cutover.mjs
test-task5-runtime-placeholders.mjs
test-task5-task6-canonical-rpcs.mjs
test-task5-token-ui-cutover.mjs
test-task6-concurrency-harness.mjs
test-task7-rich-public-ordering-contract.mjs
test-task8-qr-token-metadata-ui.mjs
```

Six stale assertions across payment bootstrap/hydration initially expected settlement to change Kitchen status to `Paid`. They now verify both unchanged Kitchen status `New` and canonical `confirmedPayment.paymentStatus = paid`. All 14 bootstrap, 7 hydration, 22 adversarial and 14 lifecycle cases pass. No application behavior was changed to satisfy these tests.

`node tests/test-kitchen-lifecycle-runtime.mjs` passed in its own disposable PostgreSQL container. `node tests/test-kitchen-lifecycle-concurrency-soak.mjs` passed all 50 iterations of each of six race scenarios (300 scenarios / 600 concurrent calls), with zero unexpected outcomes. Scenarios cover duplicate Preparing, Preparing versus cancellation, Ready versus stale Preparing, completion versus cancellation, duplicate completion, and payment versus cancellation.

Additional checks passed: `pnpm install --frozen-lockfile --offline` (167 packages reused, no downloads), `pnpm run build`, `node --check app.js`, `node --check supabase-client.js`, `node --check scripts/run-fresh-stack-qr-tests.mjs`, and `git diff --check`. Runtime: Node 24.18.0, pnpm 9.15.9. The build emitted an existing Browserslist age warning. No lint or typecheck scripts are configured in package.json.

Three additional existing suites were executed and **did not pass**:

| Suite | Existing failure |
| --- | --- |
| `test-public-token-shell-safety.mjs` | Its old local-only CSP assertion rejects main's hosted Supabase CSP. Netlify configuration was not changed. |
| `test-task4-frozen-target-parity.mjs` | Missing tracked historical fixture under `evidence/p0-deploy-01-task4-authority-freeze-20260905-v3/`. |
| `test-task4-historical-null-reconstruction.mjs` | Missing `evidence/task4-payments-history-fixture/manifest.json`. |

These test files and all their source inputs match the base SHA (`git diff --exit-code origin/main -- ...` passed); `git ls-tree -r origin/main` confirms the historical fixture paths are absent. Historical payment reconstruction is explicitly out of scope. These failures are disclosed, not classified as passing regressions.

Hosted authorization scripts and old runtime scripts with hard-coded existing Docker stacks were not executed. They do not target the newly created canonical database and some require historical schemas/fixtures. Their relevant current QR, RLS/ACL, Kitchen and canonical payment invariants are exercised in the new fresh-stack runner. Browser desktop/tablet/mobile rendering, real Auth login and PostgREST deployment smoke tests remain manual/local-stack verification items; no UI changes were made.

## Independent review and cutover implications

The independent security/performance/contract reviewer identified three issues during implementation: frontend table-number mapping, expiry after token-lock waits, and an issuance/submission lock inversion. All were fixed and rechecked; runtime tests cover each. Final SQL review found no unresolved confirmed security, performance or contract defect. The submission loop is bounded to 50 items and status polling does not reload the catalogue. Independent QA also reviewed the harness and payment test changes, verified the payment function bodies differ only in the NULL-role guards, and separately executed `node --test tests/test-payment-writer-bootstrap.mjs tests/test-payment-writer-hydration.mjs` with 21 passes and zero failures.

The **missing canonical QR baseline blocker is cleared by this branch's fresh replay**. This does not approve a Production cutover or certify an untested hosted deployment. The three unrelated baseline regression failures above remain disclosed.

A future clean cutover must bootstrap real owner Auth identity and restaurant membership, then issue new Sake Street table tokens. The Sake seed intentionally contains no real users/memberships and no recoverable plaintext public tokens. Existing QR links and previous-generation tracking links will not survive a clean reset. Production secrets/Auth settings and frontend sequencing remain subject to the separate cutover checklist and explicit approval.

No Production Supabase access/change, Production migration, Netlify deployment/configuration/environment action or cutover was performed. The original dirty checkout was preserved. The reused isolated worktree's pre-existing `supabase/config.toml` override is excluded from the commit.
