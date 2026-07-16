# Sake Street → Aveniq SaaS: test-tenant migration map

## Scope and safety boundary

This is an analysis of `C:\Users\WindVeil\Documents\Sake Street SAAS` as a reference implementation. Aveniq's existing multi-restaurant model is the source of truth. No Sake Street credentials, environment files, deployment configuration, production data, or printer configuration are to be copied.

The intended test tenant is **Sake Street**, slug **`sake-street`**. It must be created through Aveniq's `restaurants` and `restaurant_staff` model and all data must retain the existing `restaurant_id` scope.

## Architecture comparison

| Area | Aveniq SaaS | Sake Street reference | Migration decision |
| --- | --- | --- | --- |
| Framework and build | Vanilla browser JS, Tailwind build, Capacitor shell, static Netlify deployment | Same stack and build tooling | Reuse compatible UI logic selectively; do not replace Aveniq application entry points. |
| Routing | Tenant-aware routes: `/order/:slug/:table`, `/dashboard/:slug/:area`, `/r/:slug` | Single configured restaurant slug and table query/path handling | Keep Aveniq routing. Map Sake Street public links to Aveniq's existing slug routes. |
| Authentication | Supabase Auth; owner onboarding, platform administrator, invites, role-based `restaurant_staff` | Supabase Auth; one restaurant-oriented staff model | Aveniq already exceeds the reference. Reuse no auth code or credentials. |
| Tenancy | `restaurants` is the tenant; every operational table has `restaurant_id`; RLS and scoped RPCs are present | Primarily one configured restaurant, although tables contain `restaurant_id` | Use Aveniq only. Do not introduce a second `tenant_id` or copy single-tenant assumptions. |
| Restaurant profile and branding | Per-restaurant profile, theme configuration, logo URL, tax, open state | Mature Japanese restaurant defaults and branding | Seed only Sake Street data into one Aveniq restaurant record. Adapt branding fields to Aveniq's profile shape. |
| Menu and categories | `categories` plus `menu_items`; options are validated and priced server-side | Menu items store category text; bootstrap helper imports a menu | Convert reference categories into Aveniq `categories` and preserve `restaurant_id`; reuse menu content only. |
| Item options | `option_config` and authoritative price validation in migration `008` | UI option templates | Adapt Sake Street options into Aveniq `option_config`; never trust client totals. |
| Public ordering and cart | Tenant-aware public restaurant RPC, cart, order submission, customer status | Mature customer menu/cart/status implementation | Existing Aveniq flow covers this. Reuse only presentation or business rules after a tenant-scope review. |
| Tables and QR | `tables` with a tenant-scoped local ID, unique token, QR route | `restaurant_tables`, order links, QR print sheet | Keep Aveniq `tables`; migrate only test table labels and generate new Aveniq tokens. Never copy live QR tokens. |
| Orders and kitchen | Tenant-scoped orders, order items, realtime/reporting and staff roles | Kitchen queue, payment recording, optional printer bridge | Aveniq covers kitchen order management. Printer bridge is optional future work and must use fresh local configuration, never Sake Street's config. |
| Admin and reports | Platform console, tenant dashboard, team invites, reports, menu/table/profile administration | Staff/admin screens and menu/table tools | Prefer Aveniq's screens. Identify any missing UX independently before copying a component. |
| Images and storage | Image URLs are stored on menu/profile records; no storage bucket integration found | Local sample photos and URL/file selection | Do not copy files or bucket configuration. Use Aveniq-supported image URLs or new test assets only. |
| Payments | No Stripe, PayPal, Square, Braintree, or server-side payment gateway found | Manual payment-recording UI; no external payment gateway found | Create only unpaid test orders. Production billing and payment processing remain disabled; no payment integration is added. |
| Deployment and environment | Aveniq-specific Supabase config, Netlify wildcard redirect, `.env.local` ignored | Separate Supabase project and a source-specific CSP endpoint | Do not copy `supabase-config.js`, `.env*`, Netlify settings, keys, or printer config. |

