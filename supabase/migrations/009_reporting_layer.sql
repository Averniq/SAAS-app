-- Aveniq SaaS V1 reporting layer for small restaurants.
-- Apply after 008_authoritative_option_pricing.sql.

begin;

create schema if not exists reporting;
revoke all on schema reporting from public, anon;
grant usage on schema reporting to authenticated;

create index if not exists orders_reports_restaurant_created_idx
  on public.orders(restaurant_id, created_at desc)
  include (status, total, table_id, served_at, closed_at);

create or replace view reporting.order_facts
with (security_invoker = true)
as
select
  o.id,
  o.restaurant_id,
  o.table_id,
  t.table_name,
  o.status,
  o.total,
  o.created_at,
  o.served_at,
  o.closed_at,
  timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at) as local_ordered_at,
  timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at)::date as local_order_date,
  extract(hour from timezone(coalesce(nullif(r.timezone, ''), 'Australia/Sydney'), o.created_at))::integer as local_order_hour,
  case when o.served_at is not null
    then greatest(0, extract(epoch from (o.served_at - o.created_at)) / 60.0)
    else null
  end as preparation_minutes
from public.orders o
join public.restaurants r on r.id = o.restaurant_id
join public.tables t on t.id = o.table_id and t.restaurant_id = o.restaurant_id;

create or replace view reporting.item_facts
with (security_invoker = true)
as
select
  o.restaurant_id,
  o.local_order_date as sale_date,
  oi.menu_item_id,
  oi.name_snapshot as item_name,
  coalesce(nullif(oi.category_snapshot, ''), 'Menu') as category_name,
  oi.quantity,
  round(oi.unit_price * oi.quantity, 2) as revenue
from reporting.order_facts o
join public.order_items oi on oi.order_id = o.id and oi.restaurant_id = o.restaurant_id
where o.status = 'completed';

create or replace view reporting.daily_sales
with (security_invoker = true)
as
select restaurant_id, local_order_date as sale_date,
  round(sum(total), 2) as sales,
  count(*)::integer as order_count,
  round(avg(total), 2) as average_order_value
from reporting.order_facts
where status = 'completed'
group by restaurant_id, local_order_date;

create or replace view reporting.weekly_sales
with (security_invoker = true)
as
select restaurant_id,
  date_trunc('week', sale_date::timestamp)::date as week_start,
  round(sum(sales), 2) as sales,
  sum(order_count)::integer as order_count,
  round(sum(sales) / nullif(sum(order_count), 0), 2) as average_order_value
from reporting.daily_sales
group by restaurant_id, date_trunc('week', sale_date::timestamp)::date;

create or replace view reporting.monthly_sales
with (security_invoker = true)
as
select restaurant_id,
  date_trunc('month', sale_date::timestamp)::date as month_start,
  round(sum(sales), 2) as sales,
  sum(order_count)::integer as order_count,
  round(sum(sales) / nullif(sum(order_count), 0), 2) as average_order_value
from reporting.daily_sales
group by restaurant_id, date_trunc('month', sale_date::timestamp)::date;

create or replace view reporting.top_selling_items
with (security_invoker = true)
as
select restaurant_id, sale_date, menu_item_id, item_name,
  sum(quantity)::integer as quantity,
  round(sum(revenue), 2) as revenue
from reporting.item_facts
group by restaurant_id, sale_date, menu_item_id, item_name;

create or replace view reporting.category_sales
with (security_invoker = true)
as
select restaurant_id, sale_date, category_name,
  sum(quantity)::integer as quantity,
  round(sum(revenue), 2) as revenue
from reporting.item_facts
group by restaurant_id, sale_date, category_name;

create or replace view reporting.table_sales
with (security_invoker = true)
as
select restaurant_id, local_order_date as sale_date, table_id, table_name,
  count(*)::integer as order_count,
  round(sum(total), 2) as sales,
  round(avg(total), 2) as average_spend
from reporting.order_facts
where status = 'completed'
group by restaurant_id, local_order_date, table_id, table_name;

