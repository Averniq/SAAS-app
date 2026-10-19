-- Owner/admin-managed attendance PINs. This exposes only safe status metadata,
-- never the PIN or its hash.
create or replace function public.set_staff_attendance_pin(
  p_restaurant_id uuid,
  p_staff_user_id uuid,
  p_pin text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_had_pin boolean;
  v_event_type text;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if p_enabled and (coalesce(p_pin,'') !~ '^[0-9]{4}$' or p_pin='0000') then
    raise exception 'INVALID_PIN';
  end if;

  select (attendance_pin_enabled and attendance_pin_hash is not null)
    into v_had_pin
  from public.restaurant_staff
  where restaurant_id=p_restaurant_id and user_id=p_staff_user_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if p_enabled and exists(
    select 1
    from public.restaurant_staff
    where restaurant_id=p_restaurant_id
      and user_id<>p_staff_user_id
      and attendance_pin_enabled
      and attendance_pin_hash=extensions.crypt(p_pin,attendance_pin_hash)
  ) then
    raise exception 'DUPLICATE_PIN';
  end if;

  update public.restaurant_staff
  set attendance_pin_hash=case when p_enabled then extensions.crypt(p_pin,extensions.gen_salt('bf')) else null end,
      attendance_pin_enabled=p_enabled,
      attendance_pin_updated_at=now()
  where restaurant_id=p_restaurant_id and user_id=p_staff_user_id;

  -- Any unused action token could otherwise authorize a punch with the old PIN.
  delete from public.attendance_action_tokens
  where restaurant_id=p_restaurant_id and staff_user_id=p_staff_user_id and used_at is null;

  v_event_type:=case when v_had_pin then 'PIN_RESET' else 'PIN_SET' end;
  insert into public.attendance_events(restaurant_id,staff_user_id,event_type,source,metadata)
  values(
    p_restaurant_id,
    p_staff_user_id,
    v_event_type,
    'manager',
    jsonb_build_object('acted_by',auth.uid())
  );
end;
$$;

-- Staff management receives status and timestamp only; the hash stays private.
create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', rs.user_id,
        'email', coalesce(u.email, ''),
        'role', rs.role,
        'created_at', rs.created_at,
        'is_current', rs.user_id = auth.uid(),
        'attendance_pin_configured', (rs.attendance_pin_enabled and rs.attendance_pin_hash is not null),
        'attendance_pin_updated_at', rs.attendance_pin_updated_at,
        'attendance_report_access', coalesce(rs.attendance_report_access, false)
      ) order by case rs.role when 'owner' then 1 when 'manager' then 2 when 'kitchen' then 3 else 4 end, rs.created_at)
      from public.restaurant_staff rs
      left join auth.users u on u.id = rs.user_id
      where rs.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'token', ri.token,
        'email', ri.email,
        'role', ri.role,
        'expires_at', ri.expires_at,
        'created_at', ri.created_at
      ) order by ri.created_at desc)
      from public.restaurant_invites ri
      where ri.restaurant_id = p_restaurant_id
        and ri.status = 'pending'
        and ri.expires_at >= now()
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.list_restaurant_team(uuid) from public;
grant execute on function public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.list_restaurant_team(uuid) to authenticated;
notify pgrst,'reload schema';
