-- Local-only disposable PG17 fixture. Identifiers below are synthetic and are
-- intentionally never reported by the harness.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'local-sake-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp())
on conflict (id) do nothing;

insert into public.organizations (id, owner_user_id, name, slug, country, default_timezone, default_currency)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sake Street Local Test Organization', 'sake-street-local', 'AU', 'Australia/Sydney', 'AUD')
on conflict (id) do nothing;

insert into public.restaurants (id, owner_user_id, organization_id, name, slug, country, currency_code, ordering_enabled, venue_status)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Sake Street', 'sake-street', 'AU', 'AUD', true, 'active')
on conflict (id) do nothing;

insert into public.restaurant_staff (restaurant_id, user_id, role)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner')
on conflict (restaurant_id, user_id) do update set role = excluded.role;

insert into public.tables (id, restaurant_id, table_number, table_name, local_id, name, table_token)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'Table 1', 'local-sake-table-1', 'Table 1', 'local-sake-table-token-1')
on conflict (id) do nothing;

insert into public.categories (id, restaurant_id, name, sort_order)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Local test category', 1)
on conflict (id) do nothing;

insert into public.menu_items (id, restaurant_id, category_id, name, price, local_id, category, is_active, is_available)
values ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Local test menu item', 12.34, 'local-sake-menu-1', 'Local test category', true, true)
on conflict (id) do nothing;

insert into public.public_qr_ordering_entitlements (restaurant_id, active, expires_at)
values ('30000000-0000-0000-0000-000000000001', true, null)
on conflict (restaurant_id) do update set active = true, expires_at = null;

commit;
