# Kitchen printing rollback

No production action is authorized. These are operator instructions and a local test strategy.

1. Owner/Manager disables restaurant Auto Print and affected printer Auto Print. This stops future automatic dispatch and automatic begin authorization; explicit test/reprint requests are separate operator actions.
2. Stop the affected Kitchen app/agent and revoke its device registration. Revocation prevents future claims/begins/acknowledgements. It cannot retract bytes already delivered.
3. Inspect all leased/dispatching/uncertain jobs. Never assume a lease timeout means nothing printed. Started/unknown attempts become uncertain and quarantine the endpoint.
4. Check paper and confirm the old agent is stopped/disconnected before resolving uncertainty. Record actor/reason/observation; an explicit linked reprint may produce duplicate paper.
5. Continue using existing Kitchen Display and deliberately confirmed browser/manual tickets. Printing does not alter order/payment status.
6. Retain jobs, immutable snapshots, attempts, audit history and legacy order columns. Do not delete jobs or financial records and do not run a down-migration.
7. Protocol version2 is sticky. Disabling it never reactivates legacy scanning; do not manually reset the version or printed markers.
8. Fix software/schema through a reviewed forward change. Resume preserved jobs deliberately after checking audit/history and active registrations.

An app rollback must stop native work first. A consumed local journal is never resent. Re-pairing archives the old attempt durably without resolving server quarantine; staff still inspect and resolve the old printer's uncertainty.

Local SQL acceptance verifies sticky fencing after disable, revocation denial, uncertainty quarantine/resolution and immutable history. Local concurrency tests verified enqueue/manual-print lock ordering. Full operator rollback on the actual tablet/printer is PENDING.

Only the specifically named task stacks may be stopped after evidence is preserved. Do not prune Docker, stop other projects or reset root migrations.
