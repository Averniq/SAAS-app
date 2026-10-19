-- Preserve the confirmed disable boundary and actor/reason audit.
begin;
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
  if v_row.enabled and p_config?'enabled' and (p_config->>'enabled')::boolean is false then raise exception 'USE_CONFIRMED_PRINTER_DISABLE'; end if;
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
commit;
