-- P0-04 Gates 1-6: one token-only, authoritative public QR ordering boundary.
-- Forward-only. Historical 021/043 remain excluded evidence and are not replayed.
begin;

alter table public.restaurants add column if not exists ordering_enabled boolean not null default false;
alter table public.orders add column if not exists is_test_order boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='tables_restaurant_id_id_key' and conrelid='public.tables'::regclass) then
    alter table public.tables add constraint tables_restaurant_id_id_key unique (restaurant_id,id);
  end if;
end $$;
create table if not exists public.public_order_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  token_hash text not null unique,
  revoked_at timestamptz,
  expires_at timestamptz not null default (clock_timestamp() + interval '90 days'),
  created_at timestamptz not null default clock_timestamp(),
  unique(table_id) deferrable initially immediate
);
alter table public.public_order_tokens enable row level security;
revoke all on table public.public_order_tokens from public, anon, authenticated;
create table if not exists public.public_qr_ordering_entitlements (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.public_qr_ordering_entitlements enable row level security;
revoke all on table public.public_qr_ordering_entitlements from public, anon, authenticated;
create or replace function public.assert_public_qr_ordering_entitlement(p_restaurant_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.public_qr_ordering_entitlements where restaurant_id=p_restaurant_id and active and (expires_at is null or expires_at>clock_timestamp())) then
    raise exception 'ENTITLEMENT_NOT_ACTIVE';
  end if;
end $$;
alter function public.assert_public_qr_ordering_entitlement(uuid) owner to postgres;
revoke all on function public.assert_public_qr_ordering_entitlement(uuid) from public,anon,authenticated;

alter table public.public_order_tokens
  add column if not exists expires_at timestamptz;
update public.public_order_tokens
set expires_at = created_at + interval '90 days'
where expires_at is null;
alter table public.public_order_tokens
  alter column expires_at set not null,
  alter column expires_at set default (clock_timestamp() + interval '90 days');
create index if not exists public_order_tokens_live_lookup_idx
  on public.public_order_tokens(token_hash, expires_at) where revoked_at is null;

create table public.public_qr_order_operations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_id uuid not null references public.tables(id) on delete restrict,
  token_id uuid not null references public.public_order_tokens(id) on delete restrict,
  idempotency_key uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  result_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id, token_id, idempotency_key),
  foreign key (restaurant_id, table_id) references public.tables(restaurant_id, id) on delete restrict,
  foreign key (restaurant_id, order_id) references public.orders(restaurant_id, id) on delete restrict
);
create index public_qr_order_operations_order_idx on public.public_qr_order_operations(restaurant_id, order_id);
alter table public.public_qr_order_operations enable row level security;
revoke all on table public.public_qr_order_operations from public, anon, authenticated;

create or replace function public.get_public_qr_order_context(p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_token public.public_order_tokens;
begin
  if length(trim(coalesce(p_token, ''))) < 32 then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  select tok.* into v_token
  from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id
  join public.tables t on t.id=tok.table_id and t.restaurant_id=tok.restaurant_id
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and tok.revoked_at is null and tok.expires_at > clock_timestamp()
    and t.is_active and r.status='active' and r.is_active and r.is_open and r.ordering_enabled;
  if v_token.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform public.assert_public_qr_ordering_entitlement(v_token.restaurant_id);
  return jsonb_build_object(
    'restaurant_name',(select name from public.restaurants where id=v_token.restaurant_id),
    'table_name',(select name from public.tables where id=v_token.table_id),
    'menu',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'name',m.name,'description',m.description,'price',m.price,'category',coalesce(nullif(m.category,''),'Menu'),
      'image_url',coalesce(nullif(m.image_url,''),m.photo_url),'photo_url',m.photo_url,'tags',m.tags,'option_config',m.option_config
    ) order by m.sort_order, m.id),'[]'::jsonb) from public.menu_items m
      left join public.categories c on c.id=m.category_id
      where m.restaurant_id=v_token.restaurant_id and m.is_active and m.is_available and not m.sold_out and (c.id is null or c.is_active))
  );