create or replace view reporting.hourly_sales
with (security_invoker = true)
as
select restaurant_id, local_order_date as sale_date, local_order_hour as hour,
  count(*)::integer as order_count,
  round(sum(total), 2) as sales
from reporting.order_facts
where status = 'completed'
group by restaurant_id, local_order_date, local_order_hour;

create or replace view reporting.order_summary
with (security_invoker = true)
as
select restaurant_id, local_order_date as summary_date,
  count(*) filter (where status = 'completed')::integer as completed_orders,
  count(*) filter (where status = 'cancelled')::integer as cancelled_orders,
  coalesce(sum(total) filter (where status = 'completed'), 0)::numeric(12,2) as completed_sales,
  coalesce(sum(preparation_minutes) filter (where status = 'completed' and preparation_minutes is not null), 0)::numeric as preparation_minutes_total,
  count(*) filter (where status = 'completed' and preparation_minutes is not null)::integer as preparation_order_count
from reporting.order_facts
group by restaurant_id, local_order_date;

revoke all on all tables in schema reporting from public, anon;
grant select on all tables in schema reporting to authenticated;

create or replace function reporting.assert_report_access(p_restaurant_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.has_restaurant_role(p_restaurant_id, array['owner','manager']) then
    raise exception 'REPORT_ACCESS_DENIED';
  end if;
end;
$$;

create or replace function reporting.assert_report_range(p_from date, p_to date)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or (p_to - p_from) > 365 then
    raise exception 'INVALID_REPORT_RANGE';
  end if;
end;
$$;

revoke all on function reporting.assert_report_access(uuid) from public, anon;
revoke all on function reporting.assert_report_range(date,date) from public, anon;
grant execute on function reporting.assert_report_access(uuid) to authenticated;
grant execute on function reporting.assert_report_range(date,date) to authenticated;

create or replace function public.get_report_dashboard(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  restaurant_today date;
  result jsonb;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  select timezone(coalesce(nullif(timezone, ''), 'Australia/Sydney'), now())::date
    into restaurant_today
  from public.restaurants where id = p_restaurant_id;

  select jsonb_build_object(
    'today', restaurant_today,
    'today_sales', coalesce(round(sum(total) filter (
      where status = 'completed' and local_order_date = restaurant_today
    ), 2), 0),
    'orders_today', count(*) filter (
      where status <> 'cancelled' and local_order_date = restaurant_today
    ),
    'average_order_value', coalesce(round(avg(total) filter (
      where status = 'completed' and local_order_date = restaurant_today
    ), 2), 0),
    'active_tables', count(distinct table_id) filter (
      where status in ('new','preparing','ready') or (status = 'completed' and closed_at is null)
    ),
    'pending_orders', count(*) filter (where status in ('new','preparing','ready'))
  ) into result
  from reporting.order_facts
  where restaurant_id = p_restaurant_id;
  return result;
end;
$$;

create or replace function public.get_sales_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  summary jsonb;
  day_count integer := p_to - p_from + 1;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  perform reporting.assert_report_range(p_from, p_to);

  select jsonb_build_object(
    'sales', coalesce(round(sum(sales), 2), 0),
    'order_count', coalesce(sum(order_count), 0),
    'average_order_value', case when coalesce(sum(order_count), 0) = 0 then 0
      else round(sum(sales) / sum(order_count), 2) end
  ) into summary
  from reporting.daily_sales
  where restaurant_id = p_restaurant_id and sale_date between p_from and p_to;

  if day_count <= 31 then
    with periods as (
      select generate_series(p_from, p_to, interval '1 day')::date as period_start
    ), rows as (
      select p.period_start, coalesce(d.sales, 0) as sales,
        coalesce(d.order_count, 0) as order_count,
        coalesce(d.average_order_value, 0) as average_order_value
      from periods p left join reporting.daily_sales d
        on d.restaurant_id = p_restaurant_id and d.sale_date = p.period_start
      order by p.period_start
    )
    select jsonb_build_object('granularity','day','rows',coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb))
      into result from rows;
  elsif day_count <= 180 then
    with periods as (
      select generate_series(date_trunc('week', p_from::timestamp), date_trunc('week', p_to::timestamp), interval '1 week')::date as period_start
    ), aggregated as (
      select date_trunc('week', sale_date::timestamp)::date as period_start,
        round(sum(sales), 2) as sales,
        sum(order_count)::integer as order_count,
        round(sum(sales) / nullif(sum(order_count), 0), 2) as average_order_value
      from reporting.daily_sales
      where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
      group by date_trunc('week', sale_date::timestamp)::date
    ), rows as (
      select p.period_start, coalesce(w.sales, 0) as sales,
        coalesce(w.order_count, 0) as order_count,
        coalesce(w.average_order_value, 0) as average_order_value
      from periods p left join aggregated w on w.period_start = p.period_start
      order by p.period_start
    )
    select jsonb_build_object('granularity','week','rows',coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb))
      into result from rows;
  else
    with periods as (
      select generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month')::date as period_start
    ), aggregated as (
      select date_trunc('month', sale_date::timestamp)::date as period_start,
        round(sum(sales), 2) as sales,
        sum(order_count)::integer as order_count,
        round(sum(sales) / nullif(sum(order_count), 0), 2) as average_order_value
      from reporting.daily_sales
      where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
      group by date_trunc('month', sale_date::timestamp)::date
    ), rows as (
      select p.period_start, coalesce(m.sales, 0) as sales,
        coalesce(m.order_count, 0) as order_count,
        coalesce(m.average_order_value, 0) as average_order_value
      from periods p left join aggregated m on m.period_start = p.period_start
      order by p.period_start
    )
    select jsonb_build_object('granularity','month','rows',coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb))
      into result from rows;
  end if;
  return result || jsonb_build_object('summary', summary);
