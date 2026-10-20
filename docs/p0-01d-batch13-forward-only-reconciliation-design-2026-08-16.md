# P0-01D Batch 13 — Forward-Only Reconciliation Design

## 1. Final status

**COMPLETE — FORWARD-ONLY RECONCILIATION DESIGN ESTABLISHED**

This is a specification-only result. It defines the forward migration boundaries, required assertions, ordering, and validation needed to reconcile the approved 14-migration canonical baseline with verified current Production contracts. It creates no migration SQL, does not authorize execution, and does not authorize a Production release.

The plan has **five ordered logical groups**. Four are candidate database migration groups; the final group is a required inventory/control-plane gate and is deliberately not a database migration. Payment work is included only as a separately gated boundary: the legacy RPC exposure is proven, but a complete financial-state redesign is not yet approved by product/compatibility decisions.

## 2. Authority and invariants

| Authority / invariant | Binding conclusion |
| --- | --- |
| Immutable source / expected repository HEAD | `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c` on `feature/customer-review-order` |
| Batch 10 canonical baseline | `PASS — APPROVED CANONICAL LOCAL REPLAY`; manifest SHA-256 `ce42f92a0a19b2793f96ea5331e0228e2128eab1595bf0a3ce257fcc029143e9`; versions `001,002,003,004,005,006,007,008,009,010,014,016,017,018` only |
| Batch 11 authority | 13 material deltas; verified historical divergence, valid Production contracts, defects, and preservation requirements |
| Batch 12 authority | `COMPLETE — TARGETED PRODUCTION EVIDENCE CAPTURED`; both targeted evidence gaps closed through the successful human, catalog-only SQL Editor capture |
| Historical immutability | Never edit, rename, delete, re-number, replay selectively, or infer deployed provenance from `011`, either legacy `022`, or any other frozen historical blob. Never use `migration repair` as reconciliation. |
| Forward identity | Every later database change must receive a newly generated, unique 14-digit UTC migration version only after this design is implemented and reviewed. This document intentionally assigns no filenames or timestamps. |
| Production authority | Current catalog facts outrank later repository intent. Untracked/later migration source is evidence of intent only unless the fresh catalog confirms the contract. |

The `migration-inventory.json` status remains `reconciliation-blocked`. It is an evidence register, not an approved migration list or release permission.

## 3. Desired final Production contract

### Role contract

`public.restaurant_staff.role` and `public.restaurant_invites.role` remain non-null text with validated constraints accepting exactly:

```text
owner, manager, staff, kitchen, cashier, waitstaff, attendance
```

`restaurant_staff.role` retains default `cashier`; invitations retain no default. `create_restaurant_invite(uuid,text,text)` validates the same seven values and retains its current owner/platform-admin restriction for `owner` and `manager`. `waitstaff` and `attendance` must not be erased, reclassified, or rejected by a reconciliation migration.

This preserves vocabulary, not an unapproved new capability matrix. Existing Production evidence authorizes `waitstaff` in operational order reads; it does not authorize a speculative expansion of all policy/function role lists to `attendance`.

### RLS and table ACL contract

The target remains RLS enabled and not forced for the nine captured boundary tables, with `postgres` ownership. The material policy target is the 16 fresh-captured, permissive, `authenticated` policies and their captured predicates.

The `restaurants` model is specifically:

- table ACL: `authenticated` retains SELECT and UPDATE;
- RLS UPDATE policy: `owners and platform admins update restaurants`, owner-or-platform-admin in both `USING` and `WITH CHECK`;
- obsolete-name result: `authenticated update allowed restaurants` remains absent.

ACL and RLS are two different enforcement layers. A future migration must not add the obsolete/broader name merely because the table ACL permits UPDATE.

### ACL and RPC contract

Preserve the narrow direct-table posture: authenticated SELECT on `orders` and `restaurant_staff`; authenticated SELECT/UPDATE on `restaurants`; no authenticated direct CRUD grant on `restaurant_invites`, payments, splits, or attendance tables absent a separately approved boundary. Preserve `orders_order_number_seq` privileges for `postgres` and `service_role`.

Keep kitchen-print function EXECUTE to `authenticated` and `postgres`, with no observed anon/PUBLIC/service-role grant. Preserve targeted SECURITY DEFINER signatures, ownership, and the evidence-backed authenticated/service-role function exposures unless a group below explicitly changes one.

