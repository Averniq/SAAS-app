-- Append-only correction: invitation bearer material is available only to the trusted
-- delivery transport. No hosted application or migration is performed by this file.
begin;
create or replace function staff_private.reserve_invitation_for_actor(p_actor_user_id uuid,p_restaurant_id uuid,p_email text,p_role text,p_display_name text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.restaurant_invites; actor public.restaurant_staff; v_email text:=lower(trim(coalesce(p_email,''))); existing public.restaurant_staff; previous public.restaurant_invites; result jsonb; v_name text:=btrim(p_display_name,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
 if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_restaurant_id::text,4715));
 select * into actor from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=p_actor_user_id for update;
 if not exists(select 1 from public.platform_admins where user_id=p_actor_user_id) and (actor.id is null or not actor.is_active or actor.role not in ('owner','manager')) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email)>254 then raise exception 'INVALID_EMAIL'; end if;
 if p_role is null or p_role not in ('manager','staff','kitchen','cashier') then raise exception 'INVALID_STAFF_ROLE'; end if;
 if p_display_name is null or length(v_name) not between 1 and 100 or p_request_id is null then raise exception 'INVALID_INVITATION_REQUEST'; end if;
 select * into v from public.restaurant_invites where restaurant_id=p_restaurant_id and request_id=p_request_id;
 if v.id is not null then
  if v.invited_by<>p_actor_user_id or v.email<>v_email or v.role<>p_role or v.display_name<>v_name then raise exception 'INVITATION_REQUEST_ID_REUSED'; end if;
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
 values(p_restaurant_id,v_email,p_role,v_name,p_actor_user_id,p_request_id,clock_timestamp()) returning * into v;
 insert into public.staff_management_audit(restaurant_id,actor_user_id,invite_id,action,after_state)
 values(p_restaurant_id,p_actor_user_id,v.id,'invitation_reserved',jsonb_build_object('role',v.role,'display_name',v.display_name));
 return jsonb_build_object('id',v.id,'token',v.token,'email',v.email,'role',v.role,'display_name',v.display_name,'expires_at',v.expires_at,'delivery_required',true);
end $$;
revoke all on function staff_private.reserve_invitation_for_actor(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.reserve_staff_invitation_for_delivery(p_actor_user_id uuid,p_restaurant_id uuid,p_email text,p_role text,p_display_name text,p_request_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select staff_private.reserve_invitation_for_actor(p_actor_user_id,p_restaurant_id,p_email,p_role,p_display_name,p_request_id);
$$;
revoke all on function public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_staff_invitation_for_delivery(uuid,uuid,text,text,text,uuid) to service_role;
-- Fail closed even for accidental future grants to these retired entry points.
create or replace function public.create_staff_invitation(p_restaurant_id uuid,p_email text,p_role text,p_display_name text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'STAFF_INVITATION_TRANSPORT_REQUIRED'; end $$;
create or replace function public.create_restaurant_invite(p_restaurant_id uuid,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'STAFF_INVITATION_TRANSPORT_REQUIRED'; end $$;
revoke all on function public.create_staff_invitation(uuid,text,text,text,uuid),public.create_restaurant_invite(uuid,text,text),staff_private.reserve_invitation(uuid,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
drop function staff_private.reserve_invitation(uuid,text,text,text,uuid,boolean);
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
 if v.role is null or v.role not in ('manager','staff','kitchen','cashier') then raise exception 'INVALID_STAFF_ROLE'; end if;
 if v.expires_at<=clock_timestamp() then raise exception 'INVITE_EXPIRED'; end if;
 -- A suspended/demoted inviter cannot leave outstanding authority behind.
 if not exists(select 1 from public.platform_admins where user_id=v.invited_by) and not exists(select 1 from public.restaurant_staff where restaurant_id=tenant and user_id=v.invited_by and is_active and (role='owner' or (role='manager' and v.role<>'owner'))) then raise exception 'INVITE_AUTHORITY_REVOKED'; end if;
 select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null or lower(v.email)<>account_email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
 select * into member from public.restaurant_staff where restaurant_id=tenant and user_id=auth.uid() for update;
 if member.id is not null and not member.is_active then raise exception 'STAFF_ACCESS_DISABLED'; end if;
 if member.id is null then
  insert into public.restaurant_staff(restaurant_id,user_id,role,display_name) values(tenant,auth.uid(),v.role,v.display_name) returning * into member;
 end if;
 -- Existing memberships are never overwritten or reactivated, even by legacy owner invites.
 update public.restaurant_invites set status='accepted',accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=v.id;
 insert into public.staff_management_audit(restaurant_id,actor_user_id,membership_id,invite_id,action,after_state)
 values(tenant,auth.uid(),member.id,v.id,'invitation_accepted',jsonb_build_object('role',member.role,'is_active',member.is_active));
 select * into restaurant from public.restaurants where id=tenant;
 return jsonb_build_object('restaurant_id',tenant,'restaurant_slug',restaurant.slug,'restaurant_name',restaurant.name,'role',member.role);
end $$;
create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
 return jsonb_build_object('staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'user_id',s.user_id,'email',coalesce(u.email,''),'display_name',s.display_name,'role',s.role,'is_active',s.is_active,'version',s.version,'created_at',s.created_at,'is_current',s.user_id=auth.uid()) order by s.created_at,s.id) from public.restaurant_staff s left join auth.users u on u.id=s.user_id where s.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'display_name',i.display_name,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc) from public.restaurant_invites i where i.restaurant_id=p_restaurant_id and i.status='pending' and i.expires_at>clock_timestamp()),'[]'::jsonb));
end $$;

commit;
notify pgrst, 'reload schema';
