# Staff invitation transport

`supabase/functions/staff-invite/index.ts` wraps a dependency-injected, dependency-free handler. This function is not deployed by this change. All development and email capture must use the disposable local Supabase stack.

## Configuration and trust boundaries

- `AVENIQ_APP_ORIGIN`: one exact approved application origin, including the port for local development. No wildcard, user-controlled callback, query, path or credentials.
- `AVENIQ_SUPABASE_INTERNAL_URL`: optional trusted server URL (local Docker gateway may be `http://kong:8000`); defaults to `SUPABASE_URL`.
- `AVENIQ_SUPABASE_PUBLISHABLE_KEY`: public publishable key; defaults to legacy public `SUPABASE_ANON_KEY`. Secret and service-role keys are rejected. The endpoint uses no Auth-admin API, email-provider secret or SDK/CDN dependency.

Configure Supabase Auth's redirect allowlist for the intended origin and `/join/*` only under separately approved environment configuration. No hosted Auth configuration is changed here. Existing local stacks must not be reset or repurposed.

## Contract

`POST /functions/v1/staff-invite` with caller Bearer JWT and JSON `{restaurantId, requestId, email, role, displayName}`. Roles: manager, staff, kitchen, cashier. Names trim to 1–100 characters. Email is normalized lower-case. Restaurant/request IDs must be UUIDs. Unknown fields, mismatched Origin, non-JSON and bodies over 4096 bytes fail closed. Browser CORS is exact-origin; server requests without Origin still require a valid caller JWT and database authorization.

The handler verifies the caller with Auth `/user`, then calls `create_staff_invitation` with that exact JWT and only the public API key. The RPC must authorize an active Owner/Manager using current database state and atomically reserve the invite, shared cooldown and request ID. It must reject unauthorized/disabled callers and existing-member changes; serialize tenant/email requests; and reject request-ID reuse with different input.

Only a new reservation with `delivery_required:true` starts public Auth `/otp` using `{email,create_user:true}`. Auth reuses an existing identity or creates a new identity. Redirect is constructed exclusively from the server allowlisted origin and the RPC token: `/join/<token>`. There is no Owner-browser PKCE challenge and no Owner password operation. The recipient follows their email link in their own browser and accepts the separately authorized/email-matched tenant invitation. Frontend must validate recipient session with Auth `/user`; password setup is optional own-account setup, separate from password recovery.

Responses never contain invite token, JWT, password, Auth error body or raw email link. A 202 response has `{status:'accepted',delivery:'requested'|'unconfirmed'|'already_requested'}`. This intentionally does not confirm whether an Auth identity exists. `requested` means Auth accepted the request, not that email delivery is proven. For `unconfirmed`, explain that email could not be confirmed; do not promise delivery. A received 202 completes this attempt; an explicit resend uses a new request ID after the shared cooldown. When the endpoint response itself is lost or unavailable, the frontend preserves the same request ID for a retry of unchanged input.

Error codes: 400 INVALID_REQUEST; 401 SIGN_IN_REQUIRED; 403 REQUEST_DENIED; 409 INVITATION_CONFLICT; 429 INVITATION_COOLDOWN; 503 INVITATION_UNAVAILABLE. Do not display raw database/Auth errors.

## Failure and replay contract

The reservation is consumed before email delivery, including Auth 400/429/500 and network ambiguity. Retrying that request ID must return `delivery_required:false`: it must never create another delivery attempt. A new request ID remains subject to the shared 60-second database cooldown. Do not revoke an invitation because transport failed: delivery may already have occurred. Auth email tokens remain one-time; invalidated/expired email tokens and revoked/expired/replayed invitations remain denied by Auth and the acceptance RPC.

The handler emits no credential-bearing logs. Inbound JSON is bounded; upstream calls have 10-second timeouts. No unbounded auth retry is performed. Database audit logs contain safe actor/action fields, never tokens or email-link material.

## Verification

`node tests/test-staff-invite-endpoint.mjs` covers new/existing Auth account transport equivalence; caller-JWT forwarding and Auth verification; safe role/body/email/name/UUID validation; Origin/CORS; idempotent suppression; database denial/cooldown/conflict mapping; ambiguous 400/429/500/network delivery failures; fixed callback; response token redaction; and rejection of private-key configuration.

Initial test run was RED because handler did not exist; implementation made 29 checks GREEN. Actual local Auth/email/RPC results are recorded below; these mocked tests alone do not prove delivery.

## Deployment/recovery

Production deployment, Auth redirect configuration and additive database migration require separate approval. Deploy authoritative database authorization before exposing the endpoint/frontend. Disable the endpoint or hide the invitation UI to recover from a transport defect; keep database suspension enforcement and audit history. Never roll membership checks back to ignore disabled state. No hosted API was contacted while implementing this endpoint.

Actual local email/Auth gate: `node tests/test-staff-invite-local.mjs` uses `runLocalGate({emailCapture:true})`. The default-off option adds only a uniquely named disposable Mailpit container, loopback capture API and local GoTrue SMTP/redirect settings; existing gates retain their default behavior. Captured links remain in memory and are never logged or written into artifacts.

The local Supabase Edge runtime image v1.77.1 successfully bundles index.ts and handler.mjs with Docker network disabled. This validates wrapper/module packaging; real local Auth, PostgREST and SMTP integration invokes the same dependency-injected handler under Node, rather than claiming a deployed Edge function test. Keep the function gateway JWT verification enabled (default); the handler additionally verifies /auth/v1/user and uses caller-JWT RPC authorization.


## Executed local integration results

`node tests/test-staff-invite-local.mjs` passed: 35 existing disposable Auth/QR/Kitchen/payment baseline checks plus 19 invitation checks. The integration performed actual local GoTrue `/user`, PostgREST reservation/acceptance RPCs, SMTP receipt in Mailpit, email-link GET verification, confirmed recipient `/user`, new recipient password setup/sign-in, and existing password/UUID preservation across two restaurant memberships. It checked wrong-email acceptance, email/invitation replay, expired Auth email, expired database invitation, Staff denial with no email, missing-user creation without duplicate existing identity, and actual reservation/cooldown after a simulated 429 mail failure. Only that test's uniquely named Docker stack was cleaned afterward.

The first SMTP run exposed a test harness URL-path configuration issue: GoTrue's default `/verify` mail path discards the `/auth/v1` base path. The optional mail-capture configuration now explicitly sets `/auth/v1/verify` paths, matching the local gateway. [Upstream Auth issue](https://github.com/supabase/auth/issues/2518). This is isolated to disposable local SMTP configuration; no hosted configuration was inspected or changed.

The gate also serves its captured public config from its own closure and offers `withLocalGateDatabase(action)` for the unique owned database container. This prevents concurrent local test stacks from selecting each other's database or frontend config. The default-off SMTP option preserves existing test behavior.
