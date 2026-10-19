begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
-- Every failed positively-unsent attempt consumes one of five claims, never a sixth.
do $$declare v_uid uuid:=gen_random_uuid(); v_rest uuid:=gen_random_uuid(); v_printer uuid:=gen_random_uuid(); v_device uuid:=gen_random_uuid(); v_job uuid; c jsonb; n integer; token uuid; a uuid; recovery jsonb;
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
  recovery:=public.inspect_kitchen_print_recovery(v_job,a,token);perform pg_temp.assert_true((recovery->>'attemptStarted')::boolean and recovery->>'state'='dispatching','bounded recovery inspection begun');
  perform public.finish_kitchen_print_attempt(v_device,repeat('d',64),v_job,token,a,'not_sent','CONNECT_REFUSED');
  perform pg_temp.assert_true(public.claim_kitchen_printer_job(v_device,repeat('d',64)) is null,'backoff respected');
  execute 'reset role';
  if n<5 then perform pg_temp.assert_true((select state='retry_wait' and extract(epoch from(next_attempt_at-updated_at)) between (array[5,15,60,180])[n]-0.1 and (array[5,15,60,180])[n]+0.1 from public.kitchen_print_jobs where id=v_job),'backoff schedule'); update public.kitchen_print_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=v_job;
  else perform pg_temp.assert_true((select state='failed' and attempt_count=5 from public.kitchen_print_jobs where id=v_job),'fifth exhaustion'); end if;
  execute 'set local role authenticated';
 end loop;
 perform pg_temp.assert_true(public.claim_kitchen_printer_job(v_device,repeat('d',64)) is null,'no sixth claim');
 perform pg_temp.assert_true((public.list_kitchen_printers(v_rest)->'printerStates'->0->'lastJob'->>'state')='failed','current printer state survives history pagination');
 execute 'reset role';
 perform pg_temp.assert_true((select count(*)=10 from public.kitchen_print_attempts where job_id=v_job),'ten immutable begin/finish events');
 execute 'set local role authenticated';
 v_job:=public.request_kitchen_test_print(v_printer,gen_random_uuid());c:=public.claim_kitchen_printer_job(v_device,repeat('d',64));token:=(c->>'claimToken')::uuid;a:=gen_random_uuid();
 execute 'reset role'; update public.kitchen_printers set config_revision=2 where id=v_printer;
 execute 'set local role authenticated';
 begin perform public.begin_kitchen_print_attempt(v_device,repeat('d',64),v_job,token,a,1);raise exception 'STALE_ALLOWED';exception when others then if sqlerrm<>'PRINT_CONFIG_CHANGED' then raise;end if;end;
 execute 'reset role';update public.kitchen_printers set config_revision=1 where id=v_printer;update public.kitchen_print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=v_job;
 execute 'set local role authenticated';
 begin perform public.begin_kitchen_print_attempt(v_device,repeat('d',64),v_job,token,a,1);raise exception 'EXPIRED_ALLOWED';exception when others then if sqlerrm<>'PRINT_LEASE_EXPIRED' then raise;end if;end;
 execute 'reset role';update public.kitchen_print_devices set state='revoked' where id=v_device;
 execute 'set local role authenticated';
 begin perform public.claim_kitchen_printer_job(v_device,repeat('d',64));raise exception 'REVOKED_ALLOWED';exception when insufficient_privilege then null;end;
 execute 'reset role';delete from public.restaurant_staff where restaurant_id=v_rest and user_id=v_uid;
 execute 'set local role authenticated';
 begin perform public.heartbeat_kitchen_print_device(v_device,repeat('d',64),'[]');raise exception 'REMOVED_ALLOWED';exception when insufficient_privilege then null;end;
 execute 'reset role';
end$$;
rollback;



