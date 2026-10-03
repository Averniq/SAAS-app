# Production clean-state cutover runbook

**Status: PLAN ONLY — execution requires a separate explicit approval.** This document does not authorise access to Production Supabase, Netlify, DNS, payment providers, or any traffic change.

## 1. Release identity and scope

The clean baseline is the canonical migration set at the final approved `origin/main` commit. The previous clean-stack gate was verified at `6a0915d895079313fc50ec03b20a296432e18d4a`; after cutover-tooling hardening merges, record the new merged commit and repeat the release gate for that exact SHA. A deploy is identified by **both** that immutable source SHA and the generated public-config artifact described below.

Historical Production data, Auth users, payment/order compatibility, old QR tokens, and old Sake Street operational edits are intentionally not migrated. Do not use `production-convergence-migrations` for a fresh project.

## 2. Operators, inventory, and secrets

Record names, owners, change IDs, and evidence locations only. Never record values for passwords, service-role keys, JWT secrets, SMTP credentials, payment secrets, or raw QR tokens.

| Resource | Owner responsibility |
| --- | --- |
| New Supabase project | Empty Database/Auth/API project, backup/PITR policy, operator access, logs |
| New project public configuration | Build-time `AVENIQ_SUPABASE_URL` and `AVENIQ_SUPABASE_PUBLISHABLE_KEY` only |
| Operator-only bootstrap credential | Runtime-only `AVENIQ_SUPABASE_SERVICE_ROLE_KEY`; never browser, source, Netlify client artifact, or logs |
| Initial owner | Exact email and seeded restaurant slug; second owner arrives through normal owner invitation |
| Netlify Production site | Candidate build, rollback deploy, publish authority, deploy log retention |
| QR physical pack | New signs by table; sealed/labelled old-sign rollback pack |
| Business/finance/security incident owners | Go/no-go and split-data decisions |

## 3. Backup and rollback resources

Before any traffic change, capture a time-stamped old-project provider backup/PITR/export reference, the existing Netlify Production deploy reference, the final source SHA, migration inventory/hash evidence, and named rollback contacts. The old project is retained through the acceptance window; this runbook never resets or deletes it.

## 4. Destructive consequences

The recommended new-project bootstrap does not delete old-project objects. Once traffic moves, the following state is absent from the new project: restaurant/table/menu edits, memberships, Auth accounts/sessions, QR tokens/audits, orders, payment ledger/audit history, and historical payment/order links. Existing users must re-enrol; old QR signs are invalid. Obtain written business acknowledgement before Gate A.

## 5. Gate A — freeze and new-project creation

| Action | Expected / verify | Stop |
| --- | --- | --- |
| Freeze unrelated source, schema, Netlify, secret, DNS, and payment changes. | Final source SHA, owner, change window, and 60-minute staffed acceptance period are recorded. | SHA drift, no business approval, or no rollback owner. |
| Create a **new** Supabase project. | It is empty, in the approved organisation/region, with backups/logs/Auth/API enabled. | Existing project selected, unexpected app data, or unavailable recovery controls. |
| Configure Auth and delivery. | Approved site/redirect URLs, email/SMTP, rate limits, and recovery contacts work. | Redirect/email/login recovery failure. |

## 6. Gate B — canonical database bootstrap

Apply only the final release's 22 canonical files from `supabase/migrations/`, in lexical order, to the empty **new** project. Confirm the migration inventory has no convergence material and record the controlled migration output. This set includes the service-role-only atomic initial-owner claim; do not substitute direct `restaurant_staff` inserts. Its schema, SECURITY DEFINER function, and ACL creation use one explicit transaction; `NOTIFY pgrst` follows the successful commit. A failed creation cannot expose a partially installed/default-public bootstrap function. Do not apply manual patch SQL, disable RLS, broaden grants, or repair an old project ledger.

Verify the fresh seed: Sake Street slug, 12 categories, 71 menu items, and 2 tables. Stop for any migration/object/count mismatch, public restaurant-wide read, unexpected anon execute grant, missing RLS, payment authorisation change, or Kitchen lifecycle change.

## 7. Gate C — trusted Auth and initial owner bootstrap

The Sake Street seed does not create an initial Auth user or owner membership. Do not use self-signup, browser code, or the test-account provisioner to cross this trust boundary.

