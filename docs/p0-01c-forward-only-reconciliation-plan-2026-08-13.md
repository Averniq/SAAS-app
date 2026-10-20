# P0-01C forward-only migration reconciliation plan

**Status: BLOCKED — planning complete; implementation and deployment are not approved.**

Scope: this is a documentation-only, repository-grounded plan dated 2026-08-13. It does not change a database, migration ledger, historical migration, or deployment state. It distinguishes immutable historical evidence from the dirty working tree. A filename, legacy version, inventory hash, or current object effect is not proof of the SQL blob that was applied.

Evidence labels used below:

- **Immutable historical evidence:** `HEAD` blobs and their recorded inventory hashes; they are preservation evidence, never a rewrite target.
- **Current working-tree change:** a modified or untracked file presently visible locally; it is evidence only.
- **Confirmed Production state:** manually captured, read-only Production evidence from P0-01B.
- **Unknown/unverified:** no safe provenance or catalog conclusion can be drawn.
- **Future forward-only work:** a separately approved, uniquely timestamped append-only migration only after targeted evidence and replay gates.

## 1. Current migration-state summary

`supabase/migration-inventory.json` contains 44 SQL blobs: legacy `001`–`035`, no `036`, `037`–`043`, and `20260805133843_validate_onboarding_timezone.sql`. The absent `036` is an allowed legacy gap. The inventory is explicitly `reconciliation-blocked`; its SHA-256 values freeze the current blobs but do not establish canonicality or deployment.

Git tracks `001`–`011`, `014`, and `016`–`018`; `011` is modified in the working tree. The remaining 28 inventory migrations are untracked working-tree files. Legacy `022` is duplicated. The integrity guard therefore remains correctly blocking, and clean isolated replay has not been proved (Supabase CLI, Docker, and `psql` were unavailable at the audit point).

## 2. Known repository-vs-hosted-ledger mismatches

Production has 14 captured timestamp ledger entries. Captured SQL comparison documents drift for local `014`, `016`–`018`, `023`–`025`, and `031`–`032`; version/name equality is not SQL equivalence. Captured exact content matches are `041` and the timestamped timezone migration. Production also has effects of many source migrations without matching captured ledger rows, including core schema, organisations, entitlements, QR tokens, split bills, attendance, reporting, test-order exclusion, and staff presence. Those effects are unresolved provenance (possibly manual SQL or missing history), never a reason to repair a ledger.

Staging did not respond to the prior read-only ledger request. Its ledger and catalog remain unknown. No repository-to-Production or repository-to-staging canonical mapping exists.

## 3. Duplicate migration-number analysis

`022_exclude_test_orders_from_reporting.sql` and `022_staff_presence.sql` share legacy version `022`. Preserve both files unedited. The former defines the reporting exclusion outcome; the latter adds staff presence. Production presently has both effects, but neither effect is safely ledger-mappable to either historical file. Do not rename, merge, select, delete, promote, or repair either file/ledger entry. Future work may only create a unique timestamped migration when a current verified definition needs an actual change.

Competing QR-branch variants for `021`–`024` are collision-risk evidence only. They must not be merged, selected, renamed, deleted, or promoted while provenance and intended dependency contracts remain unverified.

## 4. Modified historical migration analysis, especially `011_consolidate_rls_policies.sql`

The immutable `HEAD` evidence for `011` is SHA-256 `45415f2c9f9762965a5254e902a77daca22a37dd3599f02ba1d803d891587cb1`. The present working-tree variant is SHA-256 `dd5b31380b158888eb04718bf7f96c1b1f070f1362c2b6973ba8c3d2e32e4646` and adds 15 idempotent policy drops. Preserve both facts; do not edit either historical representation.

P0-01B checked the 15 policy names in Production: 14 currently exist; only `public.restaurants` / `authenticated update allowed restaurants` is absent. This establishes neither which `011` blob was deployed nor that any policy correction is needed. Before any later policy change, capture exact current policy definitions (table, command, roles, permissive/restrictive mode, `USING`, `WITH CHECK`), table RLS/force-RLS state, relevant function definitions/ACLs, and dependency/application-role tests. Only then may a later unique append-only corrective migration be designed.

## 5. Untracked migration analysis

