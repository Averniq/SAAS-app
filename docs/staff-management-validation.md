# Staff Management validation evidence

Branch: codex/staff-management. Base: c7adb471b4f81b310a72e37b3b5167043ebd79ff.
Scope: local-only invitation-first Staff Management; Draft PR only.

## Executed checks

- Client API/active-membership/own-password adapter: PASS (`node tests/test-staff-management-client.mjs`).
- Verified-actor/server-only reservation endpoint: PASS, 32 checks (`node tests/test-staff-invite-endpoint.mjs`).
- Responsive browser: PASS 375/768/1280 (`node tests/test-staff-management-browser.mjs`): Owner editing/confirmation/validation, Manager invite rights, Staff Customer/Kitchen/Front Desk/no Admin, protected Owner rows, duplicate/retry/idempotency, stale session cleanup, expired invitation, authenticated recipient password setup/keep password, long-email legacy suspension.
- Actual local SMTP/Auth/PostgREST: PASS baseline 35 + invitation 20 (`node tests/test-staff-invite-local.mjs`). New identity, unchanged existing identity/password, two restaurant memberships, exact recipient callback, wrong-email/expiry/replay, no unauthorized email, failed-send reservation/cooldown.
- Actual local staff database suite: PASS baseline 35 + staff 39 (`node tests/test-staff-management-local.mjs`), including ASCII/Unicode whitespace rejection, retained-JWT denial, history and QR fingerprint preservation.
- Offline Edge wrapper packaging: PASS using installed Supabase Edge runtime v1.77.1, read-only source and Docker network disabled; no dependency downloads/deploy.
- Production-mode build with synthetic public config: PASS (`pnpm run build`); no hosted backend connection.
- Public artifact credential/packaging scan: PASS, 143 files (`node tests/test-staff-release-artifact.mjs`). Build public config and cutover URL/credential safety tests PASS.
- Existing routing VM/browser, recovery PKCE/adversarial/resend/UI/browser, QR export VM/browser/session boundary/numbering/public shell/catalogue resilience, Kitchen contract/UI, payment adapter/hydration/lifecycle, Table Rename VM/browser and initial Owner bootstrap contract: PASS. Browser regressions run at 375/768/1280.
- Final feature/client/endpoint/browser tests, Production-mode build and 143-file artifact scan passed again after integration. Syntax and diff whitespace checks PASS at validation checkpoints. No standalone lint/typecheck script is configured. Existing Browserslist freshness notice and deliberately injected mock network errors are non-failing output.

## Review and disposition

Independent browser/UX review found stale editor cleanup, expired-invite feedback, encoding, empty error rendering and long-email suspension issues. All were fixed and regression-tested. Final review found and corrected client token reservation and legacy Owner invitation boundaries; independent re-review found no unresolved code authorization blocker; review documentation separates personally executed tests from combined evidence. See staff-management-browser-review.md and staff-management-security-review.md.

## Evidence

Synthetic screenshots in the feature worktree: artifacts/staff-management/staff-management-{375,768,1280}.png and staff-editor-{375,768,1280}.png. They contain no Production accounts or tokens. Captured Auth links, JWTs and generated synthetic passwords stay in test process memory and are not written to evidence files. Local SQL suites clean only their uniquely created disposable stacks; pre-existing local environments remain untouched.

Complete SQL: supabase/migrations/20261018044445_staff_management.sql and supabase/migrations/20261018092519_staff_invitation_transport_boundary.sql.
RLS/RPC review: docs/staff-management-backend.md and docs/staff-management-security-review.md.
Deployment/recovery: docs/staff-management-deployment-plan.md.
Production changes performed: NONE. Production application requires separate explicit approval.

## Final pre-merge correction gates

- Transport boundary local suite: PASS, baseline 35 + 16 checks; exact 4159fc6 defects reproduced RED in a disposable database before corrected GREEN assertions.
- Read-only Production compatibility metadata matches the approved replay: 52 columns/defaults, 11 function definitions/ACLs and 12 RLS policies. Both migrations applied successfully ONLY to an isolated network-disabled local database. Production Staff objects remain absent; no Production mutation occurred.
- Final source review: independent security/spec and standards reviewers found no confirmed remaining code blocker. Hosted Edge gateway/runtime credential and email-provider acceptance remain required before deployment approval.
