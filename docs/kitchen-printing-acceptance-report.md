# Kitchen printing acceptance evidence

Date: 2026-10-20 Australia/Sydney. Local development only. Production release NOT AUTHORIZED. Not Production Ready.

## Delivery status

| Area | Result |
| --- | --- |
| Software implementation | COMPLETE for local software candidate, listed local validation complete; exclusions below |
| Simulator testing | PASS — Node real TCP tests and actual native emulator capture |
| Android emulator testing | PASS —22 JVM tests,6 emulator component tests and2 API/worker/simulator process-restart scenarios |
| Physical hardware acceptance | PENDING — PHYSICAL HARDWARE REQUIRED |
| Production release | NOT AUTHORIZED |

The approved11 tasks have software implementations and available validation; Task10 physical tablet/printer acceptance remains explicitly open under the user's hardware-unavailability ruling. A Draft PR is review delivery, not release approval. Real Sake Street hardware sign-off and separate approval are required before Production Ready.

## Approved task accounting

| Task | Software result / evidence |
| --- | --- |
|1 isolated baseline |PASS: canonical22 replay, materializer and frozen hash tests |
|2 configuration/pairing/RLS |PASS: access/config role/tenant/proof/revision fixtures |
|3 queue/legacy fencing |PASS: immutable snapshot, routing, QR idempotency and independence fixtures |
|4 delivery/audit/reprints |PASS: lease/retry/quarantine/history, concurrency and recovery SQL |
|5 model/ESC/POS |PASS: shared fixture, copies/cuts/control injection/bounds and native Unicode raster checks |
|6 Android/credentials/LAN |PASS: pinned build, origin bridge, Keystore/no-backup and subnet tests |
|7 worker/restart |PASS: durable journal plus actual OS force-stop/native/API scenarios |
|8 Settings/Kitchen alerts |PASS: scoped status/setup/history/recovery UI, QA/UX retests and actual local shell |
|9 simulator |PASS: real TCP capture/refusal/disconnect/stall and after-commit fault proxy |
|10 acceptance/reviews |Listed local suites PASS; four independent reviews complete; physical acceptance PENDING |
|11 rollback/docs/Draft PR |Local rollback PASS; setup/rollback/hardware/evidence docs delivered; Draft PR is final handoff |

## Scope and reproducibility

Original HEAD38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c, branch feature/customer-review-order, had substantial pre-existing dirty work. Implementation is isolated on codex/kitchen-auto-printing. Curated prerequisite commit c255bb8 preserves current app/build source, canonical release controls/frozen evidence and the approved plan. Review feature changes against c255bb8 separately from that prerequisite baseline. No original checkout implementation was reset or overwritten. Required regression fixtures/images were copied explicitly; resumes, env files and unrelated private artifacts were excluded.

Fresh project **aveniq-kitchen-final-a153d2**: API59181/DB59182/shadow59180, isolated .kitchen-local/final-replay, CLI2.114.0/PG15.8.1.085. All22 canonical migrations and11 explicit forward candidates replayed; catalog inventory and source/materialized hashes verified. Earlier interactive project aveniq-kitchen-cli2114-a153d2 (remove space) uses API59081/DB59082 and supplied native fixtures. Existing unrelated Docker stacks were unchanged. CLI2.121.0/PG15.19 failed frozen canonical migration19 prestate; no frozen guard/hash was weakened to work around it.

Candidates remain in supabase/kitchen-print-candidates, outside the approved deployment manifest. The11 candidates add printer/device controls, immutable v2 queue snapshots, claim/begin/finish and human recovery, endpoint quarantine, legacy fencing, lock/index/bounded-projection corrections, exact recovery inspection and confirmed disable. Once applied/shared they are append-only. No production SQL was executed.

## Executed verification

