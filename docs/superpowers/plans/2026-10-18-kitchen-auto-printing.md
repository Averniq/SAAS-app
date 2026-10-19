# Kitchen Auto Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan requires user review before execution.

**Goal:** Automatically dispatch tenant-isolated kitchen tickets from successful order submissions to approved LAN printers through the existing Android Kitchen tablet, with auditable uncertainty and no changes to ordering or payments.

**Architecture:** Evolve the existing order-based queue into its per-printer representation and fence the old claim interface; never run competing queues. Keep the existing Kitchen UI inside Capacitor and use a native worker for authenticated job execution, approved-destination TCP, secure device storage and crash recovery. Share versioned ticket/transport contracts for future iPad support; iOS and gateway implementations are outside P0.

**Tech Stack:** Existing static JavaScript/HTML/Tailwind application, installed Capacitor 8.4.1, Android Java 21, Postgres 15/Supabase RPC and RLS, Node test runner and TCP simulator. Avoid adding a web framework or remote service.

**Spec:** `docs/kitchen-auto-printing-phase-0-audit.md`, approved by the user on 2026-10-18, plus the user's ten design decisions. Environment evidence: `docs/kitchen-printing-environment-diagnostics-2026-10-18.md`.

## Global constraints

- Evolve the existing Supabase print queue. Do not create a parallel queue.
- Reuse the existing Kitchen UI with Capacitor.
- Android P0 targets the Sake Street tablet and IVIDA S300H Ethernet printer; IP may remain empty; port defaults to 9100 pending hardware verification.
- Design shared interfaces for future iPad support, but do not implement iOS in P0.
- Secure pairing, immutable snapshots, idempotency and uncertain delivery are required.
- Support multiple printers, Kitchen/Bar/Dessert routing, explicit test printing, auto-cut, 1–3 copies and manual reprinting.
- Preserve QR ordering, Kitchen Display, Front Desk, payments and order workflows, including pay-later orders.
- Do not access or modify Production. No deployment, merge or hosted migration operation.
- Do not implement migrations or application changes until this plan is reviewed.
- Do not bypass failed tests or report simulator/emulator results as actual Android tablet or printer validation.
- Preserve existing uncommitted work and frozen migration evidence; use synthetic local fixtures only.
- The native Kitchen app must remain foreground for P0 automatic printing. No unattended/background reliability claim or foreground service in P0.

## Review focus

1. App/process death or lost RPC response between dispatch authorization and socket output: never automatically replay a possibly transmitted ticket (Tasks 4, 7, 10).
2. Two tablets or two printer records targeting the same endpoint: serialize physical output and reject configuration aliases (Tasks 2, 4, 10).
3. Old orders, test orders and legacy RPC consumers during cutover: no historical backfill, test output or competing dispatch by default (Tasks 3, 10).
4. Malicious item text, oversized tickets and international names: no injected ESC/POS control sequences, silent truncation or false success (Tasks 5, 7, 10).
5. Role removal, device revocation and printer address changes during an active job: enforce current authority and configuration revisions before new socket work (Tasks 2, 4, 7, 10).

## Environment gates and working-copy safety

Docker failure is identified as sandbox pipe access: read-only elevated `docker version` and `docker ps` succeed. Do not repair a functioning Docker installation. Supabase CLI is not on PATH; resolve a pinned CLI before running local database work. Several local stacks already run: allocate a unique project ID and free loopback ports after inspecting container labels/ports; never reset one of these existing stacks.

Android Studio/SDK/JDK were not found in checked locations; provision the toolchain as a separate, explicit environment step after plan approval. Use installed Capacitor 8.4.1 rather than silently upgrading. Node 24.18.0 meets Capacitor 8's Node 22 minimum; local library source confirms Java 21, compile/target API 36 and minimum API 24. Android Studio 2025.2.1+ and a project Gradle wrapper are required. Verify Sake Street tablet OS/WebView; an unsupported tablet is a compatibility blocker, not permission to lower requirements blindly. See [official setup](https://capacitorjs.com/docs/getting-started/environment-setup) and [version 8 requirements](https://capacitorjs.com/docs/updating/8-0).

No commands below have been executed unless explicitly included in the environment report. Planned command names/files do not exist yet where marked Create. Database/native gates may block independently while pure module work proceeds; none may be marked passed without actual execution.

## File map

Existing integration points: `app.js` (auth/lifecycle/admin mounting only), `index.html` (settings/Kitchen mounts and local module script), `supabase-client.js` (staff settings/history RPC wrappers and session synchronization), `mobile-shell.js` (native startup), `src/tailwind.css`, `scripts/build-site.mjs`, `service-worker.js`, `package.json`, `pnpm-lock.yaml`, `.gitignore`.

New web modules: `src/kitchen-printing/contracts.js`, `contracts.d.ts`, `ticket-model.js`, `printer-settings.js`, `printer-status.js`, `native-agent.js`. Keep these focused; copy modules to `dist/src/kitchen-printing` through the existing build rather than introducing a bundler. New JSON fixture: `tests/fixtures/kitchen-ticket-v1.json`.

