-- Unapplied cutover candidate. This claim governs only the initial transition;
-- normal owner invitation workflows may still add additional owners afterward.
create table public.initial_owner_bootstrap_claims (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  claimed_at timestamptz not null default now()
);
alter table public.initial_owner_bootstrap_claims enable row level security;
revoke all privileges on public.initial_owner_bootstrap_claims from public, anon, authenticated, service_role;

create or replace function public.claim_initial_restaurant_owner(p_restaurant_id uuid, p_user_id uuid, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim_user_id uuid;
  v_member_role text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'INITIAL_OWNER_SERVICE_ROLE_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('initial-owner:' || p_restaurant_id::text, 0));
  perform 1 from public.restaurants where id=p_restaurant_id for update;
  if not found then raise exception 'INITIAL_OWNER_RESTAURANT_NOT_FOUND'; end if;
  perform 1 from auth.users where id=p_user_id;
  if not found then raise exception 'INITIAL_OWNER_USER_NOT_FOUND'; end if;
  if exists(select 1 from public.platform_admins where user_id=p_user_id) then raise exception 'PLATFORM_ADMIN_CONFLICT'; end if;
  select user_id into v_claim_user_id from public.initial_owner_bootstrap_claims where restaurant_id=p_restaurant_id;
  if v_claim_user_id is not null then raise exception 'INITIAL_OWNER_ALREADY_BOUND'; end if;
  select role into v_member_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=p_user_id;
  if exists(select 1 from public.restaurant_staff where restaurant_id=p_restaurant_id and role='owner')
    or exists(select 1 from public.restaurants where id=p_restaurant_id and owner_user_id is not null)
  then raise exception 'INITIAL_OWNER_ALREADY_BOUND'; end if;
  if v_member_role is not null then raise exception 'INITIAL_OWNER_MEMBERSHIP_CONFLICT'; end if;
  if p_dry_run then return pg_catalog.jsonb_build_object('action','would_bind_owner'); end if;
  insert into public.initial_owner_bootstrap_claims(restaurant_id,user_id) values(p_restaurant_id,p_user_id);
  insert into public.restaurant_staff(restaurant_id,user_id,role) values(p_restaurant_id,p_user_id,'owner');
  update public.restaurants set owner_user_id=p_user_id where id=p_restaurant_id;
  return pg_catalog.jsonb_build_object('action','owner_bound');
end;
$$;
revoke all on function public.claim_initial_restaurant_owner(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_initial_restaurant_owner(uuid,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
