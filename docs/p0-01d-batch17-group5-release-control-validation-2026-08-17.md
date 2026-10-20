# P0-01D Batch 17 — Group 5 release-control validation

## Verdict

**PASS — GROUP 5 RELEASE CONTROL CANONICALIZED AND LOCALLY VALIDATED**

This batch introduced no SQL migration and made no hosted connection, deployment, ledger repair, commit, or push. It separates an approved local replay/deployment candidate from immutable repository evidence that is deliberately not deployable.

## Control-plane artifacts

- `supabase/catalog-manifest.json` is the approved, ordered 18-entry canonical chain.
- `supabase/catalog-manifest.sha256` protects the normalized-LF UTF-8 manifest hash: `005eb6697ee6199aeced137bd42d336c8f6d98eda624d4aba3e31785d7fca9ff`.
- `supabase/migration-inventory.json` remains a 44-entry, `reconciliation-blocked`, frozen historical evidence register. It is explicitly noncanonical.
- `scripts/materialize-canonical-migration-workspace.mjs` creates an isolated migration directory from the manifest only. The repository-wide migration directory must never be reset or pushed directly.

## Approved canonical migration chain

| Order | Version | Filename | SHA-256 | Provenance |
| ---: | --- | --- | --- | --- |
| 1 | 001 | `001_initial_schema.sql` | `516c883ac75bd806cf6dbe22a50f811df0d9d49c28149459cbf344ab41d36fa8` | approved baseline replay |
| 2 | 002 | `002_platform_admin.sql` | `3d46078eaafecf7144603671ed6a6e6a4bb479cc962e7c5192edf1a2a1146dea` | approved baseline replay |
| 3 | 003 | `003_restaurant_staff_invites.sql` | `0ef8efc03a8ffcc68ab5a750aa4d7d8513081430617d2d1bc43866227c55240d` | approved baseline replay |
| 4 | 004 | `004_role_hardening.sql` | `4e187f41c38d9bef1419c4fb8849e65b86b6e77782f12ed5cf261a052c7b27ad` | approved baseline replay |
| 5 | 005 | `005_all_round_staff.sql` | `acec1d91b1ad6f232b64863fc0dd458cf3cb96b6f7e39a3d9a298faad97f3fe0` | approved baseline replay |
| 6 | 006 | `006_function_permission_hardening.sql` | `00236c27084a9a48d3fe8ea483268c4e0b2f1e8ef63209ebd4f9b2d249638803` | approved baseline replay |
| 7 | 007 | `007_explicit_data_api_grants.sql` | `aff6ad54b657888a2ca5582478209805ab86ff113b0b030cd280041845c13b4c` | approved baseline replay |
| 8 | 008 | `008_authoritative_option_pricing.sql` | `695e60406d54bdca547a75497ba8ce81100269d10e5e0b16fdaafa9c3a974321` | approved baseline replay |
| 9 | 009 | `009_reporting_layer.sql` | `e2b0637e600933aecdaefe009486a035b9134b04d8929bfeaee9ee14de795d27` | approved baseline replay |
| 10 | 010 | `010_advisor_index_rls_tuning.sql` | `6d39a195dac68c579c923c0aa4f57517276e9ff3c261ef26be5580890bf1479c` | approved baseline replay |
| 11 | 014 | `014_payment_records.sql` | `69fbefaa75d0d5ae1c0a954872a72dfd2b90ebc3f3505224dcc74abed5efc918` | approved baseline replay |
| 12 | 016 | `016_seed_sake_street_test_tenant.sql` | `13343b6d5a2f6f8cbaf05a100b9a9d8cedc96883f48d0b3980fa76c363565c80` | approved baseline replay |
| 13 | 017 | `017_seed_sake_street_categories.sql` | `fbb7027cdb6c03fb1f5d085b2b1d20d53855ad8d16196445f7383bd9c306fd9b` | approved baseline replay |
| 14 | 018 | `018_record_restaurant_order_payment.sql` | `c134a858d2a2635bb1e9d283f531addf0c7a8a31af9b8c7aead4a16dc301d25a` | approved baseline replay |
| 15 | 20260816150000 | `20260816150000_reconcile_role_rls_acl_contract.sql` | `c82482e2f06dc7630e184609399bd2148d9103add489667ad9f3cb1d7b2d74ae` | Batch 14 Group 1 forward |
| 16 | 20260816150100 | `20260816150100_repair_targeted_security_definer_paths.sql` | `0eacd529912329a44763ba86efff7ff8506525b2ca819eb77428f4c6cd755021` | Batch 14 Group 2 forward |
| 17 | 20260816150200 | `20260816150200_repair_kitchen_print_contract.sql` | `f391442af105ac84d36e9a61579e99ff4cd281aa95d2250170735ecaabddb883` | Batch 14 Group 3 forward |
| 18 | 20260817055036 | `20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql` | `27efd5b9ec5b1fdc91fcd1bb2f7dfeae9090a2a3fa86b061195e6f6bb91292f8` | Batch 15A forward |