New native project: `capacitor.config.json`, generated `android/` with namespace/app ID `com.aveniq.kitchen`; `MainActivity.java` registers `KitchenPrintPlugin`. Under `android/app/src/main/java/com/aveniq/kitchen/printing/`: `KitchenPrintPlugin.java`, `PrintAgent.java`, `PrintApi.java`, `DeviceStore.java`, `AttemptJournal.java`, `LanDestination.java`, `EscPosEncoder.java`, `TcpPrinter.java`. Each has corresponding unit/instrumentation tests. Never commit local SDK paths, signing secrets, APKs or build caches.

New verification/tools: `scripts/materialize-kitchen-print-candidate.mjs`, `scripts/run-kitchen-print-local-tests.mjs`, `scripts/escpos-printer-simulator.mjs`, `tests/kitchen-printing/*.test.mjs`, `tests/sql/kitchen-printing-*.sql`. Candidate forward SQL lives under `supabase/kitchen-print-candidates/` until reviewed into release control; it is not part of an approved deployment chain.

New operator/evidence documents: `docs/kitchen-printing-setup.md`, `docs/kitchen-printing-rollback.md`, `docs/kitchen-printing-acceptance-report.md`, `docs/sake-street-kitchen-printer-checklist.md`.

## Data and RPC contracts

All new relationships include `restaurant_id`; composite foreign keys bind job/order, job/printer, attempt/job and device/printer assignments within the same tenant. Retain existing `orders.kitchen_print_*` fields as legacy evidence; never reuse `kitchen_printed_at` as proof of physical output. The new `kitchen_print_jobs` table is the sole active representation after cutover, not a second live consumer.

| Relation | Required content and invariants |
| --- | --- |
| `kitchen_print_controls` | One row per restaurant: `enabled=false`, `allow_test_orders=false`, activation timestamp, sticky protocol version initially 1. First v2 activation sets version 2 permanently; disabling never resets it. Enabling affects future dispatches only. |
| `kitchen_printers` | ID, tenant, name, nullable IPv4, port 9100, protocol `escpos_lan`, enabled, auto_print, auto_cut, copies 1–3, destination label, configuration revision, timestamps/actor, soft-disable metadata. Unique enabled `(restaurant_id, ip, port)` when IP exists. |
| `kitchen_printer_routes` | Printer-to-existing-menu-category IDs, each category assigned to exactly one destination label Kitchen/Bar/Dessert within the tenant. No guessing from category names; unmapped items route to Kitchen. Multiple printers may intentionally subscribe to the same destination. |
| `kitchen_print_pairings` | Operator, tenant, device name, SHA-256 device-secret hash, pending/approved/consumed/expired state, ten-minute expiry, approving manager and selected printer IDs. No secret returned to browsers. |
| `kitchen_print_devices`, `kitchen_print_device_printers` | Tenant, paired operator UID, active/revoked state, secret hash/version, approved printer assignments and last heartbeat. Re-pair on operator-account change. |
| `kitchen_print_jobs` | Tenant, order or synthetic-test reference, printer, kind automatic/test/reprint, unique dispatch key, immutable versioned snapshot/settings, route, mutable delivery state, claim generation/token, lease, retry time/count, parent-job ID for reprints, request actor/reason/key. |
| `kitchen_print_attempts`, `kitchen_print_audit` | Append-only transition events with tenant/job/printer/device/actor IDs, attempt token, UTC timestamp, sanitized error code, configuration revision and transport result. No secrets or payment details. Audit state changes and reprint decisions. |

Use JSON schema version 1 for snapshots: tenant display name/timezone, order number, table label, created-at instant, route label, item IDs/names/quantities/modifiers/item notes, order instructions, copy count, auto-cut, and printable character profile. Preserve item category/destination decisions at enqueue time. Exclude customer/payment data not required by the kitchen. Configuration destination IP/port is fetched live at claim and bound to its revision; edits invalidate unsent claims rather than silently redirect them. Queued jobs retain receipt/copy/routing snapshots. Printer disable pauses unsent jobs; it does not delete them.

RPC names below are proposed public interfaces. Every function validates `auth.uid()` and tenant role in SQL, uses explicit safe search_path/qualified objects, revokes PUBLIC/anon execution, and denies direct table mutation. Parameters use `p_` prefix; UUIDs, state transitions and bounds are validated server-side. Agent-secret values appear only in TLS POST bodies, never URLs or logs. pgcrypto schema qualification must match the canonical baseline.

