# Kitchen printing: existing app/schema mismatch investigation

Date: 2026-10-20. Printing candidate HEAD at investigation start: `17163bd`.

## Confirmed result

**Full application E2E remains blocked by the pre-printing app/schema contract.** Genuine browser sign-in, actual Admin → Kitchen Printers navigation, printer creation and persisted printer listing were exercised successfully after applying one unchanged historical prerequisite to a separate local clone. Actual Kitchen and Front Desk routes were opened. Send-to-Kitchen and live Kitchen order display were not passed: the app cannot load its restaurant/menu/order data against the approved canonical schema.

This is a narrower and better-supported result than treating all browser sign-in as untested. It does not promote excluded historical SQL to the approved canonical chain, or qualify the installation as ready.

## Isolation and actual execution

- Verified Docker label `com.supabase.cli.project=aveniq-kitchen-p0-20261020` before every SQL call.
- Existing task stack: local Auth/API `http://127.0.0.1:57631`, DB container `supabase_db_aveniq-kitchen-p0-20261020`, original database `postgres`. Original application schema and emulator fixture were unchanged.
- Separate database `fullapp_e2e2_20261020`, copied with `pg_dump`/restore from the task-local database. Restore used the existing local `supabase_admin` role because the initial `postgres` restore lacked ownership privileges. Initial failed disposable restore `fullapp_e2e_20261020` remains a partial fixture; it was not reused or treated as passing.
- Official locally available PostgREST image `public.ecr.aws/supabase/postgrest:v16.4`, container `aveniq-fullapp-e2e-rest-20261020`, label `aveniq.test=fullapp-e2e-20261020`, loopback port `57941`, existing owned Docker network.
- Actual app served at loopback `http://127.0.0.1:57940`. The local server overrides only backend configuration and proxies actual Auth to port57631 and actual REST to port57941. All HTML, app/client JS, styles and printing modules are repository files. No fake provisioning/order endpoints, intercepted responses or injected session bypasses were used.
- A new synthetic owner was created through actual local Auth before cloning; a unique synthetic restaurant, table and menu item were seeded only in the clone. Private credentials and temporary server/config/request details remain ignored under `.local-print/fullapp/`.
- Browser automation used `cua_repl`: filled actual Email/Password controls, clicked Log in, navigated Admin/Kitchen Printers, submitted Save Printer and later observed persisted `E2E LOCAL Kitchen`, `Agent Offline`, address `192.168.50.99`. This is a configured fictional LAN address; no socket was opened to it.
- Test Print click hit a browser CDP timeout; no successful confirmation or queued test is claimed. A separate tab opened actual Kitchen/Front Desk with the schema error visible.

Commands executed: `node scripts/test-kitchen-full-app-e2e.mjs` (first restore failed as described; second isolated database setup passed), `node .local-print/fullapp/serve.mjs` (running local fixture), `node .local-print/fullapp/probe.mjs` (passed sanitized assertions/evidence), `node --check scripts/test-kitchen-full-app-e2e.mjs`, Docker identity/catalog checks, and `git show 1decbfc:supabase-client.js` provenance checks. No app implementation code, canonical manifest or frozen SQL was edited.

## Root cause and impact

| Contract | Evidence | Printing impact |
| --- | --- | --- |
| `provision_self_service_account()` | Absent from canonical22; client calls it unconditionally in `getStaffProfile`. Frozen excluded013 defines actual RPC. Authenticated RPC returned200 after applying unchanged013 in clone. | Blocks app staff-session initialization before printer UI. Direct printing RPC/native tests do not depend on this provisioning RPC. |
| `restaurants.venue_status` | Absent from canonical22; selected by every membership lookup. Frozen excluded013 adds it. Membership fetch200 after013. | Blocks app restaurant membership resolution, independent of print queue. |
| `order_items.status` and related void fields | App order select requests `status,voided_at,void_reason`; missing canonical22 status produces HTTP400 / SQLSTATE42703. Frozen excluded035 introduces these item fields. | Blocks the general order loader, Front Desk state and Kitchen order synchronization. Printer configuration RPCs still return200. |
| `get_public_restaurant(text,text)` | Canonical P0-04 explicitly retires this legacy browser API and revokes EXECUTE from public/anon/authenticated. App still calls it in `loadRestaurantData`/`checkConnection`. Actual authenticated request returns403 /42501. | Blocks trusted restaurant/menu/table load needed for real Send-to-Kitchen. This is an intentional security boundary; regranting it would weaken the canonical contract and was not done. |
| Optional broader app RPCs | Actual requests to `get_restaurant_entitlement`, `get_current_onboarding`, `touch_staff_presence`, `get_staff_clock_link` return404 in clone. | Further evidence of app/schema drift; not all are independently blocking the printing panel. |

