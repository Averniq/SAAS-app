# Supabase migration reconciliation

Status: **BLOCKED — do not push or repair hosted migration history**

This record was created from a read-only repository and hosted-ledger audit on 12 August 2026. No hosted schema or data was changed. It deliberately preserves every migration while the ambiguous history is resolved.

## Safety boundary

- Do not run `supabase db push`, `supabase migration repair`, `supabase db reset --linked`, or a reset with `--db-url`.
- Do not rename, delete, or edit a historical migration to make the integrity test pass.
- Do not use `--include-all` against a hosted project.
- Use only an isolated local stack for replay. Pass `--local` explicitly.
- Generate every future migration with `supabase migration new <descriptive_name>` and retain its 14-digit UTC timestamp.

## Repository inventory

The directory contains 43 SQL files: 001–035 (with two files numbered 022 and no 036), 037–042, and one timestamped migration. Gaps are allowed; duplicate identifiers are not. Git currently tracks only 001–011, 014, and 016–018. The other 28 migration files are working-tree files and must not be lost.

| Range/file | Role and principal dependency | History/redefinition notes |
| --- | --- | --- |
| 001 | Foundational tenant, ordering, menu, table and staff schema | Base for almost every later migration |
| 002–007 | Platform admin, invitations, roles, all-round staff, function permissions and Data API grants | Repeatedly redefine RLS policies and grants |
| 008 | Authoritative option pricing | Replaces public order pricing functions from 001 |
| 009–010 | Reporting layer and advisor/index tuning | Reporting views depend on orders, items and tenant RLS |
| 011 | Consolidated RLS policies | Tracked historical blob has been edited in place; current file adds 15 policy drops |
| 012–013 | Signup validation and verified self-service provisioning | 013 introduces organizations and onboarding foundations |
| 014 | Payment records | Required by payment recording and later payment hardening |
| 015 | Organization/restaurant integrity | Depends on organization fields from 013 |
| 016–017 | Sake Street tenant/category fixture data | Data-bearing migrations; overlap QR-branch fixture history |
| 018 | Restaurant order-payment RPC | Depends on 014 and order schema |
| 019–020 | Trial entitlement and onboarding workflow | Depend on organization/provisioning objects from 013 |
| 021 | Sample QR/test-order activation | Depends on onboarding and entitlement functions |
| 022 (reporting) | Excludes test orders from reporting facts | Redefines `reporting.order_facts`; depends on 009 and 021 |
| 022 (presence) | Staff presence fields and touch function | Independent of reporting; depends on restaurant staff from 003 |
| 023–025 | Entitlement-trigger fixes and menu image storage | 023/024 redefine entitlement trigger behavior from 019 |
| 026 | Front-desk split bills and payment functions | Depends on core orders plus payment records |
| 027–034 | Attendance, shared PIN, rate limiting, PIN management and weekly reports | Successive redefinitions of `set_staff_attendance_pin` and `identify_attendance_pin`; later files depend on earlier attendance tables |
| 035 | Order integrity/audit and void controls | Depends on orders and payments; introduces audit/void boundaries |
| 037–040 | Owner/payment/security hardening, payment metadata and external staff clock | Redefines team/payment/order functions and extends attendance |
| 041–042 | Trial recovery/limits and atomic kitchen void hardening | Redefine provisioning/entitlement and void functions |
| 20260805133843 | Onboarding timezone validation | Depends on onboarding introduced in 020 |

The exact expected filenames are machine-readable in `supabase/migration-inventory.json`. The integrity script verifies that inventory, immutable hashes for tracked 001–011, filename shape, duplicate versions, empty files, merge markers, and Git tracking.

## Confirmed conflicts

1. `022_exclude_test_orders_from_reporting.sql` and `022_staff_presence.sql` have the same migration version. Supabase compares migration timestamps/versions, so they cannot both be represented reliably in one ledger.
2. `011_consolidate_rls_policies.sql` differs from its tracked historical blob. Its current additions must be preserved, but ultimately moved into a newly generated append-only remediation migration; the historical file should match its immutable hash.
3. The QR reliability worktree contains competing 021–024 files. Combining it with this tree would produce two version-021 files, three version-022 files, two version-023 files and two version-024 files.
4. `037` redefines `list_restaurant_team` without the presence fields introduced by the presence `022`, so the final function surface does not preserve every intermediate field.
5. The application references `get_public_tenant_context`, and that function exists in the active hosted schema, but no repository migration defines it. A clean replay therefore cannot reproduce the hosted function.

