begin;
CREATE OR REPLACE FUNCTION public.begin_kitchen_print_attempt(p_device_id uuid, p_device_secret text, p_job_id uuid, p_claim_token uuid, p_attempt_id uuid, p_config_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare d public.kitchen_print_devices; j public.kitchen_print_jobs; p public.kitchen_printers; a public.kitchen_print_attempts;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id;
 select * into p from public.kitchen_printers where id=j.printer_id and restaurant_id=d.restaurant_id for no key update;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for no key update;
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
end $function$;

CREATE OR REPLACE FUNCTION public.claim_kitchen_print_job(p_restaurant_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$declare v_id uuid; begin
 select id into v_id from public.restaurants where slug=p_restaurant_slug for no key update;
 perform public.kitchen_require_role(v_id);
 if exists(select 1 from public.kitchen_print_controls where restaurant_id=v_id and protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED'; end if;
 return public.kitchen_legacy_claim_v1(p_restaurant_slug);
end $function$;

CREATE OR REPLACE FUNCTION public.claim_kitchen_printer_job(p_device_id uuid, p_device_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare d public.kitchen_print_devices; p public.kitchen_printers; j public.kitchen_print_jobs;
begin
 d:=public.kitchen_auth_device(p_device_id,p_device_secret);
 perform public.kitchen_reconcile_jobs(d.restaurant_id);
 if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and device_id=d.id and state in('leased','dispatching')) then return null; end if;
 for p in select p.* from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id and a.restaurant_id=p.restaurant_id where a.device_id=d.id and p.enabled and p.ip is not null order by p.id limit 20 for no key update of p skip locked loop
  insert into public.kitchen_print_endpoint_guards(restaurant_id,ip,port) values(d.restaurant_id,p.ip,p.port) on conflict do nothing;
  perform 1 from public.kitchen_print_endpoint_guards where restaurant_id=d.restaurant_id and ip=p.ip and port=p.port for no key update;
  if exists(select 1 from public.kitchen_print_endpoint_guards g join public.kitchen_print_jobs x on x.id=g.active_job_id and x.restaurant_id=g.restaurant_id where g.restaurant_id=d.restaurant_id and g.ip=p.ip and g.port=p.port and x.state in('leased','dispatching','uncertain')) then continue; end if;
  if exists(select 1 from public.kitchen_print_jobs where restaurant_id=d.restaurant_id and printer_id=p.id and state in('leased','dispatching','uncertain')) then continue; end if;
  select * into j from public.kitchen_print_jobs j where j.restaurant_id=d.restaurant_id and j.printer_id=p.id and j.state in('queued','retry_wait') and j.next_attempt_at<=clock_timestamp() and j.attempt_count<5 and (j.kind<>'automatic' or exists(select 1 from public.kitchen_print_controls c where c.restaurant_id=d.restaurant_id and c.enabled and c.protocol_version=2) and p.auto_print) order by j.created_at,j.id limit 1 for no key update skip locked;
  if j.id is null then continue; end if;
  update public.kitchen_print_jobs set state='leased',claim_token=gen_random_uuid(),device_id=d.id,lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1,claim_ip=p.ip,claim_port=p.port,claim_config_revision=p.config_revision,updated_at=clock_timestamp() where id=j.id returning * into j;
  update public.kitchen_print_endpoint_guards set active_job_id=j.id where restaurant_id=d.restaurant_id and ip=p.ip and port=p.port;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(d.restaurant_id,'job_leased',j.id,auth.uid(),jsonb_build_object('deviceId',d.id,'attemptCount',j.attempt_count));
  return jsonb_build_object('jobId',j.id,'claimToken',j.claim_token,'leaseExpiresAt',j.lease_expires_at,'configRevision',j.claim_config_revision,'snapshotVersion',j.snapshot_version);
 end loop;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_kitchen_dispatch(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_order public.orders; v_control public.kitchen_print_controls; v_printer public.kitchen_printers; v_snapshot jsonb; v_items jsonb; v_restaurant public.restaurants; v_destination text;
begin
 select * into v_order from public.orders where id=p_order_id;
 select * into v_restaurant from public.restaurants where id=v_order.restaurant_id for no key update;
 select * into v_control from public.kitchen_print_controls where restaurant_id=v_order.restaurant_id;
 if not found or not v_control.enabled or v_control.protocol_version<>2 or v_order.created_at<v_control.activated_at or (v_order.is_test_order and not v_control.allow_test_orders) then return; end if;
 -- Printing errors are isolated from ordering. All output is enqueued, never sent in a transaction.
 begin
 if not exists(select 1 from public.order_items where order_id=p_order_id and restaurant_id=v_order.restaurant_id) then raise exception 'EMPTY_PRINT_SNAPSHOT'; end if;
 for v_destination in select distinct coalesce(r.destination,'Kitchen') from public.order_items i left join public.menu_items m on m.id=i.menu_item_id and m.restaurant_id=i.restaurant_id left join public.kitchen_printer_routes r on r.category_id=m.category_id and r.restaurant_id=i.restaurant_id where i.order_id=p_order_id and i.restaurant_id=v_order.restaurant_id loop
  select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,'quantity',i.quantity,'modifiers',i.options,'notes',i.notes,'categoryId',m.category_id,'destination',coalesce(r.destination,'Kitchen')) order by i.created_at,i.id)
   into v_items from public.order_items i left join public.menu_items m on m.id=i.menu_item_id and m.restaurant_id=i.restaurant_id left join public.kitchen_printer_routes r on r.category_id=m.category_id and r.restaurant_id=i.restaurant_id where i.order_id=p_order_id and i.restaurant_id=v_order.restaurant_id and coalesce(r.destination,'Kitchen')=v_destination;
  if not exists(select 1 from public.kitchen_printers where restaurant_id=v_order.restaurant_id and enabled and auto_print and ip is not null and destination=v_destination) then
   insert into public.kitchen_print_audit(restaurant_id,event,entity_id,details) values(v_order.restaurant_id,'dispatch_attention',p_order_id,jsonb_build_object('code','NO_CONFIGURED_PRINTER','destination',v_destination));
  end if;
  for v_printer in select * from public.kitchen_printers where restaurant_id=v_order.restaurant_id and enabled and auto_print and ip is not null and destination=v_destination order by id loop
   v_snapshot:=jsonb_build_object('version',1,'restaurantName',v_restaurant.name,'timezone',v_restaurant.timezone,'orderNumber',v_order.order_number::text,'tableLabel',(select table_name from public.tables where id=v_order.table_id and restaurant_id=v_order.restaurant_id),'createdAt',v_order.created_at,'destination',v_destination,'items',v_items,'instructions',v_order.note,'copies',v_printer.copies,'autoCut',v_printer.auto_cut,'profile','escpos-80mm-v1','kind','automatic');
   insert into public.kitchen_print_jobs(restaurant_id,order_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision) values(v_order.restaurant_id,p_order_id,v_printer.id,'automatic',v_snapshot,encode(extensions.digest(v_snapshot::text,'sha256'),'hex'),v_destination,v_printer.config_revision) on conflict do nothing;
  end loop;
 end loop;
 exception when others then
  -- Keep Kitchen order visibility even if printing setup/snapshot processing fails.
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,details) values(v_order.restaurant_id,'dispatch_attention',p_order_id,jsonb_build_object('code','DISPATCH_BUILD_FAILED','sqlstate',sqlstate));
 end;
end $function$;

CREATE OR REPLACE FUNCTION public.finish_kitchen_print_job(p_order_id uuid, p_claim_token uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$declare v_id uuid; begin
 select restaurant_id into v_id from public.orders where id=p_order_id;
 perform 1 from public.restaurants where id=v_id for no key update;
 perform public.kitchen_require_role(v_id);
 if exists(select 1 from public.kitchen_print_controls where restaurant_id=v_id and protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED'; end if;
 return public.kitchen_legacy_finish_v1(p_order_id,p_claim_token,p_success,p_error);
end $function$;

CREATE OR REPLACE FUNCTION public.kitchen_auth_device(p_device_id uuid, p_device_secret text)
 RETURNS kitchen_print_devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare d public.kitchen_print_devices;
begin
 select * into d from public.kitchen_print_devices where id=p_device_id;
 perform public.kitchen_require_role(d.restaurant_id);
 select * into d from public.kitchen_print_devices where id=p_device_id for no key update;
 if d.id is null or d.state<>'active' or d.operator_id<>auth.uid() or coalesce(p_device_secret,'')!~'^[a-f0-9]{64}$' or d.secret_hash<>encode(extensions.digest(p_device_secret,'sha256'),'hex') then raise exception 'PRINT_DEVICE_DENIED' using errcode='42501'; end if;
 return d;
end $function$;

CREATE OR REPLACE FUNCTION public.kitchen_reconcile_jobs(p_restaurant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare j public.kitchen_print_jobs; a public.kitchen_print_attempts;
begin
 for j in select * from public.kitchen_print_jobs where restaurant_id=p_restaurant_id and state in('leased','dispatching') and lease_expires_at<=clock_timestamp() order by lease_expires_at,id limit 100 for no key update skip locked loop
  if j.state='dispatching' then
   select * into a from public.kitchen_print_attempts where restaurant_id=p_restaurant_id and job_id=j.id and claim_token=j.claim_token and event='dispatching' order by id desc limit 1;
   if a.id is not null then insert into public.kitchen_print_attempts(restaurant_id,job_id,printer_id,device_id,attempt_id,claim_token,event,error_code,config_revision,actor_id) values(j.restaurant_id,j.id,j.printer_id,j.device_id,a.attempt_id,j.claim_token,'uncertain','ACK_TIMEOUT',a.config_revision,a.actor_id) on conflict do nothing; end if;
   update public.kitchen_print_jobs set state='uncertain',updated_at=clock_timestamp() where id=j.id;
  else
   update public.kitchen_print_jobs set state=case when attempt_count>=5 then 'failed' else 'retry_wait' end,next_attempt_at=clock_timestamp()+make_interval(secs=>public.kitchen_retry_seconds(attempt_count)),updated_at=clock_timestamp() where id=j.id;
  end if;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,details) values(j.restaurant_id,case when j.state='dispatching' then 'delivery_uncertain' else 'lease_expired' end,j.id,jsonb_build_object('code',case when j.state='dispatching' then 'ACK_TIMEOUT' else 'LEASE_EXPIRED' end));
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.kitchen_resolve_internal(p_job_id uuid, p_resolution text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare j public.kitchen_print_jobs; v_uid uuid;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id; v_uid:=public.kitchen_require_role(j.restaurant_id);
 if p_resolution not in('paper_observed_agent_stopped','no_paper_agent_stopped') or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'CONFIRM_STOPPED_AGENT_AND_REASON'; end if;
 perform 1 from public.kitchen_printers where id=j.printer_id for no key update;
 select * into j from public.kitchen_print_jobs where id=p_job_id for no key update;
 if j.state='resolved' then return true; end if;
 if j.state<>'uncertain' then raise exception 'PRINT_NOT_UNCERTAIN'; end if;
 update public.kitchen_print_jobs set state='resolved',updated_at=clock_timestamp() where id=j.id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(j.restaurant_id,'uncertainty_resolved',j.id,v_uid,jsonb_build_object('resolution',p_resolution,'reason',trim(p_reason),'oldAgentStoppedConfirmed',true)); return true;
end $function$;

CREATE OR REPLACE FUNCTION public.save_kitchen_printer(p_restaurant_id uuid, p_printer_id uuid, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_uid uuid; v_row public.kitchen_printers; v_route jsonb; v_routes boolean:=p_config?'routes';
begin
 v_uid:=public.kitchen_require_role(p_restaurant_id,true);
 if p_config is null or jsonb_typeof(p_config)<>'object' or length(p_config::text)>32768 then raise exception 'INVALID_CONFIG'; end if;
 perform 1 from public.restaurants where id=p_restaurant_id for no key update;
 if p_printer_id is null then
  insert into public.kitchen_printers(restaurant_id,name,ip,port,enabled,auto_print,auto_cut,copies,destination,updated_by)
  values(p_restaurant_id,p_config->>'name',nullif(p_config->>'ip',''),coalesce((p_config->>'port')::integer,9100),coalesce((p_config->>'enabled')::boolean,true),coalesce((p_config->>'autoPrint')::boolean,false),coalesce((p_config->>'autoCut')::boolean,false),coalesce((p_config->>'copies')::integer,1),coalesce(p_config->>'destination','Kitchen'),v_uid) returning * into v_row;
 else
  select * into v_row from public.kitchen_printers where restaurant_id=p_restaurant_id and id=p_printer_id for no key update;
  if not found then raise exception 'PRINTER_NOT_FOUND'; end if;
  if (p_config->>'configRevision')::bigint is distinct from v_row.config_revision then raise exception 'PRINT_CONFIG_CONFLICT'; end if;
  update public.kitchen_printers set name=coalesce(p_config->>'name',name),ip=case when p_config?'ip' then nullif(p_config->>'ip','') else ip end,
   port=coalesce((p_config->>'port')::integer,port),enabled=coalesce((p_config->>'enabled')::boolean,enabled),auto_print=coalesce((p_config->>'autoPrint')::boolean,auto_print),
   auto_cut=coalesce((p_config->>'autoCut')::boolean,auto_cut),copies=coalesce((p_config->>'copies')::integer,copies),destination=coalesce(p_config->>'destination',destination),
   config_revision=config_revision+1,updated_at=clock_timestamp(),updated_by=v_uid where id=p_printer_id returning * into v_row;
 end if;
 if v_routes then
  if jsonb_typeof(p_config->'routes')<>'array' or jsonb_array_length(p_config->'routes')>500 then raise exception 'INVALID_ROUTES'; end if;
  for v_route in select value from jsonb_array_elements(p_config->'routes') loop
   insert into public.kitchen_printer_routes(restaurant_id,category_id,destination) values(p_restaurant_id,(v_route->>'categoryId')::uuid,v_route->>'destination')
   on conflict(restaurant_id,category_id) do update set destination=excluded.destination;
  end loop;
 end if;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(p_restaurant_id,'printer_saved',v_row.id,v_uid,jsonb_build_object('configRevision',v_row.config_revision));
 return to_jsonb(v_row);
end $function$;

CREATE OR REPLACE FUNCTION public.set_kitchen_print_control(p_restaurant_id uuid, p_enabled boolean, p_allow_test_orders boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare v_uid uuid; v_row public.kitchen_print_controls;
begin
 v_uid:=public.kitchen_require_role(p_restaurant_id,true);
 perform 1 from public.restaurants where id=p_restaurant_id for no key update;
 if p_enabled and exists(select 1 from public.orders where restaurant_id=p_restaurant_id and kitchen_print_claimed_at>clock_timestamp()-interval '2 minutes') then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE'; end if;
 insert into public.kitchen_print_controls(restaurant_id,enabled,allow_test_orders,protocol_version,activated_at) values(p_restaurant_id,p_enabled,p_allow_test_orders,case when p_enabled then 2 else 1 end,case when p_enabled then clock_timestamp() end)
 on conflict(restaurant_id) do update set enabled=excluded.enabled,allow_test_orders=excluded.allow_test_orders,protocol_version=greatest(kitchen_print_controls.protocol_version,excluded.protocol_version),activated_at=case when excluded.enabled and not kitchen_print_controls.enabled then clock_timestamp() else kitchen_print_controls.activated_at end,updated_at=clock_timestamp() returning * into v_row;
 insert into public.kitchen_print_audit(restaurant_id,event,actor_id,details) values(p_restaurant_id,'control_changed',v_uid,jsonb_build_object('enabled',p_enabled,'allowTestOrders',p_allow_test_orders)); return to_jsonb(v_row);
end $function$;

create or replace function public.kitchen_list_printers_base(p_restaurant_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public.kitchen_require_role(p_restaurant_id);
 return jsonb_build_object(
 'printers',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from (select * from public.kitchen_printers where restaurant_id=p_restaurant_id order by created_at,id limit 100) p),'[]'::jsonb),
 'control',coalesce((select to_jsonb(c) from public.kitchen_print_controls c where restaurant_id=p_restaurant_id),'{}'::jsonb),
 'routes',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from public.kitchen_printer_routes where restaurant_id=p_restaurant_id order by category_id limit 500) r),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'operatorId',d.operator_id,'name',d.device_name,'state',d.state,'lastHeartbeat',d.last_heartbeat,'observations',d.observations,'printers',(select coalesce(jsonb_agg(a.printer_id),'[]'::jsonb) from public.kitchen_print_device_printers a where a.restaurant_id=p_restaurant_id and a.device_id=d.id))) from (select * from public.kitchen_print_devices where restaurant_id=p_restaurant_id and state='active' order by created_at desc,id desc limit 100) d),'[]'::jsonb),
 'pairings',case when public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then coalesce((select jsonb_agg(jsonb_build_object('pairingId',q.id,'deviceName',q.device_name,'operatorId',q.operator_id,'state',q.state,'expiresAt',q.expires_at)) from (select * from public.kitchen_print_pairings where restaurant_id=p_restaurant_id and expires_at>clock_timestamp() and state in('pending','approved') order by created_at desc,id desc limit 100) q),'[]'::jsonb) else '[]'::jsonb end);
end$$;
create index kitchen_jobs_printer_claim on public.kitchen_print_jobs(restaurant_id,printer_id,created_at,id) include(next_attempt_at,attempt_count,kind) where state in('queued','retry_wait');
create index kitchen_device_active_list on public.kitchen_print_devices(restaurant_id,created_at desc,id desc) where state='active';
create index kitchen_audit_alerts on public.kitchen_print_audit(restaurant_id,created_at desc,id desc) where event in('dispatch_attention','delivery_uncertain','delivery_not_sent');
commit;
notify pgrst,'reload schema';

