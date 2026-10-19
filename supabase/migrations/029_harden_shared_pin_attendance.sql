-- Hardening patch for shared PIN attendance. Safe after 027/028 on existing tenants.
create unique index if not exists staff_shift_breaks_one_open_break_idx on public.staff_shift_breaks(shift_id) where ended_at is null;
create index if not exists attendance_action_tokens_expiry_idx on public.attendance_action_tokens(expires_at);
alter table public.attendance_action_tokens enable row level security;
alter table public.attendance_events enable row level security;

create or replace function public.set_staff_attendance_pin(p_restaurant_id uuid,p_staff_user_id uuid,p_pin text,p_enabled boolean default true) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then raise exception 'ACCESS_DENIED'; end if;
  if p_enabled and (coalesce(p_pin,'') !~ '^[0-9]{4}$' or p_pin='0000') then raise exception 'INVALID_PIN'; end if;
  if p_enabled and exists(select 1 from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id<>p_staff_user_id and attendance_pin_enabled and attendance_pin_hash=crypt(p_pin,attendance_pin_hash)) then raise exception 'DUPLICATE_PIN'; end if;
  update public.restaurant_staff set attendance_pin_hash=case when p_enabled then crypt(p_pin,gen_salt('bf')) else null end,attendance_pin_enabled=p_enabled,attendance_pin_updated_at=now() where restaurant_id=p_restaurant_id and user_id=p_staff_user_id;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  delete from public.attendance_action_tokens where restaurant_id=p_restaurant_id and staff_user_id=p_staff_user_id;
  insert into public.attendance_events(restaurant_id,staff_user_id,event_type,source) values(p_restaurant_id,p_staff_user_id,'PIN_RESET','manager');
end $$;

create or replace function public.shared_attendance_action(p_action_token uuid,p_action text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.attendance_action_tokens; s public.staff_shifts; v_minutes integer;
begin
  if p_action not in ('clock_in','break_start','break_end','clock_out') then raise exception 'INVALID_ACTION'; end if;
  select * into t from public.attendance_action_tokens where token=p_action_token and used_at is null and expires_at>now() for update;
  if t.token is null then raise exception 'ACTION_EXPIRED'; end if;
  -- Consume first: concurrent/replayed requests cannot perform a second action.
  update public.attendance_action_tokens set used_at=now() where token=t.token and used_at is null;
  if not found then raise exception 'ACTION_EXPIRED'; end if;
  select * into s from public.staff_shifts where restaurant_id=t.restaurant_id and staff_user_id=t.staff_user_id and clock_out_at is null order by clock_in_at desc limit 1 for update;
  if p_action='clock_in' then
    if s.id is not null then raise exception 'OPEN_SHIFT_EXISTS'; end if;
    insert into public.staff_shifts(restaurant_id,staff_user_id,clock_in_at,clock_in_source,device_id) values(t.restaurant_id,t.staff_user_id,now(),'shared_pin',t.device_id) returning * into s;
  elsif p_action='break_start' then
    if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if;
    if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK_EXISTS'; end if;
    insert into public.staff_shift_breaks(shift_id,started_at) values(s.id,now());
  elsif p_action='break_end' then
    if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if;
    update public.staff_shift_breaks set ended_at=now() where shift_id=s.id and ended_at is null;
    if not found then raise exception 'NO_OPEN_BREAK'; end if;
  else
    if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if;
    if exists(select 1 from public.staff_shift_breaks where shift_id=s.id and ended_at is null) then raise exception 'OPEN_BREAK'; end if;
    update public.staff_shifts set clock_out_at=now(),clock_out_source='shared_pin' where id=s.id returning * into s;
  end if;
  select greatest(0,floor(extract(epoch from coalesce(s.clock_out_at,now())-s.clock_in_at)/60)::integer) into v_minutes;
  insert into public.attendance_events(restaurant_id,staff_user_id,shift_id,event_type,device_id) values(t.restaurant_id,t.staff_user_id,s.id,upper(p_action),t.device_id);
  return jsonb_build_object('message',replace(initcap(replace(p_action,'_',' ')),'Clock In','Clocked In'),'worked_minutes',v_minutes);
end $$;

revoke all on table public.attendance_action_tokens,public.attendance_events from public,anon,authenticated;
revoke all on function public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.identify_attendance_pin(uuid,text,text),public.shared_attendance_action(uuid,text) from public;
grant execute on function public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.identify_attendance_pin(uuid,text,text),public.shared_attendance_action(uuid,text) to authenticated;
notify pgrst,'reload schema';
