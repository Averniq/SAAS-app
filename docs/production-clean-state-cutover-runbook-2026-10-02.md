# Production clean-state cutover runbook

**Status: PLAN ONLY — not approved for execution.** This is an operator checklist for a separately authorised Production cutover. It does not authorise a Supabase reset, a Netlify unlock/deploy, any configuration change, or any traffic change.

**Release baseline:** `origin/main` commit `6a0915d895079313fc50ec03b20a296432e18d4a`.

**Verified release evidence:** a clean, isolated local replay applied the 21 canonical migrations on Supabase Postgres 15 and 17 (76 checks on each); a unique local GoTrue + Kong + PostgREST environment passed 21 application-facing API checks; local browser and regression gates passed. This evidence does **not** substitute for the Production steps below.

**Current public-site reference:** `https://app.aveniq.com.au` is served by locked Netlify production deploy `6ab9159972636300087c5022`, commit `c465448f024640977ddc2c7b90d494b548594570`. Keep this deploy available as the known rollback target until the acceptance window closes.

## 1. Scope and operating rules

This is a **clean-baseline** cutover. Historical Production restaurant, user, order, payment, QR-token, and audit compatibility is deliberately out of scope. The desired live database is the schema and Sake Street baseline represented by the pinned release commit.

- Use a **new** Supabase project. Do not run convergence migrations as a fresh bootstrap.
- Use only the 21 files in `supabase/migrations/` at the pinned commit; do not add `production-convergence-migrations` or untracked/local migration material.
- Do not copy credentials, tokens, passwords, service-role keys, JWT secrets, SMTP credentials, or payment-provider secrets into tickets, chat, source control, browser code, logs, or this runbook.
- Have a named release operator, Supabase operator, Netlify operator, and business approver present. Record times, actor, result, and evidence link for every gate.
- Stop at every Stop condition. Do not improvise a destructive repair, disable RLS, broaden a grant, or use a service-role key in the browser to proceed.

## 2. Resource and configuration inventory

Record resource **names, owners, and locations only** in the approved change record; never record their secret values here.

| Resource | Responsibility | Operator verifies before traffic |
| --- | --- | --- |
| New Supabase Production project | Empty clean database, Auth, API gateway, PostgREST, logs, backups | Correct organisation/project; no pre-existing application data; correct region and billing/backup policy |
| Supabase database URL and publishable/anon key | Browser connection to new project | Supplied only through the approved frontend build environment; no service-role key in client assets |
| Supabase service-role/JWT/API configuration | Server/operator-only administration | Stored in approved secret manager; never exposed to browser; compatible with Supabase Auth/API |
| Auth configuration | Email/password/OAuth policy, SMTP, redirect URLs, site URL | New project has approved redirect/callback URLs and email delivery configuration; no old users are assumed present |
| New owner/operator identities | Initial tenant provisioning and access recovery | At least two named operators can sign in and have recovery contact paths |
| Netlify site and Production context | Serves the frontend | Site remains locked until the approved traffic-change gate; existing locked deploy `6ab915...` is retained |
| Netlify build/runtime configuration | Supplies only client-safe Supabase URL/key and approved non-secret values | Exact new-project values prepared through the approved Netlify secret/configuration workflow; no unrelated configuration changes |
| DNS/custom domain and TLS | Continues to route `app.aveniq.com.au` | Domain and certificate remain unchanged unless separately approved; no DNS change is needed for a Netlify frontend switch |
| Payment-provider configuration, if enabled | Processes real payments outside the database | Correct production account/webhook configuration and least-privilege secret storage; payment test approved by business owner |
| Observability and support channel | Detects and records cutover failures | Supabase logs, Netlify deploy logs, browser/devtools evidence, and incident contact path ready |

## 3. Pre-cutover backup and rollback resources

