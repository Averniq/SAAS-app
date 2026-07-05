-- Optional combined role for small restaurants.
-- All-round Staff can use Kitchen and Front Desk, but not Reports or Admin.
-- Run after 004_role_hardening.sql.

begin;

alter table public.restaurant_staff drop constraint if exists restaurant_staff_role_check;
alter table public.restaurant_staff add constraint restaurant_staff_role_check
  check (role in ('owner','manager','staff','kitchen','cashier'));

alter table public.restaurant_invites drop constraint if exists restaurant_invites_role_check;
alter table public.restaurant_invites add constraint restaurant_invites_role_check
  check (role in ('owner','manager','staff','kitchen','cashier'));

create or replace function public.create_restaurant_invite(
  p_restaurant_id uuid, p_email text, p_role text
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
  if p_role not in ('owner','manager','staff','kitchen','cashier') then
    raise exception 'INVALID_STAFF_ROLE';
  end if;

  select role into caller_role from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();
  if p_role = 'owner' and not public.is_platform_admin() and caller_role <> 'owner' then
    raise exception 'ONLY_OWNER_CAN_INVITE_OWNER';
  end if;

  update public.restaurant_invites set status = 'revoked'
  where restaurant_id = p_restaurant_id and lower(email) = normalized_email and status = 'pending';

  insert into public.restaurant_invites(restaurant_id, email, role, invited_by)
  values (p_restaurant_id, normalized_email, p_role, auth.uid())
  returning * into invite_row;

  return jsonb_build_object(
    'id', invite_row.id, 'token', invite_row.token, 'email', invite_row.email,
    'role', invite_row.role, 'expires_at', invite_row.expires_at
  );
end;
$$;

create or replace function public.update_restaurant_order_status(
  p_restaurant_id uuid, p_order_id uuid, p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_status text;
  target_role text;
  updated_order public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();

  if target_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if p_action not in ('Preparing','Ready','Served','Paid','Cancelled') then
    raise exception 'INVALID_ORDER_ACTION';
  end if;
  if p_action in ('Preparing','Ready','Served') and target_role not in ('owner','manager','staff','kitchen') then
    raise exception 'KITCHEN_ROLE_REQUIRED';
  end if;
  if p_action = 'Paid' and target_role not in ('owner','manager','staff','cashier') then
    raise exception 'CASHIER_ROLE_REQUIRED';
  end if;

  target_status := case p_action
    when 'Preparing' then 'preparing' when 'Ready' then 'ready'
    when 'Served' then 'completed' when 'Paid' then 'completed'
    when 'Cancelled' then 'cancelled'
  end;

  update public.orders
  set status = target_status,
      served_at = case when p_action = 'Served' then now() else served_at end,
      closed_at = case when p_action in ('Paid','Cancelled') then now() else closed_at end,
      updated_at = now()
  where id = p_order_id and restaurant_id = p_restaurant_id
  returning * into updated_order;

  if updated_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id', updated_order.id, 'restaurant_id', updated_order.restaurant_id,
    'status', updated_order.status, 'served_at', updated_order.served_at,
    'closed_at', updated_order.closed_at, 'updated_at', updated_order.updated_at
  );
end;
$$;

revoke all on function public.create_restaurant_invite(uuid,text,text) from public;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public;
grant execute on function public.create_restaurant_invite(uuid,text,text) to authenticated;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

commit;
notify pgrst, 'reload schema';

