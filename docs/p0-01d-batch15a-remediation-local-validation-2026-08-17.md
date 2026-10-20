# P0-01D Batch 15A — Forward-only remediation and local validation

## Result

**PASS — BATCH 15 FINDINGS REMEDIATED AND LOCALLY VALIDATED**

This batch adds one forward migration only. No historical, canonical, or Batch 14 migration was edited. No hosted or Production Supabase project was connected, linked, queried, or modified.

## Added migration

| Version | File | Purpose |
| --- | --- | --- |
| `20260817055036` | `supabase/migrations/20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql` | Kitchen-print claim fencing and deterministic restaurants UPDATE-policy convergence. |

## Kitchen-print fencing contract

`orders` gains nullable `kitchen_print_claim_token uuid` and `kitchen_print_claimed_by uuid` fields. Existing unprinted legacy claims are cleared during the forward migration because they cannot establish a claimant identity; they can be safely reclaimed. Printed rows have any fencing residue cleared.

`claim_kitchen_print_job(text) -> jsonb` retains its signature and response shape, adding `claim_token`. A successful claim generates a fresh `gen_random_uuid()`, records it with `auth.uid()` and the timestamp, increments `kitchen_print_attempts`, and clears the previous error.

The obsolete unfenced completion API is revoked and dropped:

```text
Old: public.finish_kitchen_print_job(uuid, boolean, text) returns void
New: public.finish_kitchen_print_job(uuid, uuid, boolean, text) returns boolean
```

The new function requires the token and atomically requires: authenticated caller, current tenant staff membership, matching token, matching `kitchen_print_claimed_by`, an unprinted row, and a claim newer than two minutes. A zero-row update raises `PRINT_JOB_CLAIM_NOT_CURRENT`.

- Successful finish returns `true`, sets `kitchen_printed_at`, and clears all claim fields and error.
- Failed finish returns `false`, stores the bounded error, clears all claim fields, and leaves attempts unchanged; the job may be immediately reclaimed with a new token.
- A stale reclaim replaces the token and claimant, fencing the prior worker.

Both kitchen RPCs remain `postgres`-owned `SECURITY DEFINER` functions with `search_path = public, pg_temp`. `authenticated` alone has EXECUTE; `PUBLIC`, `anon`, and `service_role` are revoked.

The lowercase `new` / `preparing` queue predicates and partial index are unchanged.

## Restaurant UPDATE-policy convergence

The migration rejects unknown `public.restaurants` UPDATE policies, removes both recognized legacy/canonical names, then recreates exactly one policy:

```sql
"owners and platform admins update restaurants"
FOR UPDATE TO authenticated
USING (public.has_restaurant_role(id, array['owner']) OR public.is_platform_admin())
WITH CHECK (public.has_restaurant_role(id, array['owner']) OR public.is_platform_admin())
```

This removes the legacy `"platform admins update restaurants"` policy without broadening manager, staff, anon, PUBLIC, owner, or platform-admin access.

## Validation

A disposable WSL workspace was materialized from immutable baseline `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c` with exactly canonical migrations `001–010, 014, 016–018`, Batch 14's three migrations, and the new Batch 15A migration. The final run used `supabase db reset --local --no-seed` in that isolated workspace.

| Check | Result |
| --- | --- |
| `supabase migration list --local` | PASS — 18 entries |
| `supabase db lint --local --level warning` | PASS — `No schema errors found` |
| Updated Batch 14 assertions | PASS — `BEGIN / DO / DO / DO / ROLLBACK` |
| Batch 15A assertions | PASS — `BEGIN / DO / DO / ROLLBACK` |
| `node tests/test-critical-business-rules.mjs` | PASS |
| `node tests/test-critical-server-guards.mjs` | PASS |
| `node tests/test-order-integrity.mjs` | PASS |
| `node tests/test-kitchen-void-contract.mjs` | PASS |
| `git diff --check` | PASS |

The Batch 15A assertions cover token issuance; correct, missing, wrong, stale, and same-tenant non-claimant tokens; current reclaimed token completion; repeated, unclaimed, and cross-tenant completion rejection; failure/retry fencing; old-signature absence; exact ACL state; and deterministic restaurants UPDATE-policy inventory.

`supabase db advisors --local --type all --level warn --fail-on error` exited successfully but reported pre-existing baseline warnings for multiple permissive SELECT policies (`categories`, `menu_items`, `restaurants`, `tables`) and `unaccent` installed in `public`. No new Batch 15A warning was reported.

## Scope confirmation

- No Production/hosted environment was touched.
- No deployment, commit, push, migration repair, or historical migration change occurred.
- No in-repository runtime caller of either kitchen-print RPC exists. Any external printer worker must pass the `claim_token` returned by claim to the new finish signature.
