\set ON_ERROR_STOP on
begin;
do $$ declare r uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p jsonb;pair jsonb;d jsonb;j uuid;k uuid:=gen_random_uuid();a jsonb;b jsonb;attempt uuid:=gen_random_uuid();denied bool;
begin
 if to_regprocedure('public.claim_kitchen_printer_job(uuid,text)') is null then raise exception 'MISSING_DELIVERY_PROTOCOL';end if;
 insert into auth.users(id,email) values(u,u||'@delivery.local');
 insert into public.restaurants(id,name,slug) values(r,'SYNTHETIC DELIVERY',r::text);
 insert into public.restaurant_staff(restaurant_id,user_id,role) values(r,u,'owner');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 p:=public.save_kitchen_printer(r,null,'{"name":"Kitchen","ip":"192.168.30.20"}');
 pair:=public.begin_kitchen_print_pairing(r,'Tablet',encode(extensions.digest(repeat('s',64),'sha256'),'hex'));
 perform public.approve_kitchen_print_pairing((pair->>'id')::uuid,array[(p->>'id')::uuid]);
 d:=public.activate_kitchen_print_pairing((pair->>'id')::uuid,repeat('s',64));
 j:=public.request_kitchen_test_print((p->>'id')::uuid,k);
 if public.request_kitchen_test_print((p->>'id')::uuid,k)<>j then raise exception 'DUPLICATE_TEST_PRINT';end if;
 a:=public.claim_kitchen_printer_job((d->>'deviceId')::uuid,repeat('s',64));
 if (a->>'jobId')::uuid<>j then raise exception 'CLAIM_FAILED';end if;
 if public.claim_kitchen_printer_job((d->>'deviceId')::uuid,repeat('s',64)) is not null then raise exception 'DOUBLE_CLAIM';end if;
 denied:=false;begin perform public.begin_kitchen_print_attempt((d->>'deviceId')::uuid,repeat('s',64),j,gen_random_uuid(),attempt,(a->>'configRevision')::bigint);exception when others then denied:=true;end;if not denied then raise exception 'WRONG_TOKEN_ALLOWED';end if;
 b:=public.begin_kitchen_print_attempt((d->>'deviceId')::uuid,repeat('s',64),j,(a->>'claimToken')::uuid,attempt,(a->>'configRevision')::bigint);
 b:=public.finish_kitchen_print_attempt((d->>'deviceId')::uuid,repeat('s',64),j,(a->>'claimToken')::uuid,attempt,'uncertain','SOCKET_PARTIAL');
 if b->>'state'<>'uncertain' then raise exception 'UNCERTAINTY_LOST';end if;
 perform public.request_kitchen_test_print((p->>'id')::uuid,gen_random_uuid());
 if public.claim_kitchen_printer_job((d->>'deviceId')::uuid,repeat('s',64)) is not null then raise exception 'UNCERTAIN_RETRIED';end if;
 perform public.resolve_kitchen_print_uncertainty(j,'paper_checked','Paper checked and old agent stopped');
 b:=public.claim_kitchen_printer_job((d->>'deviceId')::uuid,repeat('s',64));
 if b is null then raise exception 'RESOLUTION_BLOCKED_NEXT_JOB';end if;
 perform public.revoke_kitchen_print_device((d->>'deviceId')::uuid,'Tablet removed');
 denied:=false;begin perform public.claim_kitchen_printer_job((d->>'deviceId')::uuid,repeat('s',64));exception when others then denied:=true;end;if not denied then raise exception 'REVOKED_DEVICE_ALLOWED';end if;
 if has_function_privilege('anon','public.claim_kitchen_printer_job(uuid,text)','execute') or has_function_privilege('authenticated','public.kp_device(uuid,text)','execute') then raise exception 'RPC_ACL_EXPOSED';end if;
end $$;
rollback;
\echo Kitchen delivery assertions passed
