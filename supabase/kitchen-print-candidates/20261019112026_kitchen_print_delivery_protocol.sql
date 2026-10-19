-- Local candidate: conservative delivery authorization and immutable event history.
begin;
alter table public.kitchen_print_jobs add column claim_config_revision bigint;
create or replace function public.kitchen_job_snapshot_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at','claim_config_revision']) is distinct from (to_jsonb(old)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at','claim_config_revision']) then raise exception 'PRINT_SNAPSHOT_IMMUTABLE'; end if; return new;
end $$;
create index kitchen_jobs_device_active on public.kitchen_print_jobs(restaurant_id,device_id) where state in('leased','dispatching');
create function public.kitchen_auth_device(p_device_id uuid,p_device_secret text) returns public.kitchen_print_devices language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices;
begin
 select * into d from public.kitchen_print_devices where id=p_device_id;
 perform public.kitchen_require_role(d.restaurant_id);
 select * into d from public.kitchen_print_devices where id=p_device_id for update;
 if d.id is null or d.state<>'active' or d.operator_id<>auth.uid() or coalesce(p_device_secret,'')!~'^[a-f0-9]{64}$' or d.secret_hash<>encode(extensions.digest(p_device_secret,'sha256'),'hex') then raise exception 'PRINT_DEVICE_DENIED' using errcode='42501'; end if;
 return d;
end $$;
create function public.kitchen_retry_seconds(p_attempt integer) returns integer language sql immutable set search_path=pg_catalog as $$select (array[5,15,60,180])[least(greatest(p_attempt,1),4)]$$;
create function public.kitchen_reconcile_jobs(p_restaurant_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.kitchen_print_jobs; a public.kitchen_print_attempts;
begin
 for j in select * from public.kitchen_print_jobs where restaurant_id=p_restaurant_id and state in('leased','dispatching') and lease_expires_at<=clock_timestamp() order by lease_expires_at,id limit 100 for update skip locked loop
  if j.state='dispatching' then
   select * into a from public.kitchen_print_attempts where restaurant_id=p_restaurant_id and job_id=j.id and claim_token=j.claim_token and event='dispatching' order by id desc limit 1;
   if a.id is not null then insert into public.kitchen_print_attempts(restaurant_id,job_id,printer_id,device_id,attempt_id,claim_token,event,error_code,config_revision,actor_id) values(j.restaurant_id,j.id,j.printer_id,j.device_id,a.attempt_id,j.claim_token,'uncertain','ACK_TIMEOUT',a.config_revision,a.actor_id) on conflict do nothing; end if;
   update public.kitchen_print_jobs set state='uncertain',updated_at=clock_timestamp() where id=j.id;
  else
   update public.kitchen_print_jobs set state=case when attempt_count>=5 then 'failed' else 'retry_wait' end,next_attempt_at=clock_timestamp()+make_interval(secs=>public.kitchen_retry_seconds(attempt_count)),updated_at=clock_timestamp() where id=j.id;
  end if;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,details) values(j.restaurant_id,case when j.state='dispatching' then 'delivery_uncertain' else 'lease_expired' end,j.id,jsonb_build_object('code',case when j.state='dispatching' then 'ACK_TIMEOUT' else 'LEASE_EXPIRED' end));
 end loop;