### SECURITY DEFINER contract

All 15 targeted functions remain `postgres`-owned SECURITY DEFINER functions with their existing signatures and intended EXECUTE exposures. The three malformed configurations are repaired to the real two-schema setting:

```text
search_path=public, pg_temp
```

for `list_restaurant_team(uuid)`, `revoke_restaurant_invite(uuid)`, and `update_restaurant_order_status(uuid,uuid,text)`. The other 12 verified safe paths remain untouched. This is a targeted boundary, not a blanket rewrite of the historical 41-function finding.

### Kitchen-print contract

Preserve the five print columns, signatures, result types, staff/tenant authorization, retry threshold, lock/claim behavior, and authenticated EXECUTE exposure:

- `claim_kitchen_print_job(text) returns jsonb`
- `finish_kitchen_print_job(uuid,boolean,text) returns void`

Queue eligibility must use the live lowercase order vocabulary and a single shared definition:

```text
status IN ('new', 'preparing')
AND kitchen_printed_at IS NULL
```

The claim implementation must reference `public.tables`, not nonexistent `public.restaurant_tables`. The queue index must use the same status condition. Existing data is preserved; no status/data rewrite is authorized.

### Payment boundary

Preserve the `payments` ledger, split/payment/void records, existing current ten-argument `record_restaurant_payment` contract, and audit history. The dangerous legacy `record_restaurant_order_payment(uuid,uuid,text)` authenticated EXECUTE exposure is a verified defect and must be isolated in a later payment-specific group. A full fulfillment/financial/void/reporting state-machine redesign is **not** part of this batch because its compatibility and product decisions are not approved.

## 4. Forward migration plan

### Group 1 — Role vocabulary and policy/ACL contract reconciliation

| Field | Design |
| --- | --- |
| Proposed logical name | Role vocabulary and verified RLS/ACL contract reconciliation |
| Purpose | Make the canonical replay plus new forward history converge on the proven seven-role Production vocabulary and the exact targeted current RLS/ACL policy contract, without broadening role capabilities. |
| Objects touched | Role CHECK constraints on `restaurant_staff` and `restaurant_invites`; `create_restaurant_invite(uuid,text,text)` validation; the 16 captured policies; only ACLs that must be explicitly preserved for the target tables/functions. |
| Production contract preserved | Seven roles; `restaurants` owner/platform-admin UPDATE model; all captured policy predicates; RLS enabled/unforced; narrow direct-table/RPC-only boundaries. |
| Defect repaired | Canonical baseline/later-source role vocabulary lags Production; repository `011` proposes an obsolete broader restaurants UPDATE policy. |
| Preconditions | Verify each role constraint is either the approved canonical five-role form or the fresh seven-role Production form; no rows outside the seven values; RLS enabled/unforced; recognized policy/ACL fingerprints; absent obsolete restaurant policy; existing owner/platform-admin restaurant UPDATE policy when Production is the target. Unexpected policies/ACLs fail the controlled run rather than being silently dropped. |
| Postconditions | Both role checks and invite validation accept exactly seven values; all intended target policies have exact captured semantics; obsolete `authenticated update allowed restaurants` absent; authenticated table ACLs remain as specified in §3. |
| Dependencies | Batch 10 baseline; Batch 12 catalog evidence; precedes kitchen behavior and all role-dependent RPC tests. |
| Risk level | High — policy/ACL changes alter authorization. |
| Local verification | Clean approved baseline + group; assert constraints, function source/list, RLS flags, policy name/command/roles/qualifiers, and relation ACLs under authenticated test identities. |
| Production verification | Read-only preflight catalog assertions must match the recognized baseline before write; after release, repeat catalog assertions and tenant A/B role tests. |
| Rollback philosophy | Forward-only deterministic replacement of the exact policy/constraint/function surface; if wrong, a narrowly reviewed new forward migration restores the verified contract. No history or ledger rewrite. |
| Replay philosophy | **Strict precondition + deterministic replacement.** Allow the two explicitly recognized role-state forms only where needed for canonical/local versus Production convergence; do not use broad `IF EXISTS` policy churn to mask drift. |

#### Policy disposition within Group 1