1. An authorised operator creates or identifies the exact initial owner Auth email in the **new** project.
2. From a controlled operator host only, run `scripts/bootstrap-initial-owner.mjs` with the exact `--email` and `--restaurant-slug sake-street`; provide `AVENIQ_SUPABASE_URL` and runtime-only `AVENIQ_SUPABASE_SERVICE_ROLE_KEY`. Only `https://<project-ref>.supabase.co` origins are accepted for hosted projects. Reject application paths (including normalized dot paths), userinfo, queries, fragments, deceptive suffixes, and non-default hosted ports. Local tooling requires `--allow-local` and an explicit `localhost`, `127.0.0.1`, or `[::1]` origin; LAN/arbitrary hosts and numeric loopback aliases are not allowed. Requests reject redirects and never print remote error bodies or credentials. Use `--dry-run` first; it validates atomically without writing, but does not reserve the bootstrap slot.
3. The tool refuses a platform administrator, a different existing owner, or a non-owner existing membership; its service-role-only database claim binds one owner atomically. A retry fails closed with `INITIAL_OWNER_ALREADY_BOUND`; stop and verify the existing owner rather than retrying. Designate one operator and stop any concurrent attempt. It never loads `.env`, browser configuration, or test-fixture provisioning code.
4. Verify the owner can sign in, resolve only Sake Street, and access the dashboard. Create the second owner through the normal owner invitation flow. Then assign only required manager/staff/kitchen/cashier memberships.

Stop if the dry run differs from the intended email/slug/action, any conflict occurs, or a service role would be exposed outside the controlled operator process.

## 8. Gate D — QR issue, physical set, and pre-traffic tests

After owner membership is verified, issue a new current token for every active seeded table. Verify owner/manager administration, staff denial, metadata without raw token plaintext, rotation/revocation/expiry denial, anonymous context/submit/status, cross-token/tenant denial, and same-key idempotency.

Prepare two labelled physical sets: **NEW** signs for the new project and sealed **OLD rollback** signs. Scan every NEW sign on a fresh browser before traffic. Do not destroy OLD signs until retention/decommission approval.

## 9. Gate E — generated public configuration artifact

The frontend reads `window.TABLEORDER_SUPABASE.url` and `window.TABLEORDER_SUPABASE.publishableKey` from the generated `dist/supabase-config.js` artifact. These fields are intentionally browser-visible; they are not service credentials.

| Build mode | Required behaviour |
| --- | --- |
| Production | `CONTEXT=production` always enforces production mode; it cannot be downgraded using `AVENIQ_PUBLIC_CONFIG_MODE`. For standalone builds set `AVENIQ_PUBLIC_CONFIG_MODE=production`. Supply both `AVENIQ_SUPABASE_URL` and `AVENIQ_SUPABASE_PUBLISHABLE_KEY` explicitly in the approved Production build context. The URL must be the HTTPS project origin only (no path/query/fragment). Missing/incomplete public values fail the build. Service-role and secret values are rejected. |
| Netlify deploy preview / branch deploy | `CONTEXT=deploy-preview` and `CONTEXT=branch-deploy` always select preview behaviour, even with a development mode override. With no public pair, the build succeeds with a static **Backend disabled** page, empty URL/key configuration, no app scripts, and `connect-src 'none'`. It contains no checked-in backend fallback and cannot issue Supabase requests. This successful disabled artifact can replace a previously unsafe preview alias. A complete explicit disposable pair enables the application after strict shared URL/key validation; partial/invalid pairs fail closed. |
| Local preview / development | Set `AVENIQ_PUBLIC_CONFIG_MODE=preview` or `development` (development is the standalone default). Supply an explicit public URL/key pair to enable the app. Without both values the build produces the same disabled artifact; it never reads the checked-in hosted config. Loopback is accepted only outside Production. Serving source files directly bypasses the generator and is not an approved local validation path; build and serve `dist/` instead. |
| All modes | `AVENIQ_SUPABASE_SERVICE_ROLE_KEY` is ignored by the frontend build and must not appear in `dist/`. |

Scope public configuration separately to the approved Netlify contexts. Do not share Production values with deploy-preview/branch-deploy: an explicit pair is an operator-approved backend selection, not an automatic proof that a hosted project is disposable. Verify preview artifacts and the served `/supabase-config.js` before using a configured preview. Disabled previews must show empty `url` and `publishableKey`; the configured-backend verifier intentionally rejects these. Check disabled previews in a fresh browser, and reload previously open previews so old in-memory clients do not persist. No Production environment edits are authorised by this runbook update.

Build the candidate from the final approved SHA. Retain its deploy ID and a configuration approval record; configuration is an artifact input, not a source commit. Before publish, use `scripts/verify-public-supabase-config.mjs` against the candidate URL with the expected new-project URL. It must confirm the served config origin and reject missing/service-role configuration. Stop if source SHA, generated config origin, CSP, or asset inspection differs from approval.

## 10. Gate F — compatibility boundary and cache control

