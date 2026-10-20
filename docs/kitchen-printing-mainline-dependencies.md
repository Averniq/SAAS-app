# Kitchen printing mainline dependency audit

Date: 2026-10-20. Read-only source/history analysis plus this report. Integration target: `8d0a6c1b6925630389aed145f5f46bd595a22613` (`origin/main`). Source prerequisite: `1decbfc`; printing feature: `1182d3f`; shared ancestor: `38cd1f3`. The prerequisite is a broad historical snapshot, not a minimal prerequisite patch. Do not merge it or replace main application files with its versions.

## Integration strategy

Start from current main and transplant the printing-only delta `1decbfc..1182d3f` selectively. Retain main QR token boundary, issuance retention, recovery PKCE and resend provenance, membership routing, staff management/invitation transport, payment ledger, table numbering/rename, build-config hardening, and canonical migration chain. Source-only evidence describes the old stack and must not be reported as current-main acceptance.

## Dependency matrix

| Area | Verified main state | Required minimal action | Exclude |
| --- | --- | --- | --- |
| Browser cloud API | `TableOrderCloud.request`, `getSession`, `config` already exported | Reuse existing API/session boundary | Whole snapshot `supabase-client.js` |
| App context | Main has `staffUser`, `activeView`; printing bridge absent | Add `window.getKitchenPrintContext = () => ({staff: staffUser, activeView})` ; main Admin uses a flat setup panel, so add a panel there | Snapshot application logic |
| Staff contract | Printing reads staff `restaurantId`, `id`, `role`; native session prefers session `user.id` | Verify current membership mapping, preserve actual role matrix | Old auth/role helpers |
| UI mounts | Printing mounts `kitchenPrintersSettings`, `kitchenPrintStatus` | Add panel/navigation/banner/module tag to main HTML seams | Old whole HTML, QR/team/dialog markup |
| Printing modules | Seven new files under `src/kitchen-printing` | Port contracts JS/types, module package boundary, ticket model, settings/status/native adapter together | Snapshot unrelated `src` |
| Build | Main builds safe public config and recovery bundle, copies assets | Add only printing public module folder; preserve validation, disabled entrypoint, recovery bundle | Old build-site implementation/config fallback |
| Dependencies | Main already has Capacitor 8.4.1 packages, esbuild, auth-js, QR vendor | Add printing scripts only; regenerate lock only if dependencies really change | Snapshot package/lock wholesale |
| Styles | Printing delta adds 11 source lines; generated CSS differs globally | Append scoped printing CSS to main Tailwind source and regenerate | Old generated CSS |
| Android | Printing adds Android project/native classes and Capacitor config | Port printing Java/plugin/build project; verify package identity/network policy, build local only | Build outputs, secrets, obsolete example tests if not used |
| Main SQL chain | Sorted 24 `.sql` files in `supabase/migrations`; latest staff boundary migration | Append independently reviewed printing migration(s); replay main then printing locally | Old 22-file manifest chain, historical migration rewrites |
| Queue tenant FK | Main migration `018_record_restaurant_order_payment.sql` adds `orders_restaurant_id_id_key UNIQUE (restaurant_id,id)` | Reuse the existing canonical tenant composite key; add no duplicate constraint | Old order-integrity/lifecycle migrations |
| Test-order gate | Main orders has no `is_test_order` | Make explicit minimal additive field with false default, or consciously adapt gate to main's actual test semantics; verify no accidental suppression | Old trial/onboarding/report schema |
| Ticket source fields | Main has restaurants name/timezone; orders number/note/created_at; tables table_name; item name_snapshot/quantity/options/notes/created_at; menu category_id | Reuse current fields; no extra historical schema needed | Old pricing/lifecycle enums/helpers |
| Legacy printing | Main has no `claim_kitchen_print_job(text)`, `finish_kitchen_print_job(uuid,uuid,boolean,text)`, `kitchen_print_claimed_at`, or `kitchen_printed_at` | Adapt printing migration to fresh-main absence; remove or conditionalize only legacy compatibility wrappers/claim checks after review | Legacy convergence stack solely to satisfy ALTER FUNCTION |
| Helpers/types | Main already has auth.uid, has_restaurant_role(uuid,text[]), pgcrypto gen_random_uuid and ordinary PostgreSQL JSON/advisory locks | Printing introduces its own `kp_*` helpers/row types; verify schema-qualified `extensions.digest(text,text)` on actual disposable stack; no historic application enum or manifest type needed | Snapshot RLS/payment/QR helpers |
| SQL grants | Candidate loops revoke/grant printing functions and enforce no direct client table grants | Revalidate on actual main role/default-ACL setup, keep least privilege | Old replay's default ACL workaround as assumed main requirement |
| Local harness | Main `scripts/run-local-supabase-integration-gate.mjs` creates unique local Docker DB/Auth/REST/Kong and replays sorted canonical migrations | Extend/reuse this actual baseline; append printing suites with local-only identity checks | Materializer's manifest lookup and hard-coded 22 length |
| Candidate scripts | Source materializer expects obsolete manifest/config ports; native build expects fixed CLI container and raw config | Adapt harness/materialization/native config to current disposable stack | Claiming source harness works on main unchanged |
| Source evidence/docs | Old full-app result explicitly blocked on schema | Retain as historical reference if useful; write new evidence for integrated main | Treating old results as proof of integrated acceptance |

