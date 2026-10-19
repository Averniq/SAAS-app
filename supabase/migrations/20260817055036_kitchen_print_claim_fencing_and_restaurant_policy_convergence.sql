-- P0-01D Batch 15A: fence kitchen-print completion claims and converge the
-- recognized restaurants UPDATE policy inventory. This is forward-only.

begin;

-- Nullable fencing fields preserve the schema contract while allowing this
-- migration to invalidate legacy in-flight claims that have no claimant.
do $$
declare
  column_name text;
  expected_type regtype;
  actual_type regtype;
  actual_not_null boolean;
  actual_default text;
begin
  for column_name, expected_type in values
    ('kitchen_print_claim_token', 'uuid'::regtype),
    ('kitchen_print_claimed_by', 'uuid'::regtype)
  loop
    select a.atttypid::regtype, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.orders'::regclass
      and a.attname = column_name
      and not a.attisdropped;

    if not found then
      execute format('alter table public.orders add column %I uuid', column_name);
    elsif actual_type is distinct from expected_type
       or actual_not_null
       or actual_default is not null then
      raise exception 'UNRECOGNIZED_KITCHEN_PRINT_FENCING_COLUMN: % type=% not_null=% default=%',
        column_name, actual_type, actual_not_null, actual_default;
    end if;
  end loop;
end;
$$;

update public.orders
set kitchen_print_claimed_at = null,
    kitchen_print_claim_token = null,
    kitchen_print_claimed_by = null
where kitchen_printed_at is null
  and kitchen_print_claimed_at is not null;

update public.orders
set kitchen_print_claim_token = null,
    kitchen_print_claimed_by = null
where kitchen_printed_at is not null
  and (kitchen_print_claim_token is not null or kitchen_print_claimed_by is not null);

-- The old three-argument completion API cannot prove claim ownership. Remove
-- it rather than retaining an executable compatibility wrapper.
revoke all on function public.finish_kitchen_print_job(uuid, boolean, text)
  from public, anon, authenticated, service_role;
drop function public.finish_kitchen_print_job(uuid, boolean, text);

create or replace function public.claim_kitchen_print_job(p_restaurant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_order public.orders%rowtype;
  target_table_name text;
  target_restaurant_name text;
  target_claim_token uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

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
      kitchen_print_claim_token = target_claim_token,
      kitchen_print_claimed_by = auth.uid(),
      kitchen_print_attempts = kitchen_print_attempts + 1,
      kitchen_print_error = null
  where id = target_order.id;

  return jsonb_build_object(
    'id', target_order.id,
    'claim_token', target_claim_token,
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

create function public.finish_kitchen_print_job(
  p_order_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_claim_token is null then
    raise exception 'PRINT_JOB_CLAIM_TOKEN_REQUIRED';
  end if;

  if p_success then
    update public.orders o
    set kitchen_printed_at = now(),
        kitchen_print_claimed_at = null,
        kitchen_print_claim_token = null,
        kitchen_print_claimed_by = null,
        kitchen_print_error = null
    where o.id = p_order_id
      and public.is_restaurant_staff(o.restaurant_id)
      and o.kitchen_printed_at is null
      and o.kitchen_print_claim_token = p_claim_token
      and o.kitchen_print_claimed_by = auth.uid()
      and o.kitchen_print_claimed_at is not null
      and o.kitchen_print_claimed_at >= now() - interval '2 minutes';
  else
    update public.orders o
    set kitchen_print_claimed_at = null,
        kitchen_print_claim_token = null,
        kitchen_print_claimed_by = null,
        kitchen_print_error = left(coalesce(p_error, 'Unknown printer error'), 1000)
    where o.id = p_order_id
      and public.is_restaurant_staff(o.restaurant_id)
      and o.kitchen_printed_at is null
      and o.kitchen_print_claim_token = p_claim_token
      and o.kitchen_print_claimed_by = auth.uid()
      and o.kitchen_print_claimed_at is not null
      and o.kitchen_print_claimed_at >= now() - interval '2 minutes';
  end if;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'PRINT_JOB_CLAIM_NOT_CURRENT';
  end if;

  return p_success;
end;
$$;

revoke all on function public.claim_kitchen_print_job(text)
  from public, anon, service_role;
revoke all on function public.finish_kitchen_print_job(uuid, uuid, boolean, text)
  from public, anon, service_role;
grant execute on function public.claim_kitchen_print_job(text) to authenticated;
grant execute on function public.finish_kitchen_print_job(uuid, uuid, boolean, text) to authenticated;

-- Batch 14 allowed this verified legacy policy as a pre-state but did not
-- remove it. Reject unrelated UPDATE policies and converge to exactly one.
do $$
begin
  if exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'restaurants'
      and p.polcmd = 'w'
      and p.polname not in (
        'platform admins update restaurants',
        'owners and platform admins update restaurants'
      )
  ) then
    raise exception 'UNRECOGNIZED_RESTAURANTS_UPDATE_POLICY';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'restaurants'
      and p.polname = 'owners and platform admins update restaurants'
      and p.polcmd = 'w'
      and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polqual, p.polrelid) like '%has_restaurant_role%'
      and pg_get_expr(p.polwithcheck, p.polrelid) like '%is_platform_admin%'
  ) then
    raise exception 'CANONICAL_RESTAURANTS_UPDATE_POLICY_MISSING_OR_WRONG';
  end if;
end;
$$;

drop policy if exists "platform admins update restaurants" on public.restaurants;
drop policy if exists "owners and platform admins update restaurants" on public.restaurants;

create policy "owners and platform admins update restaurants" on public.restaurants
for update to authenticated
using (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin())
with check (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin());

commit;

notify pgrst, 'reload schema';
