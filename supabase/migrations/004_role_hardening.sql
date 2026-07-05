-- Restrict order mutations to approved status transitions.
-- Run after 003_restaurant_staff_invites.sql.

create or replace function public.update_restaurant_order_status(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_action text
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

  select role into target_role
  from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();

  if target_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if p_action not in ('Preparing','Ready','Served','Paid','Cancelled') then
    raise exception 'INVALID_ORDER_ACTION';
  end if;
  if p_action in ('Preparing','Ready','Served') and target_role not in ('owner','manager','kitchen') then
    raise exception 'KITCHEN_ROLE_REQUIRED';
  end if;
  if p_action = 'Paid' and target_role not in ('owner','manager','cashier') then
    raise exception 'CASHIER_ROLE_REQUIRED';
  end if;

  target_status := case p_action
    when 'Preparing' then 'preparing'
    when 'Ready' then 'ready'
    when 'Served' then 'completed'
    when 'Paid' then 'completed'
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
    'id', updated_order.id,
    'restaurant_id', updated_order.restaurant_id,
    'status', updated_order.status,
    'served_at', updated_order.served_at,
    'closed_at', updated_order.closed_at,
    'updated_at', updated_order.updated_at
  );
end;
$$;

-- Direct table updates could alter totals, table_id, or restaurant data.
-- All application status changes now go through the function above.
revoke update on table public.orders from anon, authenticated;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';