end;
$$;

create or replace function public.get_menu_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  perform reporting.assert_report_range(p_from, p_to);

  with item_totals as (
    select menu_item_id, max(item_name) as item_name,
      sum(quantity)::integer as quantity, round(sum(revenue), 2) as revenue
    from reporting.top_selling_items
    where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
    group by menu_item_id
  ), all_items as (
    select m.id as menu_item_id, m.name as item_name,
      coalesce(i.quantity, 0) as quantity, coalesce(i.revenue, 0) as revenue
    from public.menu_items m left join item_totals i on i.menu_item_id = m.id
    where m.restaurant_id = p_restaurant_id and m.is_active
  ), top_rows as (
    select * from all_items order by quantity desc, revenue desc, item_name limit 10
  ), low_rows as (
    select * from all_items order by quantity asc, revenue asc, item_name limit 10
  ), category_rows as (
    select category_name, sum(quantity)::integer as quantity, round(sum(revenue), 2) as revenue
    from reporting.category_sales
    where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
    group by category_name order by revenue desc, category_name
  )
  select jsonb_build_object(
    'top_items', (select coalesce(jsonb_agg(to_jsonb(top_rows)), '[]'::jsonb) from top_rows),
    'lowest_items', (select coalesce(jsonb_agg(to_jsonb(low_rows)), '[]'::jsonb) from low_rows),
    'categories', (select coalesce(jsonb_agg(to_jsonb(category_rows)), '[]'::jsonb) from category_rows)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_table_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  perform reporting.assert_report_range(p_from, p_to);
  with totals as (
    select table_id, max(table_name) as table_name, sum(order_count)::integer as order_count,
      round(sum(sales), 2) as sales,
      round(sum(sales) / nullif(sum(order_count), 0), 2) as average_spend
    from reporting.table_sales
    where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
    group by table_id
  ), rows as (
    select t.id as table_id, t.table_name,
      coalesce(x.order_count, 0) as order_count,
      coalesce(x.sales, 0) as sales,
      coalesce(x.average_spend, 0) as average_spend
    from public.tables t left join totals x on x.table_id = t.id
    where t.restaurant_id = p_restaurant_id and t.is_active
    order by sales desc, t.sort_order, t.table_name
  )
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb))
    into result from rows;
  return result;
