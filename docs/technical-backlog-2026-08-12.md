# Aveniq Technical Backlog

**Source audits:** database architecture, migration reconciliation, automated testing, performance, and UI/UX audits dated 12 August 2026. This is a planning backlog only: no database, code, or deployment change is authorised by this document.

## Backlog rules

- Priorities express production risk, not implementation ease. Within each priority, follow the stated order.
- Items consolidate duplicate audit recommendations. Each implementation must still include its listed test requirement; source-pattern assertions alone are insufficient for database-facing work.
- Any production migration work starts only after a reviewed environment ledger/baseline is available. Existing financial, attendance, audit, entitlement, and fixture data must not be destructively cleaned up as part of these tasks.

## P0 Production Blockers

### P0-01 — Establish a verified migration baseline and release gate

- **Description:** Freeze migration repair/push activity, capture every environment's applied migration ledger and object fingerprints, choose a reviewed canonical baseline, and introduce only unique timestamped forward migrations thereafter.
- **Reason:** Duplicate `022` versions, modified historical SQL, untracked migrations, and hosted-only objects make replay and repair non-deterministic.
- **Risk:** A repair can silently mark different SQL as applied or omit live grants, policies, triggers, and functions.
- **Affected subsystem:** Supabase migrations, schema release process, CI.
- **Estimated complexity:** XL.
- **Dependencies:** Access to staging/production ledgers and approved release ownership.
- **Recommended order:** 1 — prerequisite for all production database changes.
- **Test requirement:** Clean isolated replay; checksum/catalog manifest comparison; assert both `022` effects and all approved RLS, ACL, trigger, and function signatures.

### P0-02 — Repair SECURITY DEFINER search paths and function ACLs

- **Description:** Correct malformed quoted-comma `search_path` settings for affected SECURITY DEFINER functions; fully qualify extension calls where needed; add explicit per-function execute allowlists and catalog assertions.
- **Reason:** QR token generation/resolution/order and sample setup can fail because `public, extensions` was stored as one nonexistent schema.
- **Risk:** Customer ordering and onboarding outages; careless blanket changes can break functions relying on implicit resolution.
- **Affected subsystem:** Supabase SECURITY DEFINER RPCs, QR ordering, onboarding, auth boundary.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; function signature inventory; staging database.
- **Recommended order:** 2.
- **Test requirement:** Catalog assertion reports no quoted-comma paths or unsafe extension references; staged QR generate/resolve/context/submit and sample flows pass; unauthorised callers cannot execute internal functions.

### P0-03 — Remove the ledger-bypassing legacy payment path and restore safe payment reads

- **Description:** Revoke or replace the legacy `record_restaurant_order_payment(uuid,uuid,text)` signature with a strict compatibility wrapper that delegates to the canonical ledger; provide a least-privilege tenant-scoped payment-read boundary and surface refresh errors.
- **Reason:** The old RPC can mark orders paid without a payment amount or ledger row, while direct payment reloads currently receive 403 and are silently ignored.
- **Risk:** Incorrect balances, untraceable revenue, duplicate/overpayment controls bypassed, and stale cashier UI.
- **Affected subsystem:** Front Desk, payments ledger, RLS/ACL, receipts/reports.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; P0-02; old-client usage telemetry and financial-role decision.
- **Recommended order:** 3.
- **Test requirement:** Real Supabase role-matrix tests for partial/full/retry/concurrent/overpay payment, refresh after payment/void, anon and kitchen denial, foreign-tenant denial, and exact ledger/order balance reconciliation.

### P0-04 — Create one strict, idempotent public QR ordering boundary

