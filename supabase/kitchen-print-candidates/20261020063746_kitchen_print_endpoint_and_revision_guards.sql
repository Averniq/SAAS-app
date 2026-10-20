begin;
-- Forward correction: a disabled printer keeps its endpoint reservation.
drop index public.kitchen_printers_endpoint;
create unique index kitchen_printers_endpoint on public.kitchen_printers(restaurant_id,ip,port) where ip is not null;
create function public.kp_guard_endpoint() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.ip,new.port) is distinct from (old.ip,old.port) and exists(select 1 from public.kitchen_print_jobs where printer_id=old.id and state in('leased','dispatching','uncertain')) then raise exception 'ENDPOINT_HAS_UNRESOLVED_ATTEMPT';end if;
 return new;
end $$;
create trigger kitchen_printer_endpoint_guard before update on public.kitchen_printers for each row execute function public.kp_guard_endpoint();
revoke all on function public.kp_guard_endpoint() from public,anon,authenticated,service_role;

create or replace function public.begin_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_config_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or p_claim_token is null or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p_config_revision is null or p.revision is distinct from p_config_revision or j.config_revision is distinct from p_config_revision or not p.enabled or p.ip is null
 or not exists(select 1 from public.kitchen_print_device_printers where device_id=d.id and printer_id=p.id)
 or (j.kind='automatic' and (not p.auto_print or not exists(select 1 from public.kitchen_print_controls where restaurant_id=d.restaurant_id and enabled and protocol_version=2))) then raise exception 'PRINT_CONFIG_OR_AUTH_CHANGED';end if;
 if j.state='dispatching' and j.attempt_id=p_attempt_id then return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);end if;
 if j.state<>'leased' or j.lease_expires_at<=clock_timestamp() then raise exception 'PRINT_LEASE_EXPIRED';end if;
 update public.kitchen_print_jobs set state='dispatching',attempt_id=p_attempt_id,lease_expires_at=clock_timestamp()+interval '30 seconds' where id=j.id;
 perform public.kp_transition(j.id,'dispatching');
 return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);
end $$;
create or replace function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;v_state text;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
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
create or replace function public.resolve_kitchen_print_uncertainty(p_job_id uuid,p_resolution text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.kitchen_print_jobs;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kp_require_role(j.restaurant_id);
 perform 1 from public.kitchen_printers where id=j.printer_id for update;
 select * into j from public.kitchen_print_jobs where id=p_job_id for update;
 if p_resolution is null or p_resolution not in('paper_checked','agent_stopped') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'RESOLUTION_CONFIRMATION_REQUIRED';end if;
 if j.state='resolved' then return true;end if;
 if j.state not in('uncertain','failed') then raise exception 'PRINT_NOT_RESOLVABLE';end if;
 update public.kitchen_print_jobs set state='resolved' where id=j.id;
 perform public.kp_transition(j.id,'resolved',jsonb_build_object('resolution',p_resolution,'reason',left(p_reason,500)));
 perform public.kp_audit(j.restaurant_id,'uncertainty_resolved',jsonb_build_object('reason',left(p_reason,500)),j.id,j.printer_id);
 return true;
end $$;
create or replace function public.kp_manual_job(p_printer_id uuid,p_kind text,p_key uuid,p_snapshot jsonb,p_order_id uuid,p_parent uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;v uuid;
begin
 select * into p from public.kitchen_printers where id=p_printer_id for update;
 perform public.kp_require_role(p.restaurant_id); perform pg_advisory_xact_lock(hashtextextended(p.restaurant_id::text,27));
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
create or replace function public.claim_kitchen_print_job(p_restaurant_slug text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended((select id::text from public.restaurants where slug=p_restaurant_slug),27));
 if exists(select 1 from public.kitchen_print_controls c join public.restaurants r on r.id=c.restaurant_id where r.slug=p_restaurant_slug and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 return public.kp_legacy_claim(p_restaurant_slug);
end $$;
create or replace function public.finish_kitchen_print_job(p_order_id uuid,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended((select restaurant_id::text from public.orders where id=p_order_id),27));
 if exists(select 1 from public.kitchen_print_controls c join public.orders o on o.restaurant_id=c.restaurant_id where o.id=p_order_id and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 return public.kp_legacy_finish(p_order_id,p_claim_token,p_success,p_error);
end $$;
commit;
