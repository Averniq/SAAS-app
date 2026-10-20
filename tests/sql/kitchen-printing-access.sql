\set ON_ERROR_STOP on
begin;
do $$
declare u uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p jsonb; pairing jsonb; d jsonb; denied boolean;
begin
 if to_regclass('public.kitchen_printers') is null then raise exception 'MISSING_PRINTER_SCHEMA'; end if;
 insert into auth.users(id,email) values(u,u||'@print.local'),(k,k||'@print.local'),(c,c||'@print.local'),(other,other||'@print.local');
 insert into public.restaurants(id,name,slug) values(r,'Synthetic kitchen',r::text),(b,'Other tenant',b::text);
 insert into public.restaurant_staff(restaurant_id,user_id,role) values(r,u,'owner'),(r,k,'kitchen'),(r,c,'cashier'),(b,other,'owner');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 p:=public.save_kitchen_printer(r,null,'{"name":"Kitchen","ip":null,"port":9100,"copies":2,"destination":"Kitchen"}');
 if p->>'ip' is not null or (p->>'copies')::int<>2 then raise exception 'NULL_IP_OR_COPIES'; end if;
 denied:=false;begin perform public.save_kitchen_printer(r,null,'{"name":"Bad","ip":"169.254.169.254"}');exception when others then denied:=true;end;if not denied then raise exception 'METADATA_IP_ALLOWED';end if;
 denied:=false;begin perform public.save_kitchen_printer(r,null,'{"name":"Bad","ip":"192.168.1.2","copies":4}');exception when others then denied:=true;end;if not denied then raise exception 'BAD_COPIES_ALLOWED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',k,'role','authenticated')::text,true);
 denied:=false;begin perform public.save_kitchen_printer(r,null,'{"name":"Forbidden"}');exception when others then denied:=true;end;if not denied then raise exception 'KITCHEN_CONFIG_ALLOWED';end if;
 pairing:=public.begin_kitchen_print_pairing(r,'Synthetic tablet',encode(extensions.digest(repeat('s',64),'sha256'),'hex'));
 denied:=false;begin perform public.approve_kitchen_print_pairing((pairing->>'id')::uuid,array[(p->>'id')::uuid]);exception when others then denied:=true;end;if not denied then raise exception 'SELF_APPROVAL_ALLOWED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform public.approve_kitchen_print_pairing((pairing->>'id')::uuid,array[(p->>'id')::uuid]);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',k,'role','authenticated')::text,true);
 d:=public.activate_kitchen_print_pairing((pairing->>'id')::uuid,repeat('s',64));
 if d->>'deviceId' is null then raise exception 'PAIRING_FAILED';end if;
 denied:=false;begin perform public.activate_kitchen_print_pairing((pairing->>'id')::uuid,repeat('s',64));exception when others then denied:=true;end;if not denied then raise exception 'PAIRING_REPLAY';end if;
 denied:=false;begin perform public.list_kitchen_printers(b);exception when others then denied:=true;end;if not denied then raise exception 'CROSS_TENANT_READ';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c,'role','authenticated')::text,true);
 denied:=false;begin perform public.list_kitchen_printers(r);exception when others then denied:=true;end;if not denied then raise exception 'CASHIER_ACCESS';end if;
 if has_table_privilege('anon','public.kitchen_print_jobs','select') or has_table_privilege('authenticated','public.kitchen_print_devices','select') then raise exception 'PRIVATE_TABLE_EXPOSED';end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname like 'kitchen_print%' and relkind='r' and not relrowsecurity) then raise exception 'RLS_MISSING';end if;
end $$;
rollback;
\echo Kitchen printer access assertions passed
