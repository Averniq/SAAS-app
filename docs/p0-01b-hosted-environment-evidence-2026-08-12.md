# P0-01B hosted environment evidence report — 2026-08-12

## Closure reassessment

**P0-01B result: COMPLETE.** The evidence gate has established enough authoritative current Production state to begin a separately approved, forward-only P0-01C reconciliation/planning task. It has **not** approved any database migration deployment.

This reassessment ingests manually captured Production SQL Editor evidence only. This workstation did not connect to Production; no Production object, ledger entry, migration, or application data was changed.

| Decision | Result |
| --- | --- |
| Safe to begin separately approved P0-01C planning/reconciliation | **YES** |
| Safe to deploy database migrations | **NO** |
| Further Production SQL required before P0-01C may begin | **NO** |
| Further Production SQL may be needed during P0-01C before a specific forward migration is designed | **YES, targeted only** |

## Authoritative Production evidence

### Migration ledger

`supabase_migrations.schema_migrations` has columns `version`, `statements`, `name`, `created_by`, `idempotency_key`, and `rollback`. The following current `version`/`name` entries were captured:

| Version | Name |
| --- | --- |
| `20260716114639` | `payment_records` |
| `20260716114803` | `seed_sake_street_test_tenant` |
| `20260716114827` | `seed_sake_street_categories` |
| `20260716115053` | `record_restaurant_order_payment` |
| `20260716122305` | `set_sake_street_brand_assets` |
| `20260716124833` | `seed_full_sake_street_menu` |
| `20260716125013` | `complete_sake_street_menu_categories` |
| `20260721122201` | `fix_staff_invite_entitlement_trigger` |
| `20260721122354` | `harden_entitlement_trigger_permissions` |
| `20260721124450` | `menu_image_uploads` |
| `20260725065342` | `qualify_pgcrypto_attendance` |
| `20260725065353` | `fix_pin_rate_limit_window_column` |
| `20260805132642` | `self_service_trial_recovery_and_limits` |
| `20260805134105` | `validate_onboarding_timezone` |

Statements and rollback bodies were intentionally not captured. The ledger proves current recorded versions/names, not historical SQL provenance.

### Hosted-only tenancy objects

`public.get_public_tenant_context(text)` is verified live: `p_hostname text` → `jsonb`; `plpgsql`; `STABLE`; `SECURITY DEFINER`; owner `postgres`; `search_path = public, pg_temp`. Its complete body was manually inspected: it normalizes hostnames, explicitly references `public.tenant_domains`, requires an eligible active restaurant with ordering enabled, returns a JSONB `venues` array, and raises `TENANT_DOMAIN_NOT_FOUND` or `TENANT_VENUE_NOT_FOUND` as appropriate. No obvious secret or sensitive literal was observed.

Exact live EXECUTE ACLs are: `anon`, `authenticated`, and `postgres` each have non-grantable `EXECUTE`. This is an intentional public tenant-resolution surface unless a later P0-01C design review finds a concrete mismatch with the verified body or application contract.

`public.tenant_domains` is verified live with `hostname text NOT NULL`, nullable `organization_id uuid` and `restaurant_id uuid`, and `created_at timestamptz NOT NULL DEFAULT now()`. It has a hostname primary key, FKs to `organizations(id)` and `restaurants(id)`, scope-exclusivity and hostname-normalization/format checks, and a valid unique primary index. RLS is enabled and not forced; no explicit policies or non-internal triggers were returned. Captured ACL evidence shows full table privileges with grant option for `postgres`; `service_role` has at least `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE`. The service-role evidence is intentionally not claimed exhaustive.

The targeted `pg_depend` capture had no direct function-to-relation row for the resolver and `tenant_domains`. **No direct function-to-relation dependency was recorded by the targeted `pg_depend` capture; the verified PL/pgSQL function definition explicitly references `public.tenant_domains`.** This is expected to be an incomplete catalog representation, not evidence of no logical dependency.

### `011` and duplicate `022` current state

- All 15 policy names extracted directly from frozen `HEAD` versus working-tree `011` were checked in Production. Fourteen currently exist; only `public.restaurants` / `authenticated update allowed restaurants` is absent.
- Both former duplicate-`022` effects are present: `reporting.order_facts` excludes test orders, and `restaurant_staff.last_seen_at`, `restaurant_staff_presence_idx`, and `touch_staff_presence(uuid)` exist.

These are current-state facts only. Neither result establishes historical deployment provenance.

### Additional captured catalog evidence

Machine-readable split captures exist for relations, columns, constraints, indexes, RLS state, RLS policies, and schema privileges. Extensions verified: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `unaccent 1.1`, and `uuid-ossp 1.1`.

