begin;
create or replace function public.claim_kitchen_printer_job(p_device_id uuid,p_device_secret text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
#variable_conflict use_column
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

commit;
