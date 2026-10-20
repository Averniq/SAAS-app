-- Presence is intentionally derived from a short heartbeat, not a permanent
-- login flag. A disconnected device becomes offline automatically.
alter table public.restaurant_staff
  add column if not exists last_seen_at timestamptz;

create index if not exists restaurant_staff_presence_idx
  on public.restaurant_staff (restaurant_id, last_seen_at desc);

create or replace function public.touch_staff_presence(p_restaurant_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare touched_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.restaurant_staff
  set last_seen_at = now()
  where restaurant_id = p_restaurant_id and user_id = auth.uid()
  returning last_seen_at into touched_at;
  if touched_at is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  return touched_at;
end;
$$;

create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then
    raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED';
  end if;
  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', rs.user_id, 'email', coalesce(u.email, ''), 'role', rs.role,
        'created_at', rs.created_at, 'last_seen_at', rs.last_seen_at,
        'is_online', rs.last_seen_at >= now() - interval '90 seconds',
        'is_current', rs.user_id = auth.uid()
      ) order by case rs.role when 'owner' then 1 when 'manager' then 2 when 'kitchen' then 3 else 4 end, rs.created_at)
      from public.restaurant_staff rs left join auth.users u on u.id = rs.user_id
      where rs.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', ri.id, 'token', ri.token, 'email', ri.email, 'role', ri.role, 'expires_at', ri.expires_at, 'created_at', ri.created_at) order by ri.created_at desc)
      from public.restaurant_invites ri where ri.restaurant_id = p_restaurant_id and ri.status = 'pending' and ri.expires_at >= now()
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.touch_staff_presence(uuid) from public, anon;
grant execute on function public.touch_staff_presence(uuid) to authenticated;
grant execute on function public.list_restaurant_team(uuid) to authenticated;
notify pgrst, 'reload schema';