The seven source SQL candidates are an ordered printing feature, but are not replayable on main unchanged: `20261020062224` printers/devices; `20261020062652` queue/snapshot/legacy wrappers; `20261020062859` delivery; `20261020063746` endpoint/revision/legacy guards; `20261020064725` bounded status/lock order; `20261020070008` operational bounds; `20261020071621` lint contracts. Prefer preserving their internal ordering while adapting only main-specific dependencies in new integration files. Source history remains intact. Test fixtures referencing legacy claims must be adapted to assert actual mainline behavior rather than passing by calling a nonexistent function.

## All 18 previous conflict paths

These were conflict paths for simulated snapshot/main merge, not conflicts that should be resolved by importing the snapshot.

| Path | Resolution on mainline |
| --- | --- |
| `app.js` | Preserve main; apply only the context bridge (main has no snapshot admin-section router). Verify staff/QR/rename/payment behavior remains. |
| `assets/brand/sake-street-logo-full.png` | Keep main asset; no printing dependency. |
| `assets/brand/sake-street-logo-full.webp` | Keep main asset; no printing dependency. |
| `assets/brand/sake-street-logo-mark.png` | Keep main asset; no printing dependency. |
| `assets/brand/sake-street-logo-mark.webp` | Keep main asset; no printing dependency. |
| `assets/brand/sake-street-logo-round.png` | Keep main asset; no printing dependency. |
| `assets/brand/sake-street-logo-round.webp` | Keep main asset; no printing dependency. |
| `docs/production-clean-state-cutover-runbook-2026-10-02.md` | Preserve main canonical cutover instructions; new printing docs reference them. |
| `index.html` | Preserve main; insert printer nav/panel/status/module only, coordinate cache versions. |
| `manifest.webmanifest` | Preserve main; no printing-only source delta. |
| `package.json` | Preserve every main script/dependency; add printing scripts. Avoid globally replacing mobile:sync unless explicitly necessary. |
| `pnpm-lock.yaml` | Preserve main; printing adds no new npm packages relative to main. Regenerate only for actual dependency change. |
| `scripts/build-site.mjs` | Preserve main origin/credential validation, preview isolation, generated config and recovery bundling; add module copy folder only. |
| `service-worker.js` | Preserve main mutable-shell strategy/recovery assets. Apply coherent new cache/version update and printing module delivery if caching is intended; do not restore old shell. |
| `src/tailwind.css` | Add only `.kp-*` scoped styles from printing delta. |
| `styles.css` | Regenerate from main Tailwind input plus printing styles; never select old minified output. |
| `supabase-client.js` | Preserve main unchanged; existing public request/session API is sufficient. |
| `tests/test-sake-street-menu-photos.mjs` | Preserve main expected named photo fallbacks; no printing dependency. |

