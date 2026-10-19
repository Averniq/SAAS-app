-- Provision verified public self-service accounts without trusting browser input.
-- Existing restaurants remain unchanged: organisation_id and venue fields stay
-- nullable for historical tenants. New self-service venues set every field below.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  slug text not null unique,
  country text not null default '',
  default_timezone text not null default 'UTC',
  default_currency text,
  timezone_confirmation_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.restaurants
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists country text,
  add column if not exists currency_code text,
  add column if not exists venue_status text check (venue_status is null or venue_status in ('setup_required', 'active', 'suspended')),
  add column if not exists ordering_enabled boolean,
  add column if not exists timezone_confirmation_required boolean;

create index if not exists restaurants_organization_id_idx
  on public.restaurants (organization_id) where organization_id is not null;

create table if not exists public.self_service_registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  business_name text not null,
  country text not null,
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'provisioning', 'provisioned', 'failed', 'excluded')),
  provisioning_attempts integer not null default 0 check (provisioning_attempts >= 0),
  organization_id uuid references public.organizations(id) on delete set null,
  venue_id uuid references public.restaurants(id) on delete set null,
  last_error text,
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'setup_required' check (status in ('setup_required', 'in_progress', 'completed')),
  timezone_confirmation_required boolean not null default true,
  currency_confirmation_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (venue_id)
);

create index if not exists onboarding_progress_user_idx
  on public.onboarding_progress (user_id, status);

drop trigger if exists organizations_updated_at on public.organizations;
drop trigger if exists self_service_registrations_updated_at on public.self_service_registrations;
drop trigger if exists onboarding_progress_updated_at on public.onboarding_progress;
create trigger organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger self_service_registrations_updated_at before update on public.self_service_registrations
for each row execute function public.set_updated_at();
create trigger onboarding_progress_updated_at before update on public.onboarding_progress
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.self_service_registrations enable row level security;
alter table public.onboarding_progress enable row level security;

revoke all on table public.organizations, public.organization_memberships,
  public.self_service_registrations, public.onboarding_progress from anon, authenticated;

-- Capture a validated self-service request when Auth creates the user. This
-- private snapshot is used for provisioning so later user_metadata edits cannot
-- change the business information used to create a tenant.
create or replace function public.capture_self_service_registration()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms_at timestamptz;
  privacy_at timestamptz;
