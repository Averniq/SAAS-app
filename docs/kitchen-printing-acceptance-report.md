# Kitchen auto-printing acceptance report

Latest follow-up: [PR18 pre-merge acceptance](kitchen-printing-premerge-acceptance.md), including actual process-death/lost-ACK tests and prerequisite merge blockers. The counts and unexecuted scenarios below describe the initial implementation run.

Date: 2026-10-20. Branch: `codex/kitchen-auto-printing-20261020`.

## Actual delivery status

| Area | Result |
| --- | --- |
| Software implementation | Core P0 implemented across all 11 task areas; acceptance has the limitations below |
| Simulator testing | PASS: Node byte captures/partial disconnect; actual Android TCP and paired queue worker |
| Android emulator | PASS: API36 Pixel Tablet AVD; 6 instrumentation tests, 0 failures/skips; unit/build/lint pass |
| Full application E2E | BLOCKED by broader pre-existing canonical-schema/application mismatch |
| Physical tablet and IVIDA S300H | PENDING: unavailable tablet, restaurant-only LAN, unknown IP |
| Production release | NOT AUTHORIZED; no deployment, merge, hosted migration or Production access |

This is a draft review candidate, not a production-ready release. TCP success is recorded as **Sent to printer — paper not confirmed**. It never asserts paper output. Android printing is foreground-only.

## Baseline and scope

Original checkout was already dirty at HEAD `38cd1f3`; it was not reset or stashed. Native managed worktree: `kitchen-auto-printing-0162`. Explicit required application prerequisites were recorded in `1decbfc`; printing changes start after that commit. The Draft PR targets a separate prerequisite branch so unrelated existing application source is not presented as this feature. That prerequisite is unmerged and must be reconciled with the eventual release base separately.

The existing legacy order queue evolves to per-printer jobs. Protocol2 activation permanently fences the legacy consumer for that tenant; disabling auto print does not restore legacy scanning. Deferred transactional materialization builds immutable snapshots. Category routing and copies are captured at dispatch; native begin validates the current approved configuration revision. Printing never marks an order paid or changes Kitchen order status.

Seven SQL **candidates** are in `supabase/kitchen-print-candidates/`. No approved canonical migration, manifest hash or hosted database was changed. New tables are RLS-enabled with direct client access denied; validated RPCs scope roles, tenant, operator, device and printer. Device secrets remain in Keystore-encrypted native storage. Ambiguous transmission/acknowledgement stays quarantined until explicit staff reconciliation; attempts are never blindly replayed.

## Task accounting

| Plan task | Implemented result / evidence boundary |
| --- | --- |
| 1 Baseline | Isolated worktree, hash-verifying candidate materializer, pinned local CLI/toolchain; raw legacy replay issue recorded below |
| 2 Configuration/auth | Printer/category settings, pairing/approval/revocation, tenant/RLS/role tests |
| 3 Queue | Deferred immutable snapshots, idempotent QR dispatch, legacy fencing, routing/test-order exclusion |
| 4 Delivery | Atomic claims, serialization, retry bounds, uncertainty quarantine, linked manual reprints/audit |
| 5 Ticket model | Versioned JS/TypeScript contract, shared synthetic JSON fixture and native ESC/POS encoder; no iOS implementation |
| 6 Capacitor | Android package, Keystore, fixed backend origin, private-LAN validation, native bridge |
| 7 Worker | Native TCP, bounded sockets, durable attempt journal, session/run generation guard, restart duplicate assertion |
| 8 UI | Manager settings, Kitchen operational tools, pairing, test/reprint/history, offline/attention status |
| 9 Simulator | Capture/refuse/partial-disconnect/stall modes; automated capture/partial tests and native transport execution |
| 10 Acceptance | JS/SQL/real local Auth/HTTP/emulator suites and four independent reviews; broader app E2E and hardware remain outstanding |
| 11 Delivery/rollback | Local disable/revoke/fencing/quarantine assertions, setup/rollback/hardware docs and Draft PR; physical rollback rehearsal pending |

Some planned acceptance scenarios remain unexecuted; implementation across the task areas does not mean every acceptance checkbox passed. In particular, no OS force-stop during an in-flight write, deterministic delayed-begin response/lost-ACK fault-injection, API24 runtime, physical sleep/background or physical printer error test is claimed. Restart coverage recreates the native worker/store and verifies one original server attempt; it is not a real tablet power-cycle test.

## Executed validation

