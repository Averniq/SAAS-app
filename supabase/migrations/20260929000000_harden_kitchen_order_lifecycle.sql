-- Clean-state Kitchen lifecycle authority.
-- Database states: new -> preparing -> ready -> completed, with cancellation
-- permitted only to owners and managers before ready.

create or replace function public.update_restaurant_order_status(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_action text
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
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role into target_role
  from public.restaurant_staff
  where restaurant_id = p_restaurant_id
    and user_id = auth.uid();

  if target_role is null then
    raise exception 'RESTAURANT_ACCESS_DENIED';
  end if;

  select * into current_order
  from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id
  for update;

  if current_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if p_action not in ('Preparing', 'Ready', 'Served', 'Cancelled') then
    raise exception 'INVALID_KITCHEN_ACTION';
  end if;

  if p_action in ('Preparing', 'Ready', 'Served')
    and target_role not in ('owner','manager','staff','kitchen') then
    raise exception 'KITCHEN_ROLE_REQUIRED';
  end if;

  if p_action = 'Cancelled'
    and target_role not in ('owner','manager') then
    raise exception 'CANCELLATION_ROLE_REQUIRED';
  end if;

  target_status := case
    when current_order.status = 'new' and p_action = 'Preparing' then 'preparing'
    when current_order.status = 'preparing' and p_action = 'Ready' then 'ready'
    when current_order.status = 'ready' and p_action = 'Served' then 'completed'
    when current_order.status in ('new', 'preparing') and p_action = 'Cancelled' then 'cancelled'
    else null
  end;

  if target_status is null then
    raise exception 'INVALID_KITCHEN_TRANSITION';
  end if;

  update public.orders
  set status = target_status,
      served_at = case when target_status = 'completed' then now() else served_at end,
      closed_at = case when target_status = 'cancelled' then now() else closed_at end,
      updated_at = now()
  where id = current_order.id
  returning * into current_order;

  return jsonb_build_object(
    'id', current_order.id,
    'restaurant_id', current_order.restaurant_id,
    'status', current_order.status,
    'served_at', current_order.served_at,
    'closed_at', current_order.closed_at,
    'updated_at', current_order.updated_at
  );
end;
$$;

revoke update on table public.orders from anon, authenticated;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public, anon;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';