- **Description:** Add a versioned canonical token-backed order RPC used by managed QR routes. Validate live hashed token, table/venue/entitlement state, every line and option, bounded quantities, server-owned prices/GST, exact inserted count, and a stable submission idempotency key; route or sunset legacy APIs through a metered high-entropy compatibility adapter.
- **Reason:** Legacy APIs bypass revocable QR tokens, while the token RPC can insert unavailable items, omit options/GST, accept unbounded quantities, and duplicate retries.
- **Risk:** Cross-table/tenant orders, undercharging, sold-out preparation, duplicate kitchen tickets, and financial corruption.
- **Affected subsystem:** Customer QR menu, orders/order_items, public tokens, pricing/tax, kitchen intake.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; P0-02; QR-link/client telemetry; agreed compatibility sunset policy.
- **Recommended order:** 4.
- **Test requirement:** Anonymous two-tenant integration plus browser fault injection: valid token succeeds; revoked/foreign/inactive/guessed contexts fail without disclosure; malformed/mixed-invalid payload writes zero rows; tampered price/options/GST ignored; retry/concurrent submit yields one order.

### P0-05 — Enforce monotonic kitchen lifecycle and reload fidelity

- **Description:** Enforce permitted server-side transitions (New → Preparing → Ready → Served), safe idempotent repeats, and reload mapping for item notes and `is_test_order`; define recovery handling for reconnect/hung requests.
- **Reason:** A stale device can regress a ready order, and current reload drops preparation notes/test identity.
- **Risk:** Missed allergy instructions, test orders treated as live, inconsistent fulfilment, and duplicate or lost tickets under burst/recovery conditions.
- **Affected subsystem:** Kitchen display, order state RPC, order sync.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; P0-02; P0-04 for public-order intake fixtures.
- **Recommended order:** 5.
- **Test requirement:** Two-client stale/concurrent transition test, seeded reload/UI assertion for notes and Test label, multi-order burst, refresh/reconnect/hung-request fault tests.

### P0-06 — Make attendance database-authoritative and secure the PIN boundary

- **Description:** Move normal clock/break/clock-out actions to tenant-scoped idempotent RPCs; retain local state only as an explicit pending-sync queue; add audited correction actions. Rate-limit manager approval and shared-PIN failures with server-derived identity/kiosk keys, action-bound one-use approval tokens, and durable failed-attempt logging.
- **Reason:** The primary UI currently records local-only shifts while reports read database shifts; current four-digit PIN controls can be brute-forced.
- **Risk:** Missing payroll records, cross-device disagreement, unauthorised void approval, and PIN compromise.
- **Affected subsystem:** Attendance, Staff Clock, payroll reports, void approvals.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; P0-02; explicit product decision for offline-history reconciliation and correction policy.
- **Recommended order:** 6.
- **Test requirement:** Mandatory disposable-Supabase CI; two-device/retry lifecycle, invalid sequence, roles/tenant matrix, rotating device/session brute-force attempts, lock/cooldown, immutable correction actor/reason, and report inclusion.

### P0-07 — Close unmetered tenant creation and verify onboarding authorisation

- **Description:** Restrict legacy venue creation to approved invite/canonical provisioning paths, model legitimate legacy provenance explicitly, and reconcile platform-to-onboarding access/membership routing.
- **Reason:** Ordinary authenticated users can create `organization_id NULL` tenants that avoid entitlement limits; onboarding cards can lead to an access-denied dashboard.
- **Risk:** Unmetered tenant creation, entitlement bypass, inaccessible onboarding, and ownership ambiguity.
- **Affected subsystem:** Self-service signup, organisations/venues, entitlements, platform dashboard.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; provisioning/invite ownership decision; legacy-client telemetry.
- **Recommended order:** 7.
- **Test requirement:** Real verified-signup-to-activation browser/API journey; uninvited, non-owner, manager, and cashier create attempts fail; each permitted signup produces exactly one metered graph and correct dashboard access.

### P0-08 — Add a mandatory two-tenant and role authorisation test suite

- **Description:** Make disposable-Supabase integration tests required in CI for SELECT/INSERT/UPDATE/DELETE, sensitive SECURITY DEFINER RPCs, role elevation, public tokens, payments/splits, attendance, onboarding/entitlements, and Realtime isolation.
- **Reason:** Current source checks and optional credential-dependent tests cannot prove tenant isolation or authorisation.
- **Risk:** Cross-restaurant data disclosure/mutation and privilege escalation can ship undetected.
- **Affected subsystem:** CI, Supabase RLS/ACL/RPCs, all tenant-facing workflows.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; disposable Supabase environment; deterministic seed fixtures.
- **Recommended order:** 8, then required for every P0 database rollout.
- **Test requirement:** CI fails when integration configuration is absent; Tenant A cannot observe or mutate Tenant B via REST/RPC/Realtime; Staff cannot elevate privileges and Manager/Owner boundaries match policy.

