begin;
create table public.kitchen_print_jobs(
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id),
 order_id uuid,printer_id uuid not null,kind text not null check(kind in('automatic','test','reprint')),
 dispatch_key text not null,snapshot jsonb not null,created_at timestamptz not null default clock_timestamp(),
 state text not null default 'queued' check(state in('queued','leased','dispatching','retry_wait','failed','transmitted','uncertain','resolved')),
 claim_token uuid,device_id uuid,lease_expires_at timestamptz,attempt_id uuid,attempt_count int not null default 0,
 next_attempt_at timestamptz not null default now(),config_revision bigint,last_outcome text,error_code text,
 parent_job_id uuid,requested_by uuid,reason text,
 unique(restaurant_id,id),unique(restaurant_id,printer_id,dispatch_key),
 foreign key(restaurant_id,printer_id) references public.kitchen_printers(restaurant_id,id),
 foreign key(restaurant_id,order_id) references public.orders(restaurant_id,id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id),
 foreign key(restaurant_id,parent_job_id) references public.kitchen_print_jobs(restaurant_id,id)
);
create unique index kitchen_one_active_printer on public.kitchen_print_jobs(printer_id) where state in('leased','dispatching','uncertain');
create index kitchen_queue_ready on public.kitchen_print_jobs(restaurant_id,printer_id,next_attempt_at,created_at) where state in('queued','retry_wait');
create index kitchen_jobs_history on public.kitchen_print_jobs(restaurant_id,created_at desc,id desc);
create table public.kitchen_print_attempts(
 id bigint generated always as identity primary key,restaurant_id uuid not null,job_id uuid not null,
 attempt_id uuid,event text not null,device_id uuid,actor_id uuid,detail jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 foreign key(restaurant_id,job_id) references public.kitchen_print_jobs(restaurant_id,id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id)
);
create function public.kp_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' or tg_table_name in('kitchen_print_attempts','kitchen_print_audit') then raise exception 'PRINT_HISTORY_IMMUTABLE';end if;
 if (to_jsonb(new)-array['state','claim_token','device_id','lease_expires_at','attempt_id','attempt_count','next_attempt_at','config_revision','last_outcome','error_code'])
 is distinct from (to_jsonb(old)-array['state','claim_token','device_id','lease_expires_at','attempt_id','attempt_count','next_attempt_at','config_revision','last_outcome','error_code']) then raise exception 'PRINT_SNAPSHOT_IMMUTABLE';end if;
 return new;
end $$;
create trigger kitchen_jobs_immutable before update or delete on public.kitchen_print_jobs for each row execute function public.kp_immutable();
create trigger kitchen_attempts_immutable before update or delete on public.kitchen_print_attempts for each row execute function public.kp_immutable();
create trigger kitchen_audit_immutable before update or delete on public.kitchen_print_audit for each row execute function public.kp_immutable();

create function public.kp_snapshot(p_order_id uuid,p_printer_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('version',1,'restaurantName',r.name,'timezone',r.timezone,'orderNumber',o.order_number,
 'tableName',t.table_name,'createdAt',o.created_at,'destination',p.destination,'copies',p.copies,'autoCut',p.auto_cut,
 'instructions',o.note,'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,
 'quantity',i.quantity,'modifiers',i.options,'notes',i.notes) order by i.created_at,i.id)
 from public.order_items i left join public.menu_items m on m.id=i.menu_item_id and m.restaurant_id=i.restaurant_id
 left join public.kitchen_print_category_routes cr on cr.restaurant_id=i.restaurant_id and cr.category_id=m.category_id
 where i.order_id=o.id and i.restaurant_id=o.restaurant_id and coalesce(cr.destination,'Kitchen')=p.destination),'[]'::jsonb))
 from public.orders o join public.restaurants r on r.id=o.restaurant_id
 join public.tables t on t.id=o.table_id and t.restaurant_id=o.restaurant_id
 join public.kitchen_printers p on p.id=p_printer_id and p.restaurant_id=o.restaurant_id where o.id=p_order_id