There is no compatible cross-project session, token, or order window. Old browser tabs may retain old configuration until reload; new browser sessions must use the new project and require new Auth login. Before traffic change, announce a hard re-login/reload boundary to staff and stop accepting new orders on old open tabs at the agreed cutover time.

The deployed headers must keep `/supabase-config.js`, application JavaScript/CSS, and service worker mutable/no-cache as configured. Verify the candidate in a fresh private browser and a previously used browser: update/reload the service worker, fetch the served config, sign in, and scan a new QR. Stop if either browser reaches the wrong project or shows auth/RPC/RLS/CSP/JavaScript failures.

## 11. Gate G — Netlify sequencing

Retain the currently locked old Production deploy and its configuration artifact as rollback evidence. Build and test the candidate without assigning the Production custom domain. Reconfirm the old deploy immediately before cutover.

**FIRST TRAFFIC-CHANGING ACTION:** after every preceding gate and explicit business go approval, publish/promote the approved candidate so the custom domain serves the generated config for the new project. Record time, source SHA, Netlify deploy ID, expected config origin, and QR physical-set transition.

Live orders or payments after this action make rollback materially complex because state can split between projects.

## 12. Gate H — immediate Production smoke

Using approved operator/test identities only, verify: Auth session; membership/profile; authenticated catalogue; owner/manager QR administration; invalid/revoked/expired QR denial; public order context/submission/status; one-order same-key replay; customer status restricted to correct token/order; Kitchen New → Preparing → Ready → Served; Front Desk canonical ledger/payment role checks; and cross-tenant denial. Capture safe request/deploy/log references only.

Refresh `/dashboard/sake-street/dashboard` and observe the first five seconds. Record an auth flash only as an observation; do not implement the dashboard-flash fix here. Stop if it coincides with failed session, membership, RLS/API, or loss of access.

## 13. Rollback decision tree

1. **Before first traffic:** old deploy stays live; keep new project private and correct/rehearse without customer reconciliation.
2. **After traffic, no real order/payment:** pause ordering, restore the old deploy **and its old generated config artifact**, verify a fresh/private and previously used browser have updated service-worker/config state, replace NEW signs with OLD rollback signs, then scan each OLD sign and perform a safe public context check. Stop public QR ordering if this coherent rollback cannot be proven.
3. **After real new-project order/payment:** declare a split-data incident. Preserve both projects, logs, deploy/config artifacts, QR sets, order/payment references, and timestamps. Do not automatically switch back. Business/finance chooses either retaining new traffic while a narrow fix is made, or a documented manual reconciliation/recovery plan for every post-cutover transaction.
4. **Security/tenant/payment/idempotency/public-token failure:** immediately stop the affected surface, preserve evidence, and require a separately approved remedy plus full affected verification.

## 14. Acceptance and closeout

Maintain a minimum 60-minute actively staffed acceptance window through a meaningful public order, Kitchen, Front Desk, and (if live) payment cycle. Keep the old project, old deploy/config artifact, and OLD QR set throughout the window. Close only with recorded smoke results, final deploy/config identity, QR confirmation, observations/incidents, and business sign-off. Decommissioning or old-data destruction requires a separate approved runbook.

## 15. Objective go/no-go

**Go:** final SHA and canonical inventory match; new project/bootstrap/seed/Auth/QR/API/config/browser gates pass; old deploy/config/QR rollback resources exist; business/finance/security and support coverage are present.

**No-go:** any bootstrap conflict; missing public build variables; generated/served config mismatch; secret in `dist`; stale browser/service-worker wrong-project behaviour; physical QR mismatch; migration/RLS/ACL/tenant/idempotency/payment/Kitchen failure; or uncertain rollback choice after a live transaction.

## 16. Plan status

Before browser smoke, run the URL/credential, bootstrap script, generated-config, and fresh local database gates. Use `node tests/test-cutover-credential-safety.mjs`, `node tests/test-initial-owner-bootstrap-contract.mjs`, `node tests/test-initial-owner-bootstrap-database-contract.mjs`, `node tests/test-build-public-supabase-config.mjs`, and `node scripts/run-local-supabase-integration-gate.mjs`. The local runner creates unique disposable Docker resources and never accepts hosted database inputs. Held browser runs must not print/save passwords; private in-memory handoff is required. Check the actual served `/supabase-config.js` with `scripts/verify-public-supabase-config.mjs --base-url <candidate-origin> --expected-url <approved-supabase-origin>` (`--allow-local` for disposable loopback only). Record the final hardening/merged SHA, not the earlier baseline SHA, as the eventual release identity.

`CUTOVER PLAN READY — EXECUTION NOT STARTED`

No Production Supabase, Netlify, configuration, deployment, DNS, payment, or traffic action is authorised by this document.