### P0-09 — Reconcile financial, fulfilment, void, and reporting state

- **Description:** Design and introduce separate fulfilment and financial state machines, ledger-derived revenue facts, payment reversal/refund records, and atomic item/order void rules that reconcile totals, tax, splits, and audit history.
- **Reason:** Served unpaid orders become unpayable yet count as revenue; voids can leave balances/payments/splits inconsistent; existing data evidence shows completed-unpaid and voided-total anomalies.
- **Risk:** Incorrect revenue, inability to collect or repay, financial/audit corruption, and customer disputes.
- **Affected subsystem:** Orders, payments, splits, voids/refunds, Kitchen, Front Desk, reporting.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; P0-03; product decisions for refund/void policy and historical classification.
- **Recommended order:** 9.
- **Test requirement:** Staged transaction tests for served-unpaid → pay, pay → void → repay, partial payment/void, concurrent retry, item/batch/full void; reports count paid revenue once and exclude invalid/voided facts.

### P0-10 — Persist split bills and bind payments to their allocation

- **Description:** Implement an atomic, tenant-scoped split-plan boundary for equal/custom/by-item allocations in integer cents; persist bills/items, link payments by split ID, and reload the plan in the UI.
- **Reason:** The split UI is browser memory only, so allocations disappear after refresh and ledger rows cannot explain who paid what.
- **Risk:** Lost allocations, over-allocation, unreconstructable payment history, and incorrect customer balances.
- **Affected subsystem:** Front Desk, split_bills, split_bill_items, payments, receipts.
- **Estimated complexity:** XL.
- **Dependencies:** P0-03; P0-09 decisions; P0-08 role/tenant harness.
- **Recommended order:** 10.
- **Test requirement:** Browser + database tests for equal/custom/item splits, deterministic remainder, refresh, exact original-total preservation, concurrent pay/void, foreign-tenant denial, and payment-to-split linkage.

## P1 Production Hardening

### P1-01 — Fix trial sample setup and entitlement consistency

- **Description:** Make sample setup fit the effective plan limit (or consciously change the limit), execute as one idempotent validated operation, and use one shared quota definition for enforcement and UI.
- **Reason:** A 12-item sample conflicts with a 10-item limit and rolls back onboarding; owner/inactive-resource counting differs between screens and triggers.
- **Risk:** New tenants cannot complete onboarding or receive misleading entitlement status.
- **Affected subsystem:** Onboarding, sample menu, entitlements.
- **Estimated complexity:** M.
- **Dependencies:** P0-01; P0-02; product decision on plan limits and inactive-resource semantics.
- **Recommended order:** 11.
- **Test requirement:** Fresh trial succeeds twice idempotently, remains within limit, reports consistent usage, rejects out-of-plan direct operations, and advances onboarding only after a valid test order.

### P1-02 — Restore and test payment, receipt, and report refresh behaviour

- **Description:** After the P0 payment boundary, add real receipt/print, payment refresh, empty/loading/error, test-order exclusion, and reconciliation tests.
- **Reason:** Financial presentation has partial contracts but not production-boundary proof.
- **Risk:** Cashiers receive misleading receipts, reports include test/invalid facts, or refresh displays a stale balance.
- **Affected subsystem:** Front Desk, receipts, reports.
- **Estimated complexity:** L.
- **Dependencies:** P0-03; P0-09; test environment.
- **Recommended order:** 12.
- **Test requirement:** Browser/API suite verifies partial/final/reversed payments, generated receipt facts, report/export exclusion, error states, and payment balance after reload.

### P1-03 — Enforce tenant-composite referential integrity