end $$;
create function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices; o jsonb; v_observations jsonb:='{}';
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 if p_observations is null or jsonb_typeof(p_observations)<>'array' or jsonb_array_length(p_observations)>20 or length(p_observations::text)>8192 then raise exception 'INVALID_OBSERVATIONS'; end if;
 for o in select value from jsonb_array_elements(p_observations) loop
  if o->>'status' not in('reachable','unreachable','unknown','attention_required') or not exists(select 1 from public.kitchen_print_device_printers a join public.kitchen_printers p on p.id=a.printer_id and p.restaurant_id=a.restaurant_id where a.device_id=d.id and a.restaurant_id=d.restaurant_id and p.id=(o->>'printerId')::uuid and p.config_revision=(o->>'configRevision')::bigint and p.enabled) then raise exception 'OBSERVATION_DENIED'; end if;
  v_observations:=v_observations||jsonb_build_object(o->>'printerId',jsonb_build_object('status',o->>'status','configRevision',(o->>'configRevision')::bigint,'observedAt',clock_timestamp()));
 end loop;
 update public.kitchen_print_devices set last_heartbeat=clock_timestamp(),observations=observations||v_observations where id=d.id;
 perform public.kitchen_reconcile_jobs(d.restaurant_id);
 return jsonb_build_object('status','active','restaurantId',d.restaurant_id,'operatorId',d.operator_id,'serverTime',clock_timestamp(),'printers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'ip',p.ip,'port',p.port,'configRevision',p.config_revision,'enabled',p.enabled)) from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id and a.restaurant_id=p.restaurant_id where a.device_id=d.id),'[]'::jsonb));
end $$;
create function public.claim_kitchen_printer_job(p_device_id uuid,p_device_secret text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices; p public.kitchen_printers; j public.kitchen_print_jobs;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 perform public.kitchen_reconcile_jobs(d.restaurant_id);
 if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and device_id=d.id and state in('leased','dispatching')) then return null; end if;
 for p in select p.* from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id and a.restaurant_id=p.restaurant_id where a.device_id=d.id and p.enabled and p.ip is not null order by p.id limit 20 for update of p skip locked loop
  if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and printer_id=p.id and state in('leased','dispatching','uncertain')) then continue; end if;
  select * into j from public.kitchen_print_jobs j where j.restaurant_id=d.restaurant_id and j.printer_id=p.id and j.state in('queued','retry_wait') and j.next_attempt_at<=clock_timestamp() and j.attempt_count<5 and (j.kind<>'automatic' or exists(select 1 from public.kitchen_print_controls c where c.restaurant_id=d.restaurant_id and c.enabled and c.protocol_version=2) and p.auto_print) order by j.created_at,j.id limit 1 for update skip locked;
  if j.id is null then continue; end if;
  update public.kitchen_print_jobs set state='leased',claim_token=gen_random_uuid(),device_id=d.id,lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1,claim_config_revision=p.config_revision,updated_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(d.restaurant_id,'job_leased',j.id,auth.uid(),jsonb_build_object('deviceId',d.id,'attemptCount',j.attempt_count));
  return jsonb_build_object('jobId',j.id,'claimToken',j.claim_token,'leaseExpiresAt',j.lease_expires_at,'configRevision',j.claim_config_revision,'snapshotVersion',j.snapshot_version);
 end loop;
 return null;
end $$;
create function public.begin_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_config_revision bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices; j public.kitchen_print_jobs; p public.kitchen_printers; a public.kitchen_print_attempts;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id;
 select * into p from public.kitchen_printers where id=j.printer_id and restaurant_id=d.restaurant_id for update;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id<>d.id or j.claim_token is distinct from p_claim_token or p_attempt_id is null or not exists(select 1 from public.kitchen_print_device_printers where restaurant_id=d.restaurant_id and device_id=d.id and printer_id=p.id) then raise exception 'PRINT_CLAIM_DENIED' using errcode='42501'; end if;
 if not p.enabled or p.ip is null or p.config_revision is distinct from p_config_revision or j.claim_config_revision is distinct from p_config_revision then raise exception 'PRINT_CONFIG_CHANGED'; end if;
 if j.kind='automatic' then
  perform 1 from public.kitchen_print_controls where restaurant_id=d.restaurant_id and enabled and protocol_version=2 for share;
  if not found or not p.auto_print then raise exception 'PRINT_DISABLED'; end if;
 end if;
 select * into a from public.kitchen_print_attempts where attempt_id=p_attempt_id and event='dispatching';
 if a.id is not null then
  if a.job_id<>j.id or a.claim_token<>p_claim_token or a.device_id<>d.id or j.state<>'dispatching' then raise exception 'PRINT_ATTEMPT_ALREADY_CONSUMED'; end if;
 elsif j.state<>'leased' or j.lease_expires_at<=clock_timestamp() then raise exception 'PRINT_LEASE_EXPIRED';
 else
  insert into public.kitchen_print_attempts(restaurant_id,job_id,printer_id,device_id,attempt_id,claim_token,event,config_revision,actor_id) values(d.restaurant_id,j.id,p.id,d.id,p_attempt_id,p_claim_token,'dispatching',p_config_revision,auth.uid());
  update public.kitchen_print_jobs set state='dispatching',lease_expires_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() where id=j.id;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(d.restaurant_id,'dispatch_authorized',j.id,auth.uid(),jsonb_build_object('attemptId',p_attempt_id,'deviceId',d.id,'configRevision',p_config_revision));
 end if;
 return jsonb_build_object('snapshot',j.snapshot,'snapshotHash',j.snapshot_hash,'destination',jsonb_build_object('ip',p.ip,'port',p.port,'configRevision',p.config_revision),'restaurantId',d.restaurant_id,'operatorId',d.operator_id);
