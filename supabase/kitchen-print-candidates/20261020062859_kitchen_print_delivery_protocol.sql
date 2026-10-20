begin;
create function public.kp_transition(p_job_id uuid,p_event text,p_detail jsonb default '{}') returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.kitchen_print_attempts(restaurant_id,job_id,attempt_id,event,device_id,actor_id,detail)
 select restaurant_id,id,attempt_id,p_event,device_id,auth.uid(),p_detail from public.kitchen_print_jobs where id=p_job_id
$$;
create function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices; entry jsonb; result jsonb:='{}'; pid uuid;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 if jsonb_typeof(p_observations)<>'object' or octet_length(p_observations::text)>8192 then raise exception 'INVALID_OBSERVATIONS';end if;
 for pid in select printer_id from public.kitchen_print_device_printers where device_id=d.id loop
 entry:=p_observations->pid::text;
 if entry is not null then result:=result||jsonb_build_object(pid::text,jsonb_build_object('reachable',coalesce((entry->>'reachable')::boolean,false),'observedAt',clock_timestamp()));end if;
 end loop;
 update public.kitchen_print_devices set last_seen_at=clock_timestamp(),observations=result where id=d.id;
 return jsonb_build_object('serverTime',clock_timestamp(),'printers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'ip',p.ip,'port',p.port,'revision',p.revision)) from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id where a.device_id=d.id and p.enabled),'[]'::jsonb));
end $$;
create function public.claim_kitchen_printer_job(p_device_id uuid,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;p public.kitchen_printers;j public.kitchen_print_jobs;c public.kitchen_print_controls;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 update public.kitchen_print_devices set last_seen_at=clock_timestamp() where id=d.id;
 for p in select pr.* from public.kitchen_printers pr join public.kitchen_print_device_printers a on a.printer_id=pr.id and a.restaurant_id=pr.restaurant_id
 where a.device_id=d.id and pr.enabled and pr.ip is not null order by pr.id for update of pr skip locked limit 20 loop
 select * into j from public.kitchen_print_jobs where printer_id=p.id and state in('leased','dispatching','uncertain') for update;
 if j.id is not null then
 if j.state='dispatching' and j.lease_expires_at<clock_timestamp() then
 update public.kitchen_print_jobs set state='uncertain',error_code='DISPATCH_ACK_MISSING' where id=j.id;
 perform public.kp_transition(j.id,'uncertain','{"code":"DISPATCH_ACK_MISSING"}');
 elsif j.state='leased' and j.lease_expires_at<clock_timestamp() then
 update public.kitchen_print_jobs set state=case when attempt_count>=5 then 'failed' else 'retry_wait' end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>case attempt_count when 1 then 5 when 2 then 15 when 3 then 60 else 180 end),
 error_code='LEASE_EXPIRED_BEFORE_DISPATCH',claim_token=null,device_id=null where id=j.id;
 perform public.kp_transition(j.id,'pre_dispatch_lease_expired');
 else continue;
 end if;
 if j.state<>'leased' then continue;end if;
 end if;
 select * into c from public.kitchen_print_controls where restaurant_id=d.restaurant_id;
 select * into j from public.kitchen_print_jobs where printer_id=p.id and restaurant_id=d.restaurant_id and state in('queued','retry_wait')
 and next_attempt_at<=clock_timestamp() and attempt_count<5 and (kind<>'automatic' or (c.enabled and p.auto_print)) order by created_at,id for update skip locked limit 1;
 if j.id is null then continue;end if;
 update public.kitchen_print_jobs set state='leased',claim_token=gen_random_uuid(),device_id=d.id,
 lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1,config_revision=p.revision,attempt_id=null,last_outcome=null,error_code=null
 where id=j.id returning * into j;
 perform public.kp_transition(j.id,'leased');
 return jsonb_build_object('jobId',j.id,'claimToken',j.claim_token,'configRevision',j.config_revision,'printerId',p.id,'ip',p.ip,'port',p.port,'snapshot',j.snapshot);
 end loop;
 return null;
end $$;
create function public.begin_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_config_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or p_claim_token is null or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p.revision<>p_config_revision or j.config_revision<>p_config_revision or not p.enabled or p.ip is null
 or not exists(select 1 from public.kitchen_print_device_printers where device_id=d.id and printer_id=p.id)
 or (j.kind='automatic' and (not p.auto_print or not exists(select 1 from public.kitchen_print_controls where restaurant_id=d.restaurant_id and enabled and protocol_version=2))) then raise exception 'PRINT_CONFIG_OR_AUTH_CHANGED';end if;
 if j.state='dispatching' and j.attempt_id=p_attempt_id then return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);end if;
 if j.state<>'leased' or j.lease_expires_at<=clock_timestamp() then raise exception 'PRINT_LEASE_EXPIRED';end if;
 update public.kitchen_print_jobs set state='dispatching',attempt_id=p_attempt_id,lease_expires_at=clock_timestamp()+interval '30 seconds' where id=j.id;
 perform public.kp_transition(j.id,'dispatching');
 return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);
