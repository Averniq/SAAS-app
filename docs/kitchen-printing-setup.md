# Kitchen printing: local development and operator setup

Status: software candidate for review. Production release NOT AUTHORIZED. Physical hardware acceptance PENDING. This is a foreground Android agent; browser/PWA Kitchen remains usable without the plugin.

## Reproduce locally

Use an isolated checkout, Node 24/pnpm, Docker, Supabase CLI **2.114.0**, JDK **21**, Android SDK/API **36**, build tools **36**, platform tools and an API36 Google APIs x86_64 emulator. The tested toolchain used ADB37.0.1, emulator37.2.12, Gradle8.14.3 and PostgreSQL15.8.1.085. ADB can be task-local; a system installation is unnecessary. Allow at least8GB free for emulator userdata plus build space. Install project dependencies with the committed lockfile. No toolchain binaries, SDK, credentials or APKs are in Git.

CLI2.121.0/PG15.19 failed a frozen canonical prestate guard. Do not weaken that guard. Never replay every root migration. Use the approved22-entry canonical chain plus the explicit11 candidates below, outside the approved deployment manifest.

Create a JSON options file under ignored .kitchen-local containing a NEW destination inside the checkout, a unique projectId beginning aveniq-kitchen-, six distinct unused ports named api/db/shadow/studio/inbucket/analytics, and candidateFiles containing the exact filenames below. Example project: aveniq-kitchen-review-unique. Materializer rejects existing destinations, junction escapes and occupied ports.

```json
{
  "destination": ".kitchen-local/review-unique",
  "projectId": "aveniq-kitchen-review-unique",
  "ports": {
    "api": 59281,
    "db": 59282,
    "shadow": 59280,
    "studio": 59283,
    "inbucket": 59284,
    "analytics": 59285
  },
  "candidateFiles": [
    "20261019111307_kitchen_printers_and_devices.sql",
    "20261019111811_kitchen_print_queue_v2.sql",
    "20261019112026_kitchen_print_delivery_protocol.sql",
    "20261019112431_kitchen_print_delivery_guards.sql",
    "20261019112658_kitchen_print_endpoint_quarantine.sql",
    "20261019113052_kitchen_print_legacy_manual_bridge.sql",
    "20261019113239_kitchen_print_lock_order_and_bounds.sql",
    "20261019121433_kitchen_print_recovery_inspection.sql",
    "20261019122748_kitchen_print_operational_projection.sql",
    "20261019123946_kitchen_print_confirmed_disable.sql",
    "20261019124725_kitchen_print_attention_priority_index.sql"
  ]
}
```

Run:

```powershell
node scripts/materialize-kitchen-print-candidate.mjs .kitchen-local/options.json
.tools/supabase-2.114.0/supabase.exe start --workdir .kitchen-local/review-unique -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
node scripts/run-kitchen-print-local-tests.mjs --local --workspace .kitchen-local/review-unique --suite acceptance
node scripts/run-kitchen-print-local-tests.mjs --local --workspace .kitchen-local/review-unique --suite concurrency
node scripts/build-kitchen-android-debug.mjs --workspace .kitchen-local/review-unique
```

