-- Staff Management MVP. Additive, LOCAL REVIEW CANDIDATE; never auto-apply to hosted projects.
-- Atomic ACL boundary: a failed migration must expose neither new RPCs nor partial suspension rules.
begin;
alter table public.restaurant_staff
 add column display_name text not null default '',
 add column is_active boolean not null default true,
 add column version bigint not null default 1 check(version>0),
 add column updated_at timestamptz not null default now();
alter table public.restaurant_staff add constraint staff_display_name_length check(length(display_name)<=100);
alter table public.restaurant_invites add column display_name text not null default '',
 add column request_id uuid, add column last_requested_at timestamptz not null default now();
create unique index staff_invite_request_id on public.restaurant_invites(restaurant_id,request_id) where request_id is not null;
create index staff_invite_email_history on public.restaurant_invites(restaurant_id,lower(email),last_requested_at desc);
create table public.staff_management_audit (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 actor_user_id uuid not null references auth.users(id), membership_id uuid references public.restaurant_staff(id),
 invite_id uuid references public.restaurant_invites(id), action text not null,
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
alter table public.staff_management_audit enable row level security;
revoke all on public.staff_management_audit from public,anon,authenticated;
grant select on public.staff_management_audit to authenticated;
create policy "active owners read staff audit" on public.staff_management_audit for select to authenticated
 using(public.has_restaurant_role(restaurant_id,array['owner']));
-- Explicitly preserve RPC-only membership mutations, even if old owner policies exist.
revoke insert,update,delete on public.restaurant_staff from anon,authenticated;

create or replace function public.is_restaurant_staff(target_restaurant uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.restaurant_staff where restaurant_id=target_restaurant and user_id=auth.uid() and is_active);
$$;
create or replace function public.has_restaurant_role(target_restaurant uuid,allowed_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.restaurant_staff where restaurant_id=target_restaurant and user_id=auth.uid() and is_active and role=any(allowed_roles));
$$;
create or replace function public.can_manage_restaurant_staff(target_restaurant uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_platform_admin() or public.has_restaurant_role(target_restaurant,array['owner','manager']));
$$;
-- All staff/invite writes lock the same tenant before reading actor/target state.
-- This serializes accept/revoke/invite/edit and prevents stale invite role restoration.
create or replace function public.update_restaurant_staff(p_restaurant_id uuid,p_membership_id uuid,p_display_name text,p_role text,p_is_active boolean,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.restaurant_staff; target public.restaurant_staff; prior jsonb; result jsonb; target_email text; v_name text:=btrim(p_display_name,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_restaurant_id::text,4715));
 select * into actor from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid() for update;
 if actor.id is null or not actor.is_active or actor.role<>'owner' then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 select * into target from public.restaurant_staff where id=p_membership_id and restaurant_id=p_restaurant_id for update;
 if target.id is null or target.role='owner' or target.user_id=auth.uid() then raise exception 'STAFF_TARGET_NOT_EDITABLE'; end if;
 if p_display_name is null or length(v_name) not between 1 and 100 then raise exception 'INVALID_DISPLAY_NAME'; end if;
 if p_role is null or p_role not in ('manager','staff','kitchen','cashier') or p_is_active is null then raise exception 'INVALID_STAFF_ROLE'; end if;
 if p_expected_version is null or target.version<>p_expected_version then raise exception 'STAFF_VERSION_CONFLICT'; end if;
 prior:=jsonb_build_object('display_name',target.display_name,'role',target.role,'is_active',target.is_active,'version',target.version);
 if target.role<>p_role or target.is_active<>p_is_active then
  select lower(email) into target_email from auth.users where id=target.user_id;
  update public.restaurant_invites set status='revoked' where restaurant_id=p_restaurant_id and (lower(email)=target_email or invited_by=target.user_id) and status='pending';
 end if;
 update public.restaurant_staff set display_name=v_name,role=p_role,is_active=p_is_active,version=version+1,updated_at=clock_timestamp() where id=target.id returning * into target;
 result:=jsonb_build_object('id',target.id,'restaurant_id',target.restaurant_id,'user_id',target.user_id,'display_name',target.display_name,'role',target.role,'is_active',target.is_active,'version',target.version);
 insert into public.staff_management_audit(restaurant_id,actor_user_id,membership_id,action,before_state,after_state)
 values(p_restaurant_id,auth.uid(),target.id,'membership_updated',prior,result-'id'-'restaurant_id'-'user_id');
 return result;
end $$;

-- Internal implementation is not exposed to clients, including service_role.
create schema if not exists staff_private;
revoke all on schema staff_private from public,anon,authenticated;
create or replace function staff_private.reserve_invitation(p_restaurant_id uuid,p_email text,p_role text,p_display_name text,p_request_id uuid,p_allow_owner boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.restaurant_invites; actor public.restaurant_staff; v_email text:=lower(trim(coalesce(p_email,''))); existing public.restaurant_staff; previous public.restaurant_invites; result jsonb; v_name text:=btrim(p_display_name,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_restaurant_id::text,4715));
 select * into actor from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid() for update;
 if not public.is_platform_admin() and (actor.id is null or not actor.is_active or actor.role not in ('owner','manager')) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email)>254 then raise exception 'INVALID_EMAIL'; end if;
 if p_role is null or p_role not in ('owner','manager','staff','kitchen','cashier') then raise exception 'INVALID_STAFF_ROLE'; end if;
 if p_role='owner' and (not p_allow_owner or (not public.is_platform_admin() and actor.role is distinct from 'owner')) then raise exception 'ONLY_OWNER_CAN_INVITE_OWNER'; end if;
 if p_display_name is null or length(v_name) not between 1 and 100 or p_request_id is null then raise exception 'INVALID_INVITATION_REQUEST'; end if;
 select * into v from public.restaurant_invites where restaurant_id=p_restaurant_id and request_id=p_request_id;
 if v.id is not null then
  if v.invited_by<>auth.uid() or v.email<>v_email or v.role<>p_role or v.display_name<>v_name then raise exception 'INVITATION_REQUEST_ID_REUSED'; end if;
  -- A reservation is never redelivered by retrying a request id, even after transport failure.
  return jsonb_build_object('id',v.id,'token',v.token,'email',v.email,'role',v.role,'display_name',v.display_name,'expires_at',v.expires_at,'delivery_required',false);
 end if;
 select rs.* into existing from public.restaurant_staff rs join auth.users u on u.id=rs.user_id
 where rs.restaurant_id=p_restaurant_id and lower(u.email)=v_email for update of rs;
 if existing.id is not null then raise exception 'STAFF_MEMBERSHIP_ALREADY_EXISTS'; end if;
 select * into previous from public.restaurant_invites where restaurant_id=p_restaurant_id and lower(restaurant_invites.email)=v_email order by last_requested_at desc limit 1;
 if previous.id is not null and previous.last_requested_at>clock_timestamp()-interval '60 seconds' then raise exception 'INVITATION_COOLDOWN'; end if;
 update public.restaurant_invites set status='revoked' where restaurant_id=p_restaurant_id and lower(restaurant_invites.email)=v_email and status='pending';
 insert into public.restaurant_invites(restaurant_id,email,role,display_name,invited_by,request_id,last_requested_at)
 values(p_restaurant_id,v_email,p_role,v_name,auth.uid(),p_request_id,clock_timestamp()) returning * into v;
 insert into public.staff_management_audit(restaurant_id,actor_user_id,invite_id,action,after_state)
 values(p_restaurant_id,auth.uid(),v.id,'invitation_reserved',jsonb_build_object('role',v.role,'display_name',v.display_name));
 return jsonb_build_object('id',v.id,'token',v.token,'email',v.email,'role',v.role,'display_name',v.display_name,'expires_at',v.expires_at,'delivery_required',true);