$$;
create function public.kp_enqueue(p_order_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; c public.kitchen_print_controls; p public.kitchen_printers; s jsonb; matches int:=0;
begin
 select * into o from public.orders where id=p_order_id;
 select * into c from public.kitchen_print_controls where restaurant_id=o.restaurant_id for share;
 if not coalesce(c.enabled,false) or c.protocol_version<>2 or o.status<>'new' or (o.is_test_order and not c.allow_test_orders) then return;end if;
 for p in select * from public.kitchen_printers where restaurant_id=o.restaurant_id and enabled and auto_print and ip is not null loop
 s:=public.kp_snapshot(o.id,p.id);
 if jsonb_array_length(s->'items')>0 then
 insert into public.kitchen_print_jobs(restaurant_id,order_id,printer_id,kind,dispatch_key,snapshot)
 values(o.restaurant_id,o.id,p.id,'automatic','order:'||o.id||':v1',s) on conflict do nothing;matches:=matches+1;
 end if;
 end loop;
 if matches=0 then perform public.kp_audit(o.restaurant_id,'routing_attention',jsonb_build_object('orderId',o.id,'code','NO_CONFIGURED_DESTINATION'));end if;
end $$;
create function public.kp_after_order() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.kp_enqueue(new.id);return null;end $$;
create constraint trigger kitchen_enqueue_after_submission after insert on public.orders deferrable initially deferred for each row execute function public.kp_after_order();

-- Retain legacy signatures, but permanently fence restaurants after first v2 activation.
alter function public.claim_kitchen_print_job(text) rename to kp_legacy_claim;
alter function public.finish_kitchen_print_job(uuid,uuid,boolean,text) rename to kp_legacy_finish;
create function public.claim_kitchen_print_job(p_restaurant_slug text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.kitchen_print_controls c join public.restaurants r on r.id=c.restaurant_id where r.slug=p_restaurant_slug and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 return public.kp_legacy_claim(p_restaurant_slug);
end $$;
create function public.finish_kitchen_print_job(p_order_id uuid,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.kitchen_print_controls c join public.orders o on o.restaurant_id=c.restaurant_id where o.id=p_order_id and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 return public.kp_legacy_finish(p_order_id,p_claim_token,p_success,p_error);
end $$;
create function public.set_kitchen_print_control(p_restaurant_id uuid,p_enabled boolean,p_allow_test_orders boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.kitchen_print_controls;
begin
 perform public.kp_require_role(p_restaurant_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,27));
 if exists(select 1 from public.orders where restaurant_id=p_restaurant_id and kitchen_print_claimed_at>now()-interval '2 minutes' and kitchen_printed_at is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;
 insert into public.kitchen_print_controls(restaurant_id,enabled,allow_test_orders,protocol_version,activated_at)
 values(p_restaurant_id,p_enabled,p_allow_test_orders,2,clock_timestamp())
 on conflict(restaurant_id) do update set enabled=excluded.enabled,allow_test_orders=excluded.allow_test_orders,
 protocol_version=2,activated_at=coalesce(kitchen_print_controls.activated_at,excluded.activated_at) returning * into c;
 perform public.kp_audit(p_restaurant_id,'printing_control_changed',jsonb_build_object('enabled',p_enabled,'allowTestOrders',p_allow_test_orders));return to_jsonb(c);
end $$;
create function public.list_kitchen_printers(p_restaurant_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.kp_require_role(p_restaurant_id);
 return jsonb_build_object(
 'printers',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('attention',exists(select 1 from public.kitchen_print_jobs j where j.printer_id=p.id and (j.state in('uncertain','failed') or (j.state='dispatching' and j.lease_expires_at<now()))),
 'printing',exists(select 1 from public.kitchen_print_jobs j where j.printer_id=p.id and j.state='dispatching' and j.lease_expires_at>=now()))) from public.kitchen_printers p where p.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'control',coalesce((select to_jsonb(c) from public.kitchen_print_controls c where restaurant_id=p_restaurant_id),'{"enabled":false,"allow_test_orders":false,"protocol_version":1}'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'destination',coalesce(cr.destination,'Kitchen'))) from public.categories c left join public.kitchen_print_category_routes cr on cr.category_id=c.id and cr.restaurant_id=c.restaurant_id where c.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'operator_id',d.operator_id,'revoked_at',d.revoked_at,'last_seen_at',d.last_seen_at,'observations',d.observations,'printer_ids',(select jsonb_agg(a.printer_id) from public.kitchen_print_device_printers a where a.device_id=d.id))) from public.kitchen_print_devices d where d.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'pairings',case when public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'operator_id',operator_id,'expires_at',expires_at)) from public.kitchen_print_pairings where restaurant_id=p_restaurant_id and state='pending' and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create function public.list_kitchen_print_history(p_restaurant_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.kp_require_role(p_restaurant_id);
 if p_limit not between 1 and 100 or (p_before is null)<>(p_before_id is null) then raise exception 'INVALID_HISTORY_CURSOR';end if;
 return coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at desc,j.id desc) from
 (select id,printer_id,order_id,kind,state,created_at,error_code,attempt_count,parent_job_id,snapshot->>'orderNumber' as order_number
 from public.kitchen_print_jobs where restaurant_id=p_restaurant_id and (p_before is null or (created_at,id)<(p_before,p_before_id))
 order by created_at desc,id desc limit p_limit) j),'[]'::jsonb);
end $$;
do $$ declare t text;f record;begin
 foreach t in array array['kitchen_print_jobs','kitchen_print_attempts'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'kp_%' or proname in('set_kitchen_print_control','list_kitchen_printers','list_kitchen_print_history','claim_kitchen_print_job','finish_kitchen_print_job')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.proname not like 'kp_%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;
commit;
notify pgrst,'reload schema';