| Action | Expected | Verify | Stop if |
| --- | --- | --- | --- |
| Capture an approved, time-stamped recovery resource for the **old** Supabase project (provider backup/PITR/snapshot or approved export), even though historical data is not a migration target. | A recovery reference exists without exposing data/secrets. | Operator records provider resource ID/location and restore owner in the change record. | No recoverable reference, retention window, or restore authority. |
| Preserve Netlify deploy `6ab9159972636300087c5022` and its commit `c465448...` as rollback evidence. | Old frontend remains locked and available. | Read-only deploy metadata still says `locked: true`, `context: production`, and the stated commit. | It is missing, unlocked unexpectedly, or replaced without approval. |
| Capture the pinned source and release-gate evidence. | SHA, migration inventory, and test evidence are immutable inputs. | `6a0915d...` is the intended release and a 21-file migration inventory is attached to the change record. | SHA, inventory, or evidence differs. |
| Create a rollback communication channel and decision owner. | Operators can stop traffic, payments, and ordering immediately. | Named contacts acknowledge the stop/rollback decision tree in section 15. | No decision owner or support channel. |

## 4. Destructive consequences and explicit acknowledgement

The recommended new-project route does **not** delete objects in the old Production project during bootstrap. Once traffic is moved, however, old state is no longer the live application state.

| Object/data class | Clean-state consequence |
| --- | --- |
| Existing Supabase application schema and data | Not copied to the new project: restaurants, tables, menu/catalogue edits, staff memberships, QR token hashes/audits, orders/items, payment ledger/audits, and operational history are absent from the new database. |
| Existing Auth users/sessions | Not copied. Existing sign-ins, refresh tokens, passwords, MFA/OAuth links, and invitations do not authenticate against the new project. |
| Existing Sake Street operational changes | Replaced by repository seed/catalogue baseline, including the two seeded tables and 71 seeded menu items; live edits from old Production are absent. |
| Existing public QR URLs/tokens | Invalid after the frontend points to the new project. New tokens must be issued; old QR signs must be replaced or redirected only after approval. |
| Existing payment/order links | No historical compatibility or reconciliation is provided. New ledger starts empty. |
| Old project after acceptance | Do **not** delete/reset it in this runbook. Decommissioning requires a separate retention, finance, legal, backup, and destruction approval. |

Obtain written acknowledgement from the business owner that loss of live historical state and forced user re-enrolment are intended before proceeding.

## 5. Gate A — approval and freeze

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Freeze non-cutover application, schema, Netlify, and secret changes. | One approved source baseline and one change owner. | Release SHA is exactly `6a0915d895079313fc50ec03b20a296432e18d4a`; source has no unreviewed hotfix. | Any SHA drift, emergency change, or missing approval. Re-run release verification on the final SHA. |
| Confirm this is a new-project clean cutover, not an in-place reset. | Scope matches this runbook. | Change record explicitly excludes Production migration replay/reset and convergence material. | Anyone proposes applying migrations to the old Production project. |
| Confirm timing and support coverage. | A quiet window with restaurant/business authority is available. | Business owner approves the stated acceptance window and QR-sign/table update plan. | Active service period, no support coverage, or no customer-impact approval. |

## 6. Gate B — create the new Supabase project

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Create a new Production Supabase project through the approved organisation account. | Empty project with Database, Auth, API, and logs enabled. | Project identity, region, plan, backup/PITR settings, and authorised operators are recorded; no application tables/data already exist. | Existing project selected, wrong organisation/region, unexpected data, or insufficient backup/administration controls. |
| Configure only required project-level settings and secret storage. | Auth/API and email provider can support the application without exposing privileged keys. | Approved site/redirect URLs, email delivery, rate limits, and operator-only secret storage are reviewed. | Service role would enter client code, redirect URL is wrong, email delivery cannot be verified, or an unapproved provider/config change is required. |
| Keep the project unreachable by public live traffic. | Bootstrap occurs without customer orders. | Netlify remains locked on old deploy; no public frontend uses the new project URL. | Any live route already points at the new project. |

## 7. Gate C — canonical schema bootstrap

**Required migration inventory, in lexical order (21 files):**

