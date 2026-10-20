# P0-01D Batch 11 — Canonical Baseline vs Production Reconciliation Delta

## 1. Executive status

**COMPLETE — RECONCILIATION DELTA ESTABLISHED**

This is a read-only comparison. It establishes a decision-grade delta between the Batch 10 canonical local replay and the previously captured Production catalog. It does **not** establish historical provenance for every live object, approve a migration inventory, approve any SQL, or authorize a release.

**Counts:** 13 material reconciliation deltas; 2 classified **Production-only defective**; 5 require preservation; 2 still require fresh, targeted evidence before SQL design. “Preserve” means preserve the currently verified contract/data while fixing forward, not preserve defective implementation details.

## 2. Canonical baseline authority

| Authority item | Verified value |
| --- | --- |
| Immutable source commit | `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c` |
| Batch 10 result | `PASS — APPROVED CANONICAL LOCAL REPLAY` |
| Approved manifest SHA-256 | `ce42f92a0a19b2793f96ea5331e0228e2128eab1595bf0a3ce257fcc029143e9` |
| Replay workspace | `C:\Users\WindVeil\AppData\Local\Temp\p0-01d-b10-20260816T102603Z-28524` |
| Local result | Healthy local database; exact 14-entry history; `supabase db lint --local --level warning` passed |

The canonical baseline is exactly this successful isolated replay, not the dirty repository tree and not the 44-entry evidence inventory. Batch 10 preflight records the approved source, manifest and 14 hashes; its local verification records 14 migrations and a healthy container.

Approved versions: `001`, `002`, `003`, `004`, `005`, `006`, `007`, `008`, `009`, `010`, `014`, `016`, `017`, `018` (respectively: initial schema, platform admin, staff invites, role hardening, all-round staff, function hardening, explicit grants, option pricing, reporting, index/RLS tuning, payment audit fields, Sake Street tenant/categories seed, and legacy order-payment RPC).

## 3. Production evidence authority

No new Production query or Supabase command was run in Batch 11. This report uses the prior manually captured, read-only Production evidence in:

- `docs/p0-01b-hosted-environment-evidence-2026-08-12.md` — 14-row Production ledger; split catalog captures; 011 policy existence; both 022 effects; tenant resolver/domain contract.
- `docs/database-architecture-audit-2026-08-12.md` — Production RLS/ACL, function, SECURITY DEFINER, role, payment, reporting, status, and kitchen-print analysis, including live-observed defects.
- `docs/p0-01c-forward-only-reconciliation-plan-2026-08-13.md`, `docs/supabase-migration-reconciliation.md`, `docs/supabase-migration-release-runbook.md`, and `supabase/migration-inventory.json` — provenance, inventory and release-control evidence.
- Batch 10 evidence workspace `evidence/preflight.json`, `local-db-verification.log`, `migration-list-local.log`, and `db-lint-local.log` — canonical replay authority.

The Production evidence is adequate to classify the deltas below. It is deliberately insufficient to write source-level replacements for live-only tenant and kitchen objects, or exact policy changes; those require narrow read-only catalog capture first.

## 4. Reconciliation matrix

