-- Canonical restaurant-scoped QR API. No hosted organization/entitlement schema
-- is required. Bearer tokens are never stored in plaintext or exposed by reads.
begin;

alter table public.tables add constraint tables_restaurant_id_id_key unique (restaurant_id,id);

create table public.public_order_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (restaurant_id,table_id,id),
  foreign key (restaurant_id,table_id) references public.tables(restaurant_id,id) on delete restrict
);
create unique index public_order_tokens_current_table_idx on public.public_order_tokens(table_id) where revoked_at is null;
create index public_order_tokens_actor_idx on public.public_order_tokens(created_by);

create table public.public_order_token_issuance_audit (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  token_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('issued','rotated')),
  expires_at timestamptz,
  issued_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id,table_id,token_id) references public.public_order_tokens(restaurant_id,table_id,id) on delete restrict
);
create index public_order_token_audit_scope_idx on public.public_order_token_issuance_audit(restaurant_id,table_id,token_id);
create index public_order_token_audit_actor_idx on public.public_order_token_issuance_audit(actor_user_id);

create table public.public_qr_order_operations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  token_id uuid not null,
  idempotency_key uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  order_id uuid not null unique,
  result_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id,token_id,idempotency_key),
  foreign key (restaurant_id,table_id,token_id) references public.public_order_tokens(restaurant_id,table_id,id) on delete restrict,
  foreign key (restaurant_id,order_id) references public.orders(restaurant_id,id) on delete restrict
);
create index public_qr_order_operations_token_idx on public.public_qr_order_operations(restaurant_id,table_id,token_id);
alter table public.public_order_tokens enable row level security;
alter table public.public_order_token_issuance_audit enable row level security;
alter table public.public_qr_order_operations enable row level security;
revoke all on public.public_order_tokens,public.public_order_token_issuance_audit,public.public_qr_order_operations from public,anon,authenticated,service_role;

create function public.issue_public_qr_table_token(p_restaurant_id uuid,p_table_id uuid,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_raw text; v_id uuid; v_rotated boolean;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at<=clock_timestamp()) then raise exception 'INVALID_TOKEN_EXPIRY'; end if;
  -- Serialize issuers without blocking the order FK's KEY SHARE lock. This
  -- avoids a table/token lock inversion with an in-flight order submission.
  perform 1 from public.tables where id=p_table_id and restaurant_id=p_restaurant_id and is_active for no key update;
  if not found then raise exception 'TABLE_RESTAURANT_MISMATCH'; end if;
  select exists(select 1 from public.public_order_tokens where table_id=p_table_id) into v_rotated;
  update public.public_order_tokens set revoked_at=clock_timestamp() where table_id=p_table_id and revoked_at is null;
  v_raw:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.public_order_tokens(restaurant_id,table_id,token_hash,created_by,expires_at)
  values(p_restaurant_id,p_table_id,encode(extensions.digest(v_raw,'sha256'),'hex'),auth.uid(),p_expires_at) returning id into v_id;
  insert into public.public_order_token_issuance_audit(restaurant_id,table_id,token_id,actor_user_id,action,expires_at)
  values(p_restaurant_id,p_table_id,v_id,auth.uid(),case when v_rotated then 'rotated' else 'issued' end,p_expires_at);
  return jsonb_build_object('token',v_raw,'token_id',v_id,'restaurant_id',p_restaurant_id,'table_id',p_table_id,'expires_at',p_expires_at,'rotated',v_rotated);
end $$;

create function public.get_public_qr_table_token_metadata(p_restaurant_id uuid)
returns table(table_id uuid,has_active_token boolean) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  return query select tb.id,exists(select 1 from public.public_order_tokens tok
    where tok.table_id=tb.id and tok.restaurant_id=p_restaurant_id and tok.revoked_at is null
      and (tok.expires_at is null or tok.expires_at>clock_timestamp()))
  from public.tables tb where tb.restaurant_id=p_restaurant_id;
end $$;

