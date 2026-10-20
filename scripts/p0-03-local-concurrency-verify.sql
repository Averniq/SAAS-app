\set ON_ERROR_STOP on
select case when
  (select coalesce(sum(amount_cents),0) from public.payment_operations where restaurant_id=:'restaurant_id'::uuid and order_id=:'order_id'::uuid) = 600
  and (select count(*) from public.payment_operations where restaurant_id=:'restaurant_id'::uuid and order_id=:'order_id'::uuid) = 1
  and (select paid_at is null and status = 'new' from public.orders where id=:'order_id'::uuid)
then 'P0-03 concurrent payment invariant passed'
else (1 / 0)::text end;
