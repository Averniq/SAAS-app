# P0-02 Batch 2A authenticated SECURITY DEFINER hardening validation

## Scope and migration

Added the forward-only migration `20260817081037_p0_02_batch2a_authenticated_definer_search_path_hardening.sql`.
It changes only the function-local `search_path` of these exact `regprocedure` identities:

1. `public.is_restaurant_staff(uuid)`
2. `public.has_restaurant_role(uuid,text[])`
3. `public.create_restaurant_for_owner(text,text,text,text,text,text)`
4. `public.create_restaurant_tables(uuid,integer)`
5. `public.is_platform_admin()`
6. `public.platform_create_restaurant(text,text,text,text,integer)`
7. `public.can_manage_restaurant_staff(uuid)`
8. `public.accept_restaurant_invite(uuid)`
9. `public.record_restaurant_order_payment(uuid,uuid,text)`

For every target, the migration fails closed unless the exact function exists in
`public`, is owned by `postgres`, is `SECURITY DEFINER`, has the exact prior
configuration `search_path=public`, has no overload, and permits only the
expected explicit owner (`postgres`) and `authenticated` EXECUTE grants while
denying `PUBLIC`, `anon`, `service_role`, and every other grantee. It snapshots
the body, language, volatility, return type, arguments,
owner, definer bit, and ACL before mutation, then verifies they are unchanged.

The intended before/after path is `public` to `public, pg_temp`. No function
body, ownership, signature, volatility, language, definer status, or EXECUTE
ACL is altered.

## Body and dependency review

The nine canonical definitions were reviewed before finalizing the migration.
Their application table/function references are qualified with `public`; auth
helpers are schema-qualified through `auth`; and the remaining built-ins use
the PostgreSQL catalog. No caller-controlled dynamic SQL was found in the
target definitions. `pg_temp` is appended after `public`, so it does not change
the intended application-object resolution. No target uses `gen_random_uuid`
or `unaccent`.

## Assertions and protected neighboring contracts

Added `scripts/p0-02-batch2a-local-assertions.sql`. It is transaction-wrapped
and rollback-safe. It checks every target's exact signature, owner, definer
state, hardened path, ACL boundary, singleton/overload state, language, and
volatility; proves no Batch 2A target remains public-only; preserves the three
P0-01D Group 2 contracts; and proves the three public QR functions retain
their public-only path and anonymous/authenticated EXECUTE contract.

The application regression commands below passed, covering existing checkout,
server guard, order-integrity, and kitchen-void behavior. The established
Batch 14, Batch 15A, and Batch 17 rollback-safe catalog/behavior assertions
also passed against the same disposable replay database.

## Release control

The canonical manifest now has 19 ordered entries. It adds only the Batch 2A
migration with SHA-256
`51bdcb3e3ef2d64bdbcec988455cf0b3df5584b430997e8911aeb616e46eeea0`;
the manifest checksum is
`1fe65912440e8ff618cfcb3144f800adca5470e37d01417b66be556382527a65`.
The source-reviewed allowlist, materializer, and integrity allowlist were
updated consistently; historical frozen evidence remains unchanged.

## Validation results

| Check | Result |
| --- | --- |
| `node scripts/test-canonical-release-control.mjs` | PASS — 19-entry chain hash-protected |
| `node scripts/test-migration-integrity.mjs` | PASS |
| `node scripts/test-migration-release-gate.mjs` | PASS |
| `node tests/test-critical-business-rules.mjs` | PASS |
| `node tests/test-critical-server-guards.mjs` | PASS |
| `node tests/test-order-integrity.mjs` | PASS |
| `node tests/test-kitchen-void-contract.mjs` | PASS |
| `git diff --check` | PASS — no whitespace errors (Git emitted unrelated CRLF conversion warnings) |
| Isolated workspace materialization | PASS — exactly 19 approved migrations copied to a disposable workspace |
| Fresh `supabase start` | PASS — WSL Docker Desktop stack with project ID `aveniq-p0-02-batch2a-replay` and ports `54424`–`54433` |
| `supabase db reset --local --no-seed` | PASS — reapplied all 19 canonical migrations, including Batch 2A |
| `supabase migration list --local` | PASS — exactly 19 local/remote entries through `20260817081037` |
| `supabase db lint --local --level warning` | PASS — `No schema errors found` |
| Batch 14, 15A, and 17 assertions | PASS — each ran rollback-safe against the isolated database |
| Batch 2A assertions | PASS — rollback-safe catalog assertions passed after two assertion-only fixes |
| Independent Batch 2A catalog verification | PASS — all nine targets have the hardened path, owner/definer state, and authenticated-only ACL; the three public QR functions remain public-only and callable by anon/authenticated |

Validation used Windows 11 with WSL 2.7.11.0 and Docker Desktop 29.7.2 through
the Ubuntu WSL distribution. Windows itself had no Docker CLI. WSL had Docker
Desktop integration but no native Node or Supabase CLI, so a temporary Node
v22.16.0 runtime was downloaded under `/tmp`; it ran `npx supabase@2.114.0`
without changing application dependencies. Hosted credential variables were
cleared before replay. The temporary workspace was uniquely named and used
distinct ports, so it did not attach to the existing Aveniq local stack.

Replay found no migration SQL defect. It did expose two defects in the new
Batch 2A assertion script only: language OIDs were incorrectly cast as
`regproc` rather than looked up through `pg_language`, and three SQL aliases
collided with the PL/pgSQL `target` variable. Both were corrected. The forward
migration was not changed after replay.

No historical migration was modified. No hosted or Production environment was
connected to or modified. No commit, push, deployment, P0-03, P0-04, or Batch
2B work was performed.

## Verdict

**PASS — P0-02 BATCH 2A AUTHENTICATED DEFINERS HARDENED AND LOCALLY VALIDATED**
