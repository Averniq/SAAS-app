# Aveniq controlled traffic cutover preflight

Date: 2026-10-12, Australia/Sydney. Preflight only; traffic switch is not authorized by this record.

Approved release: `28840a03c50ceab77fa34c74da550786d2d18d80`.
New backend: Aveniq-Production-New, `wxdihentihrijtfkmwgq`.
Old backend: `hrmrofnacqfuxqeimuzs`.
Netlify site: `3870e1c5-2f96-4b89-916e-0eead4bb37f7` / aveniq-saas.

## Result: NO-GO

1. Operator reports real Brevo confirmation-mail delivery evidence, but new-project password-reset receipt and end-to-end redirect verification have not been demonstrated. No email was triggered during this preflight. SMTP credentials were not read.
2. Netlify has no site environment variables, and its team environment-variable list is empty. The release's production build requires `AVENIQ_SUPABASE_URL` and `AVENIQ_SUPABASE_PUBLISHABLE_KEY`. The production-mode build correctly rejects their absence. Do not unlock or deploy until the approved configuration action is separately authorized and verified.

## Verified evidence

- Published deploy remains ready and locked: `6ab9159972636300087c5022`, commit `c465448f024640977ddc2c7b90d494b548594570`. API lock flag and dashboard "Publishing is locked to this deploy" both agree.
- `https://app.aveniq.com.au/supabase-config.js` still binds to `https://hrmrofnacqfuxqeimuzs.supabase.co`. It matches the immutable locked-deploy config byte-for-byte. Browser credential validated as publishable; no service credential is present in that config.
- Old backend Auth health endpoint is reachable (v2.197.0). Only a health GET was made; no old-backend SQL, Auth mutation, migration or data write was issued.
- Approved merged SHA is retrievable from GitHub. Its only differences from the previous approved release are the focused adapter fix and two regression files. No migration/schema/ACL/RLS action is required.
- A local production-mode build using the intended new-project URL and already verified browser-safe publishable key passed. The key is not printed here. Credential scan passed: 13 source/staged files and 142 dist files. No Netlify variable was changed. This proves the intended pair works, not that Netlify currently supplies it.
- New Auth Site URL is `https://app.aveniq.com.au/`. Exactly three redirect URLs are configured: `https://app.aveniq.com.au/`, `https://app.aveniq.com.au/verify`, `https://app.aveniq.com.au/reset-password`. No settings were edited. End-to-end reset link consumption remains unverified while the live domain still targets the old backend.
- New backend retains nine active tables, nine public QR records and nine issuance audit records. No QR rotation/recreation occurred during preflight. Test order #1 remains completed/Served, total $4, unpaid (`paid_at` NULL), with zero canonical payment operations.
- Team-level Netlify variables are empty; site environment-variable UI states "No environment variables set for this project". There is no public Netlify service-role/secret configuration to export or alter.

## Rollback package

Immutable ready, locked deploy: `https://6ab9159972636300087c5022--aveniq-saas.netlify.app`.

Downloaded deployed-files archive, preserved locally:
`artifacts/cutover-preflight-2026-10-12/rollback-deploy-6ab9159972636300087c5022.zip`.

Archive SHA-256: `3246142e31584cd90b55cf66458b865108dd8d515db3c195d1a4502717fbdd86`.

Verified 149 archive entries, 14,682,737 decompressed bytes, required frontend files present, and archive config identical to the current live old-backend config. Live config SHA-256: `bc539900ff8df9196d0efbaa704d357c9f5189e3db32f158cebd3053cf7d10e3`.

This is a frontend rollback artifact, not a database backup. Old database remains the rollback source. Before actual traffic authorization, record the provider backup/PITR/export reference, named rollback operator and business/finance decision owner, old QR physical pack, and staffed acceptance window as required by the existing runbook. Their availability is not asserted by this preflight.

## Intended configuration action — not executed

After separate authorization, supply the Production/build-scoped `AVENIQ_SUPABASE_URL=https://wxdihentihrijtfkmwgq.supabase.co` and the matching browser-safe `AVENIQ_SUPABASE_PUBLISHABLE_KEY`. Never supply a service-role/secret key. Use the exact approved SHA; verify the generated config and credential scan before any publish. Changing the variables, unlocking, deploying, promoting, DNS changes and traffic switching remain prohibited in this preflight.

## Rollback triggers

Stop the affected flow for Auth/session/membership failure; wrong-project or stale service-worker config; wrong table/tenant/QR resolution; invalid/internal/revoked-token authorization; RLS/ACL or payment-role bypass; duplicate order/payment or incorrect financial state; Kitchen/tracking inconsistency; blocking JS/CSP/RPC errors; or loss of recoverable administrative access.

## Rollback sequence

1. Before traffic changes: leave the old deploy locked and live. Do not modify either database to repair a candidate failure. Preserve evidence and resolve the preflight blockers in a separately authorized action.
2. After traffic change with no real customer transactions on the new backend: pause ordering/payment entry through the approved incident workflow; preserve timestamps, logs and deploy/config references; have the authorized rollback operator restore the immutable old deploy and its old generated configuration; lock publication to that deploy; verify the live domain resolves the old backend in fresh and previously used browsers, including service-worker refresh; restore the sealed OLD QR physical pack and scan each intended old-table context. No database reset or deletion.
3. After any real new-backend order/payment: declare a split-data incident, pause affected entry, preserve both backends and financial history. Do not automatically switch back. Business/finance decides whether to retain traffic for a narrow fix or revert with a reconciliation plan covering every post-cutover order, payment and status.
4. Security/tenant/payment/public-token bypass: stop the affected surface immediately through the approved incident workflow, preserve evidence, involve the security/business decision owner, and resume only after a separately approved remedy passes verification.
5. After a future authorized cutover: maintain at least a 60-minute staffed acceptance window and retain the old backend/deploy/QR resources. Decommissioning or destruction requires separate approval.

No Netlify unlock/deploy/env update, DNS/live-traffic change, old Production mutation, schema action, or QR mutation occurred during this preflight.
