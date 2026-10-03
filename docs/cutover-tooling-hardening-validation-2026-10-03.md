# Cutover tooling hardening validation — 3 October 2026

Scope: existing `codex/cutover-tooling-hardening-20261002` worktree only. Production Supabase/Auth/SQL, service credentials, Netlify environments/deployments, DNS, QR issuance and cutover were not accessed or changed. The final release candidate is the hardening PR head, not the earlier baseline SHA.

## Four blockers and fixes

| Root cause | Implemented boundary |
| --- | --- |
| URL checks accepted application paths and untrusted hosts | One shared `validateSupabaseOrigin` rejects raw paths (including normalized dot segments), userinfo, query/fragment, deceptive suffixes, non-default hosted ports and arbitrary hosts. Hosted origins require HTTPS and one project label under `.supabase.co`; an explicit default HTTPS port canonicalizes away. Explicit local mode accepts only `localhost`, `127.0.0.1`, `[::1]` origins, not LAN or numeric aliases. |
| Bootstrap could send powerful credentials to arbitrary HTTP endpoints or follow redirects | Validate before all requests; use one fixed origin and fixed internal relative paths; every authenticated fetch uses `redirect: error`. Invalid destinations and redirect destinations receive zero requests in tests. |
| Transport/remote error bodies could echo credentials | Bootstrap emits only whitelisted operation/result codes or HTTP status; verifier and local runner sanitize unexpected exceptions. Test credentials are constructed in runtime memory, not literal credential strings in committed fixtures. Client builds emit only validated browser-safe configuration. |
| Separate ownership reads/writes raced | Service-only `claim_initial_restaurant_owner` RPC uses SECURITY DEFINER, empty search_path, per-restaurant advisory transaction lock and restaurant row lock. Within the transaction it validates restaurant/Auth identity, rejects platform admins/owner pointers/claims/owners/membership conflicts, then writes the claim, owner membership and owner pointer atomically. Repeats explicitly fail. No password/Auth creation or permanent one-owner membership restriction. |

## Executed gates

All commands below passed in the hardening worktree:

- `node tests/test-cutover-credential-safety.mjs`: accepted hosted/explicit-loopback origins; path/HTTP/arbitrary HTTPS/deceptive/query/hash/userinfo/malformed/LAN/loopback-alias rejection; no request to an invalid host; redirect target received zero requests; sentinel absent from captured CLI stdout/stderr and thrown errors.
- `node tests/test-initial-owner-bootstrap-contract.mjs`: existing identity, atomic dry-run, platform-admin refusal, existing-owner conflict, no Auth provisioning.
- `node tests/test-initial-owner-bootstrap-database-contract.mjs`: canonical primitive signature, transaction locking and service-only ACL contract.
- `node tests/test-build-public-supabase-config.mjs`: production missing/invalid configuration fails closed; runtime service/secret credentials rejected; disabled Netlify preview/branch/development builds and explicit disposable configuration; served config verification; no sentinel in intended source or generated dist.
- `node scripts/run-local-supabase-integration-gate.mjs`: **35 checks**, fresh lexical replay of **22 canonical migrations** in a unique disposable Docker stack. Two different eligible operators launched concurrently: exactly one success, one `INITIAL_OWNER_ALREADY_BOUND`, one matching claim/membership/owner pointer, no partial membership or platform-admin escalation. Staff conflicts/missing identities fail closed; forced post-claim insert failure rolls back all state; anon/authenticated execution denied; normal owner invitation successfully creates a second owner. Existing QR scope/rotation/expiry/idempotency, tenant/RLS, authoritative payment and Kitchen lifecycle contracts pass.
- `node tests/test-kitchen-lifecycle-contract.mjs`, `node tests/test-qr-session-boundary.mjs`, `node tests/test-p0-deploy-01-product-preservation.mjs`: passed.
- Local **production-mode** `pnpm run build` with nonfunctional validation-only hosted URL/publishable key: passed, without hosted network access. It is not a Production deployment. Existing Browserslist/caniuse-lite freshness warning remains informational.
- `node tests/test-cutover-secret-leak-scan.mjs` and its `--staged` mode scan intended working/index blobs and all **142 dist artifacts**. Modern secret strings, decoded service-role JWT credentials and the runtime sentinel are rejected without printing matched content.
- `git diff --check`, staged whitespace checks and JavaScript syntax checks passed.

No repository-wide `test`, lint or type-check script is configured in package.json. Older fixture-specific harnesses were not executed against unrelated databases. No live Production integration or physical QR cutover was performed.

## Disposable browser smoke

The actual served `/supabase-config.js` was verified against the disposable loopback origin. Owner login, Dashboard, Kitchen and Front Desk loaded successfully; a fresh reload settled correctly. Password existed only in local process memory/private loopback handoff and was never displayed, saved or committed.

Anonymous `/order/<token>` loaded Sake Street/Table 1 and menu. A disposable $4.00 Miso soup order was reviewed and confirmed, producing Order #2; customer tracking displayed Received, automatically changed to Preparing after the local Kitchen RPC, and preserved Preparing after reload. Observed context/submit/status destinations were exclusively the loopback frontend/gateway. Sanitized gateway tracking records returned HTTP 200; anonymous console warnings/errors were zero. Screenshots were retained outside Git as local review artifacts.

