-- Kitchen voids remain append-only: records are retained and every affected
-- entity receives an audit event. This also closes the NULL-role path in the
-- earlier SECURITY DEFINER functions.

create or replace function public.void_restaurant_order(p_restaurant_id uuid,p_order_id uuid,p_reason text,p_note text default '',p_manager_pin text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; i public.order_items; v_role text; v_approval uuid; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if coalesce(v_role,'') not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if trim(coalesce(p_reason,'')) not in ('Wrong table','Duplicate order','Customer cancelled','Order entered by mistake','Kitchen issue','Other') then raise exception 'INVALID_VOID_REASON'; end if;
  if trim(coalesce(p_reason,''))='Other' and trim(coalesce(p_note,''))='' then raise exception 'VOID_NOTE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if o.id is null or o.status='voided' then raise exception 'ORDER_NOT_VOIDABLE'; end if;
  if o.status in ('completed','paid','preparing','ready','kitchen_accepted') or o.payment_status='paid' then v_approval:=public.require_manager_approval(p_restaurant_id,p_manager_pin,'void_order',p_order_id,null,p_reason,p_note); end if;
  for i in select * from public.order_items where order_id=o.id and restaurant_id=p_restaurant_id and status <> 'voided' for update loop
    update public.order_items set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=i.id;
    perform public.write_order_audit(p_restaurant_id,o.id,i.id,null,'item_voided','order_item',to_jsonb(i),jsonb_build_object('status','voided'),p_reason,p_note,v_approval);
    v_count:=v_count+1;
  end loop;
  update public.orders set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=o.id;
  perform public.write_order_audit(p_restaurant_id,o.id,null,null,'order_voided','order',to_jsonb(o),jsonb_build_object('status','voided','voided_item_count',v_count),p_reason,p_note,v_approval);
  return jsonb_build_object('id',o.id,'status','voided','voided_item_count',v_count,'approved_by',v_approval);
end $$;

create or replace function public.void_restaurant_order_item(p_restaurant_id uuid,p_order_item_id uuid,p_reason text,p_note text default '',p_manager_pin text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.order_items; o public.orders; v_role text; v_approval uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if coalesce(v_role,'') not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if trim(coalesce(p_reason,'')) not in ('Wrong item entered','Duplicate item','Out of stock','Kitchen mistake','Other') then raise exception 'INVALID_VOID_REASON'; end if;
  if trim(coalesce(p_reason,''))='Other' and trim(coalesce(p_note,''))='' then raise exception 'VOID_NOTE_REQUIRED'; end if;
  select * into i from public.order_items where id=p_order_item_id and restaurant_id=p_restaurant_id for update;
  select * into o from public.orders where id=i.order_id and restaurant_id=p_restaurant_id for update;
  if i.id is null or i.status='voided' or o.status in ('paid','completed','voided') then raise exception 'ITEM_NOT_VOIDABLE'; end if;
  if o.status in ('kitchen_accepted','preparing','ready') then v_approval:=public.require_manager_approval(p_restaurant_id,p_manager_pin,'void_item',o.id,i.id,p_reason,p_note); end if;
  update public.order_items set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=i.id;
  perform public.write_order_audit(p_restaurant_id,o.id,i.id,null,'item_voided','order_item',to_jsonb(i),jsonb_build_object('status','voided'),p_reason,p_note,v_approval);
  return jsonb_build_object('id',i.id,'order_id',o.id,'status','voided','approved_by',v_approval);
end $$;

create or replace function public.void_restaurant_order_items(p_restaurant_id uuid,p_order_item_ids uuid[],p_reason text,p_note text default '',p_manager_pin text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; i public.order_items; v_role text; v_approval uuid; v_order_id uuid; v_item_id uuid; v_ids uuid[]; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if coalesce(v_role,'') not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  select array_agg(distinct id) into v_ids from unnest(coalesce(p_order_item_ids,'{}'::uuid[])) id;
  if coalesce(array_length(v_ids,1),0)=0 then raise exception 'ITEM_NOT_VOIDABLE'; end if;
  if trim(coalesce(p_reason,'')) not in ('Wrong item entered','Duplicate item','Out of stock','Kitchen mistake','Other') then raise exception 'INVALID_VOID_REASON'; end if;
  if trim(coalesce(p_reason,''))='Other' and trim(coalesce(p_note,''))='' then raise exception 'VOID_NOTE_REQUIRED'; end if;
  select order_id into v_order_id from public.order_items where id=v_ids[1] and restaurant_id=p_restaurant_id;
  select * into o from public.orders where id=v_order_id and restaurant_id=p_restaurant_id for update;
  if o.id is null or o.status in ('paid','completed','voided') then raise exception 'ITEM_NOT_VOIDABLE'; end if;
  if o.status in ('kitchen_accepted','preparing','ready') then v_approval:=public.require_manager_approval(p_restaurant_id,p_manager_pin,'void_item',o.id,null,p_reason,p_note); end if;
  foreach v_item_id in array v_ids loop
    select * into i from public.order_items where id=v_item_id and restaurant_id=p_restaurant_id for update;
    if i.id is null or i.order_id <> o.id or i.status='voided' then raise exception 'ITEM_NOT_VOIDABLE'; end if;
    update public.order_items set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),void_note=left(coalesce(p_note,''),1000),approved_by=v_approval where id=i.id;
    perform public.write_order_audit(p_restaurant_id,o.id,i.id,null,'item_voided','order_item',to_jsonb(i),jsonb_build_object('status','voided'),p_reason,p_note,v_approval);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('order_id',o.id,'voided_item_count',v_count,'approved_by',v_approval);
end $$;

revoke all on function public.void_restaurant_order_items(uuid,uuid[],text,text,text) from public;
grant execute on function public.void_restaurant_order_items(uuid,uuid[],text,text,text) to authenticated;
