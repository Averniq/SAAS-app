begin;
create index kitchen_job_attention on public.kitchen_print_jobs(restaurant_id,printer_id,state,lease_expires_at) where state in('uncertain','failed','dispatching');
create index kitchen_device_tenant on public.kitchen_print_devices(restaurant_id,last_seen_at desc);
create index kitchen_pending_tenant on public.kitchen_print_pairings(restaurant_id,expires_at) where state='pending';
create or replace function public.list_kitchen_print_history(p_restaurant_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.kp_require_role(p_restaurant_id);
 if p_limit is null or p_limit not between 1 and 100 or (p_before is null)<>(p_before_id is null) then raise exception 'INVALID_HISTORY_CURSOR';end if;
 return coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at desc,j.id desc) from
 (select id,printer_id,order_id,kind,state,created_at,error_code,attempt_count,parent_job_id,snapshot->>'orderNumber' as order_number
 from public.kitchen_print_jobs where restaurant_id=p_restaurant_id and (p_before is null or (created_at,id)<(p_before,p_before_id))
 order by created_at desc,id desc limit p_limit) j),'[]'::jsonb);
end $$;
create or replace function public.list_kitchen_printers(p_restaurant_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.kp_require_role(p_restaurant_id);
 return jsonb_build_object(
 'printers',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('attention',exists(select 1 from public.kitchen_print_jobs j where j.restaurant_id=p_restaurant_id and j.printer_id=p.id and (j.state in('uncertain','failed') or (j.state='dispatching' and j.lease_expires_at<now()))),
 'printing',exists(select 1 from public.kitchen_print_jobs j where j.restaurant_id=p_restaurant_id and j.printer_id=p.id and j.state='dispatching' and j.lease_expires_at>=now()))) from public.kitchen_printers p where p.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'control',coalesce((select to_jsonb(c) from public.kitchen_print_controls c where restaurant_id=p_restaurant_id),'{"enabled":false,"allow_test_orders":false,"protocol_version":1}'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'destination',coalesce(cr.destination,'Kitchen'))) from public.categories c left join public.kitchen_print_category_routes cr on cr.category_id=c.id and cr.restaurant_id=c.restaurant_id where c.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'operator_id',d.operator_id,'revoked_at',d.revoked_at,'last_seen_at',d.last_seen_at,'observations',d.observations,'printer_ids',(select jsonb_agg(a.printer_id) from public.kitchen_print_device_printers a where a.device_id=d.id))) from public.kitchen_print_devices d where d.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'pairings',case when public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'operator_id',operator_id,'expires_at',expires_at)) from public.kitchen_print_pairings where restaurant_id=p_restaurant_id and state='pending' and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create or replace function public.kp_device(p_device_id uuid,p_device_secret text)
returns public.kitchen_print_devices language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;
begin
 select * into d from public.kitchen_print_devices where id=p_device_id and operator_id=auth.uid() and revoked_at is null for update;
 perform public.kp_require_role(d.restaurant_id);
 if d.id is null or length(coalesce(p_device_secret,''))<>64 or d.secret_hash<>encode(extensions.digest(p_device_secret,'sha256'),'hex') then raise exception 'DEVICE_ACCESS_DENIED' using errcode='42501';end if;
 return d;
end $$;
create or replace function public.kp_manual_job(p_printer_id uuid,p_kind text,p_key uuid,p_snapshot jsonb,p_order_id uuid,p_parent uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;v uuid;r uuid;
begin
 select restaurant_id into r from public.kitchen_printers where id=p_printer_id; perform public.kp_require_role(r); perform pg_advisory_xact_lock(hashtextextended(r::text,27)); insert into public.kitchen_print_controls(restaurant_id,protocol_version) values(r,2) on conflict(restaurant_id) do update set protocol_version=2; select * into p from public.kitchen_printers where id=p_printer_id for update;
 perform public.kp_require_role(p.restaurant_id); perform pg_advisory_xact_lock(hashtextextended(p.restaurant_id::text,27));
 if not p.enabled or p.ip is null then raise exception 'PRINTER_NOT_CONFIGURED';end if;
 if p_key is null then raise exception 'REQUEST_KEY_REQUIRED';end if;
 if exists(select 1 from public.orders where restaurant_id=p.restaurant_id and kitchen_print_claimed_at>now()-interval '2 minutes' and kitchen_printed_at is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;

 insert into public.kitchen_print_jobs(restaurant_id,printer_id,order_id,kind,dispatch_key,snapshot,parent_job_id,requested_by,reason)
 values(p.restaurant_id,p.id,p_order_id,p_kind,p_kind||':'||auth.uid()||':'||p_key,p_snapshot,p_parent,auth.uid(),left(p_reason,500))
 on conflict(restaurant_id,printer_id,dispatch_key) do nothing returning id into v;
 if v is null then select id into v from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and printer_id=p.id and dispatch_key=p_kind||':'||auth.uid()||':'||p_key;
 else perform public.kp_audit(p.restaurant_id,p_kind||'_requested',jsonb_build_object('reason',left(p_reason,500)),v,p.id);end if;
 return v;
end $$;
commit; notify pgrst,'reload schema';
