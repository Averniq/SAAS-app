begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement; exception when insufficient_privilege or raise_exception then return; end; raise exception 'UNEXPECTED ALLOW: %',statement; end $$;
insert into auth.users(id) values ('11000000-0000-0000-0000-000000000001'),('11000000-0000-0000-0000-000000000002'),('11000000-0000-0000-0000-000000000003');
insert into public.restaurants(id,name,slug) values ('12000000-0000-0000-0000-000000000001','Synthetic A','kp-a'),('12000000-0000-0000-0000-000000000002','Synthetic B','kp-b');
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('12000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','owner'),('12000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','manager'),('12000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','kitchen');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.kitchen_print_pairings','SELECT'),'no hash access');
set local role anon;
select pg_temp.denied($q$select public.list_kitchen_printers('12000000-0000-0000-0000-000000000001')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.save_kitchen_printer('12000000-0000-0000-0000-000000000001',null,'{"name":"Synthetic Kitchen","ip":null,"copies":1}') as printer \gset
select pg_temp.denied($q$select public.save_kitchen_printer('12000000-0000-0000-0000-000000000002',null,'{"name":"Attack"}')$q$);
select pg_temp.denied($q$select * from public.kitchen_print_pairings$q$);
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.denied($q$select public.save_kitchen_printer('12000000-0000-0000-0000-000000000001',null,'{"name":"Attack"}')$q$);
select pg_temp.assert_true(jsonb_array_length(public.list_kitchen_printers('12000000-0000-0000-0000-000000000001')->'printers')=1,'kitchen sees config');
select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Synthetic Tablet',encode(extensions.digest(repeat('a',64),'sha256'),'hex')) as pairing \gset
select pg_temp.assert_true((public.activate_kitchen_print_pairing((:'pairing'::jsonb->>'pairingId')::uuid,repeat('a',64))->>'status')='denied','unapproved denied');
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_kitchen_print_pairing((:'pairing'::jsonb->>'pairingId')::uuid,array[(:'printer'::jsonb->>'id')::uuid]);
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.activate_kitchen_print_pairing((:'pairing'::jsonb->>'pairingId')::uuid,repeat('a',64)) as activated \gset
select pg_temp.assert_true(:'activated'::jsonb->>'status'='active','pair activated');
select pg_temp.assert_true(not (:'activated'::jsonb ? 'secretHash'),'no hash response');
select pg_temp.assert_true(public.activate_kitchen_print_pairing((:'pairing'::jsonb->>'pairingId')::uuid,repeat('a',64))->>'status'='denied','activation not replayable');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_devices),'single registration');
select pg_temp.denied($q$update public.kitchen_print_audit set event='tamper'$q$);
-- Proof failures must survive a denied activation response and stop at five.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Bad proof test',encode(extensions.digest(repeat('b',64),'sha256'),'hex')) as bad_pair \gset
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_kitchen_print_pairing((:'bad_pair'::jsonb->>'pairingId')::uuid,array[(:'printer'::jsonb->>'id')::uuid]);
select pg_temp.denied(format('select public.activate_kitchen_print_pairing(%L::uuid,%L)',:'bad_pair'::jsonb->>'pairingId',repeat('b',64)));
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.activate_kitchen_print_pairing((:'bad_pair'::jsonb->>'pairingId')::uuid,repeat('c',64)) from generate_series(1,5);
select pg_temp.assert_true(public.activate_kitchen_print_pairing((:'bad_pair'::jsonb->>'pairingId')::uuid,repeat('b',64))->>'status'='denied','correct proof denied after five failures');
reset role;
select pg_temp.assert_true((select failed_activations=5 and state='expired' from public.kitchen_print_pairings where id=(:'bad_pair'::jsonb->>'pairingId')::uuid),'persistent bounded proof counter');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Rate limit test',repeat('d',64)) from generate_series(1,3);
select pg_temp.denied($q$select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Sixth',repeat('d',64))$q$);
reset role;
-- Revoke changes only registration and appends audit evidence.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.revoke_kitchen_print_device((:'activated'::jsonb->>'deviceId')::uuid,'Synthetic lost tablet');
select public.set_kitchen_print_control('12000000-0000-0000-0000-000000000001',true,false);
select public.set_kitchen_print_control('12000000-0000-0000-0000-000000000001',false,false);
reset role;
select pg_temp.assert_true((select protocol_version=2 and not enabled from public.kitchen_print_controls where restaurant_id='12000000-0000-0000-0000-000000000001'),'sticky v2 after disable');
select pg_temp.assert_true((select state='revoked' from public.kitchen_print_devices where id=(:'activated'::jsonb->>'deviceId')::uuid),'revocation retained');
-- Role matrix exercises RPC authority as authenticated, including an unaffiliated customer.
do $$ declare role_name text; uid uuid; permitted boolean; begin
 foreach role_name in array array['manager','staff','kitchen','cashier','customer'] loop
  uid:=gen_random_uuid(); insert into auth.users(id) values(uid);
  if role_name<>'customer' then insert into public.restaurant_staff(restaurant_id,user_id,role) values('12000000-0000-0000-0000-000000000001',uid,role_name); end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  permitted:=false;
  begin perform public.list_kitchen_printers('12000000-0000-0000-0000-000000000001'); permitted:=true; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(permitted=(role_name in('manager','staff','kitchen')),'operational matrix '||role_name);
  permitted:=false;
  begin perform public.save_kitchen_printer('12000000-0000-0000-0000-000000000001',null,'{"name":"role fixture"}'); permitted:=true; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(permitted=(role_name='manager'),'manager matrix '||role_name);
  execute 'reset role';
 end loop;
end $$;
-- Expiry and tenant-scoped assignments fail without issuing credentials.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.save_kitchen_printer('12000000-0000-0000-0000-000000000002',null,'{"name":"Other tenant"}') as other_printer \gset
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Expiry test',repeat('e',64)) as expiry_pair \gset
select pg_temp.denied(format('select public.approve_kitchen_print_pairing(%L::uuid,array[%L::uuid])',:'expiry_pair'::jsonb->>'pairingId',:'other_printer'::jsonb->>'id'));
select public.approve_kitchen_print_pairing((:'expiry_pair'::jsonb->>'pairingId')::uuid,array[(:'printer'::jsonb->>'id')::uuid]);
reset role;
update public.kitchen_print_pairings set expires_at=clock_timestamp()-interval '1 second' where id=(:'expiry_pair'::jsonb->>'pairingId')::uuid;
set local role authenticated;
select pg_temp.assert_true(public.activate_kitchen_print_pairing((:'expiry_pair'::jsonb->>'pairingId')::uuid,repeat('e',64))->>'status'='denied','expired denied');
reset role;
delete from public.restaurant_staff where user_id='11000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.denied($q$select public.begin_kitchen_print_pairing('12000000-0000-0000-0000-000000000001','Removed staff',repeat('f',64))$q$);
reset role;
rollback;


