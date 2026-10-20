# Kitchen printing setup and installation

Status: local/test implementation only. Production deployment and hosted migrations are not authorized.

## Development environment

Use branch `codex/kitchen-auto-printing-20261020`. Its prerequisite snapshot is `1decbfc`; the printing diff is reviewed separately from that pre-existing application baseline.

Install Node 22+ and pnpm 9.15.9. Run `pnpm install --frozen-lockfile`. Use Capacitor 8.4.1, Java 21, Android SDK Platform 36, platform-tools/ADB and emulator API36; use the checked-in Gradle wrapper. The Android Studio IDE is optional for the headless workflow tested here. Tool versions and the task-local JDK/SDK paths are recorded in the acceptance report; do not commit SDK paths or credentials.

Docker requires elevated/narrowly approved execution in this restricted session. Do not change its ACLs or existing stacks. CLI used: Supabase 2.121.0. Do not run `db push`, `migration repair`, `--linked` or hosted database commands.

## Isolated database

The root migrations directory is historical evidence, not a replay directory. The 22-entry canonical chain is hash-protected. The seven files in `supabase/kitchen-print-candidates/` are forward candidates, not approved hosted migrations.

`node scripts/replay-kitchen-print-candidates.mjs` creates a NEW disposable project `aveniq-kitchen-p0-replay-20261020` on ports57830–57833, verifies hashes, initializes it with stricter service-role default function privileges, then replays all22 canonical migrations and seven candidates and runs the SQL matrix. It refuses an existing workspace/occupied ports. Do not delete/reuse another workspace to make this command pass.

The stricter initialization is explicit: the current local image otherwise grants service_role execute on early legacy functions, which an existing canonical precheck rejects. No frozen SQL is edited and no failed check is skipped. See acceptance evidence for the failed raw replay, successful hardened replay of candidates 1–6, and subsequent candidate 7 cleanup verified on both owned local databases.

The live HTTP/emulator fixture uses the separately named project `aveniq-kitchen-p0-20261020` at loopback API57631 / DB57632. Scripts verify its Docker project label before SQL access. Record current local status into ignored `.local-print/api-config.raw`; never commit that file. `node scripts/test-kitchen-print-http.mjs` creates synthetic Auth users, restaurants, tokens and jobs and saves an ignored emulator fixture. It is intentionally restricted to this local endpoint.

## Native build and emulator

1. Start the simulator: `node scripts/escpos-printer-simulator.mjs 127.0.0.1 19100`.
2. Run `pnpm run build:kitchen:android`, then `pnpm exec cap sync android`. The native build replaces web backend settings with the isolated emulator host alias `10.0.2.2:57631` and writes ignored `kitchen-backend.json`.
3. Set JAVA_HOME / ANDROID_HOME for the session. Keep `android/local.properties` local.
4. Run `android\gradlew.bat -p android assembleDebug testDebugUnitTest lintDebug`.
5. Boot the dedicated `aveniq-kitchen-p0` API36 x86_64 Pixel Tablet AVD. Install only to that named emulator with `adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk`.
6. Run `connectedDebugAndroidTest` with the synthetic fixture's staffJwt, operatorId, restaurantId, printerId, jobId, expiresAt and printerHost=10.0.2.2 arguments. Never paste these temporary arguments into reports or committed scripts. The tests use the actual native encoder, Keystore, sockets, pairing RPCs and worker.

Debug HTTP is restricted to the exact emulator host in debug network-security XML. Release retains TLS-only configuration. No release backend or signing credentials are provided. Do not use the emulator APK on the restaurant network as if it were a released installation.

## Restaurant-facing workflow (hardware validation pending)

1. Open the Android Kitchen App and sign in as a Kitchen-capable staff account.
2. Open Printer tools. Request pairing with a recognizable tablet name.
3. Owner/Manager approves the pending request and selects only that restaurant's printers. Activate the approved request on the tablet.
4. In Restaurant Settings → Kitchen Printers, enter printer name and private IPv4/port (default9100); IP may stay empty until installation. Select Kitchen/Bar/Dessert, copies1–3 and Auto Cut. Save category routing separately when needed.
5. Queue Test Print, inspect the actual paper and confirm model compatibility. Test tickets are explicit; test orders do not automatically print by default.
6. Enable Auto Print for the printer and restaurant. Keep the app foreground. Browser/PWA cannot perform native TCP printing.

Printing status is transport/agent evidence. “Sent to printer — paper not confirmed” never asserts paper output. Unknown IP, offline agent, unreachable printer and uncertain attempts remain visible. Printing errors do not change Kitchen or payment status.

## Existing application baseline limitation

The canonical22 database does not contain every unrelated schema/RPC expected by the current working app, including `provision_self_service_account` and `restaurants.venue_status`. Printer component QA uses the actual local API through an explicitly labeled harness; it does not prove full application login/navigation. The native agent executes against real local Auth/QR/queue endpoints independently. Reconcile and review the broader application baseline before authorizing a restaurant installation. No fake provisioning RPC was added to make UI tests pass.

Physical tablet installation, trusted test-backend networking, restaurant LAN checks and printer IP entry remain PENDING.

## Explicit process-death / acknowledgement fault suite

Use the dedicated emulator and existing isolated local stack only. Run `node scripts/build-kitchen-android.mjs --fault-injection`, then `android\gradlew.bat -p android assembleDebug assembleDebugAndroidTest`, then `node scripts/run-kitchen-print-fault-tests.mjs --emulator emulator-5554`. The runner starts loopback TCP19130 and API proxy57635, creates private synthetic fixtures and intentionally force-stops the app at checkpoints. It never counts killed tests as passed; restarted instrumentation asserts recovery and no duplicate TCP output. It also waits31 seconds for a real lease to expire and drops actual HTTP finish responses. Do not run another emulator suite concurrently. Restore standard local configuration afterward with `node scripts/build-kitchen-android.mjs` and rebuild. Normal Gradle connected tests select normal classes; the destructive-to-test-process crash class runs only through this explicit host suite.

See [pre-merge acceptance](kitchen-printing-premerge-acceptance.md) for current results and blocking prerequisites.
