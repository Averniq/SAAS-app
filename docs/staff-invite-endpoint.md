# Staff invitation transport

`supabase/functions/staff-invite/index.ts` wraps a dependency-injected, dependency-free handler. This function is not deployed by this change. All development and email capture must use the disposable local Supabase stack.

## Configuration and trust boundaries

- `AVENIQ_APP_ORIGIN`: one exact approved application origin, including the port for local development. No wildcard, user-controlled callback, query, path or credentials.
- `AVENIQ_SUPABASE_INTERNAL_URL`: optional trusted server URL (local Docker gateway may be `http://kong:8000`); defaults to `SUPABASE_URL`.
- `AVENIQ_SUPABASE_PUBLISHABLE_KEY`: public publishable key; defaults to legacy public `SUPABASE_ANON_KEY`. Secret and service-role keys are rejected in this public setting. The endpoint uses no Auth-admin API, email-provider secret or SDK/CDN dependency.
- `AVENIQ_STAFF_INVITE_SERVER_KEY`: function-only legacy `service_role` JWT for the private database reservation RPC; defaults to the Edge runtime-provided `SUPABASE_SERVICE_ROLE_KEY`. This credential is required and must never enter frontend environment variables, config, bundles, browser test credentials, logs or HTTP responses. The handler rejects missing/public/unsupported server credentials.

Configure Supabase Auth's redirect allowlist for the intended origin and `/join/*` only under separately approved environment configuration. No hosted Auth configuration is changed here. Existing local stacks must not be reset or repurposed.

## Contract

`POST /functions/v1/staff-invite` with caller Bearer JWT and JSON `{restaurantId, requestId, email, role, displayName}`. Roles: manager, staff, kitchen, cashier. Names trim to 1–100 characters. Email is normalized lower-case. Restaurant/request IDs must be UUIDs. Unknown fields, mismatched Origin, non-JSON and bodies over 4096 bytes fail closed. Browser CORS is exact-origin; server requests without Origin still require a valid caller JWT and database authorization.

The handler verifies the caller with Auth `/user` using the public key and caller JWT, validates the returned user UUID, then calls `reserve_staff_invitation_for_delivery` using only the function-private service-role credential. Its `p_actor_user_id` comes exclusively from that verified Auth response, never request JSON. The RPC authorizes the supplied actor as an active Owner/Manager using fresh database state and atomically reserves the invite, shared cooldown and request ID. Only `service_role` may execute this reservation; authenticated/anonymous callers cannot invoke it or the replaced `create_staff_invitation` path and retrieve invitation tokens. The function is the deliberate privileged boundary, not a transparent browser RPC proxy. It must reject unauthorized/disabled callers and existing-member changes; serialize tenant/email requests; and reject request-ID reuse with different input.

Only a new reservation with `delivery_required:true` starts public Auth `/otp` using `{email,create_user:true}`. Auth reuses an existing identity or creates a new identity. Redirect is constructed exclusively from the server allowlisted origin and the RPC token: `/join/<token>`. There is no Owner-browser PKCE challenge and no Owner password operation. The recipient follows their email link in their own browser and accepts the separately authorized/email-matched tenant invitation. Frontend must validate recipient session with Auth `/user`; password setup is optional own-account setup, separate from password recovery.

Responses never contain invite token, JWT, password, Auth error body or raw email link. A 202 response has `{status:'accepted',delivery:'requested'|'unconfirmed'|'already_requested'}`. This intentionally does not confirm whether an Auth identity exists. `requested` means Auth accepted the request, not that email delivery is proven. For `unconfirmed`, explain that email could not be confirmed; do not promise delivery. A received 202 completes this attempt; an explicit resend uses a new request ID after the shared cooldown. When the endpoint response itself is lost or unavailable, the frontend preserves the same request ID for a retry of unchanged input.

Error codes: 400 INVALID_REQUEST; 401 SIGN_IN_REQUIRED; 403 REQUEST_DENIED; 409 INVITATION_CONFLICT; 429 INVITATION_COOLDOWN; 503 INVITATION_UNAVAILABLE. Do not display raw database/Auth errors.

## Failure and replay contract

The reservation is consumed before email delivery, including Auth 400/429/500 and network ambiguity. Retrying that request ID must return `delivery_required:false`: it must never create another delivery attempt. A new request ID remains subject to the shared 60-second database cooldown. Do not revoke an invitation because transport failed: delivery may already have occurred. Auth email tokens remain one-time; invalidated/expired email tokens and revoked/expired/replayed invitations remain denied by Auth and the acceptance RPC.

The handler emits no credential-bearing logs. Inbound JSON is bounded; upstream calls have 10-second timeouts. No unbounded auth retry is performed. Database audit logs contain safe actor/action fields, never tokens or email-link material.