`001_initial_schema.sql`, `002_platform_admin.sql`, `003_restaurant_staff_invites.sql`, `004_role_hardening.sql`, `005_all_round_staff.sql`, `006_function_permission_hardening.sql`, `007_explicit_data_api_grants.sql`, `008_authoritative_option_pricing.sql`, `009_reporting_layer.sql`, `010_advisor_index_rls_tuning.sql`, `011_consolidate_rls_policies.sql`, `014_payment_records.sql`, `016_seed_sake_street_test_tenant.sql`, `017_seed_sake_street_categories.sql`, `018_record_restaurant_order_payment.sql`, `021_set_sake_street_brand_assets.sql`, `022_seed_full_sake_street_menu.sql`, `023_complete_sake_street_menu_categories.sql`, `024_finalize_sake_street_brand_assets.sql`, `20261001115919_canonical_public_qr.sql`, and `20261001115923_payment_membership_fail_closed.sql`.

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Prepare the canonical migration bundle directly from pinned commit `6a0915d...`; independently count and hash the 21 files. | Exact known-good fresh-stack input. | Names/count match the inventory above; no `production-convergence-migrations` content is present. | Count/name/hash mismatch, convergence material, or unreviewed SQL. |
| Apply the canonical bundle once to the empty **new** project using the approved controlled migration workflow. | All 21 migrations succeed in order with no manual patch SQL. | Migration history and object inventory show each canonical migration; deployment log records successful completion. | Any SQL error, partial application, manual repair request, or permission/RLS/grant anomaly. Keep traffic on old deploy; discard/recreate the new project rather than improvising. |
| Verify database protection boundaries. | Public QR remains token-scoped; tenant/RLS/ACL/payment/Kitchen protections are intact. | Confirm RLS for QR/operation/audit/payment tables; anon execute access is restricted to the three public QR RPCs; obsolete public/legacy RPC access is absent; authenticated roles retain least privilege. | Any anonymous restaurant-wide read, unexpected function EXECUTE, missing RLS, weakened grant, or changed payment/Kitchen authorisation. |

## 8. Gate D — Sake Street seed and catalogue

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Confirm seeded Sake Street tenant after canonical bootstrap. | Repository baseline exists. | Slug is `sake-street`; 12 categories, 71 menu items, and 2 tables exist; catalogue is visible to an authorised member only. | Count/tenant/table/menu mismatch, duplicate seed, or unauthorised catalogue access. |
| Compare required opening-day menu/table facts with business approval. | The intentional clean baseline is usable. | Business owner signs off table names/numbers, open/active state, menu availability, price/options, and brand assets. | Any required current Production edit is missing. Do not hand-edit without a separately approved, auditable configuration step. |

## 9. Gate E — Auth, operators, and memberships

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Provision at least two authorised initial owner/operator accounts in the new Auth project through the approved process. | Recoverable administrative access exists. | Each operator signs in, resolves the Sake Street membership/profile, and can access only their tenant. | Login, redirect, email delivery, profile resolution, or tenant isolation fails. |
| Assign only necessary Sake Street roles. | Owner/manager administer QR; Kitchen operates lifecycle; Front Desk/payment roles follow least privilege. | Owner/manager can administer QR metadata/tokens; unauthorised staff cannot. Kitchen/staff/cashier/outsider cross-role denials are observed as appropriate. | Broad role assignment, a staff QR-admin success, cross-tenant data, or a payment/Kitchen privilege escalation. |
| Communicate user impact before traffic change. | Staff know they must use new accounts and memberships. | Staff onboarding and recovery instructions are delivered; no one expects existing old-project sessions to work. | User/recovery owner not ready. |

## 10. Gate F — QR issuance and physical rollout

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Have an owner or manager issue a new QR token for each active Sake Street table. | One current token per table, with issuer/rotation audit metadata. | Dashboard token metadata shows active token state without exposing raw token secrets; only the issuer receives the QR URL for print/display. | Token cannot be issued, raw token appears in admin listing/logs, unauthorised staff can administer, or table/tenant mismatch occurs. |
| Test rotation/revocation before printing. | Previous token fails closed; new token works only for its table. | Old/revoked token context, submit, and status requests are denied; replacement token cannot read old-token orders. | Revoked token works, token accesses another table/tenant, or expiry is ignored. |
| Replace physical/table QR material immediately before or at traffic change. | Customers receive only current new-project tokens. | Operator scans each displayed QR and confirms intended table context. | Any old QR remains in customer reach or printed URL/table is wrong. |

