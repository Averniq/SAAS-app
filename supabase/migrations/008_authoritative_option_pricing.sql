-- Aveniq SaaS V1 authoritative menu-option pricing.
-- Apply after 007_explicit_data_api_grants.sql.
-- Existing orders are preserved. New orders use database-owned option pricing.

begin;

alter table public.menu_items
  add column if not exists option_config jsonb not null default '[]'::jsonb;

alter table public.order_items
  add column if not exists category_snapshot text not null default '';

-- Backfill the fixed V1 option templates currently supported by the app.
update public.menu_items
set option_config = case option_template
  when 'spiceAddons' then '[
    {"id":"spice","name":"Spice level","choices":[
      {"id":"mild","name":"Mild","price":0},
      {"id":"medium","name":"Medium","price":0},
      {"id":"hot","name":"Hot","price":0}
    ]},
    {"id":"addon","name":"Add-on","choices":[
      {"id":"none","name":"No add-on","price":0},
      {"id":"rice","name":"Add steamed rice","price":3},
      {"id":"egg","name":"Add fried egg","price":2.5}
    ]}
  ]'::jsonb
  when 'size' then '[
    {"id":"size","name":"Size","choices":[
      {"id":"regular","name":"Regular","price":0},
      {"id":"large","name":"Large","price":3.5}
    ]}
  ]'::jsonb
  when 'drink' then '[
    {"id":"ice","name":"Ice","choices":[
      {"id":"regular","name":"Regular ice","price":0},
      {"id":"less","name":"Less ice","price":0},
      {"id":"none","name":"No ice","price":0}
    ]},
    {"id":"sugar","name":"Sugar","choices":[
      {"id":"full","name":"100%","price":0},
      {"id":"half","name":"50%","price":0},
      {"id":"zero","name":"0%","price":0}
    ]}
  ]'::jsonb
  else '[]'::jsonb
end
where option_config = '[]'::jsonb;

update public.order_items oi
set category_snapshot = coalesce(nullif(mi.category, ''), 'Menu')
from public.menu_items mi
where mi.id = oi.menu_item_id and oi.category_snapshot = '';

update public.order_items
set category_snapshot = 'Menu'
where category_snapshot = '';

create or replace function public.validate_menu_option_config()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  option_group jsonb;
  option_choice jsonb;
begin
  if jsonb_typeof(new.option_config) <> 'array' or jsonb_array_length(new.option_config) > 10 then
    raise exception 'INVALID_OPTION_CONFIG';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.option_config) as g
    group by g->>'id'
    having coalesce(g->>'id', '') = '' or count(*) > 1
  ) then
    raise exception 'INVALID_OPTION_GROUPS';
  end if;

  for option_group in select value from jsonb_array_elements(new.option_config)
  loop
    if jsonb_typeof(option_group) <> 'object'
       or length(trim(coalesce(option_group->>'id', ''))) not between 1 and 60
       or length(trim(coalesce(option_group->>'name', ''))) not between 1 and 120
       or jsonb_typeof(option_group->'choices') <> 'array'
       or jsonb_array_length(option_group->'choices') not between 1 and 50 then
      raise exception 'INVALID_OPTION_GROUP';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(option_group->'choices') as c
      group by c->>'id'
      having coalesce(c->>'id', '') = '' or count(*) > 1
    ) then
      raise exception 'INVALID_OPTION_CHOICES';
    end if;

    for option_choice in select value from jsonb_array_elements(option_group->'choices')
    loop
      if jsonb_typeof(option_choice) <> 'object'
         or length(trim(coalesce(option_choice->>'id', ''))) not between 1 and 60
         or length(trim(coalesce(option_choice->>'name', ''))) not between 1 and 120
         or jsonb_typeof(option_choice->'price') <> 'number'
         or (option_choice->>'price')::numeric not between 0 and 10000 then
        raise exception 'INVALID_OPTION_CHOICE';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_menu_option_config on public.menu_items;
create trigger validate_menu_option_config
before insert or update of option_config on public.menu_items
for each row execute function public.validate_menu_option_config();

revoke all on function public.validate_menu_option_config() from public, anon, authenticated;

