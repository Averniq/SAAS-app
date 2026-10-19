-- Operational status must not lose an old quarantine when history advances.
begin;
create index kitchen_jobs_printer_history on public.kitchen_print_jobs(restaurant_id,printer_id,created_at desc,id desc);
create index kitchen_jobs_printer_attention on public.kitchen_print_jobs(restaurant_id,printer_id,created_at,id) where state in('leased','dispatching','uncertain','retry_wait');
alter function public.list_kitchen_printers(uuid) rename to kitchen_list_printers_recent_history;
revoke all on function public.kitchen_list_printers_recent_history(uuid) from public,anon,authenticated,service_role;
create function public.list_kitchen_printers(p_restaurant_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare payload jsonb;
begin
 payload:=public.kitchen_list_printers_recent_history(p_restaurant_id);
 -- A removed operator cannot make an old, still-fresh heartbeat appear authorized.
 payload:=jsonb_set(payload,'{devices}',coalesce((select jsonb_agg(d) from jsonb_array_elements(payload->'devices') d where exists(select 1 from public.restaurant_staff st where st.restaurant_id=p_restaurant_id and st.user_id=(d->>'operatorId')::uuid and st.role in('owner','manager','staff','kitchen'))),'[]'::jsonb));
 return payload||jsonb_build_object('printerStates',coalesce((
  select jsonb_agg(jsonb_build_object('printerId',p.id,'activeJob',active.value,'lastJob',recent.value,'unresolvedAttempt',quarantine.value))
  from public.kitchen_printers p
  left join lateral(select jsonb_build_object('id',j.id,'state',j.state,'created_at',j.created_at,'order_number',j.snapshot->>'orderNumber') as value from public.kitchen_print_jobs j where j.restaurant_id=p_restaurant_id and j.printer_id=p.id and j.state in('leased','dispatching','uncertain','retry_wait') order by case j.state when 'uncertain' then 0 when 'dispatching' then 1 when 'leased' then 2 else 3 end,j.created_at,j.id limit 1) active on true
  left join lateral(select jsonb_build_object('id',j.id,'state',j.state,'created_at',j.created_at,'order_number',j.snapshot->>'orderNumber') as value from public.kitchen_print_jobs j where j.restaurant_id=p_restaurant_id and j.printer_id=p.id order by j.created_at desc,j.id desc limit 1) recent on true
  left join lateral(select jsonb_build_object('id',j.id,'state',j.state) as value from public.kitchen_print_endpoint_guards g join public.kitchen_print_jobs j on j.restaurant_id=g.restaurant_id and j.id=g.active_job_id where g.restaurant_id=p_restaurant_id and g.ip=p.ip and g.port=p.port and j.state='uncertain' limit 1) quarantine on true
  where p.restaurant_id=p_restaurant_id and p.id in(select (v->>'id')::uuid from jsonb_array_elements(payload->'printers') v)
 ),'[]'::jsonb),'truncated',jsonb_build_object('printers',exists(select 1 from public.kitchen_printers where restaurant_id=p_restaurant_id offset 100 limit 1),'devices',exists(select 1 from public.kitchen_print_devices where restaurant_id=p_restaurant_id and state='active' offset 100 limit 1),'routes',exists(select 1 from public.kitchen_printer_routes where restaurant_id=p_restaurant_id offset 500 limit 1)));
end $$;
revoke all on function public.list_kitchen_printers(uuid) from public,anon,service_role;
grant execute on function public.list_kitchen_printers(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