| Table | Current captured policy | Action | Why |
| --- | --- | --- | --- |
| `restaurants` | `authenticated read allowed restaurants` SELECT | replace forward with same captured semantics | Required canonical convergence; preserve staff/platform-admin read behavior. |
| `restaurants` | `owners and platform admins update restaurants` UPDATE | replace forward with same captured semantics | Preserve the live restrictive model. |
| `restaurants` | `authenticated update allowed restaurants` | **leave absent / remove only if unexpectedly present and preflight authorizes it** | It is obsolete; do not recreate it. |
| `restaurant_staff` | `staff read allowed memberships`, `owners insert staff`, `owners update staff`, `owners delete staff` | replace forward with captured semantics | Preserve own-membership read and owner write boundary. |
| `orders` | `operational staff read orders`, `staff update orders` | replace forward with captured semantics; do not add table UPDATE | Preserve live role predicate (including waitstaff) while retaining dormant UPDATE policy behind absent ACL. |
| `payments` | `cash-handling staff read payments` | leave predicate unchanged in this group | Policy alone does not grant SELECT; payment role scope is deferred. |
| `split_bills` / `split_bill_items` | cash-handling SELECT policies | leave predicate unchanged in this group | Maintain private/RPC posture pending payment design. |
| `staff_shifts` / `staff_shift_breaks` | captured read/write policies | leave unchanged unless canonical convergence needs exact replacement | No role expansion or grant activation without attendance design. |
| `restaurant_invites` | no captured policy | leave absent | Preserve RPC-only direct-table posture. |

### Group 2 — Targeted SECURITY DEFINER search-path repair

| Field | Design |
| --- | --- |
| Proposed logical name | Targeted role/RLS SECURITY DEFINER path repair |
| Purpose | Correct the three fresh, live malformed quoted-comma `proconfig` values without changing bodies, signatures, owners, or EXECUTE contracts. |
| Objects touched | `list_restaurant_team(uuid)`, `revoke_restaurant_invite(uuid)`, `update_restaurant_order_status(uuid,uuid,text)`. |
| Production contract preserved | All three signatures, `postgres` ownership, SECURITY DEFINER=true, source bodies, volatility/result behavior, and captured EXECUTE grantees. |
| Defect repaired | `search_path="public, pg_temp"` represents one invalid quoted schema instead of two ordered schemas. |
| Preconditions | Exact function identity exists; owner is postgres; SECURITY DEFINER=true; source body checksum/text matches the fresh capture or a reviewed canonical equivalent; `proconfig` is exactly the known malformed representation; current EXECUTE ACL matches capture. |
| Postconditions | Each target has `search_path=public, pg_temp`; no target has a quoted-comma path; owner, signature, definer state, body behavior, and EXECUTE grantees remain unchanged. |
| Dependencies | Group 1 only insofar as its helper functions/policies must be stable; no dependency on the broader 41-function remediation. |
| Risk level | Medium/high — function configuration affects runtime resolution. |
| Local verification | Catalog assertions for `proconfig`, owner, `prosecdef`, function identity, and ACL; invoke only in isolated local test fixtures for team list, invite revoke, and status transition authorization. |
| Production verification | Read-only preflight exact signature/config/ACL assertions; post-release catalog assertion and controlled smoke tests under approved test tenant identities. |
| Rollback philosophy | A later forward `ALTER FUNCTION ... SET search_path` correction if an allowlisted function needs a different path; never rerun historical 038 logic. |
| Replay philosophy | **Strict precondition + deterministic configuration change.** Function replacement is not required if the configuration-only operation preserves the fresh body/signature/ACL fingerprint; if that precondition fails, stop and review rather than replacing unknown source. |

### Group 3 — Kitchen-print contract repair