| # | Surface | Object | Canonical baseline state | Production state | Repository-later state | Classification | Evidence | Required preservation? | Likely forward-only action | Risk if ignored |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Migration history / identity | `011`, duplicate `022`, inventory | Exact 14 approved versions; no `011`, no `022`, and no later history in canonical replay. | Timestamp ledger has 14 later named entries, while many live effects lack a matching captured ledger row. | `011` differs from immutable hash; two distinct `022` files; 28 files untracked; inventory remains `reconciliation-blocked`. | Historical divergence | Baseline report §§17–31; P0-01B §§18–39, 51–56; inventory | Yes — preserve all evidence blobs and live data; do not synthesize provenance. | Create an approved applied-history/catalog manifest and only unique timestamped forward changes. | Push/repair can skip objects or falsely mark unlike SQL as applied. |
| 2 | RLS policy | `public.restaurants` / `authenticated update allowed restaurants` | Canonical 001 creates `owners manage restaurant`; canonical 011 is excluded. | 14 of 15 target policy names exist; this update policy is absent. All five target tables: RLS enabled, not forced; present target policies permissive and `{authenticated}`. Exact predicates were not captured. | Historical `HEAD` 011 defines the absent policy; dirty 011 adds idempotent drops. | Historical divergence | P0-01B §§51–56, 74–79; canonical 001; 011 | Uncertain — preserve only verified safe authorization semantics. | Capture exact current policies, table ACLs, dependencies and role tests; then decide whether a narrow policy migration is needed. | Blind recreation may broaden update access or conflict with live authorization. |
| 3 | Role constraints / invitation membership | `restaurant_staff`, `restaurant_invites`, invite/team RPC paths | Canonical role checks and invite validation allow `owner, manager, staff, kitchen, cashier`. | Production accepts additional relevant roles `waitstaff` and `attendance`. | Later migrations extend attendance/team model but no reviewed migration establishes these two Production variants. | Production-only intentional | Architecture audit §§123–135; P0-01C §§45–49; canonical 005 | Yes — do not reject or rewrite existing memberships/invites without product decision. | Reconcile a single role vocabulary and its RLS/RPC/report permissions; preflight existing rows before constraints. | Constraint/RPC changes can strand valid staff or create inconsistent authorization. |
| 4 | Hosted tenancy boundary | `tenant_domains`, `get_public_tenant_context(text)` | Absent from canonical replay and no baseline migration defines either object. | `tenant_domains` and a `STABLE SECURITY DEFINER` resolver exist; owner `postgres`, path `public, pg_temp`, EXECUTE for `anon`, `authenticated`, `postgres`; reviewed hostname/eligible-venue behavior. | No migration defines the resolver/domain contract. | Production-only intentional | P0-01B §§41–49, 62–66; P0-01C §§43–47 | Yes — preserve public hostname-resolution behavior and tenant isolation. | Capture exact source, DDL, ACLs, RLS, triggers, dependencies and callers before adoption/replacement. | Clean replay omits active custom-domain routing; a guessed replacement could disclose tenants. |
| 5 | Kitchen print queue | `orders` print columns, `orders_kitchen_print_queue_idx`, `claim_kitchen_print_job`, `finish_kitchen_print_job` | Absent. Baseline `orders` has no kitchen-print fields/index/functions. | All named columns/functions/index exist. Functions are SECURITY DEFINER with captured execute grantees; queue predicate uses `status IN ('New','Preparing')`. | No repository migration reconstructs the queue. | Production-only defective | Architecture audit §§135, 307, 495–501; prior captured Production surface | Preserve external printer contract/data only; do **not** preserve broken implementation. | Read-only capture exact bodies/owners/ACLs/callers; replace forward with canonical table, status, tenancy, lock/retry and index semantics. | Clean replay lacks printing; valid jobs cannot be claimed. |
| 6 | Kitchen/status state compatibility | `orders_status_check` versus print predicate | Canonical status check is lowercase `new, preparing, ready, completed, cancelled`. | Validated Production check permits lowercase `new, draft, confirmed, kitchen_accepted, preparing, ready, completed, paid, cancelled, voided`; print predicate uses uppercase `New`, `Preparing`. | Later order/integrity history expands status semantics, but no repository queue implementation aligns them. | Production-only defective | Canonical 001; Production surface; architecture audit §§495–501 | Preserve valid existing lowercase status data; not the uppercase predicate. | Include in kitchen repair: canonical state map and compatible partial-index/function predicates; test existing statuses. | Print queue remains permanently empty or behavior differs by path. |
| 7 | SECURITY DEFINER hardening | 41 affected public SECURITY DEFINER function configurations | Canonical definers use their individual baseline paths; no 038 hardening is in the replay. | Every live application definer has a non-null path, but 41 have malformed quoted-comma paths such as `"public, extensions"`; impact is function-specific. | `038_security_hardening.sql` caused this by quoting the whole extracted comma-separated path. | Repository-later defective | Architecture audit §§317–336, 431–437; 038 lines 15–47 | Preserve function signatures, intended ACLs and working bodies; repair paths forward. | P0-02-owned, allowlisted per-signature path hardening; qualify extension calls and assert zero quoted-comma paths. | QR/onboarding crypto calls can fail; blanket changes can break other definers. |
| 8 | Payment ledger and RPC boundary | `payments`, `split_bills`, `record_restaurant_payment`, legacy `record_restaurant_order_payment` | Baseline has order payment fields and the legacy three-argument RPC, but no `payments` ledger/splits/current ledger RPC. The legacy RPC can mark paid without amount/ledger entry. | Production has ledger/split surfaces and current payment RPCs **while the legacy bypass remains live**; observed completed/unpaid/no-ledger orders demonstrate inconsistent state. | 026/037/039 add ledger and current RPC variants but do not safely retire the legacy signature; 039 improves metadata/idempotency. | Repository-later intended | Architecture audit §§129, 235–238, 375–381, 415–429; 018; 026; 037; 039 | Yes — preserve payment/void/audit records and valid ledger contract. | Revoke or ledger-back a compatibility wrapper for legacy RPC; reconcile fulfillment/financial/void state machine and historical anomalies under separate approval. | Financial audit, balance and revenue truth remain corruptible. |
| 9 | Payment ACL / RLS semantics | `public.payments` SELECT policy/grant | Absent from canonical baseline. | RLS enabled; policy includes owner/manager/staff/kitchen/cashier but authenticated has no SELECT grant; application receives recurring 403. | 026 adds broad staff-read policy; later history does not demonstrate an approved narrow read boundary. | Repository-later defective | Architecture audit §§255–281, 407–413; 026 lines 66–72 | Preserve denial to anon/write access and legitimate finance visibility only. | Design a tenant-validated narrow read RPC or minimal SELECT grant after roles/columns are decided; remove kitchen overreach. | Polling displays stale payment/balance state; broad grant risks financial exposure. |
| 10 | Reporting layer / test orders | `reporting.order_facts` and dependent reporting views/RPCs | Canonical reporting exists, security-invoker, but includes all orders and treats `completed` as revenue. | Reporting exclusion of test orders is present. Production still has terminal-status/payment contradictions. | `022_exclude_test_orders_from_reporting.sql` is a duplicate-version file whose effect is present; later payment history does not resolve revenue truth. | Repository-later intended | P0-01B §§51–56; 009; 022 reporting; architecture audit §§415–421 | Yes — preserve test-order exclusion and reporting access model. | Assign a unique forward identity only if definition must change; later reconcile revenue with completed ledger payments, not status alone. | Test data pollutes reports; unpaid completed orders remain revenue. |
| 11 | Staff presence | `restaurant_staff.last_seen_at`, index, `touch_staff_presence`, team projection | Absent from canonical baseline. | Field, index and touch function are present. Exact current `list_restaurant_team` projection was not captured. | Duplicate `022_staff_presence` adds them; 037 later redefines team projection and may omit presence fields. | Repository-later intended | P0-01B §§51–56; P0-01C §§45–49; 022 presence; 037 | Yes — preserve field/index/heartbeat semantics pending caller review. | Capture current team function signature/body/result/ACL and callers; restore presence projection only if contract requires it. | UI/client contract can silently lose online/presence data. |
| 12 | Seed/test-tenant state | Sake Street tenant/categories and later production seed variants | Canonical deliberately includes 016/017 seed state. | Ledger contains different named/timestamped seed variants; live seed provenance/data ownership is unresolved. | Later repo has fixture/onboarding/test-order evolution; baseline notes seed slug/token collision risk. | Unknown — needs evidence | P0-01B §§20–39; baseline §§21–23; architecture audit §§487–493 | Yes — do not delete or re-seed live rows automatically. | Read-only provenance/external-link/data classification; move future fixtures to environment-gated process. | A live tenant can be mutated by a fixture collision; remediation can destroy demo/customer dependencies. |
| 13 | Grants and RLS estate beyond the five-policy sample | sensitive tables/functions, reporting/attendance/payment ACLs | Baseline grants/RLS are limited to its 14 migrations; reporting is invoker and authenticated-only. | RLS is enabled and unforced for all audited app tables; policy/grant intersections leave dormant broad policies and private/RPC-only boundaries. No exhaustive per-object Production ACL diff exists. | 006/007 and later migrations repeatedly alter grants/functions/RLS; 038 only partially hardens execute exposure. | Unknown — needs evidence | Architecture audit §§240–281, 309–324; P0-01B §§58–60, 74–79 | Preserve proven public resolver, reporting invoker model, and private RPC-only boundaries. | Capture only objects selected for a change: exact ACLs, function ownership, definer flag/path, execute grantees, RLS policies and dependencies; produce allowlist. | A broad grant activates dormant policies; a broad revoke breaks live RPC/trigger clients. |

