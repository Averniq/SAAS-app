# P0-01D Batch 12 — Targeted Production Catalog Capture

## 1. Final status

**COMPLETE — TARGETED PRODUCTION EVIDENCE CAPTURED**

Batch 12B analyzed the successful human-executed Batch 12A normalized Production catalog capture. The capture closes both fresh-evidence requirements identified by Batch 11. It provides the exact current role constraints, RLS policies and ACLs, targeted SECURITY DEFINER metadata/source/ACLs, and kitchen-print function/index/status relationship required for forward-only design.

**Batch 13 readiness:** **READY FOR P0-01D BATCH 13 — FORWARD-ONLY RECONCILIATION DESIGN**.

This evidence approves design only. It does not approve SQL execution, a migration, a history repair, a deploy, or any change to Production.

## 2. Evidence provenance

| Source | Status and use |
| --- | --- |
| Prior Production evidence (P0-01B and architecture audit) | Historical read-only evidence used to identify the two boundaries and compare prior broad findings. It is not substituted for fresh facts below. |
| Batch 12 credential-backed attempt | Failed before the query ran because the operator-control layer withheld execution consent. It contributed no Production catalog facts. |
| Batch 12A SQL script | `scripts/P0-01D_BATCH12A_PRODUCTION_READONLY_CAPTURE.sql`; statically reviewed read-only catalog capture. |
| **Fresh Production evidence** | Human operator manually executed the corrected Batch 12A script once in the Supabase Production SQL Editor. The successful one-result CSV is `C:\Users\WindVeil\Documents\aveniq-saas\evidentce\Supabase Snippet Untitled query.csv` (operator-provided evidence location; not a Batch 12B artifact). It contains 339 normalized rows. |

The fresh capture was a catalog-only `WITH ... SELECT` inspection. It did not execute an application RPC, DML, DDL, migration command, deployment, or Production repair.

## 3. Role-model conclusions

### Fresh Production fact

Both `public.restaurant_staff.role` and `public.restaurant_invites.role` are non-null `text` columns governed by validated CHECK constraints:

- `restaurant_staff_role_check`
- `restaurant_invites_role_check`

Each exact live definition permits this seven-value set:

```text
owner
manager
staff
kitchen
cashier
waitstaff
attendance
```

`restaurant_staff.role` has default `'cashier'::text`; `restaurant_invites.role` has no default. Neither column is an enum.

### Preservation conclusion

All seven values must be preserved by future reconciliation unless a separately approved data/product migration changes the role model. In particular, **`waitstaff` and `attendance` are confirmed live Production values**, not an inference from prior evidence.

The fresh `create_restaurant_invite(uuid,text,text)` definition independently accepts the same seven values. Its privileged-role rule restricts non-owner/non-platform-admin callers from inviting `owner` or `manager`; it does not reject `waitstaff` or `attendance`.

## 4. RLS conclusions

### Fresh table state

All nine captured boundary tables are owned by `postgres`, have `relrowsecurity=true`, and have `relforcerowsecurity=false`:

```text
restaurants
restaurant_staff
restaurant_invites
orders
payments
split_bills
split_bill_items
staff_shifts
staff_shift_breaks
```

### Fresh policies

The capture returned **16 relevant policies**, all `PERMISSIVE` and assigned to `{authenticated}`. Exact `USING` and `WITH CHECK` expressions were captured in the human evidence; their material state is:

| Table | Policy / command | Fresh conclusion |
| --- | --- | --- |
| `restaurants` | `authenticated read allowed restaurants` / SELECT | `is_restaurant_staff(id) OR is_platform_admin()` |
| `restaurants` | `owners and platform admins update restaurants` / UPDATE | owner-only role check or platform admin in both `USING` and `WITH CHECK` |
| `restaurant_staff` | read, insert, update, delete owner paths | owner-only write checks; own-row-or-owner read path |
| `orders` | `operational staff read orders` / SELECT | includes `owner, manager, staff, kitchen, cashier, waitstaff` |
| `orders` | `staff update orders` / UPDATE | any current restaurant staff in both `USING` and `WITH CHECK` |
| `payments`, `split_bills`, `split_bill_items` | cash-handling SELECT policies | include `owner, manager, staff, kitchen, cashier` |
| `staff_shifts`, `staff_shift_breaks` | self/manager write and operational-role read paths | exact source captured; future changes must preserve tested role/tenant predicates unless deliberately changed |
| `restaurant_invites` | no policy row returned | consistent with RPC-oriented access; table privileges remain separately relevant |

