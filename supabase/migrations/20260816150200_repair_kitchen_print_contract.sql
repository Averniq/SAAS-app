-- P0-01D Batch 14 Group 3: reconcile the kitchen-print claim/index contract.
-- The queue uses the validated lowercase orders.status vocabulary.

begin;

-- The approved canonical baseline permits five lower-case states; Production
-- has the verified ten-state lower-case constraint. Reject any other drift.
do $$
declare
  current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and conname = 'orders_status_check';

  if current_definition not in (
    $canonical$CHECK ((status = ANY (ARRAY['new'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'cancelled'::text])))$canonical$,
    $canonical2$CHECK (status = ANY (ARRAY['new'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'cancelled'::text]))$canonical2$,
    $production$CHECK (status = ANY (ARRAY['new'::text, 'draft'::text, 'confirmed'::text, 'kitchen_accepted'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'paid'::text, 'cancelled'::text, 'voided'::text]))$production$
  ) then
    raise exception 'UNRECOGNIZED_ORDERS_STATUS_CONSTRAINT: %', current_definition;
  end if;
end;
$$;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new', 'draft', 'confirmed', 'kitchen_accepted', 'preparing', 'ready', 'completed', 'paid', 'cancelled', 'voided'));

-- Add only missing Production-only print columns; each existing column must
-- already have the exact captured contract.
do $$
declare
  column_name text;
  expected_type regtype;
  expected_not_null boolean;
  expected_default text;
  actual_type regtype;
  actual_not_null boolean;
  actual_default text;
begin
  for column_name, expected_type, expected_not_null, expected_default in
    values
      ('kitchen_printed_at', 'timestamp with time zone'::regtype, false, null::text),
      ('kitchen_print_claimed_at', 'timestamp with time zone'::regtype, false, null::text),
      ('kitchen_print_attempts', 'integer'::regtype, true, '0'::text),
      ('kitchen_print_error', 'text'::regtype, false, null::text)
  loop
    select a.atttypid::regtype, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.orders'::regclass
      and a.attname = column_name
      and not a.attisdropped;

    if not found then
      if column_name = 'kitchen_printed_at' then
        execute 'alter table public.orders add column kitchen_printed_at timestamptz';
      elsif column_name = 'kitchen_print_claimed_at' then
        execute 'alter table public.orders add column kitchen_print_claimed_at timestamptz';
      elsif column_name = 'kitchen_print_attempts' then
        execute 'alter table public.orders add column kitchen_print_attempts integer not null default 0';
      elsif column_name = 'kitchen_print_error' then
        execute 'alter table public.orders add column kitchen_print_error text';
      end if;
    elsif actual_type is distinct from expected_type
       or actual_not_null is distinct from expected_not_null
       or actual_default is distinct from expected_default
    then
      raise exception 'UNRECOGNIZED_KITCHEN_PRINT_COLUMN: % type=% not_null=% default=%',
        column_name, actual_type, actual_not_null, actual_default;
    end if;
  end loop;
end;
$$;

-- A pre-existing index must be the known broken uppercase predicate. An absent
-- index is the approved canonical-baseline state. No unrelated index is dropped.
do $$
declare
  current_predicate text;
begin
  if to_regclass('public.orders_kitchen_print_queue_idx') is not null then
    select pg_get_expr(i.indpred, i.indrelid) into current_predicate
    from pg_index i
    where i.indexrelid = 'public.orders_kitchen_print_queue_idx'::regclass;

    if current_predicate not like '%''New''%'
       or current_predicate not like '%''Preparing''%'
    then
      raise exception 'UNRECOGNIZED_KITCHEN_PRINT_INDEX_PREDICATE: %', current_predicate;
    end if;
    execute 'drop index public.orders_kitchen_print_queue_idx';
  end if;
end;
$$;

create index orders_kitchen_print_queue_idx
  on public.orders (restaurant_id, created_at)
  where kitchen_printed_at is null
    and status in ('new', 'preparing');

create or replace function public.claim_kitchen_print_job(p_restaurant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
  target_table_name text;
  target_restaurant_name text;
begin
  select o.*
    into target_order
  from public.orders o
  join public.tables t on t.id = o.table_id
  join public.restaurants r on r.id = o.restaurant_id
  where r.slug = p_restaurant_slug
    and public.is_restaurant_staff(o.restaurant_id)
    and o.status in ('new', 'preparing')
    and o.kitchen_printed_at is null
    and o.kitchen_print_attempts < 10
    and (
      o.kitchen_print_claimed_at is null
      or o.kitchen_print_claimed_at < now() - interval '2 minutes'
    )
  order by o.created_at
  for update of o skip locked
  limit 1;

  if target_order.id is null then
    return null;
  end if;

  select t.name, r.name
    into target_table_name, target_restaurant_name
  from public.tables t
  join public.restaurants r on r.id = target_order.restaurant_id
  where t.id = target_order.table_id;

  update public.orders
  set kitchen_print_claimed_at = now(),
      kitchen_print_attempts = kitchen_print_attempts + 1,
      kitchen_print_error = null
  where id = target_order.id;

  return jsonb_build_object(
    'id', target_order.id,
    'order_number', target_order.order_number,
    'restaurant_name', target_restaurant_name,
    'table_name', target_table_name,
    'note', target_order.note,
    'created_at', target_order.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', oi.name_snapshot,
          'quantity', oi.quantity,
          'options', oi.options
        ) order by oi.created_at
      )
      from public.order_items oi
      where oi.order_id = target_order.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finish_kitchen_print_job(
  p_order_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
begin
  select restaurant_id into target_restaurant_id
  from public.orders
  where id = p_order_id;

  if target_restaurant_id is null
     or not public.is_restaurant_staff(target_restaurant_id)
  then
    raise exception 'PRINT_JOB_NOT_ALLOWED';
  end if;

  if p_success then
    update public.orders
    set kitchen_printed_at = now(),
        kitchen_print_claimed_at = null,
        kitchen_print_error = null
    where id = p_order_id;
  else
    update public.orders
    set kitchen_print_claimed_at = now(),
        kitchen_print_error = left(coalesce(p_error, 'Unknown printer error'), 1000)
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.claim_kitchen_print_job(text) from public, anon, service_role;
revoke all on function public.finish_kitchen_print_job(uuid, boolean, text) from public, anon, service_role;
grant execute on function public.claim_kitchen_print_job(text) to authenticated;
grant execute on function public.finish_kitchen_print_job(uuid, boolean, text) to authenticated;

commit;

notify pgrst, 'reload schema';
