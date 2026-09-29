# Kitchen Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the clean-state Kitchen lifecycle atomically while showing consistent, recoverable status to Kitchen, Front Desk, and customers.

**Architecture:** A single tenant-scoped status RPC locks an order and permits only the next lifecycle action or the narrowly scoped owner/manager cancellation action. The browser renders controls from the current authoritative status, never patches orders directly, and refreshes after a rejected mutation. Customer tracking stores only the public order identifier and uses the existing public status boundary after reload.

**Tech Stack:** Supabase PostgreSQL/RLS and RPC, vanilla JavaScript, Node assertions, disposable local Supabase fixtures.

**Spec:** User-approved clean-state Kitchen lifecycle brief, 2026-09-28.

## Global Constraints

- DB lifecycle is `new -> preparing -> ready -> completed`; UI names `completed` as Served.
- Only owner, manager, staff, and kitchen may progress an order.
- Only owner and manager may cancel from new or preparing; cancelled and completed are terminal.
- No direct client PATCH fallback, Production access, deployment, Netlify changes, or historical-compatibility work.
- Payment state remains separate from Kitchen status; Kitchen RPC never accepts Paid.

## Review Focus

- A stale Ready or Cancel request after a newer transition must fail without changing the row.
- An authenticated cashier or platform admin without a restaurant membership must not mutate Kitchen status.
- Customer reload must restore tracking with public identifiers only, never staff credentials or privileged tokens.
- Cancelled orders must not appear in active/payable Front Desk lists.
- Served orders must remain visible to Front Desk payment without gaining Kitchen controls.

---

### Task 1: Atomic database lifecycle contract

**Files:**
- Modify: `supabase/migrations/005_all_round_staff.sql`
- Test: `tests/test-kitchen-order-lifecycle.mjs`

- [ ] Write disposable-fixture tests for valid transitions, rejected transitions, cancellation policy, roles, tenants, anonymous calls, and concurrent stale mutations.
- [ ] Run the lifecycle test against a clean local Supabase instance and verify it fails against the existing RPC.
- [ ] Implement the clean-schema RPC definition: lock the target order, check membership and role, validate the exact previous state, update atomically, and return the row's authoritative status.
- [ ] Run the lifecycle test and verify it passes.

### Task 2: Kitchen and Front Desk client behavior

**Files:**
- Modify: `app.js`
- Modify: `supabase-client.js`
- Test: `tests/test-kitchen-lifecycle-ui.mjs`

- [ ] Write UI harness tests for one valid action per state, role-limited cancellation, disabled in-flight controls, failure reconciliation, Front Desk lifecycle labels, and excluded cancelled orders.
- [ ] Run the test and verify it fails against the current unconditional actions and PATCH fallback.
- [ ] Implement state-derived actions, fail-closed RPC calls, and authoritative refresh on mutation failure.
- [ ] Run UI tests and verify they pass.

### Task 3: Customer reload recovery

**Files:**
- Modify: `app.js`
- Test: `tests/test-customer-order-tracking-reload.mjs`

- [ ] Write a test that records only non-privileged public tracking identifiers, reloads state, and resumes Preparing/Ready/Served status retrieval.
- [ ] Run the test and verify it fails because canonical tracking is currently memory-only.
- [ ] Implement minimal tracking persistence and cleanup after dismissal without persisting staff credentials or privileged tokens.
- [ ] Run the test and verify it passes.

### Task 4: Regression verification

**Files:**
- Test: Kitchen tests plus existing current payment, QR/catalogue, and Sake Street tests.

- [ ] Run targeted lifecycle and UI tests, the active payment-path regression, QR ordering/catalogue tests, Sake Street photo tests, production build, and `git diff --check`.
- [ ] Record unavailable local-Supabase checks honestly; do not contact Production.