create function public.get_public_qr_order_context(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.public_order_tokens;
begin
  select tok.* into t from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id and r.is_active and r.status in ('active','onboarding')
  join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id and tb.is_active
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null
    and (tok.expires_at is null or tok.expires_at>clock_timestamp()) for share of tok;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  if t.expires_at is not null and t.expires_at<=clock_timestamp() then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  return jsonb_build_object(
    'restaurant',(select jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'subtitle',r.subtitle,
      'logo_url',r.logo_url,'theme_config',r.theme_config,'address',r.address,'phone',r.phone,'tax_rate',r.tax_rate,
      'is_open',r.is_open,'timezone',r.timezone) from public.restaurants r where r.id=t.restaurant_id),
    'table',(select jsonb_build_object('id',tb.id,'name',coalesce(nullif(tb.table_name,''),tb.name),'number',tb.table_number,'table_number',tb.table_number)
      from public.tables tb where tb.id=t.table_id and tb.restaurant_id=t.restaurant_id),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order,'is_active',c.is_active) order by c.sort_order,c.id)
      from public.categories c where c.restaurant_id=t.restaurant_id and c.is_active),'[]'::jsonb),
    'menu_items',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'local_id',m.local_id,'category_id',m.category_id,
      'category',coalesce(c.name,m.category),'name',m.name,'description',m.description,'price',m.price,
      'image_url',coalesce(nullif(m.image_url,''),m.photo_url),'photo_url',m.photo_url,'tags',m.tags,
      'option_template',m.option_template,'option_config',m.option_config,'is_active',m.is_active,
      'is_available',m.is_available and not m.sold_out,'sold_out',m.sold_out,'sort_order',m.sort_order) order by c.sort_order,m.sort_order,m.id)
      from public.menu_items m left join public.categories c on c.id=m.category_id and c.restaurant_id=t.restaurant_id
      where m.restaurant_id=t.restaurant_id and m.is_active and m.is_available and not m.sold_out
        and (m.category_id is null or c.is_active)),'[]'::jsonb));
end $$;

