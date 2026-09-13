-- P0 DEPLOY 01 / Task 9: route-scoped platform administrator dashboard access.
-- This adds no anonymous access and preserves every existing staff policy.
begin;

create policy "platform admins read tables" on public.tables for select to authenticated using (public.is_platform_admin());
create policy "platform admins insert tables" on public.tables for insert to authenticated with check (public.is_platform_admin());
create policy "platform admins update tables" on public.tables for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins delete tables" on public.tables for delete to authenticated using (public.is_platform_admin());

create policy "platform admins read categories" on public.categories for select to authenticated using (public.is_platform_admin());
create policy "platform admins insert categories" on public.categories for insert to authenticated with check (public.is_platform_admin());
create policy "platform admins update categories" on public.categories for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins delete categories" on public.categories for delete to authenticated using (public.is_platform_admin());

create policy "platform admins read menu" on public.menu_items for select to authenticated using (public.is_platform_admin());
create policy "platform admins insert menu" on public.menu_items for insert to authenticated with check (public.is_platform_admin());
create policy "platform admins update menu" on public.menu_items for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins delete menu" on public.menu_items for delete to authenticated using (public.is_platform_admin());

create policy "platform admins read orders" on public.orders for select to authenticated using (public.is_platform_admin());
create policy "platform admins read order items" on public.order_items for select to authenticated using (public.is_platform_admin());

create or replace function public.update_restaurant_order_status(p_restaurant_id uuid,p_order_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; v_role text; v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if not public.is_platform_admin() and v_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if p_action='Paid' then raise exception 'PAID_STATUS_REQUIRES_PAYMENT_LEDGER'; end if;
  if p_action not in ('Preparing','Ready','Served') then raise exception 'INVALID_ORDER_ACTION_USE_VOID_OR_PAYMENT_RPC'; end if;
  if not public.is_platform_admin() and v_role not in ('owner','manager','staff','kitchen') then raise exception 'KITCHEN_ROLE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('voided','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  v_status:=case p_action when 'Preparing' then 'preparing' when 'Ready' then 'ready' when 'Served' then 'served' end;
  update public.orders set status=v_status,served_at=case when p_action='Served' then now() else served_at end where id=o.id;
  return jsonb_build_object('id',o.id,'status',v_status);
end $$;

create or replace function public.record_restaurant_order_payment(p_restaurant_id uuid,p_order_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_role text; updated_order public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_method not in ('Cash','Card','EFTPOS','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select role into target_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if not public.is_platform_admin() and target_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  update public.orders set status='completed',closed_at=coalesce(closed_at,now()),paid_at=coalesce(paid_at,now()),payment_method=p_method,updated_at=now()
  where id=p_order_id and restaurant_id=p_restaurant_id and status not in ('cancelled','completed') returning * into updated_order;
  if updated_order.id is null then raise exception 'ORDER_NOT_PAYABLE'; end if;
  return jsonb_build_object('id',updated_order.id,'restaurant_id',updated_order.restaurant_id,'status',updated_order.status,'payment_method',updated_order.payment_method,'paid_at',updated_order.paid_at);
end $$;

grant execute on function public.record_restaurant_order_payment(uuid,uuid,text) to authenticated;

do $platform_reports$
begin
  if exists (select 1 from pg_namespace where nspname='reporting') then
    execute $report_access$
      create or replace function reporting.assert_report_access(p_restaurant_id uuid)
      returns void language plpgsql stable security invoker set search_path='' as $fn$
      begin
        if auth.uid() is null or not (public.is_platform_admin() or public.has_restaurant_role(p_restaurant_id,array['owner','manager'])) then raise exception 'REPORT_ACCESS_DENIED'; end if;
      end $fn$
    $report_access$;
  end if;
end $platform_reports$;

create or replace function public.issue_public_qr_table_token(p_restaurant_id uuid,p_table_id uuid,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_token public.public_order_tokens; v_raw text; v_rotated boolean := false;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select organization_id into v_org from public.restaurants where id=p_restaurant_id;
 if v_org is null then raise exception 'RESTAURANT_ORGANIZATION_REQUIRED'; end if;
 perform 1 from public.tables where id=p_table_id and restaurant_id=p_restaurant_id for update;
 if not found then raise exception 'TABLE_RESTAURANT_MISMATCH'; end if;
 if not (public.is_platform_admin() or public.has_restaurant_role(p_restaurant_id,array['owner','manager'])) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
 if p_expires_at is not null and p_expires_at <= clock_timestamp() then raise exception 'INVALID_TOKEN_EXPIRY'; end if;
 v_raw := encode(extensions.gen_random_bytes(32),'hex');
 select * into v_token from public.public_order_tokens where table_id=p_table_id for update;
 if v_token.id is null then
   insert into public.public_order_tokens(organization_id,restaurant_id,table_id,token_hash,expires_at) values(v_org,p_restaurant_id,p_table_id,encode(extensions.digest(v_raw,'sha256'),'hex'),p_expires_at) returning * into v_token;
 else
   v_rotated := true;
   update public.public_order_tokens set organization_id=v_org,restaurant_id=p_restaurant_id,token_hash=encode(extensions.digest(v_raw,'sha256'),'hex'),revoked_at=null,expires_at=p_expires_at where id=v_token.id returning * into v_token;
 end if;
 insert into public.public_order_token_issuance_audit(organization_id,restaurant_id,table_id,token_id,actor_user_id,action,expires_at) values(v_org,p_restaurant_id,p_table_id,v_token.id,auth.uid(),case when v_rotated then 'rotated' else 'issued' end,p_expires_at);
 return jsonb_build_object('token',v_raw,'token_id',v_token.id,'organization_id',v_org,'restaurant_id',p_restaurant_id,'table_id',p_table_id,'expires_at',p_expires_at,'rotated',v_rotated);
end $$;

create or replace function public.get_public_qr_table_token_metadata(p_restaurant_id uuid)
returns table(table_id uuid,has_active_token boolean) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not (public.is_platform_admin() or public.has_restaurant_role(p_restaurant_id,array['owner','manager'])) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  return query select t.id,exists(select 1 from public.public_order_tokens tok where tok.restaurant_id=p_restaurant_id and tok.table_id=t.id and tok.revoked_at is null and (tok.expires_at is null or tok.expires_at>clock_timestamp())) from public.tables t where t.restaurant_id=p_restaurant_id;
end $$;

revoke all on function public.issue_public_qr_table_token(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.issue_public_qr_table_token(uuid,uuid,timestamptz) to authenticated;
revoke all on function public.get_public_qr_table_token_metadata(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_qr_table_token_metadata(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
