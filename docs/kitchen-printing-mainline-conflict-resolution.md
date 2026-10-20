# Kitchen printing conflict resolution

Integration base: current main `8d0a6c1`; source feature `1182d3f`. The branch was created directly from main in an isolated managed worktree. Main was not reset, rewritten or replaced. The obsolete prerequisite snapshot `1decbfc` was not merged.

The [dependency audit](kitchen-printing-mainline-dependencies.md) inventories all64 newer-main commits and all18 conflicting snapshot paths. Conflicts were resolved by selecting the required printing additions against main, rather than taking entire old application files.

| Area | Resolution |
| --- | --- |
| app.js | Append only the staff/view context getter; retain all current main implementation |
| supabase-client.js | Unchanged; current Auth, tenant reads, order and payment contracts are sufficient |
| index.html | Add printer setup panel, Kitchen status mount and printing module; keep main flat Admin, QR, Front Desk and staff workflows |
| CSS | Append scoped printing rules to current Tailwind source and regenerate output |
| Service worker | Advance main cache generation19→20; include printing modules and matching app/style URLs |
| Build | Add the public printing folder only; retain origin/credential checks, recovery bundling and backend-disabled entrypoint |
| Package and lock | Retain exact main dependency objects and lockfile; add local printing scripts |
| Database | Preserve all24 historical migrations; new atomic candidate handles actual main optional legacy contracts |
| UAT guard | Exclude obsolete snapshot fixtures/version assertions; verify actual main source preservation, exact migration inventory and cache/asset coherence including negative mutations |
| Android | Port native TCP/device/journal/uncertainty implementation and tests; use dedicated local backend/simulator ports |
| Test harness | Add opt-in printing candidate to main disposable integration gate; default main tests unchanged |
| Snapshot-only onboarding, trial, reporting, financial and security changes | Excluded; they are not printing prerequisites |

Protected-source hashes enforce preservation of current cloud/auth/routing/staff/payment/build boundaries. Current main Table Rename, staff management/invitation/transport, QR export and password recovery regression suites passed. Actual local browser QR Send-to-Kitchen and the exact same job's native worker continuation passed; see the acceptance report for evidence boundaries.

Required merge order is a single reviewed mainline replacement PR into main. Do not merge the old prerequisite snapshot or PR18. Any later hosted migration, enablement or deployment requires separate authorization and the hardware acceptance gate.
