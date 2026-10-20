\set ON_ERROR_STOP on
begin;
do $$ declare r uuid:=gen_random_uuid();u uuid:=gen_random_uuid();t uuid:=gen_random_uuid();o uuid:=gen_random_uuid();p jsonb;n int;s jsonb;denied bool;
begin
 if to_regclass('public.kitchen_print_jobs') is null then raise exception 'MISSING_QUEUE_V2';end if;
 insert into auth.users(id,email) values(u,u||'@dispatch.local');
 insert into public.restaurants(id,name,slug) values(r,'SYNTHETIC DISPATCH',r::text);
 insert into public.restaurant_staff(restaurant_id,user_id,role) values(r,u,'owner');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 p:=public.save_kitchen_printer(r,null,'{"name":"Kitchen","ip":"192.168.30.20","auto_print":true,"copies":3}');
 perform public.set_kitchen_print_control(r,true,false);
 insert into public.tables(id,restaurant_id,name,table_name,local_id,table_token) values(t,r,'Table 5','Table 5','t5',gen_random_uuid()::text);
 insert into public.orders(id,restaurant_id,table_id,status,subtotal,tax,total) values(o,r,t,'new',10,1,11);
 insert into public.order_items(restaurant_id,order_id,item_name,name_snapshot,quantity,price,notes,options) values(r,o,'Wagyu','Wagyu',2,5.5,'No onion','[]');
 perform public.kp_enqueue(o);perform public.kp_enqueue(o);
 select count(*) into n from public.kitchen_print_jobs where order_id=o;if n<>1 then raise exception 'DUPLICATE_DISPATCH';end if;
 select snapshot into s from public.kitchen_print_jobs where order_id=o;
 if s->'items'->0->>'notes'<>'No onion' or (s->>'copies')::int<>3 then raise exception 'SNAPSHOT_INCOMPLETE';end if;
 update public.order_items set name_snapshot='Changed later' where order_id=o;
 if (select snapshot->'items'->0->>'name' from public.kitchen_print_jobs where order_id=o)<>'Wagyu' then raise exception 'MUTABLE_SNAPSHOT';end if;
 denied:=false;begin update public.kitchen_print_jobs set snapshot='{}' where order_id=o;exception when others then denied:=true;end;if not denied then raise exception 'SNAPSHOT_EDIT_ALLOWED';end if;
 perform public.set_kitchen_print_control(r,false,false);
 denied:=false;begin perform public.claim_kitchen_print_job(r::text);exception when others then denied:=true;end;if not denied then raise exception 'LEGACY_REACTIVATED';end if;
end $$;
rollback;
\echo Kitchen transactional dispatch assertions passed

