-- P0-DEPLOY-01 Task 7: extend the accepted token-only boundary with the
-- existing authoritative menu display, option-pricing, and snapshot model.
begin;

create or replace function public.get_public_qr_order_context(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.public_order_tokens;
begin
  select tok.* into t
  from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id and r.organization_id=tok.organization_id
  join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and tok.revoked_at is null
    and (tok.expires_at is null or tok.expires_at>clock_timestamp())
    and r.ordering_enabled;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform public.assert_public_qr_ordering_entitlement(t.restaurant_id);

  return jsonb_build_object(
    'restaurant', (
      select jsonb_build_object(
        'id',r.id,'name',r.name,'slug',r.slug,'subtitle',r.subtitle,
        'logo_url',r.logo_url,'theme_config',r.theme_config,'address',r.address,
        'phone',r.phone,'tax_rate',r.tax_rate,'is_open',r.is_open
      ) from public.restaurants r where r.id=t.restaurant_id and r.organization_id=t.organization_id
    ),
    'table', (
      select jsonb_build_object('id',tb.id,'name',coalesce(nullif(tb.table_name,''),tb.name),'table_number',tb.table_number)
      from public.tables tb where tb.id=t.table_id and tb.restaurant_id=t.restaurant_id
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order,'is_active',c.is_active) order by c.sort_order,c.id)
      from public.categories c where c.restaurant_id=t.restaurant_id and c.is_active
    ), '[]'::jsonb),
    'menu_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'local_id',m.local_id,'category_id',m.category_id,'category',coalesce(c.name,m.category),
        'name',m.name,'description',m.description,'price',m.price,
        'image_url',coalesce(nullif(m.image_url,''),m.photo_url),'photo_url',m.photo_url,
        'tags',m.tags,'option_template',m.option_template,'option_config',m.option_config,
        'is_active',m.is_active,'is_available',m.is_available and not m.sold_out,
        'sold_out',m.sold_out,'sort_order',m.sort_order
      ) order by c.sort_order,m.sort_order,m.id)
      from public.menu_items m
      left join public.categories c on c.id=m.category_id and c.restaurant_id=t.restaurant_id and c.is_active
      where m.restaurant_id=t.restaurant_id and m.is_active and m.is_available and not m.sold_out
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.submit_public_qr_order(
  p_token text,p_items jsonb,p_customer_name text,p_note text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  t public.public_order_tokens;
  o uuid;
  v_order_number bigint;
  v_tax_rate numeric(5,2);
  v_subtotal numeric(10,2):=0;
  v_tax numeric(10,2):=0;
  v_total numeric(10,2):=0;
  fp text;
  prior public.public_qr_order_operations;
  result jsonb;
  input_item jsonb;
  selected_option jsonb;
  configured_group jsonb;
  configured_choice jsonb;
  canonical_options jsonb;
  normalized_items jsonb:='[]'::jsonb;
  target_menu_item_id uuid;
  target_item_name text;
  target_category text;
  target_base_price numeric(10,2);
  target_unit_price numeric(10,2);
  target_option_config jsonb;
  target_quantity integer;
  option_matches integer;
  option_extra numeric(10,2);
begin
  if p_idempotency_key is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_ORDER_REQUEST';
  end if;
  select tok.* into t
  from public.public_order_tokens tok
  join public.restaurants r on r.id=tok.restaurant_id and r.organization_id=tok.organization_id
  join public.tables tb on tb.id=tok.table_id and tb.restaurant_id=tok.restaurant_id
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and tok.revoked_at is null
    and (tok.expires_at is null or tok.expires_at>clock_timestamp())
    and r.ordering_enabled
  for update of tok;
  if t.id is null then raise exception 'PUBLIC_TOKEN_NOT_FOUND'; end if;
  perform public.assert_public_qr_ordering_entitlement(t.restaurant_id);

  fp:=encode(extensions.digest(jsonb_build_object('items',p_items,'customer_name',coalesce(p_customer_name,''),'note',coalesce(p_note,''))::text,'sha256'),'hex');
  select * into prior from public.public_qr_order_operations
  where restaurant_id=t.restaurant_id and token_id=t.id and idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return prior.result_snapshot || jsonb_build_object('idempotent_replay',true);
  end if;

  select tax_rate into v_tax_rate from public.restaurants
  where id=t.restaurant_id and organization_id=t.organization_id and ordering_enabled and is_open;
  if v_tax_rate is null then raise exception 'PUBLIC_ORDERING_UNAVAILABLE'; end if;

  for input_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      target_menu_item_id:=nullif(input_item->>'menu_item_id','')::uuid;
      target_quantity:=(input_item->>'quantity')::integer;
    exception when others then raise exception 'INVALID_ORDER_ITEM';
    end;
    if target_quantity not between 1 and 99 then raise exception 'INVALID_ORDER_ITEM'; end if;

    select m.name,m.price,coalesce(nullif(m.category,''),'Menu'),m.option_config
    into target_item_name,target_base_price,target_category,target_option_config
    from public.menu_items m
    where m.id=target_menu_item_id and m.restaurant_id=t.restaurant_id
      and m.is_active and m.is_available and not m.sold_out;
    if target_item_name is null then raise exception 'INVALID_ORDER_ITEM'; end if;

    selected_option:=coalesce(input_item->'options','[]'::jsonb);
    if jsonb_typeof(selected_option)<>'array'
       or jsonb_array_length(selected_option)<>jsonb_array_length(target_option_config) then
      raise exception 'INVALID_ORDER_OPTIONS';
    end if;
    canonical_options:='[]'::jsonb;
    option_extra:=0;
    for configured_group in select value from jsonb_array_elements(target_option_config)
    loop
      select count(*) into option_matches from jsonb_array_elements(selected_option) supplied
      where supplied->>'groupId'=configured_group->>'id';
      if option_matches <> 1 then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      select value into configured_choice from jsonb_array_elements(configured_group->'choices')
      where value->>'id'=(select supplied->>'choiceId' from jsonb_array_elements(selected_option) supplied where supplied->>'groupId'=configured_group->>'id' limit 1)
      limit 1;
      if configured_choice is null then raise exception 'INVALID_ORDER_OPTIONS'; end if;
      option_extra:=option_extra+(configured_choice->>'price')::numeric;
      canonical_options:=canonical_options || jsonb_build_array(jsonb_build_object(
        'groupId',configured_group->>'id','groupName',configured_group->>'name',
        'choiceId',configured_choice->>'id','choiceName',configured_choice->>'name',
        'price',(configured_choice->>'price')::numeric
      ));
    end loop;
    target_unit_price:=round(target_base_price+option_extra,2);
    v_total:=v_total+target_unit_price*target_quantity;
    normalized_items:=normalized_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id',target_menu_item_id,'item_name',target_item_name,'category',target_category,
      'quantity',target_quantity,'base_price',target_base_price,'unit_price',target_unit_price,
      'options',canonical_options
    ));
  end loop;

  v_total:=round(v_total,2);
  v_tax:=round(v_total*v_tax_rate/(100+v_tax_rate),2);
  v_subtotal:=v_total-v_tax;
  insert into public.orders(restaurant_id,table_id,customer_name,status,note,subtotal,tax,total,is_test_order)
  values(t.restaurant_id,t.table_id,left(coalesce(p_customer_name,''),120),'new',left(coalesce(p_note,''),1000),v_subtotal,v_tax,v_total,false)
  returning id,order_number into o,v_order_number;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,name_snapshot,category_snapshot,quantity,price,base_price,unit_price,options)
  select t.restaurant_id,o,(item->>'menu_item_id')::uuid,item->>'item_name',item->>'item_name',item->>'category',
    (item->>'quantity')::integer,(item->>'unit_price')::numeric,(item->>'base_price')::numeric,(item->>'unit_price')::numeric,item->'options'
  from jsonb_array_elements(normalized_items) item;
  result:=jsonb_build_object('id',o,'order_number',v_order_number,'idempotent_replay',false);
  insert into public.public_qr_order_operations(restaurant_id,table_id,token_id,idempotency_key,payload_fingerprint,order_id,result_snapshot)
  values(t.restaurant_id,t.table_id,t.id,p_idempotency_key,fp,o,result);
  return result;
end $$;

create or replace function public.get_public_qr_order_status(p_token text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.public_order_tokens; r jsonb;
begin
  perform public.get_public_qr_order_context(p_token);
  select tok.* into t from public.public_order_tokens tok
  where tok.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and tok.revoked_at is null;
  select jsonb_build_object(
    'id',o.id,'order_number',o.order_number,'status',o.status,'created_at',o.created_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('menu_item_id',oi.menu_item_id,'name',oi.name_snapshot,'quantity',oi.quantity,'base_price',oi.base_price,'unit_price',oi.unit_price,'options',oi.options) order by oi.id) from public.order_items oi where oi.order_id=o.id and oi.restaurant_id=t.restaurant_id),'[]'::jsonb)
  ) into r
  from public.orders o join public.public_qr_order_operations q on q.order_id=o.id and q.token_id=t.id
  where o.id=p_order_id and o.restaurant_id=t.restaurant_id and o.table_id=t.table_id;
  if r is null then raise exception 'PUBLIC_ORDER_NOT_FOUND'; end if;
  return r;
end $$;

revoke all on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_qr_order_context(text),public.submit_public_qr_order(text,jsonb,text,text,uuid),public.get_public_qr_order_status(text,uuid) to anon,authenticated;
commit;
