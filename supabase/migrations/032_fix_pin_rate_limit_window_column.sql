-- Correct the rate-limit window column while retaining the qualified pgcrypto calls.
create or replace function public.identify_attendance_pin(p_restaurant_id uuid,p_pin text,p_device_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_staff uuid; v_shift public.staff_shifts; v_break public.staff_shift_breaks; v_token uuid; v_failure public.attendance_pin_failures; v_attempts integer;
begin
  if not public.is_restaurant_staff(p_restaurant_id) or coalesce(p_device_id,'')='' or coalesce(p_pin,'') !~ '^[0-9]{4}$' then return jsonb_build_object('status','PIN_NOT_RECOGNISED'); end if;
  delete from public.attendance_pin_failures where updated_at < now()-interval '24 hours';
  select * into v_failure from public.attendance_pin_failures where restaurant_id=p_restaurant_id and device_id=left(p_device_id,120) for update;
  if v_failure.restaurant_id is not null and v_failure.locked_until>now() then
    insert into public.attendance_events(restaurant_id,event_type,device_id,source,metadata) values(p_restaurant_id,'PIN_RATE_LIMITED',left(p_device_id,120),'shared_pin',jsonb_build_object('attempts',v_failure.failed_attempts));
    return jsonb_build_object('status','PIN_NOT_RECOGNISED');
  end if;
  select user_id into v_staff from public.restaurant_staff where restaurant_id=p_restaurant_id and attendance_pin_enabled and attendance_pin_hash=extensions.crypt(p_pin,attendance_pin_hash) limit 1;
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

revoke all on function public.identify_attendance_pin(uuid,text,text) from public;
grant execute on function public.identify_attendance_pin(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