All four primary stale client contracts above are present in pre-printing prerequisite commit `1decbfc`; they were not introduced by the printing changes. This was verified with `git show`, not inferred only from the filenames.

The approved source of deployment order is `supabase/catalog-manifest.json`, currently22 entries. The historical inventory explicitly says it is not a replay list. Applying every root SQL file numerically would risk restoring retired/less-hardened function contracts and is not a supported remediation.

## Existing SQL dependency order

Only `013_verified_self_service_provisioning.sql` was applied to the separate clone, byte-equivalent normalized-LF SHA256 `ee4631be5bd19edf8c55a8223cd2043876470c6d61b09ac0e95d9ffe3a3afdd9`, matching the frozen inventory. Its actual prerequisites (`restaurants`, staff/platform membership tables, `set_updated_at`, Auth schema and roles) already exist after canonical22. That single file safely explains and locally resolves the two original sign-in blockers; it does not resolve later data-loading blockers.

For a separate reviewed forward reconciliation, existing source dependencies are:

1. `012_self_service_signup_validation.sql` defines the real registration hook (hook configuration is separate; not required for a legacy staff login).
2. `013_verified_self_service_provisioning.sql` defines organizations/memberships/registration/onboarding foundation, venue fields and provisioning. `015_organization_restaurant_integrity.sql` depends on these fields.
3. `019_trial_entitlement_foundation.sql` depends on013 organizations/registrations and defines entitlement helpers. `020_self_service_onboarding_workflow.sql` depends on013 and uses019 entitlement helpers for completion. `021_sample_qr_test_order_activation.sql` builds on020/019; it is unnecessary for this legacy synthetic owner.
4. `022_staff_presence.sql` supplies presence behavior used by the app. Attendance-clock functions have a separate027→028→029→030→031→032→033→040 chain (additional features are not a prerequisite to printer configuration).
5. `035_order_integrity_audit.sql` introduces item-status/void/audit shape, but also replaces order-status/financial helpers; it cannot safely be appended over canonical hardened payment/printing functions without semantic reconciliation. Later037/038/042 and approved forward fixes must be assessed together; no broad replay was performed.
6. **No historical migration fixes the current app use of the intentionally retired P0-04 restaurant-read endpoint.** A separately reviewed authenticated tenant-scoped read path/client reconciliation is necessary. This is not solved by migration ordering alone.

The dependency list is source analysis, not a claimed successful replay or an approved deployment plan.

## Evidence and remaining acceptance

- [Actual settings screenshot](evidence/kitchen-printing/fullapp-settings-schema-blocker.png): app shell and printing form under visible baseline sync error.
- [Actual Kitchen screenshot](evidence/kitchen-printing/fullapp-kitchen-schema-blocker.png): actual Kitchen route, empty order display and sync error. Empty display is not proof of correct order delivery.
- [Sanitized catalog/API results](evidence/kitchen-printing/fullapp-schema-results.json): original/clone feature presence; actual provisioning/printer200, retired endpoint403, missing item-status400; persisted printer count1.

Remaining full-app acceptance requires separate app/schema reconciliation preserving RLS, tenant isolation and retired legacy endpoint revocations, followed by fresh real Front Desk Send-to-Kitchen → queue → Kitchen display verification. Current evidence isolates these baseline blockers from the tested printing configuration/queue/native components. No production/hosted backend, merge, deployment or restaurant network was accessed.