## Aveniq capabilities already present

- Multi-tenant restaurant registry, platform administrator console, owner onboarding, staff invitations, and role enforcement.
- Tenant-scoped restaurant profile, categories, menu items, tables, orders, order items, reporting, and realtime order workflow.
- Public tenant menu and table-aware order flow via `get_public_restaurant` and `submit_order` RPCs.
- Item option configuration and server-authoritative option pricing.
- QR/table management, order status tracking, kitchen/front-desk views, customer order status, tenant branding, and restaurant reports.
- RLS hardening and explicit API grants in migrations `001`–`011`.

## Reusable Sake Street reference features

1. Restaurant profile values, Japanese branding direction, menu categories, menu items, descriptions, tags, and safe option definitions.
2. Table names as seed data only; all QR/table identifiers must be regenerated by Aveniq.
3. Manual payment screen patterns may be considered later as a **test-only payment-recording** feature, but are not required for the initial test tenant.
4. Kitchen printing design is a later optional integration. The reference bridge includes a local printer configuration and must not be copied into the SaaS or configured against production.

## Required adaptations and conflicts

| Reference component | Conflict or adaptation | Safe Aveniq treatment |
| --- | --- | --- |
| `restaurant_users` / `restaurant_tables` | Names and policies differ from Aveniq's `restaurant_staff` / `tables`. | Map data to Aveniq tables; do not copy source SQL. |
| Configured Sake Street slug | Reference assumes a single configured restaurant. | Use Aveniq route context and the new `sake-street` tenant record. |
| Menu bootstrap function | Reference bootstrap is single-restaurant oriented. | Add an idempotent, create-only Aveniq seed path scoped to the new restaurant ID. |
| Payment fields and payment modal | Aveniq has no payment gateway or payment-field migration. | Do not migrate during initial tenant work; retain unpaid/test checkout only. |
| Printer bridge | Contains local printer endpoint/configuration assumptions. | Exclude. Consider a separate, secured tenant-scoped integration later. |
| Reference SQL/RLS | It predates Aveniq's stronger tenant policies and uses different object names. | Do not run or merge it. Extend Aveniq migrations only if a specific gap is demonstrated. |

## Database assessment

No foundational schema change is required to create the test tenant: Aveniq already has `restaurants`, `restaurant_staff`, `categories`, `tables`, `menu_items`, `orders`, and `order_items`, all scoped by `restaurant_id`.

Potential additive work, only after the working tree is clean and reviewed:

1. An idempotent **seed script**, not a destructive migration, that creates `Sake Street` / `sake-street` only when the slug does not already exist.
2. Fresh test-only tables and QR tokens; no reference tokens or customer/order records.
3. Menu/category seed records with each insert tied to the newly created restaurant ID.
4. Optional automated isolation tests covering cross-tenant menu, table, order, and staff access.

## Recommended incremental implementation plan

1. Establish a clean Aveniq worktree and baseline tests; preserve the current unrelated changes separately.
2. Add a reviewed, create-only test-tenant seed mechanism and seed Sake Street profile, branding, categories, menu, options, tables, and regenerated QR links.
3. Exercise existing public menu, cart, checkout, order, kitchen, and admin flows against `sake-street`; add only the gaps that are demonstrated.
4. Add tenant-isolation tests for public routes, table tokens, order submission, and staff/admin authorization.
5. Run build and authorization tests against a safe local or dedicated test Supabase project. Do not reset or migrate a shared/live database.

## Current blockers

The Aveniq working tree contains pre-existing uncommitted changes in core files, including `app.js`, `index.html`, `supabase-client.js`, configuration, and an untracked migration. Their ownership and relationship to this effort are unknown. Implementing Phase 2 in those same files risks overwriting or silently bundling unrelated work, which violates the requested safety rules.

No database operation, deployment, secret copy, or source-configuration copy has been performed.