create function public.submit_public_qr_order(p_token text,p_items jsonb,p_customer_name text,p_note text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.public_order_tokens; prior public.public_qr_order_operations;
  o uuid; v_number bigint; v_tax_rate numeric; v_total numeric(10,2):=0; v_tax numeric(10,2);
  fp text; result jsonb; input_item jsonb; selected_options jsonb; configured_group jsonb; configured_choice jsonb;
  canonical_options jsonb; normalized_items jsonb:='[]'::jsonb; m public.menu_items;
  item_id uuid; quantity integer; matches integer; extra numeric(10,2); unit_price numeric(10,2);
begin
  if p_idempotency_key is null or p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_ORDER_REQUEST'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ORDER_REQUEST'; end if;
  select tok.* into t from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id and r.is_active and r.status in ('active','onboarding')
  join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id and tb.is_active
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null
    and (tok.expires_at is null or tok.expires_at>clock_timestamp()) for update of tok;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  -- Recheck expiry after lock acquisition, including after a concurrent request.
  if t.expires_at is not null and t.expires_at<=clock_timestamp() then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  fp:=encode(extensions.digest(jsonb_build_object('items',p_items,'customer_name',coalesce(p_customer_name,''),'note',coalesce(p_note,''))::text,'sha256'),'hex');
  select * into prior from public.public_qr_order_operations where restaurant_id=t.restaurant_id and token_id=t.id and idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.payload_fingerprint is distinct from fp then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return prior.result_snapshot || jsonb_build_object('idempotent_replay',true);
  end if;
  select tax_rate into v_tax_rate from public.restaurants where id=t.restaurant_id and is_open;
  if v_tax_rate is null then raise exception 'PUBLIC_ORDERING_UNAVAILABLE'; end if;
  for input_item in select value from jsonb_array_elements(p_items) loop
    begin
      item_id:=nullif(input_item->>'menu_item_id','')::uuid;
      if coalesce(input_item->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'INVALID_ORDER_ITEM'; end if;
      quantity:=(input_item->>'quantity')::integer;
    exception when others then raise exception 'INVALID_ORDER_ITEM'; end;
    if quantity not between 1 and 99 then raise exception 'INVALID_ORDER_ITEM'; end if;
    select mi.* into m from public.menu_items mi
    left join public.categories c on c.id=mi.category_id and c.restaurant_id=t.restaurant_id
    where mi.id=item_id and mi.restaurant_id=t.restaurant_id and mi.is_active and mi.is_available and not mi.sold_out
      and (mi.category_id is null or c.is_active);
    if m.id is null then raise exception 'INVALID_ORDER_ITEM'; end if;
    selected_options:=coalesce(input_item->'options','[]'::jsonb);
    if jsonb_typeof(selected_options) is distinct from 'array' then raise exception 'INVALID_ORDER_OPTIONS'; end if;
    if jsonb_array_length(selected_options)<>jsonb_array_length(m.option_config) then raise exception 'INVALID_ORDER_OPTIONS'; end if;
    canonical_options:='[]'::jsonb; extra:=0;
    for configured_group in select value from jsonb_array_elements(m.option_config) loop
      select count(*) into matches from jsonb_array_elements(selected_options) supplied where supplied->>'groupId'=configured_group->>'id';
      if matches<>1 then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      select value into configured_choice from jsonb_array_elements(configured_group->'choices')
      where value->>'id'=(select supplied->>'choiceId' from jsonb_array_elements(selected_options) supplied where supplied->>'groupId'=configured_group->>'id');
      if configured_choice is null then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      extra:=extra+(configured_choice->>'price')::numeric;
      canonical_options:=canonical_options || jsonb_build_array(jsonb_build_object('groupId',configured_group->>'id','groupName',configured_group->>'name',
        'choiceId',configured_choice->>'id','choiceName',configured_choice->>'name','price',(configured_choice->>'price')::numeric));
    end loop;
    unit_price:=round(m.price+extra,2); v_total:=v_total+unit_price*quantity;
    normalized_items:=normalized_items || jsonb_build_array(jsonb_build_object('menu_item_id',m.id,'name',m.name,'category',coalesce(nullif(m.category,''),'Menu'),
      'quantity',quantity,'base_price',m.price,'unit_price',unit_price,'options',canonical_options));
  end loop;
  v_tax:=round(v_total*v_tax_rate/(100+v_tax_rate),2);
  insert into public.orders(restaurant_id,table_id,customer_name,status,note,subtotal,tax,total)
  values(t.restaurant_id,t.table_id,left(coalesce(p_customer_name,''),120),'new',left(coalesce(p_note,''),1000),v_total-v_tax,v_tax,v_total) returning id,order_number into o,v_number;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,name_snapshot,category_snapshot,quantity,price,base_price,unit_price,options)
  select t.restaurant_id,o,(item->>'menu_item_id')::uuid,item->>'name',item->>'name',item->>'category',(item->>'quantity')::integer,
    (item->>'unit_price')::numeric,(item->>'base_price')::numeric,(item->>'unit_price')::numeric,item->'options' from jsonb_array_elements(normalized_items) item;
  result:=jsonb_build_object('id',o,'order_number',v_number,'idempotent_replay',false);
  insert into public.public_qr_order_operations(restaurant_id,table_id,token_id,idempotency_key,payload_fingerprint,order_id,result_snapshot)
  values(t.restaurant_id,t.table_id,t.id,p_idempotency_key,fp,o,result);
  return result;
end $$;

create function public.get_public_qr_order_status(p_token text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.public_order_tokens; result jsonb;
begin
  -- Validate only the token scope; status polling does not fetch the catalogue.
  select tok.* into t from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id and r.is_active and r.status in ('active','onboarding')
  join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id and tb.is_active
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null
    and (tok.expires_at is null or tok.expires_at>clock_timestamp()) for share of tok;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  if t.expires_at is not null and t.expires_at<=clock_timestamp() then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'created_at',o.created_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('menu_item_id',oi.menu_item_id,'name',oi.name_snapshot,'quantity',oi.quantity,
      'base_price',oi.base_price,'unit_price',oi.unit_price,'options',oi.options) order by oi.id)
      from public.order_items oi where oi.order_id=o.id and oi.restaurant_id=t.restaurant_id),'[]'::jsonb)) into result
  from public.orders o join public.public_qr_order_operations q on q.order_id=o.id and q.token_id=t.id
    and q.restaurant_id=t.restaurant_id and q.table_id=t.table_id
  where o.id=p_order_id and o.restaurant_id=t.restaurant_id and o.table_id=t.table_id;
  if result is null then raise exception 'PUBLIC_ORDER_NOT_FOUND'; end if;
  return result;
end $$;

-- Retire every legacy public ordering entry point, including authenticated
-- callers: signed-in users must not bypass token scoping through old RPCs.
revoke all on function public.get_public_restaurant(text,text),public.submit_order(uuid,uuid,text,text,jsonb,text),public.get_customer_order_status(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.issue_public_qr_table_token(uuid,uuid,timestamptz),public.get_public_qr_table_token_metadata(uuid),
  public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.issue_public_qr_table_token(uuid,uuid,timestamptz),public.get_public_qr_table_token_metadata(uuid) to authenticated;
grant execute on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) to anon,authenticated;
commit;
notify pgrst,'reload schema';
