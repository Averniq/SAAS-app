begin;
create or replace function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb default '{}')
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
 return jsonb_build_object('serverTime',clock_timestamp(),'printers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'ip',p.ip,'port',p.port,'revision',p.revision,'attention',exists(select 1 from public.kitchen_print_jobs j where j.restaurant_id=d.restaurant_id and j.printer_id=p.id and (j.state in('uncertain','failed') or (j.state='dispatching' and j.lease_expires_at<clock_timestamp()))))) from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id where a.device_id=d.id and p.enabled),'[]'::jsonb));
end $$;
commit; notify pgrst,'reload schema';
