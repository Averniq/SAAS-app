begin;
create table public.kitchen_print_endpoint_guards (
 restaurant_id uuid not null,ip text not null,port integer not null,active_job_id uuid,
 primary key(restaurant_id,ip,port),foreign key(restaurant_id,active_job_id) references public.kitchen_print_jobs(restaurant_id,id)
);
alter table public.kitchen_print_endpoint_guards enable row level security;
revoke all on public.kitchen_print_endpoint_guards from public,anon,authenticated,service_role;
alter table public.kitchen_print_jobs add column claim_ip text,add column claim_port integer;
alter table public.kitchen_print_attempts add column endpoint_ip text,add column endpoint_port integer;
create or replace function public.kitchen_job_snapshot_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at','claim_config_revision','claim_ip','claim_port']) is distinct from (to_jsonb(old)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at','claim_config_revision','claim_ip','claim_port']) then raise exception 'PRINT_SNAPSHOT_IMMUTABLE'; end if; return new;
end $$;
create function public.kitchen_attempt_endpoint() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 select claim_ip,claim_port into new.endpoint_ip,new.endpoint_port from public.kitchen_print_jobs where id=new.job_id and restaurant_id=new.restaurant_id; return new;
end $$;
revoke all on function public.kitchen_attempt_endpoint() from public,anon,authenticated,service_role;
create trigger kitchen_attempt_endpoint before insert on public.kitchen_print_attempts for each row execute function public.kitchen_attempt_endpoint();
create or replace function public.claim_kitchen_printer_job(p_device_id uuid,p_device_secret text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
#variable_conflict use_column
declare d public.kitchen_print_devices; p public.kitchen_printers; j public.kitchen_print_jobs;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 perform public.kitchen_reconcile_jobs(d.restaurant_id);
 if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and device_id=d.id and state in('leased','dispatching')) then return null; end if;
 for p in select p.* from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id and a.restaurant_id=p.restaurant_id where a.device_id=d.id and p.enabled and p.ip is not null order by p.id limit 20 for update of p skip locked loop
  insert into public.kitchen_print_endpoint_guards(restaurant_id,ip,port) values(d.restaurant_id,p.ip,p.port) on conflict do nothing;
  perform 1 from public.kitchen_print_endpoint_guards where restaurant_id=d.restaurant_id and ip=p.ip and port=p.port for update;
  if exists(select 1 from public.kitchen_print_endpoint_guards g join public.kitchen_print_jobs x on x.id=g.active_job_id and x.restaurant_id=g.restaurant_id where g.restaurant_id=d.restaurant_id and g.ip=p.ip and g.port=p.port and x.state in('leased','dispatching','uncertain')) then continue; end if;
  if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and printer_id=p.id and state in('leased','dispatching','uncertain')) then continue; end if;
  select * into j from public.kitchen_print_jobs j where j.restaurant_id=d.restaurant_id and j.printer_id=p.id and j.state in('queued','retry_wait') and j.next_attempt_at<=clock_timestamp() and j.attempt_count<5 and (j.kind<>'automatic' or exists(select 1 from public.kitchen_print_controls c where c.restaurant_id=d.restaurant_id and c.enabled and c.protocol_version=2) and p.auto_print) order by j.created_at,j.id limit 1 for update skip locked;
  if j.id is null then continue; end if;
  update public.kitchen_print_jobs set state='leased',claim_token=gen_random_uuid(),device_id=d.id,lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1,claim_ip=p.ip,claim_port=p.port,claim_config_revision=p.config_revision,updated_at=clock_timestamp() where id=j.id returning * into j;
  update public.kitchen_print_endpoint_guards set active_job_id=j.id where restaurant_id=d.restaurant_id and ip=p.ip and port=p.port;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(d.restaurant_id,'job_leased',j.id,auth.uid(),jsonb_build_object('deviceId',d.id,'attemptCount',j.attempt_count));
  return jsonb_build_object('jobId',j.id,'claimToken',j.claim_token,'leaseExpiresAt',j.lease_expires_at,'configRevision',j.claim_config_revision,'snapshotVersion',j.snapshot_version);
 end loop;
 return null;
end $$;

alter function public.list_kitchen_print_history(uuid,timestamptz,uuid,integer) rename to kitchen_history_bounded_internal;
revoke all on function public.kitchen_history_bounded_internal(uuid,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
create function public.list_kitchen_print_history(p_restaurant_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_HISTORY_PAGE'; end if;
 return public.kitchen_history_bounded_internal(p_restaurant_id,p_before,p_before_id,p_limit);
end $$;
alter function public.heartbeat_kitchen_print_device(uuid,text,jsonb) rename to kitchen_heartbeat_internal;
revoke all on function public.kitchen_heartbeat_internal(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 if jsonb_typeof(p_observations) is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_observations) o where o->>'status' is null) then raise exception 'INVALID_OBSERVATIONS'; end if;
 return public.kitchen_heartbeat_internal(p_device_id,p_device_secret,p_observations);
end $$;
alter function public.request_kitchen_reprint(uuid,text,uuid) rename to kitchen_reprint_internal;
revoke all on function public.kitchen_reprint_internal(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.request_kitchen_reprint(p_job_id uuid,p_reason text,p_request_key uuid,p_duplicate_paper_confirmed boolean default false) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 if p_duplicate_paper_confirmed is distinct from true then raise exception 'REPRINT_CONFIRMATION_REQUIRED'; end if;
 return public.kitchen_reprint_internal(p_job_id,p_reason,p_request_key);
end $$;
alter function public.resolve_kitchen_print_uncertainty(uuid,text,text) rename to kitchen_resolve_internal;
revoke all on function public.kitchen_resolve_internal(uuid,text,text) from public,anon,authenticated,service_role;
create function public.resolve_kitchen_print_uncertainty(p_job_id uuid,p_resolution text,p_reason text,p_agent_stopped_confirmed boolean default false) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 if p_agent_stopped_confirmed is distinct from true or p_resolution is null or p_resolution not in('paper_observed_agent_stopped','no_paper_agent_stopped') then raise exception 'CONFIRM_STOPPED_AGENT_AND_REASON'; end if;
 return public.kitchen_resolve_internal(p_job_id,p_resolution,p_reason);
end $$;
revoke all on function public.list_kitchen_print_history(uuid,timestamptz,uuid,integer),public.heartbeat_kitchen_print_device(uuid,text,jsonb),public.request_kitchen_reprint(uuid,text,uuid,boolean),public.resolve_kitchen_print_uncertainty(uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.list_kitchen_print_history(uuid,timestamptz,uuid,integer),public.heartbeat_kitchen_print_device(uuid,text,jsonb),public.request_kitchen_reprint(uuid,text,uuid,boolean),public.resolve_kitchen_print_uncertainty(uuid,text,text,boolean) to authenticated;
commit;
notify pgrst,'reload schema';
