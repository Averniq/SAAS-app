begin;
create function public.request_legacy_kitchen_reprint(p_order_id uuid,p_printer_id uuid,p_reason text,p_request_key uuid,p_duplicate_paper_confirmed boolean default false) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare o public.orders; p public.kitchen_printers; r public.restaurants; v_uid uuid; v_id uuid; s jsonb; items jsonb;
begin
 select * into o from public.orders where id=p_order_id; v_uid:=public.kitchen_require_role(o.restaurant_id);
 if p_duplicate_paper_confirmed is distinct from true or length(trim(coalesce(p_reason,''))) not between 3 and 500 or p_request_key is null then raise exception 'REPRINT_CONFIRMATION_REQUIRED'; end if;
 select id into v_id from public.kitchen_print_jobs where restaurant_id=o.restaurant_id and request_actor=v_uid and request_key=p_request_key;
 if found then return v_id; end if;
 if exists(select 1 from public.kitchen_print_jobs where restaurant_id=o.restaurant_id and order_id=o.id and kind='automatic') or exists(select 1 from public.kitchen_print_controls where restaurant_id=o.restaurant_id and activated_at<=o.created_at and protocol_version=2) then raise exception 'USE_ORIGINAL_JOB_REPRINT'; end if;
 select * into p from public.kitchen_printers where id=p_printer_id and restaurant_id=o.restaurant_id and enabled and ip is not null for share;
 if not found then raise exception 'PRINTER_NOT_CONFIGURED'; end if;
 select * into r from public.restaurants where id=o.restaurant_id;
 select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,'quantity',i.quantity,'modifiers',i.options,'notes',i.notes,'categoryId',m.category_id,'destination',coalesce(route.destination,'Kitchen')) order by i.created_at,i.id) into items from public.order_items i left join public.menu_items m on m.id=i.menu_item_id and m.restaurant_id=i.restaurant_id left join public.kitchen_printer_routes route on route.restaurant_id=i.restaurant_id and route.category_id=m.category_id where i.order_id=o.id and i.restaurant_id=o.restaurant_id and coalesce(route.destination,'Kitchen')=p.destination;
 if items is null then raise exception 'EMPTY_PRINT_SNAPSHOT'; end if;
 s:=jsonb_build_object('version',1,'restaurantName',r.name,'timezone',r.timezone,'orderNumber',o.order_number::text,'tableLabel',(select table_name from public.tables where id=o.table_id and restaurant_id=o.restaurant_id),'createdAt',o.created_at,'destination',p.destination,'items',items,'instructions',o.note,'copies',p.copies,'autoCut',p.auto_cut,'profile','escpos-80mm-v1','kind','reprint','sourceProtocol','legacy_v1');
 insert into public.kitchen_print_jobs(restaurant_id,order_id,printer_id,kind,snapshot,snapshot_hash,destination,config_revision,request_actor,request_key,reason) values(o.restaurant_id,o.id,p.id,'reprint',s,encode(extensions.digest(s::text,'sha256'),'hex'),p.destination,p.config_revision,v_uid,p_request_key,p_reason) on conflict(restaurant_id,request_actor,request_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.kitchen_print_jobs where restaurant_id=o.restaurant_id and request_actor=v_uid and request_key=p_request_key;
 else insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(o.restaurant_id,'legacy_reprint_requested',v_id,v_uid,jsonb_build_object('sourceOrderId',o.id,'reason',p_reason,'duplicatePaperConfirmed',true)); end if;
 return v_id;
end $$;
revoke all on function public.request_legacy_kitchen_reprint(uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.request_legacy_kitchen_reprint(uuid,uuid,text,uuid,boolean) to authenticated;
create or replace function public.kitchen_heartbeat_internal(p_device_id uuid,p_device_secret text,p_observations jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d public.kitchen_print_devices; o jsonb; v_observations jsonb:='{}'::jsonb;
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

commit;
notify pgrst,'reload schema';