| Field | Design |
| --- | --- |
| Proposed logical name | Kitchen-print claim and queue predicate reconciliation |
| Purpose | Repair the one functional queue boundary so the claim routine and its partial index agree with the validated `orders.status` constraint and actual tables relation. |
| Objects touched | `claim_kitchen_print_job(text)`; `orders_kitchen_print_queue_idx`; catalog assertions over `orders_status_check`, print columns, `finish_kitchen_print_job(uuid,boolean,text)`, and ACLs. |
| Production contract preserved | Print columns: attempts non-null integer default 0, timestamps/error nullability; claim/finish signatures and results; staff/tenant check; lock plus `SKIP LOCKED`; unprinted/retry/2-minute claim rules; finish success/failure behavior; authenticated+postgres EXECUTE only. |
| Defect repaired | Claim code uses `public.restaurant_tables` and uppercase `New`/`Preparing`; queue index also uses uppercase literals, neither compatible with live lower-case `orders_status_check`. |
| Preconditions | Both functions and all five columns exist with captured metadata; `orders_status_check` is validated and has exactly the captured ten-value lowercase set; index exists and is valid/ready/live with the known uppercase predicate; no expected row contains a status outside the constraint; exact function ACL/owner/definer/path fingerprints recognized. |
| Postconditions | Claim source references `public.tables`; function and index use the same lowercase queue condition `status IN ('new','preparing')`; index is valid/ready/live; signatures/ownership/definer settings/EXECUTE ACLs are unchanged; no data/status backfill occurs. |
| Dependencies | Group 1 role helpers/policies must be stable; Group 2 can run before or after but is logically independent. |
| Risk level | High — external printer behavior, locking, and production queue eligibility. |
| Local verification | Build baseline + groups in clean isolated Supabase; construct tenant A/B and orders in all ten statuses; test query plan/predicate membership; test competing claimers, stale claims, attempt threshold, finish success, finish failure, foreign-tenant denial, and completion exclusion. |
| Production verification | Read-only preflight confirms exact defective baseline; post-release catalog assertion plus approved non-destructive controlled printer smoke test. No blanket data replay. |
| Rollback philosophy | Forward replacement of the exact function/index only. If a defect is found, use another forward compatible function/index change; retain print columns and operational evidence. |
| Replay philosophy | **Strict precondition + deterministic replacement.** Do not use an index-only `IF NOT EXISTS` operation: it would leave the function broken and can hide a differently defined index. |

Correcting only the index remains broken because `claim_kitchen_print_job(text)` independently filters uppercase statuses and joins `public.restaurant_tables`. A lowercase eligible order would be indexed after an index-only fix but still cannot be correctly claimed by the live function.

### Group 4 — Payment compatibility and least-privilege decision gate

| Field | Design |
| --- | --- |
| Proposed logical name | Legacy payment RPC containment and financial read-boundary reconciliation |
| Purpose | Separate the immediately verified legacy bypass from the larger, unapproved financial state redesign. |
| Objects touched | Legacy `record_restaurant_order_payment(uuid,uuid,text)` EXECUTE ACL and, only if approved, a compatibility wrapper; payment read boundary/policy/ACL or narrow read RPC as selected by product/security review. |
| Production contract preserved | `payments`/split/void/audit records; current ten-argument payment RPC signature/ACL; no anonymous payment access; legitimate cash-handling flow. |
| Defect repaired | Legacy authenticated RPC completes orders without amount/ledger row; payments direct reads 403 despite a policy, while policy includes roles broader than a confirmed financial-read model. |
| Preconditions | Client/external caller telemetry and release-owner decision for legacy signature; current current-RPC and payment catalog/ACL fingerprints; product-approved financial role/read model; explicit decision whether a compatibility wrapper records the exact remaining balance or legacy execution is revoked. |
| Postconditions | Legacy signature is either no longer executable by authenticated callers or is strictly ledger-backed; no bypass can create completed/unpaid/no-ledger state; payment reads obey an approved tenant-scoped least-privilege contract; anon remains denied. |
| Dependencies | Group 1 role vocabulary/ACL baseline; separate financial-state decision for any status/reporting redesign. |
| Risk level | Critical. |
| Local verification | Payment partial/full/idempotent retry/concurrency/overpay/void cases; legacy caller denial or ledger-backed compatibility; tenant A/B and kitchen denial; query/read results match approved role matrix. |
| Production verification | Read-only preflight, backup/recovery confirmation, approved maintenance/compatibility plan, post-release ledger-versus-order aggregate assertions and client error monitoring. |
| Rollback philosophy | Forward-only restoration of a narrowly controlled compatibility path if required; never delete ledger/audit data or rewrite historical payment statuses automatically. |
| Replay philosophy | **Blocked pending explicit compatibility and financial-read decisions.** Once decided, use strict preconditions and deterministic replacement, not broad grants/revokes. |

This group is part of the strategy but **not ready for exact migration SQL**. The evidence proves the defect and current signatures/ACLs; it does not decide the permitted reader roles/columns nor whether active clients require a ledger-backed compatibility route. It also does not approve a fulfillment/payment/void/reporting redesign.

