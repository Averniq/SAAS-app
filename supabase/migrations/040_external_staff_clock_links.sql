-- Public, revocable staff-clock links. The browser is never allowed to choose
-- a tenant, restaurant, staff member, or device identity for this flow.
begin;

alter table public.restaurants add column if not exists attendance_enabled boolean not null default true;

create table if not exists public.staff_clock_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  token_hash text not null unique,
  device_label text not null default '' check (char_length(device_label) <= 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.staff_clock_links enable row level security;
revoke all on table public.staff_clock_links from public, anon, authenticated;

alter table public.attendance_action_tokens add column if not exists staff_clock_link_id uuid references public.staff_clock_links(id) on delete cascade;
create index if not exists attendance_action_tokens_staff_clock_link_idx on public.attendance_action_tokens(staff_clock_link_id) where used_at is null;

create or replace function public.get_staff_clock_link(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links;
begin
  if auth.uid() is null or not (public.has_restaurant_role(p_restaurant_id,array['owner']) or public.is_platform_admin()) then
    raise exception 'ACCESS_DENIED';
  end if;
  select * into v_link from public.staff_clock_links where restaurant_id=p_restaurant_id;
  return jsonb_build_object(
    'active', coalesce(v_link.is_active,false),
    'created_at', v_link.created_at,
    'last_used_at', v_link.last_used_at,
    'device_label', coalesce(v_link.device_label,'')
  );
end;
$$;

create or replace function public.enable_staff_clock_link(p_restaurant_id uuid,p_device_label text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links; v_token text; v_hash text; v_label text:=left(trim(coalesce(p_device_label,'')),120);
begin
  if auth.uid() is null or not (public.has_restaurant_role(p_restaurant_id,array['owner']) or public.is_platform_admin()) then raise exception 'ACCESS_DENIED'; end if;
  select * into v_link from public.staff_clock_links where restaurant_id=p_restaurant_id for update;
  if v_link.id is not null and v_link.is_active then
    update public.staff_clock_links set device_label=v_label where id=v_link.id;
    return jsonb_build_object('active',true,'created_at',v_link.created_at,'last_used_at',v_link.last_used_at,'device_label',v_label);
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  if v_link.id is null then
    insert into public.staff_clock_links(restaurant_id,token_hash,device_label,is_active) values(p_restaurant_id,v_hash,v_label,true) returning * into v_link;
  else
    update public.staff_clock_links set token_hash=v_hash,device_label=v_label,is_active=true,last_used_at=null where id=v_link.id returning * into v_link;
    delete from public.attendance_action_tokens where staff_clock_link_id=v_link.id and used_at is null;
  end if;
  insert into public.attendance_events(restaurant_id,event_type,source,metadata) values(p_restaurant_id,'STAFF_CLOCK_LINK_CREATED','staff_clock',jsonb_build_object('acted_by',auth.uid(),'device_label',v_label));
  return jsonb_build_object('active',true,'created_at',v_link.created_at,'last_used_at',v_link.last_used_at,'device_label',v_link.device_label,'link_token',v_token);
end;
$$;

create or replace function public.regenerate_staff_clock_link(p_restaurant_id uuid,p_device_label text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links; v_token text:=encode(extensions.gen_random_bytes(32),'hex'); v_label text:=left(trim(coalesce(p_device_label,'')),120);
begin
  if auth.uid() is null or not (public.has_restaurant_role(p_restaurant_id,array['owner']) or public.is_platform_admin()) then raise exception 'ACCESS_DENIED'; end if;
  select * into v_link from public.staff_clock_links where restaurant_id=p_restaurant_id for update;
  if v_link.id is null then raise exception 'STAFF_CLOCK_LINK_NOT_FOUND'; end if;
  update public.staff_clock_links set token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),device_label=v_label,is_active=true,last_used_at=null where id=v_link.id returning * into v_link;
  delete from public.attendance_action_tokens where staff_clock_link_id=v_link.id and used_at is null;
  insert into public.attendance_events(restaurant_id,event_type,source,metadata) values(p_restaurant_id,'STAFF_CLOCK_LINK_REGENERATED','staff_clock',jsonb_build_object('acted_by',auth.uid(),'device_label',v_label));
  return jsonb_build_object('active',true,'created_at',v_link.created_at,'last_used_at',v_link.last_used_at,'device_label',v_link.device_label,'link_token',v_token);
end;
$$;

create or replace function public.disable_staff_clock_link(p_restaurant_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links;
begin
  if auth.uid() is null or not (public.has_restaurant_role(p_restaurant_id,array['owner']) or public.is_platform_admin()) then raise exception 'ACCESS_DENIED'; end if;
  select * into v_link from public.staff_clock_links where restaurant_id=p_restaurant_id for update;
  if v_link.id is null then return; end if;
  update public.staff_clock_links set is_active=false where id=v_link.id;
  delete from public.attendance_action_tokens where staff_clock_link_id=v_link.id and used_at is null;
  insert into public.attendance_events(restaurant_id,event_type,source,metadata) values(p_restaurant_id,'STAFF_CLOCK_LINK_DISABLED','staff_clock',jsonb_build_object('acted_by',auth.uid(),'device_label',v_link.device_label));
end;
$$;

create or replace function public.get_public_staff_clock_context(p_public_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links; v_restaurant public.restaurants;
begin
  select l into v_link from public.staff_clock_links l join public.restaurants r on r.id=l.restaurant_id where l.token_hash=encode(extensions.digest(coalesce(p_public_token,''),'sha256'),'hex') and l.is_active and r.attendance_enabled and r.is_active and r.status='active';
  if v_link.id is null then raise exception 'STAFF_CLOCK_LINK_INVALID'; end if;
  select * into v_restaurant from public.restaurants where id=v_link.restaurant_id;
  update public.staff_clock_links set last_used_at=now() where id=v_link.id;
  insert into public.attendance_events(restaurant_id,event_type,source,metadata) values(v_link.restaurant_id,'STAFF_CLOCK_LINK_USED','staff_clock',jsonb_build_object('device_label',v_link.device_label));
  return jsonb_build_object('restaurant_name',v_restaurant.name,'device_label',v_link.device_label);
end;
$$;

create or replace function public.identify_public_staff_clock_pin(p_public_token text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.staff_clock_links; v_restaurant public.restaurants; v_staff uuid; v_shift public.staff_shifts; v_break public.staff_shift_breaks; v_token uuid; v_failure public.attendance_pin_failures; v_attempts integer; v_device text;
begin
  select l into v_link from public.staff_clock_links l join public.restaurants r on r.id=l.restaurant_id where l.token_hash=encode(extensions.digest(coalesce(p_public_token,''),'sha256'),'hex') and l.is_active and r.attendance_enabled and r.is_active and r.status='active' for update of l;
  if v_link.id is null or coalesce(p_pin,'') !~ '^[0-9]{4}$' then return jsonb_build_object('status','PIN_NOT_RECOGNISED'); end if;
  select * into v_restaurant from public.restaurants where id=v_link.restaurant_id;
  v_device:=left('staff-clock:' || v_link.id::text,120);
  delete from public.attendance_pin_failures where updated_at < now()-interval '24 hours';
  select * into v_failure from public.attendance_pin_failures where restaurant_id=v_link.restaurant_id and device_id=v_device for update;
  if v_failure.locked_until is not null and v_failure.locked_until>now() then
    insert into public.attendance_events(restaurant_id,event_type,device_id,source) values(v_link.restaurant_id,'PIN_RATE_LIMITED',v_device,'external_staff_clock');
    return jsonb_build_object('status','PIN_NOT_RECOGNISED','rate_limited',true);
  end if;
  select user_id into v_staff from public.restaurant_staff where restaurant_id=v_link.restaurant_id and attendance_pin_enabled and attendance_pin_hash=extensions.crypt(p_pin,attendance_pin_hash) limit 1;
  if v_staff is null then
    v_attempts:=case when v_failure.restaurant_id is null or v_failure.attempt_window_started_at < now()-interval '2 minutes' then 1 else v_failure.failed_attempts+1 end;
    insert into public.attendance_pin_failures(restaurant_id,device_id,attempt_window_started_at,failed_attempts,locked_until,updated_at) values(v_link.restaurant_id,v_device,now(),v_attempts,case when v_attempts>=5 then now()+interval '30 seconds' else null end,now()) on conflict(restaurant_id,device_id) do update set attempt_window_started_at=case when public.attendance_pin_failures.attempt_window_started_at<now()-interval '2 minutes' then now() else public.attendance_pin_failures.attempt_window_started_at end,failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until,updated_at=now();
    insert into public.attendance_events(restaurant_id,event_type,device_id,source,metadata) values(v_link.restaurant_id,'PIN_FAILED',v_device,'external_staff_clock',jsonb_build_object('rate_limited',v_attempts>=5));
    return jsonb_build_object('status','PIN_NOT_RECOGNISED','rate_limited',v_attempts>=5);
  end if;
  delete from public.attendance_pin_failures where restaurant_id=v_link.restaurant_id and device_id=v_device;
  select * into v_shift from public.staff_shifts where restaurant_id=v_link.restaurant_id and staff_user_id=v_staff and clock_out_at is null order by clock_in_at desc limit 1;
  insert into public.attendance_action_tokens(restaurant_id,staff_user_id,device_id,staff_clock_link_id,expires_at) values(v_link.restaurant_id,v_staff,coalesce(nullif(v_link.device_label,''),v_device),v_link.id,now()+interval '20 seconds') returning token into v_token;
  if v_shift.id is null then return jsonb_build_object('action_token',v_token,'display_name',split_part((select email from auth.users where id=v_staff),'@',1),'status','OFF_DUTY'); end if;
  select * into v_break from public.staff_shift_breaks where shift_id=v_shift.id and ended_at is null limit 1;
  return jsonb_build_object('action_token',v_token,'display_name',split_part((select email from auth.users where id=v_staff),'@',1),'status',case when v_break.id is null then 'WORKING' else 'ON_BREAK' end,'clock_in_at',v_shift.clock_in_at,'worked_minutes',floor(extract(epoch from now()-v_shift.clock_in_at)/60),'break_minutes',case when v_break.id is null then 0 else floor(extract(epoch from now()-v_break.started_at)/60) end);
end;
$$;

create or replace function public.public_staff_clock_action(p_action_token uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.attendance_action_tokens; s public.staff_shifts; v_minutes integer;
begin
  if p_action not in ('clock_in','break_start','break_end','clock_out') then raise exception 'INVALID_ACTION'; end if;
  select t.* into t from public.attendance_action_tokens t join public.staff_clock_links l on l.id=t.staff_clock_link_id join public.restaurants r on r.id=t.restaurant_id where t.token=p_action_token and t.used_at is null and t.expires_at>now() and l.is_active and r.attendance_enabled and r.is_active and r.status='active' for update of t;
  if t.token is null then raise exception 'ACTION_EXPIRED'; end if;
  update public.attendance_action_tokens set used_at=now() where token=t.token and used_at is null; if not found then raise exception 'ACTION_EXPIRED'; end if;
  select * into s from public.staff_shifts where restaurant_id=t.restaurant_id and staff_user_id=t.staff_user_id and clock_out_at is null order by clock_in_at desc limit 1 for update;
  if p_action='clock_in' then if s.id is not null then raise exception 'OPEN_SHIFT_EXISTS'; end if; insert into public.staff_shifts(restaurant_id,staff_user_id,clock_in_at,clock_in_source,device_id) values(t.restaurant_id,t.staff_user_id,now(),'external_staff_clock',t.device_id) returning * into s;
  elsif p_action='break_start' then if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK_EXISTS'; end if; insert into public.staff_shift_breaks(shift_id,started_at) values(s.id,now());
  elsif p_action='break_end' then if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; update public.staff_shift_breaks set ended_at=now() where shift_id=s.id and ended_at is null; if not found then raise exception 'NO_OPEN_BREAK'; end if;
  else if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK'; end if; update public.staff_shifts set clock_out_at=now(),clock_out_source='external_staff_clock' where id=s.id returning * into s; end if;
  select greatest(0,floor(extract(epoch from coalesce(s.clock_out_at,now())-s.clock_in_at)/60)::integer) into v_minutes;
  insert into public.attendance_events(restaurant_id,staff_user_id,shift_id,event_type,device_id,source) values(t.restaurant_id,t.staff_user_id,s.id,upper(p_action),t.device_id,'external_staff_clock');
  return jsonb_build_object('message',replace(initcap(replace(p_action,'_',' ')),'Clock In','Clocked In'),'worked_minutes',v_minutes);
end;
$$;

revoke all on function public.get_staff_clock_link(uuid),public.enable_staff_clock_link(uuid,text),public.regenerate_staff_clock_link(uuid,text),public.disable_staff_clock_link(uuid),public.get_public_staff_clock_context(text),public.identify_public_staff_clock_pin(text,text),public.public_staff_clock_action(uuid,text) from public;
grant execute on function public.get_staff_clock_link(uuid),public.enable_staff_clock_link(uuid,text),public.regenerate_staff_clock_link(uuid,text),public.disable_staff_clock_link(uuid) to authenticated;
grant execute on function public.get_public_staff_clock_context(text),public.identify_public_staff_clock_pin(text,text),public.public_staff_clock_action(uuid,text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