| Command / check | Actual result |
| --- | --- |
| `pnpm run test:kitchen-print` | PASS, 11 tests; no skipped tests |
| `pnpm run test:kitchen-print:local` | PASS, access/dispatch/delivery SQL suites, rollback-isolated assertions |
| `pnpm run test:kitchen-print:http` | PASS, real local Auth/PostgREST; role/tenant denials, direct-table denial, 10 concurrent same-key QR submissions → one job, 20 claims across two devices → one live claim, bounded history, test idempotency, uncertainty, revocation, Bar/Dessert routing |
| `node scripts/replay-kitchen-print-candidates.mjs` | PASS: 22 unchanged canonical + candidates1–6 on newly created isolated DB, all3 SQL suites; subsequent candidate7 lint cleanup applied to both task DBs and all3 suites rerun successfully |
| `pnpm run build` | PASS; existing outdated Browserslist data warning |
| `node --check` on all5 new JS modules | PASS |
| `pnpm --package typescript@5.9.3 dlx tsc --noEmit --lib 'es2022,dom' src/kitchen-printing/contracts.d.ts` | PASS scoped declaration check; no claim of a root TypeScript/lint script |
| `android\\gradlew.bat -p android assembleDebug testDebugUnitTest lintDebug connectedDebugAndroidTest` with private synthetic fixture arguments | PASS; debug APK built, JVM tests/lint and 6 instrumentation tests, 0 failures/errors/skips |
| Canonical integrity, mobile/PWA and app-shell guards | PASS |
| Kitchen void, order integrity, business arithmetic/server guards, QR reliability/P0-04, payment ledger/P0-03 and Review Order guards | PASS; these are contract/regression guards, not full UI/payment E2E |
| `node tests/test-uat-regressions.mjs` | FAIL: selected prerequisite snapshot lacks the existing Netlify redirect fixture. The same command on the untouched original checkout also fails on stale app/cache-version assertions. No assertion was weakened to hide this |
| Local database lint | New kitchen functions clean after candidate7. Existing unrelated `get_public_qr_order_context/status` STABLE→VOLATILE warnings remain |

Toolchain actually used: Node24.18.0, pnpm9.15.9, Supabase CLI2.121.0, JDK21.0.12.1+1, Android platform36/build tools36, API36 Google APIs x86_64 emulator, Capacitor8.4.1, checked-in Gradle wrapper. Machine-specific tool paths and Auth fixtures stay ignored. The emulator debug package alone permits HTTP to exact host `10.0.2.2`; release configuration remains TLS-only and has no release backend/signing configuration.

Instrumentation executes: encoder copy/cut/Unicode behavior, encrypted store persistence, actual native TCP bytes to simulator, real pairing/queue/worker plus restart no-replay assertion, debug WebView access to actual local Auth, and generated package-context assertion. Sanitized counts/APK SHA256 are in [automated-results.json](evidence/kitchen-printing/automated-results.json). Raw local tokens, credentials and instrumentation arguments are excluded.

## Environment findings

Docker works. The earlier pipe denial was sandbox access restriction; no Docker ACL, service or unrelated stack was changed. Only task projects `aveniq-kitchen-p0-20261020` (API57631/DB57632) and `aveniq-kitchen-p0-replay-20261020` (DB57832) were provisioned. Existing occupied ports were avoided.

The unmodified raw canonical replay initially failed an existing privilege precheck: the current image grants service_role EXECUTE on early legacy functions. The clean disposable replay explicitly revoked that role's default function EXECUTE **before** creating historical functions. The initial HTTP fixture was locally hardened before applying the remaining unchanged canonical chain. No frozen SQL changed and no failed check was bypassed. This initialization difference must be considered in future baseline promotion.

The canonical22 schema lacks unrelated fields/RPCs used by the current app, including `restaurants.venue_status` and `provision_self_service_account`. Consequently, full sign-in/navigation/Send-to-Kitchen through the complete browser app has not passed. Printer component QA used an explicitly labeled harness with actual local API; native acceptance used actual local Auth, QR enqueue and queue RPCs. No fake provisioning endpoint was added. Reconcile this broader baseline before restaurant installation.

## Independent reviews

| Review | Confirmed defects fixed and rechecked | Remaining boundary |
| --- | --- | --- |
| QA | Save form id shadowing; unsaved drafts lost on polling/cross-actions; duplicate route Save button; stale history refresh | Component harness only; native confirmation cancellation was tool-blocked and is not counted as a pass |
| Security | NULL outcome/revision/resolution bypasses; endpoint quarantine escape; common legacy cutover fence; late native session response race; repaired-device journal recovery | No unresolved critical/high findings; deterministic response/ACK-loss and true process-death tests remain advisable |
| Performance | Control/printer lock inversion; device lock upgrade; history/attention query tenant bounds and index; NULL history limit | Concurrent local transactions completed without deadlock; 10-tenant/100-printer/10k-history fixture measured about0.124ms/6 buffers for revised attention lookup versus1.825ms/185 buffers before |
| UX | Preserved drafts; legible status language; tablet/mobile touch controls and bounded history | Screenshot review at1280×900,768×1024,360×800; other planned exact viewports not claimed |

All critical/high-severity findings raised by these reviews were resolved. See [UI evidence](evidence/kitchen-printing/) for synthetic screenshots. Suggestions and pending coverage are distinct from confirmed defects.

## Installation and rollback

Follow [setup](kitchen-printing-setup.md), [rollback](kitchen-printing-rollback.md) and [hardware checklist](sake-street-kitchen-printer-checklist.md). No restaurant-ready release APK is provided: the tested debug APK targets the isolated development backend. Hardware installation needs a separately authorized test backend, known printer IP and physical acceptance. Preserve jobs, snapshots and audit during rollback; disable dispatch, stop/revoke agent, reconcile uncertainty, keep protocol2 fenced, and correct forward. Do not run destructive down SQL or silently restore the legacy scanner.
