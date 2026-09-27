# Canonical-only payment transition — Production runbook (review only)

This runbook applies only to the exact committed transition candidate:

```text
remediation/canonical-only-payment-transition-candidate.sql
SHA-256: 2fca63f5ffb980562a872ccaf63d07492b527dec2e1dd3e0801d3baa23c56707
```

It does not authorize Production access, execution, deployment, or payment activity.

## PRE-FLIGHT

### Release integrity

In the approved release checkout, require both commits:

```text
67ef5e5 feat(payments): add canonical-only payment transition
7ef9275 test(payments): rehearse canonical-only transition
```

Run:

```powershell
git fetch origin --prune
git log -2 --oneline
git rev-parse HEAD~1
git rev-parse HEAD
Get-FileHash -Algorithm SHA256 remediation/canonical-only-payment-transition-candidate.sql |
  Select-Object -ExpandProperty Hash
git status --short
```

Abort if the candidate hash differs or its tracked contents are modified.

### Canonical Front Desk release-artifact gate

Before the transition, record the following operator-confirmed values in the change ticket. They are intentionally not guessed in this runbook.

| Required evidence | Required recorded value and proof |
| --- | --- |
| Deployed frontend Git SHA / build identifier | Exact full SHA and immutable build identifier serving the Production bundle. Historical commits `d2c008bf8b90d4d4490807e40e998b4e0eb9cf59` and `61f203391e15a86613fc04fe112d690aafe3313e` must be ancestors, or equivalent functionality must have explicit review approval. Ancestry alone is insufficient. |
| Netlify / Production deployment ID | Exact published deployment ID and deploy URL. This is a mandatory deployment-day record; no value is assumed by this runbook. |
| Canonical writer proof | Inspection of the built Production JavaScript/network trace proves a reachable payment action calls `record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)`. |
| Canonical list proof | Inspection of the built Production JavaScript/network trace proves payment-history loading calls `list_authoritative_payment_operations(uuid,uuid)`. |
| Legacy exclusion proof | Inspection of the built Production JavaScript/network trace proves it contains no calls to `record_restaurant_order_payment`, `record_restaurant_payment`, or `void_restaurant_payment`. |

Attach the SHA, build identifier, deployment ID, artifact-inspection evidence, and network-trace evidence to the change ticket. The exact approved artifact must be available and verified before **UNFREEZE**. Do not resume payment taking with an artifact that calls any forbidden legacy RPC.

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
4. Keep the freeze active until database verification and the canonical Front Desk artifact gate both pass.

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

### Application smoke

While frozen, verify the exact Front Desk artifact recorded in the release gate:

- It calls the canonical writer/list RPCs only.
- It contains no reachable call to a forbidden legacy RPC.
- Payment UI loads without recording a payment.
- Allowed roles can load canonical payment history.
- Staff, platform-admin-only, nonmember, and cross-tenant users receive the expected denied state.

Do not create a real Production payment merely for smoke testing. A test payment needs separate authorization and a designated test order.

## UNFREEZE

End the payment freeze only when all database invariants, the PostgREST cache check, and every recorded Front Desk artifact gate item pass: exact deployed SHA, exact deployment ID, canonical writer proof, canonical list proof, and legacy-exclusion proof. Re-enable workflows in a controlled order and monitor canonical writer/list errors.

## FAILURE / FIX-FORWARD

### Before commit

On a candidate error, issue `ROLLBACK` if the session remains open, retain the freeze, capture the exact error, and rerun the read-only preflight. No partial transition should persist.

### After commit

If post-commit verification fails, keep the freeze active. Do not rerun the candidate: its canonical-ledger-exists guard intentionally prevents this. Capture the failed invariant and create a reviewed append-only fix-forward migration.

**Never restore legacy payment RPC execution as a rollback mechanism after commit.** That would reintroduce the retired unsafe writer surface and risk ledger divergence. Emergency restore/PITR, if ever considered, requires separate incident authorization and is not normal rollback.