end $$;
revoke all on function staff_private.reserve_invitation(uuid,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
create or replace function public.create_staff_invitation(p_restaurant_id uuid,p_email text,p_role text,p_display_name text,p_request_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select staff_private.reserve_invitation(p_restaurant_id,p_email,p_role,p_display_name,p_request_id,false);
$$;
create or replace function public.create_restaurant_invite(p_restaurant_id uuid,p_email text,p_role text)
returns jsonb language sql security definer set search_path='' as $$
 select staff_private.reserve_invitation(p_restaurant_id,p_email,p_role,split_part(trim(p_email),'@',1),gen_random_uuid(),true);
$$;
create or replace function public.accept_restaurant_invite(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.restaurant_invites; member public.restaurant_staff; account_email text; tenant uuid; restaurant public.restaurants;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 -- Identify tenant first; do not lock invite ahead of the shared tenant lock.
 select restaurant_id into tenant from public.restaurant_invites where token=p_token;
 if tenant is null then raise exception 'INVITE_NOT_FOUND'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,4715));
 select * into v from public.restaurant_invites where token=p_token for update;
 if v.id is null or v.status<>'pending' then raise exception 'INVITE_NOT_FOUND'; end if;
 if v.expires_at<=clock_timestamp() then raise exception 'INVITE_EXPIRED'; end if;
 -- A suspended/demoted inviter cannot leave outstanding authority behind.
 if not exists(select 1 from public.platform_admins where user_id=v.invited_by) and not exists(select 1 from public.restaurant_staff where restaurant_id=tenant and user_id=v.invited_by and is_active and (role='owner' or (role='manager' and v.role<>'owner'))) then raise exception 'INVITE_AUTHORITY_REVOKED'; end if;
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null or lower(v.email)<>account_email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
 select * into member from public.restaurant_staff where restaurant_id=tenant and user_id=auth.uid() for update;
 if member.id is not null and not member.is_active then raise exception 'STAFF_ACCESS_DISABLED'; end if;
 if member.id is null then
  insert into public.restaurant_staff(restaurant_id,user_id,role,display_name) values(tenant,auth.uid(),v.role,v.display_name) returning * into member;
  if v.role='owner' then update public.restaurants set owner_user_id=auth.uid() where id=tenant; end if;
 end if;
 -- Existing memberships are never overwritten or reactivated, even by legacy owner invites.
 update public.restaurant_invites set status='accepted',accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=v.id;
 insert into public.staff_management_audit(restaurant_id,actor_user_id,membership_id,invite_id,action,after_state)
 values(tenant,auth.uid(),member.id,v.id,'invitation_accepted',jsonb_build_object('role',member.role,'is_active',member.is_active));
 select * into restaurant from public.restaurants where id=tenant;
 return jsonb_build_object('restaurant_id',tenant,'restaurant_slug',restaurant.slug,'restaurant_name',restaurant.name,'role',member.role);
end $$;
create or replace function public.revoke_restaurant_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 select restaurant_id into tenant from public.restaurant_invites where id=p_invite_id;
 if tenant is null then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,4715));
 perform 1 from public.restaurant_staff where restaurant_id=tenant and user_id=auth.uid() for update;
 if auth.uid() is null or not public.can_manage_restaurant_staff(tenant) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 update public.restaurant_invites set status='revoked' where id=p_invite_id and status='pending';
 if not found then return false; end if;
 insert into public.staff_management_audit(restaurant_id,actor_user_id,invite_id,action) values(tenant,auth.uid(),p_invite_id,'invitation_revoked');
 return true;
