-- Attendance weekly reporting is calculated dynamically.  It never updates a
-- shift, break, or attendance event; the returned report clock-out is virtual.
alter table public.restaurant_staff
  add column if not exists attendance_report_access boolean not null default false;

create or replace function public.can_view_attendance_reports(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or exists (
      select 1 from public.restaurant_staff rs
      where rs.restaurant_id=p_restaurant_id and rs.user_id=auth.uid()
        and (rs.role='owner' or (rs.role='manager' and rs.attendance_report_access))
    )
  );
$$;

create or replace function public.can_manage_attendance_report_settings(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or exists (
      select 1 from public.restaurant_staff rs
      where rs.restaurant_id=p_restaurant_id and rs.user_id=auth.uid() and rs.role='owner'
    )
  );
$$;

create or replace function public.set_attendance_report_access(
  p_restaurant_id uuid, p_staff_user_id uuid, p_allowed boolean
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.can_manage_attendance_report_settings(p_restaurant_id) then
    raise exception 'ACCESS_DENIED';
  end if;
  update public.restaurant_staff
  set attendance_report_access = case when role='manager' then p_allowed else false end
  where restaurant_id=p_restaurant_id and user_id=p_staff_user_id;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
end;
$$;

-- Re-project safe staff metadata for the existing team screen.  This keeps the
-- permission flag visible without exposing attendance PIN material.
create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
  select jsonb_build_object(
    'staff',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',rs.user_id,'email',coalesce(u.email,''),'role',rs.role,'created_at',rs.created_at,
      'is_current',rs.user_id=auth.uid(),
      'attendance_pin_configured',(rs.attendance_pin_enabled and rs.attendance_pin_hash is not null),
      'attendance_pin_updated_at',rs.attendance_pin_updated_at,
      'attendance_report_access',rs.attendance_report_access
    ) order by case rs.role when 'owner' then 1 when 'manager' then 2 when 'kitchen' then 3 else 4 end,rs.created_at)
    from public.restaurant_staff rs left join auth.users u on u.id=rs.user_id where rs.restaurant_id=p_restaurant_id),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ri.id,'token',ri.token,'email',ri.email,'role',ri.role,'expires_at',ri.expires_at,'created_at',ri.created_at
    ) order by ri.created_at desc) from public.restaurant_invites ri where ri.restaurant_id=p_restaurant_id and ri.status='pending' and ri.expires_at>=now()),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_attendance_report_settings(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_config jsonb;
begin
  if not public.can_view_attendance_reports(p_restaurant_id) then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(theme_config->'attendance_report_settings','{}'::jsonb) into v_config
  from public.restaurants where id=p_restaurant_id;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  return jsonb_build_object(
    'clock_in_rounding','none',
    'clock_out_rounding','floor',
    'clock_out_rounding_interval_minutes',15,
    'break_rounding','none',
    'week_starts_on', greatest(0,least(6,coalesce((v_config->>'week_starts_on')::integer,1)))
  );
end;
$$;

create or replace function public.update_attendance_report_settings(p_restaurant_id uuid, p_week_starts_on integer default 1)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settings jsonb := jsonb_build_object(
  'clock_in_rounding','none','clock_out_rounding','floor',
  'clock_out_rounding_interval_minutes',15,'break_rounding','none',
  'week_starts_on',greatest(0,least(6,coalesce(p_week_starts_on,1)))
);
begin
  if not public.can_manage_attendance_report_settings(p_restaurant_id) then raise exception 'ACCESS_DENIED'; end if;
  update public.restaurants set theme_config=coalesce(theme_config,'{}'::jsonb)||jsonb_build_object('attendance_report_settings',v_settings)
  where id=p_restaurant_id;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  return v_settings;
end;
$$;

create or replace function public.get_weekly_attendance_report(
  p_restaurant_id uuid, p_from date, p_to date,
  p_staff_user_id uuid default null, p_location text default null, p_shift_status text default 'all'
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_timezone text; v_settings jsonb; v_result jsonb;
begin
  if not public.can_view_attendance_reports(p_restaurant_id) then raise exception 'ACCESS_DENIED'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'INVALID_DATE_RANGE'; end if;
  if coalesce(p_shift_status,'all') not in ('all','completed','open','review') then raise exception 'INVALID_SHIFT_STATUS'; end if;
  select coalesce(nullif(timezone,''),'Australia/Sydney') into v_timezone from public.restaurants where id=p_restaurant_id;
  if v_timezone is null then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  v_settings:=public.get_attendance_report_settings(p_restaurant_id);

  with shift_data as (
    select s.id, s.staff_user_id, coalesce(u.email,'Staff') staff_name, s.clock_in_at, s.clock_out_at,
      s.clock_in_location as location, coalesce(nullif(s.device_id,''),s.clock_in_device,'') as device,
      timezone(v_timezone,s.clock_in_at)::date as report_date,
      timezone(v_timezone,s.clock_out_at) as actual_local_out,
      coalesce(b.break_seconds,0)::bigint as break_seconds, coalesce(b.has_open_break,false) has_open_break
    from public.staff_shifts s
    left join auth.users u on u.id=s.staff_user_id
    left join lateral (
      select sum(extract(epoch from ended_at-started_at)) filter(where ended_at is not null)::bigint break_seconds,
             bool_or(ended_at is null) has_open_break
      from public.staff_shift_breaks where shift_id=s.id
    ) b on true
    where s.restaurant_id=p_restaurant_id
      and timezone(v_timezone,s.clock_in_at)::date between p_from and p_to
      and (p_staff_user_id is null or s.staff_user_id=p_staff_user_id)
      and (nullif(trim(coalesce(p_location,'')),'') is null or s.clock_in_location=trim(p_location))
  ), calculated as (
    select *, case when clock_out_at is null then null else
      (date_trunc('hour',actual_local_out) + floor(extract(minute from actual_local_out)/15)*interval '15 minutes') at time zone v_timezone end report_clock_out_at
    from shift_data
  ), details as (
    select *,
      case when clock_out_at is null then 'open'
           when has_open_break or report_clock_out_at < clock_in_at then 'review'
           else 'completed' end as shift_status,
      case when clock_out_at is null then true else has_open_break or report_clock_out_at < clock_in_at end as manager_review_required,
      case when clock_out_at is null then null else floor(extract(epoch from clock_out_at-clock_in_at)/60)::integer end actual_elapsed_minutes,
      case when clock_out_at is null then null else floor(extract(epoch from report_clock_out_at-clock_out_at)/60)::integer end rounding_adjustment_minutes,
      case when clock_out_at is null or has_open_break or report_clock_out_at < clock_in_at then 0
           else greatest(0,floor((extract(epoch from report_clock_out_at-clock_in_at)-break_seconds)/60)::integer) end paid_minutes
    from calculated
  ), filtered as (
    select * from details where coalesce(p_shift_status,'all')='all'
      or (p_shift_status='completed' and shift_status='completed')
      or (p_shift_status='open' and shift_status='open')
      or (p_shift_status='review' and shift_status='review')
  ), staff_scope as (
    select rs.user_id, coalesce(u.email,'Staff') staff_name
    from public.restaurant_staff rs left join auth.users u on u.id=rs.user_id
    where rs.restaurant_id=p_restaurant_id and (p_staff_user_id is null or rs.user_id=p_staff_user_id)
  ), per_day as (
    select staff_user_id, report_date, sum(paid_minutes)::integer paid_minutes from filtered group by 1,2
  ), staff_summary as (
    select ss.user_id, ss.staff_name, coalesce(sum(pd.paid_minutes),0)::integer weekly_paid_minutes,
      coalesce(jsonb_object_agg(pd.report_date::text,pd.paid_minutes) filter(where pd.report_date is not null),'{}'::jsonb) daily_paid_minutes
    from staff_scope ss left join per_day pd on pd.staff_user_id=ss.user_id group by 1,2
  ), summary as (
    select coalesce(sum(paid_minutes),0)::integer total_paid_minutes,
      count(*) filter(where shift_status='completed')::integer completed_shifts,
      count(*) filter(where shift_status='open')::integer open_shifts,
      count(*) filter(where manager_review_required)::integer review_shifts,
      coalesce(sum(break_seconds)/60,0)::integer total_break_minutes,
      coalesce(sum(rounding_adjustment_minutes),0)::integer rounding_adjustment_minutes
    from filtered
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'timezone',v_timezone,'settings',v_settings,
    'summary',(select to_jsonb(summary) from summary),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('staff_user_id',user_id,'staff_name',staff_name,'daily_paid_minutes',daily_paid_minutes,'weekly_paid_minutes',weekly_paid_minutes) order by staff_name) from staff_summary),'[]'::jsonb),
    'details',coalesce((select jsonb_agg(jsonb_build_object('shift_id',id,'staff_user_id',staff_user_id,'staff_name',staff_name,'date',report_date,'location',location,'device',device,'actual_clock_in_at',clock_in_at,'actual_clock_out_at',clock_out_at,'report_clock_out_at',report_clock_out_at,'break_minutes',(break_seconds/60)::integer,'actual_elapsed_minutes',actual_elapsed_minutes,'calculated_paid_minutes',paid_minutes,'clock_out_rounding_adjustment_minutes',rounding_adjustment_minutes,'shift_status',shift_status,'manager_review_required',manager_review_required) order by clock_in_at) from filtered),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.can_view_attendance_reports(uuid),public.can_manage_attendance_report_settings(uuid),public.set_attendance_report_access(uuid,uuid,boolean),public.get_attendance_report_settings(uuid),public.update_attendance_report_settings(uuid,integer),public.get_weekly_attendance_report(uuid,date,date,uuid,text,text),public.list_restaurant_team(uuid) from public;
grant execute on function public.set_attendance_report_access(uuid,uuid,boolean),public.get_attendance_report_settings(uuid),public.update_attendance_report_settings(uuid,integer),public.get_weekly_attendance_report(uuid,date,date,uuid,text,text) to authenticated;
grant execute on function public.list_restaurant_team(uuid) to authenticated;
notify pgrst,'reload schema';
