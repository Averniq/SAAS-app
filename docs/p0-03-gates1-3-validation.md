# P0-03 Gates 1-3 validation

## Scope

Forward-only canonical migration `20260817100000_p0_03_authoritative_payment_operations.sql` creates the authoritative, append-only `payment_operations` ledger. It replaces Front Desk client calls to legacy payment mutation RPCs with `record_authoritative_payment`, and uses the finance-scoped `list_authoritative_payment_operations` projection. Ledger reads are restricted to owner, manager, and cashier; generic staff and kitchen have no ledger table grant or financial projection.

The migration revokes all discovered legacy `record_restaurant_payment` and `void_restaurant_payment` overloads, and revokes `record_restaurant_order_payment`. It deliberately does not grant a compensating legacy compatibility path.

## TDD record

1. `node .\\tests\\test-p0-03-payment-ledger.mjs` was run before the migration existed and failed with `ENOENT` for `20260817100000_p0_03_authoritative_payment_operations.sql` (expected RED).
2. After implementation and release-control updates, the same static contract passed (GREEN).

## Commands actually run

| Command | Result |
| --- | --- |
| `node .\\tests\\test-p0-03-payment-ledger.mjs` | Passed after implementation. |
| `node .\\tests\\test-payment-confirmation.mjs` | Passed. |
| `node .\\tests\\test-critical-business-rules.mjs` | Passed. |
| `node .\\tests\\test-critical-server-guards.mjs` | Passed. |
| `node .\\scripts\\test-canonical-release-control.mjs` | Passed: approved 21-migration chain. |
| `node .\\scripts\\test-migration-integrity.mjs` | Passed. |
| `node --check app.js` | Passed. |
| `node --check supabase-client.js` | Passed. |
| `node .\\scripts\\materialize-canonical-migration-workspace.mjs "$env:TEMP\\aveniq-p0-03-canonical"` | Passed; materialized 21 migrations in a disposable temp workspace. |
| `node .\\scripts\\run-p0-03-local-ledger-tests.mjs` | Refused before database access because `P0_03_LOCAL_DATABASE_URL` was not supplied. |
| `P0_03_LOCAL_DATABASE_URL=postgresql://example.invalid/p0_03 node .\\scripts\\run-p0-03-local-ledger-tests.mjs` | Refused before database access: hosted databases are refused. |

## Local SQL integration status

`scripts/p0-03-local-assertions.sql` and its localhost-only runner are included for a disposable local Supabase/Postgres environment. The executable matrix creates rollback-only authorization fixtures for owner, manager, cashier, staff, outsider, two tenants, and orders; tests input, idempotency, projection, direct-write, Served, and Paid-status cases; then uses two independent `psql` sessions against a separately cleaned-up fixture for an actual concurrent settlement attempt. It was not executed because the Supabase CLI and `psql` are absent and no disposable localhost database URL was available. No hosted or Production connection, deploy, link, push, repair, commit, or PR operation was performed.

The local runner refuses non-local URLs. Before release, run it against a canonical 21-migration local replay; those runtime results are not claimed in this report.

## Final local build verification

Repository evidence selects **pnpm**: `pnpm-lock.yaml` is the sole lockfile, `README.md` documents `pnpm install` and `pnpm run build`, and the mobile scripts invoke pnpm. `package.json` does not declare a `packageManager` field. The local environment resolves `pnpm` 9.15.9; Node is v24.18.0 and Corepack is v0.35.0. No package or dependency versions were changed.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Completed without lockfile regeneration. |
| `pnpm run build` | Passed; Tailwind build and `scripts/build-site.mjs` produced the local `dist` output. Browserslist reported only an informational stale `caniuse-lite` notice. |
| `pnpm run test:p0-03-payment-ledger` | Passed. |
| `pnpm run test:order-integrity` | Passed. |
| `pnpm run test:critical-business-rules` | Passed, including critical server guards. |
| `pnpm run test:migrations` | Passed. |
| `node .\\scripts\\test-canonical-release-control.mjs` | Passed: approved 21-migration chain. |
| `node .\\tests\\test-payment-confirmation.mjs` | Passed. |
| `git diff --check` | Passed; only existing CRLF conversion warnings were emitted. |

No Production or hosted Supabase system was connected, mutated, deployed, repaired, committed, pushed, or submitted for review during this verification.
