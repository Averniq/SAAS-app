# Kitchen printing security acceptance follow-up

Review date: 2026-10-20. Reviewed HEAD `17163bd` and the uncommitted fault-test additions. Independent source review only; no merge, deployment, hosted database, Production, printer-network or emulator interaction occurred in this review.

## Result

No confirmed critical/high security defect was found in the reviewed changes. This is not release acceptance: the lead is separately executing the process-death and real HTTP acknowledgement-loss scenarios. The full-app schema mismatch and prerequisite/main integration blockers remain release blockers.

## Reviewed changes and security properties

- `PrintAgent.java`, `FaultCheckpoint.java`: package-private injection seam; normal public constructor supplies `NONE`. Injected agent construction rejects a non-debuggable application. `KitchenPrintPlugin.java` exposes only existing session/pairing/start/stop/status methods, with the local-app origin check; no bridge accepts checkpoint names, callbacks or constructor selection. Release injection rejection was verified by source, not a release APK runtime test.
- `TcpPrinter.java`: writes now check the current run/session between 4096-byte chunks. Once output may have started, cancellation, write exceptions and hook exceptions return `uncertain`; connection-stage failure remains `not_sent`. The finally block closes the socket. Existing private-IPv4, subnet, Wi-Fi/Ethernet and no-VPN checks remain.
- Journal flow remains consume-before-socket. Restart first reconciles its pending record rather than resending bytes. Device mismatch archives the pending attempt rather than using new device credentials to acknowledge an old device's attempt.
- Latest candidate7 `finish_kitchen_print_attempt` still validates authenticated operator/device secret, tenant-scoped job, claim and attempt identity; rejects NULL/invalid outcomes; returns existing same-outcome completion idempotently; and keeps already-uncertain dispatches quarantined. No candidate SQL or canonical grants changed in this follow-up.
- Instrumentation code is under `androidTest`, not a WebView bridge. Marker evidence contains checkpoint, PID, phase and outcome, without credentials. Private JWTs and backend configuration remain in ignored local files/arguments. Test harness emits sanitized state/count/byte/hash evidence.
- Fixture uses exact loopback origin `127.0.0.1:57631`; runner proxy and TCP simulator bind loopback only. SQL validates the named Docker container's `com.supabase.cli.project` label before every call. Inputs interpolated by this fixture are generated UUIDs, fixed literals or validated numeric ports; it does not use a user-provided remote origin.

## Existing baseline boundaries

Reviewed `docs/kitchen-printing-pr-dependencies.md`, `docs/kitchen-printing-schema-investigation.md` and sanitized `fullapp-schema-results.json`. The approved canonical schema intentionally denies the legacy `get_public_restaurant` endpoint. Missing provisioning/item-state contracts and the retired client call need separately reviewed app/schema reconciliation. Regranting that endpoint or replaying every historical SQL file is not an acceptable printing fix. The documented prerequisite branch conflicts with current main; a clean stacked PR does not establish safe release integration.

## Operational finding reproduced and fixed

The initial review identified a pre-existing conservative edge: if a dispatch has already been quarantined, a late `transmitted` finish is coerced to `uncertain`. If the response to that particular finish is then lost, retrying the durable original `transmitted` record raises `PRINT_OUTCOME_CONFLICT`; the journal remains pending. This does not cause an automatic reprint or bypass quarantine, but could require support/device recovery. It was a lower-severity reliability defect, not a critical/high security finding. The lead reproduced it with an actual emulator stop before ACK, real lease expiry, another authorized device claim creating quarantine, and a dropped late-finish response. The pre-fix instrumentation log fails the journal reconciliation assertion.

## Checks actually run

- `git diff --` for the two changed production Java files; `git status --short`: inspected successfully using read-only escalated worktree access.
- `node --check scripts/kitchen-print-fault-fixture.mjs`: PASS.
- `node --check scripts/run-kitchen-print-fault-tests.mjs`: PASS.
- Source review of plugin surface, encrypted AtomicFile journal/store, latest delivery/device authorization candidates, manifests/build configuration and dependency/schema reports.

No dynamic authorization, release-APK injection, SQL or emulator test is claimed by this independent review. Existing suites and the lead's current fault run must be reported separately with their actual outcomes. Ignored fault backend configuration must be restored to the standard local target after that run; no release backend/signing or restaurant-ready APK is established here.

## Focused fix re-review and supplied execution evidence

Re-reviewed the subsequent `PrintAgent.acknowledge` fix. An exact `PRINT_OUTCOME_CONFLICT` on a durable original `transmitted` or `not_sent` outcome permits only a durable downgrade to `uncertain`, followed by another finish RPC. It never calls TCP or changes server authorization. A failed second acknowledgement preserves the journal; conflicting committed transmitted outcomes remain rejected. Reply state is validated before journal removal. Both immediate send completion and pending recovery use the server's authoritative uncertainty for Attention Required, avoiding an incorrect Ready status.

Read the lead-generated seven-scenario `fault-injection-results.json` and ignored late-quarantine recovery log after the fix. The latter reports `OK (1 test)`; the sanitized scenario records three ACK requests, one dropped response, a single 10764-byte TCP capture, one distinct attempt, and final `uncertain` state/outcome. The recovery test now asserts Attention Required immediately after reconciliation. Order/item/payment fingerprint comparisons are asserted by the runner. These executions were performed by the lead, not independently rerun by this reviewer, to avoid interfering with the shared emulator/fixture.

The added `releaseContextRejectsFaultInjection` test supplies a ContextWrapper with the debuggable flag removed. This tests the guard branch, not an actual release APK; retain that distinction in acceptance reporting. No confirmed critical/high security defects remain in this focused source re-review. Full application/schema, dependency integration and physical paper-output limitations remain unchanged.