The 28 untracked migrations are controlled working-tree evidence, not canonical history: `012`, `013`, `015`, `019`–`035`, `037`–`043`, and the timestamped timezone migration. Inventory hashes freeze their blobs but do not prove author, review, Git history, clean-replay inclusion, deployment, or deployed content. They must not be silently added, rewritten, or used to infer ledger repairs during P0-01C. Their row-by-row disposition is in the matrix.

## 6. Hosted-only / unreconstructable object analysis

Production verifies `public.get_public_tenant_context(text)`: `p_hostname text -> jsonb`, PL/pgSQL, `STABLE`, `SECURITY DEFINER`, owner `postgres`, `search_path = public, pg_temp`, and intentional `anon`/`authenticated` execution. The manually reviewed contract normalizes a hostname, explicitly reads `public.tenant_domains`, requires an eligible active ordering-enabled restaurant, returns a `venues` JSONB array, and raises the captured tenant-domain/venue errors. `tenant_domains` exists with its captured keys, FKs, checks, RLS, and partial ACL evidence. No repository migration defines the resolver.

No unreviewed Production source may be copied. Before a forward adoption/replacement candidate, capture access-controlled exact source text, `pg_get_functiondef`, function identity/signature, owner, language/volatility/definer/configuration, all execute ACL rows, relation DDL/columns/defaults/constraints/indexes, RLS/force state and policies, relation ACLs, triggers, dependencies (including a documented limitation of PL/pgSQL dependency capture), extension dependencies, callers, and staged role/tenant/error contracts. Kitchen-print objects and role variants are likewise unverified hosted/source drift: obtain exact intended definitions, owners, ACL/RLS, dependencies, callers, and environment presence before considering them.

`037` may omit staff-presence fields from `list_restaurant_team`; capture the exact current Production signature, body, result shape, grants, caller expectations, and presence-object dependencies before considering a correction. `038_security_hardening.sql` has malformed `SECURITY DEFINER` search-path concerns; this belongs to P0-02 and is explicitly deferred here.

## 7. Proposed canonical migration inventory approach

Keep the current inventory as a frozen **evidence register**, not an approved replay manifest. A later reviewed control plane should retain, per environment and object: filename, version, normalized hash, Git tracking/commit provenance, source review state, observed ledger row, actual applied SQL provenance where recoverable, catalog fingerprints, effect assertions, and confidence. It must represent duplicate `022` effects by distinct object/effect identities rather than pretending a single version identifies both.

Only after the evidence set is approved may a separate applied-migration lock be proposed. It must preserve every historical blob unchanged, record ambiguity explicitly, use per-environment evidence rather than synthetic ledger mappings, and require unique generated 14-digit UTC versions for all new work.

## 8. Exact forward-only reconciliation strategy

1. Freeze and retain all historical and working-tree evidence, including `HEAD` `011`, current `011`, both `022` files, QR-branch collision evidence, and inventory hashes.
2. Capture staging ledger/catalog read-only and complete targeted Production catalog facts only for a proposed correction; never derive provenance from a version/name.
3. Establish a reviewed current-object baseline for each environment, marking effects as confirmed, absent, or unknown. Effects without matching captured ledger rows remain provenance-unresolved.
4. Prove exact deployed definitions and dependencies before deciding whether there is a defect. Do not reproduce hosted-only code from behavioural summaries.
5. If and only if a real current-state defect is approved, design a new unique 14-digit UTC append-only, idempotent migration against that exact baseline. It must preserve tenant isolation, function ACLs, auditability, and existing financial/operational history.
6. Test the proposed set in isolated replay and staging; compare catalog fingerprints and role/tenant behavior. A later, separately approved environment-specific ledger-repair proposal is possible only after this work; P0-01C authorizes neither repair nor deployment.

## 9. Historical files that must be frozen and never edited again

All 44 files listed in the matrix are frozen, including tracked history, untracked evidence, duplicate `022` files, current `011`, and the timestamped timezone migration. In particular: never edit `001`–`043`, never fill `036`, never rename either `022`, and never alter `011` to carry a correction. Any future migration must be a new uniquely generated 14-digit UTC version.

## 10. New reconciliation migration(s) that could need to be created later — candidates only; never SQL, timestamps, or implementation

