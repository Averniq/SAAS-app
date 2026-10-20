-- Persisted, server-scoped onboarding for provisioned self-service owners.
create table if not exists public.onboarding_step_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.restaurants(id) on delete cascade,
  step_key text not null check (step_key in ('business_details','venue_details','branding','menu','tables','qr_code','test_order','completed')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','skipped')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  completed_at timestamptz, skipped_at timestamptz, last_updated_at timestamptz not null default clock_timestamp(),
  unique (venue_id, step_key)
);
alter table public.onboarding_step_progress enable row level security;
revoke all on table public.onboarding_step_progress from public, anon, authenticated;
alter table public.organizations add column if not exists contact_email text, add column if not exists contact_phone text;

create or replace function public.current_self_service_onboarding_context()
returns public.onboarding_progress language sql security definer set search_path = public, extensions as $$
  select p from public.onboarding_progress p
  join public.organization_memberships om on om.organization_id=p.organization_id and om.user_id=auth.uid() and om.role='owner'
  join public.restaurant_staff rs on rs.restaurant_id=p.venue_id and rs.user_id=auth.uid() and rs.role='owner'
  where p.user_id=auth.uid() limit 1
$$;

create or replace function public.get_current_onboarding()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.onboarding_progress; r public.restaurants; o public.organizations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.current_self_service_onboarding_context();
  if p.id is null then return jsonb_build_object('eligible',false); end if;
  insert into public.onboarding_step_progress (organization_id, venue_id, step_key)
  select p.organization_id, p.venue_id, step_key
  from unnest(array['business_details','venue_details','branding','menu','tables','qr_code','test_order','completed']) step_key
  on conflict (venue_id, step_key) do nothing;
  select * into r from public.restaurants where id=p.venue_id; select * into o from public.organizations where id=p.organization_id;
  return jsonb_build_object('eligible',true,'status',p.status,'organization',jsonb_build_object('name',o.name,'country',o.country,'contact_email',coalesce(o.contact_email,''),'contact_phone',coalesce(o.contact_phone,'')),'venue',jsonb_build_object('name',r.name,'address',r.address,'timezone',r.timezone,'currency_code',r.currency_code,'phone',r.phone,'subtitle',r.subtitle,'logo_url',r.logo_url,'theme_config',r.theme_config),'steps',coalesce((select jsonb_object_agg(step_key,jsonb_build_object('status',status,'details',details,'completed_at',completed_at,'skipped_at',skipped_at,'last_updated_at',last_updated_at)) from public.onboarding_step_progress where venue_id=p.venue_id),'{}'::jsonb));
end $$;

create or replace function public.save_current_onboarding_step(p_step text,p_action text default 'complete',p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.onboarding_progress; optional boolean; next_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_step not in ('business_details','venue_details','branding','menu','tables','qr_code','test_order') then raise exception 'INVALID_ONBOARDING_STEP'; end if;
  select * into p from public.current_self_service_onboarding_context(); if p.id is null then raise exception 'ONBOARDING_ACCESS_DENIED'; end if;
  optional := p_step in ('branding','qr_code','test_order');
  if p_action='skip' and not optional then raise exception 'REQUIRED_STEP_CANNOT_BE_SKIPPED'; end if;
  if p_action not in ('complete','skip','reopen') then raise exception 'INVALID_ONBOARDING_ACTION'; end if;
  if p_step='business_details' and p_action='complete' then update public.organizations set name=left(btrim(coalesce(p_details->>'business_name',name)),160), country=left(btrim(coalesce(p_details->>'country',country)),100), contact_email=left(btrim(coalesce(p_details->>'contact_email',contact_email)),254), contact_phone=left(btrim(coalesce(p_details->>'contact_phone',contact_phone)),40) where id=p.organization_id; end if;
  if p_step='venue_details' and p_action='complete' then update public.restaurants set name=left(btrim(coalesce(p_details->>'venue_name',name)),160), address=left(btrim(coalesce(p_details->>'address',address)),300), timezone=left(btrim(coalesce(p_details->>'timezone',timezone)),80), currency_code=left(upper(btrim(coalesce(p_details->>'currency_code',currency_code))),3), phone=left(btrim(coalesce(p_details->>'phone',phone)),40), tax_id=left(btrim(coalesce(p_details->>'tax_id',tax_id)),80), tax_rate=coalesce(nullif(p_details->>'tax_rate','')::numeric,tax_rate), theme_config=coalesce(theme_config,'{}'::jsonb)||jsonb_build_object('ordering_type',coalesce(p_details->>'ordering_type','table')) where id=p.venue_id; end if;
  if p_step='branding' and p_action='complete' then update public.restaurants set logo_url=left(btrim(coalesce(p_details->>'logo_url',logo_url)),500), subtitle=left(btrim(coalesce(p_details->>'description',subtitle)),250), theme_config=coalesce(theme_config,'{}'::jsonb)||jsonb_build_object('primary_color',coalesce(p_details->>'primary_color','')) where id=p.venue_id; end if;
  next_status := case when p_action='skip' then 'skipped' when p_action='reopen' then 'in_progress' else 'completed' end;
  insert into public.onboarding_step_progress(organization_id,venue_id,step_key,status,details,completed_at,skipped_at,last_updated_at) values(p.organization_id,p.venue_id,p_step,next_status,coalesce(p_details,'{}'::jsonb),case when next_status='completed' then clock_timestamp() end,case when next_status='skipped' then clock_timestamp() end,clock_timestamp()) on conflict(venue_id,step_key) do update set status=excluded.status,details=excluded.details,completed_at=case when excluded.status='completed' then coalesce(onboarding_step_progress.completed_at,excluded.completed_at) else onboarding_step_progress.completed_at end,skipped_at=case when excluded.status='skipped' then coalesce(onboarding_step_progress.skipped_at,excluded.skipped_at) else onboarding_step_progress.skipped_at end,last_updated_at=clock_timestamp();
  update public.onboarding_progress set status='in_progress' where id=p.id and status='setup_required';
  return public.get_current_onboarding();
end $$;

create or replace function public.complete_current_onboarding()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.onboarding_progress;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; select * into p from public.current_self_service_onboarding_context(); if p.id is null then raise exception 'ONBOARDING_ACCESS_DENIED'; end if;
 if exists(select 1 from unnest(array['business_details','venue_details','menu','tables']) s where not exists(select 1 from public.onboarding_step_progress x where x.venue_id=p.venue_id and x.step_key=s and x.status='completed')) then raise exception 'REQUIRED_ONBOARDING_STEPS_INCOMPLETE'; end if;
 update public.onboarding_progress set status='completed' where id=p.id and status<>'completed';
 update public.restaurants set venue_status='active', ordering_enabled=false, is_open=false where id=p.venue_id;
 insert into public.onboarding_step_progress(organization_id,venue_id,step_key,status,completed_at,last_updated_at) values(p.organization_id,p.venue_id,'completed','completed',clock_timestamp(),clock_timestamp()) on conflict(venue_id,step_key) do nothing;
 return public.get_current_onboarding();
end $$;

revoke all on function public.current_self_service_onboarding_context() from public,anon,authenticated;
revoke all on function public.get_current_onboarding() from public,anon;
revoke all on function public.save_current_onboarding_step(text,text,jsonb) from public,anon;
revoke all on function public.complete_current_onboarding() from public,anon;
grant execute on function public.get_current_onboarding() to authenticated;
grant execute on function public.save_current_onboarding_step(text,text,jsonb) to authenticated;
grant execute on function public.complete_current_onboarding() to authenticated;
notify pgrst,'reload schema';