end $$;
create function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices; j public.kitchen_print_jobs; a public.kitchen_print_attempts; v_finish public.kitchen_print_attempts; v_state text;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 select * into a from public.kitchen_print_attempts where attempt_id=p_attempt_id and job_id=p_job_id and device_id=d.id and claim_token=p_claim_token and event='dispatching';
 if a.id is null or j.device_id<>d.id or j.claim_token is distinct from p_claim_token then raise exception 'PRINT_ATTEMPT_DENIED' using errcode='42501'; end if;
 if p_outcome not in('not_sent','transmitted','uncertain') or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$') then raise exception 'INVALID_PRINT_OUTCOME'; end if;
 select * into v_finish from public.kitchen_print_attempts where attempt_id=p_attempt_id and event in('not_sent','transmitted','uncertain');
 if v_finish.id is not null then
  -- Timeout reconciliation is authoritative and cannot be downgraded by a late ACK.
  if v_finish.event<>p_outcome and v_finish.error_code is distinct from 'ACK_TIMEOUT' then raise exception 'PRINT_OUTCOME_CONFLICT'; end if;
  return jsonb_build_object('accepted',true,'outcome',v_finish.event,'state',j.state);
 end if;
 if j.state<>'dispatching' then raise exception 'PRINT_ATTEMPT_NOT_DISPATCHING'; end if;
 v_state:=case when p_outcome='not_sent' then case when j.attempt_count>=5 then 'failed' else 'retry_wait' end else p_outcome end;
 insert into public.kitchen_print_attempts(restaurant_id,job_id,printer_id,device_id,attempt_id,claim_token,event,error_code,config_revision,actor_id) values(d.restaurant_id,j.id,j.printer_id,d.id,p_attempt_id,p_claim_token,p_outcome,p_error_code,a.config_revision,auth.uid());
 update public.kitchen_print_jobs set state=v_state,next_attempt_at=clock_timestamp()+make_interval(secs=>public.kitchen_retry_seconds(attempt_count)),updated_at=clock_timestamp() where id=j.id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(d.restaurant_id,'delivery_'||p_outcome,j.id,auth.uid(),jsonb_build_object('attemptId',p_attempt_id,'errorCode',p_error_code));
 return jsonb_build_object('accepted',true,'outcome',p_outcome,'state',v_state);
