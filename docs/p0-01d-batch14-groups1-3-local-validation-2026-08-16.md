# P0-01D Batch 14 — Groups 1–3 Local Implementation and Validation

## 1. Final status

**PASS — GROUPS 1–3 IMPLEMENTED AND LOCALLY VALIDATED**

Batch 14 created three append-only forward migrations and one local catalog/assertion script. A fresh disposable local Supabase stack replayed the approved 14-migration canonical baseline plus all three new migrations from an empty database. Local assertions, migration history, lint, and targeted repository regression tests passed.

No Production or hosted Supabase connection occurred. No deployment, migration repair, link, push, payment work, inventory work, historical migration edit, commit, or push occurred.

## 2. New migration files

| Version | File | Group |
| --- | --- | --- |
| `20260816150000` | `supabase/migrations/20260816150000_reconcile_role_rls_acl_contract.sql` | 1 — role/RLS/ACL |
| `20260816150100` | `supabase/migrations/20260816150100_repair_targeted_security_definer_paths.sql` | 2 — targeted SECURITY DEFINER paths |
| `20260816150200` | `supabase/migrations/20260816150200_repair_kitchen_print_contract.sql` | 3 — kitchen print |

The existing directory already ended in timestamped migration versions through `20260805133843`; the three new unique UTC versions are unused, ordered, and do not reuse legacy numeric versions or the duplicate `022`.

## 3. Scope confirmation

```text
Group 1 implemented
Group 2 implemented
Group 3 implemented
Group 4 not touched
Group 5 not touched
```

Specifically:

- no payment table, payment ledger, payment policy/grant, payment RPC, payment data, or legacy payment behavior was modified;
- `supabase/migration-inventory.json`, catalog-manifest material, and historical migration metadata were not modified;
- no historical migration, including `011` or either `022`, was modified;
- no application source changed.

## 4. Migration implementation summary

### `20260816150000_reconcile_role_rls_acl_contract.sql`

| Item | Implementation |
| --- | --- |
| Objects changed | `restaurant_staff_role_check`; `restaurant_invites_role_check`; `create_restaurant_invite(uuid,text,text)`; targeted policies on `restaurants`, `restaurant_staff`, and `orders`; explicit preservation of affected direct table/function ACLs. |
| Preserved contract | The exact seven-role vocabulary: `owner`, `manager`, `staff`, `kitchen`, `cashier`, `waitstaff`, `attendance`; authenticated SELECT/UPDATE table ACL on `restaurants`; owner/platform-admin RLS UPDATE authorization; authenticated SELECT-only direct access to `restaurant_staff` and `orders`; no direct orders UPDATE grant. |
| Defect repaired | Canonical baseline role constraints and invite validation lacked `waitstaff`/`attendance`; historical 011 intent conflicts with the verified live owner/platform-admin restaurants UPDATE contract. |
| Preconditions | Migration fails if an unrecognized restaurants UPDATE policy would be overwritten. It only replaces recognized canonical/Production policy names. |
| Postconditions | Both role checks and invitation validation accept exactly seven values; obsolete `authenticated update allowed restaurants` is absent; `owners and platform admins update restaurants` is the only intended restaurants UPDATE policy; required grants remain explicit. |

The orders read policy intentionally includes `waitstaff`, as fresh Production evidence proves. It does **not** infer new `attendance` permissions; attendance remains a valid role value without speculative operational expansion.

### `20260816150100_repair_targeted_security_definer_paths.sql`

| Item | Implementation |
| --- | --- |
| Objects changed | Only function-local configuration for `list_restaurant_team(uuid)`, `revoke_restaurant_invite(uuid)`, and `update_restaurant_order_status(uuid,uuid,text)`. |
| Preserved contract | Existing schema/name/signature, owner, SECURITY DEFINER state, function body, return type, and EXECUTE ACL. |
| Defect repaired | The malformed one-schema quoted string `search_path="public, pg_temp"`. |
| Preconditions | Each target must be a `postgres`-owned SECURITY DEFINER and have either canonical `search_path=public`, known malformed quoted-comma state, or the already-correct two-entry state. Any other path fails closed. |
| Postconditions | Each target has `search_path=public, pg_temp` as actual ordered entries. |

No function body was rewritten. A narrow `ALTER FUNCTION ... SET search_path TO public, pg_temp` was sufficient.

### `20260816150200_repair_kitchen_print_contract.sql`

