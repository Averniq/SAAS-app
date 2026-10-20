# PR18 pre-merge software acceptance

Date: 2026-10-20. Recommendation: **DO NOT MERGE**. PR18 remains a draft; no merge, deployment, hosted migration or Production access is authorized or performed.

## Updated acceptance matrix

| Acceptance | Actual result | Evidence / limitation |
| --- | --- | --- |
| Existing schema differences | ISOLATED | Pre-printing client contracts disagree with canonical22; see schema investigation |
| Actual app staff sign-in | PASS with isolated prerequisite | Genuine local Auth, unchanged historical013 applied only to a distinct clone DB |
| Actual Kitchen Printers page / save / reload | PASS | Actual app navigation and persisted printer listing, real local API/RLS |
| Actual Front Desk Send-to-Kitchen → Kitchen Display → native print | BLOCKED | Missing item-state fields and client calls to intentionally retired RPC; no fake endpoints or relaxed grants |
| Crash before TCP connection | PASS | Actual app process force-stopped after durable consume; 0 ticket bytes; restart → uncertain, no resend |
| Crash during TCP transmission | PASS | Actual process force-stopped after first4096 bytes of a10764-byte ticket; restart → uncertain, no resend |
| Crash after TCP write | PASS | Actual process force-stopped after complete10764-byte write, before result journal; restart → uncertain, no resend |
| Crash before server acknowledgement | PASS | Actual process force-stopped with durable transmitted outcome; restart sends ACK only; state transmitted, paper unconfirmed |
| Lost server acknowledgement | PASS | Real HTTP response dropped after server commit; two successful finish calls, one TCP send |
| Restart with already uncertain job | PASS | Recovered uncertain journal clears, remains quarantined over subsequent worker polls; no TCP resend |
| Lease expiry + quarantine + lost late ACK | PASS after fix | Real31-second lease expiry, second device claim quarantines; one dropped response,3 ACK requests, one TCP send, journal reconciles uncertain |
| Multiple tablets claiming same job | PASS at API/device level |20 concurrent HTTP claims from two independently approved device credentials, one winner; not two physical tablets |
| Order/Kitchen item/payment data unchanged | PASS in fault fixtures | Pre/post full order-row, order-item and payment_operations fingerprints compared for crash and ACK cases; synthetic orders remain new/unpaid |
| JS / local SQL / HTTP regression | PASS |11 JS tests,3 SQL suites, real local Auth/PostgREST role/tenant/concurrency matrix |
| Android baseline build/lint/unit/instrumentation | PASS | Standard local backend restored;7 instrumentation and4 JVM tests,0 failures/errors/skips; debug build/lint passed |
| Existing UAT guard | FAIL, pre-existing isolated blocker | Same missing redirect fixture at prerequisite and feature; temporary fixture exposes stale asset/cache literals |
| PR dependencies | BLOCKED | Snapshot/main diverge64 main-side commits;18 conflict paths; clean stacked merge status is insufficient |
| Focused QA / Security | Completed, final evidence review | Independent tests/source/evidence review; no unresolved critical/high printing findings |
| Actual tablet / S300H | PENDING | Hardware unavailable, printer LAN/IP unknown; emulator/TCP cannot establish paper success |

## Fix and test method

The combined late-ACK regression failed before the fix: server had coerced the late finish to uncertain, the response was lost, and retransmitting the stored transmitted outcome hit PRINT_OUTCOME_CONFLICT indefinitely. This retained the journal safely but blocked recovery.

`PrintAgent.acknowledge` now responds to that exact conflict only for stored transmitted/not_sent outcomes: it durably downgrades to uncertain, retries the **same acknowledgement**, and clears the journal only after a validated server state. A second failure retains it. It never retries TCP output, releases quarantine or rewrites server history. Both active and restarted paths show Attention Required for an uncertain server result. No SQL migration or order/payment behavior changed in this follow-up.

The native test seam is package-private, has no WebView bridge entry, and rejects injected callbacks in a non-debug context. Production construction supplies a no-op callback. Native writes use bounded chunks and retain uncertain classification on cancellation/write failure. The host runner uses actual `adb am force-stop`, verifies PID termination and starts a new instrumentation process against the persisted Keystore/AtomicFile journal. Killed instrumentation runs are intentional fault injections, **not passed tests**; successful recovery assertions are counted separately. This validates abrupt emulator process death, not an organic OS crash, power-cycle or real tablet.