end $$;
create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 return jsonb_build_object('staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'user_id',s.user_id,'email',coalesce(u.email,''),'display_name',s.display_name,'role',s.role,'is_active',s.is_active,'version',s.version,'created_at',s.created_at,'is_current',s.user_id=auth.uid()) order by s.created_at,s.id) from public.restaurant_staff s left join auth.users u on u.id=s.user_id where s.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'token',i.token,'email',i.email,'role',i.role,'display_name',i.display_name,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc) from public.restaurant_invites i where i.restaurant_id=p_restaurant_id and i.status='pending' and i.expires_at>clock_timestamp()),'[]'::jsonb));
end $$;
revoke all on function public.update_restaurant_staff(uuid,uuid,text,text,boolean,bigint),public.create_staff_invitation(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_restaurant_staff(uuid,uuid,text,text,boolean,bigint),public.create_staff_invitation(uuid,text,text,text,uuid) to authenticated;
-- Existing entry-point ACLs are retained by CREATE OR REPLACE; new helpers are private.

-- Re-declare existing direct-role consumers with active membership checks.
create or replace function public.update_restaurant_order_status(
  p_restaurant_id uuid, p_order_id uuid, p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
  current_order public.orders;
  target_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff
  where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active;
  if target_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  select * into current_order from public.orders
  where id = p_order_id and restaurant_id = p_restaurant_id
  for update;
  if current_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_action not in ('Preparing','Ready','Served','Cancelled') then
    raise exception 'INVALID_KITCHEN_ACTION';
  end if;
  if p_action in ('Preparing','Ready','Served') and target_role not in ('owner','manager','staff','kitchen') then
    raise exception 'KITCHEN_ROLE_REQUIRED';
  end if;
  if p_action = 'Cancelled' and target_role not in ('owner','manager') then
    raise exception 'CANCELLATION_ROLE_REQUIRED';
  end if;
  if p_action = 'Cancelled' and current_order.paid_at is not null then
    raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED';
  end if;
  target_status := case
    when current_order.status = 'new' and p_action = 'Preparing' then 'preparing'
    when current_order.status = 'preparing' and p_action = 'Ready' then 'ready'
    when current_order.status = 'ready' and p_action = 'Served' then 'completed'
    when current_order.status in ('new','preparing') and p_action = 'Cancelled' then 'cancelled'
    else null
  end;
  if target_status is null then raise exception 'INVALID_KITCHEN_TRANSITION'; end if;
  update public.orders
  set status = target_status,
      served_at = case when target_status = 'completed' then now() else served_at end,
      closed_at = case when target_status = 'cancelled' then now() else closed_at end,
      updated_at = now()
  where id = current_order.id
  returning * into current_order;
  return jsonb_build_object(
    'id', current_order.id, 'restaurant_id', current_order.restaurant_id,
    'status', current_order.status, 'served_at', current_order.served_at,
    'closed_at', current_order.closed_at, 'updated_at', current_order.updated_at
  );
end;
$$;
create or replace function public.record_authoritative_payment(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_amount_cents integer,
  p_method text,
  p_reference text default '',
  p_note text default '',
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_role text;
  v_order public.orders;
  v_existing public.payment_operations;
  v_total_cents integer;
  v_paid_cents integer;
  v_fingerprint text;
  v_result jsonb;
  v_operation_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff
    where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active;
  if v_role is null or v_role not in ('owner','manager','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('Cash','Card','EFTPOS','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if length(coalesce(p_reference,'')) > 80 or length(coalesce(p_note,'')) > 200 then raise exception 'PAYMENT_METADATA_TOO_LONG'; end if;
  if p_method = 'Other' and trim(coalesce(p_note,'')) = '' then raise exception 'OTHER_PAYMENT_NOTE_REQUIRED'; end if;

  v_fingerprint := encode(digest(jsonb_build_object(
    'restaurant_id',p_restaurant_id,'order_id',p_order_id,'amount_cents',p_amount_cents,
    'method',p_method,'reference',trim(coalesce(p_reference,'')),'note',trim(coalesce(p_note,''))
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.payment_operations
    where restaurant_id = p_restaurant_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint is distinct from v_fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return v_existing.result_snapshot || jsonb_build_object('idempotent_replay',true);
  end if;

  select * into v_order from public.orders
    where id = p_order_id and restaurant_id = p_restaurant_id for update;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'cancelled' then raise exception 'PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER'; end if;
  v_total_cents := round(v_order.total * 100)::integer;
  if v_total_cents <= 0 then raise exception 'ORDER_NOT_PAYABLE'; end if;
  select coalesce(sum(amount_cents),0) into v_paid_cents from public.payment_operations
    where restaurant_id = p_restaurant_id and order_id = p_order_id;
  if p_amount_cents > v_total_cents - v_paid_cents then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;

  v_paid_cents := v_paid_cents + p_amount_cents;
  v_operation_id := gen_random_uuid();
  v_result := jsonb_build_object(
    'payment_id',v_operation_id,'amount_cents',p_amount_cents,'paid_cents',v_paid_cents,
    'remaining_cents',v_total_cents-v_paid_cents,
    'payment_status',case when v_paid_cents = v_total_cents then 'paid' when v_paid_cents > 0 then 'partial' else 'unpaid' end,
    'idempotent_replay',false
  );
  insert into public.payment_operations(id,restaurant_id,order_id,amount_cents,payment_method,payment_reference,note,idempotency_key,payload_fingerprint,recorded_by,result_snapshot)
  values(v_operation_id,p_restaurant_id,p_order_id,p_amount_cents,p_method,trim(coalesce(p_reference,'')),trim(coalesce(p_note,'')),p_idempotency_key,v_fingerprint,auth.uid(),v_result);
  update public.orders
  set paid_at = case when v_paid_cents = v_total_cents then coalesce(paid_at, now()) else null end,
      payment_method = case when v_paid_cents = v_total_cents then p_method else payment_method end,
      closed_at = case when v_paid_cents = v_total_cents then coalesce(closed_at, now()) else closed_at end,
      updated_at = now()
  where id = p_order_id and restaurant_id = p_restaurant_id;
  return v_result;
end;
$$;
create or replace function public.list_authoritative_payment_operations(p_restaurant_id uuid, p_order_id uuid default null)
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active;
  if v_role is null or v_role not in ('owner','manager','cashier') then raise exception 'FINANCIAL_READ_ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',po.id,'order_id',po.order_id,'amount_cents',po.amount_cents,'payment_method',po.payment_method,
    'payment_reference',po.payment_reference,'note',po.note,'recorded_at',po.recorded_at,'recorded_by',po.recorded_by
  ) order by po.recorded_at desc, po.id desc)
  from (select * from public.payment_operations where restaurant_id = p_restaurant_id and (p_order_id is null or order_id = p_order_id)
        order by recorded_at desc, id desc limit 1000) po), '[]'::jsonb);
end;
$$;

commit;
notify pgrst, 'reload schema';
