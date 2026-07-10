-- Aveniq SaaS V1 RLS policy consolidation.
--
-- These changes preserve the existing role model while avoiding multiple
-- permissive policies for the same role/action on common dashboard tables.

-- Restaurants: combine staff and platform-admin SELECT paths, and combine
-- owner/manager and platform-admin UPDATE paths.
drop policy if exists "staff read own restaurants" on public.restaurants;
drop policy if exists "platform admins read restaurants" on public.restaurants;
create policy "authenticated read allowed restaurants" on public.restaurants
for select to authenticated
using (
  public.is_restaurant_staff(id)
  or public.is_platform_admin()
);

drop policy if exists "owners manage restaurant" on public.restaurants;
drop policy if exists "platform admins update restaurants" on public.restaurants;
create policy "authenticated update allowed restaurants" on public.restaurants
for update to authenticated
using (
  public.has_restaurant_role(id, array['owner','manager'])
  or public.is_platform_admin()
)
with check (
  public.has_restaurant_role(id, array['owner','manager'])
  or public.is_platform_admin()
);

-- Staff memberships: keep users able to read their own membership while owners
-- can manage staff in their restaurant.
drop policy if exists "staff read own memberships" on public.restaurant_staff;
drop policy if exists "owners manage staff" on public.restaurant_staff;
create policy "staff read allowed memberships" on public.restaurant_staff
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_restaurant_role(restaurant_id, array['owner'])
);

create policy "owners insert staff" on public.restaurant_staff
for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner']));

create policy "owners update staff" on public.restaurant_staff
for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']))
with check (public.has_restaurant_role(restaurant_id, array['owner']));

create policy "owners delete staff" on public.restaurant_staff
for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner']));

-- Categories: staff SELECT already includes owners/managers, so split write
-- access out of the previous ALL policy.
drop policy if exists "owners manage categories" on public.categories;
create policy "owners insert categories" on public.categories
for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners update categories" on public.categories
for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']))
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners delete categories" on public.categories
for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']));

-- Tables.
drop policy if exists "owners manage tables" on public.tables;
create policy "owners insert tables" on public.tables
for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners update tables" on public.tables
for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']))
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners delete tables" on public.tables
for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']));

-- Menu items.
drop policy if exists "owners manage menu" on public.menu_items;
create policy "owners insert menu" on public.menu_items
for insert to authenticated
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners update menu" on public.menu_items
for update to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']))
with check (public.has_restaurant_role(restaurant_id, array['owner','manager']));

create policy "owners delete menu" on public.menu_items
for delete to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner','manager']));
