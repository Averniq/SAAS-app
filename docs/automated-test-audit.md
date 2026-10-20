# Aveniq automated test audit — 12 August 2026

## Executive summary

Aveniq has useful custom Node and SQL contract checks, but it does not have a browser end-to-end harness. Most tests assert source patterns. The only production-boundary suites are optional Supabase API scripts for authorization and attendance; they can skip with exit code 0 when credentials are absent.

The highest production risks are the untested public-token QR path, cross-tenant mutations/RPCs, concurrent payments and kitchen transitions, and the full onboarding journey. Six P0 defects were confirmed by inspecting current production code:

1. A lost response and retry can create duplicate customer orders.
2. Public-token orders can include an unavailable item without charging for it, and bypass canonical modifiers/GST.
3. Kitchen reload drops item notes and test-order identity.
4. Front-desk split allocations are UI-only and are not persisted or linked to payments.
5. Stale kitchen clients can move an order backwards from Ready to Preparing.
6. Manager PIN approval for voids has no brute-force rate limit or failure audit.

## Coverage matrix

Legend: **Covered** = production behavior is executed; **Partial** = structural assertion or isolated harness; **Missing** = no automated coverage.

| Area | Workflow | Current | Missing priority |
|---|---|---:|---:|
| Customer | QR route, public-token validation, server-bound table | Partial | P0 |
| Customer | Menu and categories | Partial | P1 |
| Customer | Selection, cart, review, quantity, remove, item note | Partial | P1 legacy; P0 token path |
| Customer | Modifiers/options | Partial legacy; missing token | P0 |
| Customer | Whole-order note | Partial | P1 |
| Customer | Subtotal/GST/total | Partial legacy; defective token | P0 |
| Customer | Submit/sending/double tap/network failure/cart recovery | Partial isolated harness | P0 real boundary |
| Customer | Confirmation, tracking, continue ordering, reload | Partial legacy; missing token | P0 tracking/reload; P1 continue |
| Customer | Test versus real orders | Partial source assertion | P0 live isolation |
| Kitchen | Incoming orders and 3-second polling | Partial | P0 |
| Kitchen | Acknowledge, prepare, ready/complete | Partial | P0 |
| Kitchen | Duplicate/stale transition protection | Missing | P0 |
| Kitchen | Multiple simultaneous orders | Missing | P0 |
| Kitchen | Disconnect/reconnect, hung request, refresh | Missing | P0 recovery; P1 reload alert UX |
| Kitchen | Test orders | Partial and defective after reload | P0 |
| Front desk | Table visibility and bill/GST | Partial | P0 |
| Front desk | Equal/custom/by-item split | Missing behavior | P0 |
| Front desk | Partial/multiple/final payments and state | Partial contracts | P0 |
| Front desk | Duplicate/concurrent payment protection | Partial source assertion | P0 |
| Front desk | Receipt generation | Partial | P1 |
| Front desk | Order/payment voids | Partial contracts | P0 live authorization/replay |
| Attendance | PIN and clock/break/clock-out sequence | Covered only when integration env exists | P0 mandatory CI |
| Attendance | Invalid sequences | Partial | P0 |
| Attendance | Concurrent requests, rate limit, replay, expiry | Covered only when integration env exists | P0 mandatory CI |
| Attendance | Manager/Owner actions and boundaries | Partial | P0 |
| Attendance | Weekly reports | Partial arithmetic/API shape | P1 seeded totals/DST; P0 permissions |
| Onboarding | Signup and email verification | Partial source contracts | P0 |
| Onboarding | Organisation/Owner/restaurant/venue creation | Partial source contracts | P0 |
| Onboarding | Tables/menu/QR generate-preview-revoke | Partial source contracts | P0 |
| Onboarding | Test order through kitchen and activation | Partial source contracts | P0 |
| Onboarding | Trial restrictions and entitlement | Partial source contracts | P0 |
| Security | Tenant A cannot read Tenant B | Partial conditional seven-table probe | P0 remaining data/realtime |
| Security | Tenant A cannot modify/delete Tenant B | Missing | P0 |
| Security | Cross-tenant RPC/functions | Partial status/report probes | P0 |
| Security | Staff elevation; Manager versus Owner | Partial role probes | P0 |
| Security | Anonymous/public-token tenant boundary | Partial source contracts | P0 |
| Security | Test-order tenant/report isolation | Partial source contract | P0 |
| UX/perf | Real phone/tablet/desktop rendering and accessibility | Missing | P1 |
| UX/perf | Large kitchen/menu/report datasets | Missing | P1 |

