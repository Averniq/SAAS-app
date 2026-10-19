# Kitchen auto printing: Phase 0 audit and proposed architecture

Date: 2026-10-18. Status: design proposal; implementation has not started.

## Scope and constraints

Deliver automatic 80mm kitchen tickets from successful Send to Kitchen submissions, starting with an Android tablet and Ethernet ESC/POS printer. Preserve order/payment behavior and tenant isolation. Printer IP may remain empty. IVIDA S300H ESC/POS compatibility, port 9100, cutting, character support and physical output require hardware verification. No production access, deployment or merge is authorized. A draft PR follows implementation and validation; it is not a completion claim for this audit.

## Existing implementation

- The app is a static HTML/JavaScript application: `index.html`, `app.js`, `supabase-client.js`, Tailwind source in `src/tailwind.css`, and a copy-based `scripts/build-site.mjs` build. Reuse its Kitchen view, authentication, restaurant context and administration navigation.
- `app.js:submitOrder` retains an idempotency key for unchanged-cart retries and only records cloud success after `TableOrderCloud.submitOrder` returns. A separate public QR path also exists. Enqueue at the authoritative server submission boundary, not from UI events or Realtime callbacks.
- The active token route calls `submit_public_qr_order`, which atomically writes the order, items and idempotent operation in the canonical QR migration. The legacy wrapper still calls `submit_order`, whose execution is revoked by that migration. Verify route coverage against the canonical local database before integrating dispatch; do not silently reopen the legacy public boundary.
- `app.js:renderKitchen`, `printKitchen`, `renderPrintOrder` and `printPreparedContent` implement the Kitchen UI and browser dialog printing. There is no native TCP agent wired into these paths.
- `supabase/migrations/20260816150200_repair_kitchen_print_contract.sql` and `20260817055036_kitchen_print_claim_fencing_and_restaurant_policy_convergence.sql` implement an implicit queue on `orders`. Claim uses `FOR UPDATE SKIP LOCKED`, a UUID token and authenticated-user fencing; finish checks the current claim. Reuse these concurrency concepts, but evolve the contract for multiple printer jobs.
- The queue automatically reclaims after two minutes. A claim returns current order data rather than an immutable dispatch snapshot. The audited contract lacks per-printer jobs, device pairing/revocation, routing, durable attempt history and uncertain-delivery handling. Expired claims must not cause automatic replay after a possible socket write.
- The old payload omits item notes and category snapshots. Eligibility excludes orders that have already advanced to Ready, does not exclude test orders, and immediately releases failed claims for another attempt. These are confirmed gaps in the existing contract, not findings against a new implementation.
- Capacitor 8 dependencies and mobile scripts exist in `package.json`. `mobile-shell.js` detects native runtime, and the PWA service worker skips registration there. No Capacitor configuration or generated Android/iOS project was found outside archived artifacts.
- The service worker caches shell assets, not Supabase responses. This is not an offline queue or native printing mechanism.
- `supabase/catalog-manifest.json` describes an approved 22-migration canonical chain. Root migrations also contain frozen historical evidence and must not be replayed wholesale. Use the existing canonical materializer in a new isolated local workspace; preserve frozen hashes and append a separately tracked forward candidate.
- The working tree already has extensive tracked and untracked changes. Any implementation branch/PR must explicitly account for required existing changes and exclude unrelated files.

## Recommended architecture

