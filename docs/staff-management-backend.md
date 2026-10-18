# Staff Management backend contract and rollout boundary

This is a local-only migration candidate. It has not been applied to either Production backend. The complete SQL is `supabase/migrations/20261018044445_staff_management.sql`.

## Additive state

`restaurant_staff` receives `display_name`, `is_active`, `version` and `updated_at`. Existing identities, roles, keys, associations and active access remain unchanged. Empty display names are permitted for existing records only; the edit RPC requires a trimmed name of 1–100 characters. `restaurant_invites` receives display name, request UUID and reservation timestamp. The new append-only `staff_management_audit` stores tenant, actor, target, action and safe before/after state. It stores no password, JWT, invite bearer or email-link token. Membership and audit writes remain RPC-only; active tenant Owners can read audit records through RLS.

## Authoritative access

`is_restaurant_staff` and `has_restaurant_role` consult current `is_active`, never JWT role metadata. `can_manage_restaurant_staff` preserves existing platform-admin and active Owner/Manager invitation rights. All existing RLS users of these helpers therefore enforce suspension. Kitchen `update_restaurant_order_status` and financial `record_authoritative_payment` / `list_authoritative_payment_operations` have direct role reads and are explicitly redefined to require active membership. Public canonical QR APIs remain token-scoped and unchanged; retired legacy public ordering entrypoints remain ungranted. The initial Owner bootstrap is service-only, create-once and rejects any existing membership, including disabled memberships. No global Auth ban or password change is used for suspension, so the same Auth identity can retain access to another restaurant.

## RPC contracts

- `update_restaurant_staff(uuid,uuid,text,text,boolean,bigint)` accepts tenant, membership, name, role, active and expected version. Only a current active tenant Owner may mutate. Owner or self targets are immutable. Only Manager, Staff, Kitchen and Cashier are accepted. Returns the exact persisted membership identity, tenant/user IDs, safe editable state and incremented version.
- `create_staff_invitation(uuid,text,text,text,uuid)` reserves one invitation after current active Owner/Manager (or existing platform admin) authorization. Allows non-Owner roles only. Returns id/token/email/role/display_name/expires_at/delivery_required to the narrow server endpoint. The frontend must not receive this reservation payload. Same request UUID and identical actor/payload returns the reservation with `delivery_required=false`; changed payload or actor is rejected. A new request for the same tenant/email requires a shared 60-second cooldown. Transport failure cannot make the same request id send again. After cooldown a new request rotates the invitation token and revokes the old invitation.
- Legacy `create_restaurant_invite` retains signature and legacy Owner invitation permission; it uses the same validation/cooldown/serialization and cannot invite an existing member to overwrite roles or reactivate access.
- `accept_restaurant_invite(uuid)` requires an authenticated recipient whose actual Auth email is confirmed and exactly matches the normalized invitation email. It consumes only pending, non-expired invitations. Existing active membership role and identity are preserved; disabled memberships are rejected. Accepted/revoked replay fails. It never trusts URL roles or user metadata. It returns tenant/slug/name and the actual membership role.
- `revoke_restaurant_invite(uuid)` retains Owner/Manager/platform behavior and audits successful revocation.
- `list_restaurant_team(uuid)` retains existing fields and adds member id/display_name/is_active/version and invite display_name. Disabled callers cannot list the tenant.

## Concurrency and isolation

Every invitation/membership mutation takes the same transaction-scoped advisory lock keyed by restaurant before locking the actor, target or invitation. This serializes accept/revoke/create/edit, prevents lock-order inversions between those paths and ensures a stale invite cannot race a membership role/status edit. Current actor and target state are then read under row locks. `version` makes simultaneous stale edits fail, not overwrite each other. Role/status edits revoke pending invitations for the target's current email and invitations issued by that member in the same transaction. Acceptance also rechecks the original inviter's current authority, so stale invitations cannot outlive a suspension/demotion. Tenant input is never enough to authorize a write: actor membership, target membership and restaurant are all matched. The advisory lock uses a 64-bit hash; a collision can only serialize unrelated tenants, not grant access.

## Migration, deployment and recovery

The migration is wrapped in one transaction, including new RPC ACLs. `staff_private.reserve_invitation` is in an unexposed schema, revoked from clients and service_role; only security-definer public wrappers call it. New exposed RPC execution is explicitly authenticated-only. Existing direct membership write privileges are revoked again. Existing function ACLs are preserved by CREATE OR REPLACE.

Production application requires separate explicit approval after catalog/RLS review. Deploy approved backend migration and email endpoint before the frontend. Review Auth email redirect allowlist, transport and endpoint origin settings separately; no Production configuration change is implicit in this PR. Validate with designated synthetic accounts/tenant. Retain existing data and audit.

There is no destructive down migration. A frontend rollback must leave backend suspension checks in place, or disabled members could regain access. Recover through an explicitly reviewed forward patch; do not drop active flags, audit records, invitation invalidation or authorization checks. No schema/data reset, membership replacement, QR operation or historical order rewrite is needed.

## Executed local validation

`node tests/test-staff-management-local.mjs` passed after the final migration: 35 baseline Auth/QR/Kitchen/payment/bootstrap checks and 39 staff-management checks. The test creates a unique disposable Docker Supabase stack, authenticates synthetic accounts through real GoTrue, makes authenticated PostgREST calls, and cleans only its own containers. The harness database callback identifies only that stack; no hosted URL or credentials are accepted.

Verified Owner-only mutation, cross-tenant and Owner/self denial, unchanged membership identity, concurrent single-version winner, deactivate/reactivate, five protected RLS reads denied with the original valid JWT, report/QR-admin/Kitchen/payment RPC denial, independent access to another restaurant, stale invite rejection, shared cooldown/idempotency, safe audit records, unchanged public QR hashes and order-table associations, disabled Owner/Manager denial and denied direct membership writes.

Direct API tab/newline-only display names were first reproduced as an incorrect successful update (RED). The server now normalizes the same bounded ASCII/Unicode whitespace set as JavaScript trim before validating and persisting names. Tab/newline and NBSP/BOM-only regression cases both pass (GREEN). The earlier 37-check run also passed; the final count is 39 after these added boundary cases. Syntax and `git diff --check` passed. No test connected to or modified Production.
