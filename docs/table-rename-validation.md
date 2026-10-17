# Table display-name rename

Owner/Manager can select Rename in Table Manager, edit the display name, then Save or Cancel. Input is trimmed and empty names are rejected. Duplicate display names remain allowed: the existing database uniqueness rules apply to restaurant/local ID and restaurant/table number, not display names.

The existing tenant-scoped PATCH changes only `name` and `table_name`. The UI waits for exactly one matching returned row (cloud ID, local ID, restaurant and both names); zero-row RLS denials, mismatched responses and network failures leave the current label unchanged. Save is fenced against duplicate submission and user, role, restaurant, cloud ID or session-generation changes.

No schema, migration, RLS, ACL, dependency, Auth SDK, service-worker or deployment configuration changes are required. Table IDs, local IDs, table numbers, QR token/hash rows, URLs and order associations are unchanged. Existing printed QR links resolve the current name from the same table row. Previously saved offline QR packages retain their printed label; their links continue working.

The initiating dashboard re-renders Kitchen, Front Desk, customer labels and QR cards after confirmation. Cached report data is invalidated and old report requests are fenced. Reports reload on the next Reports visit. Other already-open clients receive the new catalogue label on their normal catalogue reload/page refresh; this change does not add a realtime catalogue subscription.

## Validation

All fixtures are synthetic. Browser tests run an isolated headless Chrome profile against localhost, block external requests, and use the real application and Auth adapter. Database tests create and clean up their own disposable Docker Supabase stack; no hosted database configuration is accepted.

- `node tests/test-table-rename.mjs`: confirmed name-only request; owner/manager; cloud-confirmed UI; identity/QR/open-order preservation; validation/cancel/failure; duplicate display names; zero-row/foreign responses; duplicate submissions and stale-context rejection.
- `node tests/test-table-rename-browser.mjs`: Save/Cancel, validation/failure, Kitchen/Front Desk/Reports/customer labels, original public QR, unsafe-label escaping, unauthorized controls and responsive layouts at 375/768/1280. Local screenshots are generated under `artifacts/table-rename/` and are not committed.
- `node tests/test-table-rename-local-runtime.mjs`: real local Auth/PostgREST/RLS, owner/manager success, staff/kitchen/cashier and wrong-tenant rejection; exact table identity/public token/hash rows unchanged; original QR resolves Patio 1; open orders retain their table association. Includes the existing 35-check local API gate.
- Broader executed suites: Table Manager numbering, membership routing, password recovery/PKCE/resend and UI, QR export/session boundary/catalogue metadata resilience, Kitchen lifecycle UI/contracts, payment adapter/hydration/lifecycle, and public token shell safety.
- Existing QR export, tenant routing and password recovery browser suites: 375/768/1280.
- Production-mode build with a synthetic public test key; credential safety and source/artifact leak scans; JavaScript syntax and `git diff --check`.

No standalone lint or type-check script is configured. The build reports the existing outdated Browserslist database notice.

Independent QA/UX and security reviews found no confirmed blocker. No Production reads or writes, QR operations, merge or deployment were performed for this work.
