# Aveniq SaaS

Standalone multi-restaurant QR ordering platform. This folder has no runtime or database connection to the Sake Street project.

## Database development

Create a separate Supabase project specifically for Aveniq. Never use the Sake Street project URL or key.

The migration ledger is currently under reconciliation. Do not manually apply selected SQL files, run `supabase db push`, or run `supabase migration repair` until `pnpm run test:migrations` passes and the reconciliation document removes the deployment block. See `docs/supabase-migration-reconciliation.md` for the inventory, hosted-ledger comparison, and safe recovery procedure.

Local replay requires the Supabase CLI and a running Docker-compatible container runtime. Once the integrity gate passes, use explicit local flags:

```powershell
pnpm run test:migrations
supabase start
supabase db reset --local --no-seed
supabase migration list --local
supabase db lint --local --level warning
```

Never use `--linked` or `--db-url` for a replay/reset. Those options can target a hosted database. Create future migrations with `supabase migration new <descriptive_name>` so the CLI supplies a unique UTC timestamp. Shared or applied migration files are append-only and immutable; corrections belong in a newly generated migration.

After reporting or security/RLS changes, run the relevant verification SQL locally and the configured authorization suite against a dedicated local/test project. Copy only that project's URL and publishable key into `supabase-config.js`; keep `restaurantSlug` empty because restaurants are created from the Master console.

## Restaurant accounts

Owners and managers create account invitations from **Dashboard → Restaurant Team**. The invite link is copied automatically. The invited person opens `/join/:token`, creates an account (or signs in), and is assigned only to that restaurant with one of these roles: owner, manager, all-round staff, kitchen, or cashier. All-round Staff combines Kitchen and Front Desk access for small restaurants without granting Reports or Admin.

For a separate local Supabase stack, run `supabase start` from this folder. Its configured ports are 54331–54333 to avoid colliding with another local project.

## Order integrity

Orders and payments are never deleted through the restaurant UI. Use **Void order** for cancellations; paid, completed, and kitchen-progress orders require a Manager/Owner's configured (bcrypt-hashed) staff PIN. The original records, manager approval, reason, and timestamp remain in `order_audit_log`. Paid and completed orders are locked in the database and the front desk exposes only history/receipt actions. Run `pnpm run test:order-integrity` after applying the migration, plus the configured authorization suite against a local/test Supabase project.

## App

```powershell
pnpm install
pnpm run build
```

Deploy this folder as its own Netlify site. Its build output is `dist`.
