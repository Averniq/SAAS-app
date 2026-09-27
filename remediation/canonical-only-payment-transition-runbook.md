# Canonical-only payment transition — Production runbook (review only)

This runbook applies only to the exact committed transition candidate:

```text
remediation/canonical-only-payment-transition-candidate.sql
SHA-256: 2fca63f5ffb980562a872ccaf63d07492b527dec2e1dd3e0801d3baa23c56707
```

It does not authorize Production access, execution, deployment, or payment activity.

## PRE-FLIGHT

### Release integrity

In the approved release checkout, require both transition commits in `HEAD` ancestry:

```text
67ef5e5 feat(payments): add canonical-only payment transition
7ef9275 test(payments): rehearse canonical-only transition
```

Run:

```powershell
git fetch origin --prune
git merge-base --is-ancestor 67ef5e5acc1376664467c6fe814eee95bd305920 HEAD
if ($LASTEXITCODE -ne 0) { throw 'Missing canonical-only transition commit 67ef5e5' }
git merge-base --is-ancestor 7ef9275794ad2458a2dcf6dad0d15dd686106b80 HEAD
if ($LASTEXITCODE -ne 0) { throw 'Missing canonical-only rehearsal commit 7ef9275' }
git rev-parse HEAD
Get-FileHash -Algorithm SHA256 remediation/canonical-only-payment-transition-candidate.sql |
  Select-Object -ExpandProperty Hash
git status --short
```

Both ancestry commands must exit `0`. Abort if either fails, the candidate hash differs,
or tracked contents are modified.

### Canonical Front Desk release-artifact gate

Before the transition, record the following operator-confirmed values in the change ticket. The target canonical artifact must be immutable and available for later publication, but must remain unpublished while the current Production containment deployment stays locked and payment workflows are frozen.

| Required evidence | Required recorded value and proof |
| --- | --- |
| Target frontend Git SHA | Exact full SHA used to build the canonical Front Desk artifact. Historical commits `d2c008bf8b90d4d4490807e40e998b4e0eb9cf59` and `61f203391e15a86613fc04fe112d690aafe3313e` remain required ancestry or equivalent reviewed functionality, but ancestry alone is insufficient. |
| Target immutable Netlify/build identifier | Exact immutable target build/deploy identifier and artifact URL. It may remain unpublished before the database transition. |
| Current Production containment deployment | Record the currently published containment deployment ID and URL separately as current-state evidence. It is not the target canonical artifact. |
| Canonical writer proof | Static/bundle inspection of the exact target artifact proves a reachable payment action calls `record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)`. |
| Canonical list proof | Static/bundle inspection of the exact target artifact proves payment-history loading calls `list_authoritative_payment_operations(uuid,uuid)`. |
| Legacy exclusion proof | Static/bundle inspection of the exact target artifact proves no reachable call to `record_restaurant_order_payment`, `record_restaurant_payment`, or `void_restaurant_payment`. |

Attach the target SHA, target build identifier, current containment deployment record, and artifact-inspection evidence to the change ticket. Publishing a rebuilt or different artifact requires repeating this complete artifact gate. Do not resume payment taking with an artifact that calls any forbidden legacy RPC.

### Read-only manifest preflight

Run the reviewed support file in a dedicated read-only Production session:

```powershell
psql "$env:PRODUCTION_DATABASE_URL" --set ON_ERROR_STOP=1 --file remediation/canonical-only-payment-transition-preflight.sql
```

Required results:

- `expected_payments=11`, `matched_payments=11`.
- `expected_orders=9`, `matched_orders=9`.
- All drift counters are zero, including linked splits and unapproved payments on manifest orders.
- `expected_approved_audits=11`, `matched_approved_audits=11`,
  `audit_payment_mapping_drift=0`, and `extra_audits_for_approved_payments=0`.
- Record `unrelated_audit_count=17` and
  `unrelated_audit_fingerprint=9a3422b54cefc8a5e3c6b50ead07bd95` for post-commit comparison.
- Canonical ledger/writer/list are absent; all three legacy signatures are present.
- Record the unrelated payment count, cents, and fingerprint for post-commit comparison.

Abort before mutation if any required result differs. The transition itself repeats the core checks under `SERIALIZABLE` isolation and locks.

The approved rows are explicitly disposable build-up/test data. Payment eligibility is
therefore bound to the exact payment IDs, restaurant/order mapping, NULL split
association, and the absence of any unapproved payment on the nine approved orders;
audit eligibility is bound to exact audit IDs, audit-to-payment and
restaurant/order mappings, and `payment_added`/`payment`. Mutable operational metadata
(for example amount, status, timestamps, actor name/role, notes, references, and JSON
payload content) is deliberately not an eligibility gate. The unrelated payment and
audit baselines remain exact preservation gates.

