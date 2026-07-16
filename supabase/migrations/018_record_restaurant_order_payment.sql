-- Tenant-scoped front-desk payment recording. Direct order table updates stay revoked.
create or replace function public.record_restaurant_order_payment(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  updated_order public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_method not in ('Cash', 'Card', 'EFTPOS', 'Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select role into target_role
  from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid();

  if target_role not in ('owner', 'manager', 'staff', 'cashier') then
    raise exception 'CASHIER_ROLE_REQUIRED';
  end if;

  update public.orders
  set status = 'completed',
      closed_at = coalesce(closed_at, now()),
      paid_at = coalesce(paid_at, now()),
      payment_method = p_method,
      updated_at = now()
  where id = p_order_id
    and restaurant_id = p_restaurant_id
    and status not in ('cancelled', 'completed')
  returning * into updated_order;

  if updated_order.id is null then raise exception 'ORDER_NOT_PAYABLE'; end if;
  return jsonb_build_object(
    'id', updated_order.id,
    'restaurant_id', updated_order.restaurant_id,
    'status', updated_order.status,
    'payment_method', updated_order.payment_method,
    'paid_at', updated_order.paid_at
  );
end;
$$;

revoke all on function public.record_restaurant_order_payment(uuid,uuid,text) from public;
grant execute on function public.record_restaurant_order_payment(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
