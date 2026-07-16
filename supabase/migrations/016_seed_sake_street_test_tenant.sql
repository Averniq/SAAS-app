-- Create-only test fixture for the Aveniq Sake Street tenant.
-- It never alters or removes any existing tenant data.
with seeded_restaurant as (
  insert into public.restaurants (
    name, slug, restaurant_type, address, phone, timezone, status, subtitle,
    tax_id, tax_rate, is_open, is_active, theme_config
  )
  values (
    'Sake Street', 'sake-street', 'Restaurant', 'Test tenant', '',
    'Australia/Sydney', 'active', 'Japanese QR table ordering', '', 10, true, true,
    '{"themePreset":"japaneseIzakaya","primaryColor":"#b21f24"}'::jsonb
  )
  on conflict (slug) do nothing
  returning id
), tenant as (
  select id from seeded_restaurant
  union all
  select id from public.restaurants where slug = 'sake-street'
  limit 1
), seeded_categories as (
  insert into public.categories (restaurant_id, name, sort_order)
  select tenant.id, value.name, value.sort_order
  from tenant
  cross join (values ('Soups', 1), ('Mains', 2), ('Sides', 3)) as value(name, sort_order)
  on conflict (restaurant_id, name) do nothing
  returning id
)
insert into public.tables (restaurant_id, table_number, table_name, local_id, name, table_token, sort_order)
select tenant.id, value.table_number, value.table_name, value.local_id, value.table_name, value.table_token, value.table_number
from tenant
cross join (values
  (1, 'Table 1', 'sake-table-1', 'sake-test-t1'),
  (2, 'Table 2', 'sake-table-2', 'sake-test-t2')
) as value(table_number, table_name, local_id, table_token)
on conflict (restaurant_id, local_id) do nothing;

with tenant as (
  select id from public.restaurants where slug = 'sake-street'
), menu_seed(local_id, category, name, description, price, tags, option_template, option_config, sort_order) as (
  values
    ('sake-miso', 'Soups', 'Miso soup', 'Tofu, wakame and spring onion.', 4.00, '["Vegetarian"]'::jsonb, 'none', '[]'::jsonb, 1),
    ('sake-ramen', 'Mains', 'Karaage ramen', 'Rich chicken broth with crisp karaage.', 19.00, '["Spicy"]'::jsonb, 'spiceAddons', '[{"id":"spice","name":"Spice level","choices":[{"id":"mild","name":"Mild","price":0},{"id":"hot","name":"Hot","price":0}]},{"id":"addon","name":"Add-on","choices":[{"id":"egg","name":"Add fried egg","price":2.5},{"id":"rice","name":"Add steamed rice","price":3}]}]'::jsonb, 2),
    ('sake-edamame', 'Sides', 'Spicy edamame', 'Garlic, chilli and sesame.', 8.00, '["Vegetarian","Spicy"]'::jsonb, 'none', '[]'::jsonb, 3)
)
insert into public.menu_items (
  restaurant_id, category_id, local_id, category, name, description, price,
  tags, option_template, option_config, sort_order, is_active, is_available, sold_out
)
select tenant.id, category.id, seed.local_id, seed.category, seed.name, seed.description, seed.price,
  seed.tags, seed.option_template, seed.option_config, seed.sort_order, true, true, false
from tenant
join menu_seed seed on true
left join public.categories category on category.restaurant_id = tenant.id and category.name = seed.category
on conflict (restaurant_id, local_id) do nothing;
