\set ON_ERROR_STOP on
begin;
delete from public.payment_operations where restaurant_id=:'restaurant_id'::uuid;
delete from public.orders where restaurant_id=:'restaurant_id'::uuid;
delete from public.tables where restaurant_id=:'restaurant_id'::uuid;
delete from public.restaurant_staff where restaurant_id=:'restaurant_id'::uuid;
delete from public.restaurants where id=:'restaurant_id'::uuid;
delete from auth.users where id=:'cashier_id'::uuid;
commit;
