# P0-DEPLOY-01 / P0-DEPLOY-01B — Production Convergence Design and Evidence Closure

**Status:** DESIGN-ONLY / READ-ONLY EVIDENCE COMPLETE. No Production mutation, migration application, ledger operation, deployment, commit, push, or PR occurred.

## Authority boundary

The canonical 24-migration P0-01 through P0-04 lineage remains the authority for a fresh disposable replay only. Production has its own 14-version timestamp ledger and none of the canonical versions. Its ledger is preserved unchanged; canonical history must not be replayed, repaired, reset, or represented as applied in Production.

Any later Production convergence work must use newly generated unique forward versions and accept only the catalog states recorded below. This is an operational compatibility design, not a migration-provenance claim.

## P0-DEPLOY-01 design baseline

The approved design sequence remains:

1. Production precondition register / fail-closed catalog fences.
2. P0-01D Group 1 plus Group 2 / P0-02 Batch 2A ACL and SECURITY DEFINER path convergence.
3. P0-01D Group 3 / 15A kitchen-print columns, index, claim fencing, and function-signature convergence as one coupled group.
4. P0-03 authoritative payment ledger and legacy financial-writer retirement.
5. P0-04 token-table compatibility transformation, entitlement/operation relations, and token-only public QR boundary.
6. P0-04 authenticated token issuance/rotation and issuance audit.
7. Final fixture catalog, runtime, negative-fence, idempotency, and independent-session concurrency verification.

The canonical fresh-stack 24-migration replay is a separate, unchanged verification path. The Production-convergence fixture applies only future convergence migrations to an evidence-derived Production prestate.

## Newly verified Production facts

All queries were single-statement catalog/data-shape `SELECT` queries through the authenticated Supabase dashboard Management API. No application function was invoked.

### P0-01D Group 1

| Surface | Verified current Production contract | Classification |
|---|---|---|
| `restaurants`, `restaurant_staff`, `restaurant_invites`, `orders` | RLS enabled, not forced | Known ACL/config drift boundary; exact policies/grants must be fenced. |
| `restaurant_staff_role_check` and `restaurant_invites_role_check` | Exact seven-role values: owner, manager, staff, kitchen, cashier, waitstaff, attendance | Equivalent structural role constraint. Invalid existing role count is zero for both tables. |
| `restaurants` policies | `authenticated read allowed restaurants`; `owners and platform admins update restaurants`, both to `authenticated`, with canonical staff/admin predicates | Equivalent policy contract. |
| `restaurant_staff` policies | exact canonical read, insert, update, and delete owner policies | Equivalent policy contract. |
| `orders` policies | `operational staff read orders`; `staff update orders` with canonical authenticated role predicates | Equivalent policy contract. |
| direct table grants | authenticated SELECT/UPDATE on `restaurants`; authenticated SELECT on `restaurant_staff` and `orders`; no direct client grant for `restaurant_invites` | Equivalent relevant final direct-grant contract. |

### P0-01D Group 2 and P0-02 Batch 2A

| Surface | Verified current Production contract | Classification |
|---|---|---|
| `list_restaurant_team(uuid)`; `revoke_restaurant_invite(uuid)` | postgres owner, SECURITY DEFINER, quoted `search_path="public, pg_temp"`, authenticated and service_role EXECUTE | Known ACL/config drift. |
| `update_restaurant_order_status(uuid,uuid,text)` | postgres owner, SECURITY DEFINER, quoted path, authenticated and service_role EXECUTE; source hash `1c48e5c636f85c9618fd66d63b6a03ed2016011b2f146cd72ddd836654a6cc98` | Known incompatible/transform: P0-03 replaces behavior and retires service_role access. |
| Batch 2A target set | all eight exact P0-02 target signatures are postgres-owned SECURITY DEFINER functions with `search_path=public`, authenticated + service_role EXECUTE | Known ACL/config drift. Converge with exact identity/owner/definer/path/ACL fences. |

### P0-01D Group 3 / 15A kitchen-print contract

