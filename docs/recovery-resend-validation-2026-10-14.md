# Recovery resend validation

Base: e806714c89c68b476780e996c2b2e462ee78c794. Changes are isolated on codex/recovery-resend-preservation. Production remains locked on deploy 6ace0e6c4ee8ce508f8cbb47; this PR does not deploy or alter that release.

## Defect and constraints

The exact base implementation fails the new real-SDK test: successful /recover, followed by HTTP 429 resend, deletes the previously stored verifier. The first-email callback then cannot exchange. The test was run against git-show source from the exact base and failed the verifier-preservation assertion. The corrected implementation passes that assertion, exchanges the first email code and updates the password.

Pinned @supabase/auth-js 2.99.1 resetPasswordForEmail generates and stores a new verifier before dispatch, and removes it on an Auth error. Supabase Auth also creates recovery flow state before sending mail/checking the email cooldown. Restoring the previous verifier after an error would therefore risk a mismatched challenge. Sources: node_modules/@supabase/auth-js/dist/module/GoTrueClient.js resetPasswordForEmail and lib/helpers.js getCodeChallengeAndMethod; https://github.com/supabase/auth/blob/master/internal/api/recover.go. The observed live flow-state sequence was consistent with this ordering.

## Approved design

One active recovery verifier retains its original creation time and one-hour maximum lifetime. Every request within that lifetime uses its S256 challenge, including failures and ambiguous network responses. The initial verifier is persisted before network dispatch so an accepted request with a lost response can still recover. No resend extends its lifetime. Expired/malformed state is removed on access.

A dedicated cached SDK request client uses temporary in-memory storage, cleared after every request. An application fetch wrapper derives the outbound recovery challenge from the bounded active verifier. SDK error cleanup affects only temporary storage. SDK source, version and bundle entry point are unchanged.

Web Locks serialize requests, callback consumption and final cleanup across tabs. A shared 60-second deadline is set before dispatch, regardless of outcome. Concurrent/early requests never dispatch. Browsers without Web Locks fail closed. The UI displays a countdown, suppresses immediate retry and instructs users to open only the newest email in the same browser. Responses remain neutral and do not reveal eligibility or raw provider errors.

Normal login storage stays separate. Exact callback remains https://app.aveniq.com.au/reset-password. Signed recovery AMR, Auth identity validation and recovery-only SDK context remain mandatory. Ordinary JWTs, relabelled normal PKCE codes and implicit fragments remain rejected. Supabase-invalidated tokens remain rejected; preserving a verifier cannot revive them. Successful update and failed recovery validation clear local authority even if logout fails. One-time callbacks remain one-time at Auth.

Security review also found an exception-cleanup race across tabs. Cleanup now stays inside the same Web Lock; an in-memory rollback reproduced 2 requests instead of 1 during delayed logout, and the fixed regression proves a new verifier cannot be erased by late cleanup.

## Executed verification (all final checks passed)

- pnpm install --frozen-lockfile --ignore-scripts (no dependency changes)
- node --check app.js and supabase-client.js
- pnpm run test:password-recovery: Auth/adversarial, resend and UI suites
- pnpm run test:password-recovery:browser: real bundled SDK in isolated Chrome at 375/768/1280; two independent tabs, rapid clicks, shared cooldown,429 preservation, expiry, replay, validation, normal login isolation
- pnpm run build with CONTEXT=production, new Production project URL and a disposable public test key; no live key or backend writes required
- node tests/test-app-host-membership-routing.mjs
- node tests/test-cutover-credential-safety.mjs
- node tests/test-cutover-secret-leak-scan.mjs:143 built files; staged changed-file scan also performed before commit
- git diff --check

An ambiguous first-request response also retains a matching bounded verifier and passes code exchange in the mock. 400/429/500 and ambiguous network failures preserve the initial verifier and first-email exchange. Multiple successful resends use the same challenge and timestamp. Cross-tab simultaneous requests dispatch once; cooldown is shared. Expiry clears state and permits a new bounded verifier. Successful password change clears verifier/cooldown and local recovery authority. Logout-failure cleanup, malformed/forged/ordinary callbacks and replay are covered. Service-worker navigation regression passes in the UI suite; service worker itself is unchanged.

Independent QA/UX review: no confirmed blockers at 375/768/1280. Independent security review: no remaining confirmed blockers after cleanup-race fix. Request-client reuse avoids accumulating idle SDK listeners/channels. No normal login/signup/invite behavior changed.

## Scope and acceptance

The local SDK bundle SHA256 is 17d955c884ccfa7a103292a676178d6dc04860620f6e9a30d1e203929280e941, identical to the approved release bundle. No CDN/CSP dependency was added.

No migrations/schema/RLS/ACL, database, public QR, SDK internals or dependency changes. No Production backend replay, email send, Auth configuration, Netlify environment/deploy, DNS or traffic changes. All automated Auth requests use mocks; browser networking blocks external destinations. Draft PR only: no merge or deploy. Manual live resend acceptance belongs to a separately authorized post-deploy check; it was deliberately not run here.