### Named missing policy and ACL distinction

The explicit fresh completeness row proves:

```text
public.restaurants / authenticated update allowed restaurants = absent
```

This is a **policy-name absence**, not absence of UPDATE authorization. Production instead has the named UPDATE policy `owners and platform admins update restaurants` with exact owner/platform-admin predicates.

Separately, the table ACL grants `authenticated` both `SELECT` and `UPDATE` on `public.restaurants`. The ACL supplies table-level capability; the RLS UPDATE policy determines which rows and new row states that role may update. Neither fact alone proves the other. Any Batch 13 change must preserve this distinction and must not recreate the absent legacy policy merely by name.

## 5. ACL conclusions

### Material fresh relation ACL facts

| Surface | Fresh effective grant facts | Classification for forward design |
| --- | --- | --- |
| `restaurants` | `authenticated`: SELECT, UPDATE; `postgres` and `service_role`: full relation privileges shown in capture. No PUBLIC/anon grant row. | **Must preserve** the authenticated UPDATE capability only with its current RLS owner/platform-admin boundary; **must preserve** service/admin operational access. |
| `restaurant_staff` | `authenticated`: SELECT only; `postgres` and `service_role`: full relation privileges. No PUBLIC/anon grant row. | **Must preserve** authenticated read boundary pending any separately approved sensitive-column projection work. |
| `restaurant_invites` | No authenticated/anon direct table grant; `postgres` and `service_role`: full relation privileges. | **Must preserve** RPC-only authenticated boundary. |
| `orders` | `authenticated`: SELECT only; `postgres` and `service_role`: full relation privileges. No PUBLIC/anon grant row. | **Must preserve** direct-write denial; the dormant broad UPDATE policy is not active without an ACL grant. |
| `payments` | No authenticated SELECT grant; raw ACL/expanded rows show authenticated and anon only non-data privileges reported by the catalog capture, while `postgres` has full relation access. | **Known defective / candidate for tightening-and-repair:** the prior live 403 is explained by missing authenticated SELECT despite the RLS SELECT policy. Do not blindly grant SELECT; define minimum financial roles/columns/RPC boundary first. |
| `split_bills`, `split_bill_items`, `staff_shifts`, `staff_shift_breaks` | No authenticated SELECT/INSERT/UPDATE/DELETE grant row; catalog capture reports only their non-data privileges for anon/authenticated and full owner access. | **Must preserve current RPC/private posture** unless a separately reviewed attendance/payment access design changes it. |
| `orders_order_number_seq` | `postgres` and `service_role`: SELECT, UPDATE, USAGE. | **Must preserve** for generated order identity behavior. |

No relevant PUBLIC relation privilege row was returned. `anon` has no direct data grant on the core role/order tables; the capture does show anon non-data privileges on payment/split/attendance relations, which should be **candidate for tightening review** only after separate dependency evidence. Batch 13 should not remove them by assumption.

### Material function EXECUTE facts

- Kitchen functions `claim_kitchen_print_job(text)` and `finish_kitchen_print_job(uuid,boolean,text)` grant non-grantable EXECUTE only to `authenticated` and `postgres`; no anon, PUBLIC, or service_role EXECUTE row was captured.
- Role helpers/invite/team functions generally grant `authenticated` and `postgres`; `service_role` is additionally granted for `accept_restaurant_invite`, `can_manage_restaurant_staff`, `create_restaurant_invite`, `has_restaurant_role`, `is_platform_admin`, `is_restaurant_staff`, `list_restaurant_team`, `revoke_restaurant_invite`, and `update_restaurant_order_status`.
- `record_restaurant_order_payment`, `record_restaurant_payment`, `touch_staff_presence`, and `void_restaurant_payment` show `authenticated` and `postgres` only in the captured EXECUTE rows.