end $$;

create or replace function public.submit_public_qr_order(
  p_token text, p_items jsonb, p_customer_name text default '', p_note text default '', p_idempotency_key uuid default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_token public.public_order_tokens; v_order_id uuid; v_order_number bigint; v_existing public.public_qr_order_operations;
  v_tax_rate numeric(5,2); v_total numeric(10,2):=0; v_tax numeric(10,2); v_subtotal numeric(10,2);
  v_input jsonb; v_group jsonb; v_choice jsonb; v_selected jsonb; v_canonical_options jsonb; v_normalized jsonb:='[]'::jsonb;
  v_item public.menu_items; v_quantity integer; v_extra numeric(10,2); v_unit numeric(10,2); v_matches integer; v_fingerprint text; v_result jsonb;
begin
  if length(trim(coalesce(p_token,''))) < 32 then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  if length(coalesce(p_customer_name,'')) > 120 or length(coalesce(p_note,'')) > 1000 then raise exception 'ORDER_METADATA_TOO_LONG'; end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object('items',p_items,'customer_name',trim(coalesce(p_customer_name,'')),'note',trim(coalesce(p_note,'')))::text,'sha256'),'hex');
  select tok.* into v_token from public.public_order_tokens tok
    where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if v_token.id is null or v_token.revoked_at is not null or v_token.expires_at <= clock_timestamp() then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_token.restaurant_id::text || ':' || v_token.id::text || ':' || p_idempotency_key::text,0));
  select * into v_existing from public.public_qr_order_operations
    where restaurant_id=v_token.restaurant_id and token_id=v_token.id and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint is distinct from v_fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return v_existing.result_snapshot || jsonb_build_object('idempotent_replay',true);
  end if;
  select r.tax_rate into v_tax_rate from public.restaurants r join public.tables t on t.id=v_token.table_id and t.restaurant_id=r.id
    where r.id=v_token.restaurant_id and r.status='active' and r.is_active and r.is_open and r.ordering_enabled and t.is_active for update of r,t;
  if v_tax_rate is null then raise exception 'PUBLIC_ORDERING_UNAVAILABLE'; end if;
  perform public.assert_public_qr_ordering_entitlement(v_token.restaurant_id);
  for v_input in select value from jsonb_array_elements(p_items) loop
    begin v_quantity := (v_input->>'quantity')::integer; exception when others then raise exception 'INVALID_ORDER_ITEM'; end;
    if v_quantity not between 1 and 99 then raise exception 'INVALID_ORDER_ITEM'; end if;
    select m.* into v_item from public.menu_items m left join public.categories c on c.id=m.category_id
      where m.id=nullif(v_input->>'menu_item_id','')::uuid and m.restaurant_id=v_token.restaurant_id
      and m.is_active and m.is_available and not m.sold_out and (c.id is null or c.is_active) for share of m;
    if v_item.id is null then raise exception 'INVALID_ORDER_ITEM'; end if;
    v_selected:=coalesce(v_input->'options','[]'::jsonb);
    if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)<>jsonb_array_length(v_item.option_config) then raise exception 'INVALID_ORDER_OPTIONS'; end if;
    v_canonical_options:='[]'::jsonb; v_extra:=0;
    for v_group in select value from jsonb_array_elements(v_item.option_config) loop
      select count(*) into v_matches from jsonb_array_elements(v_selected) supplied where supplied->>'groupId'=v_group->>'id';
      if v_matches<>1 then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      select choice.value into v_choice from jsonb_array_elements(v_group->'choices') choice
        where choice.value->>'id'=(select supplied->>'choiceId' from jsonb_array_elements(v_selected) supplied where supplied->>'groupId'=v_group->>'id' limit 1) limit 1;
      if v_choice is null then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      v_extra:=v_extra+(v_choice->>'price')::numeric;
      v_canonical_options:=v_canonical_options || jsonb_build_array(jsonb_build_object('groupId',v_group->>'id','groupName',v_group->>'name','choiceId',v_choice->>'id','choiceName',v_choice->>'name','price',(v_choice->>'price')::numeric));
    end loop;
    v_unit:=round(v_item.price+v_extra,2); v_total:=v_total+v_unit*v_quantity;
    v_normalized:=v_normalized || jsonb_build_array(jsonb_build_object('menu_item_id',v_item.id,'item_name',v_item.name,'category',coalesce(nullif(v_item.category,''),'Menu'),'quantity',v_quantity,'base_price',v_item.price,'unit_price',v_unit,'notes',left(coalesce(v_input->>'notes',''),500),'options',v_canonical_options));
  end loop;
  v_total:=round(v_total,2); v_tax:=round(v_total*v_tax_rate/(100+v_tax_rate),2); v_subtotal:=v_total-v_tax;
  insert into public.orders(restaurant_id,table_id,customer_name,status,note,subtotal,tax,total,is_test_order)
    values(v_token.restaurant_id,v_token.table_id,left(trim(coalesce(p_customer_name,'')),120),'new',left(trim(coalesce(p_note,'')),1000),v_subtotal,v_tax,v_total,false)
    returning id,order_number into v_order_id,v_order_number;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,name_snapshot,category_snapshot,quantity,price,base_price,unit_price,notes,options)
    select v_token.restaurant_id,v_order_id,(line->>'menu_item_id')::uuid,line->>'item_name',line->>'item_name',line->>'category',(line->>'quantity')::integer,(line->>'unit_price')::numeric,(line->>'base_price')::numeric,(line->>'unit_price')::numeric,line->>'notes',line->'options' from jsonb_array_elements(v_normalized) line;
  if (select count(*) from public.order_items where order_id=v_order_id and restaurant_id=v_token.restaurant_id) <> jsonb_array_length(v_normalized) then raise exception 'ORDER_ITEM_INSERT_MISMATCH'; end if;
  v_result:=jsonb_build_object('id',v_order_id,'order_number',v_order_number,'idempotent_replay',false);
  insert into public.public_qr_order_operations(restaurant_id,table_id,token_id,idempotency_key,payload_fingerprint,order_id,result_snapshot)
    values(v_token.restaurant_id,v_token.table_id,v_token.id,p_idempotency_key,v_fingerprint,v_order_id,v_result);
  return v_result;