## 11. Gate G — backend/API contract before traffic

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Use only approved test identities and test orders in the new project to exercise real Auth/API interfaces. | Application-facing services agree with the canonical database. | Password/session acquisition; membership/profile; authorised catalogue; owner/manager QR issue/rotation; anonymous context/submit/status; invalid/revoked/expired/cross-tenant denials; same-key idempotency creates one order; Kitchen lifecycle; Front Desk payment ledger. | Any auth, PostgREST, RPC, RLS, ACL, tenant, idempotency, Kitchen, or payment failure. |
| Verify minimum public surface. | Anon callers have no restaurant-wide data path. | Only `get_public_qr_order_context`, `submit_public_qr_order`, and `get_public_qr_order_status` are executable for anon; all require a valid current token. | Extra public EXECUTE grants, direct table reads, legacy public RPCs, or token bypass. |
| Clear only authorised test operational data if a clean opening state is required. | Opening data is intentional and auditable. | Business owner signs off the empty/new order and ledger state. | Clearing would remove real transactions or requires unapproved destructive SQL. |

## 12. Gate H — Netlify/frontend sequencing

The old Production deploy remains locked on `c465448...` until the change-control owner authorises this gate. Prepare the new frontend using the approved Netlify build/configuration workflow, with only the new project’s client-safe URL/key and approved non-secret settings. Do not expose service-role or payment secrets.

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Produce and inspect the candidate frontend build against the new Supabase project without publishing it to the Production custom domain. | Candidate uses only intended client-safe configuration. | Build succeeds; source/release SHA matches `6a0915d...`; browser/API pre-traffic tests pass; no secrets in assets or build logs. | Wrong SHA/project, build failure, exposed secret, CSP/RPC/auth error, or unapproved Netlify change. |
| Confirm rollback target still exists immediately before publish. | Old experience can be restored. | Locked deploy `6ab915...` still references `c465448...`; rollback operator has authority. | Target is absent or deployment state changed unexpectedly. |
| **FIRST TRAFFIC-CHANGING ACTION:** after explicit go approval, publish/promote the approved candidate so `app.aveniq.com.au` serves the frontend configured for the new Supabase project. | New browser sessions and customer QR requests now reach the clean stack. | Record exact time, deploy ID, commit, configuration approval, and first successful browser/API smoke. | Do not proceed if approval is absent or any pre-traffic gate is incomplete. If this action creates errors, invoke section 15 immediately. |

Live customer orders or payments after this action make rollback materially more complex because state can split between old and new projects.

## 13. Gate I — Production smoke immediately after traffic change

Use named operator accounts, one approved test table/token, and business-authorised test order/payment only. Record request IDs/screenshots/log links without recording passwords, raw QR tokens, or payment secrets.

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Sign in as owner/manager and resolve Sake Street. | Correct membership and dashboard load. | `/dashboard/sake-street/dashboard` shows only Sake Street and no auth/RLS/PostgREST error. | Login/profile/tenant failure. |
| Check Kitchen and Front Desk. | Authorised operational surfaces load. | Kitchen accepts only valid lifecycle transitions; Front Desk sees intended tables and canonical payment controls; unauthorised roles are denied. | JavaScript/API error, cross-tenant data, payment authorisation issue, or Kitchen lifecycle breach. |
| Scan public QR and open `/order/<token>`. | Token-scoped catalogue/context only. | Correct restaurant/table/menu loads; invalid/revoked/expired token is denied; no anonymous restaurant-wide read. | Wrong table/tenant, public data exposure, or invalid token success. |
| Submit one approved public order and retry with the same idempotency key. | Exactly one order is created. | Public status works only for correct token/order; changed/cross-token use is denied. | Duplicate order, tracking bypass, failed order, or unexpected client/RPC error. |
| Progress the order through Kitchen and confirm status tracking. | New → Preparing → Ready → Served behaves consistently. | Customer status shows authorised lifecycle result; no invalid transition succeeds. | State mismatch or cross-role transition. |
| Perform one business-approved payment test if payments are live. | Canonical ledger records trusted amount; no duplicate/overbalance. | Ledger/receipt reflects one operation; partial/full rules and role authorisation hold. | Wrong amount/status, duplicate ledger entry, overbalance, or payment-provider discrepancy. Stop payment acceptance and escalate. |

