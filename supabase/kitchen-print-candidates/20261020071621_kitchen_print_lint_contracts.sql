begin; alter function public.kp_require_role(uuid,boolean) stable;
create or replace function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices; entry jsonb; result jsonb:='{}'::jsonb; pid uuid;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 if jsonb_typeof(p_observations)<>'object' or octet_length(p_observations::text)>8192 then raise exception 'INVALID_OBSERVATIONS';end if;
 for pid in select printer_id from public.kitchen_print_device_printers where device_id=d.id loop
 entry:=p_observations->pid::text;
 if entry is not null then result:=result||jsonb_build_object(pid::text,jsonb_build_object('reachable',coalesce((entry->>'reachable')::boolean,false),'observedAt',clock_timestamp()));end if;
 end loop;
 update public.kitchen_print_devices set last_seen_at=clock_timestamp(),observations=result where id=d.id;
 return jsonb_build_object('serverTime',clock_timestamp(),'printers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'ip',p.ip,'port',p.port,'revision',p.revision,'attention',exists(select 1 from public.kitchen_print_jobs j where j.restaurant_id=d.restaurant_id and j.printer_id=p.id and (j.state in('uncertain','failed') or (j.state='dispatching' and j.lease_expires_at<clock_timestamp()))))) from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id where a.device_id=d.id and p.enabled),'[]'::jsonb));
end $$;
create or replace function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;v_state text;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 perform 1 from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or j.attempt_id is distinct from p_attempt_id or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p_outcome is null or p_outcome not in('not_sent','transmitted','uncertain') then raise exception 'INVALID_TRANSPORT_OUTCOME';end if;
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
commit; notify pgrst,'reload schema';
