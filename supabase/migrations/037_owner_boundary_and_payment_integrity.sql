-- Enforce owner-only configuration, protect owner invitation tokens, and make
-- terminal orders non-payable at the database boundary.
begin;

-- Managers retain operational staff management, but cannot directly modify a
-- restaurant row or restaurant configuration records.
drop policy if exists "authenticated update allowed restaurants" on public.restaurants;
create policy "owners and platform admins update restaurants" on public.restaurants
for update to authenticated
using (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin())
with check (public.has_restaurant_role(id, array['owner']) or public.is_platform_admin());

drop policy if exists "owners insert categories" on public.categories;
drop policy if exists "owners update categories" on public.categories;
drop policy if exists "owners delete categories" on public.categories;
create policy "owners insert categories" on public.categories for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners update categories" on public.categories for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']))
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners delete categories" on public.categories for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']));

drop policy if exists "owners insert tables" on public.tables;
drop policy if exists "owners update tables" on public.tables;
drop policy if exists "owners delete tables" on public.tables;
create policy "owners insert tables" on public.tables for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners update tables" on public.tables for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']))
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners delete tables" on public.tables for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']));

drop policy if exists "owners insert menu" on public.menu_items;
drop policy if exists "owners update menu" on public.menu_items;
drop policy if exists "owners delete menu" on public.menu_items;
create policy "owners insert menu" on public.menu_items for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners update menu" on public.menu_items for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']))
with check (public.has_restaurant_role(restaurant_id, array['owner']));
create policy "owners delete menu" on public.menu_items for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']));