## Security assessment: public SECURITY DEFINER resolver

No confirmed defect is established from the captured evidence. The resolver is intentionally executable by `anon` and `authenticated`, while its verified `SECURITY DEFINER` body limits the returned surface to public tenant-resolution data and uses `search_path = public, pg_temp`, avoiding caller-controlled search-path resolution. Its `tenant_domains` dependency is RLS-protected with no direct public policy; privileged access is confined to the reviewed definer boundary.

This is not a blanket approval of all public definers. P0-01C must preserve this observed contract unless it deliberately replaces it with a reviewed forward-only alternative. No change is made here.

## Evidence gaps classified

### HARD BLOCKER

**None before starting P0-01C.** Every previously missing item either does not affect the decision to start controlled reconciliation planning, or is needed only before a particular migration is designed/deployed. Therefore there is no missing item for which all of the following can be stated: a concrete blocked P0-01C decision, a concrete failure mode from starting planning now, and a smallest necessary pre-planning query.

### RECONCILIATION INPUT

- Exact catalog details for an object that P0-01C proposes to alter: collect only that object’s current definition, ACL/RLS state, constraints, indexes, triggers, and dependencies before designing its forward migration. This protects against overwriting a live-only refinement.
- Raw, access-controlled `get_public_tenant_context(text)` source if P0-01C proposes to reproduce, replace, or change that function. The behavioural/manual review is sufficient to begin planning, but exact source is required before source-level modification.
- Local clean replay and local/staging/Production parity for the exact proposed forward migration set. These are implementation/release inputs, not prerequisites to open the reconciliation task.
- Detailed current-state policy definitions if P0-01C decides that one of the 15 `011` policy outcomes needs correction. The 14/15 existence result is enough to scope the investigation; expressions/ACLs must be captured before a policy-changing migration is written.

### DOCUMENTED UNCERTAINTY

- Which historical SQL blob actually produced the current `011` policy state.
- Which historical duplicate-`022` file, manual SQL application, or missing ledger row produced each current effect.
- The exact deployment provenance of the 28 previously untracked migrations and other ledger/source drift.

These facts may be unrecoverable. P0-01C handles them with frozen historical evidence, explicit current Production baseline documentation, unique timestamped forward migrations, and no ledger repair or historical mutation.

### NON-BLOCKING / NICE-TO-HAVE

- A single all-in-one Production catalog JSON artifact. The SQL Editor froze while rendering/copying it; split machine-readable captures cover the material catalog surfaces already obtained.
- Exhaustive service-role ACL rows for `tenant_domains`, absent a P0-01C change touching that ACL boundary.
- Exact constraint names/text and all unrelated function/grant/dependency metadata, unless the corresponding object is selected for a P0-01C forward change.

## Explicit determinations

| Condition | Blocks starting P0-01C? | Treatment |
| --- | --- | --- |
| `011` historical provenance | **No** | Documented uncertainty; inspect current policy definitions only if a correction is proposed. |
| Duplicate `022` provenance | **No** | Current effects are verified; use unique forward identities if changes are needed. |
| 28 previously untracked migrations | **No** | Frozen inventory is a controlled input; provenance remains documented uncertainty. |
| Clean replay | **No** | Required inside P0-01C before any deployment, not before planning begins. |
| Full catalog manifest | **No** | Split captures plus targeted live evidence are sufficient to plan; capture the smallest relevant delta before each proposed change. |

Clean replay is a release/implementation gate because it tests the actual candidate migration sequence and its resulting schema. Requiring it before planning would conflate analysis with deployment approval. P0-01C may now investigate and draft a forward-only reconciliation plan; it may not deploy any migration until isolated replay, relevant catalog comparison, security review, and the existing release gate are satisfied.

## Exact recommended next task

**P0-01C — forward-only migration reconciliation planning (separately approved).** Establish an explicit current-Production baseline from this evidence; map each repository migration to one of: preserved historical evidence, confirmed current effect, unresolved provenance, or proposed unique timestamp forward correction. For each proposed correction, collect only the narrow live catalog metadata needed to design it. Do not edit historical files, repair the ledger, push, reset, or deploy. Make clean replay and release-gate validation mandatory before proposing deployment.

## Evidence files

- `supabase/migration-inventory.json` — frozen repository SQL evidence.
- `supabase/P0-01B_HOSTED_READONLY_CAPTURE.sql` — multi-result, read-only capture helper.
- `supabase/P0-01B_SUPABASE_EDITOR_CAPTURE.sql` — single-row JSONB, catalog-only SQL Editor helper; raw function bodies are intentionally excluded.
- `docs/p0-01b-hosted-environment-evidence-2026-08-12.md` — this closure reassessment.
