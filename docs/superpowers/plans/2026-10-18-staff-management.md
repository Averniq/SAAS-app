# Staff Management Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. User approved implementation and independent specialist review; execute continuously within local-only scope.

**Goal:** Owner-managed tenant staff with secure email invitations, immutable identity/history and authoritative suspension.
**Architecture:** Additive membership state, narrow audited RPCs and a verified-actor server email endpoint with service-only reservation and public Auth OTP; extend existing team UI/Auth adapters.
**Tech Stack:** Vanilla JS, Supabase Postgres/Auth/PostgREST, Edge function, Docker, Node/browser tests.
**Spec:** docs/superpowers/specs/2026-10-18-staff-management.md

## Global Constraints
Local Supabase and synthetic accounts only. No Production writes/deploys. Final review permits read-only catalog metadata comparison. Preserve Owner/Manager/Staff operations and public QR. Draft PR only; no privileged credentials in frontend.

## Review Focus
Existing JWT after suspension; old invite after role change; concurrent Owner/target mutations; existing Auth identity in another tenant; email transport failures after invite reservation.

## Tasks
1. [x] Backend contracts/security: write failing local database/API tests, create additive migration, harden all authoritative role/invite paths, run local runtime tests and document SQL/RLS/recovery. Owns migrations, tests/test-staff-management-local.mjs and backend review notes. Implements spec RPC names exactly.
2. [x] Invitation endpoint: write failing dependency-injected endpoint tests; implement supabase/functions/staff-invite using caller JWT, create_staff_invitation, Supabase Auth email OTP, fixed redirect origin, idempotency/cooldown; test new/existing/failure/denied calls without real email. Owns function files and endpoint tests. No Auth-admin key.
3. [x] Frontend: failing VM/browser tests; extend app.js/index.html/client/CSS with Owner edit/status, Manager existing invites, safe async fences, active-membership routing and authenticated recipient password setup separate from recovery. Save on server confirmation only.
4. [x] Integrated validation: actual local Auth/PostgREST/email new+existing user invite acceptance and own password setup, all retained-JWT protected APIs, cross-tenant denial, browser screenshots at 375/768/1280, existing regressions/build/secrets. Preserve existing local environment; cleanup only stacks created by this task.
5. [x] Independent QA/security/performance/UX review; fix blockers, rerun checks, final SQL/rollback/deployment evidence, focused Draft PR.

## Execution ledger
Phase 1 contracts documented before implementation. User-approved implementation permits proceeding without another design-approval pause. Parallel tasks have disjoint files; root integrates and validates. Production SQL/config application remains a separate explicit approval gate.