- Staff RPCs: `save_kitchen_printer(p_restaurant_id uuid, p_printer_id uuid, p_config jsonb) -> jsonb`; `disable_kitchen_printer(p_printer_id uuid, p_reason text) -> boolean`; `set_kitchen_print_control(p_restaurant_id uuid, p_enabled boolean, p_allow_test_orders boolean) -> jsonb`; `list_kitchen_printers(p_restaurant_id uuid) -> jsonb`; `list_kitchen_print_history(p_restaurant_id uuid, p_before timestamptz, p_before_id uuid, p_limit integer default 50) -> jsonb`. Limit 1–100, ordered by timestamp plus ID, fixed column projection.
- Pairing RPCs: `begin_kitchen_print_pairing(p_restaurant_id uuid, p_device_name text, p_secret_hash text) -> jsonb`; `approve_kitchen_print_pairing(p_pairing_id uuid, p_printer_ids uuid[]) -> boolean`; `activate_kitchen_print_pairing(p_pairing_id uuid, p_secret text) -> jsonb`; `revoke_kitchen_print_device(p_device_id uuid, p_reason text) -> boolean`.
- Agent RPCs all take `p_device_id uuid, p_device_secret text` plus the named arguments: `heartbeat_kitchen_print_device(p_observations jsonb) -> jsonb`; `claim_kitchen_printer_job() -> jsonb|null`; `begin_kitchen_print_attempt(p_job_id uuid, p_claim_token uuid, p_attempt_id uuid, p_config_revision bigint) -> jsonb`; `finish_kitchen_print_attempt(p_job_id uuid, p_claim_token uuid, p_attempt_id uuid, p_outcome text, p_error_code text) -> jsonb`. Repeated begin/finish must be idempotent for the same IDs; conflicting outcomes are rejected.
- Operator RPCs: `request_kitchen_test_print(p_printer_id uuid, p_request_key uuid) -> uuid`; `request_kitchen_reprint(p_job_id uuid, p_reason text, p_request_key uuid) -> uuid`; `resolve_kitchen_print_uncertainty(p_job_id uuid, p_resolution text, p_reason text) -> boolean`. Reprint creates a linked job, never clears an old printed marker. Request keys are tenant/actor-scoped and unique. Resolution records human observation, never asserts a transport-level paper guarantee.
- Legacy manual bridge: `request_legacy_kitchen_reprint(p_order_id uuid, p_printer_id uuid, p_reason text, p_request_key uuid) -> uuid` requires the same operational role and explicit duplicate-paper confirmation; snapshots current authorized order data once, marks the ticket REPRINT and records that its source predates v2. It never enables historical automatic backfill.

## Roles and trust boundaries

| Capability | Owner / Manager | Staff / Kitchen | Cashier / Customer |
| --- | --- | --- | --- |
| Configure, enable, route, pair approval, revoke | Allow in own tenant | Deny | Deny |
| Initiate tablet pairing | Allow | Allow for own account | Deny |
| View operational status/history, request test/reprint, resolve uncertain | Allow | Allow in own tenant, reason/confirmation required | Deny |
| Claim/begin/finish/heartbeat | Active assigned device + current authorized operator + device secret required for all allowed roles | Same | Deny |

Master/platform administration does not bypass printer authorization implicitly. Table reads use RLS and narrow views/RPC projections; pairing hashes and device hashes are never selectable by authenticated clients. RLS is defense in depth; RPCs also enforce role/tenant/assignment and active registration. Removal from staff or restaurant, expiry or revocation prevents the next begin. Revocation cannot retract bytes already handed to the printer; record such work as uncertain if acknowledgement cannot be accepted. Explicitly test this limit.

IPv4 literal private ranges only in P0: 10/8, 172.16/12, 192.168/16, with port integer 1024–65535 (default 9100). Reject DNS names, URL syntax, IPv6, loopback, link-local/metadata, multicast, broadcast, unspecified and public addresses, ambiguous octal/hex strings and network/broadcast addresses for the connected subnet. At execution, require the server-approved exact IP/port on the tablet's active Wi-Fi/Ethernet subnet and bind to that network, not VPN/cellular. Routed private printer VLAN support is deferred until an explicit network-policy extension is reviewed. SQL checks and native checks are independent. Debug simulator destinations must still satisfy this rule; never ship a release-mode loopback exception.

Native bridge accepts job/claim IDs and pairing actions, not arbitrary hostnames, ports, URLs or raw command bytes. `PrintApi` uses the single packaged Supabase origin with TLS and disallows redirects to other hosts; public/publishable key only. The existing web auth layer remains the sole staff JWT refresh owner; `setSession` sends the current access JWT to native memory. Native never persists/refreshes that JWT and stops at expiry until the foreground UI supplies a fresh token. Device secret and journal are encrypted with an Android Keystore-backed key, private app storage, backup excluded. Logout cancels unsent work, drops the JWT and stops claiming; account change requires re-pairing. No generic secret-read or raw-socket bridge is exposed.

## Delivery state machine and cutover semantics

`queued -> leased -> dispatching -> transmitted | uncertain`; `leased -> retry_wait -> queued` only for positively pre-write failures. Five claim attempts maximum, with backoff 5s, 15s, 60s, 180s; exhaustion is `failed`. Jobs have a 60s pre-dispatch lease; stale tokens cannot begin or finish another attempt. `begin` locks job and printer, validates live authorization/configuration and writes a durable dispatching event before returning.

Native persists a journal entry before requesting begin; after a confirmed begin it atomically marks local socket authorization consumed before opening the connection. No second socket attempt for the same attempt ID even after process death. Lost begin response means no socket is opened and the server's dispatching state is conservatively reconciled to uncertain. Connection refusal/no bytes written may be reported `not_sent`; any error after first write is uncertain. Full flush is `transmitted`, displayed as **Sent to printer — paper not confirmed**. Finish RPC response loss retries only the acknowledgement; it never repeats socket output.

