begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
insert into auth.users(id) values('31000000-0000-0000-0000-000000000001');
insert into public.restaurants(id,name,slug) values('32000000-0000-0000-0000-000000000001','Synthetic Dispatch','kp-dispatch');
insert into public.restaurant_staff(restaurant_id,user_id,role) values('32000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','owner');
insert into public.tables(id,restaurant_id,table_name,local_id,name,table_token) values('33000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','T1','t1','T1','synthetic-token');
select set_config('request.jwt.claims','{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.save_kitchen_printer('32000000-0000-0000-0000-000000000001',null,'{"name":"Kitchen","ip":"192.168.1.40","autoPrint":true,"copies":2,"autoCut":true}') as printer \gset
select public.set_kitchen_print_control('32000000-0000-0000-0000-000000000001',true,false);
insert into public.orders(id,restaurant_id,table_id,note,created_at) values('34000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001','No peanuts',clock_timestamp());
insert into public.order_items(restaurant_id,order_id,item_name,quantity,price,name_snapshot,notes) values('32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','Synthetic noodles',2,10,'Synthetic noodles','No chilli');
set constraints all immediate;
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'one dispatch');
select pg_temp.assert_true((select snapshot->>'instructions'='No peanuts' and snapshot->'items'->0->>'notes'='No chilli' and (snapshot->>'copies')::int=2 from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'immutable full snapshot');
update public.orders set status='ready' where id='34000000-0000-0000-0000-000000000001';
update public.order_items set notes='changed later' where order_id='34000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'no status re-enqueue');
select pg_temp.assert_true((select snapshot->'items'->0->>'notes'='No chilli' from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'snapshot retained');
set constraints all deferred;
insert into public.orders(id,restaurant_id,table_id,is_test_order,created_at) values('34000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',true,clock_timestamp());
insert into public.order_items(restaurant_id,order_id,item_name,quantity,price,name_snapshot) values('32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000002','Test',1,10,'Test');
set constraints all immediate;
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'test orders excluded');
set constraints all deferred;
insert into public.orders(id,restaurant_id,table_id,created_at) values('34000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',clock_timestamp());
set constraints all immediate;
select pg_temp.assert_true((select count(*)=3 from public.orders where restaurant_id='32000000-0000-0000-0000-000000000001'),'printing snapshot failure preserves order');
select pg_temp.assert_true(exists(select 1 from public.kitchen_print_audit where event='dispatch_attention'),'failure recorded');
-- Route snapshots are server-derived; disabled destinations get an attention event.
select public.save_kitchen_printer('32000000-0000-0000-0000-000000000001',null,'{"name":"Bar","destination":"Bar","ip":"192.168.1.41","autoPrint":true}');
select public.save_kitchen_printer('32000000-0000-0000-0000-000000000001',null,'{"name":"Dessert disabled","destination":"Dessert","ip":"192.168.1.42","autoPrint":false}');
insert into public.categories(id,restaurant_id,name) values('35000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','Drinks'),('35000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000001','Sweet');
insert into public.kitchen_printer_routes values('32000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','Bar'),('32000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000002','Dessert');
insert into public.menu_items(id,restaurant_id,category_id,name,price,local_id,category) values('36000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','Tea',2,'tea','Drinks'),('36000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000002','Cake',3,'cake','Sweet');
set constraints all deferred;
insert into public.orders(id,restaurant_id,table_id,created_at) values('34000000-0000-0000-0000-000000000004','32000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',clock_timestamp());
insert into public.order_items(restaurant_id,order_id,menu_item_id,item_name,name_snapshot,quantity,price) values('32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000004','36000000-0000-0000-0000-000000000001','Tea','Tea',1,2),('32000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000004','36000000-0000-0000-0000-000000000002','Cake','Cake',1,3);
set constraints all immediate;
select pg_temp.assert_true((select count(*)=1 and min(destination)='Bar' from public.kitchen_print_jobs where order_id='34000000-0000-0000-0000-000000000004'),'only configured Bar job');
select public.enqueue_kitchen_dispatch('34000000-0000-0000-0000-000000000004');
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_jobs where order_id='34000000-0000-0000-0000-000000000004'),'repeated dispatch idempotent');
do $$begin
 begin perform public.claim_kitchen_print_job('kp-dispatch'); raise exception 'LEGACY_ALLOWED'; exception when others then if sqlerrm<>'PRINT_PROTOCOL_UPGRADE_REQUIRED' then raise; end if; end;
 begin update public.kitchen_print_jobs set snapshot='{}'; raise exception 'MUTATION_ALLOWED'; exception when others then if sqlerrm<>'PRINT_SNAPSHOT_IMMUTABLE' then raise; end if; end;
end$$;
select public.set_kitchen_print_control('32000000-0000-0000-0000-000000000001',false,false);
do $$begin begin perform public.claim_kitchen_print_job('kp-dispatch'); raise exception 'LEGACY_ALLOWED'; exception when others then if sqlerrm<>'PRINT_PROTOCOL_UPGRADE_REQUIRED' then raise; end if; end; end$$;
select public.set_kitchen_print_control('32000000-0000-0000-0000-000000000001',true,false);
select pg_temp.assert_true((select count(*)=2 from public.kitchen_print_jobs where restaurant_id='32000000-0000-0000-0000-000000000001'),'reenable does not backfill');
rollback;