end $$;
create function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;v_state text;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or j.attempt_id is distinct from p_attempt_id or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p_outcome not in('not_sent','transmitted','uncertain') then raise exception 'INVALID_TRANSPORT_OUTCOME';end if;
 if j.last_outcome is not null then
 if j.last_outcome<>p_outcome then raise exception 'PRINT_OUTCOME_CONFLICT';end if;
 return jsonb_build_object('state',j.state);
 end if;
 if j.state not in('dispatching','uncertain') then raise exception 'PRINT_ATTEMPT_NOT_STARTED';end if;
 -- Once an expired dispatch is uncertain, no late acknowledgement may silently release its quarantine.
 if j.state='uncertain' then p_outcome:='uncertain';end if;
 v_state:=case p_outcome when 'transmitted' then 'transmitted' when 'uncertain' then 'uncertain' else case when j.attempt_count>=5 then 'failed' else 'retry_wait' end end;
 update public.kitchen_print_jobs set state=v_state,last_outcome=p_outcome,error_code=case when p_error_code ~ '^[A-Z0-9_]{1,80}$' then p_error_code else null end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>case j.attempt_count when 1 then 5 when 2 then 15 when 3 then 60 else 180 end) where id=j.id;
 perform public.kp_transition(j.id,v_state,jsonb_build_object('outcome',p_outcome));
 return jsonb_build_object('state',v_state);
end $$;
create function public.kp_manual_job(p_printer_id uuid,p_kind text,p_key uuid,p_snapshot jsonb,p_order_id uuid,p_parent uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;v uuid;
begin
 select * into p from public.kitchen_printers where id=p_printer_id for update;
 perform public.kp_require_role(p.restaurant_id);
 if not p.enabled or p.ip is null then raise exception 'PRINTER_NOT_CONFIGURED';end if;
 if p_key is null then raise exception 'REQUEST_KEY_REQUIRED';end if;
 if exists(select 1 from public.orders where restaurant_id=p.restaurant_id and kitchen_print_claimed_at>now()-interval '2 minutes' and kitchen_printed_at is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;
 insert into public.kitchen_print_controls(restaurant_id,protocol_version) values(p.restaurant_id,2) on conflict(restaurant_id) do update set protocol_version=2;
 insert into public.kitchen_print_jobs(restaurant_id,printer_id,order_id,kind,dispatch_key,snapshot,parent_job_id,requested_by,reason)
 values(p.restaurant_id,p.id,p_order_id,p_kind,p_kind||':'||auth.uid()||':'||p_key,p_snapshot,p_parent,auth.uid(),left(p_reason,500))
 on conflict(restaurant_id,printer_id,dispatch_key) do nothing returning id into v;
 if v is null then select id into v from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and printer_id=p.id and dispatch_key=p_kind||':'||auth.uid()||':'||p_key;
 else perform public.kp_audit(p.restaurant_id,p_kind||'_requested',jsonb_build_object('reason',left(p_reason,500)),v,p.id);end if;
 return v;
end $$;
create function public.request_kitchen_test_print(p_printer_id uuid,p_request_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;r public.restaurants;s jsonb;
begin
 select * into p from public.kitchen_printers where id=p_printer_id;
 perform public.kp_require_role(p.restaurant_id);
 select * into r from public.restaurants where id=p.restaurant_id;
 s:=jsonb_build_object('version',1,'restaurantName',r.name,'timezone',r.timezone,'orderNumber','TEST','tableName','TEST PRINT','createdAt',now(),'destination',p.destination,'copies',p.copies,'autoCut',p.auto_cut,'instructions','Synthetic setup ticket. Paper output must be checked by staff.','items',jsonb_build_array(jsonb_build_object('name','TEST ITEM','quantity',1,'notes','No customer order','modifiers','[]'::jsonb)));
 return public.kp_manual_job(p.id,'test',p_request_key,s,null,null,'Explicit test print');
end $$;
create function public.request_kitchen_reprint(p_job_id uuid,p_reason text,p_request_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.kitchen_print_jobs;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kp_require_role(j.restaurant_id);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REPRINT_REASON_REQUIRED';end if;
 return public.kp_manual_job(j.printer_id,'reprint',p_request_key,j.snapshot||jsonb_build_object('reprint',true),j.order_id,j.id,p_reason);
end $$;
create function public.request_legacy_kitchen_reprint(p_order_id uuid,p_printer_id uuid,p_reason text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;r uuid;
begin
 select restaurant_id into r from public.orders where id=p_order_id;
 perform public.kp_require_role(r);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REPRINT_REASON_REQUIRED';end if;
 s:=public.kp_snapshot(p_order_id,p_printer_id);
 if s is null or jsonb_array_length(s->'items')=0 then raise exception 'PRINT_SOURCE_NOT_FOUND';end if;
 return public.kp_manual_job(p_printer_id,'reprint',p_request_key,s||'{"reprint":true,"legacySource":true}'::jsonb,p_order_id,null,p_reason);
end $$;
create function public.resolve_kitchen_print_uncertainty(p_job_id uuid,p_resolution text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.kitchen_print_jobs;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kp_require_role(j.restaurant_id);
 perform 1 from public.kitchen_printers where id=j.printer_id for update;
 select * into j from public.kitchen_print_jobs where id=p_job_id for update;
 if p_resolution not in('paper_checked','agent_stopped') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'RESOLUTION_CONFIRMATION_REQUIRED';end if;
 if j.state='resolved' then return true;end if;
 if j.state not in('uncertain','failed') then raise exception 'PRINT_NOT_RESOLVABLE';end if;
 update public.kitchen_print_jobs set state='resolved' where id=j.id;
 perform public.kp_transition(j.id,'resolved',jsonb_build_object('resolution',p_resolution,'reason',left(p_reason,500)));
 perform public.kp_audit(j.restaurant_id,'uncertainty_resolved',jsonb_build_object('reason',left(p_reason,500)),j.id,j.printer_id);
 return true;
end $$;
do $$declare f record;begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'kp_%' or proname in('heartbeat_kitchen_print_device','claim_kitchen_printer_job','begin_kitchen_print_attempt','finish_kitchen_print_attempt','request_kitchen_test_print','request_kitchen_reprint','request_legacy_kitchen_reprint','resolve_kitchen_print_uncertainty')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.proname not like 'kp_%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;
commit;
notify pgrst,'reload schema';