Serialize by physical endpoint and printer row. SQL ordering/row locks prevent two devices claiming an endpoint simultaneously; unique active endpoint configuration prevents aliases. A partial unique active-job constraint per printer covers leased/dispatching jobs. Uncertain work quarantines that endpoint until an authorized human confirms the printer state and resolves it. Lease expiry alone never releases a dispatching/uncertain endpoint. A bounded native socket deadline (connect 3s, total job 15s) and closed app sockets reduce stale execution risk; human resolution must stop/disconnect the old agent first if its status is unknown. Exactly-once paper output cannot be guaranteed for a raw TCP printer; explicitly confirm this limitation before manual reprint.

There is no automatically replayed backlog on enable. At local cutover, acquire a transition lock, reject activation if a legacy claim is active/recent, and freeze both legacy claim/finish interfaces for protocol-v2 restaurants with a clear `PRINT_PROTOCOL_UPGRADE_REQUIRED` error. Keep legacy columns/RPC signatures for compatibility diagnostics, with no autonomous consumer in parallel. Per-restaurant controls default off; legacy access may continue only for restaurants that have never activated v2. The protocol version is sticky: disabling auto print does not reopen legacy RPCs. Every dispatch has exactly one selected protocol. Already-submitted orders stay legacy evidence and do not become v2 jobs; deliberate audited reprints are the only bridge for old orders.

## Task 1: Establish an isolated, reproducible baseline

**Files:** Create `docs/kitchen-printing-acceptance-report.md`, `scripts/materialize-kitchen-print-candidate.mjs`; test `tests/kitchen-printing/candidate-workspace.test.mjs`. Read existing canonical materializer/release-control scripts; preserve their frozen inputs.

**Interfaces:** `materializeKitchenCandidate({destination, projectId, ports, candidateFiles}) -> manifest` verifies the existing 22-entry canonical chain, uses a new empty destination under the workspace, appends only named candidate hashes, and refuses nonlocal endpoints or an existing destination.

- [ ] Inventory tracked/untracked source dependencies; record starting HEAD/diff hashes and choose `codex/kitchen-auto-printing` in an isolated worktree containing explicitly reviewed required working-tree changes. Do not stash/reset/copy all untracked files or commit unrelated resumes/evidence/secrets.
- [ ] Write tests `reject_existing_destination`, `reject_linked_or_remote_database`, `preserve_canonical_hashes`, `append_only_explicit_candidates`, and `reject_occupied_ports`; assert root migrations and existing stacks remain untouched.
- [ ] Run `node --test tests/kitchen-printing/candidate-workspace.test.mjs`; expect failure before the new materializer exists.
- [ ] Implement candidate materialization with unique project ID, explicit free ports and no global cleanup. Resolve a pinned Supabase CLI and Android toolchain under the environment procedure; do not assume global Gradle is needed.
- [ ] Re-run the candidate test and `node scripts/test-migration-integrity.mjs`; expect success. Replay only the resulting isolated local chain, recording CLI/runtime versions and catalog hashes. Stop on any baseline replay failure.
- [ ] Commit only task-specific files on the implementation branch; repeat explicit staging/review for subsequent tasks.

## Task 2: Printer configuration, device registration and RLS

**Files:** Create timestamped candidate `<UTC>_kitchen_printers_and_devices.sql` under `supabase/kitchen-print-candidates/` using CLI-generated unique version; create `tests/sql/kitchen-printing-access.sql`, `tests/sql/kitchen-printing-config.sql` and runner `scripts/run-kitchen-print-local-tests.mjs`.

**Interfaces:** Implement the configuration, control and pairing RPCs above; export tenant-safe config/projection contracts through `contracts.d.ts`. Pairing: native generates 32 random secret bytes, submits only hash, stores secret securely; manager approves the pending device from their own authenticated session; activation requires the initiating UID, secret proof and unconsumed approval within ten minutes. Rate-limit creation to five per operator per ten minutes; activation failures to five per pairing, persisted across rejected requests. Failed activation returns a structured denial after committing its counter rather than raising an exception that rolls the counter back. Revoke/reset pairing instead of infinite retries.

- [ ] Add local two-tenant SQL fixtures and failing assertions: all role matrix entries, cross-tenant IDs/assignments denied, hash select denied, paired-device replay/expiry/guessing/rate limits, revoked staff/device denied, IP/port/copy checks and duplicate active endpoint denied. Roll back test transactions.
- [ ] Run `node scripts/run-kitchen-print-local-tests.mjs --suite access --local`; expected failure on absent relations/RPCs. Runner must verify an isolated project marker and loopback DB origin before executing any SQL; refuse `--linked` and hosted URLs.
- [ ] Implement schema/RLS/grants/RPCs, manager audit events, nullable IP and soft disable. Lock role/registration rows consistently during sensitive transitions. Record approvals and revocations without secrets. Implement assignment validation and tenant composite keys.
- [ ] Run access/config suites, local catalog/RLS/ACL assertions and local database lint; expect all role and negative cases to pass. Check plaintext pairing secrets are absent from logs and table projections.
- [ ] Commit the candidate and its tests without editing frozen migrations or marking it deployment-approved.

## Task 3: Transactional queue evolution and legacy fencing

**Files:** Create `<UTC>_kitchen_print_queue_v2.sql` candidate; create `tests/sql/kitchen-printing-dispatch.sql`, `tests/sql/kitchen-printing-compatibility.sql`.

