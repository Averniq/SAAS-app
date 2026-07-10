-- Read-only verification for migrations 008 and 009.
-- Run in Supabase SQL Editor after both migrations have completed.

do $$
declare
  required_views text[] := array[
    'daily_sales','weekly_sales','monthly_sales','top_selling_items',
    'category_sales','table_sales','hourly_sales','order_summary'
  ];
  required_rpcs text[] := array[
    'get_report_dashboard','get_sales_report','get_menu_report',
    'get_table_report','get_hourly_report','get_order_report'
  ];
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menu_items' and column_name = 'option_config'
  ) then raise exception 'MISSING_MENU_OPTION_CONFIG'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items' and column_name = 'category_snapshot'
  ) then raise exception 'MISSING_ORDER_CATEGORY_SNAPSHOT'; end if;

  if (select count(*) from information_schema.views
      where table_schema = 'reporting' and table_name = any(required_views)) <> cardinality(required_views) then
    raise exception 'REPORTING_VIEWS_INCOMPLETE';
  end if;

  if (select count(distinct table_name) from information_schema.columns
      where table_schema = 'reporting' and table_name = any(required_views) and column_name = 'restaurant_id') <> cardinality(required_views) then
    raise exception 'REPORTING_VIEW_RESTAURANT_SCOPE_MISSING';
  end if;

  if (select count(distinct p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any(required_rpcs)) <> cardinality(required_rpcs) then
    raise exception 'REPORTING_RPCS_INCOMPLETE';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(required_rpcs) and p.prosecdef
  ) then raise exception 'REPORTING_RPC_SECURITY_DEFINER_DETECTED'; end if;

  if has_function_privilege('anon', 'public.get_report_dashboard(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_report_dashboard(uuid)', 'execute') then
    raise exception 'REPORTING_RPC_GRANTS_INVALID';
  end if;
end;
$$;

select
  (select count(*) from public.menu_items where jsonb_typeof(option_config) = 'array') as menu_items_with_valid_option_arrays,
  (select count(*) from public.order_items where category_snapshot <> '') as order_items_with_category_snapshots,
  (select count(*) from reporting.daily_sales) as daily_sales_rows,
  (select count(*) from reporting.order_summary) as order_summary_rows;
