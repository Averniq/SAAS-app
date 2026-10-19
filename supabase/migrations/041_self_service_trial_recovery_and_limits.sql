-- Make self-service provisioning retry-safe and align the default Trial offer.
-- Existing non-self-service plans and manually adjusted trials are left intact.
begin;

update public.plan_definitions
set trial_duration_days = 90,
    limits = '{"max_organizations":1,"max_venues":1,"max_tables":5,"max_menu_items":10,"max_staff_accounts":1}'::jsonb
where plan_code = 'trial';

-- Only extend the original, untouched 14-day self-service entitlement.  The
-- exact original duration is the marker that protects manual trial overrides.
-- Existing entitlements have no immutable source/audit marker, so they cannot
-- be distinguished safely from a manually set 14-day date. Leave them intact.
-- New provisioning below records the source explicitly.
alter table public.organization_entitlements
  add column if not exists self_service_default_trial boolean not null default false;

create or replace function public.assert_restaurant_entitlement_limit(
  p_restaurant_id uuid,
  p_resource text
)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare target_organization_id uuid; entitlement public.organization_entitlements; plan public.plan_definitions;
  effective_status text; maximum integer; current_usage integer;
begin
  select organization_id into target_organization_id from public.restaurants where id = p_restaurant_id;
  if target_organization_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));
  select * into entitlement from public.organization_entitlements where organization_id = target_organization_id;
  if entitlement.id is null then return; end if;
  effective_status := public.organization_entitlement_effective_status(target_organization_id);
  if effective_status not in ('trial', 'active') then raise exception 'ENTITLEMENT_NOT_ACTIVE'; end if;
  select * into plan from public.plan_definitions where plan_code = entitlement.plan_code;
  maximum := nullif(plan.limits->>('max_' || p_resource), '')::integer;
  if maximum is null then return; end if;
  case p_resource
    when 'tables' then select count(*) into current_usage from public.tables where restaurant_id = p_restaurant_id;
    when 'menu_items' then select count(*) into current_usage from public.menu_items where restaurant_id = p_restaurant_id;
    -- Owners are tenant principals, not counted staff accounts.
    when 'staff_accounts' then select count(*) into current_usage from public.restaurant_staff where restaurant_id = p_restaurant_id and role <> 'owner';
    else raise exception 'UNKNOWN_ENTITLEMENT_RESOURCE';
  end case;
  if current_usage >= maximum then
    raise exception using errcode = 'P0001', message = 'TRIAL_LIMIT_REACHED',
      detail = jsonb_build_object('resource', p_resource, 'limit', maximum, 'plan', entitlement.plan_code)::text;
  end if;
end;
$$;

create or replace function public.assert_organization_venue_limit(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare entitlement public.organization_entitlements; plan public.plan_definitions; effective_status text; maximum integer; current_usage integer;
begin
  if p_organization_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  select * into entitlement from public.organization_entitlements where organization_id=p_organization_id;
  if entitlement.id is null then return; end if;
  effective_status:=public.organization_entitlement_effective_status(p_organization_id);
  if effective_status not in ('trial','active') then raise exception 'ENTITLEMENT_NOT_ACTIVE'; end if;
  select * into plan from public.plan_definitions where plan_code=entitlement.plan_code;
  maximum:=nullif(plan.limits->>'max_venues','')::integer;
  if maximum is null then return; end if;
  select count(*) into current_usage from public.restaurants where organization_id=p_organization_id;
  if current_usage>=maximum then raise exception using errcode='P0001', message='TRIAL_LIMIT_REACHED', detail=jsonb_build_object('resource','venues','limit',maximum,'plan',entitlement.plan_code)::text; end if;
end;
$$;

create or replace function public.enforce_restaurant_entitlement_limits()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_table_name = 'restaurants' then
    if new.organization_id is not null then
      if tg_op = 'UPDATE' and auth.uid() is not null and new.organization_id is distinct from old.organization_id
         and not public.is_platform_admin()
         and not exists (select 1 from public.organization_memberships where organization_id=new.organization_id and user_id=auth.uid() and role='owner') then
        raise exception 'ORGANIZATION_ACCESS_DENIED';
      end if;
      if tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id then
        perform public.assert_organization_venue_limit(new.organization_id);
      end if;
    elsif auth.uid() is not null and exists (
      select 1 from public.self_service_registrations r
      where r.user_id = auth.uid() and r.status = 'provisioned'
    ) then
      -- A self-service Owner cannot create an unlinked second venue through a
      -- legacy RPC and thereby evade the organisation plan limit.
      raise exception using errcode = 'P0001', message = 'TRIAL_LIMIT_REACHED',
        detail = '{"resource":"venues","limit":1,"plan":"trial"}';
    end if;
  elsif tg_table_name = 'tables' and (tg_op = 'INSERT' or new.restaurant_id is distinct from old.restaurant_id) then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'tables');
  elsif tg_table_name = 'menu_items' and (tg_op = 'INSERT' or new.restaurant_id is distinct from old.restaurant_id) then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'menu_items');
  elsif tg_table_name = 'restaurant_staff' and new.role <> 'owner' and (tg_op = 'INSERT' or new.restaurant_id is distinct from old.restaurant_id or new.role is distinct from old.role) then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'staff_accounts');
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_restaurant_entitlement_limit_on_venues_update on public.restaurants;
create trigger enforce_restaurant_entitlement_limit_on_venues_update before update of organization_id on public.restaurants for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_tables_update on public.tables;
create trigger enforce_restaurant_entitlement_limit_on_tables_update before update of restaurant_id on public.tables for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_menu_items_update on public.menu_items;
create trigger enforce_restaurant_entitlement_limit_on_menu_items_update before update of restaurant_id on public.menu_items for each row execute function public.enforce_restaurant_entitlement_limits();
drop trigger if exists enforce_restaurant_entitlement_limit_on_staff_update on public.restaurant_staff;
create trigger enforce_restaurant_entitlement_limit_on_staff_update before update of restaurant_id, role on public.restaurant_staff for each row execute function public.enforce_restaurant_entitlement_limits();