## P0 test specifications

### Customer ordering

- **Retry idempotency:** Risk is duplicate live orders and kitchen tickets after a response is lost. Existing behavior uses a new local ID on a later legacy retry and no idempotency key in `submit_public_token_order`. Expected behavior is one stable submission key returning the original order for retries/concurrent calls. Relevant: `app.js` `submitOrder`/public-token submit UI, `supabase-client.js` `submitOrder`/`submitPublicTokenOrder`, `submit_order`, `submit_public_token_order`, `orders`. Test: browser fault injection plus real Supabase row-count integration.
- **Canonical public-token payload:** Risk is undercharging, sold-out items being prepared, zero GST, and lost modifiers/notes. Existing behavior totals active/available items but inserts all same-tenant items, and sets tax to zero. Expected behavior rejects the entire invalid payload and calculates authoritative options, subtotal, GST, and total. Relevant: migration 021 public-token functions, migration 008 pricing, `menu_items`, `orders`, `order_items`. Test: anonymous RPC integration with valid, unavailable, foreign, malformed, and tampered payloads.
- **QR/table/token isolation:** Risk is ordering at or reading another tenant/table. Existing code hashes and resolves tokens server-side but only structural tests cover it. Expected revoked/foreign/inactive tokens fail without tenant data disclosure. Test: two-tenant API integration plus browser QR navigation.
- **Golden customer flow:** Risk is disconnected pieces passing while the actual journey fails. Expected QR → menu/category → modifier/note → cart/review/edit → submit → confirmation/status → continue/reload. Test: Playwright against disposable Supabase, including mobile viewport and network failure.

### Kitchen

- **Reload fidelity:** Risk is missed allergy/preparation notes and test tickets appearing live. Existing `cloudOrderToLocal` does not map `order_items.notes`; `loadOrders` does not select `is_test_order`. Expected exact note/test identity after sync and reload. Relevant: `supabase-client.js` `loadOrders`, `app.js` `cloudOrderToLocal`/`renderKitchen`, `orders`, `order_items`. Test: seeded integration plus rendered browser assertion.
- **Monotonic/concurrent lifecycle:** Risk is stale devices regressing Ready to Preparing or duplicating actions. Existing RPC locks a row but does not enforce current-state transitions. Expected New → Preparing → Ready → Served only, with safe idempotent repeats. Relevant: `update_restaurant_order_status`, `orders`, kitchen handlers. Test: two authenticated clients issuing stale/concurrent requests.
- **Burst/recovery:** Risk is lost or duplicate tickets after multiple submissions, poll failure, hung request, reconnect, or refresh. Expected every order once and eventual recovery. Test: multi-context browser plus network fault injection and DB burst.

### Front desk

- **Payment integrity/concurrency:** Risk is double collection, overpayment, or an incorrect final state. Existing SQL contains locks/idempotency guards but only source assertions exercise them. Expected exact balances for concurrent partial/final/replayed/conflicting payments. Relevant: `record_restaurant_payment`, `payments`, `orders`, `split_bills`. Test: real Supabase concurrent integration.
- **Persistent split workflows:** Risk is split allocations disappearing on reload and payments not being associated with a split. Existing UI computes allocations locally and does not send `p_split_bill_id` or persist bills/items. Expected equal/custom/item splits preserve the original total, survive reload, and link each payment. Relevant: front-desk split functions, client payment RPC wrapper, `split_bills`, `split_bill_items`, `payments`. Test: browser workflow plus database assertions.
- **Void boundary:** Risk is unauthorized/repeated financial mutation. Expected Owner/Manager rules, required reason/PIN where applicable, tenant scope, idempotent rejection, and immutable audit trail. Test: role-matrix integration with real records.