begin
  if metadata->>'registration_type' is distinct from 'self_service' then
    return new;
  end if;

  begin
    terms_at := (metadata->>'terms_accepted_at')::timestamptz;
    privacy_at := (metadata->>'privacy_accepted_at')::timestamptz;
  exception when others then
    raise exception 'SELF_SERVICE_REGISTRATION_METADATA_INVALID';
  end;

  if btrim(coalesce(metadata->>'full_name', '')) = ''
     or btrim(coalesce(metadata->>'business_name', '')) = ''
     or btrim(coalesce(metadata->>'country', '')) = '' then
    raise exception 'SELF_SERVICE_REGISTRATION_METADATA_INVALID';
  end if;

  insert into public.self_service_registrations (
    user_id, full_name, business_name, country, terms_accepted_at, privacy_accepted_at
  ) values (
    new.id,
    left(btrim(metadata->>'full_name'), 120),
    left(btrim(metadata->>'business_name'), 160),
    left(btrim(metadata->>'country'), 100),
    terms_at,
    privacy_at
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists capture_self_service_registration on auth.users;
create trigger capture_self_service_registration
after insert on auth.users
for each row execute function public.capture_self_service_registration();

create or replace function public.provision_self_service_account_for_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  registration public.self_service_registrations;
  account auth.users;
  v_organization_id uuid;
  v_venue_id uuid;
  organization_slug text;
  venue_slug text;
  base_slug text;
  candidate_slug text;
  timezone_value text := 'UTC';
  currency_value text;
  timezone_needs_confirmation boolean := true;
  currency_needs_confirmation boolean := true;
  attempt integer := 0;
  failure_message text;
begin
  select * into registration
  from public.self_service_registrations
  where user_id = p_user_id
  for update;

  if registration.user_id is null then
    return jsonb_build_object('status', 'excluded', 'reason', 'NOT_SELF_SERVICE');
  end if;

  select * into account from auth.users where id = p_user_id;
  if account.id is null or account.email_confirmed_at is null then
    update public.self_service_registrations set status = 'pending', last_error = null
    where user_id = p_user_id and status <> 'provisioned';
    return jsonb_build_object('status', 'pending', 'reason', 'EMAIL_NOT_VERIFIED');
  end if;

  if registration.status = 'provisioned' then
    return jsonb_build_object(
      'status', 'provisioned',
      'organization_id', registration.organization_id,
      'venue_id', registration.venue_id
    );
  end if;

  if exists (select 1 from public.restaurant_staff where user_id = p_user_id)
     or exists (select 1 from public.organization_memberships where user_id = p_user_id)
     or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    update public.self_service_registrations
    set status = 'excluded', last_error = 'EXISTING_ACCOUNT_ACCESS'
    where user_id = p_user_id;
    return jsonb_build_object('status', 'excluded', 'reason', 'EXISTING_ACCOUNT_ACCESS');
  end if;

  begin
    update public.self_service_registrations
    set status = 'provisioning',
        provisioning_attempts = provisioning_attempts + 1,
        last_error = null
    where user_id = p_user_id;

    case lower(registration.country)
      when 'new zealand', 'nz' then
        timezone_value := 'Pacific/Auckland';
        currency_value := 'NZD';
        timezone_needs_confirmation := false;
        currency_needs_confirmation := false;
      when 'singapore', 'sg' then
        timezone_value := 'Asia/Singapore';
        currency_value := 'SGD';
        timezone_needs_confirmation := false;
        currency_needs_confirmation := false;
      when 'japan', 'jp' then
        timezone_value := 'Asia/Tokyo';
        currency_value := 'JPY';
        timezone_needs_confirmation := false;
        currency_needs_confirmation := false;
      when 'united kingdom', 'uk', 'great britain' then
        timezone_value := 'Europe/London';
        currency_value := 'GBP';
        timezone_needs_confirmation := false;
        currency_needs_confirmation := false;
      when 'ireland', 'ie' then
        timezone_value := 'Europe/Dublin';
        currency_value := 'EUR';
        timezone_needs_confirmation := false;
        currency_needs_confirmation := false;
      when 'australia', 'au' then
        currency_value := 'AUD';
        currency_needs_confirmation := false;
      when 'united states', 'united states of america', 'usa', 'us' then
        currency_value := 'USD';
        currency_needs_confirmation := false;
      when 'canada', 'ca' then
        currency_value := 'CAD';
        currency_needs_confirmation := false;
    end case;

    base_slug := trim(both '-' from regexp_replace(
      lower(unaccent(registration.business_name)), '[^a-z0-9]+', '-', 'g'
    ));
    if base_slug = '' then base_slug := 'organization'; end if;

    loop
      candidate_slug := case when attempt = 0 then base_slug else base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6) end;
      begin
        insert into public.organizations (
          owner_user_id, name, slug, country, default_timezone, default_currency, timezone_confirmation_required
        ) values (
          p_user_id, registration.business_name, candidate_slug, registration.country,
          timezone_value, currency_value, timezone_needs_confirmation
        ) returning id, slug into v_organization_id, organization_slug;
        exit;
      exception when unique_violation then
        attempt := attempt + 1;
        if attempt > 20 then raise exception 'ORGANIZATION_SLUG_GENERATION_FAILED'; end if;
      end;
    end loop;

    insert into public.organization_memberships (organization_id, user_id, role)
    values (v_organization_id, p_user_id, 'owner');

    attempt := 0;
    loop
      candidate_slug := case when attempt = 0 then organization_slug else organization_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6) end;
      begin
        insert into public.restaurants (
          organization_id, owner_user_id, name, slug, timezone, status, is_active, is_open,
          country, currency_code, venue_status, ordering_enabled, timezone_confirmation_required
        ) values (
          v_organization_id, p_user_id, registration.business_name, candidate_slug, timezone_value,
          'onboarding', true, false, registration.country, currency_value,
          'setup_required', false, timezone_needs_confirmation
        ) returning id, slug into v_venue_id, venue_slug;
        exit;
      exception when unique_violation then
        attempt := attempt + 1;
        if attempt > 20 then raise exception 'VENUE_SLUG_GENERATION_FAILED'; end if;
      end;
    end loop;

    insert into public.restaurant_staff (restaurant_id, user_id, role)
    values (v_venue_id, p_user_id, 'owner');

    insert into public.onboarding_progress (
      organization_id, venue_id, user_id, status,
      timezone_confirmation_required, currency_confirmation_required
    ) values (
      v_organization_id, v_venue_id, p_user_id, 'setup_required',
      timezone_needs_confirmation, currency_needs_confirmation
    );

    update public.self_service_registrations
    set status = 'provisioned',
        organization_id = v_organization_id,
        venue_id = v_venue_id,
        provisioned_at = now(),
        last_error = null
    where user_id = p_user_id;

    return jsonb_build_object(
      'status', 'provisioned',
      'organization_id', v_organization_id,
      'organization_slug', organization_slug,
      'venue_id', v_venue_id,
      'venue_slug', venue_slug
    );
  exception when others then
    get stacked diagnostics failure_message = message_text;
    update public.self_service_registrations
    set status = 'failed',
        provisioning_attempts = registration.provisioning_attempts + 1,
        last_error = left(failure_message, 500)
    where user_id = p_user_id;
    return jsonb_build_object('status', 'failed');
  end;