create or replace function public.provision_self_service_account_for_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare registration public.self_service_registrations; account auth.users; v_organization public.organizations;
  v_venue public.restaurants; timezone_value text := 'UTC'; currency_value text;
  timezone_needs_confirmation boolean := true; currency_needs_confirmation boolean := true;
  base_slug text; candidate_slug text; attempt integer := 0; failure_message text;
begin
  select * into registration from public.self_service_registrations where user_id = p_user_id for update;
  if registration.user_id is null then return jsonb_build_object('status', 'excluded', 'reason', 'NOT_SELF_SERVICE'); end if;
  select * into account from auth.users where id = p_user_id;
  if account.id is null or account.email_confirmed_at is null then
    update public.self_service_registrations set status = 'pending', last_error = null where user_id = p_user_id and status <> 'provisioned';
    return jsonb_build_object('status', 'pending', 'reason', 'EMAIL_NOT_VERIFIED');
  end if;
  if exists (select 1 from public.platform_admins where user_id = p_user_id)
     or exists (select 1 from public.restaurant_staff where user_id=p_user_id and restaurant_id is distinct from registration.venue_id)
     or exists (select 1 from public.organization_memberships where user_id=p_user_id and organization_id is distinct from registration.organization_id)
     or (registration.organization_id is null and exists (select 1 from public.organizations where owner_user_id=p_user_id)) then
    update public.self_service_registrations set status = 'excluded', last_error = 'EXISTING_ACCOUNT_ACCESS' where user_id = p_user_id;
    return jsonb_build_object('status', 'excluded', 'reason', 'EXISTING_ACCOUNT_ACCESS');
  end if;
  begin
    update public.self_service_registrations set status='provisioning', provisioning_attempts=provisioning_attempts+1, last_error=null where user_id=p_user_id;
    case lower(registration.country)
      when 'new zealand', 'nz' then timezone_value := 'Pacific/Auckland'; currency_value := 'NZD'; timezone_needs_confirmation := false; currency_needs_confirmation := false;
      when 'singapore', 'sg' then timezone_value := 'Asia/Singapore'; currency_value := 'SGD'; timezone_needs_confirmation := false; currency_needs_confirmation := false;
      when 'japan', 'jp' then timezone_value := 'Asia/Tokyo'; currency_value := 'JPY'; timezone_needs_confirmation := false; currency_needs_confirmation := false;
      when 'united kingdom', 'uk', 'great britain' then timezone_value := 'Europe/London'; currency_value := 'GBP'; timezone_needs_confirmation := false; currency_needs_confirmation := false;
      when 'ireland', 'ie' then timezone_value := 'Europe/Dublin'; currency_value := 'EUR'; timezone_needs_confirmation := false; currency_needs_confirmation := false;
      when 'australia', 'au' then currency_value := 'AUD'; currency_needs_confirmation := false;
      when 'united states', 'united states of america', 'usa', 'us' then currency_value := 'USD'; currency_needs_confirmation := false;
      when 'canada', 'ca' then currency_value := 'CAD'; currency_needs_confirmation := false;
    end case;
    select * into v_organization from public.organizations where id=registration.organization_id and owner_user_id=p_user_id limit 1 for update;
    if v_organization.id is null then
      base_slug := trim(both '-' from regexp_replace(lower(unaccent(registration.business_name)), '[^a-z0-9]+', '-', 'g'));
      if base_slug = '' then base_slug := 'organization'; end if;
      loop
        candidate_slug := case when attempt=0 then base_slug else base_slug || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6) end;
        begin
          insert into public.organizations(owner_user_id,name,slug,country,default_timezone,default_currency,timezone_confirmation_required)
          values(p_user_id,registration.business_name,candidate_slug,registration.country,timezone_value,currency_value,timezone_needs_confirmation)
          returning * into v_organization; exit;
        exception when unique_violation then attempt:=attempt+1; if attempt>20 then raise exception 'ORGANIZATION_SLUG_GENERATION_FAILED'; end if; end;
      end loop;
    end if;
    insert into public.organization_memberships(organization_id,user_id,role) values(v_organization.id,p_user_id,'owner') on conflict (organization_id,user_id) do nothing;
    insert into public.organization_entitlements(organization_id,plan_code,status,starts_at,ends_at,self_service_default_trial)
    select v_organization.id,'trial','trial',clock_timestamp(),clock_timestamp()+make_interval(days=>trial_duration_days),true
    from public.plan_definitions where plan_code='trial' and enabled on conflict (organization_id) do nothing;
    if not exists(select 1 from public.organization_entitlements where organization_id=v_organization.id) then raise exception 'TRIAL_PLAN_CONFIGURATION_MISSING'; end if;
    update public.organization_entitlements set self_service_default_trial=true where organization_id=v_organization.id and status='trial';
    select * into v_venue from public.restaurants where id=registration.venue_id or (registration.venue_id is null and organization_id=v_organization.id) limit 1 for update;
    if v_venue.id is null then
      attempt:=0; loop
        candidate_slug := case when attempt=0 then v_organization.slug else v_organization.slug || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6) end;
        begin
          insert into public.restaurants(organization_id,owner_user_id,name,slug,timezone,status,is_active,is_open,country,currency_code,venue_status,ordering_enabled,timezone_confirmation_required)
          values(v_organization.id,p_user_id,registration.business_name,candidate_slug,timezone_value,'onboarding',true,false,registration.country,currency_value,'setup_required',false,timezone_needs_confirmation)
          returning * into v_venue; exit;
        exception when unique_violation then attempt:=attempt+1; if attempt>20 then raise exception 'VENUE_SLUG_GENERATION_FAILED'; end if; end;
      end loop;
    end if;
    insert into public.restaurant_staff(restaurant_id,user_id,role) values(v_venue.id,p_user_id,'owner') on conflict (restaurant_id,user_id) do nothing;
    insert into public.onboarding_progress(organization_id,venue_id,user_id,status,timezone_confirmation_required,currency_confirmation_required)
    values(v_organization.id,v_venue.id,p_user_id,'setup_required',timezone_needs_confirmation,currency_needs_confirmation)
    on conflict (venue_id) do nothing;
    update public.self_service_registrations set status='provisioned',organization_id=v_organization.id,venue_id=v_venue.id,provisioned_at=coalesce(provisioned_at,clock_timestamp()),last_error=null where user_id=p_user_id;
    return jsonb_build_object('status','provisioned','organization_id',v_organization.id,'organization_slug',v_organization.slug,'venue_id',v_venue.id,'venue_slug',v_venue.slug);
  exception when others then
    get stacked diagnostics failure_message = message_text;
    update public.self_service_registrations set status='failed', provisioning_attempts=registration.provisioning_attempts+1, last_error=left(failure_message,500) where user_id=p_user_id;
    return jsonb_build_object('status','failed','reason','PROVISIONING_RETRY_FAILED');
  end;
end;
$$;

revoke all on function public.assert_restaurant_entitlement_limit(uuid,text), public.enforce_restaurant_entitlement_limits(), public.provision_self_service_account_for_user(uuid) from public, anon, authenticated;
grant execute on function public.provision_self_service_account() to authenticated;
commit;
notify pgrst, 'reload schema';
