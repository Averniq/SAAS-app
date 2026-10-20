# Kitchen Printing mainline independent QA review

Date: 2026-10-20. Target: `codex/kitchen-printing-mainline-20261020`, main baseline `8d0a6c1`. Scope: independent regression execution, integration source review, and disposable SQL acceptance. No implementation changes, deployment, production access, emulator work, or private fixture regeneration by this reviewer.

## Results

No confirmed blocking defect was reproduced in this review. This is bounded acceptance, not a production-readiness or physical-printer claim.

### Executed and passed

- `pnpm run test:password-recovery`: real Auth SDK with synthetic network, PKCE adversarial/resend and UI checks. Expected injected mock-network-error traces occurred; the script completed successfully.
- `pnpm run test:tenant-routing`: membership selection, direct tenant authorization, startup request gating and error mapping.
- `pnpm run test:qr-export`: mandatory saved package, role/rotation, metadata outage resilience and session cleanup.
- `pnpm run test:table-rename`: owner/manager, validation, duplicate submission, failure/stale responses and identity/QR/order preservation.
- `pnpm run test:staff-management`: client contract and invitation endpoint (32 checks).
- `pnpm run test:kitchen-print`: 11/11 unit tests, including renderer role boundaries/escaping, ticket bounds, status derivation, candidate baseline guards, TCP byte capture and partial stream behavior. TCP simulator tests ran isolated ephemeral unit fixtures; no shared fault fixture/ports were used.
- `pnpm run test:kitchen-print:local`: access, dispatch and delivery SQL suites each completed `BEGIN`, assertions, `ROLLBACK`. Docker label independently verified as `aveniq-kitchen-mainline-20261020` on `supabase_db_aveniq-kitchen-mainline-20261020`. Checks include denied Kitchen configuration, cross-tenant/role constraints, pairing approval, idempotent test requests, double-claim exclusion, incorrect attempt token, uncertainty blocking, explicit resolution and revocation.
- Five sequential existing browser scripts passed: `pnpm run test:password-recovery:browser`, `pnpm run test:tenant-routing:browser`, `pnpm run test:qr-export:browser`, `pnpm run test:table-rename:browser`, `pnpm run test:staff-management:browser`. Each ran at 375, 768 and 1280 pixels. These are real isolated Chrome UI tests against localhost MOCK Auth/REST, not real API acceptance. Coverage includes validation, rapid/repeated actions, failed-save recovery, expired/replayed callbacks, membership and role boundaries, suspension/reactivation, invitation setup, stale logout and responsive layout.
- Additional `node tests/<name>.mjs` checks passed: `test-p0-deploy-01-product-preservation`, `test-clean-baseline-current-payment-contract`, `test-kitchen-lifecycle-ui`, `test-kitchen-lifecycle-contract`, `test-payment-writer-client-adapter`, `test-payment-writer-hydration` (7/7), `test-payment-writer-lifecycle` (14/14), `test-authenticated-catalogue-qr-metadata-resilience`, `test-customer-order-tracking-reload`, `test-qr-session-boundary`, `test-sake-street-menu-photos`, `test-table-manager-numbering`, `test-public-token-shell-safety`.

### Checks incomplete / not run

- `node tests/test-canonical-only-payment-authorization.mjs` was attempted without its required fixture/range and stopped at argument validation. It hardcodes a historical unrelated container; it was not pointed at that container or adapted. No authorization matrix pass is claimed.
- `node tests/test-staff-schema-compatibility.mjs` was attempted without the required approved read-only Production catalog snapshot and stopped at argument validation. No Production catalog access occurred and no compatibility pass is claimed.
- This reviewer did not independently rerun the lead's real API/native and local compatibility runs. Reviewed evidence is listed below. Historical payment transition/runtime/concurrency scripts remain outside this bounded regression run.
- Build/public-config tests were not run by this reviewer because they replace `dist`, which the lead was using for end-to-end work. This repository has no configured standalone lint/typecheck command. Lead build validation must be reported separately.
- New printer UI real API interaction and Android emulator work were executed by the lead; the evidence reviewed below is separate from the mock regressions above. The completed seven fault scenarios are reviewed below.
- Physical Android tablet, IVIDA S300H, paper output, LAN installation, API24 runtime and background/suspension behavior remain subject to `docs/sake-street-kitchen-printer-checklist.md`.

## Preservation inspection

The inspected `app.js` diff only appends the context getter. Printer settings mount inside the existing setup section; the Kitchen banner/module tag are additive. `supabase-client.js` has no mainline diff. The existing staff/payment/QR/rename application logic remains present; passing regressions provide further bounded evidence. CSS/JS version strings agree between HTML and the v20 service-worker shell entries. Owner/manager settings and Kitchen operational controls remain separated in the renderer; server authorization needs the separate security review.

## Suggestions (not confirmed blocking defects)

After saving a printer or recording an operation, settings/list status can remain stale until the 20-second refresh: `save` and ordinary `action` do not immediately call `refresh`. A short manual check should confirm the success message and delayed list update are understandable during installation. Consider refreshing immediately after successful actions in a later UX improvement; do not interpret a recorded/transmitted operation as physical print confirmation.

## Evidence boundary

The SQL tests use JWT claims inside privileged local SQL sessions and include ACL assertions; they are not a substitute for Auth/PostgREST end-to-end permissions. The mock browser regressions do not exercise Kitchen Printing RPC responses or native delivery. The reviewed real API/native evidence below addresses that distinct path. This review must still be combined with security/performance findings before approval. No merge or deployment was performed.