**Preserve** the targeted function identities and authenticated operational exposure only where their contract remains intended. **Candidate for tightening:** the legacy `record_restaurant_order_payment(uuid,uuid,text)` exposure remains a known payment-bypass defect from prior evidence; the new capture proves its exact current authenticated EXECUTE exposure. No GRANT/REVOKE SQL is designed here.

## 6. SECURITY DEFINER conclusions

### Fresh targeted count

The fresh capture contains **15 targeted functions**. Every one is owned by `postgres` and has `SECURITY DEFINER=true`.

| Function identity | Function-local path classification | EXECUTE exposure |
| --- | --- | --- |
| `accept_restaurant_invite(uuid)` | safe explicit: `search_path=public` | authenticated, postgres, service_role |
| `can_manage_restaurant_staff(uuid)` | safe explicit: `search_path=public` | authenticated, postgres, service_role |
| `claim_kitchen_print_job(text)` | safe explicit: `search_path=public` | authenticated, postgres |
| `create_restaurant_invite(uuid,text,text)` | safe explicit: `search_path=public, pg_temp` | authenticated, postgres, service_role |
| `finish_kitchen_print_job(uuid,boolean,text)` | safe explicit: `search_path=public` | authenticated, postgres |
| `has_restaurant_role(uuid,text[])` | safe explicit: `search_path=public` | authenticated, postgres, service_role |
| `is_platform_admin()` | safe explicit: `search_path=public` | authenticated, postgres, service_role |
| `is_restaurant_staff(uuid)` | safe explicit: `search_path=public` | authenticated, postgres, service_role |
| `list_restaurant_team(uuid)` | **malformed/unsafe**: `search_path="public, pg_temp"` | authenticated, postgres, service_role |
| `record_restaurant_order_payment(uuid,uuid,text)` | safe explicit: `search_path=public` | authenticated, postgres |
| `record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)` | safe explicit: `search_path=public, pg_temp` | authenticated, postgres |
| `revoke_restaurant_invite(uuid)` | **malformed/unsafe**: `search_path="public, pg_temp"` | authenticated, postgres, service_role |
| `touch_staff_presence(uuid)` | safe explicit: `search_path=public` | authenticated, postgres |
| `update_restaurant_order_status(uuid,uuid,text)` | **malformed/unsafe**: `search_path="public, pg_temp"` | authenticated, postgres, service_role |
| `void_restaurant_payment(uuid,uuid,text)` | safe explicit: `search_path=public` | authenticated, postgres |

**Fresh targeted malformed/unsafe count: 3.** No captured targeted function lacks a function-local search path.

This targeted count is intentionally separate from the prior broad Production finding of 41 malformed SECURITY DEFINER paths. Batch 12B neither re-counted nor extrapolated that broader population; it verified the three malformed functions in this remediation boundary.

## 7. Kitchen-print conclusions

### Fresh function contracts

Both functions exist, are `VOLATILE`, `PARALLEL UNSAFE`, `SECURITY DEFINER`, owned by `postgres`, and use safe explicit `search_path=public`.

| Function | Fresh contract | EXECUTE |
| --- | --- | --- |
| `claim_kitchen_print_job(text)` | Returns `jsonb`; accepts restaurant slug; claims one retryable unprinted job and increments attempts. Its exact source joins `public.restaurant_tables`, requires staff membership, and filters `o.status IN ('New','Preparing')`. | authenticated, postgres |
| `finish_kitchen_print_job(uuid,boolean,text)` | Returns `void`; derives restaurant from the order, checks staff membership, then marks a print successful or records a bounded failure error. | authenticated, postgres |

### Orders/status/index relationship

Fresh `orders_status_check` is validated and permits exactly:

```text
new
draft
confirmed
kitchen_accepted
preparing
ready
completed
paid
cancelled
voided
```

`public.orders.status` is non-null `text`, default `'new'::text`. The print fields are present; `kitchen_print_attempts` is non-null integer default `0`, and the remaining print timestamp/error fields are nullable.

Fresh `orders_kitchen_print_queue_idx` is:

```text
non-unique btree (restaurant_id, created_at)
valid=true
ready=true
live=true
predicate: kitchen_printed_at IS NULL
           AND status IN ('New', 'Preparing')
```

### Classification