## FREEZE

1. Disable or place all payment-taking surfaces into maintenance.
2. Stop payment, split, void, and automated payment workflows.
3. Confirm no payment mutation is in flight.
4. Keep the freeze active until database verification, target-artifact publication, and the post-publication canonical Front Desk checks all pass.

## EXECUTE

Use only the SHA-verified file. Do not paste fragments, alter it, or load Task 4/platform-admin intermediate migrations.

```powershell
$env:PGOPTIONS = "-c statement_timeout=0 -c lock_timeout=30s"
psql "$env:PRODUCTION_DATABASE_URL" --set ON_ERROR_STOP=1 --file remediation/canonical-only-payment-transition-candidate.sql
```

Expected result: exit code `0`, `COMMIT`, then the candidate's `NOTIFY pgrst, 'reload schema'`.

The one transaction validates the payment, order, and audit manifests; deletes only the
11 explicit `order_audit_log` IDs; then deletes only the 11 explicit payment IDs. It
does not null audit payment references, alter the audit FK, disable constraints, or use
CASCADE. It then cleans only the nine payment projections while preserving
`orders.status`, installs the canonical ledger/RPCs, and revokes the three legacy RPCs.

Any error before `COMMIT` aborts the entire transaction. Keep the freeze active and investigate; do not retry blindly.

## VERIFY

Run the reviewed post-commit verifier in a new read-only Production session:

```powershell
psql "$env:PRODUCTION_DATABASE_URL" --set ON_ERROR_STOP=1 --file remediation/canonical-only-payment-transition-verify.sql
```

Required results:

- `remaining_approved_payments=0`.
- `approved_audit_rows_remaining=0` and
  `approved_audit_payment_references_remaining=0`.
- `cleaned_order_projections=9`; `status_drift=0`; `linked_splits=0`.
- Unrelated payment count, cents, and fingerprint match preflight.
- `unrelated_audit_count=17` and
  `unrelated_audit_fingerprint=9a3422b54cefc8a5e3c6b50ead07bd95`.
- `payment_operations_exists=true`, `payment_operations_count=0`, and RLS is enabled.
- Canonical writer/list: PUBLIC and anon `false`, authenticated `true`.
- All three legacy RPCs: PUBLIC, anon, and authenticated `false`.

### PostgREST schema-cache verification

If PostgreSQL verification is correct but the API returns `PGRST202` (stale schema cache), do **not** rerun the transition. In a separately authorized database session execute only:

```sql
notify pgrst, 'reload schema';
```

Then repeat a non-mutating authenticated request to the canonical list RPC using an operator-confirmed restaurant ID and an allowed owner/manager/cashier session. The endpoint must no longer return `PGRST202`. This confirms API schema-cache convergence; it does not authorize a payment write.

### Publish the preverified canonical artifact

Keep the payment freeze active. Publish **only** the exact preverified target canonical artifact recorded above; do not substitute or rebuild it. Record the resulting Production deployment ID and deploy URL. If the published artifact differs from the recorded target, stop and repeat the artifact gate before any smoke test.

### Application smoke

While still frozen, verify the newly published Production bundle and network path:

- It calls the canonical writer/list RPCs only.
- It contains no reachable call to a forbidden legacy RPC.
- Payment UI loads without recording a payment.
- Allowed roles can load canonical payment history.
- Staff, platform-admin-only, nonmember, and cross-tenant users receive the expected denied state.

Do not create a real Production payment merely for smoke testing. A test payment needs separate authorization and a designated test order.

## UNFREEZE

End the payment freeze only when all database invariants, the PostgREST cache check, and every post-publication Front Desk artifact gate item pass: exact target SHA, resulting Production deployment ID and URL, canonical writer proof, canonical list proof, legacy-exclusion proof, and the non-mutating application smoke. Re-enable workflows in a controlled order and monitor canonical writer/list errors.

## FAILURE / FIX-FORWARD

### Before commit

On a candidate error, issue `ROLLBACK` if the session remains open, retain the freeze, capture the exact error, and rerun the read-only preflight. No partial transition should persist.

### After commit

If post-commit verification fails, keep the freeze active. Do not rerun the candidate: its canonical-ledger-exists guard intentionally prevents this. Capture the failed invariant and create a reviewed append-only fix-forward migration.

**Never restore legacy payment RPC execution as a rollback mechanism after commit.** That would reintroduce the retired unsafe writer surface and risk ledger divergence. Emergency restore/PITR, if ever considered, requires separate incident authorization and is not normal rollback.