- **Description:** Perform read-only mismatch audit, add parent `(id, restaurant_id)` / organisation pairs and `NOT VALID` composite foreign keys for denormalised tenant relations, then validate only after approved remediation.
- **Reason:** Parent IDs can be paired with a different tenant ID even when RLS hides the mismatch.
- **Risk:** Cross-tenant joins, corrupted relationships, and future service/import bypasses.
- **Affected subsystem:** Core schema, orders, menu, payments/splits, attendance, onboarding.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; P0-08; approved anomaly handling.
- **Recommended order:** 13.
- **Test requirement:** Same-tenant writes pass; deliberately crossed parent/tenant IDs reject; mismatch audit remains zero; constraints are validated only after staging proof.

### P1-04 — Define and enforce one ownership-transfer model

- **Description:** Specify co-owner semantics and provide an audited atomic owner-transfer RPC that synchronises organisation owner, membership, restaurant owner, and staff role authorities.
- **Reason:** Four ownership representations diverge; live evidence includes a venue with multiple owner memberships.
- **Risk:** Owner-only rules authorise different people, producing account/tenant-control loss.
- **Affected subsystem:** Organisations, restaurant memberships, staff, invites, RLS/RPCs.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; product co-owner policy; preflight inconsistency report.
- **Recommended order:** 14.
- **Test requirement:** Transfer/co-owner matrix across every Owner-only RPC/RLS path; old/new access matches policy; one immutable audit event; no automatic owner collapse.

### P1-05 — Make attendance evidence retained and corrections auditable

- **Description:** Adopt a retention policy, prevent cascades from erasing attendance evidence, and model append-only action/correction events from which effective shifts and reports are derived.
- **Reason:** Parent deletion can erase shifts, breaks, tokens, failures, and audit evidence; corrections are not enforced.
- **Risk:** Payroll/audit history can disappear or be silently altered.
- **Affected subsystem:** Attendance schema, retention, reports.
- **Estimated complexity:** XL.
- **Dependencies:** P0-06; legal/product retention policy.
- **Recommended order:** 15.
- **Test requirement:** Corrections preserve original timestamps and record actor/reason; deactivation retains evidence; retention removes only approved ephemeral artifacts; reports reflect effective events.

### P1-06 — Complete customer, Kitchen, attendance, and onboarding end-to-end coverage

- **Description:** Build a browser E2E harness around the golden customer flow, Kitchen burst/recovery, attendance sequences, and verified onboarding through activation.
- **Reason:** Individual structural checks do not prove real workflows, retries, reloads, or mobile behaviour.
- **Risk:** High-value journeys fail after deployment despite green source tests.
- **Affected subsystem:** Test automation, customer ordering, Kitchen, attendance, onboarding.
- **Estimated complexity:** XL.
- **Dependencies:** P0-04 to P0-08; disposable seeded environment.
- **Recommended order:** 16.
- **Test requirement:** Playwright (or equivalent) runs mobile/desktop happy paths, network faults, retry/reload, malformed input, and activation/test-order/report isolation in required CI.

### P1-07 — Correct operational sync correctness before performance optimisation

- **Description:** Replace full 500-order/1,000-payment polling with a bounded snapshot plus cursor/delta sync or tenant-scoped Realtime with reconnect backfill; preserve safe hidden-tab behaviour.
- **Reason:** Every active terminal repeatedly transfers full history and silently leaves rows beyond limits stale.
- **Risk:** Performance degradation scales per terminal and causes missed/duplicate updates after reconnect.
- **Affected subsystem:** Operational polling, Kitchen, Front Desk, Supabase API/Realtime.
- **Estimated complexity:** XL.
- **Dependencies:** P0-03, P0-05; event ordering/reconnect design; metrics baseline.
- **Recommended order:** 17.
- **Test requirement:** 30-minute per-terminal payload/call measurement; >500-row cursor coverage; reconnect/backfill loses no updates; each order/payment/void applies once; role-scoped Realtime isolation if used.

### P1-08 — Rewrite report and attendance date filters to use UTC bounds