## Snapshot changes explicitly excluded

Do not import snapshot branding/PWA/menu redesign, trial/self-service/attendance/reporting expansion, old SQL release-manifest/inventory tooling, modified historical migrations, old production reconciliation scripts, old payment helpers or security definitions. Main already contains later reviewed changes in overlapping areas. The snapshot's UAT test references an omitted standalone redirect and obsolete fixed cache versions; that is historical fixture debt, not a reason to introduce unrelated routing or copy obsolete cache constants. If the UAT guard is retained, scope it to current application contracts and check actual HTML/SW consistency.

## Source checks performed

Read Git logs and tree/diffs for exact refs; inspected printing candidate SQL, browser/native modules and materializer; inspected main package/build, initial schema, staff migrations, canonical QR and local integration harness. No merges, resets, implementation changes, deployments, hosted queries or production access. This report makes no runtime, database replay, Android, hardware or security acceptance claim. Implementation must run fresh main plus printing SQL, frontend/API and current regression checks before approval.

## Main commits since shared ancestor (64)

Categories below classify all 64 commits, including merges; titles are retained to make the inventory auditable. All are retained through starting from main.

| Commit | Classification | Subject |
| --- | --- | --- |
| `8d0a6c1` | Staff and invitation security | Merge PR #16: Staff Management [skip netlify] |
| `76df2e5` | Staff and invitation security | fix: enforce server-only staff invitation transport [skip netlify] |
| `4159fc6` | Staff and invitation security | feat: add tenant-scoped staff management [skip netlify] |
| `c7adb47` | Table management | Merge PR #15 safe table rename [skip netlify] |
| `38d449c` | Table management | Record local table rename acceptance [skip netlify] |
| `5caab9d` | Table management | Add safe table display-name rename [skip netlify] |
| `79b7433` | QR ordering and catalogue | Merge PR #14 QR retention and issuance race fix [skip netlify] |
| `d0d079a` | QR ordering and catalogue | Retain successful QR issuance across metadata outages [skip netlify] |
| `9b3d2f4` | QR ordering and catalogue | Require saved QR packages and reject blank exports [skip netlify] |
| `ccab53a` | Authentication and routing | Merge PR #12: resolve authenticated tenant routing [skip netlify] |
| `38d6652` | Authentication and routing | fix(auth): resolve tenant membership before dashboard routing [skip netlify] |
| `11fe372` | Authentication and routing | Merge PR #11: preserve PKCE recovery verifier across resends [skip netlify] |
| `3328070` | Authentication and routing | fix(auth): preserve recovery verifier across resends [skip netlify] |
| `e806714` | Authentication and routing | Merge PR #10: secure PKCE password recovery [skip netlify] |
| `3d7bb4b` | Authentication and routing | Require PKCE exchange and verified recovery provenance |
| `18cd6d0` | Authentication and routing | Normalize recovery regression file line endings |
| `6042fd9` | Authentication and routing | Add complete login password recovery flow |
| `28840a0` | Table management | Merge pull request #9 from Averniq/codex/table-manager-number-sequence |
| `0901822` | Table management | fix: generate internal token for single table creation |
| `70319e3` | Authentication and routing | test: exercise real table creation and stale-state recovery |
| `c1b679e` | Authentication and routing | Use canonical local authorization gate for table persistence regression |
| `640c9a3` | Table management | Fix Table Manager numbers derived from timestamp IDs |
| `47dbe4d` | Canonical cutover and tooling | Merge pull request #8 from Averniq/codex/cutover-tooling-hardening-20261002 |
| `fdd6cda` | Canonical cutover and tooling | fix: isolate preview backend config and atomically install owner bootstrap |
| `2846aa5` | Canonical cutover and tooling | Harden cutover origins, credential handling and atomic owner bootstrap |
| `6a0915d` | QR ordering and catalogue | Merge pull request #7 from Averniq/codex/canonical-fresh-qr |
| `adad7da` | QR ordering and catalogue | test: verify clean QR stack integration |
| `ae81161` | QR ordering and catalogue | Add canonical fresh-stack QR ordering and security rehearsal |
| `1532210` | Kitchen lifecycle | Merge pull request #6 from Averniq/codex/kitchen-lifecycle-hardening-20260927 |
| `06e0f18` | Kitchen lifecycle | test: soak kitchen lifecycle concurrency |
| `035629b` | Payments and ledger | fix: keep payment and kitchen lifecycle separate |
| `cb91c58` | Kitchen lifecycle | refactor: fold kitchen lifecycle into clean schema |
| `1d30254` | Kitchen lifecycle | test: exercise kitchen lifecycle rpc locally |
| `147dca0` | Kitchen lifecycle | fix: protect paid orders from kitchen cancellation |
| `6279d17` | Kitchen lifecycle | feat: harden kitchen order lifecycle |
| `c465448` | Customer branding, menu and PWA | Merge pull request #5 from Averniq/codex/sake-street-photo-refresh-20260927 |
| `7a13e80` | Customer branding, menu and PWA | feat(sake-street): restore named menu photo fallbacks |
| `0ce4c3a` | QR ordering and catalogue | Merge pull request #4 from Averniq/codex/catalogue-qr-metadata-decoupling-20260927 |
| `aa57b04` | QR ordering and catalogue | fix(catalogue): isolate optional QR metadata loading |
| `a11a67d` | Payments and ledger | Merge pull request #3 from Averniq/codex/payment-audit-fk-remediation-20260926 |
| `b188102` | Payments and ledger | docs(payments): align canonical cutover artifact gate |
| `d098be2` | Payments and ledger | fix(payments): harden canonical-only transition audit cleanup |
| `e884e52` | Payments and ledger | Merge pull request #2 from Averniq/codex/prod-remediation-20260915 |
| `2c6889a` | Payments and ledger | fix(payments): preserve complete canonical ledger reads |
| `bed21d1` | Payments and ledger | fix(payments): fence canonical ledger reconciliation |
| `cc42b89` | Payments and ledger | fix(payments): require caller idempotency key |
| `31b68c6` | Payments and ledger | fix(payments): hydrate Front Desk from canonical ledger |
| `a77de01` | Payments and ledger | docs(payments): add production transition runbook |
| `7ef9275` | Payments and ledger | test(payments): rehearse canonical-only transition |
| `67ef5e5` | Payments and ledger | feat(payments): add canonical-only payment transition |
| `435fd4a` | Authentication and routing | fix(payments): fail closed on legacy payment authorization |
| `61f2033` | Authentication and routing | fix(payments): preserve authoritative state across reloads and refreshes |
| `d2c008b` | Authentication and routing | fix(payments): cut Front Desk over to authoritative ledger |
| `c07f440` | QR ordering and catalogue | feat(p0): integrate token-bound public ordering convergence |
| `1c84327` | Customer branding, menu and PWA | fix tenant customer mobile baseline |
| `2b5a03c` | Customer branding, menu and PWA | add Sake Street brand logo assets |
| `c2e26e1` | QR ordering and catalogue | fix QR table card layout |
| `28803cf` | QR ordering and catalogue | fix QR code generation and export quality |
| `664f23b` | Customer branding, menu and PWA | refresh PWA cache after menu import |
| `1a262a5` | Customer branding, menu and PWA | seed full Sake Street menu and images |
| `2741fd8` | Customer branding, menu and PWA | bust PWA cache for branded styles |
| `d048f14` | Customer branding, menu and PWA | size branded header roundel |
| `b025582` | Customer branding, menu and PWA | match Sake Street menu rail layout |
| `64cf9d2` | Customer branding, menu and PWA | add Sake Street tenant brand assets |
