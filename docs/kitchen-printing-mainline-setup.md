# Kitchen printing mainline setup

This branch is based directly on main8d0a6c1. It replaces the stacked PR18 integration approach. Do not merge the old prerequisite snapshot or PR18. No deployment, hosted migration or Production operation is authorized.

## Reproduce local software validation

Use Node24.18.0 (tested), pnpm9.15.9 and Docker. Run `pnpm install --frozen-lockfile`. Install Supabase CLI2.121.0 at ignored `.tools/supabase.exe` or set `SUPABASE_CLI` to that exact version.

Run `node scripts/setup-kitchen-mainline-local.mjs --local` only in a fresh checkout with free ports58030–58033. It verifies24 historical main migration hashes, copies them and the explicitly selected new candidate into a new disposable project, and starts only `aveniq-kitchen-mainline-20261020`. It refuses an existing destination or occupied port; do not delete/reset another stack to get past that refusal. Local credentials/logs stay ignored. This is candidate testing, not migration promotion.

For the existing task stack, reuse its ignored `.local-print/api-config.raw`. If local status is needed, write CLI JSON directly to that ignored file rather than posting credential output. Never use db push, linked commands or hosted URLs.

Run:

- `pnpm run test:kitchen-print`, `pnpm run test:kitchen-print:local`, `pnpm run test:kitchen-print:http`.
- `node --test tests/test-uat-regressions.mjs` for main-source integrity and actual asset-version coherence.
- `node tests/test-kitchen-mainline-compatibility.mjs` for a separately created main24+printing DB/Auth/REST stack,36 core checks and3 printing SQL suites. It cleans only its random task stack.
- `node scripts/test-kitchen-mainline-full-app.mjs` after the HTTP fixture. This launches isolated headless Chrome against actual local Auth/REST, uses actual password login and QR Review/Confirm UI, verifies one order/job and Kitchen/Front Desk synchronization, then closes its own browsers/server. External HTTPS is blocked. `CHROME_PATH` may point to an installed Chrome binary.
- Existing main regression scripts remain available in package.json. Set `AVENIQ_KITCHEN_PRINT_CANDIDATES=1` for local gate-based regressions to install the printing candidate in their new disposable stacks as well. Do not run concurrent builds that write the same dist directory.

## Android emulator

Use Java21, Android platform/build-tools36, platform-tools/ADB and the API36 Google APIs x86_64 `aveniq-kitchen-p0` Pixel Tablet AVD. SDK/JDK/AVD were provisioned in the earlier task and reused. Set JAVA_HOME and ANDROID_HOME; keep android/local.properties ignored. The actual task tool paths remain in ignored `.tools/android/environment.json`.

Start a loopback simulator in a separate terminal: `node scripts/escpos-printer-simulator.mjs 127.0.0.1 19140`. Run `pnpm run build:kitchen:android`, `pnpm exec cap sync android`, then Gradle assembleDebug/testDebugUnitTest/lintDebug/connectedDebugAndroidTest with the private synthetic fixture arguments. For exact UI→native linkage, use `.local-print/mainline-e2e-fixture.json` from the browser test: accessToken→staffJwt, rid→restaurantId, uid→operatorId, printerId/jobId/expiresAt unchanged, printerHost=10.0.2.2. Do not log or commit those arguments. Before the native suite, run `node scripts/verify-kitchen-ui-native.mjs --before`; afterward run `node scripts/verify-kitchen-ui-native.mjs` to assert one TCP capture and unchanged order/item/payment fingerprints for the exact UI job.

The local native builder retains main's safe esbuild/recovery/config pipeline. It first builds with an explicit approved loopback config, then rewrites only generated debug web/native config to emulator alias10.0.2.2:58031. It rejects deployment contexts and does not weaken the shared origin validator. It creates no release backend or signing configuration. Do not install this local debug APK as a restaurant release.

For actual process termination/ACK loss, run `node scripts/build-kitchen-android.mjs --fault-injection`, assembleDebug/assembleDebugAndroidTest, then `node scripts/run-kitchen-print-fault-tests.mjs --emulator emulator-5554`. It uses loopback TCP19130 and HTTP proxy58035; it creates synthetic fixtures and intentionally kills the emulator app at checkpoints. Recovery tests and one-attempt/no-resend assertions must pass; killed instrumentation itself is not counted as passing. Restore standard local native configuration afterward and rebuild. Normal aggregate instrumentation deliberately selects normal test classes; process-killing tests run through the explicit host suite.

## Restaurant installation remains pending

No real tablet or S300H validation is claimed. Follow [hardware checklist](sake-street-kitchen-printer-checklist.md). Obtain the printer IP through an authorized setup process, approve a reachable test backend, pair the tablet, configure private-LAN address/port/copies/cut/routing, visually inspect Test Print, then separately authorize any enablement. TCP transmission never proves paper output; the worker is foreground-only. Keep Production disconnected.

Use [rollback](kitchen-printing-rollback.md): disable auto dispatch, stop/revoke agents, inspect/reconcile uncertain paper, preserve jobs/snapshots/audit and order/payment records, and keep protocol2 fenced. Do not run destructive down SQL or restore a blind legacy scanner. Any release or hosted migration requires a new explicit authorization.
