# Password recovery review evidence — 2026-10-13

Base: approved release `28840a03c50ceab77fa34c74da550786d2d18d80`.

## Implementation

- `index.html`: normal login exposes Forgot password; shared branded recovery form has email, password confirmation, expiry/retry and success states.
- `app.js`: dedicated recovery routing and form state handling; skips restaurant/staff startup fetching on recovery routes; prevents repeated in-flight submits.
- `supabase-client.js`: existing configured public Auth endpoint receives normalized recovery email via POST `/auth/v1/recover?redirect_to=...`, with exact `https://app.aveniq.com.au/reset-password` callback. Non-enumerating email-request response. Only recovery fragments enable the password form, after GET `/auth/v1/user` validation. Tokens are stripped from the URL and held only in memory; existing stored login is never used for the password update. PUT `/auth/v1/user` changes the password and best-effort local recovery-session logout follows success. A reload requires a new recovery link.
- `tests/test-password-recovery.mjs`, `tests/test-password-recovery-ui.mjs`: mocked Auth and UI state regressions. No new dependencies or migrations.

The existing release build requires an explicit public configuration pair. For eventual cutover, that pair must target `https://wxdihentihrijtfkmwgq.supabase.co` with its matching publishable key. This fix does not change the checked-in legacy development config or Netlify configuration. No service credential is used.

## Validation

Passed: both new regression files; `node --check app.js`; `node --check supabase-client.js`; `pnpm run build`; `node tests/test-build-public-supabase-config.mjs`; `node tests/test-cutover-credential-safety.mjs`; `node tests/test-app-host-membership-routing.mjs`; `node tests/test-cutover-secret-leak-scan.mjs`; `git diff --check`.

Also passed an offline Production-mode site build with the intended new project URL and a fake publishable test key. This checks packaging, not connectivity or real credentials. Build emits an existing outdated Browserslist database notice. No lint/typecheck script is configured.

## Reviews and release considerations

Independent security review found no confirmed blocking auth/security defect. Existing login, signup and invite Auth adapter behavior is covered by regressions. Recovery tests cover exact callback, normalized email, provider errors with generic responses, session parsing, absent/wrong-type/malformed/expired/server-rejected links, password mismatch/minimum length, update authorization, one-time local consumption, UI success/error/retry states and repeated submissions. Existing credential gates scan source and generated dist.

Production email delivery, SMTP template preservation of recovery confirmation URL, redirect allowlist and real expired-link acceptance remain manual pre-release verification. The 2026-10-12 preflight reports the intended reset redirect is already allowed, but this task does not assert live end-to-end verification. No merge, deployment, Netlify/DNS/traffic action or database/schema mutation is included.

Independent QA/UX review: `node "$env:TEMP/aveniq-recovery-review.mjs"` passed using a disposable local server and headless Chrome CDP, with all external Auth requests mocked. Verified request/success, fragment clearing, mismatch without PUT, update success, one PUT on immediate repeated submit, expired-link fallback, existing login visibility, and no horizontal overflow at 375/768/1280px. No uncaught JS errors. A confirmed mobile customer-navigation defect was fixed and retested; dependency-free UI regression now guards it. No unresolved confirmed QA/UX defects. Scratch browser harness is outside the PR.