### Attendance

- **Mandatory action lifecycle:** Risk is silent double clocking or invalid payroll data. Existing integration covers much of PIN/rate/replay/expiry/concurrency but skips successfully without environment configuration. Expected every invalid sequence to fail and every valid sequence to create one audited event. Relevant attendance RPCs/tables. Test: mandatory disposable-Supabase CI suite.
- **Permission matrix:** Risk is staff/manager crossing Owner boundaries or tenant boundaries. Expected explicit Owner, Manager, Staff, external-link, and foreign-tenant results. Test: seeded role integration.
- **Void approval PIN throttling:** Risk is brute forcing a four-digit manager PIN to authorize a sensitive void. Existing approval has no limiter/audit on failure. Expected generic failure, cooldown and audit without PIN storage. Relevant `require_manager_approval`, void RPCs, PIN failure/event/audit tables. Test: repeated invalid PIN integration, valid PIN during lock, cooldown and cross-tenant attempt.

### Onboarding and entitlements

- **Verified signup to activation:** Risk is incomplete or unauthorized tenants becoming live. Existing checks are structural. Expected unverified users cannot provision; verified signup creates exactly one organisation/Owner/restaurant; tables/menu/QR/test order complete before activation. Relevant onboarding/auth RPCs and organisation/restaurant/onboarding tables. Test: real auth email-verification fixture and browser journey.
- **QR lifecycle/test order:** Risk is revoked QR use, test orders entering reports, or activation without a completed test. Expected generate/preview/revoke semantics, kitchen visibility with a Test label, and exclusion from every report/export. Test: browser plus DB/report integration.
- **Entitlements:** Risk is expired trials or limits being bypassed through direct RPC/table operations. Expected consistent rejection at database boundaries. Test: time-controlled/seeded integration across ordering, staff, table and menu limits.

### Multi-tenant security

- **Complete two-tenant matrix:** Risk is cross-restaurant disclosure or mutation. Existing reads cover seven core tables conditionally; writes/deletes and most functions are absent. Expected no Tenant B rows/events/mutations for Tenant A across core, payments/splits, audits, attendance, organisations, onboarding and entitlements. Test: mandatory two-tenant integration covering SELECT/INSERT/UPDATE/DELETE and every sensitive SECURITY DEFINER RPC.
- **Role elevation:** Risk is account takeover or privilege expansion. Expected Staff cannot alter memberships/permission flags and Manager cannot grant privileged roles or perform Owner-only configuration. Test: authenticated mutation matrix.
- **Realtime isolation:** Risk is Tenant B payloads reaching Tenant A even when REST RLS is correct. Test: Tenant A subscription while Tenant B creates/updates orders.

## P1 and P2 backlog

- **P1:** real receipt/print assertions; weekly attendance seeded totals, DST/timezone, CSV, empty/loading/error states; revoked-token recovery messages; reload alert product decision; large-menu/kitchen/report performance; pagination/truncation; actual phone/tablet/desktop touch and focus flows; onboarding retry/recovery.
- **P2:** broad screenshot regression, keyboard/ARIA audit, malformed-input property/fuzz tests, report filenames and secondary empty states.

## Tests added in this audit

- `tests/test-critical-business-rules.mjs` executes production GST, integer-cent order totals, equal split preservation, payment-state boundaries, and item-split total preservation.
- `tests/test-critical-server-guards.mjs` adds regression guards for token tenant resolution, authoritative tenant item lookup, payment locks/idempotency/overpayment, attendance token/rate/replay boundaries, external-link validity, reporting exclusion, and required cross-tenant probes.

These are valuable fast guards, but they do not replace the remaining P0 browser and real-database integration tests.