| Surface | Verified current Production contract | Classification |
|---|---|---|
| `orders` print columns | `kitchen_printed_at timestamptz NULL`; `kitchen_print_claimed_at timestamptz NULL`; `kitchen_print_attempts integer NOT NULL DEFAULT 0`; `kitchen_print_error text NULL`; claim token/by columns absent | Known incompatible/transform. |
| `orders_kitchen_print_queue_idx` | valid/ready/live; predicate remains uppercase `status IN ('New','Preparing')` | Known incompatible/transform. |
| `claim_kitchen_print_job(text)` | postgres, definer, `search_path=public`, jsonb, authenticated-only; source hash `d1f5670607181a2be8f4d056a387539a2a3f3849b4133e42035fd5df860da583` | Known incompatible/transform. |
| `finish_kitchen_print_job(uuid,boolean,text)` | postgres, definer, `search_path=public`, returns void, authenticated-only; source hash `1c7c41ccb5b04158133077b36f553a63cfeba6ebb690a68993dafa6497d2ba8e` | Known legacy retirement/replacement. |
| direct dependent functions/views of old three-argument finish RPC | none found in the current `public` function/view catalog scan | Known no database dependency in the scanned scope. Application callers still require release/cutover validation. |
| live claim shape | 0 unprinted orders have an active claim; 0 orders fall outside final 11-state status vocabulary | Safe precondition for the fenced local fixture transformation; not permission to mutate Production. |

### P0-03 payment contract

| Surface | Verified current Production contract | Classification |
|---|---|---|
| `payment_operations`; canonical authoritative payment/list RPCs | absent | Known absent/create. |
| `orders_restaurant_id_id_key` | absent; zero duplicate `(restaurant_id,id)` pairs; both columns contain no NULL | Known absent/create; safe to add in a future fenced migration. |
| `orders_status_check` | current 10-state lowercase vocabulary, missing `served`; zero rows outside final 11-state target vocabulary | Known incompatible/transform; safe to replace only after exact constraint fence. |
| `payments` | existing RLS-enabled legacy payment table, 11 rows; restaurant/order IDs non-null; legacy uniqueness and FKs remain | Known legacy data surface to preserve. No backfill decision has been made. |
| `record_restaurant_order_payment(uuid,uuid,text)` | postgres definer, `search_path=public`, authenticated EXECUTE | Known legacy retirement. |
| `record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)` | postgres definer, `search_path=public, pg_temp`, authenticated EXECUTE | Known legacy retirement. |
| `void_restaurant_payment(uuid,uuid,text)` | postgres definer, `search_path=public`, authenticated EXECUTE | Known legacy retirement. |
| `update_restaurant_order_status` | see Group 2 | Known incompatible/transform in the payment convergence group. |

### P0-04 QR/token contract

| Surface | Verified current Production contract | Classification |
|---|---|---|
| `public_qr_ordering_entitlements`; `public_qr_order_operations`; `public_order_token_issuance_audit` | absent | Known absent/create. |
| canonical token QR RPCs (`get_public_qr_order_context`, `submit_public_qr_order`, `get_public_qr_order_status`, `issue_public_qr_table_token`) | absent | Known absent/create. |
| legacy QR RPCs (`get_public_restaurant`, `submit_order`, `get_customer_order_status`) | old public QR surface remains callable according to prior exact ACL capture | Known legacy retirement. Retire only after replacement path passes in fixture. |
| `tables_restaurant_id_id_key` | absent; zero duplicate `(restaurant_id,id)` pairs and no relevant NULL key values | Known absent/create; safe to add in a future fenced migration. |
| required QR/order/menu columns | all canonical runtime input/output columns were captured. The existing relation shapes support the final P0-04 RPC model; `public_order_tokens.expires_at` is absent. | Known structural transform limited to token relation and named new tables/RPCs. |
| `public_order_tokens` | RLS enabled, zero rows, unique `table_id`, unique token hash, no `expires_at`; contains extra `organization_id uuid NOT NULL` without default | Known incompatible/transform. |
| token live-shape | zero active-token-per-table conflicts | Safe precondition for future unique-constraint-to-partial-index transformation. |

## public_order_tokens.organization_id evidence

