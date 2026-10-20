# Kitchen printing mainline security review

Date: 2026-10-20. Independent review of the additive mainline integration against `8d0a6c1`, candidate `supabase/kitchen-print-candidates/20261020112017_kitchen_printing_mainline.sql`, browser modules, Android printing boundary, and local native builder. Read the mainline dependency audit. No implementation changes, deployments, hosted database access, shared emulator actions, or historical migration edits were performed.

## Result

No confirmed blocking security defect found within the reviewed scope. This is scoped local evidence, not production or physical printer approval.

## Independently executed verification

Verified Docker labels before querying: database container `supabase_db_aveniq-kitchen-mainline-20261020` has both project labels `aveniq-kitchen-mainline-20261020` and the expected isolated mainline workdir.

Executed PostgreSQL catalog queries using `docker exec -i ... psql -U postgres -d postgres -X -v ON_ERROR_STOP=1`:

- All 9 printing tables have RLS enabled.
- Anonymous and authenticated roles have zero SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges across those tables. Absence of direct policies is intentional: authorized access goes through RPCs.
- All 11 internal `kp_*` helpers deny EXECUTE to anonymous and authenticated clients; internal helpers also have zero service-role EXECUTE grants.
- Printing public RPCs deny anonymous EXECUTE and permit authenticated EXECUTE. Replaced RPCs retained their restricted ACLs.
- Printing security-definer functions retain the fixed `public, pg_temp` search path.
- The installed main `has_restaurant_role` still checks database membership, role and `is_active`, with an empty search path; candidate does not replace it.

Executed one synthetic transaction with unique random user/restaurant IDs, pairing approval and device activation, and then ROLLBACK. Assertions passed for:

1. Valid kitchen operator heartbeat.
2. Wrong device secret denied with insufficient privilege.
3. Other-tenant operator denied even with correct device proof.
4. Inactive membership immediately denied with unchanged JWT identity.
5. Membership demotion to cashier denied device claiming.
6. Manager/owner device revocation denied subsequent heartbeat.
7. Fresh-main absence of legacy claim helper fails closed with `LEGACY_PRINTING_UNAVAILABLE`.

The test made no TCP connection and touched no shared fixtures. Initial non-escalated Docker access was denied by local permissions; the authorized isolated checks subsequently completed successfully.

## Source review

- Config, pairing approval, disable, revoke and automatic-print controls require owner/manager. Operational access accepts owner/manager/staff/kitchen; cashier and anonymous customer access is denied. Device requests additionally bind the current auth user, active role, restaurant, unrevoked device and secret hash. No user-editable JWT metadata authorizes printing.
- Composite tenant foreign keys constrain printer/device/order/job relations. Category routing verifies category membership. Server snapshots derive tenant-matched order items; public callers cannot supply arbitrary snapshot payloads through the inaccessible manual helper.
- Claims and attempts bind device, claim token, attempt ID, configuration revision and printer assignment. Endpoint changes are guarded while work is unresolved. Revocation is rechecked at attempt authorization.
- Printing history and snapshots are immutable through triggers, and configuration/manual corrective actions produce actor/timestamp audit entries. Reprints and uncertainty resolution require reasons/explicit resolution values.
- Legacy renaming is conditional; internal legacy helpers are included in the revoked helper set when present. The actual main baseline has no legacy helper, so compatibility wrappers deny execution paths instead of inventing an authorization fallback. Optional legacy marker access through `to_jsonb` does not grant writes or access.
- `git diff 8d0a6c1 -- supabase-client.js` and historical migrations produced no differences. The only main build-site change adds the printing module folder; its original public credential validation, origin validation, disabled-backend entrypoint, esbuild recovery bundle and preview isolation are retained.
- The native local builder verifies the isolated Docker project, rejects deployment contexts, explicitly runs the existing web build with loopback configuration, and then changes generated configuration to the Android emulator alias. It does not widen the general origin validator.
- Native bridge accepts only packaged `https://localhost` origin. API requests do not follow redirects and require TLS outside the explicit debuggable emulator exception. Secrets use SecureRandom, SHA-256 proof, Android Keystore AES-GCM storage in no-backup files, and are not returned through the bridge. Android backup is disabled.
- TCP destinations are numeric private IPv4, nonprivileged ports, and same-subnet Wi-Fi/Ethernet; VPN/cellular paths are rejected. Ticket text strips ESC/POS controls and output is bounded. Fault injection is package-private and rejected in release configuration.

## Limits and nonblocking considerations

- The absent-legacy branch was executed; a historical schema containing real legacy helpers was inspected statically only. That compatibility scenario is not part of the actual 24-migration main baseline.
- Optional `is_test_order` defaults to false when the field is absent on main. The synthetic setup ticket remains explicitly manual. If a later change introduces automatic test-order semantics, that field and gating need their own verification.
- Sequential revocation was verified. No claim is made that a network write already authorized and started can be physically recalled after membership revocation; the attempt protocol conservatively preserves uncertain outcomes.
- No separate production release APK, physical device extraction assessment, hardware LAN, hosted RLS, or production secret configuration was exercised here. Lead-owned end-to-end and Android fault tests are separate evidence, not claimed as independently rerun.
- Authenticated legacy wrapper callers can distinguish protocol-upgraded versus unavailable status using known tenant/order identifiers; no ticket, secret, financial data or mutation is returned. No blocking impact established.

