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
set search_path = public, pg_temp
as $$
declare
  target_role text;
  current_order public.orders;
  target_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();
  if target_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  select * into current_order from public.orders
  where id = p_order_id and restaurant_id = p_restaurant_id
  for update;
  if current_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_action not in ('Preparing','Ready','Served','Cancelled') then
    raise exception 'INVALID_KITCHEN_ACTION';
  end if;
  if p_action in ('Preparing','Ready','Served') and target_role not in ('owner','manager','staff','kitchen') then
    raise exception 'KITCHEN_ROLE_REQUIRED';
  end if;
  if p_action = 'Cancelled' and target_role not in ('owner','manager') then
    raise exception 'CANCELLATION_ROLE_REQUIRED';
  end if;
  if p_action = 'Cancelled' and current_order.paid_at is not null then
    raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED';
  end if;
  target_status := case
    when current_order.status = 'new' and p_action = 'Preparing' then 'preparing'
    when current_order.status = 'preparing' and p_action = 'Ready' then 'ready'
    when current_order.status = 'ready' and p_action = 'Served' then 'completed'
    when current_order.status in ('new','preparing') and p_action = 'Cancelled' then 'cancelled'
    else null
  end;
  if target_status is null then raise exception 'INVALID_KITCHEN_TRANSITION'; end if;
  update public.orders
  set status = target_status,
      served_at = case when target_status = 'completed' then now() else served_at end,
      closed_at = case when target_status = 'cancelled' then now() else closed_at end,
      updated_at = now()
  where id = current_order.id
  returning * into current_order;
  return jsonb_build_object(
    'id', current_order.id, 'restaurant_id', current_order.restaurant_id,
    'status', current_order.status, 'served_at', current_order.served_at,
    'closed_at', current_order.closed_at, 'updated_at', current_order.updated_at
  );
end;
$$;

revoke all on function public.create_restaurant_invite(uuid,text,text) from public;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public;
grant execute on function public.create_restaurant_invite(uuid,text,text) to authenticated;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

commit;
notify pgrst, 'reload schema';