1. The column is `uuid NOT NULL` with no default.
2. It has a foreign key to `organizations(id)` with `ON DELETE CASCADE`.
3. `restaurant_id` and `table_id` also have `ON DELETE CASCADE` FKs to `restaurants` and `tables`.
4. Production presently has zero token rows, so no token data needs migration; that does not establish it is safe to remove the column.
5. Every non-null `restaurants.organization_id` maps to a row in `organizations`; **one restaurant has no organization mapping**.
6. Database functions referencing token/organization surfaces include existing legacy token issuance, resolution, context, submission, and self-service/onboarding functions. No direct view, materialized-view, or trigger dependency on `public_order_tokens` was returned by the targeted catalog query.
7. A repository static scan found token/organization references only in existing migrations, local P0 assertion fixtures, and P0 static tests; it found no current browser application `.js/.mjs/.html` caller of the legacy token RPC names. That source scan is not proof about deployed clients outside this repository.
8. Therefore a deterministic organization id **cannot be derived for every future issuance** from current technical facts: `Sake Street` lacks `restaurants.organization_id`.
9. Retaining the column as a Production-compatible extension does not inherently prevent canonical *behavioral* equivalence if a Production-specific issuer has an approved deterministic mapping and no public API exposes the extension. However, it prevents byte-identical table/issuer SQL equivalence and the known un-mapped restaurant blocks a universal issuer contract today.

## restaurants.ordering_enabled evidence

The only NULL row is the active/open restaurant:

| non-sensitive field | value |
|---|---|
| name | Sake Street |
| slug | `sake-street` |
| status | `active` |
| active/open | true / true |
| organization mapping | absent |
| active tables | 2 |
| token rows | 0 |

NULL is not treated uniformly as false in existing Production functions:

- legacy `get_public_order_context` and `submit_public_token_order` use `... AND ordering_enabled AND is_active`; SQL three-valued logic rejects NULL, so these public order paths treat it as unavailable;
- `activate_current_venue` updates only rows satisfying `NOT ordering_enabled`, which is not true for NULL, so it does not normalize this row;
- `get_public_tenant_context` uses `coalesce(ordering_enabled, true)`, so it treats NULL as enabled for venue discovery.

This is a known incompatible/transform state, not an evidence gap. Technical evidence cannot determine the intended business value.

## Compound-key readiness

| Proposed canonical dependency | duplicate pairs | null shape | Future migration conclusion |
|---|---:|---:|---|
| `orders(restaurant_id,id)` unique for payment/QR FKs | 0 | both key columns have 0 NULLs | Technically safe to add with an exact precondition fence. |
| `tables(restaurant_id,id)` unique for QR operation FK | 0 | key columns are NOT NULL | Technically safe to add with an exact precondition fence. |
| one live token per table partial unique index | 0 conflicts | token table currently empty | Technically safe after the organization-id decision and exact existing constraint/index fence. |

No bad rows were changed or repaired.

## Decision register — human/product decisions only

| ID | Decision required | Why technical evidence cannot decide |
|---|---|---|
| D-01 | Set `Sake Street.ordering_enabled` NULL to `false`, `true`, or retain it pending a separate product change | Existing Production functions currently disagree about NULL semantics; the restaurant is active/open with active tables. |
| D-02 | Choose token `organization_id` strategy: retain with a verified mapping, create/repair the restaurant organization relationship in a separately authorized change, or remove the extension after separate dependency review | `Sake Street` has no organization id, so no universal deterministic issuer mapping exists. Dropping/populating is a product/data-governance decision. |
| D-03 | Decide whether the 11 legacy `payments` rows must be represented in the new `payment_operations` ledger | Canonical P0-03 creates an authority for future operations. Accounting/product policy—not catalog data—determines whether historical backfill is required. |

## Implementation-planning readiness

**Evidence gaps closed:** current Group 1 policy/RLS/role state; Group 3/15A columns/index/function signatures/ACL/source fingerprints/live-claim state; P0-03 payment relation and legacy-writer contracts; P0-04 required runtime columns; compound-key duplicate/null checks; token organization FK/mapping/dependencies; and the ordering-enabled NULL semantic state.

**Remaining unresolved evidence gaps:** none in the P0-DEPLOY-01 object scope. The three items in the decision register are explicit human/business decisions, not missing technical evidence.

**Fixture readiness:** yes. The Production prestate is sufficiently specified to construct a faithful disposable fixture for the scoped P0 surfaces, provided the fixture represents the observed `organization_id` and ordering-enabled NULL states rather than inventing a decision.

**Implementation-planning readiness:** yes, after D-01 through D-03 are recorded. Implementation remains prohibited until those approvals and a separate change authorization are supplied.

**Deployment status:** BLOCKED. This document does not authorize Production mutation, ledger changes, or deployment.