1. **Server dispatch.** Extend the successful order-submission transaction after all order items exist. Insert one immutable job per configured destination using a unique dispatch/printer identity. Transaction rollback removes jobs too. No payment gate; test orders are excluded unless explicitly enabled. Capture restaurant/table/timezone, item quantities, modifiers, notes, category routes and printer settings at dispatch. Do not enqueue from an order-row insert trigger before items exist.
2. **Printer management.** Add Kitchen Printers under existing restaurant administration. Owners/managers manage approved private-LAN literal IP destinations and ports, copies 1–3, cut, auto print and Kitchen/Bar/Dessert routing. Empty IP means Not Configured. Disable rather than erase printers with history. Kitchen staff can operate assigned printers and request audited reprints. Paginate history and show operator-actionable errors.
3. **Device identity.** An authorized restaurant administrator approves device pairing. Bind a revocable registration to restaurant, authenticated operator and approved printers. Store a device secret using native secure storage; keep only its hash server-side. Require both staff authorization and active device credentials for claims and acknowledgements. Never place service-role credentials in the app. Revocation and logout stop further work.
4. **Queue evolution.** Add tenant-scoped printer, device, job and append-only attempt/audit records through a new forward migration. Replace the active legacy claiming path as part of cutover so two consumers cannot print the same dispatch. Existing orders are not automatically backfilled. Atomic bounded claims use lease tokens and printer serialization; a printer cannot have competing active attempts across tablets. Authorize every RPC independently and deny anonymous job/configuration access.
5. **Delivery protocol.** Before socket output, persist a dispatch-start transition and durably journal the attempt locally. Retry bounded connection failures only when no bytes could have been sent. A write, partial write, crash after dispatch-start, expired dispatch lease or lost acknowledgement becomes uncertain and is not automatically replayed. TCP write completion is transport evidence only. Staff inspect paper and explicitly request a linked, auditable reprint when needed. If dispatch-start cannot be confirmed, send no bytes.
6. **Android P0.** Package the existing local Kitchen UI with Capacitor. A small native adapter opens bounded TCP connections only to approved printer destinations, writes shared ESC/POS bytes and reports connection/write outcomes. Native code independently validates destinations and rejects control-byte injection through ticket text. Run the agent while Kitchen is foreground; reconnect safely, renew authentication and surface failures. Do not introduce a foreground service without device evidence that justifies it.
7. **Shared ticket/interface.** Share a typed transport contract, ticket formatter and acknowledgement state machine. Format tenant name, large order/table, venue-local time, quantities, modifiers, notes, destination heading and copy markers; append cut commands only when configured. iOS Network.framework TCP adapter and gateway are follow-up implementations; foreground requirements remain visible.
8. **Setup/status.** Pair, enter an IP manually, select printer, test and explicitly enable auto print. Discovery is optional where supported. Ready requires an active authorized agent and a recent successful connectivity observation; it does not mean paper is available. Uncertain attempts display Attention Required. Setup distinguishes Not Configured, Agent Offline, Printer Unreachable, Ready and Printing.

## Alternatives considered

- Browser/PWA-only printing cannot satisfy native TCP requirements.
- A gateway-first implementation adds hardware the Android P0 explicitly avoids. Retain a shared transport seam for a later Windows/Pi gateway.
- A second independent queue would duplicate the existing dispatch system. Evolve it and explicitly fence or retire legacy consumers during cutover.

## Verification plan and current evidence

Run local synthetic fixtures only. Test tenant/role denial, device revocation, immutable snapshots, category routing, repeated submissions, concurrent tablets, lease fencing, reconnects, test exclusion, copies/cut, and every ambiguous-send boundary. A local Node TCP simulator captures bytes and supports refused connections and mid-stream disconnects. Simulator results cannot prove paper output or Android background behavior.

Executed successfully during audit:

- `node scripts/test-migration-integrity.mjs`
- `node scripts/test-mobile-pwa.mjs`
- `node tests/test-kitchen-void-contract.mjs`

Environment observations: Node and pnpm are available; Supabase CLI, Java, ADB and Gradle were not found on PATH. `docker version --format '{{.Server.Version}}'` failed with permission denied on the Docker Desktop Linux-engine pipe. No local DB test, native build, emulator/device test or physical printer test has run. No configured lint/typecheck script is present; introduce suitable checks for the new typed/native modules during implementation.

After implementation, independent QA, security, performance and UX reviewers must inspect the completed work. Resolve blocking findings and rerun affected checks before creating the requested draft PR. Android P0 completion requires successful native build and execution against the simulator from Android, in addition to local database tests. Real Sake Street installation still requires a separate hardware checklist.
