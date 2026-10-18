# Independent Staff Management security and scope review

Reviewed on 18 October 2026 against approved base `c7adb471b4f81b310a72e37b3b5167043ebd79ff`. This review used only source files, mocked tests and reported disposable-local test evidence. No Production endpoint, database, account, deployment or QR operation was accessed or modified by this reviewer.

## Reviewed authorization boundaries

- Current active membership, not JWT role metadata, determines restaurant authorization. Existing RLS/report/QR staff helpers consult `is_active`; the direct Kitchen and payment role readers are explicitly patched.
- Owner-only staff edits match actor, target membership and restaurant; Owner/self targets cannot be changed. Direct client membership writes remain ungranted. Permitted target roles are Manager, All-round Staff, Kitchen and Cashier.
- The shared tenant transaction lock serializes invitation creation, acceptance, revocation and membership edits. Expected membership versions reject stale updates. Role/status changes revoke outstanding authority; acceptance also rechecks the inviter's current authority.
- Invitation acceptance requires the actual confirmed Auth email, a pending unexpired token and compatible membership state. Existing active memberships keep their role and identity; disabled memberships cannot be reactivated through legacy invites. Tokens cannot set roles directly.
- The email endpoint verifies the caller against Auth and forwards that exact JWT to authorization RPCs. Only public keys are used; account creation/reuse relies on public Auth OTP, not browser or server service-role credentials. Recipient password setup updates the verified recipient's own Auth identity and does not establish recovery authority.
- Exact-origin CORS, fixed callback construction, bounded request bodies, upstream timeouts, shared cooldown and request-id deduplication constrain invitation transport. Error responses omit Auth bodies and link credentials. A lost endpoint response retries the same reservation; a received 202 permits a new attempt only through the shared cooldown.
- Staff names, emails and role labels are escaped before HTML insertion. Async client results are fenced by user, tenant, role and session generation. Owner controls are scrubbed on logout. UI gating supplements server authorization.

No confirmed authorization, tenant-isolation or privilege-escalation blocker was found in the reviewed paths. This is not a claim that unexecuted integration gates passed.

## Independently executed checks

- `node tests/test-staff-management-client.mjs` — PASS, including RPC payloads, active filtering and separate authenticated password setup.
- `node tests/test-staff-invite-endpoint.mjs` — PASS, 29 mocked endpoint checks.
- Both commands were rerun after the bounded status-name fallback and retry-documentation corrections and remained green.
- `git diff --check` — PASS at the reviewed working state.

## Findings and disposition

1. A legacy member with an empty display name and a valid email longer than 100 characters could not be disabled because the email was passed as the mutation name. Fixed: status changes use a bounded `Staff` fallback. Re-review confirms the fix; the browser QA suite includes explicit disable/reactivate identity-preservation coverage with a valid 117-character email. Browser execution evidence is attributed to QA, not this reviewer.
2. Retry documentation previously disagreed with the frontend following an unconfirmed 202 response. Fixed: it now distinguishes a received 202 from a lost endpoint response.

3. Direct SQL/API display-name normalization originally differed from JavaScript trim for tab/newline and Unicode whitespace. Fixed: both membership edits and invitation reservation derive one bounded `v_name` using `btrim` with the JavaScript whitespace set, then consistently validate, compare and persist that value. Scoped independent re-review confirms no authorization or identity changes in this fix. The backend reviewer reproduced the invalid-input cases RED before the correction and reported the expanded final local suite GREEN afterward.

## Performance and standards

No blocking performance or standards issue was identified. Listing uses two tenant-scoped aggregates with an Auth-user join, avoiding per-member network requests. Membership lookup uses the existing restaurant/user uniqueness; request-id and email-history indexes support resend/idempotency queries. External email delivery occurs after the reservation transaction, outside the tenant lock. The tenant-wide mutation lock intentionally favors correct low-volume administrative changes; it does not serialize ordinary public orders or menu reads. Team/invitation rendering is unpaginated, acceptable for this bounded restaurant MVP; reassess pagination if unusually large teams or invite backlogs become an observed use case. No dependency or broader architecture rewrite is introduced.

## Combined validation boundary

The backend reviewer reported the final disposable Docker/Auth/PostgREST suite GREEN with 35 baseline and 39 Staff Management checks, including ASCII and Unicode whitespace rejection at the direct API boundary. The implementation test also reported the local SMTP/Mailpit and real Auth callback gate GREEN with 35 baseline and 19 invitation/email checks, covering new/existing identities, verified callbacks, password setup, multi-tenant identity reuse, denial and expiry/replay behavior. Those integration results are attributed to the implementation/backend test runs; this independent reviewer personally executed only the mocked client/endpoint and diff checks listed above. Responsive browser results and screenshots are documented in `docs/staff-management-browser-review.md`. These are local test results and do not establish hosted email delivery or Production acceptance.

## Release restrictions

Draft PR only. Production SQL, Auth redirect configuration, function publication and frontend deployment require separate explicit approval. Rollback must preserve suspension enforcement and audit history; reverting authorization helpers to ignore disabled memberships would restore access. No historical records, membership identities or QR tokens need replacement.
