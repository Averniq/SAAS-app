-- Aveniq SaaS V1 Data API least-privilege hardening.
-- Apply only after 006_function_permission_hardening.sql.
-- This migration does not modify application data.

begin;

-- Anonymous customers must use the three public RPCs rather than reading
-- restaurant rows (including private profile fields) through PostgREST.
drop policy if exists "public read active restaurants" on public.restaurants;

-- Remove Supabase's legacy automatic Data API grants from known V1 tables.
-- RLS remains enabled as the second authorization layer for authenticated use.
revoke all privileges on table public.restaurants from anon, authenticated;
revoke all privileges on table public.restaurant_staff from anon, authenticated;
revoke all privileges on table public.categories from anon, authenticated;
revoke all privileges on table public.tables from anon, authenticated;
revoke all privileges on table public.menu_items from anon, authenticated;
revoke all privileges on table public.orders from anon, authenticated;
revoke all privileges on table public.order_items from anon, authenticated;
revoke all privileges on table public.platform_admins from anon, authenticated;
revoke all privileges on table public.restaurant_invites from anon, authenticated;

-- The identity sequence is used inside submit_order(), not directly by clients.
revoke all privileges on sequence public.orders_order_number_seq from anon, authenticated;

-- Signed-in staff receive only the table operations used by the current client.
-- Tenant isolation and role authorization continue to be enforced by RLS.
grant select, update on table public.restaurants to authenticated;
grant select on table public.restaurant_staff to authenticated;
grant select, insert on table public.categories to authenticated;
grant select, insert, update on table public.tables to authenticated;
grant select, insert, update on table public.menu_items to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select on table public.platform_admins to authenticated;

-- restaurant_invites remains RPC-only. Order status changes also remain RPC-only;
-- authenticated receives no direct UPDATE grant on orders.

-- Make future public-schema exposure opt-in. Each future migration must grant
-- only the table, sequence, and function privileges its API contract requires.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Fail atomically if a known public table has lost its RLS protection.
do $$
declare
  table_without_rls text;
begin
  select c.relname
    into table_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array[
      'restaurants',
      'restaurant_staff',
      'categories',
      'tables',
      'menu_items',
      'orders',
      'order_items',
      'platform_admins',
      'restaurant_invites'
    ])
    and not c.relrowsecurity
  limit 1;

  if table_without_rls is not null then
    raise exception 'RLS_REQUIRED_ON_TABLE: %', table_without_rls;
  end if;
end;
$$;

-- Verify the intended customer and staff Data API boundary before commit.
do $$
begin
  if has_table_privilege('anon', 'public.restaurants', 'select') then
    raise exception 'ANON_RESTAURANTS_SELECT_STILL_GRANTED';
  end if;

  if not has_table_privilege('authenticated', 'public.restaurants', 'select')
     or not has_table_privilege('authenticated', 'public.restaurants', 'update')
     or not has_table_privilege('authenticated', 'public.restaurant_staff', 'select')
     or not has_table_privilege('authenticated', 'public.categories', 'select')
     or not has_table_privilege('authenticated', 'public.categories', 'insert')
     or not has_table_privilege('authenticated', 'public.tables', 'select')
     or not has_table_privilege('authenticated', 'public.tables', 'insert')
     or not has_table_privilege('authenticated', 'public.tables', 'update')
     or not has_table_privilege('authenticated', 'public.menu_items', 'select')
     or not has_table_privilege('authenticated', 'public.menu_items', 'insert')
     or not has_table_privilege('authenticated', 'public.menu_items', 'update')
     or not has_table_privilege('authenticated', 'public.orders', 'select')
     or not has_table_privilege('authenticated', 'public.order_items', 'select')
     or not has_table_privilege('authenticated', 'public.platform_admins', 'select') then
    raise exception 'AUTHENTICATED_V1_TABLE_GRANTS_INCOMPLETE';
  end if;

  if has_table_privilege('authenticated', 'public.orders', 'update')
     or has_table_privilege('authenticated', 'public.restaurant_invites', 'select')
     or has_table_privilege('authenticated', 'public.restaurant_invites', 'insert')
     or has_table_privilege('authenticated', 'public.restaurant_invites', 'update')
     or has_table_privilege('authenticated', 'public.restaurant_invites', 'delete') then
    raise exception 'RPC_ONLY_TABLE_ACCESS_STILL_GRANTED';
  end if;

  if not has_function_privilege('anon', 'public.get_public_restaurant(text,text)', 'execute')
     or not has_function_privilege('anon', 'public.submit_order(uuid,uuid,text,text,jsonb,text)', 'execute')
     or not has_function_privilege('anon', 'public.get_customer_order_status(uuid,text,text)', 'execute') then
    raise exception 'ANONYMOUS_CUSTOMER_RPC_GRANTS_INCOMPLETE';
  end if;

  if has_function_privilege('anon', 'public.update_restaurant_order_status(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.create_restaurant_invite(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.platform_create_restaurant(text,text,text,text,integer)', 'execute') then
    raise exception 'ANONYMOUS_PRIVILEGED_RPC_ACCESS_DETECTED';
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
