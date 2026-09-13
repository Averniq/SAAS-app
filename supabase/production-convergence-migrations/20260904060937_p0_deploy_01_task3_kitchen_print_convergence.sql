-- P0-DEPLOY-01 Task 3: evidence-fenced Production-forward kitchen convergence.
-- Production-forward release material only; not canonical fresh-stack history.

begin;
do $p0_task3_precondition$
declare old_queue text;
begin
  if to_regclass('public.restaurant_tables') is not null then raise exception 'P0_DEPLOY_01_TASK3_RESTAURANT_TABLES_MUST_BE_ABSENT'; end if;
  if to_regclass('public.tables') is null then raise exception 'P0_DEPLOY_01_TASK3_PUBLIC_TABLES_MISSING'; end if;
  if exists (select 1 from pg_attribute a where a.attrelid='public.orders'::regclass and a.attname in ('kitchen_print_claim_token','kitchen_print_claimed_by') and not a.attisdropped) then raise exception 'P0_DEPLOY_01_TASK3_UNEXPECTED_CLAIM_FENCING_COLUMN'; end if;
  if not exists (select 1 from pg_proc p where p.oid='public.claim_kitchen_print_job(text)'::regprocedure and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and p.proconfig=array['search_path=public'] and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')='d1f5670607181a2be8f4d056a387539a2a3f3849b4133e42035fd5df860da583') then raise exception 'P0_DEPLOY_01_TASK3_CLAIM_PRESTATE_MISMATCH'; end if;
  if not exists (select 1 from pg_proc p where p.oid='public.finish_kitchen_print_job(uuid,boolean,text)'::regprocedure and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and p.proconfig=array['search_path=public'] and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')='1c7c41ccb5b04158133077b36f553a63cfeba6ebb690a68993dafa6497d2ba8e') then raise exception 'P0_DEPLOY_01_TASK3_FINISH_PRESTATE_MISMATCH'; end if;
  select pg_get_indexdef(i.indexrelid) into old_queue from pg_index i where i.indexrelid='public.orders_kitchen_print_queue_idx'::regclass;
  if old_queue is distinct from $$CREATE INDEX orders_kitchen_print_queue_idx ON public.orders USING btree (restaurant_id, created_at) WHERE ((kitchen_printed_at IS NULL) AND (status = ANY (ARRAY['New'::text, 'Preparing'::text])))$$ then raise exception 'P0_DEPLOY_01_TASK3_QUEUE_INDEX_PRESTATE_MISMATCH'; end if;
  if exists (select 1 from public.orders where kitchen_printed_at is null and kitchen_print_claimed_at is not null) then raise exception 'P0_DEPLOY_01_TASK3_ACTIVE_UNPRINTED_CLAIM'; end if;
end
$p0_task3_precondition$;
alter table public.orders add column kitchen_print_claim_token uuid;
alter table public.orders add column kitchen_print_claimed_by uuid;
drop index public.orders_kitchen_print_queue_idx;
create index orders_kitchen_print_queue_idx on public.orders (restaurant_id, created_at) where kitchen_printed_at is null and status in ('new','preparing');

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