- **Description:** Validate venue timezone, convert local date ranges to UTC `[from, to)` bounds before filtering base timestamps, then project local dates; only add query-specific indexes after EXPLAIN confirms need.
- **Reason:** Function-wrapped timestamps prevent existing tenant/time indexes from pruning history.
- **Risk:** Slow reports at scale or incorrect totals at DST boundaries.
- **Affected subsystem:** Reporting RPCs, attendance reporting, database performance.
- **Estimated complexity:** L.
- **Dependencies:** P0-09 financial truth; timezone validation audit; realistic staging data.
- **Recommended order:** 18.
- **Test requirement:** `EXPLAIN (ANALYZE, BUFFERS)` on multi-year staging data; Australia DST/inclusive-date fixtures; totals match prior approved semantics.

### P1-09 — Reconcile source-to-hosted schema drift and unsupported UI roles

- **Description:** Bring approved hosted-only capabilities (custom domains, printer queue, roles) into reviewed forward migrations or deliberately retire them; align UI permissions/projections with actual DB contracts and add selected-column/RPC contract checks.
- **Reason:** Clean replay omits live-only objects, UI reads unavailable fields/roles, manager setup UI conflicts with owner-only DB writes, and a legacy direct PATCH fallback cannot work safely.
- **Risk:** Production-only features break on new environments; users see unavailable controls or unsafe fallbacks.
- **Affected subsystem:** Migrations, platform routing, Kitchen printing, roles, client data mapping.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01; provenance/owner confirmation for hosted-only objects; product role decisions.
- **Recommended order:** 19.
- **Test requirement:** Clean replay exposes every retained feature; selected-field/RPC response contract CI; role UI/API matrix; printer claim staging test if retained.

### P1-10 — Harden public table-resolution and customer recovery states

- **Description:** Block ordering until a verified table identity resolves, show deterministic retry/revoked-token recovery, and keep Menu/Cart/Review table identity consistent.
- **Reason:** The QR route can remain "Loading table…" while carts and Review Order show a table, creating contradictory destination context.
- **Risk:** Customers place orders at the wrong table or cannot recover from valid token failures.
- **Affected subsystem:** Customer QR flow, public token resolver, mobile UI.
- **Estimated complexity:** M.
- **Dependencies:** P0-04; customer error-content decision.
- **Recommended order:** 20.
- **Test requirement:** Mobile/desktop browser tests for valid, revoked, disabled, foreign, loading, retry, reload, and network-error paths; no submit control is operable before table confirmation.

## P2 UX / Operational Improvement

### P2-01 — Make Front Desk payment actions and balance persistently visible

- **Description:** Add a responsive sticky totals/action rail that retains table identity, remaining balance, pay/split/print actions, and contextual error state through long invoices.
- **Reason:** Cashiers must scroll past lines before reaching their primary task, particularly on iPad.
- **Risk:** Slower service and increased payment-selection errors.
- **Affected subsystem:** Front Desk responsive UI.
- **Estimated complexity:** M.
- **Dependencies:** P0-03; P0-10 for durable split state.
- **Recommended order:** 21.
- **Test requirement:** Manual and browser viewport checks at desktop/iPad/mobile with long orders, keyboard, partial payment, error, and split states.

### P2-02 — Turn split billing into an accessible dedicated workspace

- **Description:** Use a landscape side sheet and portrait full-height sheet with sticky original/allocated/paid/remaining totals; label each payment-method control accessibly.
- **Reason:** Inline expansion loses context and payment comboboxes have no accessible name.
- **Risk:** Allocation errors and unusable keyboard/screen-reader flow.
- **Affected subsystem:** Split-bill UI, accessibility.
- **Estimated complexity:** L.
- **Dependencies:** P0-10; P2-01.
- **Recommended order:** 22.
- **Test requirement:** Keyboard/screen-reader assertions, responsive browser tests, 200–400% zoom, and equal/custom/by-item interaction tests.

### P2-03 — Optimise Kitchen scanability and exception handling