end;
$$;

create or replace function public.provision_self_service_account()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.provision_self_service_account_for_user(auth.uid());
end;
$$;

create or replace function public.trigger_verified_self_service_provisioning()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.provision_self_service_account_for_user(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists provision_verified_self_service_account on auth.users;
create trigger provision_verified_self_service_account
after update of email_confirmed_at on auth.users
for each row execute function public.trigger_verified_self_service_provisioning();

revoke all on function public.provision_self_service_account_for_user(uuid) from public, anon, authenticated;
revoke all on function public.provision_self_service_account() from public, anon;
grant execute on function public.provision_self_service_account() to authenticated;

create or replace function public.try_parse_self_service_timestamp(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function public.try_parse_self_service_timestamp(text) from public, anon, authenticated;

insert into public.self_service_registrations (
  user_id, full_name, business_name, country, terms_accepted_at, privacy_accepted_at
)
select
  u.id,
  left(btrim(u.raw_user_meta_data->>'full_name'), 120),
  left(btrim(u.raw_user_meta_data->>'business_name'), 160),
  left(btrim(u.raw_user_meta_data->>'country'), 100),
  parsed.terms_accepted_at,
  parsed.privacy_accepted_at
from auth.users u
cross join lateral (
  select
    public.try_parse_self_service_timestamp(u.raw_user_meta_data->>'terms_accepted_at') as terms_accepted_at,
    public.try_parse_self_service_timestamp(u.raw_user_meta_data->>'privacy_accepted_at') as privacy_accepted_at
) parsed
where u.raw_user_meta_data->>'registration_type' = 'self_service'
  and btrim(coalesce(u.raw_user_meta_data->>'full_name', '')) <> ''
  and btrim(coalesce(u.raw_user_meta_data->>'business_name', '')) <> ''
  and btrim(coalesce(u.raw_user_meta_data->>'country', '')) <> ''
  and parsed.terms_accepted_at is not null
  and parsed.privacy_accepted_at is not null
on conflict (user_id) do nothing;

do $$
declare registration record;
begin
  for registration in
    select r.user_id from public.self_service_registrations r
    join auth.users u on u.id = r.user_id
    where u.email_confirmed_at is not null and r.status in ('pending', 'failed')
  loop
    perform public.provision_self_service_account_for_user(registration.user_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
