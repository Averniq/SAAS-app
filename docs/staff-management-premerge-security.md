# Staff Management pre-merge security correction

The reviewed `4159fc658e1589d231755ae3cdc1055fa9a25101` exposed bearer invitation tokens through authenticated `create_staff_invitation`, legacy `create_restaurant_invite`, and `list_restaurant_team`. Direct RPC callers could bypass the email transport boundary. Legacy Owner invitations could create Owner membership and update the restaurant owner pointer. These are confirmed defects, corrected by the append-only `20261018092519_staff_invitation_transport_boundary.sql`; the previously shared migration is unchanged.

## Authority and transport contract

`reserve_staff_invitation_for_delivery(p_actor_user_id uuid, p_restaurant_id uuid, p_email text, p_role text, p_display_name text, p_request_id uuid) returns jsonb` is executable only by `service_role`. The hosted email function first verifies the caller JWT against Auth, then passes that verified user ID as actor using its server-only credential. The SQL checks the current database membership under the tenant advisory lock and actor row lock. It never sets or impersonates JWT claims. Active Owner/Manager authority is retained; the existing platform-administrator invitation authority remains ordinary-role-only. A missing, disabled or foreign actor is rejected.

Returned reservation fields are `id`, `token`, `email`, `role`, `display_name`, `expires_at`, `delivery_required`. Only the trusted transport receives this result. Client responses and team listings must not include bearer credentials or invitation URLs. A retry of the same request ID cannot request another delivery; a new request ID is subject to the shared 60-second email/tenant cooldown. Request-ID payload changes fail. The tenant lock serializes reservation, acceptance, revocation and membership mutation.

The retired browser RPCs are both denied execution and replaced by fail-closed stubs. The old private helper permitting Owner invitations is removed. The new private helper is not executable by `public`, `anon`, `authenticated` or `service_role`; only its owner can call it from the narrow wrapper.

## Grants / search paths

All new/replaced invitation and staff mutation functions use SECURITY DEFINER with empty search path and fully-qualified data access. The eight-function local catalog matrix checks definer status and search-path configuration. Authenticated clients retain only the ordinary authorized update/list/revoke/accept contracts; anonymous clients cannot execute them. Only the reservation wrapper has a new service-role grant. No other service-role privilege is introduced.

`accept_restaurant_invite` rejects Owner/unknown role invitations before insertion, including invitations created before the follow-up migration. It no longer writes `restaurants.owner_user_id`. Existing Owner memberships and the separately authorized one-time bootstrap flow remain unchanged. Existing ordinary membership acceptance never overwrites a role or reactivates a disabled membership. Verified-email matching, expiry, revoked/consumed status, current inviter authority and the shared tenant lock remain enforced.

## Local evidence and scope

The local boundary suite restores the exact original invitation function definitions and original execution ACLs into its own disposable Docker database. It confirms the original direct token disclosure and Owner-pointer mutation, then reapplies the append-only correction and confirms both are denied. It also checks transport role restrictions, cross-tenant authority, idempotency, cooldown, concurrency, token-free listing and PostgreSQL grants/search paths. All accounts/tokens are synthetic and ephemeral; no bearer values are logged.

The existing suspension/multi-tenant suite separately covers retained valid JWT denial on protected reads, Kitchen, reports, QR metadata and payment RPCs, membership-version races, direct membership-write denial and preservation of order/table/QR identity. No public ordering or financial logic is changed by this correction.

## Deployment and recovery

Apply the original Staff Management migration and then this append-only correction before enabling the hosted transport or frontend. Never expose the original migration as a release by itself. Deploy and verify the hosted function with server-only credentials, approved callback URL, CORS/origin configuration and actual provider email delivery before publishing the Staff Management frontend. The hosted function must use the service-only reservation RPC; merely calling the retired authenticated RPC fails closed.

Do not roll back to token-bearing RPC grants or Owner invitation acceptance. Recovery disables the new transport/frontend actions or uses a reviewed fix-forward migration while preserving staff/audit history and suspension enforcement. Email transport outages leave a reservation without granting membership; the Owner can request a new invitation after cooldown. No migration, deployment or configuration change has been applied to Production. Production migration approval remains a separate explicit gate.

Executed validation: `node tests/test-staff-transport-boundary-local.mjs` passed with 35 existing local API gates and 16 transport/security checks after replaying all 24 migrations. `node --check tests/test-staff-transport-boundary-local.mjs` and `git diff --check` passed. The reviewed original shared migration has no diff. Disposable local containers were cleaned after completion; retained manual test environments were not touched.
