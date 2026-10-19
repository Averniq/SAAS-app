# Kitchen printing: operational rollback

No deployment or production migration is authorized by this implementation. The following procedure was rehearsed against synthetic LOCAL data; a release needs separate approval. Rollback is a control transition, not destructive down SQL.

1. Manager/Owner pauses automatic dispatch. This stops new automatic jobs/claims; protocol remains sticky v2. Do NOT reactivate the old order-scanning automatic consumer or reset printed markers.
2. Stop the original Android agent and confirm it is stopped. Revoke affected device registrations with a reason. A dispatch already authorized before the stop can have reached paper; revocation is not proof of non-delivery.
3. Inspect queued, leased, dispatching, transmitted and uncertain jobs separately. Wait for lease reconciliation; consumed/expired dispatch becomes uncertain. Preserve snapshots, hashes, immutable begin/finish events, audit records and original order/payment state. Do not bulk delete, cancel or retry jobs.
4. Resolve each uncertain endpoint only after inspecting actual paper and confirming the old agent stopped. Enter actor/reason through the confirmed UI action. Quarantine survives endpoint aliases and disabling a printer. Reprint only deliberately, with duplicate confirmation and REPRINT labeling.
5. Continue Kitchen Display. Use a deliberately confirmed manual/browser ticket workflow if needed. Automatic printing failures must not change food order/payment status. Queued v2 work stays paused for deliberate reconciliation; do not scan old orders to reconstruct a backlog.
6. Roll back the app only after native printing is stopped. An older app cannot consume v2 work. Keep the encrypted journal until reconciliation; clearing app data is not recovery. Re-pair after a deliberate operator change.

If replay/ACL/compatibility validation fails before release, cancel the release. After a candidate has been shared/applied, fix it with a new forward candidate. Never edit frozen canonical history or drop audit tables to make rollback appear clean. No candidate is in the approved release manifest yet; promoting it requires separate review and release authorization.

Rehearsal: tests/sql/kitchen-printing-rollback.sql, included in local acceptance, creates five synthetic states, disables dispatch, revokes agents, rejects legacy claims/new begin, reconciles safely, resolves one isolated uncertainty and proves immutable snapshots/audit and a new unpaid food order remain intact. The fixture rolls back its own transaction. It does not prove physical-device cancellation or restaurant recovery.

Local environment cleanup, if desired: verify exact project marker and Docker labels, then stop ONLY that project's Supabase workspace. Do not use global Docker prune/down or modify existing stacks. Preserve ignored captures/credentials privately if more validation is required; never publish them.