| Item | Implementation |
| --- | --- |
| Objects changed | `orders_status_check`; four kitchen-print columns if absent after strict metadata validation; `orders_kitchen_print_queue_idx`; `claim_kitchen_print_job(text)`; `finish_kitchen_print_job(uuid,boolean,text)`; their EXECUTE ACLs. |
| Preserved contract | Ten lowercase live order statuses; existing print-column types/default/nullability; claim/finish signatures and result types; `postgres` ownership/SECURITY DEFINER/path; authenticated plus owner EXECUTE and no anon/service-role execution; bounded retries, stale-claim timeout, `FOR UPDATE SKIP LOCKED`, staff/tenant check, and finish success/failure contract. |
| Defect repaired | Uppercase `New`/`Preparing` queue literals incompatible with the lowercase status constraint; claim routine reference to nonexistent `public.restaurant_tables`. |
| Preconditions | The status constraint must be the approved canonical five-state or verified Production ten-state form. Existing print columns must exactly match captured metadata. A pre-existing queue index must have the known uppercase predicate; unknown variants fail instead of being dropped. |
| Postconditions | `orders_status_check` contains ten lowercase states; `new`/`preparing` are the shared claim/index queue states; claim source joins `public.tables`; recreated index is valid/ready/live after replay. |

Correcting only the index would have remained broken: the claim function independently used the same uppercase literals and `public.restaurant_tables`. This migration replaces both pieces as one contract. No order/status data backfill was performed.

## 5. Clean local replay

### Isolation and tooling

| Item | Result |
| --- | --- |
| Disposable workspace | `/tmp/p0-01d-b14-red-20260816` in Ubuntu WSL2 |
| Source materialization | `git archive` and `git show` from immutable commit `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c`; only Batch 10’s approved 14 migrations copied into the workspace before adding the three Batch 14 migrations |
| HOME | Fresh disposable workspace HOME |
| CLI | `/home/gary/.supabase/bin/supabase` version `2.114.0` |
| Node path | `/home/gary/.nvm/versions/node/v22.23.2/bin` |
| Docker | Local Docker Desktop-backed stack; Docker server version reported as `29.7.2` during preflight |
| Hosted isolation | Sanitized environment confirmed absent: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `DATABASE_URL`, `POSTGRES_URL`, `AVENIQ_SUPABASE_URL`; no linked-project metadata in isolated workspace |

The initial pre-migration assertion was deliberately red against the canonical baseline:

```text
ROLE_CONTRACT_MISMATCH: public.restaurant_staff.restaurant_staff_role_check,
got {cashier,kitchen,manager,owner,staff}
```

This demonstrated that the new local assertion test detected the missing forward behavior before the migration implementation was applied.

### Final clean replay result

```text
supabase db reset --local --no-seed
→ exit 0
→ Finished supabase db reset on branch main.
```

Applied order was exactly the 14 approved canonical migrations followed by:

```text
20260816150000_reconcile_role_rls_acl_contract.sql
20260816150100_repair_targeted_security_definer_paths.sql
20260816150200_repair_kitchen_print_contract.sql
```

The final local history contains **17** entries: all 14 canonical versions exactly once and all three Batch 14 versions exactly once.

## 6. Group 1 validation

`p0-01d-batch14-local-assertions.sql` passed in the replayed local database:

```text
BEGIN
DO
DO
DO
ROLLBACK
```

It proved:

- both role constraints accept exactly the seven required values;
- `authenticated` retains SELECT and UPDATE on `restaurants`, and SELECT on `restaurant_staff`/`orders`;
- authenticated does not gain orders UPDATE;
- `authenticated update allowed restaurants` is absent;
- `owners and platform admins update restaurants` exists as an UPDATE policy with the required role/helper semantics;
- RLS remains enabled on `restaurants`, `restaurant_staff`, `restaurant_invites`, and `orders`.

The assertions are read-only inside a transaction followed by rollback.

## 7. Group 2 validation

The same local assertion script proved for all three targeted functions:

```text
public.list_restaurant_team(uuid)
public.revoke_restaurant_invite(uuid)
public.update_restaurant_order_status(uuid,uuid,text)
```

- original identity/signature exists;
- `SECURITY DEFINER=true` remains;
- owner is `postgres`;
- `proconfig` contains safe `search_path=public, pg_temp`;
- malformed `search_path="public, pg_temp"` is absent;
- authenticated retains EXECUTE and anon does not receive EXECUTE.

No unrelated function was altered by Group 2.

## 8. Group 3 validation

The local assertion script proved:

- `orders_status_check` accepts exactly: `new`, `draft`, `confirmed`, `kitchen_accepted`, `preparing`, `ready`, `completed`, `paid`, `cancelled`, `voided`;
- the four print columns exist with the required contract, including non-null integer `kitchen_print_attempts` default `0`;
- `claim_kitchen_print_job(text)` uses `public.tables`, not `public.restaurant_tables`, and its source uses lowercase `new`/`preparing` rather than uppercase literals;
- `orders_kitchen_print_queue_idx` has matching lowercase predicate values and is valid, ready, and live;
- both kitchen function signatures are `postgres`-owned SECURITY DEFINER functions with safe `search_path=public`;
- authenticated retains EXECUTE and anon does not receive it;
- `finish_kitchen_print_job(uuid,boolean,text)` remains available with its preserved contract.

The fresh local replay itself proves a lowercase `new` order is accepted by the status constraint, and the catalog assertion proves the queue index/claim function use that same lowercase vocabulary. Full external-printer concurrent behavioral tests remain a required pre-release/staging gate; no external printer or Production data was involved in Batch 14.

## 9. Lint and tests

| Check | Result |
| --- | --- |
| `supabase migration list --local` | Passed; 17 expected local/remote entries, ordered from canonical `001` through `018` (approved subset) and the three new forward versions. |
| `supabase db lint --local --level warning` | Passed: `No schema errors found`. |
| Batch 14 local catalog assertions | Passed (`BEGIN`, three successful `DO` blocks, `ROLLBACK`). |
| `tests/test-critical-business-rules.mjs` | Passed: `Critical production checkout arithmetic checks passed.` |
| `tests/test-order-integrity.mjs` | Passed: `Order integrity migration and UI contract checks passed.` |
| `tests/test-kitchen-void-contract.mjs` | Passed: `Kitchen void UI and atomic audit contract checks passed.` |
| `tests/test-critical-server-guards.mjs` | Passed: `Critical server-side security and integrity guard checks passed.` |
| `scripts/test-migration-integrity.mjs` | Expected existing release block: failed with the pre-existing mutated `011`, duplicate `022`, untracked history, `reconciliation-blocked` inventory, and missing inventory entries for new migrations. This is a Group 5 control-plane condition, not a Batch 14 migration replay or local schema failure. |

No pnpm/Corepack/application build tooling was used. It was not required for the local Supabase SQL validation path.

## 10. Repository integrity

### Batch 14-created files only

```text
supabase/migrations/20260816150000_reconcile_role_rls_acl_contract.sql
supabase/migrations/20260816150100_repair_targeted_security_definer_paths.sql
supabase/migrations/20260816150200_repair_kitchen_print_contract.sql
scripts/p0-01d-batch14-local-assertions.sql
docs/p0-01d-batch14-groups1-3-local-validation-2026-08-16.md
```

The existing dirty state—including the modified historical `011`, pre-existing untracked migration evidence, and unrelated script/test changes—was not cleaned, restored, staged, committed, or otherwise altered by Batch 14.

## 11. Remaining blockers

- **Group 4 remains unresolved:** payment reader roles/columns and legacy-client compatibility must be decided before exact payment SQL. No Group 4 object was touched.
- **Group 5 remains unresolved:** the migration inventory remains `reconciliation-blocked`; historical `011`, duplicate `022`, later untracked history, approved manifest, and release canonicalization are not resolved by Batch 14.
- **Production release remains blocked:** independent migration review, clean-replay reproduction, full targeted behavioral suite, controlled printer-agent validation, read-only Production preflight, backup/recovery posture, and explicit human authorization are still required.
- **Broader SECURITY DEFINER work is not closed:** this batch repaired only the three Batch 12-targeted functions; it does not reconcile the broader historical 41-function finding.

## 12. Recommended Batch 15

**P0-01D Batch 15 — Perform an independent, read-only implementation review of the Batch 14 Groups 1–3 migrations and local validation artifacts, including SQL security/privilege review and a fresh isolated replay reproducibility check.**

Do not begin Group 4 payment work or Group 5 inventory canonicalization in Batch 15 unless separately authorized.

## Validation and non-mutation statement

- `git diff --check` for all Batch 14 artifacts: **passed** (`git_diff_check=0`); repository-scope verification identified only the five Batch 14 artifacts listed in §10.
- Build verification: **NOT APPLICABLE TO BATCH 14 LOCAL SUPABASE SQL VALIDATION**.
- No Production connection, Production credential use, hosted `--db-url`, link, push, migration repair, deployment, commit, or historical-migration mutation occurred.
