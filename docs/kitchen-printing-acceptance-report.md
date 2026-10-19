# Kitchen printing acceptance evidence

Date: 2026-10-19 (Australia/Sydney). Status: implementation in progress; NOT Production Ready.

Authorization: local development only; no production database access, hosted migration, deployment or merge.

## Baseline

- Original source HEAD: `38cd1f3f4d2285953e7a5ebbf6e69ff91caf310c` on `feature/customer-review-order` with substantial pre-existing changes.
- Isolated worktree: `C:/Users/WindVeil/.codex/worktrees/kitchen-auto-printing/aveniq-saas`, branch `codex/kitchen-auto-printing`.
- Curated dependency baseline commit: `c255bb8`. Includes current application/build source, frozen migration evidence, canonical release-control files and approved plan/audit. No env files, resumes, archived artifacts or credentials copied.
- Database replay uses only the independently validated 22-entry canonical chain. Root evidence migrations are never replayed wholesale. Candidate SQL remains outside the approved manifest.
- Stack identity: `aveniq-kitchen-20261019-a153d2`; explicit ports API 58981, DB 58982, shadow 58980, disabled Studio 58983/mail 58984/analytics 58985. Existing Docker stacks were inventoried read-only and left unchanged.

## Evidence levels

| Level | Result | Evidence |
| --- | --- | --- |
| Unit: candidate workspace | PASS | `node --test tests/kitchen-printing/candidate-workspace.test.mjs`: 7/7; existing destination retention, hosted/linked rejection, occupied/duplicate ports, root containment, directory junction rejection, explicit append/hash and omitted-file exclusion |
| Frozen migration integrity | PASS | `node scripts/test-migration-integrity.mjs` |
| Local Supabase replay | RUNNING | Pinned CLI 2.121.0; PostgreSQL 15.19.0.004 image; no feature SQL applied yet |
| Local Supabase feature/RLS/HTTP/concurrency | NOT RUN | Tasks 2–4 pending baseline gate |
| Android JVM/build | NOT RUN | Verified Temurin 21.0.12.1+1 and Android command-line tools 15859902; SDK packages provisioning |
| Android emulator + simulator | NOT RUN | Native implementation pending |
| Real Sake Street tablet + simulator | BLOCKED | Hardware availability unconfirmed |
| Physical IVIDA S300H paper/cut/readability | BLOCKED | No physical hardware verification performed |

## Task 1 review and corrections

Independent baseline and materializer review found fixed test ports overlapped the assigned stack ports; tests now allocate ephemeral ports. A candidate directory junction could redirect an ordinary SQL file; the new regression first failed and the materializer now resolves/rejects that escape. Both fixes pass the complete 7-test suite. Initial test execution failed because the implementation module did not exist, before it was written. A fixture SHA transcription error was corrected before accepting the green run.

## Pre-existing acceptance risks

Independent source review found current client reads of `restaurants.venue_status` and order/item void fields absent from the frozen canonical chain. One client submission wrapper still calls the intentionally revoked legacy `submit_order`; the supported public token path must be verified separately. Existing structural regression tests do not prove UI/database compatibility. These were present before printing implementation; do not reopen revoked interfaces or replay excluded evidence migrations to mask them.

The existing copy build omits `offline.html` while the service worker precaches it; address when changing native packaging.

No paper-out detection, printing success, restart recovery, tenant/device security or end-to-end workflow claim has yet been made. TCP completion will mean only sent to printer, with paper unconfirmed. Uncertain attempts must never automatically replay. Printing failures must remain visible in Kitchen and cannot change order/payment state.