| Level | Commands / evidence | Result |
| --- | --- | --- |
| Node unit/simulator/contract | node --test tests/kitchen-printing/*.test.mjs |32 passed,0 failures/skips after local compatibility addition; includes7 materializer,5 TCP simulator and3 compatibility checks |
| Scoped JS typing | node scripts/check-kitchen-printing.mjs |PASS, TypeScript5.9.3 checkJs/declarations and Node syntax; no root-wide lint/typecheck script exists |
| Frozen integrity | node scripts/test-migration-integrity.mjs |PASS unchanged frozen evidence and approved canonical chain |
| Local SQL acceptance | node scripts/run-kitchen-print-local-tests.mjs --local --workspace .kitchen-local/final-replay --suite acceptance |PASS access/config/safety/dispatch/compatibility/delivery/history/rollback transactional fixtures |
| Local concurrency/performance | same runner, --suite concurrency |PASS two simultaneous order commits,20 competing claims yield one live claim, synchronized timeout/finish lock race; per-printer indexed query over10,200 jobs/4 tenants/12 printers |
| Actual Auth/REST | node scripts/test-kitchen-print-http.mjs --workspace .kitchen-local/final-replay |PASS synthetic Auth, tenant/role/device/secret denials, secure pairing, single claim, immutable attempt/ACK replay, anonymous token QR pay-later/idempotency, uncertainty/quarantine, unchanged order/payment state and audit PATCH denial |
| Existing payment/QR SQL | scripts/p0-03-local-assertions.sql and scripts/p0-04-local-assertions.sql through verified owned container psql |PASS, fixtures rolled back; no hosted runner used |
| Android JVM | :app:testDebugUnitTest |22 tests,0 failures/errors/skips |
| Android component instrumentation | :app:connectedDebugAndroidTest excluding NativeBridgeAcceptanceTest (which needs host fixture) |6 tests on dedicated API36 AVD,0 failures/errors/skips; Keystore/no-backup, Unicode raster, encrypted journal/new-engine no replay and corruption fail closed |
| Actual native restart integration | node scripts/test-kitchen-print-emulator.mjs --workspace .kitchen-local/baseline-cli2114 |2 host scenarios PASS; actual bridge/API/simulator and ADB process force-stop/restart, not just fake engine |
| Android lint/build | :app:lintDebug :app:assembleDebug |PASS, lint0 errors/16 warnings; Gradle deprecation warnings remain |
| Browser UI QA/UX | actual browser test harness at4 viewport sizes plus narrow phone; synthetic RPCs explicitly labeled |PASS repeated actions, loading/empty/error/role/status/confirmation, touch targets, focus retention and re-enable; does not itself prove backend/native output |
| Existing regression commands |15 scripts listed below |PASS; static/isolated calculation checks, not a complete production workflow test |

Toolchain: JDK21.0.12.1+1; API36/Android16; ADB1.0.41 platform-tools37.0.1; emulator37.2.12; sdk_gphone64_x86_64 via WHPX; Android WebView133.0.6943.137; Gradle8.14.3; Capacitor8.4.1. No physical device was attached. ADB was verified despite the cancelled system prompt.

Regression scripts actually run: scripts/test-migration-integrity.mjs, scripts/check-kitchen-printing.mjs, scripts/test-app-shell-startup.mjs, scripts/test-mobile-pwa.mjs; tests/test-kitchen-void-contract.mjs, test-order-integrity.mjs, test-critical-business-rules.mjs, test-critical-server-guards.mjs, test-public-qr-order-reliability.mjs, test-p0-04-public-qr-ordering.mjs, test-p0-03-payment-ledger.mjs, test-payment-confirmation.mjs, test-review-order.mjs; scripts/test-sample-qr-test-order.mjs and scripts/test-test-order-reporting.mjs. Authorization/attendance/other hosted runners were not invoked.

Native evidence: [sanitized host results](evidence/kitchen-printing/emulator-scenarios.json). Lost begin response: server uncertain,0 ticket-bearing connections,2 separate zero-byte reachability probes. Lost finish response: server transmitted, exactly1 ticket-bearing connection,2 probes,2 immutable attempt events and no replay after restart. Captured5,224-byte payload contains2 initializations,2 copies and2 cut commands plus Unicode raster. Bytes/cut commands are not evidence of actual paper or cutting. paperConfirmed remains false. Raw captures, credentials and private logs stay ignored locally.

Final direct-local debug APK installed successfully on emulator-5554. SHA256: 7065136b6313c183b1e26cc9620eadea53c3393ee3e004d1108b8271892e4405. It contains the normal direct API59081 configuration, not the fault proxy. Final web production-style build with explicit local public config passed via pnpm run build. Final local db lint: no schema errors. Browser login-form acceptance and real screen-reader testing were not run.

## Independent reviews and fixed defects

- QA: independently ran32 feature tests/structural regressions (initial29 before compatibility), real HTTP checks and browser harness flows. Fixed duplicate Test/Save clicks, save-error retention and hidden resolution selector; inspected role/empty/error/repeated/viewport behavior. Actual local shell verified through a private session bootstrap (not browser login-form acceptance): correct tenant/table/menu/order, Live sync, read-only warning/disabled statuses, real printer uncertainty/history and visible focused Edit form. The collapsed-setup Edit defect found there was fixed and independently retested; the private fixture was removed.
- Security: source plus executed access/compatibility fixtures. Earlier endpoint alias quarantine, null/confirmation, generic-disable audit bypass, in-flight JWT/logout and queued lifecycle/account fencing findings fixed and retested. Final source review found no confirmed unresolved security blocker. Normal backend/auth failures still fail closed.
- Performance: real database lock races/index plans, bounded projections and foreground coalesced polling reviewed. Fixed FK lock deadlocks and attention query expression index mismatch. Independent attention10k sample: rows scanned10,000→1; buffer hits330→3;3.624→0.037ms. Samples are not throughput guarantees. No confirmed unresolved performance blocker.
- UX: screenshots inspected before/after fixes. Corrected polling focus/assignment reset, uncertainty warning priority, dialog naming and disabled→enabled printer edit. All4 confirmed findings retested; no remaining confirmed blocking usability defect in synthetic browser harness. Screen reader and physical tablet interaction remain unverified.

## Design decisions and limitations

A job is immutable per-printer/version1 snapshot. A single native executor journals before begin and records consumption before touching TCP. After any uncertain delivery it reconciles/quarantines; neither tablet nor app restart automatically resends. transmitted means only transport completed. Printed paper, paper-out and cover-open are unknown without verified hardware feedback; Kitchen visibly distinguishes them. Dispatch errors cannot roll back a valid food order; snapshot/routing failures produce immutable attention audit. No print outcome changes order/payment status.

Tenant/role authorization remains server-side. Pairing proof32-byte secret is hashed in SQL and encrypted with Android Keystore/no-backup storage. JWT remains native memory only. Native bridge is packaged-origin/main-frame only with no raw socket/write/generic RPC methods; legacy JavascriptInterface is blocked. Destination is server-approved private literal IPv4 on active Wi-Fi/Ethernet subnet. VPN/cellular/off-subnet paths are denied. Public debug configuration is local anon-only; service_role is never packaged.

Explicit local builds alone provide read-only Kitchen compatibility for pre-existing canonical/client mismatches: missing provisioning RPC, venue_status, optional order/payment/void/item fields and revoked public restaurant-data RPC. Scoped authenticated RLS reads replace only local preview data access. Unknown fields remain unknown; order changes/financial workspaces are disabled with a warning. Normal builds retain existing behavior. This does not validate broader production Front Desk/payment/onboarding compatibility or reopen revoked legacy submit_order. Supported anonymous token QR path was tested separately.

Foreground-only execution; suspension/sleep stops claims. Maximum100-printer/device and500-route projections expose truncation; local preview table/menu500 limit fails closed. A degraded20-printer probe sweep can exceed observation freshness; UI correctly becomes unknown/offline. Sustained throughput/maximum-assignment latency requires real hardware measurements. Browser retry intent survives a request failure only while mounted; after remount inspect history before retry. Lost pairing activation response may require administrative orphan revocation and waiting for pending expiry. No automatic paper-out inference. Provisional80mm/576-dot Unicode/cut profile remains hardware-unverified.

## Rollback and remaining acceptance

Local rollback PASS across queued/leased/dispatching/transmitted/uncertain jobs: pause/revoke, reconcile, preserve immutable history, keep sticky v2/legacy denial, no bulk retry/backfill, continue food orders unchanged. See [operational rollback](kitchen-printing-rollback.md). No destructive down migration is provided.

**PENDING — PHYSICAL HARDWARE REQUIRED:** real Android tablet; S300H connectivity; physical ticket printing; automatic paper cutting; real-world reliability. See [hardware checklist](kitchen-printing-hardware-checklist.md). No restaurant LAN access/scanning, deployment, merge or production database access occurred.

The Draft PR title and final pushed commit contain [skip netlify] to suppress automatic branch/PR previews, as documented in [Netlify deploy controls](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/). No deployment command was run.