For scoped typing, provision TypeScript separately with npm install --prefix .tools/typecheck --no-save typescript@5.9.3. Tool scripts assume the tested task-local CLI/SDK layout under .tools; set JAVA_HOME, ANDROID_HOME and GRADLE_USER_HOME to those installations before Gradle. Capture CLI status JSON privately under .kitchen-local. It includes private keys: never paste, commit or package it. Create public-config.json with ONLY origin (http://127.0.0.1:assigned-api-port) and publishableKey (local anon key). The Android builder extracts only those public values itself and maps the emulator backend to10.0.2.2. It validates Docker project/workdir identity. No hosted backend overrides are accepted.

Run HTTP acceptance before the emulator host scenario; it creates synthetic users/two tenants and an ignored private fixture:

```powershell
node scripts/test-kitchen-print-http.mjs --workspace .kitchen-local/review-unique
node scripts/test-kitchen-print-emulator.mjs --workspace .kitchen-local/review-unique
```

The emulator harness requires the dedicated aveniq-kitchen-api36 AVD on emulator-5554 and validates qemu identity. It force-stops ONLY com.aveniq.kitchen and may revoke synthetic devices in its own fixture. It starts an ESC/POS TCP simulator and loopback after-commit fault proxy; it never scans a LAN. Its two scenarios intentionally lose a committed begin/finish response and restart the process. Afterward rebuild normal local debug assets and APK: the test APK used a now-closed fault proxy. The normal package must also be assembled and reinstalled after regenerating direct-backend assets:

```powershell
node scripts/build-kitchen-android-debug.mjs --workspace .kitchen-local/review-unique
android/gradlew.bat -p android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
.tools/android-sdk/platform-tools/adb.exe -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The simulator also has reusable capture/refuse/disconnect-after-bytes/stall modes through scripts/escpos-printer-simulator.mjs; see its tests for bounded programmatic setup. Captures remain under .kitchen-local.

## Operator flow (authorized test environment only)

1. Owner/Manager opens Kitchen → Printing, adds a named printer with manually supplied private IPv4/port, destination, copies1–3 and optional cut. Unknown IP may be saved; it cannot print. Do not discover or scan the restaurant LAN.
2. Sign into the packaged Android app as the intended Kitchen/Staff/Manager/Owner operator. Begin pairing with a recognizable device name. A Manager/Owner independently reviews that operator/device request and approves selected enabled printers. Activate on the original device before the10-minute proof expiry. Device secret remains encrypted in Android storage, never returned to JavaScript. Pairing proof/creation attempts are limited.
3. Keep the app foreground, explicitly start the agent and grant the device's required local network permission. Confirm assigned printers and fresh reachability. Browser/PWA displays Android App Required for native actions.
4. Send a synthetic test ticket. Sent to printer means TCP transfer only; paper output is UNCONFIRMED. Check physical width, all text, copies, feed and cut before checking physical inspection and enabling automatic dispatch. Do not check that box for simulator-only development.
5. Configure category destinations; unmapped categories use Kitchen. Automatic dispatch defaults off, has no history backfill and excludes test orders. Missing/disabled routing produces visible attention, never loses the food order.
6. Monitor Kitchen alerts. Offline, unreachable, failed and uncertain attempts stay visible. Paper-out/cover-open is UNKNOWN where hardware cannot report it. Config/assignment changes require fresh observations; old reachability is insufficient.
7. Before resolving uncertainty: stop the original agent, inspect actual paper and enter a reason plus explicit stopped-agent confirmation. Manual reprint creates an audited child with a REPRINT marker and duplicate-risk confirmation. Never infer no delivery from an offline app or timeout. Re-enabling a disabled printer is available via Edit; disabling requires its separate reason/confirmation action.

App pause/sleep stops new claims and closes active sockets; restart reconciles the encrypted journal before any new work. An ambiguous attempt is quarantined, not automatically resent. Logout clears the memory JWT and stops work. Changing operator/restaurant invalidates pairing; re-pair deliberately. Do not uninstall/clear storage to evade an unresolved attempt. If activation's response is lost, review/revoke the orphan registration and retry pairing after pending proof expiry.

## Local baseline compatibility

Explicit local builds alone enable a read-only Kitchen compatibility path for three pre-existing canonical/current-client mismatches (missing provisioning RPC, venue_status and optional payment/void/item fields). Exact schema errors retain the same JWT/tenant scope; missing payment/item state is unknown. Other workspaces and order changes are unavailable, with a visible warning. Normal builds retain current behavior. This does not validate production Front Desk/payment workflows or resolve their broader schema baseline. Legacy submit_order stays revoked; supported token QR submission is covered separately.

See [acceptance evidence](kitchen-printing-acceptance-report.md), [rollback](kitchen-printing-rollback.md) and [physical checklist](kitchen-printing-hardware-checklist.md).