### Group 5 — Approved inventory and release-control canonicalization

| Field | Design |
| --- | --- |
| Proposed logical name | Applied-history/catalog manifest and release-control approval |
| Purpose | Move from a frozen, `reconciliation-blocked` evidence inventory to a reviewed authoritative control plane without rewriting history. |
| Objects touched | Future approved manifest/control documents and release process only; no Production database object and no historic ledger row. |
| Production contract preserved | All historical evidence blobs, live data, current proven catalog contracts, and explicit uncertainty. |
| Defect repaired | Unsafe ambiguity from mutated `011`, duplicate legacy `022`, and untracked/later migration evidence being mistaken for approved history. |
| Preconditions | Immutable hashes preserved; separate object/effect identity for each `022` result; unique proposed forward versions; catalog/effect assertions for selected groups; review approval. |
| Postconditions | The inventory can be advanced only through an approved manifest that labels provenance confidence, observed environment effect, and new forward migration identity; historical anomalies remain visible rather than “repaired.” |
| Dependencies | Groups 1–4 candidate SQL must be separately approved and replay-tested before their effects are added to an approved manifest. |
| Risk level | Critical release governance. |
| Local verification | Verify frozen hashes, no duplicate new versions, candidate full replay list, lint, and catalog assertion manifest. |
| Production verification | Read-only ledger/catalog preflight only; explicit release authorization. |
| Rollback philosophy | Correct documentation/control decisions forward; never alter a historical file or hosted migration ledger. |
| Replay philosophy | Not a database migration. It is a release gate, not an idempotent SQL operation. |

## 5. Preservation matrix

| Object / surface | Contract to preserve | Why | Responsible group | Verification method |
| --- | --- | --- | --- | --- |
| Staff and invite role checks | Exact seven roles; staff default cashier | Verified valid Production data contract; prevents stranding memberships/invites | 1 | Constraints, existing-row preflight, invite RPC tests |
| `create_restaurant_invite` | Seven-value validation and owner/admin privileged-role guard | Fresh source evidence; governs role admission | 1 | Function source/signature/ACL and role acceptance tests |
| `restaurants` UPDATE | Authenticated table UPDATE plus owner/platform-admin RLS predicate | ACL does not supersede RLS; current policy is more restrictive than obsolete 011 | 1 | ACL + policy qualifier assertions; tenant/role UPDATE tests |
| `restaurant_staff` | Own membership read and owner-managed writes | Verified membership privacy/management boundary | 1 | RLS policy and role tests |
| `orders` | Authenticated SELECT only; operational read includes waitstaff; dormant UPDATE remains unactivated | Preserve direct-write denial and existing reader contract | 1 | Relation ACL + RLS intersection tests |
| RPC/private tables | No direct auth CRUD on invites, payments, splits, attendance | Prevent accidental API exposure | 1 / 4 | ACL assertions and attempted direct API access tests |
| Targeted 15 definers | Identity, postgres owner, SECURITY DEFINER, captured EXECUTE allowlist | Tenant/RPC contracts depend on them | 2 (three changes) / 1 (ACL assertions) | `pg_proc`, `proconfig`, `proacl`, signature assertions |
| Kitchen print columns and finish RPC | Column metadata; finish signature/result; authenticated+postgres EXECUTE | External printer compatibility and existing job history | 3 | Column/function/ACL catalog assertions and finish behavior tests |
| Kitchen queue operational semantics | Staff/tenant validation, retries, locks, stale-claim timeout | Functional printer behavior must survive repair | 3 | Concurrency, stale-claim, cross-tenant regression suite |
| Payment ledger/current RPC/audit | Existing records and ten-argument recorder contract | Financial evidence must never be destructively rewritten | 4 | Ledger integrity and idempotency/void tests |
| Historical files/effects | `011`, both `022` effects, all frozen blobs | Historical provenance is unresolved; rewriting would fabricate it | 5 | Hash/effect manifest checks |

## 6. Defect-remediation matrix