- **Description:** Present one safe next action, remove low-value active labels, enlarge distance-read metadata, and add stale/new/ready exception cues without relying on colour alone.
- **Reason:** Disabled invalid transitions and noisy labels slow recognition during service.
- **Risk:** Slower fulfilment and accidental/stale actions under load.
- **Affected subsystem:** Kitchen display.
- **Estimated complexity:** M.
- **Dependencies:** P0-05 state contract.
- **Recommended order:** 23.
- **Test requirement:** Usability session with simultaneous orders plus keyboard/touch, colour-independent status, tablet/desktop visual regression, and lifecycle contract tests.

### P2-04 — Improve attendance exception and kiosk usability

- **Description:** Make open/missed shifts dominant with clear resolution, and validate the mounted Staff Clock's lockout, idle reset, high contrast, and >=68px controls on target hardware.
- **Reason:** A 118-hour open shift currently competes visually with ordinary actions; dedicated kiosk behaviour is unverified.
- **Risk:** Payroll exceptions are ignored or a shared kiosk remains exposed.
- **Affected subsystem:** Attendance UI, Staff Clock kiosk.
- **Estimated complexity:** M.
- **Dependencies:** P0-06.
- **Recommended order:** 24.
- **Test requirement:** Real mounted-device portrait/landscape checklist, PIN error/lockout/repeat/idle tests, and open-shift resolution workflow.

### P2-05 — Complete semantic selection, dialogue, and responsive accessibility coverage

- **Description:** Standardise selected controls with `aria-pressed`/tab semantics, verify modifier grouping/validation, focus return/dialog behaviour, contrast, reduced motion, and phone landscape/Safari keyboard-safe docks.
- **Reason:** Category selection lacks exposed state; modifiers and real-device browser behaviour remain unverified.
- **Risk:** Keyboard/screen-reader users cannot understand or complete ordering; mobile action bars obscure content.
- **Affected subsystem:** Customer ordering design system, accessibility, mobile PWA.
- **Estimated complexity:** L.
- **Dependencies:** P1-10; shared component decisions.
- **Recommended order:** 25.
- **Test requirement:** Automated accessibility checks plus VoiceOver/keyboard and real Safari 200–400% zoom/reduced-motion/landscape tests.

### P2-06 — Clarify management/onboarding/settings actions and reports density

- **Description:** Repair platform access messaging, group setup/import actions by intent with destructive consequences, reduce duplicated report summaries, and constrain wide analytical layouts.
- **Reason:** Onboarding entry can deny access, settings actions are ambiguous, and reports are low-density/repetitive.
- **Risk:** Setup mistakes, support burden, and reduced operator comprehension.
- **Affected subsystem:** Platform dashboard, onboarding, Settings, Reports.
- **Estimated complexity:** M.
- **Dependencies:** P0-07; P1-09.
- **Recommended order:** 26.
- **Test requirement:** First-time operator walkthrough; desktop/iPad visual checks; confirmation/cancel/error-state tests for import actions.

### P2-07 — Establish a reusable operational design-system layer

- **Description:** Finish existing `--ds-*` migration and introduce semantic colour, target-size, selected-state, safe-area, elevation, and typography tokens with shared primitives.
- **Reason:** Ad-hoc values and overloaded red/status meanings create inconsistent interactions across customer and operational surfaces.
- **Risk:** Ongoing UI drift and costly repeated accessibility fixes.
- **Affected subsystem:** Styles, shared UI components.
- **Estimated complexity:** L.
- **Dependencies:** P2-01 to P2-05 design decisions.
- **Recommended order:** 27.
- **Test requirement:** Token/primitives unit or snapshot coverage, visual regression at core breakpoints, and contrast/target-size audit.

## P3 Refactoring

### P3-01 — Remove retired compatibility clients only after telemetry

- **Description:** Retire legacy payment wrappers, direct order PATCH fallback, raw/local-ID QR APIs, and unused compatibility paths only after dependency/API-log/client telemetry and a measured sunset period.
- **Reason:** Multiple obsolete paths bypass newer controls or confuse maintenance, but older clients/printed QRs may still rely on them.
- **Risk:** Breaking deployed clients or external integrations if removed prematurely.
- **Affected subsystem:** Client API layer, public QR links, payment compatibility.
- **Estimated complexity:** L.
- **Dependencies:** P0-03; P0-04; P1-09; telemetry and deprecation notice.
- **Recommended order:** 28.
- **Test requirement:** No observed calls through sunset window; regression suite confirms canonical paths; compatibility contract tests removed only with the implementation.