### Scope notes

- Rows 5 and 6 are separately material: row 5 is the unreproducible Production-only object set; row 6 is the independently verified, internally contradictory status/predicate behavior that makes that set defective.
- No row claims a repository filename proves a Production deployment. “Repository-later intended” describes apparent product intent only, not approval or provenance.
- “No material difference” was not used for baseline objects merely because Production has a broadly similar object: exact DDL/body/ACL/policy equality was not captured and must not be inferred.

## 5. Historical migration anomalies

### Mutated `011`

The immutable historical `011_consolidate_rls_policies.sql` hash is `45415f2c9f9762965a5254e902a77daca22a37dd3599f02ba1d803d891587cb1`; the dirty working-tree file hash recorded by prior evidence is `dd5b31380b158888eb04718bf7f96c1b1f070f1362c2b6973ba8c3d2e32e4646` and adds 15 policy drops. Production’s current 14/15 policy-name result establishes neither deployed blob nor desired predicate semantics. Do not edit either historical representation, restore by reset, or repair a hosted ledger backward. Any actual policy change must be new, uniquely timestamped, and preceded by exact current-policy evidence.

### Duplicate `022`

`022_exclude_test_orders_from_reporting.sql` and `022_staff_presence.sql` are distinct effects with one legacy version. Production has both effects, but no safe mapping from either effect to a ledger version or file. Do not rename, merge, delete, choose, or ledger-repair either file. Represent effects independently in the future catalog lock; use a unique forward identity only for a proven change.