An already-authenticated staff session visiting a slug-less public URL produced the existing fail-closed `TENANT_SELECTION_REQUIRED` warning; anonymous public smoke was clean. The existing transient loading/customer-shell flash settled successfully and was not changed in this tooling task.

## Reviews and remaining scope

Independent Sol QA and security reviews found no remaining confirmed blocker in the four requested security boundaries. Suggested stronger RPC-boundary synchronization is an optional concurrency-harness improvement; the executed test launches two independent operators concurrently and checks all authoritative resulting state. This is ready for PR review, not authorization for a Production rollout. Migration and runbook still require the normal approved release process after review/merge.

## Intended changed files

1. `scripts/build-site.mjs`
2. `scripts/bootstrap-initial-owner.mjs`
3. `scripts/supabase-origin.mjs`
4. `scripts/verify-public-supabase-config.mjs`
5. `scripts/run-local-supabase-integration-gate.mjs`
6. `supabase/migrations/20261003090000_initial_owner_bootstrap_claim.sql` — new unapplied canonical candidate, tested only on disposable databases.
7. `tests/test-build-public-supabase-config.mjs`
8. `tests/test-cutover-credential-safety.mjs`
9. `tests/test-initial-owner-bootstrap-contract.mjs`
10. `tests/test-initial-owner-bootstrap-database-contract.mjs`
11. `tests/test-cutover-secret-leak-scan.mjs`
12. `docs/production-clean-state-cutover-runbook-2026-10-02.md`
13. `docs/cutover-tooling-hardening-validation-2026-10-03.md`

The runbook documents exact public/operator variable names, strict generated/served config, atomic bootstrap, secret handling, service-worker/fresh-browser verification and a coherent prior frontend/backend/config/physical-QR rollback pair. Unrelated changes in the primary checkout are excluded. Do not merge or deploy this PR automatically.

## PR #8 review fixes — 3 October 2026

Continued the same branch and implementation after review of head `2846aa5914c1dae8281931d0f2e7c634e9efa4c4`; no implementation restart or unrelated browser workflow repeat.

### Preview isolation

The prior context selection recognised only Netlify Production, so deploy-preview and branch-deploy inherited the development checked-in hosted configuration. The generator now recognises all three contexts. Production requires an explicit validated public pair and rejects mode downgrades. Deploy-preview/branch-deploy always use preview behaviour: no pair generates a successful, static **Backend disabled** artifact, empty backend URL/key, no app/Auth/service-worker-registration scripts, and a connection-denying CSP. Local default/development/preview builds likewise never read the checked-in hosted config. A partial/invalid pair fails closed; a complete explicit disposable pair enables the normal app using the existing shared origin/key validation.

Regression tests first failed on the inherited hosted URL, then passed after the fix. Tests scan every disabled dist artifact for the checked-in URL/key and runtime secret, and directly invoke the real REST/Auth client with disabled config to assert zero fetches. Complete explicit hosted disposable preview pairs, branch-deploy, mode overrides, strict URL rejection, missing Production values, and service-credential rejection pass. Explicit hosted values remain an operator-approved selection: they cannot inherently prove disposability. The runbook requires separate context scoping and fresh/reloaded previews; already open/offline legacy clients are not retroactively revoked by a new artifact.

### Migration installation atomicity

Updated the requested unapplied canonical candidate `20261003090000_initial_owner_bootstrap_claim.sql` in place. Explicit BEGIN/COMMIT now encloses table, SECURITY DEFINER function, empty search_path and service-only ACL creation. NOTIFY follows commit. First-owner runtime lock/conflict/concurrency semantics are unchanged.

The local gate injects division-by-zero immediately after function creation and before its REVOKE boundary. It asserts that exact fault was reached, then checks from a fresh connection that neither claim table nor function survives. This regression failed without the transaction and passes with it. Normal replay then succeeds.

### Final executed validation

- Build-config, credential-safety, both bootstrap contract tests, Kitchen lifecycle, QR session boundary, and product-preservation tests passed.
- Final isolated local gate passed **35 checks**, replaying **22 canonical migrations** with the migration-failure rollback assertion. Concurrent first-owner attempts produced exactly one success and one explicit conflict; service-only ACL, no partial state/escalation, and normal second-owner invitation passed.
- Full local `pnpm run build` with `CONTEXT=deploy-preview` and no public pair passed; empty generated config and disabled HTML verified. No deployment was performed.
- Full local `pnpm run build` with `CONTEXT=production`, explicit nonfunctional validation-only URL/key, and runtime fake service-secret sentinel passed. It made no hosted backend request.
- Credential scans passed for both full builds: **13 intended source files and 142 dist artifacts**; final staged scan also passed. Fake secret absent from CLI stdout/stderr/error checks and browser config/artifacts.
- Relevant JavaScript syntax checks, working/staged `git diff --check`, and independent Sol QA/security reviews passed with no blocking findings. Existing Browserslist freshness warning remains non-blocking.

Six intended follow-up files: build generator, build-config test, local integration runner, initial-owner migration, cutover runbook, and this validation report. No new migration was added. Production Supabase/Auth/SQL, credentials, Netlify configuration/environments, deployments, DNS and cutover remain untouched. PR #8 stays open against main; no merge is authorised. The final pushed head SHA is reported separately, not replaced with the earlier release baseline.
