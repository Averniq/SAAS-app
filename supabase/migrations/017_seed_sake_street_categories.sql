-- Complete the create-only Sake Street test fixture if its categories were absent.
insert into public.categories (restaurant_id, name, sort_order)
select restaurant.id, seed.name, seed.sort_order
from public.restaurants restaurant
cross join (values ('Soups', 1), ('Mains', 2), ('Sides', 3)) as seed(name, sort_order)
where restaurant.slug = 'sake-street'
on conflict (restaurant_id, name) do nothing;

update public.menu_items item
set category_id = category.id
from public.restaurants restaurant
join public.categories category on category.restaurant_id = restaurant.id
where restaurant.slug = 'sake-street'
  and item.restaurant_id = restaurant.id
  and item.category = category.name
  and item.category_id is null;