end $$;

create or replace function public.get_public_qr_order_status(p_token text, p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_token public.public_order_tokens;
begin
  select tok.* into v_token from public.public_order_tokens tok
    join public.restaurants r on r.id=tok.restaurant_id
    join public.tables t on t.id=tok.table_id and t.restaurant_id=tok.restaurant_id
    where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null and tok.expires_at>clock_timestamp()
      and r.status='active' and r.is_active and r.is_open and r.ordering_enabled and t.is_active;
  if v_token.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform public.assert_public_qr_ordering_entitlement(v_token.restaurant_id);
  return (select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'created_at',o.created_at)
    from public.orders o join public.public_qr_order_operations op on op.order_id=o.id and op.token_id=v_token.id
    where o.id=p_order_id and o.restaurant_id=v_token.restaurant_id and o.table_id=v_token.table_id);
end $$;

alter function public.get_public_qr_order_context(text) owner to postgres;
alter function public.submit_public_qr_order(text,jsonb,text,text,uuid) owner to postgres;
alter function public.get_public_qr_order_status(text,uuid) owner to postgres;
revoke all on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) from public,anon,authenticated;
grant execute on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) to anon,authenticated;

-- Retire every browser-callable legacy public order path and every token overload.
revoke all on function public.get_public_restaurant(text,text),public.submit_order(uuid,uuid,text,text,jsonb,text),public.get_customer_order_status(uuid,text,text) from public,anon,authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_public_order_context','submit_public_token_order','resolve_public_order_token')
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
end $$;
commit;
notify pgrst,'reload schema';