| Object | Current defect | Desired state | Group | Precondition | Postcondition | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Canonical role model / later sources | Canonical/later role lists can omit waitstaff/attendance | Both constraints and invite validation allow exactly seven live roles | 1 | Recognized five/seven constraint state, no out-of-vocabulary data | Seven-role checks and validation | High |
| `011` legacy restaurants policy intent | Old source defines manager-inclusive obsolete policy; live named policy is absent | Keep owner/platform-admin live policy, no obsolete policy | 1 | Fresh policy and ACL fingerprint | Exact owner/platform-admin UPDATE semantics | High |
| Three targeted SECURITY DEFINER functions | Quoted-comma search path resolves as one invalid schema | Actual two-schema `public, pg_temp` path | 2 | Exact signature/body/owner/ACL and malformed config | Safe explicit path, all other metadata stable | Medium/high |
| Kitchen claim function | Nonexistent table and uppercase statuses | `public.tables`; lowercase `new`,`preparing` aligned with constraint | 3 | Captured source/index/constraint baseline | Claim behavior can find eligible valid orders | High |
| Kitchen queue index | Uppercase predicate never matches valid lowercase statuses | Same lowercase condition as claim logic; valid/ready/live | 3 | Exact defective predicate | Eligible lowercase new/preparing rows satisfy predicate | High |
| Legacy payment RPC | Authenticated call can bypass amount/ledger | Revoked or strictly ledger-backed only after compatibility decision | 4 | Telemetry and approved compatibility policy | No unledgered completed payment path | Critical |
| Payment direct reads | 403 plus overbroad dormant policy | Approved least-privilege tenant financial-read boundary | 4 | Product/security decision and exact read surface | Correct allowed roles read own-tenant data; anon/kitchen denied if selected | Critical |
| Migration controls | Mutated 011, duplicate 022, untracked intent can be mistaken for history | Approved manifest preserves ambiguity and appends only unique forward changes | 5 | Frozen hashes / review | Inventory no longer relies on filename provenance | Critical |

## 7. Historical anomalies and repository-later intent

### Mutated `011`

The immutable historical `011` hash (`45415f2c…`) and dirty working-tree variant (`dd5b3138…`) are both evidence, not an implementation target. The later source’s manager-inclusive `authenticated update allowed restaurants` conflicts with the fresh Production owner/platform-admin policy. Group 1 uses the fresh Production contract and a new forward identity; it does not edit either 011 representation or repair a ledger row.

### Duplicate legacy `022`

`022_exclude_test_orders_from_reporting.sql` and `022_staff_presence.sql` represent distinct current effects with one legacy version. The design does not rename, merge, delete, or select a winner. Their valid effects remain manifest entries by object/effect identity. If a future change is needed, it receives a new unique forward version; Batch 13 does not include a reporting or presence migration because neither is required to repair the presently scoped defects.

### Later untracked migration intent

Later source indicates potentially valid product evolution (ledger/splits, test-order exclusion, staff presence, attendance) and defects/supersession (038 paths, legacy payment survivor). It is not canonical. Group 4 uses only confirmed live payment signatures/ACL exposure and deliberately defers broader state-machine work. Group 2 does not import 038’s dynamic rewrite; it corrects only three newly verified target paths. All other later migration intent remains frozen pending separate evidence/approval.

## 8. Local implementation verification plan

The future implementation batch must perform this sequence in an isolated local Supabase environment only:

1. **Start clean.** Use a clean local Supabase start/reset approved for the implementation environment; never link, push, reset, repair, or execute against hosted Production.
2. **Replay the approved base.** Apply exactly the Batch 10 canonical 14-migration baseline followed by the newly created, unique forward migrations in dependency order. Do not replay the dirty 44-file directory as though it were history.
3. **Verify local migration identity.** Run `supabase migration list --local`; prove the expected canonical entries plus each new unique forward version and no duplicate new version.
4. **Lint.** Run `supabase db lint --local --level warning`; resolve new warnings or document approved pre-existing baseline behavior.
5. **Catalog assertions.** Assert exact role constraint text/accepted roles; RLS enabled/unforced; policy names, commands, roles, `USING`/`WITH CHECK`; table/sequence/function ACLs; function identity/owner/definer/proconfig; print columns/status constraint/index predicate and state.
6. **Role/function tests.** Test all seven roles at invitation/membership boundaries. Prove `waitstaff` can retain the captured order-read behavior; prove `attendance` is accepted but gains no new capability absent an explicit approved policy.
7. **RLS/ACL tests.** Use tenant A/B and authenticated role fixtures. Prove restaurants UPDATE is owner/platform-admin-only even though the table ACL grants UPDATE; direct orders write remains denied; invite/payment/split/attendance private boundaries remain intact.
8. **SECURITY DEFINER tests.** For the three repaired signatures, assert path exactly and exercise authorized/unauthorized team-list, revoke, and order-status flows. Assert signature, owner, execution grantees, and result shape are unchanged.
9. **Kitchen-print regression tests.** Prove a lowercase `new` and `preparing` order is index-eligible and claimable once; all other eight valid statuses are ineligible; simultaneous claims return at most one claimant; stale claims/retries behave as currently contracted; foreign tenants and nonstaff are denied; finish success/failure preserves captured semantics.
10. **Payment tests only if Group 4 is approved.** Prove legacy denial or ledger-backed compatibility, full/partial/retry/concurrency/overpay/void handling, role/tenant data visibility, and no completed payment state without a ledger entry.
11. **Manifest/release tests.** Run the repository integrity/release-gate tests only once the approved manifest workflow is implemented; they must verify frozen historical hashes and candidate catalog assertions rather than bless the old untracked history.

