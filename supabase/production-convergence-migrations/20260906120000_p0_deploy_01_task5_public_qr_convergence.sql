begin;

-- Forward-only extension of the retained Production token relation.
alter table public.public_order_tokens add column if not exists expires_at timestamptz;
create index if not exists public_order_tokens_live_lookup_idx
  on public.public_order_tokens(token_hash, expires_at) where revoked_at is null;

create table if not exists public.public_qr_ordering_entitlements (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.public_qr_ordering_entitlements enable row level security;
revoke all on public.public_qr_ordering_entitlements from public, anon, authenticated;

create table if not exists public.public_qr_order_operations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_id uuid not null references public.tables(id) on delete restrict,
  token_id uuid not null references public.public_order_tokens(id) on delete restrict,
  idempotency_key uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  result_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id, token_id, idempotency_key)
);
alter table public.public_qr_order_operations enable row level security;
revoke all on public.public_qr_order_operations from public, anon, authenticated;

commit;

create or replace function public.assert_public_qr_ordering_entitlement(p_restaurant_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.public_qr_ordering_entitlements where restaurant_id=p_restaurant_id and active and (expires_at is null or expires_at>clock_timestamp())) then raise exception 'ENTITLEMENT_NOT_ACTIVE'; end if;
end $$;
create or replace function public.get_public_qr_order_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.public_order_tokens;
begin
 select tok.* into t from public.public_order_tokens tok join public.restaurants r on r.id=tok.restaurant_id and r.organization_id=tok.organization_id join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null and (tok.expires_at is null or tok.expires_at>clock_timestamp()) and r.ordering_enabled;
 if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
 perform public.assert_public_qr_ordering_entitlement(t.restaurant_id);
 return jsonb_build_object(
   'restaurant', (select jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug) from public.restaurants r where r.id=t.restaurant_id),
   'table', (select jsonb_build_object('id',tb.id,'name',tb.name,'table_number',tb.table_number) from public.tables tb where tb.id=t.table_id and tb.restaurant_id=t.restaurant_id),
   'categories', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.id) from public.categories c where c.restaurant_id=t.restaurant_id and c.is_active), '[]'::jsonb),
   'menu_items', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'name',m.name,'description',m.description,'price',m.price,'is_available',m.is_available,'sort_order',m.sort_order) order by m.sort_order,m.id) from public.menu_items m where m.restaurant_id=t.restaurant_id and m.is_active and m.is_available), '[]'::jsonb)
 );
end $$;
create or replace function public.submit_public_qr_order(p_token text,p_items jsonb,p_customer_name text,p_note text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.public_order_tokens; o uuid; total numeric:=0; fp text; prior public.public_qr_order_operations; result jsonb;
begin
  if p_idempotency_key is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'INVALID_ORDER_REQUEST'; end if;
  select tok.* into t from public.public_order_tokens tok join public.restaurants r on r.id=tok.restaurant_id and r.organization_id=tok.organization_id join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null and (tok.expires_at is null or tok.expires_at>clock_timestamp()) and r.ordering_enabled for update of tok;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if; perform public.assert_public_qr_ordering_entitlement(t.restaurant_id);
  fp:=encode(extensions.digest(jsonb_build_object('items',p_items,'customer_name',coalesce(p_customer_name,''),'note',coalesce(p_note,''))::text,'sha256'),'hex');
  select * into prior from public.public_qr_order_operations where restaurant_id=t.restaurant_id and token_id=t.id and idempotency_key=p_idempotency_key;
  if prior.id is not null then if prior.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return prior.result_snapshot || jsonb_build_object('idempotent_replay',true); end if;
  select coalesce(sum(m.price*(x->>'quantity')::int),0) into total from jsonb_array_elements(p_items)x join public.menu_items m on m.id=(x->>'menu_item_id')::uuid and m.restaurant_id=t.restaurant_id and m.is_active and m.is_available;
  if total<=0 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  insert into public.orders(restaurant_id,table_id,customer_name,note,subtotal,tax,total,is_test_order) values(t.restaurant_id,t.table_id,left(coalesce(p_customer_name,''),120),left(coalesce(p_note,''),1000),total,0,total,false) returning id into o;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,quantity,price,name_snapshot,base_price,unit_price,category_snapshot)
  select t.restaurant_id,o,m.id,m.name,(x->>'quantity')::int,m.price,m.name,m.price,m.price,coalesce(m.category,'')
  from jsonb_array_elements(p_items)x join public.menu_items m on m.id=(x->>'menu_item_id')::uuid and m.restaurant_id=t.restaurant_id;
  result:=jsonb_build_object('id',o,'idempotent_replay',false); insert into public.public_qr_order_operations(restaurant_id,table_id,token_id,idempotency_key,payload_fingerprint,order_id,result_snapshot) values(t.restaurant_id,t.table_id,t.id,p_idempotency_key,fp,o,result); return result;
end $$;
create or replace function public.get_public_qr_order_status(p_token text,p_order_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.public_order_tokens; r jsonb;
begin perform public.get_public_qr_order_context(p_token); select tok.* into t from public.public_order_tokens tok where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex'); select jsonb_build_object('id',o.id,'status',o.status,'created_at',o.created_at) into r from public.orders o join public.public_qr_order_operations q on q.order_id=o.id and q.token_id=t.id where o.id=p_order_id and o.restaurant_id=t.restaurant_id and o.table_id=t.table_id; if r is null then raise exception 'PUBLIC_ORDER_NOT_FOUND'; end if; return r; end $$;
revoke all on function public.assert_public_qr_ordering_entitlement(uuid),public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) to anon,authenticated;
