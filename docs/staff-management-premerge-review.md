# Final Staff Management pre-merge assessment

The requested review started at `4159fc658e1589d231755ae3cdc1055fa9a25101`. That commit was not approved unchanged. Two confirmed invitation security gaps were corrected in an append-only migration and focused transport/UI changes.

## Findings resolved

1. Active authenticated Owners/Managers could directly retrieve reservation tokens and bypass the email transport boundary, although SQL cooldown, deduplication and recipient email checks still applied. Reservation is now service-role-only with a freshly Auth-verified explicit actor, current database authorization and tenant locking. Both retired client creators are revoked fail-closed stubs. Team listings and frontend responses contain no invitation bearer; Copy link fallback is removed.
2. The legacy Owner invitation path could create an Owner and change the restaurant Owner pointer. All invitation creation and acceptance now allow only Manager, All-round Staff, Kitchen and Cashier. Preexisting Owner invitations fail closed. Existing Owner memberships and the separate service-only initial bootstrap remain intact.

## SQL, RLS and compatibility

Review both `20261018044445_staff_management.sql` and `20261018092519_staff_invitation_transport_boundary.sql`. The original shared migration is unchanged. New staff-management/invitation definer functions pin an empty search path; existing Kitchen/payment replacements retain reviewed fixed public/extensions/pg_temp paths; private implementation execution is revoked, and only the narrow reservation wrapper grants service-role execution. Authenticated list/edit/revoke/accept retain current database authorization; direct membership and invitation writes remain unavailable. Owner/self mutation and role escalation are denied.

Suspension predicates apply to protected RLS reads and explicit Kitchen/payment/reporting role readers, including existing valid JWTs. Shared tenant locks and expected versions protect mutations and invitation acceptance; other tenant membership access remains independent. IDs, roles of existing active staff, historical order associations, invoice data and public QR hashes remain preserved.

A read-only Production catalog comparison matched the approved baseline: 52 columns/defaults, 11 function definitions/ACLs and 12 policies. Both migrations then replayed only in a network-disabled local database. No Production schema, configuration, account, data or QR operation occurred. Repeat the catalog drift check immediately before a separately approved migration.

## Verification

- Actual disposable local Auth/PostgREST: 35 baseline + 39 staff authorization/suspension/concurrency/history checks.
- Actual local SMTP/Auth invitation acceptance: 35 baseline + 20 delivery/identity/password/replay/denial checks.
- Exact original invitation defects reproduced RED locally; final transport matrix GREEN: 35 baseline + 16 security checks.
- Client tests and 32 endpoint checks; Staff Management browser acceptance at 375/768/1280, including absence of raw-token fallback.
- Routing, PKCE/recovery/resend, QR, Kitchen, payment and Table Rename regressions; related routing/recovery/QR browser suites at 375/768/1280.
- Production-mode build using synthetic public configuration, public config validation, 143-file artifact credential/packaging scan and source credential scan.
- Syntax and diff checks. No standalone lint/typecheck script is configured.
- Independent security/spec and standards re-review found no remaining confirmed code blocker.

Browser evidence remains local under `artifacts/staff-management/`; screenshots use synthetic fixtures. Local integration tests use real local GoTrue/PostgREST/SMTP. The Edge wrapper bundles offline; its handler runs under Node for SMTP tests. These do not claim a hosted function or live provider was tested.

## Hosted acceptance and recovery gates

Follow `staff-management-deployment-plan.md`. Separate explicit Production approval is required for both migrations, Edge publication/configuration and frontend release. Apply both SQL files before the endpoint/frontend; plan for legacy invitation creation to fail closed during the compatibility window. The Edge runtime requires a private legacy service-role JWT credential, never frontend build configuration. Verify hosted gateway JWT handling, exact origin and callback allowlist, actual email receipt/callback and designated synthetic-tenant role/suspension acceptance before rollout.

Frontend rollback must preserve backend suspension, audit and token/Owner invitation restrictions. Disable invitation actions or use an approved forward patch; never restore unsafe grants or old inactive-blind helpers. This review performs no deployment or merge.
