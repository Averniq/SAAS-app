# Aveniq SaaS

Standalone multi-restaurant QR ordering platform. This folder has no runtime or database connection to the Sake Street project.

## Separate database

Create a new Supabase project specifically for Aveniq. Never use the Sake Street project URL or key.

1. Run `supabase/migrations/001_initial_schema.sql` in the new project's SQL Editor.
2. Run `supabase/migrations/002_platform_admin.sql`.
3. Run `supabase/migrations/003_restaurant_staff_invites.sql`.
4. Run `supabase/migrations/004_role_hardening.sql`.
5. Run `supabase/migrations/005_all_round_staff.sql`.
6. Run `supabase/migrations/006_function_permission_hardening.sql`.
7. Run `supabase/migrations/007_explicit_data_api_grants.sql`.
8. Run `supabase/migrations/008_authoritative_option_pricing.sql`.
9. Run `supabase/migrations/009_reporting_layer.sql`.
10. Run `supabase/migrations/010_advisor_index_rls_tuning.sql`.
11. Run `supabase/migrations/011_consolidate_rls_policies.sql`.
12. Copy the new project's URL and publishable key into `supabase-config.js`.
13. Keep `restaurantSlug` empty; restaurants are created from the Master console.

For the existing live project, do not re-run migrations already applied. Apply new migrations in order. After `008`, verify a real option-priced order before applying `009` and opening Reports. After `009`, run `supabase/REPORTING_VERIFICATION.sql`. After any security or RLS migration, run `pnpm run test:authorization` with the dedicated role-test environment variables described in `tests/AUTHORIZATION_TESTS.md`.

## Restaurant accounts

Owners and managers create account invitations from **Dashboard → Restaurant Team**. The invite link is copied automatically. The invited person opens `/join/:token`, creates an account (or signs in), and is assigned only to that restaurant with one of these roles: owner, manager, all-round staff, kitchen, or cashier. All-round Staff combines Kitchen and Front Desk access for small restaurants without granting Reports or Admin.

For a separate local Supabase stack, run `supabase start` from this folder. Its configured ports are 54331–54333 to avoid colliding with another local project.

## App

```powershell
pnpm install
pnpm run build
```

Deploy this folder as its own Netlify site. Its build output is `dist`.