## Follow-up evidence independently inspected

- Independently executed `node --test tests/test-uat-regressions.mjs`: 4/4 passed. Guards compare the complete 24-file canonical migration set/hashes, protected main implementation/dependencies, current HTML/service-worker coherence and additive mounts. Coherence also includes negative mutations to reject stale app assets and cache-generation mismatches.
- Reviewed `scripts/test-kitchen-mainline-full-app.mjs` and `docs/evidence/kitchen-printing-mainline/full-app-e2e.json`. Actual Chrome logs in using local Auth, saves the printer through the actual setup form/RPC, performs public QR Review and double Confirm, verifies exactly one trusted new/unpaid order (total 10) and one queued job, then observes that order on Kitchen Display and Front Desk. The harness asserts zero Auth/REST HTTP errors and no browser runtime exceptions. External HTTPS is blocked. This run was executed by the lead, not independently repeated by this reviewer.
- Reviewed the native continuation assertions in `.tools/link-ui-native.mjs`: the exact UI-created job becomes transmitted with one attempt and one unique attempt row, full order/items/payments fingerprints remain equal to the pre-delivery capture, and one matching order-number TCP stream is captured (576 bytes in the final rerun, with a recorded SHA-256). Recorded APK SHA-256 is attached to the public evidence. TCP transmission still does not confirm physical paper output.
- Inspected `.tools/android-mainline.log` ending `BUILD SUCCESSFUL` including lint, and XML results: 7 instrumentation tests, 0 failures/errors/skips; 4 JVM tests, 0 failures/errors/skips. These totals include one generated example test in each set (6 and 3 tests respectively exercise printing-specific behavior). API36 emulator evidence does not prove physical hardware or API24 behavior.
- Inspected `.tools/mainline-compatibility-green.log`: fresh canonical 24 plus explicit printing candidate replay and 36 Auth/HTTP/financial/Kitchen assertions completed; summary also records all three SQL suites passing. Inspected the harness diff: printing replay is enabled only by `AVENIQ_KITCHEN_PRINT_CANDIDATES=1`, executes after canonical replay in the already unique local Docker stack, rejects an empty candidate set, and leaves default gate behavior unchanged. It introduces no external database target option.
- Final `docs/evidence/kitchen-printing-mainline/local-regressions.json` records table rename local runtime 37 assertions, staff management local runtime 75 assertions, staff invitation local runtime 56 assertions and staff transport boundary local runtime 52 assertions, all exit 0. These four lead-executed runs total 220 printed PASS checks including the repeated 36-check core gate per run; this is not 220 distinct feature cases. They ran with explicit printing candidate replay. Transport/invitation log tails were also inspected; the original browser MOCK distinction still applies to the separate five browser regressions.

No new confirmed blocking defect emerged from this evidence review. The delayed settings refresh remains an optional UX suggestion, and the real API Save check successfully waited for persistence.

### Completed fault evidence

Independently inspected `docs/evidence/kitchen-printing-mainline/fault-injection-results.json` and the matching assertions in `scripts/run-kitchen-print-fault-tests.mjs`; all seven recorded scenarios pass. Five scenarios force-stop the dedicated emulator process at before-connect, partial-write, after-write, before-ack, and late-quarantined-before-ack boundaries. Recovery asserts one attempt/attempt row, no automatic TCP resend, expected transmitted/uncertain state, and unchanged order/items/payment fingerprints. Partial write captures exactly 4096 bytes; full writes capture more than 4096. The late quarantine case also drops a real HTTP acknowledgement after server commit and confirms persistent uncertainty.

The sixth scenario drops a real server acknowledgement, retries the acknowledgement, and confirms one TCP stream with transmitted state and unchanged financial/order data. The seventh makes 20 concurrent HTTP claims using two registered device credentials and gets one winner; this is not a test of two simultaneously running physical tablets or native emulator workers. The report records the distinct fault APK hash. Paper output remains untested.



### Final rerun and documentation check

Inspected the refreshed 1280×900 `full-app-kitchen.png`: the top-level Kitchen navigation/header, new-order alert and highlighted new order are visible, including the synthetic Wagyu item, Table 5, $10 total and cloud-synced state. The earlier scrolled screenshot limitation is resolved. Screenshot evidence is limited to this captured desktop state.

The final `full-app-e2e.json` (2026-10-20T11:48:41Z) records the rerun's same UI-created job with one native attempt, one unique attempt ID, one TCP stream of 576 bytes, transmitted state and unchanged order/items/payment fingerprints. Its final standard APK hash is recorded separately from the fault APK. `.tools/android-mainline-final.log` ends BUILD SUCCESSFUL; the refreshed instrumentation XML records 7 tests with 0 failures/errors/skips, and JVM XML retains 4 passing tests (up-to-date tasks in the final build).

Read `docs/kitchen-printing-mainline-migration-compatibility.md` and `docs/kitchen-printing-mainline-conflict-resolution.md`. Their preserved main24 chain, single unpromoted candidate, opt-in disposable replay, exclusion of the obsolete snapshot, and explicit hosted-upgrade/hardware approval boundaries agree with the inspected implementation and evidence. No confirmed blocking finding was identified in this final focused review. Lead reports the three additional public-config/credential-safety/leak-scan checks passed; this reviewer did not independently rerun them.
