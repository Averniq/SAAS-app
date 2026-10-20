# Kitchen printing mainline acceptance

Date: 2026-10-20. **KITCHEN PRINTING MAINLINE INTEGRATION — READY FOR REVIEW — NOT MERGED.**

Software integration and available bounded local validation pass. This is not release authorization. No merge, deployment, Production access or hosted migration was performed. Physical tablet and IVIDA S300H acceptance remain PENDING.

## Integration result

The replacement branch `codex/kitchen-printing-mainline-20261020` descends directly from freshly fetched main `8d0a6c1b6925630389aed145f5f46bd595a22613` (rechecked after testing). It selectively ports printing source `1182d3f`. All64 newer-main commits are retained; the18 conflicting snapshot paths were assessed without importing obsolete snapshot implementations.

The only application logic change in app.js is the printing context getter. Current cloud/auth, QR ordering, Kitchen lifecycle, Front Desk/payment ledger, staff management/invitations, table rename and recovery code are preserved. Dependencies and lockfile are unchanged. Printer settings/status and native modules are additive. All24 historical migrations remain unchanged; one new atomic candidate reconciles fresh-main contracts. See [dependency matrix](kitchen-printing-mainline-dependencies.md), [conflict resolutions](kitchen-printing-mainline-conflict-resolution.md) and [migration compatibility](kitchen-printing-mainline-migration-compatibility.md).

## Acceptance matrix

| Area | Actual result | Evidence and boundary |
| --- | --- | --- |
| Printing unit + current UAT contracts | PASS15/15 | `node --test tests/kitchen-printing/*.test.mjs tests/test-uat-regressions.mjs`; includes11 printing and4 preservation/coherence guards |
| Fresh main schema + printing | PASS | CLI2.121.0 main24+candidate replay; separate `node tests/test-kitchen-mainline-compatibility.mjs`:36 core Auth/HTTP/financial/Kitchen checks and3 SQL suites |
| RLS/device/tenant permissions | PASS | `pnpm run test:kitchen-print:local` and `pnpm run test:kitchen-print:http`; real local Auth/PostgREST plus independent Security denial checks |
| Queue/routing/reprint/recovery | PASS software | SQL access/dispatch/delivery suites, real HTTP role/idempotency/routing/uncertainty tests and native recovery |
| QR Send-to-Kitchen full path | PASS actual UI/API/native | Real Chrome password login, printer Save, public QR Review/double Confirm, one order/job, Kitchen/Front Desk synchronization; exact same job consumed once by real Android worker/TCP simulator |
| Business-state preservation | PASS tested cases | Native/fault runs assert unchanged order/items/payment fingerprints; canonical payment acceptance remains successful with printing installed |
| Main application regressions | PASS bounded suites | Password recovery, tenant routing, QR export, table rename, staff management;13 additional current-main static/contract scripts; details in independent QA report |
| Existing responsive browser regressions | PASS5 suites | Real Chrome at375/768/1280; mocked Auth/REST, explicitly separate from actual API end-to-end result |
| Existing local runtime regressions | PASS4 suites | Table rename37, staff management75, invitation56, transport boundary52 printed PASS checks; include repeated36-check core gate, not220 unique feature cases |
| Android build/static validation | PASS | assembleDebug, testDebugUnitTest, lintDebug, connectedDebugAndroidTest; final BUILD SUCCESSFUL |
| Android JVM/instrumentation | PASS4/7 | 3 printing JVM +1 generated example;6 printing emulator tests +1 generated example; zero failures/errors/skips; API36 emulator |
| Process death/lost ACK | PASS7 scenarios | Five real force-stops, recovery assertions, committed-response loss and20 concurrent claims with2 device credentials; killed instrumentation is not counted as a passing test |
| Build/config/security tooling | PASS | `pnpm run build:kitchen:android`, cap sync; public Supabase config, cutover credential safety and leak-scan scripts; scoped contracts.d.ts TypeScript check and new script syntax checks |
| Independent QA/Security | No confirmed blocking defect | [QA report](kitchen-printing-mainline-qa-review.md), [Security report](kitchen-printing-mainline-security-review.md); executed checks distinguished from reviewed lead evidence |
| Physical tablet / S300H / paper output | PENDING | [Hardware acceptance checklist](sake-street-kitchen-printer-checklist.md) |
| Production release / hosted upgrade | NOT AUTHORIZED / NOT VALIDATED | No hosted database inventory was accessed; candidate promotion requires explicit review of the actual future target |

Machine-readable evidence: [verification summary](evidence/kitchen-printing-mainline/verification-summary.json), [real full-app/native result](evidence/kitchen-printing-mainline/full-app-e2e.json), [fault scenarios](evidence/kitchen-printing-mainline/fault-injection-results.json), [local regressions](evidence/kitchen-printing-mainline/local-regressions.json). The screenshot captures the real local Kitchen state. Credentials and private test arguments remain ignored.

## Recovery conclusions

| Fault | Observed recovery |
| --- | --- |
| Crash before connect | No TCP bytes; conservative uncertainty; no automatic resend |
| Crash during transmission |4096 bytes captured; uncertain; no automatic resend |
| Crash after TCP write | Full stream captured; uncertain; no automatic resend |
| Crash before server acknowledgement | Durable local outcome acknowledged after restart; no TCP resend |
| Before acknowledgement, lease expiry, second-device quarantine, lost committed response | Uncertainty remains quarantined even after late/retried acknowledgement |
| Lost server acknowledgement | Acknowledgement retried only; one TCP stream/attempt |
| Concurrent claims |20 HTTP requests using2 registered device credentials produce1 winner |

These tests do not simulate paper sensors. A transmitted job means bytes were written, not that a physical ticket printed. Two-credential HTTP contention is not two simultaneously running physical tablets. The worker remains foreground-only; real sleep/reboot/LAN/OS behavior needs hardware acceptance.

## Remaining limits and merge recommendation

No confirmed critical/high software finding remains in the reviewed scope. Optional settings-history refresh latency is recorded in QA. Two legacy-specific checks stopped at required input validation: canonical-only historical authorization needs its approved fixture/range, and staff-schema compatibility needs an approved catalog snapshot. No pass is claimed for either. Historical cutover/payment-transition harnesses were not replayed against unrelated stacks. Current canonical Auth/financial behavior did pass in the separate local integration gate. This is a bounded full-flow/application regression result, not an assertion that every historical repository harness or hosted schema was validated.

Recommend review of the replacement Draft PR against current main. Do not merge PR18 or its broad prerequisite snapshot. Required source merge order is the replacement mainline PR only, after normal review and a future explicit merge authorization. Recheck the main base if it advances. Keep the candidate unpromoted until a separately authorized migration/release process verifies the target inventory. Physical acceptance remains a release gate, and no deployment is authorized by this report.

Reproduction and installation: [local setup](kitchen-printing-mainline-setup.md). Operational recovery: [rollback](kitchen-printing-rollback.md). Rollback disables dispatch, stops/revokes agents, reconciles paper/uncertainty and preserves jobs, snapshots, audit, financial records and sticky protocol2 fencing; no destructive down migration.
