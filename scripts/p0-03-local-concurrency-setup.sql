\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values (:'cashier_id'::uuid, :'cashier_id' || '@p0-03.local');
insert into public.restaurants(id,owner_user_id,name,slug,status) values (:'restaurant_id'::uuid,:'cashier_id'::uuid,'P0-03 concurrent','p0-03-concurrent-' || left(:'restaurant_id',8),'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values (:'restaurant_id'::uuid,:'cashier_id'::uuid,'cashier');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values (:'table_id'::uuid,:'restaurant_id'::uuid,1,'P0-03 concurrent','p0-03-concurrent-' || left(:'table_id',8),'P0-03 concurrent','p0-03-concurrent-' || :'table_id');
insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id) values (:'order_id'::uuid,:'restaurant_id'::uuid,:'table_id'::uuid,'new',10,10,'p0-03-concurrent-' || left(:'order_id',8));
commit;
