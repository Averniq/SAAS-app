# Authorization tests

`pnpm run test:authorization` verifies Aveniq's public Data API boundary, restaurant isolation, and role restrictions without changing application data.

The script uses reads and deliberately nonexistent order IDs. It never creates an order, changes a status, sends an invitation, or writes credentials to disk.

## Public boundary

The public checks need no credentials:

```powershell
pnpm run test:authorization
```

They verify that anonymous users cannot read `restaurants` or call staff RPCs, while the three customer RPCs remain callable.

## Role matrix

Use dedicated test accounts. Set credentials only in the current PowerShell process:

```powershell
$env:AVENIQ_MANAGER_EMAIL = "manager-test@example.com"
$env:AVENIQ_MANAGER_PASSWORD = "..."
$env:AVENIQ_ALLROUND_EMAIL = "allround-test@example.com"
$env:AVENIQ_ALLROUND_PASSWORD = "..."
$env:AVENIQ_KITCHEN_EMAIL = "kitchen-test@example.com"
$env:AVENIQ_KITCHEN_PASSWORD = "..."
$env:AVENIQ_CASHIER_EMAIL = "cashier-test@example.com"
$env:AVENIQ_CASHIER_PASSWORD = "..."
$env:AVENIQ_OTHER_RESTAURANT_ID = "00000000-0000-0000-0000-000000000000"
$env:AVENIQ_REQUIRE_ROLE_TESTS = "1"
pnpm run test:authorization
```

`AVENIQ_OTHER_RESTAURANT_ID` must identify a real restaurant to which none of those test accounts belongs. It enables cross-restaurant checks for restaurants, staff, categories, tables, menu items, orders, order items, and the order-status RPC.

If an account has memberships at more than one restaurant, set its intended test restaurant explicitly, for example:

```powershell
$env:AVENIQ_MANAGER_RESTAURANT_ID = "..."
```

Equivalent overrides exist for `ALLROUND`, `KITCHEN`, `CASHIER`, and optional `OWNER` accounts. Never commit passwords or a populated environment file.

The live Aveniq-SaaS project currently has dedicated test users for the `Demo` restaurant:

- `aveniq.manager.test@example.com`
- `aveniq.staff.test@example.com`
- `aveniq.kitchen.test@example.com`
- `aveniq.cashier.test@example.com`

To include the full Owner role matrix, set `AVENIQ_OWNER_PASSWORD` (and optionally
`AVENIQ_OWNER_EMAIL`) when running the provisioning command. This creates or updates
the dedicated `aveniq.owner.test@example.com` fixture and assigns it the Owner role
only for the `demo` restaurant. Then set `AVENIQ_OWNER_EMAIL` and
`AVENIQ_OWNER_PASSWORD` for `pnpm run test:authorization`.

Keep their passwords out of source control and chat. If you rotate or recreate them, update only your local shell environment or ignored `.env.local` notes.

To recreate or reset those users, put `AVENIQ_SUPABASE_SERVICE_ROLE_KEY` in ignored `.env.local`, set the same password environment variables shown above, then run:

```powershell
pnpm run provision:authorization-users
```

The provisioning script uses Supabase Auth Admin API, confirms the users' emails, and upserts their `restaurant_staff` memberships for the `demo` restaurant. It does not print the service key or passwords.

## Expected role behavior

| Role | Kitchen action | Front-desk action | Team list |
| --- | --- | --- | --- |
| Owner | Allowed | Allowed | Allowed |
| Manager | Allowed | Allowed | Allowed |
| All-round Staff | Allowed | Allowed | Denied |
| Kitchen | Allowed | Denied | Denied |
| Cashier | Denied | Allowed | Denied |

An allowed action probe reaches `ORDER_NOT_FOUND` because the script supplies a zero UUID. A denied probe stops earlier with the appropriate role error. Neither result updates an order.
