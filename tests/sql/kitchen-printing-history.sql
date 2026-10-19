begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
-- Every failed positively-unsent attempt consumes one of five claims, never a sixth.
do $$declare v_uid uuid:=gen_random_uuid(); v_rest uuid:=gen_random_uuid(); v_printer uuid:=gen_random_uuid(); v_device uuid:=gen_random_uuid(); v_job uuid; c jsonb; n integer; token uuid; a uuid;
begin
 insert into auth.users(id) values(v_uid); insert into public.restaurants(id,name,slug) values(v_rest,'Retry fixture','kp-retry-'||v_rest);
 insert into public.restaurant_staff(restaurant_id,user_id,role) values(v_rest,v_uid,'kitchen');
 insert into public.kitchen_printers(id,restaurant_id,name,ip,updated_by) values(v_printer,v_rest,'Retry printer','192.168.2.60',v_uid);
 insert into public.kitchen_print_devices(id,restaurant_id,operator_id,device_name,secret_hash,last_heartbeat) values(v_device,v_rest,v_uid,'Retry tablet',encode(extensions.digest(repeat('d',64),'sha256'),'hex'),clock_timestamp());
 insert into public.kitchen_print_device_printers values(v_rest,v_device,v_printer);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_job:=public.request_kitchen_test_print(v_printer,gen_random_uuid());
 for n in 1..5 loop
  c:=public.claim_kitchen_printer_job(v_device,repeat('d',64)); perform pg_temp.assert_true(c is not null,'retry claim '||n); token:=(c->>'claimToken')::uuid; a:=gen_random_uuid();
  perform public.begin_kitchen_print_attempt(v_device,repeat('d',64),v_job,token,a,(c->>'configRevision')::bigint);
  perform public.finish_kitchen_print_attempt(v_device,repeat('d',64),v_job,token,a,'not_sent','CONNECT_REFUSED');
  perform pg_temp.assert_true(public.claim_kitchen_printer_job(v_device,repeat('d',64)) is null,'backoff respected');
  execute 'reset role';
  if n<5 then perform pg_temp.assert_true((select state='retry_wait' and extract(epoch from(next_attempt_at-updated_at)) between (array[5,15,60,180])[n]-0.1 and (array[5,15,60,180])[n]+0.1 from public.kitchen_print_jobs where id=v_job),'backoff schedule'); update public.kitchen_print_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=v_job;
  else perform pg_temp.assert_true((select state='failed' and attempt_count=5 from public.kitchen_print_jobs where id=v_job),'fifth exhaustion'); end if;
  execute 'set local role authenticated';
 end loop;
 perform pg_temp.assert_true(public.claim_kitchen_printer_job(v_device,repeat('d',64)) is null,'no sixth claim');
 execute 'reset role';
 perform pg_temp.assert_true((select count(*)=10 from public.kitchen_print_attempts where job_id=v_job),'ten immutable begin/finish events');
end$$;
rollback;
