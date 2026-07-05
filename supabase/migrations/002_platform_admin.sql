-- Aveniq platform administration.
-- Run in the Aveniq Supabase SQL Editor after 001_initial_schema.sql.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "platform admins read own role" on public.platform_admins;
create policy "platform admins read own role" on public.platform_admins
for select to authenticated using (user_id = auth.uid());

drop policy if exists "platform admins read restaurants" on public.restaurants;
create policy "platform admins read restaurants" on public.restaurants
for select to authenticated using (public.is_platform_admin());

drop policy if exists "platform admins update restaurants" on public.restaurants;
create policy "platform admins update restaurants" on public.restaurants
for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.platform_create_restaurant(
  p_name text,
  p_restaurant_type text default '',
  p_phone text default '',
  p_address text default '',
  p_table_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_slug text;
  base_slug text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'INVALID_RESTAURANT_NAME';
  end if;
  if p_table_count not between 1 and 100 then
    raise exception 'TABLE_COUNT_OUT_OF_RANGE';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(unaccent(p_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'restaurant'; end if;
  target_slug := base_slug;
  while exists (select 1 from public.restaurants where slug = target_slug) loop
    target_slug := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end loop;

  insert into public.restaurants (
    owner_user_id, name, slug, restaurant_type, phone, address, status, is_active, is_open
  ) values (
    auth.uid(), trim(p_name), target_slug, trim(coalesce(p_restaurant_type, '')),
    trim(coalesce(p_phone, '')), trim(coalesce(p_address, '')), 'active', true, true
  ) returning id into target_id;

  insert into public.restaurant_staff (restaurant_id, user_id, role)
  values (target_id, auth.uid(), 'owner')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  insert into public.tables (
    restaurant_id, local_id, table_number, table_name, name, table_token, sort_order
  )
  select target_id, 'table-' || n, n, 'Table ' || n, 'Table ' || n,
    'tk_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), n
  from generate_series(1, p_table_count) n;

  return jsonb_build_object(
    'id', target_id,
    'slug', target_slug,
    'name', trim(p_name),
    'table_count', p_table_count
  );
end;
$$;

revoke all on function public.platform_create_restaurant(text, text, text, text, integer) from public;
grant execute on function public.platform_create_restaurant(text, text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';

-- After creating the master user in Authentication > Users, run this once:
-- insert into public.platform_admins (user_id)
-- select id from auth.users where lower(email) = lower('YOUR_MASTER_EMAIL');