- A narrowly evidenced RLS policy correction, only if current policy definitions and role tests prove a defect.
- A unique forward assertion/remediation for reporting exclusion or staff-presence behavior, only if catalog and application contracts require a changed outcome.
- A reviewed adoption/replacement boundary for `get_public_tenant_context` and `tenant_domains`, only after complete source/catalog/ACL evidence.
- A `list_restaurant_team` presence-contract correction, only if current Production contract and callers prove the omission is wrong.
- A kitchen-print/role-variant adoption or replacement, only after intended ownership and exact contracts are approved.

These are candidates, not approved SQL, timestamps, implementation plans, or ledger repairs. P0-02 owns malformed `038` definer search paths.

## 11. Ordering/dependency requirements

The descriptive source dependency order is `001–011`; `012 -> 013 -> 015`; `014 -> 016 -> 017 -> 018`; `013 -> 019 -> 020 -> 021 -> reporting-022`; `003 -> presence-022`; `019 -> 023 -> 024`; `025`; `014 -> 026`; `027 -> 028 -> 029 -> 030 -> 031 -> 032 -> 033 -> 034`; `035 -> 037 -> 038 -> 039 -> 040 -> 041 -> 042`; and `020 -> timezone validation`. It does not license replay, renumbering, or version inference. A future correction must additionally depend on the approved environment baseline, exact current object signature/body/ACL/RLS/dependencies, P0-02 sequencing where relevant, and successful isolated/staging verification.

## 12. Rollback philosophy: forward-fix only; no destructive rollback

Do not reset, restore, delete, overwrite, squash, or edit historical migrations; do not repair a hosted ledger; do not use destructive rollback. If a future forward migration is wrong, its remedy is another reviewed, scoped forward migration that preserves data, audit records, tenant boundaries, and prior evidence. Any exceptional data correction requires its own authorization, backup/recovery plan, audit record, and idempotence/retry analysis.

## 13. Release-gate requirements before any deployment

Before any deployment: approved inventory and catalog manifest; frozen historical-hash verification; no unknown/untracked historical files in the approved release set; no changed frozen hash; unique valid versions; no empty/conflicted migration; read-only local/staging/Production ledger and catalog comparison; both `022` effect assertions; resolver and hosted-only object assertions as applicable; function signature/definer/search-path/ACL and RLS/grant checks; clean isolated replay; staging execution and tenant/role contract tests; and approved change/release ownership. `node scripts/test-migration-integrity.mjs`, `node scripts/test-migration-release-gate.mjs`, local `supabase db reset --local --no-seed`, `migration list --local`, and `db lint` must pass only when their prerequisites are approved. P0-01C does not unblock deployment.

## 14. Evidence still missing before implementation

- Staging ledger and catalog/object fingerprints.
- Recoverable provenance for historical `011`, both `022` effects, the 28 untracked blobs, and all effects without captured ledger rows (may remain unreconstructable).
- Exact policy definitions for any `011` policy candidate.
- Access-controlled source and full catalog/ACL/dependency evidence for resolver/`tenant_domains`.
- Exact Production `list_restaurant_team` contract and kitchen-print/role-variant definitions/ownership.
- Isolated clean replay capability and results; staging parity and integration role/tenant results.
- An approved canonical inventory/manifest and release owner decision.

## 15. Explicit GO / NO-GO criteria for beginning a later P0-01C implementation

**GO to design (not deploy)** only when a proposed correction has a documented current-state defect, exact affected environment baseline, targeted source/catalog/RLS/ACL/dependency evidence, unique forward identity, reviewed dependency order, and an approved isolated/staging validation plan. Unknown historical provenance alone is never a defect.

**NO-GO** when the requested action would edit/rename/delete historical files, map a ledger from filename/version, copy unreviewed Production source, repair/reset/push a database, assume staging parity, include P0-02 `038` remediation, or proceed without the targeted evidence above. **NO-GO for deployment remains in force** until every release-gate requirement passes and release ownership explicitly approves it.

## 16. Recommended next Codex session after this planning task