create or replace function public.get_public_restaurant(p_slug text, p_table_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'subtitle', r.subtitle,
      'address', r.address, 'phone', r.phone, 'tax_rate', r.tax_rate,
      'is_open', r.is_open, 'logo_url', r.logo_url,
      'theme_config', r.theme_config, 'timezone', r.timezone
    ),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'local_id', t.local_id, 'table_number', t.table_number,
        'table_name', t.table_name, 'table_token', t.table_token,
        'sort_order', t.sort_order
      ) order by t.sort_order), '[]'::jsonb)
      from public.tables t
      where t.restaurant_id = r.id and t.is_active and (
        (coalesce(p_table_ref, '') <> '' and (t.local_id = p_table_ref or t.table_token = p_table_ref))
        or (coalesce(p_table_ref, '') = '' and public.is_restaurant_staff(r.id))
      )
    ),
    'menu_items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'local_id', m.local_id, 'category_id', m.category_id,
        'category', coalesce(c.name, m.category), 'name', m.name,
        'description', m.description, 'price', m.price, 'tags', m.tags,
        'image_url', coalesce(nullif(m.image_url, ''), m.photo_url),
        'option_template', m.option_template, 'option_config', m.option_config,
        'is_available', m.is_available and m.is_active and not m.sold_out,
        'sort_order', m.sort_order
      ) order by c.sort_order, m.sort_order), '[]'::jsonb)
      from public.menu_items m
      left join public.categories c on c.id = m.category_id
      where m.restaurant_id = r.id and m.is_active and (c.is_active is null or c.is_active)
    )
  ) into result
  from public.restaurants r
  where r.slug = p_slug and r.status in ('active', 'onboarding') and r.is_active;

  if result is null then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if coalesce(p_table_ref, '') <> '' and jsonb_array_length(result->'tables') <> 1 then
    raise exception 'TABLE_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function public.submit_order(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_local_id text,
  p_note text,
  p_items jsonb,
  p_customer_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_order_number bigint;
  target_tax_rate numeric(5,2);
  calculated_subtotal numeric(10,2);
  calculated_tax numeric(10,2);
  calculated_total numeric(10,2) := 0;
  input_item jsonb;
  selected_option jsonb;
  configured_group jsonb;
  configured_choice jsonb;
  canonical_options jsonb;
  normalized_items jsonb := '[]'::jsonb;
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
  if length(trim(coalesce(p_local_id, ''))) < 3 then raise exception 'INVALID_ORDER_ID'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_ORDER_ITEMS';
  end if;

  select r.tax_rate into target_tax_rate
  from public.restaurants r
  join public.tables t on t.restaurant_id = r.id
  where r.id = p_restaurant_id and r.status in ('active', 'onboarding')
    and r.is_open and t.id = p_table_id and t.is_active;
  if target_tax_rate is null then raise exception 'INVALID_OR_CLOSED_TABLE'; end if;

  select id, order_number into target_order_id, target_order_number
  from public.orders
  where restaurant_id = p_restaurant_id and local_id = p_local_id
  limit 1;
  if target_order_id is not null then
    return jsonb_build_object('id', target_order_id, 'order_number', target_order_number);
  end if;

  for input_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      target_menu_item_id := nullif(input_item->>'menu_item_id', '')::uuid;
      target_quantity := (input_item->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_ORDER_ITEM';
    end;

    if target_quantity not between 1 and 99 then raise exception 'INVALID_ORDER_ITEM'; end if;

    select m.name, m.price, coalesce(nullif(m.category, ''), 'Menu'), m.option_config
      into target_item_name, target_base_price, target_category, target_option_config
    from public.menu_items m
    where m.id = target_menu_item_id and m.restaurant_id = p_restaurant_id
      and m.is_active and m.is_available and not m.sold_out;
    if target_item_name is null then raise exception 'INVALID_ORDER_ITEM'; end if;

    selected_option := coalesce(input_item->'options', '[]'::jsonb);
    if jsonb_typeof(selected_option) <> 'array'
       or jsonb_array_length(selected_option) <> jsonb_array_length(target_option_config) then
      raise exception 'INVALID_ORDER_OPTIONS';
    end if;

    canonical_options := '[]'::jsonb;
    option_extra := 0;

    for configured_group in select value from jsonb_array_elements(target_option_config)
    loop
      select count(*) into option_matches
      from jsonb_array_elements(selected_option) as supplied
      where supplied->>'groupId' = configured_group->>'id';
      if option_matches <> 1 then raise exception 'INVALID_ORDER_OPTIONS'; end if;

      select value into configured_choice
      from jsonb_array_elements(configured_group->'choices')
      where value->>'id' = (
        select supplied->>'choiceId'
        from jsonb_array_elements(selected_option) supplied
        where supplied->>'groupId' = configured_group->>'id'
        limit 1
      )
      limit 1;
      if configured_choice is null then raise exception 'INVALID_ORDER_OPTIONS'; end if;

      option_extra := option_extra + (configured_choice->>'price')::numeric;
      canonical_options := canonical_options || jsonb_build_array(jsonb_build_object(
        'groupId', configured_group->>'id',
        'groupName', configured_group->>'name',
        'choiceId', configured_choice->>'id',
        'choiceName', configured_choice->>'name',
        'price', (configured_choice->>'price')::numeric
      ));
      configured_choice := null;
    end loop;

    target_unit_price := round(target_base_price + option_extra, 2);
    calculated_total := calculated_total + target_unit_price * target_quantity;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', target_menu_item_id,
      'item_name', target_item_name,
      'category', target_category,
      'quantity', target_quantity,
      'base_price', target_base_price,
      'unit_price', target_unit_price,
      'notes', left(coalesce(input_item->>'notes', ''), 500),
      'options', canonical_options
    ));
  end loop;

  calculated_total := round(calculated_total, 2);
  calculated_tax := round(calculated_total * target_tax_rate / (100 + target_tax_rate), 2);
  calculated_subtotal := calculated_total - calculated_tax;

  insert into public.orders(
    restaurant_id, table_id, local_id, customer_name, status, note, subtotal, tax, total
  ) values (
    p_restaurant_id, p_table_id, p_local_id, left(coalesce(p_customer_name, ''), 120),
    'new', left(coalesce(p_note, ''), 1000), calculated_subtotal, calculated_tax, calculated_total
  ) returning id, order_number into target_order_id, target_order_number;

  insert into public.order_items(
    restaurant_id, order_id, menu_item_id, item_name, name_snapshot,
    category_snapshot, quantity, price, base_price, unit_price, notes, options
  )
  select p_restaurant_id, target_order_id, (item->>'menu_item_id')::uuid,
    item->>'item_name', item->>'item_name', item->>'category',
    (item->>'quantity')::integer, (item->>'unit_price')::numeric,
    (item->>'base_price')::numeric, (item->>'unit_price')::numeric,
    item->>'notes', item->'options'
  from jsonb_array_elements(normalized_items) item;

  return jsonb_build_object('id', target_order_id, 'order_number', target_order_number);
end;
$$;

revoke all on function public.get_public_restaurant(text,text) from public, anon, authenticated;
revoke all on function public.submit_order(uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.get_public_restaurant(text,text) to anon, authenticated;
grant execute on function public.submit_order(uuid,uuid,text,text,jsonb,text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