## Read-only hosted-ledger comparison

The active Aveniq project reported these applied versions:

```text
20260716114639 payment_records
20260716114803 seed_sake_street_test_tenant
20260716114827 seed_sake_street_categories
20260716115053 record_restaurant_order_payment
20260716122305 set_sake_street_brand_assets
20260716124833 seed_full_sake_street_menu
20260716125013 complete_sake_street_menu_categories
20260721122201 fix_staff_invite_entitlement_trigger
20260721122354 harden_entitlement_trigger_permissions
20260721124450 menu_image_uploads
20260725065342 qualify_pgcrypto_attendance
20260725065353 fix_pin_rate_limit_window_column
20260805132642 self_service_trial_recovery_and_limits
20260805134105 validate_onboarding_timezone
```

The hosted schema also contains effects from many repository migrations that are absent from that ledger, including the core schema, organizations, entitlements, public-order tokens, split bills, attendance, reporting, test-order exclusion, and staff presence. This is evidence of manual SQL application or missing ledger records, not permission to repair them automatically.

The inactive staging project did not respond to the read-only ledger request, so its applied history is unknown. Because of that uncertainty, neither duplicate `022` file may be renamed safely yet. The active hosted versions corresponding to local 014, 016–018, 023–025, 031–032 use different SQL hashes from the current repository files; 041 and the timezone migration matched exactly. Timestamp equality alone must not be treated as proof of content equality.

## Canonical dependency order

The safe semantic order is:

```text
001–011
012 → 013 → 015
014 → 016 → 017 → 018
013 → 019 → 020 → 021 → reporting-022
003 → presence-022
019 → 023 → 024
025
014 → 026
027 → 028 → 029 → 030 → 031 → 032 → 033 → 034
035 → 037 → 038 → 039 → 040 → 041 → 042
020 → timezone validation
```

This graph is descriptive only. It does not authorize renaming files, because hosted environments track versions rather than dependencies.

## Required reconciliation procedure

1. Freeze copies and SHA-256 hashes of every repository, QR-branch and hosted-ledger variant.
2. Obtain the staging ledger and object fingerprints read-only. Record which SQL content, not just which version, was applied in each environment.
3. Keep every applied SQL blob immutable under its applied version. Restore the tracked 011 blob only after its extra policy drops have been copied verbatim into a newly generated timestamp migration.
4. Where a behavior exists without a reliable ledger entry, create a new timestamped, idempotent remediation migration after confirming the exact deployed object definition. Do not insert a short-numbered migration behind an applied timestamp.
5. Add a new migration defining `get_public_tenant_context` from the reviewed hosted definition or replace the application dependency in a separate task. Do not silently dump an unreviewed production definition.
6. Resolve each 021–024 branch variant by content and dependency. Archive non-canonical variants without deleting them; never merge colliding versions into the active migration directory.
7. Only after repository replay passes, prepare a separately reviewed, environment-specific `migration repair` plan. Task 1 does not execute that plan.
8. Replace the provisional inventory with an applied-migration lock containing the exact filename and SHA-256 for every reconciled historical file.

## Clean local replay

Prerequisites are a pinned Supabase CLI and a running Docker-compatible runtime. At the audit point, neither `supabase`, Docker, nor `psql` was installed on this workstation, so a real replay could not be executed. After resolving the integrity failures and installing the prerequisites:

```powershell
pnpm run test:migrations
supabase --version
supabase start
supabase db reset --local --no-seed
supabase migration list --local
supabase db lint --local --level warning
```

Stop at the first SQL error and fix only with the append-only procedure above. After a successful reset, verify at minimum the tables `organizations`, `restaurants`, `restaurant_staff`, `orders`, `order_items`, `payments`, `split_bills`, `split_bill_items`, all attendance and QR/token tables, reporting views, and every application RPC. Explicitly assert that `to_regprocedure('public.get_public_tenant_context(text)')` is non-null.

Until both `pnpm run test:migrations` and `supabase db reset --local --no-seed` pass, the repository cannot be claimed to reconstruct an empty database deterministically.
