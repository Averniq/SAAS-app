-- Shared PIN protection. No attempted PIN or hash is stored in this table.
create table if not exists public.attendance_pin_failures (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 120),
  attempt_window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id,device_id)
);
create index if not exists attendance_pin_failures_cleanup_idx on public.attendance_pin_failures(updated_at);
alter table public.attendance_pin_failures enable row level security;
revoke all on table public.attendance_pin_failures from public,anon,authenticated;

create or replace function public.identify_attendance_pin(p_restaurant_id uuid,p_pin text,p_device_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_staff uuid; v_shift public.staff_shifts; v_break public.staff_shift_breaks; v_token uuid; v_failure public.attendance_pin_failures; v_attempts integer;
begin
  if not public.is_restaurant_staff(p_restaurant_id) or coalesce(p_device_id,'')='' or coalesce(p_pin,'') !~ '^[0-9]{4}$' then return jsonb_build_object('status','PIN_NOT_RECOGNISED'); end if;
  -- Opportunistic cleanup keeps this bounded without requiring a scheduled job.
  delete from public.attendance_pin_failures where updated_at < now()-interval '24 hours';
  select * into v_failure from public.attendance_pin_failures where restaurant_id=p_restaurant_id and device_id=left(p_device_id,120) for update;
  if v_failure.locked_until is not null and v_failure.locked_until > now() then
    insert into public.attendance_events(restaurant_id,event_type,device_id,source) values(p_restaurant_id,'PIN_RATE_LIMITED',left(p_device_id,120),'shared_pin');
    return jsonb_build_object('status','PIN_NOT_RECOGNISED','rate_limited',true);
  end if;
  select user_id into v_staff from public.restaurant_staff where restaurant_id=p_restaurant_id and attendance_pin_enabled and attendance_pin_hash=crypt(p_pin,attendance_pin_hash) limit 1;
  if v_staff is null then
    v_attempts:=case when v_failure.restaurant_id is null or v_failure.attempt_window_started_at < now()-interval '2 minutes' then 1 else v_failure.failed_attempts+1 end;
    insert into public.attendance_pin_failures(restaurant_id,device_id,attempt_window_started_at,failed_attempts,locked_until,updated_at) values(p_restaurant_id,left(p_device_id,120),now(),v_attempts,case when v_attempts>=5 then now()+interval '30 seconds' else null end,now()) on conflict(restaurant_id,device_id) do update set attempt_window_started_at=case when public.attendance_pin_failures.attempt_window_started_at < now()-interval '2 minutes' then now() else public.attendance_pin_failures.attempt_window_started_at end,failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until,updated_at=now();
    insert into public.attendance_events(restaurant_id,event_type,device_id,source,metadata) values(p_restaurant_id,'PIN_FAILED',left(p_device_id,120),'shared_pin',jsonb_build_object('rate_limited',v_attempts>=5));
    return jsonb_build_object('status','PIN_NOT_RECOGNISED','rate_limited',v_attempts>=5);
  end if;
  delete from public.attendance_pin_failures where restaurant_id=p_restaurant_id and device_id=left(p_device_id,120);
  select * into v_shift from public.staff_shifts where restaurant_id=p_restaurant_id and staff_user_id=v_staff and clock_out_at is null order by clock_in_at desc limit 1;
  insert into public.attendance_action_tokens(restaurant_id,staff_user_id,device_id,expires_at) values(p_restaurant_id,v_staff,left(p_device_id,120),now()+interval '20 seconds') returning token into v_token;
  if v_shift.id is null then return jsonb_build_object('action_token',v_token,'display_name',split_part((select email from auth.users where id=v_staff),'@',1),'status','OFF_DUTY'); end if;
  select * into v_break from public.staff_shift_breaks where shift_id=v_shift.id and ended_at is null limit 1;
  return jsonb_build_object('action_token',v_token,'display_name',split_part((select email from auth.users where id=v_staff),'@',1),'status',case when v_break.id is null then 'WORKING' else 'ON_BREAK' end,'clock_in_at',v_shift.clock_in_at,'worked_minutes',floor(extract(epoch from now()-v_shift.clock_in_at)/60),'break_minutes',case when v_break.id is null then 0 else floor(extract(epoch from now()-v_break.started_at)/60) end);
end $$;

create or replace function public.shared_attendance_action(p_action_token uuid,p_action text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.attendance_action_tokens; s public.staff_shifts; v_minutes integer;
begin
  if p_action not in ('clock_in','break_start','break_end','clock_out') then raise exception 'INVALID_ACTION'; end if;
  select * into t from public.attendance_action_tokens where token=p_action_token and used_at is null and expires_at>now() for update;
  if t.token is null or not public.is_restaurant_staff(t.restaurant_id) then raise exception 'ACTION_EXPIRED'; end if;
  update public.attendance_action_tokens set used_at=now() where token=t.token and used_at is null; if not found then raise exception 'ACTION_EXPIRED'; end if;
  select * into s from public.staff_shifts where restaurant_id=t.restaurant_id and staff_user_id=t.staff_user_id and clock_out_at is null order by clock_in_at desc limit 1 for update;
  if p_action='clock_in' then if s.id is not null then raise exception 'OPEN_SHIFT_EXISTS'; end if; insert into public.staff_shifts(restaurant_id,staff_user_id,clock_in_at,clock_in_source,device_id) values(t.restaurant_id,t.staff_user_id,now(),'shared_pin',t.device_id) returning * into s;
  elsif p_action='break_start' then if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK_EXISTS'; end if; insert into public.staff_shift_breaks(shift_id,started_at) values(s.id,now());
  elsif p_action='break_end' then if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; update public.staff_shift_breaks set ended_at=now() where shift_id=s.id and ended_at is null; if not found then raise exception 'NO_OPEN_BREAK'; end if;
  else if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if; if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK'; end if; update public.staff_shifts set clock_out_at=now(),clock_out_source='shared_pin' where id=s.id returning * into s; end if;
  select greatest(0,floor(extract(epoch from coalesce(s.clock_out_at,now())-s.clock_in_at)/60)::integer) into v_minutes;
  insert into public.attendance_events(restaurant_id,staff_user_id,shift_id,event_type,device_id) values(t.restaurant_id,t.staff_user_id,s.id,upper(p_action),t.device_id);
  return jsonb_build_object('message',replace(initcap(replace(p_action,'_',' ')),'Clock In','Clocked In'),'worked_minutes',v_minutes);
end $$;
revoke all on function public.identify_attendance_pin(uuid,text,text),public.shared_attendance_action(uuid,text) from public;
grant execute on function public.identify_attendance_pin(uuid,text,text),public.shared_attendance_action(uuid,text) to authenticated;
notify pgrst,'reload schema';
