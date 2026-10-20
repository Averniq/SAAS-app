# P0-02 Batch 2B public QR SECURITY DEFINER hardening validation

## Implementation

Added `20260817085228_p0_02_batch2b_public_qr_definer_search_path_hardening.sql` for exactly:

1. `public.get_public_restaurant(text,text)`
2. `public.submit_order(uuid,uuid,text,text,jsonb,text)`
3. `public.get_customer_order_status(uuid,text,text)`

The migration fail-closes on missing/overloaded targets, non-`public` schema,
non-`postgres` owner, missing `SECURITY DEFINER`, noncanonical public-only
path, missing anon/authenticated access, service-role access, or any broader
ACL. It changes only `search_path` from `public` to `public, pg_temp`, and
snapshots/verifies body, return type, language, volatility, signature, owner,
definer state, and ACL are unchanged.

The body review found public-qualified application objects, PostgreSQL
built-ins, no dynamic SQL/caller-controlled identifiers, and no `unaccent` or
`gen_random_uuid` use in these three definitions. `pg_temp` follows `public`,
so intended resolution is preserved. No QR authorization, pricing, token,
idempotency, or payment behavior was changed.

## Validation

Validation used Docker Desktop 29.7.2 through WSL 2.7.11.0, with a temporary
WSL-local Node v22.16.0 runtime and `npx supabase@2.114.0`. Hosted credentials
were cleared. A materialized, uniquely named disposable workspace used ports
`54524`–`54533`; no Production or hosted write occurred.

| Check | Result |
| --- | --- |
| Fresh isolated replay | PASS — all 20 canonical migrations applied |
| `supabase migration list --local` | PASS — exactly 20 local/remote entries through `20260817085228` |
| `supabase db lint --local --level warning` | PASS — `No schema errors found` |
| Batch 14, 15A, 17 assertions | PASS |
| Batch 2A assertions | PASS — nine authenticated functions remain hardened |
| Batch 2B assertions | PASS — all 18 canonical SECURITY DEFINER functions use `public, pg_temp`; no public-only or malformed quoted-comma path remains |
| Anonymous QR authorization probes | PASS — restaurant lookup, order submission, and customer-status RPCs callable; direct restaurant data and staff/report RPCs denied |
| `node scripts/test-canonical-release-control.mjs` | PASS — 20-entry hash-protected chain |
| `node scripts/test-migration-integrity.mjs` | PASS |
| `node scripts/test-migration-release-gate.mjs` | PASS |
| `git diff --check` | PASS — no whitespace errors (unrelated CRLF warnings only) |

The canonical manifest moved from 19 to 20 entries. The new migration SHA-256
is `3e4a185edef8ea507a969a0c752109c15badab212692adcbd83b05a8ce2c640f`.
No historical, P0-01D, or Batch 2A migration was modified.

## Verdict

**PASS — P0-02 BATCH 2B PUBLIC QR DEFINERS HARDENED AND LOCALLY VALIDATED**