## Follow-up: final local harness integration

Reviewed the subsequent local harness changes without starting stacks, browsers, emulators, or fixture mutations.

- `scripts/run-local-supabase-integration-gate.mjs` appends candidate replay only when `AVENIQ_KITCHEN_PRINT_CANDIDATES === '1'`; the default canonical chain remains unchanged. Replay occurs inside the existing unique randomly named Docker gate, after historical migrations. No caller-supplied hosted database URL or credential is introduced. The compatibility test explicitly enables the flag and checks printing is installed before running its suites.
- `scripts/setup-kitchen-mainline-local.mjs` requires exactly `--local`, pins CLI 2.121.0, materializes a new destination without overwriting an existing stack, verifies all 24 canonical hashes, constrains candidate paths, checks port availability, uses the fixed task-local project/workdir, and requires exact local API origin equality. Private status credentials/logs remain under ignored `.local-print/`.
- `scripts/test-kitchen-mainline-full-app.mjs` obtains exact-checked local config and uses the fixed 127.0.0.1:58031 API. Its web proxy binds only loopback and serves the copied public build with a path-containment check. Headless Chrome uses unique temporary profiles, blocks external HTTPS and external DNS resolution, and closes profiles/server in finally. SQL access goes through the fixed-container label check. Fixture tokens/passwords remain in ignored local files; committed result evidence contains outcomes and capture hashes rather than credentials.
- The latest native builder now checks `config.API_URL !== 'http://127.0.0.1:58031'` exactly, replacing its previous prefix check. The fixed emulator alias is written only after the unchanged general build validation succeeds. Deployment context rejection remains intact.
- Reviewed the saved full-app evidence: actual Auth/UI settings/QR confirmation/Kitchen/Front Desk, one order/job, and same-job native transmission with one attempt/TCP stream and unchanged order/items/payment data. These are lead-run evidence, not independently rerun by this reviewer. Physical paper confirmation remains pending.

Independently executed after these changes:

- `node --test tests/test-uat-regressions.mjs`: 4 passed, 0 failed. This verifies the exact 24 historical migration hashes/set, protected main implementation/dependencies, HTML/service-worker asset coherence, and coexistence of main UI contracts with printing mounts.
- `node --check scripts/setup-kitchen-mainline-local.mjs`: passed.
- `node --check scripts/test-kitchen-mainline-full-app.mjs`: passed.
- `node --check scripts/build-kitchen-android.mjs`: passed.

No new confirmed blocking security finding. The running emulator and native fault suite were left untouched. These harnesses are trusted local development tools; filesystem tampering by another process/user is outside their reviewed threat model.

## Final evidence review

Reviewed the completed `docs/evidence/kitchen-printing-mainline/fault-injection-results.json` (2026-10-20T11:41:38Z), final `full-app-e2e.json` (11:48:41Z), and the new migration-compatibility and conflict-resolution documents. No new critical/high security finding identified. These are completed lead-run scenario results; this reviewer inspected their assertions and artifacts without rerunning them or touching the emulator.

The seven fault cases record actual process termination before connect, during write, after write, before acknowledgment, late quarantined acknowledgment with a committed response lost, ordinary committed acknowledgment response loss, and twenty concurrent claims from two registered devices. The first five explicitly verify process disappearance after adb force-stop and run a separate successful recovery test; killed instrumentation is not counted as success. Source assertions compare order status, paid timestamp, order/items/payment fingerprints before and after every applicable scenario. Results preserve one attempt and at most one TCP stream; the late quarantine case remains uncertain despite the transmitted local journal and response retries. The concurrent case has exactly one winning claim. This supports conservative recovery and claim exclusion rather than a promise of physical exactly-once printing.

The final complete-app evidence links the browser-created order/job to one native attempt, one distinct attempt ID and one 576-byte TCP capture, with order/items/payment state unchanged. I independently hashed the current normal debug APK: `ce98895faff6ebf7f33fd486bfdc4af9110b5385c1c20e626288023c615f7689`, matching that final evidence. The restored native asset targets `http://10.0.2.2:58031`. Fault evidence names a different APK hash, `e5c6aeff02c42f99f1c1064a9a16b6890272d670e6e41ea6d5292241019859e7`; the normal APK therefore is not being mislabeled as the fault build. Fault archive preservation is lead-reported rather than independently rehashed here.

Read the generated normal Gradle XML summaries: instrumentation 7 tests/0 failures/0 errors, JVM 4 tests/0 failures/0 errors (3 printing and 1 example). Counts include the example tests and are not inflated into seven/four printing-specific cases. Build/lint, credential-safety/leak scanning and the broader unit results remain attributed to lead-run checks; this final focused review did not rerun them.

Migration and conflict documents correctly keep all24 canonical files intact, state that the composed candidate must not be applied atop the seven old PR18 candidates, retain main authorization/payment/cloud/build boundaries, leave the candidate unpromoted, and require a separately authorized target-inventory/upgrade review before hosted application. No production compatibility or permission claim is inferred from fresh-local success.

Remaining boundaries: physical paper/cutter/printer acceptance, restaurant network behavior, production schema inventory, release signing/backend configuration, and the real hosted upgrade path are unverified. The reviewed debug emulator APK is not a restaurant release. A TCP transmission proves neither paper output nor physical cancellation after an already-authorized write. No implementation edits, hosted operations, migration promotion, or stack changes were made during this final review.
