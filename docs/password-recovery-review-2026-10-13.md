# Password recovery fix review evidence — 2026-10-13

PR #10; base approved release `28840a03c50ceab77fa34c74da550786d2d18d80`.

## Implementation

The normal login exposes Forgot password. Recovery email requests use the official Supabase Auth SDK's `resetPasswordForEmail` in PKCE mode with exactly `https://app.aveniq.com.au/reset-password`. UI responses are identical for eligible/missing accounts and provider errors.

An isolated recovery client uses a separate storage key. Only its PKCE verifier persists across page loads, expires after one hour, and is consumed by `exchangeCodeForSession`. Recovery tokens stay in memory; the ordinary login session is never imported, overwritten or signed out.

The reset page accepts a one-time query `code` and exchanges it through the official SDK. Implicit token fragments, URL `type` fields and stored login credentials never authorize reset. Acceptance requires the SDK-returned recovery context AND a server-authenticated JWT with signed `amr` containing `recovery`, valid expiry, and subject matching the Auth-validated identity. GET `/user` alone cannot establish recovery provenance. SDK 2.99.1's explicit exchange returns `redirectType: PASSWORD_RECOVERY` from its recovery verifier while emitting `SIGNED_IN`; the signed AMR independently protects against relabelled ordinary codes/verifiers.

The SDK `updateUser` changes the password after minimum-length and confirmation checks. Success clears application recovery authority, requests local recovery-session logout, and clears SDK memory even if logout fails. Missing/invalid/expired/replayed callbacks fail closed. A reload after consuming a code requires a new link. Supabase local logout revokes that session's refresh token; it does not promise instant expiry of every already-issued bearer JWT.

The request screen and invalid-link state explain that PKCE links must be opened in the same browser/origin that requested them. The production callback means requests originating from a preview cannot complete on that preview; live receipt and consumption remain the agreed post-deploy/pre-cutover-completion acceptance gate.

## Changed files

- `index.html`, `app.js`: branded recovery UI/routing, same-browser guidance, validation/retry/success, mobile navigation isolation.
- `supabase-client.js`: isolated official SDK PKCE client and recovery authorization/update/cleanup.
- `src/recovery-auth.js`, `scripts/build-site.mjs`: locally bundle the official browser Auth SDK; no CDN or CSP exception.
- `package.json`, `pnpm-lock.yaml`: pinned `@supabase/auth-js` 2.99.1 (Node 20 compatible), pinned build-only `esbuild` 0.25.12, runnable recovery test commands.
- `service-worker.js`: package the new SDK, refresh shell caches, and avoid caching recovery-code navigation URLs.
- `tests/test-password-recovery.mjs`, `tests/test-password-recovery-ui.mjs`, `tests/test-password-recovery-browser.mjs`: real-SDK mocked Auth/adversarial tests, UI-state tests, durable headless-browser coverage.
- This review evidence document.

No schema, migration, RLS, ACL, Netlify configuration or Production credential changes. Existing login/signup/invite adapter remains intact. Production builds still require the new project's matching public URL/key pair; this PR does not change the legacy checked-in development config.

## Validation

Passed after the fix:

- `pnpm run test:password-recovery` — real official SDK with a fully mocked Auth server, plus UI state tests.
- `pnpm run test:password-recovery:browser` — headless Chrome and the actual bundled SDK; all Auth responses mocked. Checks both recovery screens at each 375/768/1280px, generic errors, exact redirect and S256 challenge, genuine code, code/verifier consumption, minimum/mismatch validation, one PUT on repeat submit, cleanup, invalid/expired/replayed codes, expired verifier, forged ordinary/arbitrary tokens, normal PKCE code relabelled as recovery, stored-login isolation and login visibility. No horizontal overflow or uncaught browser exceptions. Browser runner requires Node 22+ and Chrome (`AVENIQ_CHROME_PATH` optional).
- `pnpm run build`, syntax checks, `git diff --check`.
- `node tests/test-app-host-membership-routing.mjs`.
- `node tests/test-build-public-supabase-config.mjs`, `node tests/test-cutover-credential-safety.mjs`.
- `node tests/test-cutover-secret-leak-scan.mjs` plus staged-file scan — source and generated frontend contain no service-role/secret credentials.

No lint/typecheck script is configured. Existing Browserslist database warning remains non-blocking.

## Independent reviews and remaining gate

Focused security review and browser QA found no confirmed blocking defects. The original P1 forged-fragment failure was reproduced before the fix; the updated adversarial test rejects it without sending its token to Auth. Normal login/signup/invite regressions remain green.

Real Production email delivery, intended redirect/template behavior, genuine live token AMR and complete email/code consumption remain unverified until the approved frontend is deployed to the production callback origin. No Production Auth requests were made by this work. PR remains draft; no merge, deployment, DNS/live-traffic action or backend mutation is authorized here.