end $$;
create function public.list_kitchen_print_history(p_restaurant_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public.kitchen_require_role(p_restaurant_id);
 if p_limit not between 1 and 100 or (p_before is null)<>(p_before_id is null) then raise exception 'INVALID_HISTORY_PAGE'; end if;
 perform public.kitchen_reconcile_jobs(p_restaurant_id);
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (select id,order_id,printer_id,kind,state,attempt_count,created_at,updated_at,parent_job_id,reason,destination,snapshot->>'orderNumber' as order_number from public.kitchen_print_jobs where restaurant_id=p_restaurant_id and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit p_limit) q),'[]'::jsonb);
end $$;
create function public.request_kitchen_reprint(p_job_id uuid,p_reason text,p_request_key uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.kitchen_print_jobs; v_uid uuid; v_id uuid; s jsonb; p public.kitchen_printers;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id; v_uid:=public.kitchen_require_role(j.restaurant_id);
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 or p_request_key is null then raise exception 'REPRINT_REASON_AND_CONFIRMATION_REQUIRED'; end if;
 select id into v_id from public.kitchen_print_jobs where restaurant_id=j.restaurant_id and request_actor=v_uid and request_key=p_request_key;
 if found then return v_id; end if;
 select * into p from public.kitchen_printers where restaurant_id=j.restaurant_id and id=j.printer_id for share;
 if not p.enabled or p.ip is null then raise exception 'PRINTER_NOT_CONFIGURED'; end if;
 s:=j.snapshot||jsonb_build_object('kind','reprint');
 insert into public.kitchen_print_jobs(restaurant_id,order_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision,parent_job_id,request_actor,request_key,reason) values(j.restaurant_id,j.order_id,j.printer_id,'reprint',s,encode(extensions.digest(s::text,'sha256'),'hex'),j.destination,p.config_revision,j.id,v_uid,p_request_key,trim(p_reason)) on conflict(restaurant_id,request_actor,request_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.kitchen_print_jobs where restaurant_id=j.restaurant_id and request_actor=v_uid and request_key=p_request_key; else insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(j.restaurant_id,'reprint_requested',v_id,v_uid,jsonb_build_object('parentJobId',j.id,'reason',trim(p_reason),'duplicatePaperConfirmed',true)); end if;
 return v_id;
end $$;
create function public.resolve_kitchen_print_uncertainty(p_job_id uuid,p_resolution text,p_reason text) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.kitchen_print_jobs; v_uid uuid;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id; v_uid:=public.kitchen_require_role(j.restaurant_id);
 if p_resolution not in('paper_observed_agent_stopped','no_paper_agent_stopped') or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'CONFIRM_STOPPED_AGENT_AND_REASON'; end if;
 perform 1 from public.kitchen_printers where id=j.printer_id for update;
 select * into j from public.kitchen_print_jobs where id=p_job_id for update;
 if j.state='resolved' then return true; end if;
 if j.state<>'uncertain' then raise exception 'PRINT_NOT_UNCERTAIN'; end if;
 update public.kitchen_print_jobs set state='resolved',updated_at=clock_timestamp() where id=j.id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(j.restaurant_id,'uncertainty_resolved',j.id,v_uid,jsonb_build_object('resolution',p_resolution,'reason',trim(p_reason),'oldAgentStoppedConfirmed',true)); return true;
end $$;
create function public.request_kitchen_test_print(p_printer_id uuid,p_request_key uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare p public.kitchen_printers; v_uid uuid; v_id uuid; r public.restaurants; s jsonb;
begin
 select * into p from public.kitchen_printers where id=p_printer_id; v_uid:=public.kitchen_require_role(p.restaurant_id);
 if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED'; end if;
 if not p.enabled or p.ip is null or not exists(select 1 from public.kitchen_print_devices d join public.kitchen_print_device_printers a on a.device_id=d.id and a.restaurant_id=d.restaurant_id join public.restaurant_staff st on st.restaurant_id=d.restaurant_id and st.user_id=d.operator_id and st.role in('owner','manager','staff','kitchen') where a.printer_id=p.id and d.state='active' and d.last_heartbeat>clock_timestamp()-interval '60 seconds') then raise exception 'AUTHORIZED_AGENT_REQUIRED'; end if;
 select id into v_id from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and request_actor=v_uid and request_key=p_request_key;
 if found then return v_id; end if;
 select * into r from public.restaurants where id=p.restaurant_id;
 s:=jsonb_build_object('version',1,'restaurantName',r.name,'timezone',r.timezone,'orderNumber','TEST','tableLabel','SETUP TEST','createdAt',clock_timestamp(),'destination',p.destination,'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Synthetic test ticket — no food order','quantity',1,'modifiers','[]'::jsonb,'notes','Confirm paper visually')),'instructions','TEST ONLY','copies',p.copies,'autoCut',p.auto_cut,'profile','escpos-80mm-v1','kind','test');
 insert into public.kitchen_print_jobs(restaurant_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision,request_actor,request_key) values(p.restaurant_id,p.id,'test',s,encode(extensions.digest(s::text,'sha256'),'hex'),p.destination,p.config_revision,v_uid,p_request_key) on conflict(restaurant_id,request_actor,request_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and request_actor=v_uid and request_key=p_request_key; else insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id) values(p.restaurant_id,'test_requested',v_id,v_uid); end if; return v_id;
end $$;
-- The operational projection reconciles expiry even while no tablet is online.
alter function public.list_kitchen_printers(uuid) rename to kitchen_list_printers_base;
revoke all on function public.kitchen_list_printers_base(uuid) from public,anon,authenticated,service_role;
create function public.list_kitchen_printers(p_restaurant_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public.kitchen_require_role(p_restaurant_id); perform public.kitchen_reconcile_jobs(p_restaurant_id);
 return public.kitchen_list_printers_base(p_restaurant_id)||jsonb_build_object('jobs',public.list_kitchen_print_history(p_restaurant_id,null,null,100),'alerts',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,event,entity_id,created_at,details from public.kitchen_print_audit where restaurant_id=p_restaurant_id and event in('dispatch_attention','delivery_uncertain','delivery_not_sent') order by created_at desc,id desc limit 100) q),'[]'::jsonb));
end $$;
do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('kitchen_auth_device','kitchen_retry_seconds','kitchen_reconcile_jobs','heartbeat_kitchen_print_device','claim_kitchen_printer_job','begin_kitchen_print_attempt','finish_kitchen_print_attempt','list_kitchen_print_history','request_kitchen_reprint','resolve_kitchen_print_uncertainty','request_kitchen_test_print','list_kitchen_printers') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f); end loop;
end$$;
grant execute on function public.heartbeat_kitchen_print_device(uuid,text,jsonb),public.claim_kitchen_printer_job(uuid,text),public.begin_kitchen_print_attempt(uuid,text,uuid,uuid,uuid,bigint),public.finish_kitchen_print_attempt(uuid,text,uuid,uuid,uuid,text,text),public.list_kitchen_print_history(uuid,timestamptz,uuid,integer),public.request_kitchen_reprint(uuid,text,uuid),public.resolve_kitchen_print_uncertainty(uuid,text,text),public.request_kitchen_test_print(uuid,uuid),public.list_kitchen_printers(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
