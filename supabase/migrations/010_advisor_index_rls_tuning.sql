-- Aveniq SaaS V1 advisor hardening.
--
-- This migration keeps the existing access model unchanged. It only adds
-- missing foreign-key indexes and rewrites two auth.uid() RLS predicates to
-- Supabase's recommended initplan-friendly form.

-- Foreign-key side indexes for faster joins and safer parent updates/deletes.
create index if not exists restaurants_owner_user_id_idx
  on public.restaurants (owner_user_id)
  where owner_user_id is not null;

create index if not exists menu_items_category_id_idx
  on public.menu_items (category_id)
  where category_id is not null;

create index if not exists orders_table_id_idx
  on public.orders (table_id)
  where table_id is not null;

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_menu_item_id_idx
  on public.order_items (menu_item_id)
  where menu_item_id is not null;

create index if not exists restaurant_invites_invited_by_idx
  on public.restaurant_invites (invited_by)
  where invited_by is not null;

create index if not exists restaurant_invites_accepted_by_idx
  on public.restaurant_invites (accepted_by)
  where accepted_by is not null;

-- Keep the same visibility rule, but avoid re-evaluating auth.uid() per row.
drop policy if exists "staff read own memberships" on public.restaurant_staff;
create policy "staff read own memberships" on public.restaurant_staff
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "platform admins read own role" on public.platform_admins;
create policy "platform admins read own role" on public.platform_admins
for select to authenticated
using (user_id = (select auth.uid()));