## 9. Production preflight and release gate

No Production execution is authorized by this document. Before any future Production write, all of the following must be true:

1. Every candidate migration SQL file is independently reviewed for scope, privilege effects, function replacement/configuration behavior, locking, and non-destructive forward recovery.
2. A clean local full approved-baseline-plus-forward replay, migration list, lint, and all targeted tests in §8 pass.
3. A read-only Production preflight confirms every strict precondition: expected function signatures/body/config/ownership/ACLs, role constraints, policy predicates, RLS flags, status check, queue-index predicate/state, and recognized data preconditions.
4. For Group 3, a release owner confirms printer-agent compatibility and a controlled post-release smoke-test plan; existing print data is preserved.
5. For Group 4, client/external usage telemetry, financial role/read decision, backup/recovery posture, ledger aggregate baseline, and explicit compatibility decision are approved.
6. Historical hash/inventory controls remain blocked until a reviewed manifest establishes what is approved; no `migration repair`, retroactive ledger manipulation, or historical edit is allowed.
7. Staging (if used) is separately fingerprinted and tested; no Production parity is assumed from a filename or version.
8. A named human release owner grants explicit authorization after all preflight assertions and rollback/forward-fix plans are accepted.

## 10. Remaining blockers

| Category | Remaining blocker |
| --- | --- |
| Blocks writing migration SQL | **Group 4 only:** product/security approval of payment-reader roles/columns and legacy-client compatibility strategy. The remaining Groups 1–3 have no material fresh Production evidence gap, but implementation must still use exact assertions from this design. |
| Blocks local execution | Candidate migration SQL does not yet exist; isolated implementation environment and test fixtures must be prepared; a full forward manifest has not been approved. |
| Blocks Production release | All groups: independent review, clean local replay/lint/tests, read-only Production preflight, staging/operational validation where applicable, release authorization, and approved inventory control. Group 4 additionally needs financial compatibility/recovery approval. |
| Does not block Groups 1–3 design | The broader historical count of 41 SECURITY DEFINER path defects, tenant resolver adoption, reporting/presence evolution, and untracked-file provenance. These are explicitly outside the current targeted forward set and cannot be silently bundled. |

No material Production evidence gap remains for the Group 1–3 contract design. The payment blocker is an approval/compatibility decision, not missing catalog evidence; it prevents exact payment SQL, not the completed forward-only strategy.

## 11. Recommended Batch 14

**P0-01D Batch 14 — Implement and locally validate Groups 1–3 only (role/RLS/ACL contract reconciliation, the three SECURITY DEFINER path fixes, and kitchen-print repair) as uniquely timestamped forward migrations.**

Batch 14 must first re-read this design, choose new unique versions from the actual migration directory, create only the approved forward SQL and targeted local tests/assertions, and run the isolated verification sequence. It must not implement Group 4 payment changes, modify historical files, connect to Production, or deploy.

## Validation and non-mutation statement

- Batch 13 created this design document only; it did not create migration SQL, change a database, connect to Production, or alter migration history.
- Build verification: **NOT APPLICABLE TO BATCH 13 DESIGN DOCUMENTATION**.
- The required `git diff --check` and repository-scope verification are recorded after document creation.
