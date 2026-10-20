-- P0-01D Batch 14 Group 1: forward role/RLS/ACL reconciliation.
-- Reconciles the approved canonical baseline to the verified Production contract.
-- No payment objects or grants are changed.

begin;

-- Fail closed if an unexpected restaurants UPDATE policy would be overwritten.
do $$
begin
  if exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'restaurants'
      and p.polcmd = 'w'
      and p.polname not in (
        'owners manage restaurant',
        'platform admins update restaurants',
        'authenticated update allowed restaurants',
        'owners and platform admins update restaurants'
      )
  ) then
    raise exception 'UNRECOGNIZED_RESTAURANTS_UPDATE_POLICY';
  end if;
end;
$$;

alter table public.restaurant_staff drop constraint restaurant_staff_role_check;
alter table public.restaurant_staff add constraint restaurant_staff_role_check
  check (role in ('owner', 'manager', 'staff', 'kitchen', 'cashier', 'waitstaff', 'attendance'));

alter table public.restaurant_invites drop constraint restaurant_invites_role_check;
alter table public.restaurant_invites add constraint restaurant_invites_role_check
  check (role in ('owner', 'manager', 'staff', 'kitchen', 'cashier', 'waitstaff', 'attendance'));

create or replace function public.create_restaurant_invite(
  p_restaurant_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_row public.restaurant_invites;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  caller_role text;
  is_owner_or_admin boolean;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_role not in ('owner', 'manager', 'staff', 'kitchen', 'cashier', 'waitstaff', 'attendance') then
    raise exception 'INVALID_STAFF_ROLE';
  end if;

  select role into caller_role
  from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();

  is_owner_or_admin := public.is_platform_admin() or caller_role = 'owner';
  if not is_owner_or_admin and p_role in ('owner', 'manager') then
    raise exception 'ONLY_OWNER_CAN_INVITE_PRIVILEGED_ROLE';
  end if;

  update public.restaurant_invites
  set status = 'revoked'
  where restaurant_id = p_restaurant_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.restaurant_invites(restaurant_id, email, role, invited_by)
  values (p_restaurant_id, normalized_email, p_role, auth.uid())
  returning * into invite_row;

  return jsonb_build_object(
    'id', invite_row.id,
    'token', invite_row.token,
    'email', invite_row.email,
    'role', invite_row.role,
    'expires_at', invite_row.expires_at
  );
end;
$$;

-- Preserve the verified Production policy model. These targeted replacements
-- make the canonical replay converge without activating additional table ACLs.
drop policy if exists "staff read own restaurants" on public.restaurants;
drop policy if exists "owners manage restaurant" on public.restaurants;
drop policy if exists "authenticated read allowed restaurants" on public.restaurants;
drop policy if exists "authenticated update allowed restaurants" on public.restaurants;
drop policy if exists "owners and platform admins update restaurants" on public.restaurants;

create policy "authenticated read allowed restaurants" on public.restaurants
for select to authenticated
using (public.is_restaurant_staff(id) or public.is_platform_admin());

create policy "owners and platform admins update restaurants" on public.restaurants
for update to authenticated
using (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin())
with check (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin());

drop policy if exists "staff read own memberships" on public.restaurant_staff;
drop policy if exists "owners manage staff" on public.restaurant_staff;
drop policy if exists "staff read allowed memberships" on public.restaurant_staff;
drop policy if exists "owners insert staff" on public.restaurant_staff;
drop policy if exists "owners update staff" on public.restaurant_staff;
drop policy if exists "owners delete staff" on public.restaurant_staff;

create policy "staff read allowed memberships" on public.restaurant_staff
for select to authenticated
using (user_id = (select auth.uid()) or public.has_restaurant_role(restaurant_id, array['owner']));

create policy "owners insert staff" on public.restaurant_staff
for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner']));

create policy "owners update staff" on public.restaurant_staff
for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']))
with check (public.has_restaurant_role(restaurant_id, array['owner']));

create policy "owners delete staff" on public.restaurant_staff
for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']));

drop policy if exists "staff read orders" on public.orders;
drop policy if exists "operational staff read orders" on public.orders;
drop policy if exists "staff update orders" on public.orders;

create policy "operational staff read orders" on public.orders
for select to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner', 'manager', 'staff', 'kitchen', 'cashier', 'waitstaff']));

create policy "staff update orders" on public.orders
for update to authenticated
using (public.is_restaurant_staff(restaurant_id))
with check (public.is_restaurant_staff(restaurant_id));

-- Explicitly preserve the only affected direct table grants; orders UPDATE is
-- deliberately not granted, so its RLS UPDATE policy remains dormant.
grant select, update on table public.restaurants to authenticated;
grant select on table public.restaurant_staff to authenticated;
grant select on table public.orders to authenticated;

revoke all on function public.create_restaurant_invite(uuid, text, text) from public, anon;
grant execute on function public.create_restaurant_invite(uuid, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
