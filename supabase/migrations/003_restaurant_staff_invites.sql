-- Aveniq restaurant owner/staff invitations.
-- Run after 001_initial_schema.sql and 002_platform_admin.sql.

create table if not exists public.restaurant_invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','manager','kitchen','cashier')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists restaurant_invites_restaurant_idx
  on public.restaurant_invites(restaurant_id, status, created_at desc);
create unique index if not exists restaurant_invites_pending_email_idx
  on public.restaurant_invites(restaurant_id, lower(email)) where status = 'pending';

alter table public.restaurant_invites enable row level security;

create or replace function public.can_manage_restaurant_staff(target_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.restaurant_staff
    where restaurant_id = target_restaurant
      and user_id = auth.uid()
      and role in ('owner','manager')
  );
$$;

create or replace function public.create_restaurant_invite(
  p_restaurant_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.restaurant_invites;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  caller_role text;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_role not in ('owner','manager','kitchen','cashier') then
    raise exception 'INVALID_STAFF_ROLE';
  end if;

  select role into caller_role from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();
  if p_role = 'owner' and not public.is_platform_admin() and caller_role <> 'owner' then
    raise exception 'ONLY_OWNER_CAN_INVITE_OWNER';
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

create or replace function public.accept_restaurant_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.restaurant_invites;
  account_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  restaurant_row public.restaurants;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into invite_row from public.restaurant_invites
  where token = p_token and status = 'pending'
  for update;

  if invite_row.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if invite_row.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if lower(invite_row.email) <> account_email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;

  insert into public.restaurant_staff(restaurant_id, user_id, role)
  values(invite_row.restaurant_id, auth.uid(), invite_row.role)
  on conflict (restaurant_id, user_id) do update
    set role = case
      when public.restaurant_staff.role = 'owner' then 'owner'
      else excluded.role
    end;

  if invite_row.role = 'owner' then
    update public.restaurants set owner_user_id = auth.uid()
    where id = invite_row.restaurant_id;
  end if;

  update public.restaurant_invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite_row.id;

  select * into restaurant_row from public.restaurants where id = invite_row.restaurant_id;
  return jsonb_build_object(
    'restaurant_id', restaurant_row.id,
    'restaurant_slug', restaurant_row.slug,
    'restaurant_name', restaurant_row.name,
    'role', invite_row.role
  );
end;
$$;

create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', rs.user_id,
        'email', coalesce(u.email, ''),
        'role', rs.role,
        'created_at', rs.created_at,
        'is_current', rs.user_id = auth.uid()
      ) order by case rs.role when 'owner' then 1 when 'manager' then 2 when 'kitchen' then 3 else 4 end, rs.created_at)
      from public.restaurant_staff rs
      left join auth.users u on u.id = rs.user_id
      where rs.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'token', ri.token,
        'email', ri.email,
        'role', ri.role,
        'expires_at', ri.expires_at,
        'created_at', ri.created_at
      ) order by ri.created_at desc)
      from public.restaurant_invites ri
      where ri.restaurant_id = p_restaurant_id
        and ri.status = 'pending'
        and ri.expires_at >= now()
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.revoke_restaurant_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target_restaurant uuid;
begin
  select restaurant_id into target_restaurant from public.restaurant_invites where id = p_invite_id;
  if target_restaurant is null or not public.can_manage_restaurant_staff(target_restaurant) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;
  update public.restaurant_invites set status = 'revoked'
  where id = p_invite_id and status = 'pending';
  return found;
end;
$$;

revoke all on table public.restaurant_invites from anon, authenticated;
revoke all on function public.can_manage_restaurant_staff(uuid) from public;
revoke all on function public.create_restaurant_invite(uuid,text,text) from public;
revoke all on function public.accept_restaurant_invite(uuid) from public;
revoke all on function public.list_restaurant_team(uuid) from public;
revoke all on function public.revoke_restaurant_invite(uuid) from public;

grant execute on function public.can_manage_restaurant_staff(uuid) to authenticated;
grant execute on function public.create_restaurant_invite(uuid,text,text) to authenticated;
grant execute on function public.accept_restaurant_invite(uuid) to authenticated;
grant execute on function public.list_restaurant_team(uuid) to authenticated;
grant execute on function public.revoke_restaurant_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
