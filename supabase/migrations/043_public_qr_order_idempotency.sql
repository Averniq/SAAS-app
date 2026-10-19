-- QR ordering can lose its HTTP response after the transaction commits.  A
-- client-generated local ID lets a retry return the original order instead of
-- creating another ticket for the same table.
create or replace function public.submit_public_token_order(
  p_token text,
  p_items jsonb,
  p_customer_name text,
  p_note text,
  p_local_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  t public.public_order_tokens;
  o uuid;
  existing_number bigint;
  total numeric;
begin
  if length(trim(coalesce(p_local_id, ''))) < 3 then raise exception 'INVALID_ORDER_ID'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ORDER_ITEMS'; end if;

  select * into t from public.public_order_tokens
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform public.assert_restaurant_live_order_entitlement(t.restaurant_id);
  if not exists(select 1 from public.restaurants where id=t.restaurant_id and ordering_enabled and is_active) then raise exception 'PUBLIC_ORDERING_UNAVAILABLE'; end if;

  select order_number into existing_number from public.orders
  where restaurant_id=t.restaurant_id and local_id=p_local_id limit 1;
  if existing_number is not null then return jsonb_build_object('order_number', existing_number, 'idempotent_replay', true); end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce((i->>'quantity')::integer, 0) not between 1 and 99
  ) then raise exception 'INVALID_ORDER_ITEMS'; end if;
  select coalesce(sum(m.price*(i->>'quantity')::integer),0) into total
  from jsonb_array_elements(p_items) i
  join public.menu_items m on m.id=(i->>'menu_item_id')::uuid and m.restaurant_id=t.restaurant_id and m.is_active and m.is_available;
  if total<=0 then raise exception 'INVALID_ORDER_ITEMS'; end if;

  insert into public.orders(restaurant_id,table_id,local_id,customer_name,note,subtotal,total,tax,is_test_order)
  values(t.restaurant_id,t.table_id,p_local_id,left(coalesce(p_customer_name,''),120),left(coalesce(p_note,''),500),total,total,0,false)
  on conflict (restaurant_id,local_id) where local_id is not null do nothing
  returning id into o;
  if o is null then
    select order_number into existing_number from public.orders where restaurant_id=t.restaurant_id and local_id=p_local_id;
    return jsonb_build_object('order_number', existing_number, 'idempotent_replay', true);
  end if;

  insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,quantity,price,name_snapshot,base_price,unit_price)
  select t.restaurant_id,o,m.id,m.name,(i->>'quantity')::integer,m.price,m.name,m.price,m.price
  from jsonb_array_elements(p_items) i
  join public.menu_items m on m.id=(i->>'menu_item_id')::uuid and m.restaurant_id=t.restaurant_id and m.is_active and m.is_available;
  return jsonb_build_object('order_number',(select order_number from public.orders where id=o));
end;
$$;

revoke all on function public.submit_public_token_order(text,jsonb,text,text,text) from public;
grant execute on function public.submit_public_token_order(text,jsonb,text,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
