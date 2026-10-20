# Mainline migration compatibility

Validated 2026-10-20 against main `8d0a6c1b6925630389aed145f5f46bd595a22613` and printing source `1182d3f`.

## Candidate and prerequisites

The canonical `supabase/migrations` directory contains 24 SQL files. All remain byte-equivalent after newline normalization; their exact filenames and SHA-256 values are pinned in `supabase/kitchen-print-mainline-baseline.json`. No historical migration or existing security policy was edited.

The only new SQL is the unpromoted, forward-only candidate `supabase/kitchen-print-candidates/20261020112017_kitchen_printing_mainline.sql`. Its timestamp was created with Supabase CLI. It composes the seven reviewed PR18 candidate stages into one atomic transaction; source hashes and adaptations are recorded in `supabase/kitchen-print-mainline-provenance.json`. Those seven old files must not also be applied. This candidate is for a database at the verified main baseline, not a database that already applied PR18 candidates.

| Contract | Main baseline | Integration |
| --- | --- | --- |
| Tenant order key | Migration018 already supplies UNIQUE(restaurant_id,id) | Reuse; no duplicate historical prerequisite |
| Order/menu/table fields | Current canonical main fields satisfy immutable ticket creation | Reuse current contracts; no snapshot order/payment/RLS replacements |
| Legacy print functions | Absent on fresh main | Rename only if present; missing legacy consumer returns LEGACY_PRINTING_UNAVAILABLE |
| Legacy claimed/printed markers | Absent on fresh main | Optional JSON field reads preserve compatibility without requiring old columns |
| is_test_order | Absent on fresh main | Missing flag means false; present legacy flag still respected |
| Queue | Existing printing design's single jobs queue and immutable snapshots | No parallel browser/order scanner |
| Roles and RLS | Main helpers and membership boundaries retained | Nine printing tables deny direct client access; validated RPCs recheck current identity, tenant, role and device secret |
| Financial/Kitchen workflow | Canonical main RPCs and lifecycle remain authoritative | Printing does not change order/item/payment records |
| Rollback | History must remain auditable | Disable dispatch, revoke agents, reconcile uncertainty; retain protocol2 fencing and data |

## Executed evidence

- Supabase CLI2.121.0 replayed all24 canonical migrations plus the new atomic candidate in the dedicated local project `aveniq-kitchen-mainline-20261020` (API58031). No old default-ACL workaround was required.
- `node tests/test-kitchen-mainline-compatibility.mjs` created a separate disposable local main24+candidate stack. All36 core Auth/HTTP/QR/Kitchen/canonical payment/bootstrap checks and all3 printing SQL suites passed. It first failed when printing was absent, then passed with the explicit candidate hook.
- Table rename, staff management, staff invitation and staff transport boundary runtime suites each replayed main24+candidate into their own local stack and passed. Repeated core checks are not counted as unique feature cases.
- Real local Auth/PostgREST tests passed role/tenant/direct-table denials, idempotent enqueue, device authentication/revocation, routing, uncertainty and concurrent claims.
- Independent Security runtime checks verified RLS, denied internal helper execution, current-role changes and device/tenant failures. See the security review.

The optional local integration-gate hook is enabled only by `AVENIQ_KITCHEN_PRINT_CANDIDATES=1`; the normal main baseline path is unchanged. Materialization verifies the pinned canonical hash set and rejects an existing target. Setup refuses occupied ports and existing task destinations. It never resets another Docker project.

## Promotion boundary

No candidate was copied into the canonical migration chain or applied to a hosted database. Production was not inspected. A future authorized release must verify its target migration inventory and any already-applied printing versions, review promotion once, and test that exact upgrade path. The current result establishes fresh canonical-main compatibility, not undocumented hosted schema compatibility. Do not apply this composed candidate on top of the seven PR18 source candidates. Use a separately reviewed forward reconciliation if a future target already contains them.
