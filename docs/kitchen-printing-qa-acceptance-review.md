# Kitchen printing independent QA acceptance review

Date: 2026-10-20. Reviewed isolated candidate HEAD `17163bd` plus the uncommitted native fault checkpoint, instrumentation, runner, and acceptance evidence. QA made no implementation edits, accessed no hosted backend, and did not run or modify the emulator, TCP simulator, proxy, or fixture generator. No merge, deployment, or production database operation occurred.

## Result

Focused printing checks passed. No confirmed new blocking printing defect was found in this review. Release/full-app acceptance remains blocked by existing schema contracts, prerequisite integration, and the UAT guard. These are not converted into passing tests by the native evidence.

## Commands independently executed

- `pnpm run test:kitchen-print`: exit 0, 11 tests passed, 0 failed/skipped.
- `pnpm run test:kitchen-print:local`: exit 0; access, dispatch, and delivery assertion groups passed. Verified the runner checks Docker project identity `aveniq-kitchen-p0-20261020`; each suite uses generated UUID fixtures inside BEGIN/ROLLBACK.
- `node --check scripts/run-kitchen-print-fault-tests.mjs` and `node --check scripts/kitchen-print-fault-fixture.mjs`: passed syntax checks.
- `node tests/test-uat-regressions.mjs`: exit 1, ENOENT for `netlify/sake-street-redirect/_redirects` at Promise.all index 3. No later assertions passed in this execution.
- `git show 1decbfc:supabase-client.js` with scoped source checks: confirmed prerequisite already calls provisioning, selects venue_status and item status/void fields, and calls the retired get_public_restaurant endpoint.
- Read-only Node assertions against `fault-injection-results.json` and `.local-print/faults/*-recovery.log`/`lost-ack.log`: exit 0, seven scenario records consistent with six actual `OK (1 test)` instrumentation success logs. Killed instrumentation runs are not counted as passed tests. Assertions checked the exact scenario counts, state, bytes, attempts, and saved recovery success markers described below.

## Fault acceptance evidence

The lead ran actual emulator force-stop and recovery; this QA independently inspected its runner/source, final JSON dated `2026-10-20T10:33:38.314Z`, and saved logs without repeating the shared-device run. Final evidence consistency assertions passed: seven scenarios, six successful instrumentation logs, five intentionally terminated processes, exact late-ACK counters and all state fingerprints present.

| Scenario | Nonempty TCP connections / bytes | Recovery state | Distinct attempt IDs |
| --- | --- | --- | --- |
| Before connect | 0 / 0 | uncertain | 1 |
| During write | 1 / 4096 | uncertain | 1 |
| After TCP write, before durable outcome | 1 / 10764 | uncertain | 1 |
| Before acknowledgement, durable transmitted outcome | 1 / 10764 | transmitted | 1 |
| Lease-expired quarantine + lost late ACK | 1 / 10764; 3 ACK requests, 1 response dropped, 2 successful finish responses | uncertain | 1 |
| Lost real server finish response | 1; 2 finish RPCs; 1 dropped response | transmitted | 1 |

All five killed-process cases leave a durable consumed journal and recover using the native worker. Recovery instrumentation observes at least two further worker polls before asserting no state/attempt changes; host capture asserts no second nonempty connection. The before-connect conservative uncertainty is intentional: output authorization has already been consumed. The after-write case does not claim physical paper confirmation. Three normal audit event rows (four for late quarantine) correspond to one distinct attempt, not separate print attempts.

The multi-device test registers two device credentials, issues 20 concurrent claim RPCs, and observes one winning claim. This is real database/HTTP contention evidence, not two tablets running concurrent native workers. Combined with real single-worker recovery evidence it supports no blind reprint in the tested cases, with that scope limitation.

The final runner compares pre/post entire orders row, order_items collection and payment_operations collection fingerprints, status and paid_at for all five crash cases and the lost-ACK case. Synthetic orders remain new/unpaid. The payment collection is empty; this proves no payment operation was introduced, not paid-order financial E2E. Full Kitchen screen workflow invariance remains unverified because full-app data loading is blocked.

The extra late-ACK case reproduced a retained-journal recovery defect before the fix: server quarantine coerced a late transmitted outcome to uncertain, the response was lost, and the stored transmitted outcome then conflicted indefinitely. The final native code handles that exact conflict only for a stored transmitted/not_sent outcome, durably changes the journal to uncertain and retries the same acknowledgement. It never resends TCP or clears server quarantine. Final evidence shows three ACK requests (one conflict), two successful finish responses, one dropped response, one nonempty TCP send and one distinct attempt. Recovery logs pass, journal clears and uncertainty remains. Reviewed the server-state-based Attention Required UI behavior and restricted fallback source; no new blocking printing defect found. The independent JS suite was rerun after the native change: 11/11 passed.

## Confirmed existing blockers

1. High / release blocker: main/prerequisite integration. Preconditions and reproduction are documented in `kitchen-printing-pr-dependencies.md`: exact main/base SHAs and read-only merge-tree return 18 conflicted paths. Expected preserved main behavior cannot be established by PR18 being clean against its stacked base. This QA read that evidence; it did not re-fetch or rerun integration.
2. High / full-app acceptance blocker: canonical schema lacks required client contracts. `fullapp-schema-results.json` shows unchanged original schema lacks venue_status/provisioning/item status; clone with unchanged013 returns provisioning/printer200, orders400 (missing item status), and legacy restaurant403 (permission intentionally revoked). Source provenance independently confirms these client dependencies predate printing. Expected real Front Desk Send-to-Kitchen and Kitchen order display cannot be tested to completion. Do not regrant the retired API to make acceptance pass.
3. Medium / regression guard blocker: independently reproduced missing Netlify redirect fixture. Expected UAT assertions to run; actual immediate ENOENT above. The dependency report separately reproduces the same problem on prerequisite and diagnoses stale hard-coded asset/cache versions after temporary fixture injection. QA did not inject fixtures or weaken assertions.

## Scope and remaining manual acceptance

No fresh browser interaction, responsive layout pass, tablet touch-target session, physical printer/paper/cut verification, or two-device native end-to-end run was performed by this QA. The lead's real browser settings persistence evidence is narrower than a passed order workflow. No configured lint/typecheck script exists in inspected package.json; this focused QA did not repeat the lead's Android build or broad site build. Those results must be reported only from their actual executed evidence.

Remain blocked from release acceptance until the prerequisite/main integration and app/schema contracts are separately reconciled and actual Front Desk-to-Kitchen flow is exercised. Printer hardware and paper output remain NOT TESTED. These limitations do not negate the passing focused unit/local SQL/native recovery checks.