**Kitchen-print index: still defective.** The validated status constraint accepts lowercase `new` and `preparing`, not uppercase `New` and `Preparing`. Therefore an otherwise eligible lowercase `new` or `preparing` order cannot satisfy the live partial-index predicate.

**Kitchen-print function logic also requires reconciliation.** `claim_kitchen_print_job` repeats the same incompatible uppercase literals and references `public.restaurant_tables`, while the canonical and captured application table surface is `public.tables`. An index-only change would not restore a working claim path. `finish_kitchen_print_job` has no independently observed status-case mismatch, but its exact authenticated staff-only, ownership, result, and retry/error behavior must be preserved when the kitchen-print boundary is reconciled.

## 8. Evidence-gap closure

- **Gap 1 — role/RLS/ACL/security boundary: CLOSED.** Fresh evidence provides validated role constraints, table owners/RLS state, all relevant policy expressions, named-policy absence, table/sequence ACLs, targeted function source/metadata, `proconfig`, path classifications, and EXECUTE exposure.
- **Gap 2 — kitchen-print boundary: CLOSED.** Fresh evidence provides both complete function contracts, owner/definer/path/ACL data, five orders columns, exact validated status constraint, and valid/ready/live index definition/predicate. It proves the index and claim-logic divergence without function execution.

## 9. Updated forward-only remediation boundary

Batch 13 can design, but must not apply, an ordered forward-only candidate set covering only these evidenced groups:

1. **Role constraint preservation** — retain all seven live role values in staff/invitation constraints and invitation validation; determine capability treatment deliberately rather than rejecting existing `waitstaff`/`attendance` records.
2. **RLS-policy reconciliation** — preserve the current `restaurants` UPDATE authorization semantics under `owners and platform admins update restaurants`; do not recreate the absent legacy policy simply because an ACL grant exists. Review dormant orders UPDATE policy only with ACL impact explicitly considered.
3. **SECURITY DEFINER search-path hardening** — repair the three freshly evidenced malformed paths for `list_restaurant_team`, `revoke_restaurant_invite`, and `update_restaurant_order_status` using per-signature forward changes, retaining function identity and intended EXECUTE exposure.
4. **Function EXECUTE / ACL reconciliation** — preserve RPC-only/direct-table boundaries; address the legacy authenticated payment RPC exposure and payment-read 403 as explicitly scoped financial work rather than broad grants/revokes.
5. **Kitchen-print function/status reconciliation** — replace or repair the claim path as one contract: table reference, lowercase live status vocabulary, claim/retry semantics, tenant/staff authorization, and current authenticated EXECUTE boundary.
6. **Kitchen-print index repair** — align the partial-index predicate with the selected canonical kitchen state contract only together with the claim-function repair.

## 10. Remaining unknowns

No material Production catalog fact remains unknown for the two Batch 11 remediation boundaries. The following are **design decisions or later validation requirements**, not missing Production catalog evidence:

- product/security decision on the intended capability matrix for `waitstaff` and `attendance`;
- the approved financial access model for payments (narrow read RPC versus a minimal direct read boundary) and legacy-payment compatibility strategy;
- whether all broader non-targeted malformed SECURITY DEFINER functions are sequenced in the same future release; the fresh target capture does not replace the broader P0-02 inventory;
- isolated replay, staged behavior/tenant/ACL tests, and release approval after a candidate forward-only migration set exists.

## 11. Batch 13 readiness

**READY FOR P0-01D BATCH 13 — FORWARD-ONLY RECONCILIATION DESIGN**

Both Batch 11 evidence gaps are closed. The fresh capture establishes the live role contract, relevant RLS/policy state, targeted SECURITY DEFINER paths and function ACL exposure, and the complete kitchen function/index/status relationship. Batch 13 can design a forward-only reconciliation plan without guessing at these Production facts. It remains prohibited from applying migrations or changing Production.

## Validation and non-mutation statement

- Batch 12B was documentation/evidence analysis only; it did not connect to Production, rerun the capture, or execute a database command.
- No migration SQL was written.
- Build verification: **NOT APPLICABLE TO BATCH 12B DOCUMENTATION/EVIDENCE ANALYSIS**.
- The required `git diff --check` and repository-scope verification are recorded after this report update.
