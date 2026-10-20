# P0-01 migration baseline report — 2026-08-12

## Executive summary

**Result: PARTIAL. Database migration deployment remains BLOCKED.** This task froze the complete repository migration evidence, strengthened the static release guard, and added a local-only release-gate/runbook. It did not alter hosted data, ledgers, historical SQL, or production infrastructure. A deterministic canonical database cannot yet be proved because the repository has a mutated `011`, duplicate `022`, 28 untracked migrations, no clean local replay capability, and missing hosted catalog evidence.

## Initial state and repository inventory

There are 44 SQL files: legacy `001`–`035` (no `036`), `037`–`043`, and `20260805133843_validate_onboarding_timezone.sql`. The machine-readable inventory lists every filename and immutable normalized SHA-256. It records the current repository snapshot only; it is not a claim that all blobs were deployed.

The repository has 28 currently untracked migrations: `012`, `013`, `015`, `019`–`035`, and `037`–`043`, plus the timestamped timezone migration. `014`, `016`–`018` are tracked; `001`–`011` are tracked. This count and status were verified with `git ls-files`.

## Environment ledger comparison

The prior read-only audit recorded 14 active-hosted timestamp ledger entries and evidence that many repository effects exist without matching ledger rows. The inactive staging project did not respond to the read-only request. No live query credentials/tooling were used or changed in this task. Consequently, repository/hosted/staging parity is **not established** and no ledger version is mapped to a duplicate SQL file by filename assumption.

## Migration 011 reconciliation

`011_consolidate_rls_policies.sql` has a frozen canonical repository hash of `45415f2c9f9762965a5254e902a77daca22a37dd3599f02ba1d803d891587cb1` (the `HEAD` historical blob). The working-tree version hashes to `dd5b31380b158888eb04718bf7f96c1b1f070f1362c2b6973ba8c3d2e32e4646` and adds 15 idempotent policy drops. It was not changed by this task. Its effect must be carried into a new timestamped migration only after the deployed historical variant is proven; `011` itself remains immutable.

## Duplicate 022 reconciliation

The two distinct effects remain explicitly identified but unresolved: `022_exclude_test_orders_from_reporting.sql` redefines `reporting.order_facts` to exclude test orders, and `022_staff_presence.sql` adds staff-presence fields/touch behaviour. Both are required outcomes in the future catalog assertion. Neither historical file was renamed, deleted, or edited. Read-only environment catalog evidence is still required to choose safe forward migrations with unique timestamps.

## Hosted-only object findings

The audit identifies hosted-only `tenant_domains`, hostname tenancy RPCs, kitchen-print objects, and role variants. In particular, the application calls `public.get_public_tenant_context(text)` but no repository migration defines it. Its exact body, dependency, security mode, search path, ACL, and hosted/staging presence remain unverified. No speculative migration was created.

## Canonical baseline decision and version policy

The repository snapshot is an **evidence lock, not an approved canonical baseline**. New migrations must be generated through `supabase migration new <description>` and retain its unique 14-digit UTC version. Legacy names are immutable. Corrections are append-only timestamp migrations, never historical edits or remote `migration repair`.

## Files changed

- `supabase/migration-inventory.json` — all 44 repository SQL blobs now have frozen normalized SHA-256 values.
- `scripts/test-migration-integrity.mjs` — requires a checksum for every inventory entry and fails while reconciliation status is blocked.
- `scripts/test-migration-release-gate.mjs` — local-only gate that requires static integrity, approved inventory/catalog manifests, and (only after approval) local reset/list/lint.
- `supabase/catalog-manifest-template.json` — required catalog/permission metadata and application-surface assertions.
- `docs/supabase-migration-release-runbook.md` — safe reconciliation and local replay procedure.
- `docs/p0-01-migration-baseline-2026-08-12.md` — this evidence and decision record.

No migration was added.

## Clean replay and catalog comparison evidence

Not run. `supabase`, Docker, and `psql` are unavailable on this workstation. The release gate refuses to treat this as a pass. A real replay must run only on the isolated local stack after ledger/catalog reconciliation; no hosted command is permitted by the supplied procedure.

## Tests executed

- `node scripts/test-migration-integrity.mjs` — **expected fail**: mutated `011`, duplicate `022`, 28 untracked migration files, and reconciliation status blocked.
- `pnpm run test:migrations` — **not runnable**: pnpm attempted an interactive modules-directory purge and aborted in this non-TTY environment. The underlying Node script was executed directly instead.
- `git diff --check` — passed with no whitespace errors.

Required replay/list/lint/catalog parity, former-`022` effect checks, RLS/ACL/function metadata checks, critical business-rule tests, and critical server-guard tests are **not passed** and must not be implied by this report.

## Remaining blockers

1. Obtain staging and hosted ledgers/catalogs read-only, including `get_public_tenant_context` and `tenant_domains`.
2. Confirm the deployed `011` content and use a new forward migration for any required policy-drop behaviour.
3. Prove both `022` outcomes per environment and reconcile using unique timestamp migrations.
4. Track and review the 28 untracked migrations; hashes alone do not establish provenance.
5. Install/use a pinned Supabase CLI, Docker-compatible runtime, and PostgreSQL client for an isolated replay and manifest comparison.
6. Address the separately audited `038` malformed SECURITY DEFINER search paths only in P0-02, after the baseline is reproducible.

**Database deployment is not unblocked.**