### Untracked migrations

The 28 untracked migration files are controlled working-tree evidence, not canonical history. `migration-inventory.json` freezes hashes but correctly remains `reconciliation-blocked`; it is not an approved replay manifest. They cannot be silently promoted, replayed into hosted environments, or used to infer applied SQL provenance.

## 6. Production-only surfaces

| Surface | Disposition | Rationale |
| --- | --- | --- |
| `tenant_domains` and `get_public_tenant_context(text)` | **preserve** | Verified public tenant-resolution contract, reviewed SECURITY DEFINER path/ACLs, and required application dependency; source-level adoption needs exact capture. |
| Kitchen-print fields/index/functions | **fix-forward** | Live-only and unreproducible; current function/table/status mismatch is broken. Preserve external compatibility/data only after caller/owner evidence. |
| `waitstaff` / `attendance` role values | **preserve pending role-model reconciliation** | Production accepts them in relevant paths; their intended capability matrix/provenance is not established. |
| Production ledger/split/payment objects | **preserve and reconcile forward** | They provide intended auditable payment capability but coexist with bypasses/inconsistent status history. |
| Existing Sake Street and related seed rows | **uncertain** | No safe automatic deletion, reseed or mutation until provenance and external dependencies are classified. |

## 7. Repository-later surfaces

**Appears valid product evolution, but not canonical or approved:** payment ledger/splits/current payment RPCs (026/037/039); reporting test-order exclusion (reporting 022); staff-presence heartbeat (presence 022); attendance/onboarding/entitlement evolution where current contracts still require catalog and caller review; timestamped timezone validation and 041 have reported content matches but still limited deployment provenance.

