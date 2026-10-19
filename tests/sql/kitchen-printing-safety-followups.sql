begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
do $$declare u uuid:=gen_random_uuid();r uuid:=gen_random_uuid();p uuid; revision bigint;
begin
 insert into auth.users(id) values(u);insert into public.restaurants(id,name,slug) values(r,'Synthetic disable guard','kp-disable-'||r);insert into public.restaurant_staff(restaurant_id,user_id,role) values(r,u,'owner');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);execute 'set local role authenticated';
 p:=(public.save_kitchen_printer(r,null,'{"name":"Synthetic","ip":"192.168.1.60"}')->>'id')::uuid;
 begin perform public.save_kitchen_printer(r,p,'{"configRevision":1,"enabled":false}');raise exception 'DISABLE_BYPASS_ALLOWED';exception when others then if sqlerrm<>'USE_CONFIRMED_PRINTER_DISABLE' then raise;end if;end;
 perform public.disable_kitchen_printer(p,'Explicit local confirmation');execute 'reset role';
 perform pg_temp.assert_true((select not enabled and disabled_at is not null and disabled_by=u and disable_reason='Explicit local confirmation' from public.kitchen_printers where id=p),'disable actor timestamp reason');
 perform pg_temp.assert_true((select count(*)=1 from public.kitchen_print_audit where restaurant_id=r and entity_id=p and event='printer_disabled'),'dedicated immutable disable event');
end$$;
rollback;