end;
$$;

create or replace function public.get_hourly_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  perform reporting.assert_report_range(p_from, p_to);
  with hours as (select generate_series(0, 23) as hour), totals as (
    select hour, sum(order_count)::integer as order_count, round(sum(sales), 2) as sales
    from reporting.hourly_sales
    where restaurant_id = p_restaurant_id and sale_date between p_from and p_to
    group by hour
  ), rows as (
    select h.hour, coalesce(t.order_count, 0) as order_count, coalesce(t.sales, 0) as sales
    from hours h left join totals t on t.hour = h.hour order by h.hour
  )
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb))
    into result from rows;
  return result;
end;
$$;

create or replace function public.get_order_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  perform reporting.assert_report_access(p_restaurant_id);
  perform reporting.assert_report_range(p_from, p_to);
  select jsonb_build_object(
    'completed_orders', coalesce(sum(completed_orders), 0),
    'cancelled_orders', coalesce(sum(cancelled_orders), 0),
    'average_preparation_minutes', case when coalesce(sum(preparation_order_count), 0) = 0 then null
      else round(sum(preparation_minutes_total) / sum(preparation_order_count), 1) end,
    'average_order_value', case when coalesce(sum(completed_orders), 0) = 0 then 0
      else round(sum(completed_sales) / sum(completed_orders), 2) end,
    'completed_sales', coalesce(round(sum(completed_sales), 2), 0)
  ) into result
  from reporting.order_summary
  where restaurant_id = p_restaurant_id and summary_date between p_from and p_to;
  return result;
end;
$$;

revoke all on function public.get_report_dashboard(uuid) from public, anon;
revoke all on function public.get_sales_report(uuid,date,date) from public, anon;
revoke all on function public.get_menu_report(uuid,date,date) from public, anon;
revoke all on function public.get_table_report(uuid,date,date) from public, anon;
revoke all on function public.get_hourly_report(uuid,date,date) from public, anon;
revoke all on function public.get_order_report(uuid,date,date) from public, anon;
grant execute on function public.get_report_dashboard(uuid) to authenticated;
grant execute on function public.get_sales_report(uuid,date,date) to authenticated;
grant execute on function public.get_menu_report(uuid,date,date) to authenticated;
grant execute on function public.get_table_report(uuid,date,date) to authenticated;
grant execute on function public.get_hourly_report(uuid,date,date) to authenticated;
grant execute on function public.get_order_report(uuid,date,date) to authenticated;

do $$
begin
  if has_schema_privilege('anon', 'reporting', 'usage') then
    raise exception 'ANON_REPORTING_SCHEMA_ACCESS_DETECTED';
  end if;
  if not has_schema_privilege('authenticated', 'reporting', 'usage') then
    raise exception 'AUTHENTICATED_REPORTING_SCHEMA_USAGE_MISSING';
  end if;
  if has_function_privilege('anon', 'public.get_report_dashboard(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_sales_report(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public.get_menu_report(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public.get_table_report(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public.get_hourly_report(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'public.get_order_report(uuid,date,date)', 'execute') then
    raise exception 'ANON_REPORT_RPC_ACCESS_DETECTED';
  end if;
  if not has_function_privilege('authenticated', 'public.get_report_dashboard(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_sales_report(uuid,date,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_menu_report(uuid,date,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_table_report(uuid,date,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_hourly_report(uuid,date,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_order_report(uuid,date,date)', 'execute') then
    raise exception 'AUTHENTICATED_REPORT_RPC_GRANTS_INCOMPLETE';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'get_report_dashboard','get_sales_report','get_menu_report',
        'get_table_report','get_hourly_report','get_order_report'
      ])
      and p.prosecdef
  ) then
    raise exception 'REPORT_RPC_MUST_BE_SECURITY_INVOKER';
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