## Historical evidence treatment

The mutated `011` remains frozen evidence with both the original immutable and observed working-tree hashes, and is excluded from the canonical chain. The two former `022` files remain two distinct noncanonical identities: reporting test-order exclusion and restaurant-staff presence. Both effects are documented with unresolved provenance; neither is represented as an approved replay migration. The 28 later untracked evidence entries remain explicitly excluded and unresolved. No Git provenance was fabricated.

## Validation

Static validation passed:

- `node scripts/test-canonical-release-control.mjs`
- `node scripts/test-migration-integrity.mjs`
- `node scripts/test-migration-release-gate.mjs`

The release control fails closed when a fixture changes an approved hash, removes an entry, adds an unapproved entry, duplicates a version, reorders entries, substitutes historical SQL, promotes historical evidence, or changes manifest approval/source metadata. The negative fixture recomputes its manifest checksum after each metadata mutation. A source-reviewed fixed 18-entry filename/version/hash allowlist is the independent trust anchor, so semantic validation—not only checksum mismatch—rejects the invalid state. The materializer invokes that validator before copying any SQL.

A new rollback-safe catalog assertion verifies the approved Group 1 role/RLS/ACL and restaurants UPDATE-policy contracts; Group 2 target SECURITY DEFINER paths and EXECUTE ACLs; and Group 3/15A lowercase queue, claim-token, finish-signature, and RPC ACL contract. Batch 14 and Batch 15A assertions were also rerun.

Fresh isolated WSL/Docker replay used only a materialized 18-file manifest workspace under `/tmp/p0-01d-b17-work`, with hosted credential variables cleared. `supabase db reset --local --no-seed` applied exactly the listed 18 migrations. `supabase migration list --local` contained exactly those 18 versions. `supabase db lint --local --level warning` returned `No schema errors found`.

Node regressions passed: `tests/test-critical-business-rules.mjs`, `tests/test-critical-server-guards.mjs`, `tests/test-order-integrity.mjs`, and `tests/test-kitchen-void-contract.mjs`. `git diff --check` passed.

## Future hosted read-only preflight

Before any deployment authorization, a named release owner must obtain a read-only ledger fingerprint for the target environment and compare it against the approved manifest without mapping legacy names to provenance. Capture relevant catalog fingerprints: Group 1 role constraints, RLS flags/policy inventory, and table/function ACLs; Group 2 function identities, owners, SECURITY DEFINER settings, search paths, and EXECUTE grantees; Group 3/15A print columns, queue-index predicate/validity, claim/finish signatures, ACLs, and token fencing columns. Record both distinct `022` effects separately as historical/effect evidence, not duplicate deployable versions. Then rerun the isolated replay, lint, catalog assertions, staged role/tenant checks, printer-agent smoke test, and obtain explicit release authorization.

## Files changed

- `supabase/catalog-manifest.json`
- `supabase/catalog-manifest.sha256`
- `supabase/migration-inventory.json`
- `scripts/test-canonical-release-control.mjs`
- `scripts/test-canonical-release-control-negative.mjs`
- `scripts/test-migration-integrity.mjs`
- `scripts/test-migration-release-gate.mjs`
- `scripts/materialize-canonical-migration-workspace.mjs`
- `scripts/p0-01d-batch17-catalog-effect-assertions.sql`
- `docs/p0-01d-batch17-group5-release-control-validation-2026-08-17.md`

**BATCH 17 PASS — P0-01D GROUP 5 RELEASE-CONTROL CANONICALIZATION IMPLEMENTED AND VALIDATED**