### P3-02 — Modularise route-specific application code and payloads

- **Description:** Incrementally separate customer, Kitchen, reporting, attendance, and setup modules so public QR routes do not eagerly download operational code and operational routes load only required data.
- **Reason:** The monolithic global-state app ships roughly 137 KB gzip of scripts to every route and couples UI changes.
- **Risk:** Route/startup regressions and global-state breakage if rewritten wholesale.
- **Affected subsystem:** Frontend architecture, build, routing, data loading.
- **Estimated complexity:** XL.
- **Dependencies:** P1-06 E2E safety net; P1-07 sync contract.
- **Recommended order:** 29.
- **Test requirement:** Per-route startup/E2E tests, bundle-size budget, and customer/Kitchen/Front Desk regression flows.

### P3-03 — Introduce checked schema/API response contracts

- **Description:** Generate database types or define runtime response schemas for selected fields, RPC arguments/results, and role-specific projections; replace brittle source-regex assumptions.
- **Reason:** `is_test_order`, presence, roles, and payment projection drift escaped existing structural tests.
- **Risk:** Silent client breakage when schema or function results change.
- **Affected subsystem:** Supabase client, CI, frontend mappings.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; P1-09 canonical schema inventory.
- **Recommended order:** 30.
- **Test requirement:** CI contract generation/check; intentional schema projection change fails until client mapping/test updates.

### P3-04 — Move fixtures out of migrations and formalise test-data provenance

- **Description:** Replace data-bearing Sake Street migrations with separately invoked, environment-gated, idempotent fixtures using random tokens and immutable fixture markers; investigate existing row provenance without automatic deletion.
- **Reason:** Current fixture logic can mutate a real tenant sharing a slug and predictable QR credentials.
- **Risk:** Customer data mutation, leaked demo access, and non-repeatable environments.
- **Affected subsystem:** Test/seed data, migrations, QR tokens.
- **Estimated complexity:** L.
- **Dependencies:** P0-01; provenance approval.
- **Recommended order:** 31.
- **Test requirement:** Fixture refuses production/non-fixture targets, cannot reuse arbitrary slugs, produces random tokens, and is repeatable in disposable environments.

### P3-05 — Rationalise measured data-access hot paths

- **Description:** After query measurements, add only justified indexes/partial indexes, paginate roster/presence, and use bulk menu import; schedule bounded cleanup of expired ephemeral tokens/failures.
- **Reason:** Several paths will scale poorly, but audit evidence does not justify blanket indexes or deletions.
- **Risk:** Premature indexes increase write cost; global cleanup increases contention; bcrypt PIN scanning remains a separate security-design concern.
- **Affected subsystem:** Database performance, staff management, menu import, attendance tokens.
- **Estimated complexity:** L.
- **Dependencies:** P1-07; P1-08; EXPLAIN and production-statistics review.
- **Recommended order:** 32.
- **Test requirement:** Exact query-plan benchmarks, load tests, import atomicity/limit tests, and cleanup retention assertions.

## P4 Future Architecture

### P4-01 — Adopt an immutable database change-control plane

- **Description:** Maintain environment-specific migration content hashes, schema/policy/function manifests, clean replay, and a reviewed forward-only release workflow.
- **Reason:** Migration provenance is the root cause that makes every database remediation riskier.
- **Risk:** Future environment drift and unrecoverable release ambiguity.
- **Affected subsystem:** Engineering process, CI/CD, Supabase.
- **Estimated complexity:** XL.
- **Dependencies:** P0-01.
- **Recommended order:** 33.
- **Test requirement:** Release gate rejects unknown/mismatched applied content and catalog drift; rehearsal validates an empty database from baseline.

### P4-02 — Build explicit tenant and ownership architecture

