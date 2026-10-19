-- Configurable organisation-level plans and entitlements. No billing provider,
-- checkout, invoice, payment collection, or legacy-tenant backfill is added.

create table if not exists public.plan_definitions (
  plan_code text primary key check (plan_code in ('trial', 'starter', 'growth', 'enterprise')),
  display_name text not null,
  limits jsonb not null,
  trial_duration_days integer check (trial_duration_days is null or trial_duration_days between 1 and 365),
  live_ordering_enabled boolean not null default false,
  test_ordering_enabled boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(limits) = 'object')
);

insert into public.plan_definitions (
  plan_code, display_name, limits, trial_duration_days, live_ordering_enabled, test_ordering_enabled
) values
  ('trial', 'Trial', '{"max_organizations":1,"max_venues":1,"max_tables":20,"max_menu_items":100,"max_staff_accounts":5}'::jsonb, 14, true, true),
  ('starter', 'Starter', '{"max_organizations":1,"max_venues":1,"max_tables":50,"max_menu_items":500,"max_staff_accounts":10}'::jsonb, null, false, false),
  ('growth', 'Growth', '{"max_organizations":1,"max_venues":5,"max_tables":250,"max_menu_items":5000,"max_staff_accounts":50}'::jsonb, null, false, false),
  ('enterprise', 'Enterprise', '{"max_organizations":1,"max_venues":1000,"max_tables":10000,"max_menu_items":100000,"max_staff_accounts":10000}'::jsonb, null, false, false)
on conflict (plan_code) do nothing;

create table if not exists public.organization_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  plan_code text not null references public.plan_definitions(plan_code) on delete restrict,
  status text not null check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired', 'suspended')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists organization_entitlements_status_end_idx
  on public.organization_entitlements (status, ends_at);

create trigger plan_definitions_updated_at before update on public.plan_definitions
for each row execute function public.set_updated_at();
create trigger organization_entitlements_updated_at before update on public.organization_entitlements
for each row execute function public.set_updated_at();

alter table public.plan_definitions enable row level security;
alter table public.organization_entitlements enable row level security;
revoke all on table public.plan_definitions, public.organization_entitlements from public;
revoke all on table public.plan_definitions, public.organization_entitlements from anon, authenticated;

create or replace function public.create_trial_entitlement_for_self_service_organization()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  trial_plan public.plan_definitions;
  trial_start timestamptz;