**Interfaces:** Internal `enqueue_kitchen_dispatch(p_order_id uuid) -> void` is callable only inside trusted database code, not by clients. A deferred constraint trigger after order creation executes at transaction end, reads complete item snapshots and invokes it once for eligible newly submitted orders. The function validates persisted test flag/activation timestamp and uses `UNIQUE(restaurant_id, order_id, printer_id, dispatch_revision)` for automatic dispatch identity. Capture routes from server menu/category snapshots; no client prices/totals are involved.

- [ ] Write failing transaction tests: successful public QR/pay-later submission yields one job per matching enabled printer; same idempotency key returns same order/jobs; item or transaction failure yields neither order nor job; concurrent duplicate requests yield one dispatch. Assert zero jobs on order refresh, old-order update, status/payment update or Realtime reconnect.
- [ ] Add compatibility tests for legacy `submit_order` remaining revoked, Ready-before-claim preserving queued jobs, tests off/on, no backfill on enable, disabled/unconfigured printer exclusion, unmapped category Kitchen fallback, separate Bar/Dessert tickets and immutable post-enqueue data.
- [ ] Run dispatch/compatibility suites; expect absent-v2-contract failures.
- [ ] Implement the per-printer job representation and deferred enqueue; freeze legacy consumers for v2 restaurants atomically. Capture a durable audited routing exception if a configured destination has no usable printer; do not undo an otherwise successful food order for a missing printer. Keep auto print off by default and surface configuration gaps. Unexpected SQL errors still roll back the transaction; report this coupling as a risk.
- [ ] Re-run both suites and existing QR/idempotency/payment SQL assertions against the isolated stack. Record order/payment schemas, RPC results and permission contracts unchanged except intended printing additions. Commit.

## Task 4: Claims, retry safety, reprints and audit history

**Files:** Create `<UTC>_kitchen_print_delivery_protocol.sql` candidate; create `tests/sql/kitchen-printing-delivery.sql`, `tests/sql/kitchen-printing-concurrency.sql`, `tests/sql/kitchen-printing-history.sql`.

**Interfaces:** Implement agent and operator RPCs and state machine above. `claim` returns `{jobId, claimToken, leaseExpiresAt, configRevision, snapshotVersion}` without mutable order reads. `begin` returns immutable snapshot plus approved endpoint only to the correct live device. Claims are one job at a time; heartbeat at 20s, offline after 60s, connectivity observations stale after 60s. Use indexed tenant/state/retry-time queue lookup, unique active printer serialization and history `(restaurant_id, created_at DESC, id DESC)` index.

- [ ] Add failing assertions for two concurrent tablets, wrong tenant/operator/secret/token, expired leases, exact retry schedule/five-attempt cap, duplicate begin/finish, lost-response replay, changed configuration revision, revocation before begin, and immutable attempt/audit history.
- [ ] Add assertions that dispatch timeout produces uncertain, uncertain blocks later endpoint work, repeated reprint request returns the same child job, reprint reason/confirmation are required, and resolving uncertainty never mutates original snapshots or financial records.
- [ ] Run delivery/history/concurrency suites; expect missing RPC failures.
- [ ] Implement bounded claim/reconciliation within claim/heartbeat RPCs; no scheduler is required for correctness. Authoritative time is database time. Bound history and reconcile batches to 100 rows. Update status projection even if no tablet is online. Preserve previously accepted finish outcome on acknowledgement retries.
- [ ] Run suites with at least 20 competing claim sessions, simulated process loss at every transition and cross-tenant fixtures; verify one live claim per printer, no blind replay and stable counts. Run `EXPLAIN (ANALYZE, BUFFERS)` locally with 10,000 synthetic jobs across tenants; report index use/query latency without inventing a universal latency guarantee. Commit.

## Task 5: Versioned ticket model and ESC/POS fixtures

**Files:** Create `contracts.js`, `contracts.d.ts`, `ticket-model.js`, `tests/fixtures/kitchen-ticket-v1.json`, `tests/kitchen-printing/ticket-model.test.mjs`, native `EscPosEncoder.java` and `EscPosEncoderTest.java`.

**Interfaces:** `buildTicketModel(snapshot) -> TicketModelV1` is a pure shared JavaScript module used for preview and contract fixtures; `EscPosEncoder.encode(snapshot) -> byte[]` is the Android canonical byte encoder. The native worker fetches the authoritative snapshot itself; JavaScript cannot supply arbitrary raw commands. Future iOS must implement the same fixture-tested encoder contract; no Swift adapter in P0. This keeps one P0 binary encoder and avoids exposing a raw-socket bridge.