**Defective or superseded / requires replacement:** `038_security_hardening.sql` malformed 41 live definer paths; legacy payment signature retained from canonical 018; payment ACL/RLS result causing live 403; status/payment/void/reporting contradiction; possible 037 loss of presence fields from `list_restaurant_team`; kitchen print has no repository source and is broken rather than a candidate for blind import.

**Historical corruption/collision evidence:** modified 011, duplicate 022, competing QR-branch variants, and all untracked migrations. None becomes authoritative merely by existing locally.

## 8. Forward-only reconciliation requirements

No SQL is proposed here. The logical remediation groups, in required dependency order, are:

1. **Evidence and migration-history canonicalization** — retain immutable blobs; approve environment-specific catalog/effect manifest; no backward repair.
2. **Role-model reconciliation** — decide `waitstaff`/`attendance` vocabulary, compatibility, invitation/membership constraints, RPC checks and RLS matrix; preflight existing data.
3. **RLS-policy and grant/ACL reconciliation** — capture exact target policies/ACLs; resolve restaurants-policy question and payment read boundary with role tests.
4. **SECURITY DEFINER hardening (P0-02-owned sequencing)** — allowlisted per-function paths, qualified extension calls, exact ownership/EXECUTE review; do not use a blanket dynamic rewrite.
5. **Kitchen-print repair/adoption** — exact read-only Production source/caller/ACL capture, then compatible forward queue repair using lowercase canonical status model and `public.tables`.
6. **Payment-boundary and financial-state reconciliation** — retire/strictly wrap legacy payment RPC; define transactional fulfillment/financial/void state machine and revenue source; preserve ledger/audit history.
7. **Reporting and staff-presence contract reconciliation** — retain test exclusion; verify team projection/presence; reconcile reports to the agreed financial state.
8. **Tenant-resolution and fixture governance** — only after exact tenant resolver/domain source review; separately classify seed/test tenant rows and move future fixture generation out of general production migration execution.

Every group requires a unique 14-digit UTC append-only migration only after targeted catalog capture, isolated replay, staged role/tenant contract testing, and approved release ownership.

## 9. Release blockers after Batch 11

The following remain blocked:

| Item | Blocker |
| --- | --- |
| `migration-inventory` status = `approved` | Historical 011 mutation, duplicate 022, untracked/provenance ambiguity, and no approved per-environment applied-history/catalog manifest. |
| Production-safe forward migration set | Exact policy/ACL/function definitions and dependencies are still needed for RLS/ACL, tenant resolver, kitchen print, role, and selected payment changes; product decisions remain required for financial state/role model. |
| Local full-history replay | Batch 10 proves the approved 14-migration canonical subset only. It does not prove the dirty 44-file historical directory, all later migrations, or Production parity. |
| Staging/Production release authorization | No staging catalog/ledger parity, no approved forward set, no isolated replay of candidate set, no staged role/tenant/security/financial verification, and no release owner approval. |
| P0-02 SECURITY DEFINER remediation | The 038 malformed-path defect is confirmed in Production and must be sequenced as P0-02 work, not silently bundled. |
| Payment/print operational safety | Legacy ledger bypass, 403 payment read boundary, state contradictions, and broken kitchen queue require reviewed forward design. |

## 10. Recommended next Batch

**P0-01D Batch 12 — Targeted read-only Production catalog capture for the role/RLS/ACL and kitchen-print remediation boundaries.**

Capture only exact current definitions needed to design those first forward groups: the relevant role constraints and invite/team functions; all target RLS policy predicates/table ACLs; kitchen-print function bodies, owners, paths, EXECUTE grants, dependencies and callers; and the exact current `list_restaurant_team` projection. Do not execute it here, and do not query or change any database in this batch.

## Batch 11 validation and non-mutation statement

- This document is the sole Batch 11 repository artifact.
- No database SQL, migration, migration-history operation, Supabase deployment, link, push, reset, repair, or hosted inspection was performed in Batch 11.
- Validation of this document and repository-change scope is recorded after creation in the Batch 11 execution response.
