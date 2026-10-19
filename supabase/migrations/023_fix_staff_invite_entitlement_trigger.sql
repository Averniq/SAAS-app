-- This trigger is attached to several tables, whose NEW records have
-- different shapes. Select the table branch before accessing its columns.
create or replace function public.enforce_restaurant_entitlement_limits()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'restaurants' then
    if new.organization_id is not null then
      perform public.assert_organization_venue_limit(new.organization_id);
    end if;
  elsif tg_table_name = 'tables' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'tables');
  elsif tg_table_name = 'menu_items' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'menu_items');
  elsif tg_table_name = 'restaurant_staff' then
    perform public.assert_restaurant_entitlement_limit(new.restaurant_id, 'staff_accounts');
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