- [ ] Write tests asserting tenant name, venue-local time including DST, large order/table, quantities, modifiers, item notes, order instructions, destination, exact copies 1/2/3, copy markers, feed and optional cut. Include long wrapped names, missing table label and empty/invalid snapshot rejection.
- [ ] Add control-byte/newline normalization, ESC/GS/NUL injection rejection, integer quantity bounds and payload bound of 256 KiB. Never silently drop items: oversized snapshots become attention-required before output. Use rasterized Android text for unsupported printer-codepage glyphs; golden raster dimensions/text-layout fixtures and physical readability are separate checks. Pin font/layout settings in encoding version 1; no silent `?` substitution.
- [ ] Run `node --test tests/kitchen-printing/ticket-model.test.mjs` and native `EscPosEncoderTest`; expect failure before implementation.
- [ ] Implement 80mm layout using a provisional 48-column/576-dot profile; retain this as an unverified hardware profile until S300H testing confirms width, cut command and glyph handling. Escape data separately from ESC/POS opcodes. Job deadline/payload limits must cover configured copies; reject over-limit work before dispatch.
- [ ] Re-run JS/native fixtures and byte assertions; require no cut bytes when disabled and one cut per complete copy when enabled. Commit.

## Task 6: Capacitor package, native credentials and LAN policy

**Files:** Create `capacitor.config.json`, generated `android/`, `KitchenPrintPlugin.java`, `DeviceStore.java`, `LanDestination.java`, native tests. Modify `mobile-shell.js`, `scripts/build-site.mjs`, `package.json`, lockfile and `.gitignore` only as required.

**Interfaces:** Bridge `setSession({accessToken, expiresAt, restaurantId, operatorId})`, `beginPairing({restaurantId, deviceName})`, `activatePairing({pairingId})`, `start()`, `stop()`, `getStatus()`, and event `kitchenPrintStatus`. Registration methods never return device secrets. Native verifies JWT user/tenant against API responses rather than trusting bridge IDs. Changing operator requires re-pairing; switching restaurants stops the previous worker.

