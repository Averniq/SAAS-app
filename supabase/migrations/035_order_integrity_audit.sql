-- POS order integrity: append-only payments/audit data and RPC-only exception handling.
-- This migration deliberately contains no DELETE FROM orders/order_items/payments.
begin;

alter table public.orders
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists void_note text not null default '',
  add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('new','draft','confirmed','kitchen_accepted','preparing','ready','completed','paid','cancelled','voided'));

alter table public.order_items
  add column if not exists status text not null default 'active' check (status in ('active','voided')),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists void_note text not null default '',
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

create table if not exists public.order_audit_log (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict, order_item_id uuid references public.order_items(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict, actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '', actor_role text not null default '', action text not null, entity_type text not null,
  before_data jsonb not null default '{}'::jsonb, after_data jsonb not null default '{}'::jsonb,
  reason text not null default '', note text not null default '', approved_by uuid references auth.users(id) on delete set null,
  device_or_session_id text not null default '', created_at timestamptz not null default now()
);
create index if not exists order_audit_log_order_created_idx on public.order_audit_log(restaurant_id,order_id,created_at);
create index if not exists order_audit_log_action_created_idx on public.order_audit_log(restaurant_id,action,created_at desc);
alter table public.order_audit_log enable row level security;
create policy "staff read tenant order audit" on public.order_audit_log for select to authenticated using (public.is_restaurant_staff(restaurant_id));
revoke all on public.order_audit_log from anon,authenticated;
grant select on public.order_audit_log to authenticated;

create or replace function public.write_order_audit(p_restaurant_id uuid,p_order_id uuid,p_order_item_id uuid,p_payment_id uuid,p_action text,p_entity_type text,p_before jsonb default '{}'::jsonb,p_after jsonb default '{}'::jsonb,p_reason text default '',p_note text default '',p_approved_by uuid default null,p_device text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text;
begin
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  insert into public.order_audit_log(restaurant_id,order_id,order_item_id,payment_id,actor_user_id,actor_name,actor_role,action,entity_type,before_data,after_data,reason,note,approved_by,device_or_session_id)
  values(p_restaurant_id,p_order_id,p_order_item_id,p_payment_id,auth.uid(),coalesce(split_part((select email from auth.users where id=auth.uid()),'@',1),''),coalesce(v_role,''),p_action,p_entity_type,coalesce(p_before,'{}'),coalesce(p_after,'{}'),left(coalesce(p_reason,''),200),left(coalesce(p_note,''),1000),p_approved_by,left(coalesce(p_device,''),160));
end $$;

-- Manager approvals use existing bcrypt-hashed attendance PINs. The PIN itself is never logged.
create or replace function public.require_manager_approval(p_restaurant_id uuid,p_pin text,p_action text,p_order_id uuid,p_order_item_id uuid default null,p_reason text default '',p_note text default '') returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_manager uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_restaurant_staff(p_restaurant_id) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if coalesce(p_pin,'') !~ '^[0-9]{4}$' then raise exception 'MANAGER_PIN_REQUIRED'; end if;
  select user_id into v_manager from public.restaurant_staff where restaurant_id=p_restaurant_id and role in ('owner','manager') and attendance_pin_enabled and attendance_pin_hash=extensions.crypt(p_pin,attendance_pin_hash) limit 1;
  if v_manager is null then raise exception 'MANAGER_PIN_INVALID'; end if;
  perform public.write_order_audit(p_restaurant_id,p_order_id,p_order_item_id,null,'manager_approved','approval','{}',jsonb_build_object('approval_action',p_action),p_reason,p_note,v_manager);
  return v_manager;
end $$;

create or replace function public.void_restaurant_order(p_restaurant_id uuid,p_order_id uuid,p_reason text,p_note text default '',p_manager_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; v_role text; v_approval uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if v_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if trim(coalesce(p_reason,'')) not in ('Wrong table','Duplicate order','Customer cancelled','Order entered by mistake','Kitchen issue','Other') then raise exception 'INVALID_VOID_REASON'; end if;
  if trim(coalesce(p_reason,''))='Other' and trim(coalesce(p_note,''))='' then raise exception 'VOID_NOTE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if o.id is null or o.status='voided' then raise exception 'ORDER_NOT_VOIDABLE'; end if;
  if o.status in ('completed','paid','preparing','ready','kitchen_accepted') or o.payment_status='paid' then v_approval:=public.require_manager_approval(p_restaurant_id,p_manager_pin,'void_order',p_order_id,null,p_reason,p_note); end if;
  update public.orders set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=o.id;
  perform public.write_order_audit(p_restaurant_id,o.id,null,null,'order_voided','order',to_jsonb(o),jsonb_build_object('status','voided'),p_reason,p_note,v_approval);
  return jsonb_build_object('id',o.id,'status','voided','approved_by',v_approval);
end $$;

create or replace function public.void_restaurant_order_item(p_restaurant_id uuid,p_order_item_id uuid,p_reason text,p_note text default '',p_manager_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.order_items; o public.orders; v_role text; v_approval uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if v_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if trim(coalesce(p_reason,'')) not in ('Customer changed mind','Wrong item entered','Duplicate item','Out of stock','Kitchen mistake','Other') then raise exception 'INVALID_VOID_REASON'; end if;
  if trim(coalesce(p_reason,''))='Other' and trim(coalesce(p_note,''))='' then raise exception 'VOID_NOTE_REQUIRED'; end if;
  select * into i from public.order_items where id=p_order_item_id and restaurant_id=p_restaurant_id for update;
  select * into o from public.orders where id=i.order_id and restaurant_id=p_restaurant_id for update;
  if i.id is null or i.status='voided' or o.status in ('paid','completed','voided') then raise exception 'ITEM_NOT_VOIDABLE'; end if;
  if o.status in ('kitchen_accepted','preparing','ready') then v_approval:=public.require_manager_approval(p_restaurant_id,p_manager_pin,'void_item',o.id,i.id,p_reason,p_note); end if;
  update public.order_items set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=i.id;
  perform public.write_order_audit(p_restaurant_id,o.id,i.id,null,'item_voided','order_item',to_jsonb(i),jsonb_build_object('status','voided'),p_reason,p_note,v_approval);
  return jsonb_build_object('id',i.id,'order_id',o.id,'status','voided','approved_by',v_approval);
end $$;

-- Harden status transitions: no cancellation (use void), no re-opening paid/completed orders.
create or replace function public.update_restaurant_order_status(p_restaurant_id uuid,p_order_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; v_role text; v_status text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
 if v_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
 if p_action not in ('Preparing','Ready','Served') then raise exception 'INVALID_ORDER_ACTION_USE_VOID_OR_PAYMENT_RPC'; end if;
 if v_role not in ('owner','manager','staff','kitchen') then raise exception 'KITCHEN_ROLE_REQUIRED'; end if;
 select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.status in ('completed','paid','voided') or o.payment_status='paid' then perform public.write_order_audit(p_restaurant_id,p_order_id,null,null,'locked_order_access_attempt','order',to_jsonb(o),'{}','',p_action); raise exception 'ORDER_LOCKED'; end if;
 v_status:=case p_action when 'Preparing' then 'preparing' when 'Ready' then 'ready' else 'completed' end;
 update public.orders set status=v_status,served_at=case when p_action='Served' then now() else served_at end,closed_at=case when p_action='Served' then now() else closed_at end where id=o.id;
 perform public.write_order_audit(p_restaurant_id,o.id,null,null,case when p_action='Preparing' then 'kitchen_accepted' when p_action='Ready' then 'order_ready' else 'order_completed' end,'order',to_jsonb(o),jsonb_build_object('status',v_status));
 return jsonb_build_object('id',o.id,'status',v_status);
end $$;

-- The legacy payment RPC is retained but now writes audit. Its existing row lock keeps concurrent payments safe.
create or replace function public.order_payment_audit_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then perform public.write_order_audit(new.restaurant_id,new.order_id,null,new.id,'payment_added','payment','{}',to_jsonb(new));
 elsif old.status <> new.status and new.status='voided' then perform public.write_order_audit(new.restaurant_id,new.order_id,null,new.id,'payment_voided','payment',to_jsonb(old),to_jsonb(new),new.void_reason,'',new.voided_by); end if;
 return new;
end $$;
drop trigger if exists payments_audit_append_only on public.payments;
create trigger payments_audit_append_only after insert or update on public.payments for each row execute function public.order_payment_audit_trigger();

create or replace function public.get_order_activity(p_restaurant_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_restaurant_staff(p_restaurant_id) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
 if not exists(select 1 from public.orders where id=p_order_id and restaurant_id=p_restaurant_id) then raise exception 'ORDER_NOT_FOUND'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'entity_type',entity_type,'actor_name',actor_name,'actor_role',actor_role,'reason',reason,'note',note,'approved_by',approved_by,'created_at',created_at,'before_data',before_data,'after_data',after_data) order by created_at) from public.order_audit_log where restaurant_id=p_restaurant_id and order_id=p_order_id),'[]'::jsonb);
end $$;

revoke all on function public.write_order_audit(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,text,text,uuid,text),public.require_manager_approval(uuid,text,text,uuid,uuid,text,text),public.void_restaurant_order(uuid,uuid,text,text,text),public.void_restaurant_order_item(uuid,uuid,text,text,text),public.get_order_activity(uuid,uuid) from public;
grant execute on function public.void_restaurant_order(uuid,uuid,text,text,text),public.void_restaurant_order_item(uuid,uuid,text,text,text),public.get_order_activity(uuid,uuid),public.update_restaurant_order_status(uuid,uuid,text) to authenticated;
commit;
notify pgrst,'reload schema';