begin
  if not exists (
    select 1 from public.self_service_registrations
    where user_id = new.owner_user_id and status = 'provisioning'
  ) then
    return new;
  end if;

  select * into trial_plan
  from public.plan_definitions
  where plan_code = 'trial' and enabled;
  if trial_plan.plan_code is null or trial_plan.trial_duration_days is null then
    raise exception 'TRIAL_PLAN_CONFIGURATION_MISSING';
  end if;

  trial_start := clock_timestamp();
  insert into public.organization_entitlements (
    organization_id, plan_code, status, starts_at, ends_at
  ) values (
    new.id, 'trial', 'trial', trial_start,
    trial_start + make_interval(days => trial_plan.trial_duration_days)
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_trial_entitlement_for_self_service_organization on public.organizations;
create trigger create_trial_entitlement_for_self_service_organization
after insert on public.organizations
for each row execute function public.create_trial_entitlement_for_self_service_organization();

create or replace function public.organization_entitlement_effective_status(p_organization_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare entitlement public.organization_entitlements;
begin
  select * into entitlement
  from public.organization_entitlements
  where organization_id = p_organization_id;
  if entitlement.id is null then return 'legacy'; end if;
  if entitlement.status = 'trial' and entitlement.ends_at <= clock_timestamp() then
    return 'expired';
  end if;
  return entitlement.status;
end;
$$;

create or replace function public.assert_restaurant_entitlement_limit(
  p_restaurant_id uuid,
  p_resource text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_organization_id uuid;
  entitlement public.organization_entitlements;
  plan public.plan_definitions;
  effective_status text;
  maximum integer;
  current_usage integer;
begin
  select organization_id into target_organization_id
  from public.restaurants where id = p_restaurant_id;
  if target_organization_id is null then return; end if;

  select * into entitlement from public.organization_entitlements
  where organization_id = target_organization_id;
  if entitlement.id is null then return; end if;

  effective_status := public.organization_entitlement_effective_status(target_organization_id);
  if effective_status not in ('trial', 'active') then
    raise exception 'ENTITLEMENT_NOT_ACTIVE';
  end if;

  select * into plan from public.plan_definitions where plan_code = entitlement.plan_code;
  maximum := nullif(plan.limits->>('max_' || p_resource), '')::integer;
  if maximum is null then return; end if;

  case p_resource
    when 'venues' then
      select count(*) into current_usage from public.restaurants where organization_id = target_organization_id;
    when 'tables' then
      select count(*) into current_usage from public.tables where restaurant_id = p_restaurant_id;
    when 'menu_items' then
      select count(*) into current_usage from public.menu_items where restaurant_id = p_restaurant_id;
    when 'staff_accounts' then
      select count(*) into current_usage from public.restaurant_staff where restaurant_id = p_restaurant_id;
    else
      raise exception 'UNKNOWN_ENTITLEMENT_RESOURCE';
  end case;

  if current_usage >= maximum then
    raise exception 'PLAN_LIMIT_REACHED';
  end if;
end;
$$;

create or replace function public.assert_restaurant_live_order_entitlement(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_organization_id uuid;
  entitlement public.organization_entitlements;
  plan public.plan_definitions;
  effective_status text;
begin
  select organization_id into target_organization_id
  from public.restaurants where id = p_restaurant_id;
  if target_organization_id is null then return; end if;

  select * into entitlement from public.organization_entitlements
  where organization_id = target_organization_id;
  if entitlement.id is null then return; end if;

  effective_status := public.organization_entitlement_effective_status(target_organization_id);
  if effective_status = 'expired' then raise exception 'TRIAL_EXPIRED'; end if;
  if effective_status not in ('trial', 'active') then raise exception 'ENTITLEMENT_NOT_ACTIVE'; end if;

  select * into plan from public.plan_definitions where plan_code = entitlement.plan_code;
  if not plan.live_ordering_enabled then raise exception 'LIVE_ORDERING_NOT_INCLUDED'; end if;
end;
$$;

create or replace function public.assert_organization_venue_limit(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  entitlement public.organization_entitlements;
  plan public.plan_definitions;
  effective_status text;
  maximum integer;
  current_usage integer;
begin
  if p_organization_id is null then return; end if;
  select * into entitlement from public.organization_entitlements
  where organization_id = p_organization_id;
  if entitlement.id is null then return; end if;

  effective_status := public.organization_entitlement_effective_status(p_organization_id);
  if effective_status not in ('trial', 'active') then raise exception 'ENTITLEMENT_NOT_ACTIVE'; end if;

  select * into plan from public.plan_definitions where plan_code = entitlement.plan_code;
  maximum := nullif(plan.limits->>'max_venues', '')::integer;
  if maximum is null then return; end if;
  select count(*) into current_usage from public.restaurants where organization_id = p_organization_id;
  if current_usage >= maximum then raise exception 'PLAN_LIMIT_REACHED'; end if;
end;
$$;

create or replace function public.enforce_restaurant_entitlement_limits()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'restaurants' and new.organization_id is not null then
    -- A first venue is inserted after its organisation-triggered entitlement.
    perform public.assert_organization_venue_limit(new.organization_id);
  elsif tg_table_name = 'tables' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'tables');
  elsif tg_table_name = 'menu_items' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'menu_items');
  elsif tg_table_name = 'restaurant_staff' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'staff_accounts');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_restaurant_live_order_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_restaurant_live_order_entitlement(new.restaurant_id);
  return new;
end;
$$;

drop trigger if exists enforce_restaurant_entitlement_limit_on_venues on public.restaurants;
create trigger enforce_restaurant_entitlement_limit_on_venues
before insert on public.restaurants
for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_tables on public.tables;
create trigger enforce_restaurant_entitlement_limit_on_tables
before insert on public.tables
for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_menu_items on public.menu_items;
create trigger enforce_restaurant_entitlement_limit_on_menu_items
before insert on public.menu_items
for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_staff on public.restaurant_staff;
create trigger enforce_restaurant_entitlement_limit_on_staff
before insert on public.restaurant_staff
for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_live_order_entitlement on public.orders;
create trigger enforce_restaurant_live_order_entitlement
before insert on public.orders
for each row execute function public.enforce_restaurant_live_order_entitlement();

create or replace function public.get_restaurant_entitlement(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_organization_id uuid;
  entitlement public.organization_entitlements;
  plan public.plan_definitions;
  effective_status text;
  venue_count integer;
  table_count integer;
  menu_item_count integer;
  staff_count integer;
begin
  if auth.uid() is null or not public.is_restaurant_staff(p_restaurant_id) then
    raise exception 'ENTITLEMENT_ACCESS_DENIED';
  end if;

  select organization_id into target_organization_id
  from public.restaurants where id = p_restaurant_id;
  if target_organization_id is null then
    return jsonb_build_object('is_legacy', true, 'usage', jsonb_build_object());
  end if;

  select * into entitlement from public.organization_entitlements
  where organization_id = target_organization_id;
  if entitlement.id is null then
    return jsonb_build_object('is_legacy', true, 'usage', jsonb_build_object());
  end if;

  effective_status := public.organization_entitlement_effective_status(target_organization_id);
  if effective_status = 'expired' and entitlement.status = 'trial' then
    update public.organization_entitlements set status = 'expired' where id = entitlement.id;
    entitlement.status := 'expired';
  end if;
  select * into plan from public.plan_definitions where plan_code = entitlement.plan_code;

  select count(*) into venue_count from public.restaurants where organization_id = target_organization_id;
  select count(*) into table_count from public.tables where restaurant_id = p_restaurant_id;
  select count(*) into menu_item_count from public.menu_items where restaurant_id = p_restaurant_id;
  select count(*) into staff_count from public.restaurant_staff where restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'is_legacy', false,
    'plan_code', plan.plan_code,
    'plan_name', plan.display_name,
    'status', effective_status,
    'trial_start', entitlement.starts_at,
    'trial_end', entitlement.ends_at,
    'days_remaining', case when entitlement.ends_at is null then null else greatest(0, ceil(extract(epoch from (entitlement.ends_at - clock_timestamp())) / 86400.0)::integer) end,
    'limits', plan.limits,
    'usage', jsonb_build_object(
      'organizations', 1,
      'venues', venue_count,
      'tables', table_count,
      'menu_items', menu_item_count,
      'staff_accounts', staff_count
    )
  );
end;
$$;

revoke all on function public.create_trial_entitlement_for_self_service_organization() from public, anon, authenticated;
revoke all on function public.organization_entitlement_effective_status(uuid) from public, anon, authenticated;
revoke all on function public.assert_restaurant_entitlement_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.assert_restaurant_live_order_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.assert_organization_venue_limit(uuid) from public, anon, authenticated;
revoke all on function public.get_restaurant_entitlement(uuid) from public, anon;
grant execute on function public.get_restaurant_entitlement(uuid) to authenticated;

notify pgrst, 'reload schema';