- [ ] Add failing bridge/security tests: no raw connect/write method, only local packaged origin can use bridge, unapproved destination and stale config rejected, copied app backup has no credential, logout stops work and account switch cannot reuse pairing. Keep browser/PWA startup fully functional without plugin.
- [ ] Scaffold Android after toolchain provisioning, pin package alignment to installed 8.4.1, package `dist` locally and reuse current login/Kitchen routes. No production URL or development `server.url` in the committed native config. Local test build uses a dedicated loopback/debug backend path; release configuration refuses test overrides.
- [ ] Implement Keystore AES-GCM private storage and no-backup settings; network routing through active Wi-Fi/Ethernet; IPv4/subnet validation on both SQL and native sides. Use only required permissions; review [Android local-network permission behavior](https://developer.android.com/privacy-and-security/local-network-permission) for target/device API and test denial/regrant. No broad cleartext or WebView navigation allowlist. A debug-only backend override may name the isolated emulator/host LAN endpoint explicitly (including emulator host alias where needed); permit HTTP only for that exact debug host if local TLS is unavailable. Release builds reject the override and retain TLS-only API access.
- [ ] Run `pnpm run build`, `pnpm exec cap sync android`, `android\gradlew.bat -p android assembleDebug testDebugUnitTest lintDebug`. Expect real successful build/test/lint output; missing dependencies or toolchains remain failures/blockers, never skips counted as passes.
- [ ] Commit generated source and Gradle wrapper, excluding generated credentials/build outputs. Confirm iOS files were not generated.

## Task 7: Native TCP worker and durable recovery

**Files:** Create native `PrintApi.java`, `PrintAgent.java`, `AttemptJournal.java`, `TcpPrinter.java`; create matching JVM/instrumentation tests and `src/kitchen-printing/native-agent.js`.

**Interfaces:** `PrintAgent.tick() -> AgentStatus` runs on a single native executor, uses current in-memory staff JWT plus native device secret and never allows overlapping jobs. `TcpPrinter.send(ApprovedDestination, byte[], deadline) -> TransportResult{not_sent|transmitted|uncertain, errorCode}` closes sockets on all exits. Native `onPause` stops new claims and closes active sockets; `onResume` reconciles server state/local journal before work. One foreground worker instance per process.

- [ ] Write failing unit/instrumentation tests for journal-before-begin, consumed-before-connect, crash at each boundary, connect refusal, partial write, flush then DB disconnect, acknowledgement retry, JWT expiry, Wi-Fi change, role/device revocation and repeated start/stop. Assert no write before a confirmed begin and no second write for the same attempt.
- [ ] Implement native HTTPS RPC client with origin pinning to packaged configuration (standard TLS validation, no certificate bypass), response bounds/timeouts and redacted logs. Only bridge memory-session synchronization updates staff JWT; native does not race web refresh. Authentication errors stop claims and request sign-in visibly.
- [ ] Implement bounded TCP output, full-copy sequential buffer, socket teardown, journal fsync/atomic replacement and recovery. Never infer physical success from socket completion. Reports distinguish a known pre-write failure from any ambiguous delivery; native remains conservative if state is missing/corrupt.
- [ ] Run unit tests and `connectedDebugAndroidTest` on an emulator after toolchain gate. Force-stop the app during dispatch and reproduce recovery; capture simulator connection count and server attempts. Record emulator evidence explicitly as emulator validation.
- [ ] Commit only after the Android worker actually executes against the simulator; if unavailable, retain explicit blocked status and continue only independent tests/docs.

## Task 8: Settings, setup and Kitchen alerts

**Files:** Create `printer-settings.js`, `printer-status.js`, `tests/kitchen-printing/printer-settings.test.mjs`, `tests/kitchen-printing/printer-ui.test.mjs`; modify existing app mounts, cloud wrappers, HTML, Tailwind source/build inclusion and service-worker shell version as needed.

**Interfaces:** `mountKitchenPrinters({root, cloud, nativeAgent, staff}) -> dispose`, `derivePrinterStatus({configuration, agentHeartbeat, observation, activeJob, unresolvedAttempt}, now) -> status`. Add wrappers for named staff RPCs to the existing cloud facade; rendering uses escaped text/DOM APIs. Poll status only while the relevant foreground view is mounted; dispose on logout/tenant switch. No public printer/job subscriptions.

- [ ] Write failing tests for all six requested statuses, stale heartbeat/probe precedence, empty/loading/error/permission-denied states, double Save/Test/Reprint, cancelled confirmation, offline response and unknown IP. Assert IP alone never yields Ready and failed saves retain entered values.
- [ ] Add Kitchen Printers inside Restaurant settings with existing components/styles. Show devices/assignments, category-to-destination mappings, nullable IP, validated port, copies, cut, paginated history and configuration revision conflict handling. Make printer disable, device revoke, uncertainty resolution and reprint confirmation explicit; explain possible duplicate paper before reprint.
- [ ] Implement guided steps: open native app, initiate pairing, manager approval, manual LAN IP, select approved printer, queue test ticket, visually confirm paper, then explicitly enable auto print. No LAN discovery in P0; label manual entry clearly. A known native connectivity probe is non-printing and rate-limited, only to approved destinations. Browser can manage config and enqueue a test only when an authorized agent is available; it cannot open TCP.
- [ ] Display foreground requirement and prominent printing failures in Kitchen, with reprint/history access for Kitchen/Staff even though configuration remains manager-only. Display transmitted as paper-unconfirmed. Readiness requires recent successful probe, active assignment, fresh heartbeat and no quarantine; it never implies paper/ink status.
- [ ] Run module/UI tests, existing mobile/QR/order tests and browser checks at 360x800, 768x1024, 1024x768 and 1440x900. Verify touch controls at least 44px, keyboard/focus/ARIA alerts and no customer/Front Desk/payment regressions. Commit.

## Task 9: ESC/POS simulator and repeatable scenario harness

**Files:** Create `scripts/escpos-printer-simulator.mjs`, `tests/kitchen-printing/simulator.test.mjs`, `tests/kitchen-printing/scenarios.test.mjs`; extend local runner with `--suite acceptance`.

**Interfaces:** `startPrinterSimulator({host,port,mode,outputDir}) -> {address,captures,close}`; modes `capture`, `refuse`, `disconnect_after_n_bytes`, `stall`. Default bind loopback for Node tests. LAN binding requires explicit host/port for Android testing and restricted firewall access; no unattended subnet scanning. Captures are synthetic-only, outside public `dist`.

- [ ] Write failing tests for exact byte capture, copy/cut counts, long/Unicode tickets, connection counting, mid-stream reset and stalled socket deadline. Do not assume reset timing proves zero printer-side bytes; assert conservative uncertain result.
- [ ] Implement simulator with ephemeral free ports for Node tests and explicit LAN address for Android. Keep a separate client-to-DB fault injector for lost acknowledgement; a TCP printer simulator cannot prove RPC recovery alone.
- [ ] Run `node --test tests/kitchen-printing/simulator.test.mjs` and scenario tests; compare captured bytes with Task 5 fixtures. Re-run through the real Android plugin on emulator, then tablet when available, capturing API/native logs and DB states.
- [ ] Document that simulator success proves data/transport behavior, not S300H compatibility, paper output or background reliability. Commit simulator and synthetic fixtures.

## Task 10: Acceptance, independent reviews and evidence

**Files:** Create/finalize acceptance report, Sake Street hardware checklist and `tests/kitchen-printing/acceptance.test.mjs`; Android instrumentation tests under `android/app/src/androidTest/java/com/aveniq/kitchen/printing/`.

- [ ] Add end-to-end assertions using local Auth/PostgREST, not solely SQL superuser calls: two tenants and all roles; expired JWT/revoked assignment; successful QR dispatch/pay-later; denied legacy call; repeated submissions; route/copy/cut; stale config; test exclusion; disabled printer; two tablets; unknown IP; offline/reconnect; missed acknowledgement; uncertainty/reprint and immutable audit. Include direct table/RPC attacks with anonymous and wrong-tenant tokens.
- [ ] Run focused JS tests, local access/dispatch/delivery/history/concurrency/HTTP acceptance suites, then regression commands: `pnpm run test:migrations`, `pnpm run test:mobile-pwa`, `node tests/test-kitchen-void-contract.mjs`, `pnpm run test:order-integrity`, `pnpm run test:critical-business-rules`, `node tests/test-public-qr-order-reliability.mjs`, `node tests/test-p0-04-public-qr-ordering.mjs`, `pnpm run test:p0-03-payment-ledger`, `pnpm run test:app-shell-startup`, and `pnpm run build`. Inspect broader test scripts before running; any configured authorization/integration test must explicitly target the isolated local fixture and refuse hosted endpoints.
- [ ] Add a scoped JS syntax/type check for the new `.js`/`.d.ts` modules, run it and Android `testDebugUnitTest lintDebug assembleDebug connectedDebugAndroidTest`. Record command, version, environment, counts and result. No current root lint/typecheck script exists; do not claim one ran.
- [ ] Have independent QA, Security, Performance and UX subagents review completed implementation. QA covers normal/empty/error/repeated/boundary cases and viewport flows; Security tests RLS/device/tenant/socket boundaries; Performance checks bounded polling/queries/indexes; UX checks pairing clarity/touch/uncertain actions. Findings require severity, preconditions, reproduction, expected/actual and evidence. Separate defects from suggestions, fix blocking defects and rerun affected tests.
- [ ] Exercise actual Sake Street Android tablet against the simulator over restaurant-equivalent LAN with synthetic local order data. Record tablet model, Android/WebView versions, APK hash, configuration, captures and outcomes. This is actual Android hardware validation with simulated printer, not actual printer validation.
- [ ] Hardware checklist on IVIDA S300H: obtain/configure IP without scanning unknown networks; verify port/protocol, subnet/isolation, paper width/dot profile, cut, copies, notes/modifiers/Unicode, full order and large tickets; test paper-out/cover-open/power loss/Wi-Fi loss/app restart/sleep/foreground recovery. Keep production disconnected: use synthetic orders and an explicitly authorized local/test backend. Tablet sleep/suspension must show foreground-only limitation, not a background promise.
- [ ] Mark every row PASS/FAIL/BLOCKED/NOT RUN with evidence. P0 is incomplete if native build, local integration or actual tablet acceptance is blocked. Printer installation remains unverified until S300H paper tests pass. Do not use the requested READY FOR REVIEW status to conceal blockers.

## Task 11: Rollback rehearsal, operator docs and draft PR

**Files:** Create `docs/kitchen-printing-setup.md`, `docs/kitchen-printing-rollback.md`; finalize evidence and draft PR body.

**Interfaces:** Operational rollback is a control transition, not down-migration: manager disables new auto dispatch, stops/revokes affected device registration, then reconciles in-flight work. Existing financial/order records, jobs, snapshots, attempts and audit remain intact.

- [ ] Rehearse local rollback during queued/leased/dispatching/transmitted/uncertain work. Disable must stop new dispatch and new begin; preserve already-authorized ambiguous work for human review. Explicitly stop the old native agent before endpoint quarantine is resolved. Prove protocol remains v2 and legacy claims stay denied after disabling, with no bulk cancellation or blind retry and continued normal order/payment/Kitchen operation.
- [ ] Document safe app rollback: stop native printing first; return to existing Kitchen Display and deliberately confirmed browser/manual ticket workflow. Do not reactivate the old order-scanning auto consumer for orders covered by v2 or attempt to rewrite old printed markers. Existing queued v2 jobs remain paused for reconciliation; a later forward correction resumes them deliberately. No destructive down SQL.
- [ ] Document database failure strategy: cancel before local release approval if migration replay/ACL/compatibility fails; fix through a new forward candidate after sharing, preserving audit and immutable hashes. Deployment promotion requires a separate future request; candidate migrations do not alter the approved canonical manifest in this task.
- [ ] Review final diff against recorded baseline; exclude unrelated pre-existing modifications and credentials, verify source-dependent changes are explicitly included. Run final relevant tests after last fixes.
- [ ] After implementation/validation only, create the requested Draft PR on `codex/kitchen-auto-printing`, attach it to this chat, and include architecture, migration-candidate status, test evidence, outstanding environment/hardware blockers and rollback. Do not merge, deploy or push migrations. Do not claim production-ready.

## Acceptance evidence levels

| Level | What it proves | Required evidence |
| --- | --- | --- |
| Pure JS/JVM fixtures | Formatting, validation and transition decisions | Real test outputs/versions; no hardware claim |
| Local Supabase SQL + HTTP | Transactions, RLS, roles, device scopes and concurrency | Isolated stack identity, catalog/ACL results, synthetic fixture evidence |
| Android emulator + TCP simulator | Native plugin executes and transfers expected bytes | APK hash, emulator API, instrumentation output and captures |
| Sake Street tablet + TCP simulator | Real tablet execution/recovery under tested conditions | Model/OS/WebView, device tests/captures; no paper claim |
| Sake Street tablet + IVIDA S300H | Actual printer compatibility/paper/cut/readability | Operator-observed physical checklist and photographs where allowed |

## Plan self-review and execution handoff

Coverage: schema/RLS/pairing (2); queue compatibility/transactional dispatch (3); failure recovery/history (4,7); ticket/copies/cut (5); Android/security/network boundaries (6,7); printer setup/Kitchen workflow (8); simulator (9); acceptance and specialist reviews (10); rollback/draft PR (11). All five Review Focus conditions have named tests in their owning tasks. Native callback/RPC names and statuses are defined above; proposed new files are distinguishable from existing integration points.

Recommendation: lead-agent implementation in dependency order with specialist review gates for the database/security contract and complete implementation. This keeps ownership of the tightly coupled queue/native recovery protocol clear while retaining the QA, Security, Performance and UX reviews required by AGENTS.md. Subagent-driven task execution is also available if preferred. Plan review and execution-method selection are pending; no implementation is authorized by creation of this document.