create or replace function public.create_restaurant_invite(p_restaurant_id uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare invite_row public.restaurant_invites; normalized_email text:=lower(trim(coalesce(p_email,''))); caller_role text; is_owner_or_admin boolean;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
  if p_role not in ('owner','manager','staff','kitchen','cashier') then raise exception 'INVALID_STAFF_ROLE'; end if;
  select role into caller_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  is_owner_or_admin := public.is_platform_admin() or caller_role='owner';
  if not is_owner_or_admin and p_role in ('owner','manager') then raise exception 'ONLY_OWNER_CAN_INVITE_PRIVILEGED_ROLE'; end if;
  update public.restaurant_invites set status='revoked' where restaurant_id=p_restaurant_id and lower(email)=normalized_email and status='pending';
  insert into public.restaurant_invites(restaurant_id,email,role,invited_by) values(p_restaurant_id,normalized_email,p_role,auth.uid()) returning * into invite_row;
  return jsonb_build_object('id',invite_row.id,'token',invite_row.token,'email',invite_row.email,'role',invite_row.role,'expires_at',invite_row.expires_at);
end $$;

create or replace function public.list_restaurant_team(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; caller_role text; is_owner_or_admin boolean;
begin
  if auth.uid() is null or not public.can_manage_restaurant_staff(p_restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
  select role into caller_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  is_owner_or_admin := public.is_platform_admin() or caller_role='owner';
  select jsonb_build_object(
    'staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'email',coalesce(u.email,''),'role',rs.role,'created_at',rs.created_at,'is_current',rs.user_id=auth.uid(),'attendance_pin_configured',(rs.attendance_pin_enabled and rs.attendance_pin_hash is not null),'attendance_pin_updated_at',rs.attendance_pin_updated_at,'attendance_report_access',coalesce(rs.attendance_report_access,false)) order by case rs.role when 'owner' then 1 when 'manager' then 2 when 'kitchen' then 3 else 4 end,rs.created_at) from public.restaurant_staff rs left join auth.users u on u.id=rs.user_id where rs.restaurant_id=p_restaurant_id),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('id',ri.id,'token',ri.token,'email',ri.email,'role',ri.role,'expires_at',ri.expires_at,'created_at',ri.created_at) order by ri.created_at desc) from public.restaurant_invites ri where ri.restaurant_id=p_restaurant_id and ri.status='pending' and ri.expires_at>=now() and (is_owner_or_admin or ri.role<>'owner')),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.revoke_restaurant_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.restaurant_invites; caller_role text;
begin
  select * into target from public.restaurant_invites where id=p_invite_id;
  if target.id is null or not public.can_manage_restaurant_staff(target.restaurant_id) then raise exception 'STAFF_MANAGEMENT_ACCESS_DENIED'; end if;
  select role into caller_role from public.restaurant_staff where restaurant_id=target.restaurant_id and user_id=auth.uid();
  if target.role='owner' and not (public.is_platform_admin() or caller_role='owner') then raise exception 'ONLY_OWNER_CAN_REVOKE_OWNER_INVITE'; end if;
  update public.restaurant_invites set status='revoked' where id=target.id and status='pending';
  return found;
end $$;

create or replace function public.set_staff_attendance_pin(p_restaurant_id uuid,p_staff_user_id uuid,p_pin text,p_enabled boolean default true)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_had_pin boolean; v_event_type text;
begin
  if auth.uid() is null or not (public.has_restaurant_role(p_restaurant_id,array['owner']) or public.is_platform_admin()) then raise exception 'ONLY_OWNER_CAN_MANAGE_ATTENDANCE_PINS'; end if;
  if p_enabled and (coalesce(p_pin,'') !~ '^[0-9]{4}$' or p_pin='0000') then raise exception 'INVALID_PIN'; end if;
  select (attendance_pin_enabled and attendance_pin_hash is not null) into v_had_pin from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=p_staff_user_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if p_enabled and exists(select 1 from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id<>p_staff_user_id and attendance_pin_enabled and attendance_pin_hash=extensions.crypt(p_pin,attendance_pin_hash)) then raise exception 'DUPLICATE_PIN'; end if;
  update public.restaurant_staff set attendance_pin_hash=case when p_enabled then extensions.crypt(p_pin,extensions.gen_salt('bf')) else null end,attendance_pin_enabled=p_enabled,attendance_pin_updated_at=now() where restaurant_id=p_restaurant_id and user_id=p_staff_user_id;
  delete from public.attendance_action_tokens where restaurant_id=p_restaurant_id and staff_user_id=p_staff_user_id and used_at is null;
  v_event_type:=case when v_had_pin then 'PIN_RESET' else 'PIN_SET' end;
  insert into public.attendance_events(restaurant_id,staff_user_id,event_type,source,metadata) values(p_restaurant_id,p_staff_user_id,v_event_type,'owner',jsonb_build_object('acted_by',auth.uid()));
end $$;

create or replace function public.record_restaurant_payment(p_restaurant_id uuid,p_order_id uuid,p_amount_cents integer,p_method text,p_note text default '',p_split_bill_id uuid default null,p_idempotency_key uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_role text; target_order public.orders; total_cents integer; paid_cents integer; split_total_cents integer; split_paid_cents integer; payment_row public.payments;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if target_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('Cash','Card','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into target_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if target_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if target_order.status in ('completed','paid','voided','cancelled') or target_order.payment_status='paid' then raise exception 'PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER'; end if;
  select round(target_order.total*100)::integer into total_cents;
  select coalesce(sum(amount_cents),0) into paid_cents from public.payments where restaurant_id=p_restaurant_id and order_id=p_order_id and status='completed';
  if p_amount_cents>total_cents-paid_cents then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;
  if p_split_bill_id is not null then
    select total_cents into split_total_cents from public.split_bills where id=p_split_bill_id and restaurant_id=p_restaurant_id and order_id=p_order_id for update;
    if split_total_cents is null then raise exception 'SPLIT_BILL_NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into split_paid_cents from public.payments where split_bill_id=p_split_bill_id and status='completed';
    if p_amount_cents>split_total_cents-split_paid_cents then raise exception 'PAYMENT_EXCEEDS_SPLIT_BALANCE'; end if;
  end if;
  insert into public.payments(restaurant_id,order_id,split_bill_id,amount_cents,payment_method,note,idempotency_key,recorded_by) values(p_restaurant_id,p_order_id,p_split_bill_id,p_amount_cents,p_method,coalesce(p_note,''),p_idempotency_key,auth.uid()) on conflict(restaurant_id,idempotency_key) do nothing returning * into payment_row;
  if payment_row.id is null then raise exception 'DUPLICATE_PAYMENT'; end if;
  paid_cents:=paid_cents+p_amount_cents;
  if p_split_bill_id is not null then
    split_paid_cents:=split_paid_cents+p_amount_cents;
    update public.split_bills set paid_cents=split_paid_cents,status=case when split_paid_cents>=split_total_cents then 'paid' when split_paid_cents>0 then 'partial' else 'unpaid' end where id=p_split_bill_id;
  end if;
  update public.orders set payment_status=case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end,status=case when paid_cents>=total_cents then 'completed' else status end,paid_at=case when paid_cents>=total_cents then coalesce(paid_at,now()) else paid_at end,closed_at=case when paid_cents>=total_cents then coalesce(closed_at,now()) else closed_at end,payment_method=case when paid_cents>=total_cents then p_method else payment_method end where id=p_order_id;
  return jsonb_build_object('payment_id',payment_row.id,'amount_cents',p_amount_cents,'paid_cents',paid_cents,'remaining_cents',total_cents-paid_cents,'payment_status',case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end);
end $$;

revoke all on function public.create_restaurant_invite(uuid,text,text),public.list_restaurant_team(uuid),public.revoke_restaurant_invite(uuid),public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid) from public;
grant execute on function public.create_restaurant_invite(uuid,text,text),public.list_restaurant_team(uuid),public.revoke_restaurant_invite(uuid),public.set_staff_attendance_pin(uuid,uuid,text,boolean),public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