The late case waits for the real lease clock to expire, then uses an independently paired device claim to produce server uncertainty. The ACK proxy binds only loopback57635, forwards to the named local57631 API, and destroys an actual successful response after the database commit. TCP captures are loopback19130. Control, claim, begin and finish RPCs remain genuine local Auth/PostgREST calls.

[Sanitized fault results](evidence/kitchen-printing/fault-injection-results.json) include APK hash, killed PIDs, byte counts, exact attempt counts, ACK counters and unchanged-data fingerprints. The journal records contain credentials/claim tokens and are not exported. A payment fingerprint of an empty synthetic ledger proves no payment operation was introduced; it is not paid-order financial E2E.

[Final normal-build verification](evidence/kitchen-printing/premerge-verification.json) records the standard local APK hash and final7/4 test counts separately from the fault APK.

## Commands and suites

- `node scripts/build-kitchen-android.mjs --fault-injection`, then `android\\gradlew.bat -p android assembleDebug assembleDebugAndroidTest`.
- `node scripts/run-kitchen-print-fault-tests.mjs --emulator emulator-5554`: seven scenarios; five intentional terminations and their recovery assertions, one ordinary lost-response scenario and one dual-device concurrency scenario. The expired-lease scenario was observed failing before the fix and passing afterward.
- Restore the standard local backend with `node scripts/build-kitchen-android.mjs` before normal builds/tests. Fault APK and standard local APK hashes differ; neither is a restaurant release.
- `pnpm run test:kitchen-print`, `pnpm run test:kitchen-print:local`, `pnpm run test:kitchen-print:http`, scoped declaration/syntax checks and `pnpm run build`.
- Normal `connectedDebugAndroidTest` selects the two normal instrumentation classes. The crash class must run through the explicit host runner: running termination tests inside an aggregate runner would kill that runner. This is suite separation, not skipping a failed test. The complete fault suite is executed and reported separately.

## Full-app and prerequisite boundaries

[Schema investigation](kitchen-printing-schema-investigation.md) records the real browser results and exact API errors. Canonical22 lacks provision_self_service_account/venue_status and order_items.status. App loadRestaurantData still calls get_public_restaurant, which P0-04 deliberately revokes. These stale contracts were present in prerequisite1decbfc before printing. Historical013 resolves only sign-in in the separate clone. Replaying every historical migration, regranting a retired endpoint or adding fake provisioning is not an acceptable fix.

[Dependency and UAT audit](kitchen-printing-pr-dependencies.md) records all18 conflict paths, live GitHub SHAs and baseline reproductions. Required order: reconcile/integrate prerequisites on current main while preserving its64 newer commits; independently review/test that integrated app/schema and correct the prerequisite UAT contract; then transplant printing-only changes onto that exact base and rerun affected acceptance. Do not wholesale replace app files, resolve with blanket ours/theirs, force push, or modify applied migration history. No prerequisite integration is claimed or performed here.

## Remaining blockers and hardware

1. Release-base prerequisite reconciliation and review are required; PR18 is clean only against its snapshot base.
2. Full Front Desk/Kitchen order E2E needs the separately reconciled app/schema contract. Printer configuration/native/queue checks do not substitute for that flow.
3. The pre-existing UAT guard remains failing; its deployment fixture/version contract needs a separate prerequisite correction.
4. Actual Android tablet and S300H acceptance remains PENDING. Follow the [hardware checklist](sake-street-kitchen-printer-checklist.md): record device/API/WebView/APK, authorized test backend, known/reserved printer IP, LAN/subnet/port, width/cut/copies/glyphs, offline/paper/cover errors, reboot/sleep/network loss, two-tablet behavior, manual reprint and operator rollback. No Production substitution.
5. API24 runtime and actual physical sleep/power loss are not verified by API36 emulator process-death tests. Existing unrelated database lint warnings also remain outside printing.

Use the existing [installation guide](kitchen-printing-setup.md) and [rollback procedure](kitchen-printing-rollback.md). Keep auto dispatch off, stop/revoke agents before reconciling ambiguous paper, preserve snapshots/audit/order/payment records and keep the sticky protocol2 legacy fence. No release recommendation is made until dependency/full-app blockers and required hardware acceptance are resolved under separate authorization.
