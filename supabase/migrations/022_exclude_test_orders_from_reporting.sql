-- Test orders remain operationally visible but never enter reporting facts/exports.
create or replace view reporting.order_facts
with (security_invoker = true)
as
select o.id,o.restaurant_id,o.table_id,t.table_name,o.status,o.total,o.created_at,o.served_at,o.closed_at,
  timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at) as local_ordered_at,
  timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at)::date as local_order_date,
  extract(hour from timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at))::integer as local_order_hour,
  case when o.served_at is not null then greatest(0,extract(epoch from(o.served_at-o.created_at))/60.0) else null end as preparation_minutes
from public.orders o join public.restaurants r on r.id=o.restaurant_id join public.tables t on t.id=o.table_id and t.restaurant_id=o.restaurant_id
where o.is_test_order is not true;
create index if not exists orders_reporting_live_idx on public.orders(restaurant_id,created_at desc) where is_test_order is not true;