- **Description:** Make organisation/provenance explicit for all managed venues, use one audited ownership authority with defined co-ownership, and progressively validate composite tenant relationships.
- **Reason:** Nullable legacy inference and four ownership authorities make tenancy policy hard to reason about.
- **Risk:** Long-term authorisation inconsistency and cross-tenant data integrity defects.
- **Affected subsystem:** Multi-tenancy, organisations, memberships, schema integrity.
- **Estimated complexity:** XL.
- **Dependencies:** P1-03; P1-04; migration baseline and product policy.
- **Recommended order:** 34.
- **Test requirement:** Full tenant/role/owner transfer matrix and staged constraint-validation evidence.

### P4-03 — Establish canonical operational and financial domain models

- **Description:** Evolve toward separate fulfilment/payment state, immutable financial ledger/reversals, reconciled reporting facts, and transactionally derived summaries.
- **Reason:** Status, payment fields, ledger, splits, and reports currently encode overlapping truths.
- **Risk:** Repeated financial inconsistencies as features expand.
- **Affected subsystem:** Orders, payments, voids/refunds, splits, reports.
- **Estimated complexity:** XL.
- **Dependencies:** P0-09; P0-10; historical-data strategy.
- **Recommended order:** 35.
- **Test requirement:** Reconciliation view against production-like historical data plus full lifecycle/concurrency/report test suite.

### P4-04 — Move to an event-aware, scale-safe operational read model

- **Description:** Use ordered tenant-scoped deltas/Realtime with backfill, keyset pagination, and eventually evidence-backed rollups for stable reporting workloads.
- **Reason:** Full polling and repeated history scans will not scale with terminals, orders, or report periods.
- **Risk:** Event ordering/reconnect gaps can create incorrect operational state if introduced without strong merge semantics.
- **Affected subsystem:** Operational sync, reporting, Supabase Realtime/API.
- **Estimated complexity:** XL.
- **Dependencies:** P1-07; P1-08; observability baseline.
- **Recommended order:** 36.
- **Test requirement:** Multi-client ordering/reconnect/load tests, tenant isolation, cursor gap tests, and report parity checks.

### P4-05 — Define a durable attendance identity and retention platform

- **Description:** Converge authenticated and kiosk attendance on one append-only action engine, use a scalable non-secret PIN lookup factor plus slow verification, and implement explicit evidence-retention jobs.
- **Reason:** Current UI/source-of-truth split, caller-controlled rate-limit keys, bcrypt scanning, and cascades do not support enterprise scale or auditability.
- **Risk:** Payroll/security failures and excessive CPU at scale.
- **Affected subsystem:** Attendance, kiosk identity, audit retention.
- **Estimated complexity:** XL.
- **Dependencies:** P0-06; P1-05; privacy/legal policy.
- **Recommended order:** 37.
- **Test requirement:** High-volume invalid-PIN load tests, action/replay/tenant matrix, durable audit verification, and retention-policy integration tests.

## Next 10 tasks

These are the recommended next Codex implementation sessions, ordered for the best combined production safety, customer value, engineering value, and low regression risk. They deliberately start with bounded, forward-only safety work and test scaffolding before the larger domain redesigns.

1. **P0-01 — Establish a verified migration baseline and release gate.**
2. **P0-02 — Repair SECURITY DEFINER search paths and function ACLs.**
3. **P0-03 — Remove the ledger-bypassing legacy payment path and restore safe payment reads.**
4. **P0-04 — Create one strict, idempotent public QR ordering boundary.**
5. **P0-05 — Enforce monotonic kitchen lifecycle and reload fidelity.**
6. **P0-06 — Make attendance database-authoritative and secure the PIN boundary.**
7. **P0-07 — Close unmetered tenant creation and verify onboarding authorisation.**
8. **P0-08 — Add a mandatory two-tenant and role authorisation test suite.**
9. **P1-01 — Fix trial sample setup and entitlement consistency.**
10. **P1-10 — Harden public table-resolution and customer recovery states.**

P0-09 and P0-10 remain immediately after these sessions because they are larger financial domain changes with higher migration and historical-data risk; P0-03 and P0-08 provide the safety boundary and verification foundation needed to undertake them responsibly.