## Verification

`node tests/test-staff-invite-endpoint.mjs` covers new/existing Auth account transport equivalence; public-key caller Auth verification, server-only reservation authorization and verified-actor binding; safe role/body/email/name/UUID validation; Origin/CORS; idempotent suppression; database denial/cooldown/conflict mapping; ambiguous 400/429/500/network delivery failures; fixed callback; response token redaction; public-only OTP headers, spoofed actor rejection, private-key response redaction, and separation/rejection of invalid public/server configuration.

Final-review transport regression was RED against the original caller-JWT reservation path; the server-only correction makes 32 checks GREEN. Actual local Auth/email/RPC results are recorded below; these mocked tests alone do not prove delivery.

## Deployment/recovery

Production deployment, Auth redirect configuration and additive database migration require separate approval. Deploy authoritative database authorization before exposing the endpoint/frontend. Disable the endpoint or hide the invitation UI to recover from a transport defect; keep database suspension enforcement and audit history. Never roll membership checks back to ignore disabled state. No hosted API was contacted while implementing this endpoint.

Actual local email/Auth gate: `node tests/test-staff-invite-local.mjs` uses `runLocalGate({emailCapture:true})`. The default-off option adds only a uniquely named disposable Mailpit container, loopback capture API and local GoTrue SMTP/redirect settings; existing gates retain their default behavior. Captured links remain in memory and are never logged or written into artifacts.

The local Supabase Edge runtime image v1.77.1 successfully bundles index.ts and handler.mjs with Docker network disabled. This validates wrapper/module packaging; real local Auth, PostgREST and SMTP integration invokes the same dependency-injected handler under Node, rather than claiming a deployed Edge function test. Keep the function gateway JWT verification enabled (default); the handler additionally verifies /auth/v1/user and uses a server-only reservation RPC with freshly verified caller identity. The private credential is never forwarded to Auth `/user` or `/otp`.


## Executed local integration results

`node tests/test-staff-invite-local.mjs` passed: 35 existing disposable Auth/QR/Kitchen/payment baseline checks plus 19 invitation checks. The integration performed actual local GoTrue `/user`, PostgREST reservation/acceptance RPCs, SMTP receipt in Mailpit, email-link GET verification, confirmed recipient `/user`, new recipient password setup/sign-in, and existing password/UUID preservation across two restaurant memberships. It checked wrong-email acceptance, email/invitation replay, expired Auth email, expired database invitation, Staff denial with no email, missing-user creation without duplicate existing identity, and actual reservation/cooldown after a simulated 429 mail failure. Only that test's uniquely named Docker stack was cleaned afterward.

The first SMTP run exposed a test harness URL-path configuration issue: GoTrue's default `/verify` mail path discards the `/auth/v1` base path. The optional mail-capture configuration now explicitly sets `/auth/v1/verify` paths, matching the local gateway. [Upstream Auth issue](https://github.com/supabase/auth/issues/2518). This is isolated to disposable local SMTP configuration; no hosted configuration was inspected or changed.

The gate also serves its captured public config from its own closure and offers `withLocalGateDatabase(action)` for the unique owned database container. This prevents concurrent local test stacks from selecting each other's database or frontend config. The default-off SMTP option preserves existing test behavior.

## Final-review transport boundary correction

Direct client reservation/token retrieval was a confirmed security defect in the original PR head: it let authorized browser callers bypass the intended email transport boundary. The additive hardening migration removes client execution of the old creator and legacy invitation creator, introduces the service-only reservation RPC, and rejects legacy Owner invitations. Existing membership roles and platform bootstrap are unaffected. A forwarded caller JWT cannot execute the private reservation RPC.

Hosted ordering: apply the reviewed additive authorization migration first, confirm reservation grants, configure the function-only service-role credential and approved origin, deploy the endpoint with gateway JWT verification enabled, then publish the frontend. Missing server credential fails at startup. Do not deploy the frontend against the old endpoint or grant clients reservation access to work around a deployment error. Recovery disables invitation transport/UI while retaining suspension enforcement and audit records.

The local integration helper `withLocalGateServerCredentials(action)` exposes only the unique disposable stack's server credential to a Node callback. It is separate from browser credentials and never exports the key via IPC, public config or logs.

Final-review rerun: endpoint unit 32 checks PASS; actual disposable local Auth/PostgREST/SMTP baseline 35 plus invitation 20 PASS. The additional check confirms an ordinary Owner JWT cannot call either token-returning creator and sends no email. New/existing account delivery, verified recipient callback, acceptance/replay, password/identity preservation, expiry and failure cooldown continue to pass through the corrected service-only reservation. Edge runtime v1.77.1 bundled the current wrapper and handler with Docker network disabled.