Run a read-only evidence-capture and catalog-reconciliation session: obtain the missing staging ledger/catalog; obtain only the targeted exact definitions for resolver/`tenant_domains`, `011` policy candidates, `list_restaurant_team`, and kitchen/role drift; then update the evidence register without changing migrations or any database. Follow with a separately authorized forward-migration design session only if a verified defect remains.

## Reconciliation matrix — all inventory migrations

Legend: `Historical` means immutable repository evidence; `WT` means current working-tree evidence. `Prod: unknown` means no confirmed per-file provenance/effect, not absence. Disposition `freeze` never means deploy/replay.

| Filename / version | Git tracking state | Evidence category | Known Production state | Provenance confidence | Forward-only disposition | Targeted evidence before future change design |
| --- | --- | --- | --- | --- | --- | --- |
| 001_initial_schema.sql / 001 | tracked clean | Historical | core effects reported, ledger mapping absent | low | freeze | catalog fingerprint and ledger/provenance map |
| 002_platform_admin.sql / 002 | tracked clean | Historical | unknown | low | freeze | exact catalog/ACL and callers |
| 003_restaurant_staff_invites.sql / 003 | tracked clean | Historical | staff/presence effects reported, mapping absent | low | freeze | staff schema/RLS/function catalog |
| 004_role_hardening.sql / 004 | tracked clean | Historical | unknown | low | freeze | role/RLS/ACL catalog |
| 005_all_round_staff.sql / 005 | tracked clean | Historical | role variants unverified | low | freeze | intended roles, constraints, ACL/RLS, callers |
| 006_function_permission_hardening.sql / 006 | tracked clean | Historical | unknown | low | freeze | function signature/ACL catalog |
| 007_explicit_data_api_grants.sql / 007 | tracked clean | Historical | unknown | low | freeze | relation/function grants by role |
| 008_authoritative_option_pricing.sql / 008 | tracked clean | Historical | unknown | low | freeze | pricing function/body/call contracts |
| 009_reporting_layer.sql / 009 | tracked clean | Historical | reporting effect reported, mapping absent | low | freeze | reporting view definitions/dependencies |
| 010_advisor_index_rls_tuning.sql / 010 | tracked clean | Historical | unknown | low | freeze | index/RLS catalog and workload evidence |
| 011_consolidate_rls_policies.sql / 011 | tracked modified | Historical + WT | 14/15 checked names exist; one absent | low | freeze; never edit | exact policy definitions, RLS/ACL, role tests |
| 012_self_service_signup_validation.sql / 012 | untracked | WT | unknown | low | freeze | source provenance, catalog/function/RLS |
| 013_verified_self_service_provisioning.sql / 013 | untracked | WT | organisation effects reported, mapping absent | low | freeze | provisioning objects/ACL/trigger catalog |
| 014_payment_records.sql / 014 | tracked clean | Historical | documented SQL-hash drift | confirmed drift; low provenance | freeze | exact Production definition/ledger blob and payment contracts |
| 015_organization_restaurant_integrity.sql / 015 | untracked | WT | organisations reported, mapping absent | low | freeze | constraints/FKs/data preflight |
| 016_seed_sake_street_test_tenant.sql / 016 | tracked clean | Historical | documented SQL-hash drift | confirmed drift; low provenance | freeze | ledger blob, row/data provenance |
| 017_seed_sake_street_categories.sql / 017 | tracked clean | Historical | documented SQL-hash drift | confirmed drift; low provenance | freeze | ledger blob, seeded-data provenance |
| 018_record_restaurant_order_payment.sql / 018 | tracked clean | Historical | documented SQL-hash drift | confirmed drift; low provenance | freeze | function body/signature/ACL and telemetry |
| 019_trial_entitlement_foundation.sql / 019 | untracked | WT | entitlement effects reported, mapping absent | low | freeze | entitlement tables/triggers/functions/catalog |
| 020_self_service_onboarding_workflow.sql / 020 | untracked | WT | unknown | low | freeze | onboarding contract and dependencies |
| 021_sample_qr_test_order_activation.sql / 021 | untracked | WT; QR collision risk | unknown | low | freeze; do not select QR variant | exact branch provenance, QR function/catalog/callers |
| 022_exclude_test_orders_from_reporting.sql / 022 | untracked | WT; duplicate historical version | effect confirmed present | effect yes; provenance unknown | freeze; no ledger mapping | exact reporting view/body/dependencies |
| 022_staff_presence.sql / 022 | untracked | WT; duplicate historical version | effect confirmed present | effect yes; provenance unknown | freeze; no ledger mapping | exact fields/function/index/RLS/callers |
| 023_fix_staff_invite_entitlement_trigger.sql / 023 | untracked | WT; QR collision risk | documented SQL-hash drift | confirmed drift; low provenance | freeze | Production trigger/function/ledger blob |
| 024_harden_entitlement_trigger_permissions.sql / 024 | untracked | WT; QR collision risk | documented SQL-hash drift | confirmed drift; low provenance | freeze | trigger/function ACL/RLS and ledger blob |
| 025_menu_image_uploads.sql / 025 | untracked | WT | documented SQL-hash drift | confirmed drift; low provenance | freeze | storage/schema policies and ledger blob |
| 026_frontdesk_split_bills.sql / 026 | untracked | WT | split effects reported, mapping absent | low | freeze | split tables/RLS/functions and financial contracts |
| 027_staff_attendance.sql / 027 | untracked | WT | attendance effects reported, mapping absent | low | freeze | attendance catalog/RLS/ACL |
| 028_shared_pin_attendance.sql / 028 | untracked | WT | attendance effects reported, mapping absent | low | freeze | PIN function/ACL/rate-limit contracts |
| 029_harden_shared_pin_attendance.sql / 029 | untracked | WT | attendance effects reported, mapping absent | low | freeze | exact functions/ACLs and role tests |
| 030_shared_pin_rate_limit.sql / 030 | untracked | WT | attendance effects reported, mapping absent | low | freeze | rate-limit tables/functions/indexes |
| 031_qualify_pgcrypto_attendance.sql / 031 | untracked | WT | documented SQL-hash drift | confirmed drift; low provenance | freeze | Production function source/config and ledger blob |
| 032_fix_pin_rate_limit_window_column.sql / 032 | untracked | WT | documented SQL-hash drift | confirmed drift; low provenance | freeze | table/function definitions and ledger blob |
| 033_staff_attendance_pin_management.sql / 033 | untracked | WT | attendance effects reported, mapping absent | low | freeze | function/RLS/ACL and audit contract |
| 034_attendance_weekly_reports.sql / 034 | untracked | WT | attendance/report effects reported, mapping absent | low | freeze | report view/function contracts and catalog |
| 035_order_integrity_audit.sql / 035 | untracked | WT | unknown | low | freeze | audit tables/triggers/RLS and retention |
| 037_owner_boundary_and_payment_integrity.sql / 037 | untracked | WT | team projection may omit presence; otherwise unverified | low | freeze | exact `list_restaurant_team` signature/body/result/ACL |
| 038_security_hardening.sql / 038 | untracked | WT; P0-02 deferred | malformed definer paths audited; no P0-01C correction | low | freeze; defer | P0-02 signature/search-path/ACL evidence |
| 039_payment_confirmation_metadata.sql / 039 | untracked | WT | unknown | low | freeze | payment metadata schema/function/ACL |
| 040_external_staff_clock_links.sql / 040 | untracked | WT | unknown | low | freeze | public link function/ACL/RLS/caller contract |
| 041_self_service_trial_recovery_and_limits.sql / 041 | untracked | WT | documented exact SQL match | content match; deployment provenance still limited | freeze | ledger context, object fingerprint and retry tests |
| 042_harden_atomic_kitchen_voids.sql / 042 | untracked | WT | unknown; kitchen objects drift unverified | low | freeze | void/kitchen functions, audit/financial contracts |
| 043_public_qr_order_idempotency.sql / 043 | untracked | WT | unknown | low | freeze | QR function/body/RLS/ACL and idempotency tests |
| 20260805133843_validate_onboarding_timezone.sql / 20260805133843 | untracked | WT | documented exact SQL match | content match; deployment provenance still limited | freeze | ledger context, function/catalog fingerprint |

## Planning validation

This document was created after non-mutating Git status/diff/log/show inspection and read-only repository inspection. The required integrity command is expected to remain non-zero because the release block is pre-existing; it is evidence, not a P0-01C planning failure. No database/Supabase command is part of this plan.