## 14. Dashboard refresh observation (observation only)

This runbook does **not** authorise a dashboard refresh-flash fix. Observe and record it only:

| Operator action | Expected result | Verify | Stop / escalation |
| --- | --- | --- |
| Refresh `/dashboard/sake-street/dashboard` while signed in and observe the first five seconds. | No signed-out/Sign-in flash; ordinary loading state may appear briefly. | Capture timestamped browser evidence and console/network result. | If an auth flash is accompanied by failed session, failed membership, RLS/API errors, or user-blocking loss of access, stop the cutover and use section 15. A cosmetic flash without those failures is recorded as a non-blocking observation for separate work; do not fix it in this cutover. |

## 15. Rollback decision tree

**Never reset or delete either project as an incident reflex. Preserve logs, deploy IDs, order/payment references, and timestamps first.**

1. **Failure before the first traffic-changing action** — leave the old locked deploy live. Keep the new project private; correct the issue in a new controlled rehearsal/project as appropriate. No customer-data reconciliation is needed.
2. **Failure after traffic change, with no real customer order or payment accepted on the new project** — stop ordering/payment entry, restore the prior locked Netlify deploy/configuration through the approved rollback operator, verify the old site is again serving `c465448...`, and retain the new project for investigation. Do not delete it until evidence is captured.
3. **Failure after one or more real orders or payments on the new project** — declare a split-data incident. Pause the affected operational/payment flow and preserve both projects. Do **not** automatically switch back: doing so can split orders, statuses, users, and payment ledger state between old and new projects. The business/finance incident owner must choose between (a) retaining new traffic and applying a narrow fix, or (b) switching traffic back with a documented manual reconciliation/recovery plan for every post-cutover order/payment. Historical compatibility was out of scope, but post-cutover live transactions must be handled deliberately.
4. **Security, tenant-isolation, payment-authorisation, duplicate-order, or public-token bypass** — immediately stop the affected public/operational surface, retain evidence, notify the security/business incident owner, and do not resume traffic until a separately approved remedy passes full affected verification.

## 16. Acceptance window, objective go/no-go, and closeout

### Practical acceptance window

Use a minimum **60-minute actively staffed** window after the first traffic-changing action, extending through the first meaningful order/Kitchen/Front Desk/payment cycle. Maintain the old project and locked old deploy for the whole window. Do not decommission the old project during this runbook.

### Objective go/no-go criteria

**Go only when all are true:**

- written business owner approval acknowledges clean-state loss and user re-enrolment;
- gates A–H are recorded as passed, including exact `6a0915d...`, 21 canonical migrations, seed counts, role/QR/API gates, backup references, and rollback owner;
- candidate build contains no privileged secret and passes pre-traffic testing;
- old locked deploy `6ab915...` / `c465448...` is still available;
- staffing, QR replacement, support, finance/payment decision owner, and 60-minute acceptance coverage are present.

**No-go / stop when any are true:**

- wrong source SHA, migration count, unexpected object/data, convergence material, or partial bootstrap;
- any RLS/ACL/public-token/tenant/idempotency/payment/Kitchen/auth failure;
- auth/operator recovery or QR physical rollout is incomplete;
- no rollback resource/decision owner, or a live transaction exists while rollback intent is unclear;
- Netlify candidate/Production configuration differs from approved scope.

### Closeout

At the end of the acceptance window, the release owner records smoke results, incident/observation results, final deploy ID, new-project identifier, QR rollout confirmation, and business sign-off. Keep the old project and rollback deploy under the approved retention policy. A later decommission or data-destruction action requires its own explicit approval and runbook.

### CUTOVER PLAN STATUS

`CUTOVER PLAN READY — EXECUTION NOT STARTED`

No Production, Supabase, Netlify, or traffic action is authorised by this document.
