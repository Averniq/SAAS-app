# Kitchen printing PR dependency and UAT audit

Audit date: 2026-10-20. Read-only implementation audit; no merge, reset, rebase, force push, deployment, hosted database access, or production access performed. The original dirty checkout was read only and preserved. Temporary baseline extraction and Git merge-tree objects are the only audit artifacts outside this report.

## Recommendation: DO NOT MERGE to the release branch

PR [#18](https://github.com/Averniq/SAAS-app/pull/18) is a stacked feature candidate. Its clean GitHub status applies only to its prerequisite branch, not to current `main`. The prerequisite must be reconciled with current main and independently verified before printing can enter the release branch. There is currently no open PR from the prerequisite branch.

Live GitHub/ref verification during this audit:

| Ref | Verified SHA |
| --- | --- |
| Remote default branch | `main` |
| `origin/main` | `8d0a6c1b6925630389aed145f5f46bd595a22613` |
| PR18 base, `codex/kitchen-printing-prerequisites-20261020` | `1decbfc3d5fbc919e6d231ff1b089f4ccfc74d4a` |
| PR18 head at audit start | `17163bd908773929e0461c08c722979f51fc0fc8` |
| Prerequisite/main merge-base | `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c` |

`git rev-list --left-right --count origin/main...1decbfc` returned `64 1`. The prerequisite snapshot does not include those 64 main-side commits. Recent main changes include staff invitation security, staff management, safe table rename, QR export retention, authenticated tenant routing, and recovery verifier preservation. Selecting the snapshot version of shared files wholesale risks losing these changes.

## Confirmed defects and blockers

### P1: prerequisite integration conflicts with main

Preconditions: exact SHAs above. Reproduce without touching any checkout with `git merge-tree --write-tree origin/main 1decbfc`.

Expected for a mergeable dependency: no unresolved merge conflicts. Actual: exit 1 and 18 conflicted paths:

- `app.js`
- `assets/brand/sake-street-logo-full.png`
- `assets/brand/sake-street-logo-full.webp`
- `assets/brand/sake-street-logo-mark.png`
- `assets/brand/sake-street-logo-mark.webp`
- `assets/brand/sake-street-logo-round.png`
- `assets/brand/sake-street-logo-round.webp`
- `docs/production-clean-state-cutover-runbook-2026-10-02.md`
- `index.html`
- `manifest.webmanifest`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/build-site.mjs`
- `service-worker.js`
- `src/tailwind.css`
- `styles.css`
- `supabase-client.js`
- `tests/test-sake-street-menu-photos.mjs`

The simulated conflicted tree was `fdc0ed88a96433d52d408febf2a532ad9fe5a4fd`. This simulation is not an approved integration result. A clean diff against the stacked base is not evidence that release integration preserves behavior.

### P2: UAT guard has pre-existing omitted fixture and stale versions

Preconditions: clean files from prerequisite `1decbfc` or feature `17163bd` and Node v24.18.0. Run `node tests/test-uat-regressions.mjs`.

Expected: execute the UAT checks with a complete source snapshot. Actual on both: `ENOENT` at Promise.all index 3, reading `netlify/sake-street-redirect/_redirects`. `git ls-tree -r --name-only 1decbfc netlify` and the equivalent HEAD command return no paths. The redirect exists as an untracked file in the untouched original checkout. The test was introduced in the prerequisite snapshot; printing does not modify it.

A prerequisite archive was extracted to temporary directory `C:/Users/WindVeil/AppData/Local/Temp/aveniq-uat-baseline-9cb0ee6fc290480ea13316c641f95a37` using:

```powershell
$auditRoot = Join-Path $env:TEMP ('aveniq-uat-baseline-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $auditRoot | Out-Null
$archivePath = Join-Path $auditRoot 'baseline.tar'
git archive --format=tar --output=$archivePath 1decbfc app.js supabase-client.js supabase/migrations/037_owner_boundary_and_payment_integrity.sql tests/test-uat-regressions.mjs index.html manifest.webmanifest service-worker.js
tar -xf $archivePath -C $auditRoot
node (Join-Path $auditRoot 'tests/test-uat-regressions.mjs')
```

Result: exit 1, the same missing redirect. For diagnosis only, copying the original redirect into that temporary archive allowed assertions to run; the original checkout and feature files were not changed. Result: `ERR_ASSERTION`, expected `/app\.js\?v=20260807-review-order/` at test line 27. The preceding source checks passed before that assertion.

The subsequent hard-coded cache expectations are also demonstrably stale by source inspection:

| Check | Guard expects | Prerequisite source | Feature source |
| --- | --- | --- | --- |
| `index.html` app URL, line 27 | `20260807-review-order` | `20260812-ui-audit` | `20261020-kitchen-print` |
| SW shell cache, line 28 | `aveniq-shell-v32` | `aveniq-shell-v34` | `aveniq-shell-v35` |
| SW runtime cache, line 29 | `aveniq-runtime-v32` | `aveniq-runtime-v34` | `aveniq-runtime-v35` |
| SW app URL, line 30 | `20260807-review-order` | `20260812-ui-audit` | `20261020-kitchen-print` |

Only the first failing version assertion was executed after fixture injection; later stale checks are source findings, not claimed executed failures. The feature app URL matches its SW shell URL and bumps both cache namespaces, so this guard failure alone does not establish a printing runtime regression.

Proposed separate prerequisite correction: first decide whether this standalone Netlify redirect is part of the application release contract; include its fixture/source through a reviewed dependency change if so, or explicitly separate the deployment-specific guard. Replace obsolete fixed version literals with checks that the actual versioned HTML asset URLs appear in the SW shell and that cache namespaces have valid, consistent versions. Preserve meaningful routing, permissions, payment, and branding assertions. Do not silently remove assertions or restore unrelated runtime routing simply to make printing tests green. No guard or runtime redirect changes were made by this audit.

## Original checkout preservation and snapshot completeness

The original checkout remains on `feature/customer-review-order` at `38cd1f3`, with 16 modified tracked files and many existing untracked files. It was neither stashed nor reset.

Compared original modified tracked files against snapshot contents, normalizing CRLF only: 14 of 16 are identical; `.gitignore` and `netlify.toml` differ. Original `netlify.toml` adds a forced root 302 to `/order/sake-street/table-1`; that local modification is intentionally absent from the snapshot. Do not overwrite the original checkout with feature/snapshot files or assume the snapshot is a complete backup.

Of 202 original untracked paths in the inspected source/resource prefixes (`assets`, `icons`, `netlify`, `offline`, `scripts`, `src`, `supabase`, `tests`), 195 exist in the snapshot and were byte-equivalent after CRLF normalization. Seven are omitted:

- `netlify/sake-street-redirect/_redirects`
- `supabase/ONBOARDING_VERIFICATION.sql`
- `supabase/P0-01B_HOSTED_READONLY_CAPTURE.sql`
- `supabase/P0-01B_SUPABASE_EDITOR_CAPTURE.sql`
- `supabase/PROVISIONING_VERIFICATION.sql`
- `supabase/SAMPLE_QR_TEST_ORDER_VERIFICATION.sql`
- `supabase/TRIAL_ENTITLEMENT_VERIFICATION.sql`

These are omissions from the source snapshot, not deletions from the original checkout. The source-prefix check does not claim all original untracked artifacts or local files were captured. Environment files and credentials were not read or copied.

`git diff --name-status 1decbfc HEAD --diff-filter=D` returned no deleted tracked paths at audit start. The feature is a descendant of `1decbfc` (`git merge-base --is-ancestor 1decbfc HEAD`, exit 0). Neither result establishes safe integration with main. Existing migration files also differ between main and snapshot; do not resolve that divergence by rewriting applied migration history or assuming both stacks are interchangeable. Canonical schema/full-app compatibility is separately blocked in the acceptance report.

## Required order and preservation rules

1. Keep the original dirty checkout untouched. Use an isolated integration branch based on freshly fetched current main and an explicitly inventoried prerequisite change set.
2. Reconcile the prerequisite snapshot with main, resolving shared source behavior manually. Review all 18 conflict paths and the non-conflicted changes. Preserve main-side auth, staff security, QR, and table-management behavior. Do not use blanket `ours`/`theirs`, replace whole application files, or force push as conflict resolution.
3. Independently review/test that prerequisite integration, its omitted files, and schema compatibility. Resolve the UAT blocker in that prerequisite scope, with meaningful consistency assertions. Ensure any database changes follow approved append-only canonical migration/release procedures; no hosted application is authorized here.
4. Land the reviewed prerequisite integration first. Rebase/merge or carefully transplant the printing-only commits onto that exact integrated base, with renewed review. Revalidate PR18's resulting diff and all affected tests; a squash of the dependency may require recreating/rebasing the feature branch to avoid resurfacing snapshot changes.
5. Only after the integrated full-app/schema checks and remaining fault/hardware acceptance pass should a separately authorized release decision be considered. PR18 may remain a draft against the dependency while blockers are unresolved. No merge or deployment is recommended now.

## Commands and actual outcomes

| Command/check | Result |
| --- | --- |
| `gh api repos/Averniq/SAAS-app --jq '.default_branch'` | PASS: `main` |
| `git ls-remote origin refs/heads/main refs/heads/codex/kitchen-printing-prerequisites-20261020 refs/heads/codex/kitchen-auto-printing-20261020` | PASS: exact remote SHAs above |
| `gh pr view 18 --json baseRefName,baseRefOid,headRefName,headRefOid,mergeable,mergeStateStatus,title` | PASS: stacked base, `MERGEABLE` / `CLEAN` against that base only |
| `gh pr list --state open --head codex/kitchen-printing-prerequisites-20261020 --json number,title,baseRefName,url` | PASS: `[]`, no prerequisite PR |
| `git merge-base origin/main 1decbfc` | PASS: `38cd1f3...` |
| `git rev-list --left-right --count origin/main...1decbfc` | PASS: `64 1` |
| `git merge-base --is-ancestor 1decbfc HEAD` | PASS, exit 0 |
| `git merge-tree --write-tree origin/main 1decbfc` | BLOCKED, exit 1: 18 paths above |
| `node tests/test-uat-regressions.mjs` on feature | FAIL, missing redirect |
| Same test on archived prerequisite | FAIL, same missing redirect |
| Archived prerequisite test with temporary redirect copied | FAIL, obsolete app version assertion |
| Tracked deletion check, prerequisite to feature | PASS: no tracked deletion paths |
| Original/snapshot byte comparison with CRLF normalization | Completed; differences/omissions above |

No integration, browser, build, database, or hardware success is claimed by this focused audit. Those checks belong to the integrated prerequisite/full-app and feature acceptance work; this report isolates a reproducible existing guard blocker and a confirmed main-integration blocker.
