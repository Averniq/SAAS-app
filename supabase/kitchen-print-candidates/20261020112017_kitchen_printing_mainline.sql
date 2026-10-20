-- Mainline integration of PR18 at1182d3f. New forward-only candidate; not a historical migration edit.
-- Apply AFTER all24 pinned main migrations; no order/payment/Kitchen function replaced.
begin;

-- Reviewed source 20261020062224_kitchen_printers_and_devices.sql

create table public.kitchen_print_controls (
 restaurant_id uuid primary key references public.restaurants(id),
 enabled boolean not null default false, allow_test_orders boolean not null default false,
 protocol_version integer not null default 1 check(protocol_version in(1,2)), activated_at timestamptz
);
create table public.kitchen_printers (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 name text not null check(length(trim(name)) between 1 and 80),
 ip text, port integer not null default 9100 check(port between 1024 and 65535),
 protocol text not null default 'escpos_lan' check(protocol='escpos_lan'),
 enabled boolean not null default true, auto_print boolean not null default false,
 auto_cut boolean not null default true, copies integer not null default 1 check(copies between 1 and 3),
 destination text not null default 'Kitchen' check(destination in('Kitchen','Bar','Dessert')),
 revision bigint not null default 1, updated_at timestamptz not null default now(), updated_by uuid,
 unique(restaurant_id,id)
);
create unique index kitchen_printers_endpoint on public.kitchen_printers(restaurant_id,ip,port) where enabled and ip is not null;
create table public.kitchen_print_category_routes (
 restaurant_id uuid not null references public.restaurants(id), category_id uuid not null references public.categories(id),
 destination text not null check(destination in('Kitchen','Bar','Dessert')), primary key(restaurant_id,category_id)
);
create table public.kitchen_print_pairings (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 operator_id uuid not null, name text not null, secret_hash text not null check(secret_hash ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in('pending','approved','consumed','expired')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 approved_by uuid, printer_ids uuid[], failures integer not null default 0
);
create index kitchen_pairings_rate on public.kitchen_print_pairings(operator_id,created_at);
create table public.kitchen_print_devices (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 operator_id uuid not null, name text not null, secret_hash text not null, revoked_at timestamptz,
 last_seen_at timestamptz, observations jsonb not null default '{}'::jsonb, unique(restaurant_id,id)
);
create table public.kitchen_print_device_printers (
 restaurant_id uuid not null, device_id uuid not null, printer_id uuid not null,
 primary key(device_id,printer_id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id),
 foreign key(restaurant_id,printer_id) references public.kitchen_printers(restaurant_id,id)
);
create table public.kitchen_print_audit (
 id bigint generated always as identity primary key, restaurant_id uuid not null references public.restaurants(id),
 job_id uuid, printer_id uuid, device_id uuid, actor_id uuid, event text not null,
 detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default clock_timestamp()
);
create index kitchen_print_audit_history on public.kitchen_print_audit(restaurant_id,created_at desc,id desc);

create function public.kp_require_role(p_restaurant_id uuid,p_manager boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_restaurant_role(p_restaurant_id,
 case when p_manager then array['owner','manager'] else array['owner','manager','staff','kitchen'] end) then
 raise exception 'KITCHEN_PRINT_ACCESS_DENIED' using errcode='42501';end if;
end $$;
create function public.kp_audit(p_restaurant_id uuid,p_event text,p_detail jsonb default '{}'::jsonb,p_job_id uuid default null,p_printer_id uuid default null,p_device_id uuid default null)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.kitchen_print_audit(restaurant_id,actor_id,event,detail,job_id,printer_id,device_id)
 values(p_restaurant_id,auth.uid(),p_event,p_detail,p_job_id,p_printer_id,p_device_id)
$$;
create function public.kp_valid_ip(p_ip text) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare a integer[];
begin
 if p_ip is null then return true;end if;
 if p_ip !~ '^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$' then return false;end if;
 a:=string_to_array(p_ip,'.')::integer[];
 return 255>=all(a) and a[4] between 1 and 254 and (a[1]=10 or (a[1]=172 and a[2] between 16 and 31) or (a[1]=192 and a[2]=168));
end $$;
alter table public.kitchen_printers add constraint kitchen_printer_private_ipv4 check(public.kp_valid_ip(ip));
create function public.save_kitchen_printer(p_restaurant_id uuid,p_printer_id uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.kitchen_printers; route jsonb; cid uuid;
begin
 perform public.kp_require_role(p_restaurant_id,true);
 if jsonb_typeof(p_config)<>'object' then raise exception 'INVALID_PRINTER_CONFIG';end if;
 if p_printer_id is not null then
 select * into v from public.kitchen_printers where id=p_printer_id and restaurant_id=p_restaurant_id for update;
 if v.id is null then raise exception 'PRINTER_NOT_FOUND';end if;
 if p_config ? 'revision' and (p_config->>'revision')::bigint<>v.revision then raise exception 'PRINTER_CONFIG_CHANGED';end if;
 end if;
 insert into public.kitchen_printers(id,restaurant_id,name,ip,port,enabled,auto_print,auto_cut,copies,destination,revision,updated_by)
 values(coalesce(p_printer_id,gen_random_uuid()),p_restaurant_id,trim(p_config->>'name'),nullif(trim(p_config->>'ip'),''),coalesce((p_config->>'port')::int,9100),
 coalesce((p_config->>'enabled')::boolean,true),coalesce((p_config->>'auto_print')::boolean,false),coalesce((p_config->>'auto_cut')::boolean,true),
 coalesce((p_config->>'copies')::int,1),coalesce(p_config->>'destination','Kitchen'),coalesce(v.revision+1,1),auth.uid())
 on conflict(id) do update set name=excluded.name,ip=excluded.ip,port=excluded.port,enabled=excluded.enabled,auto_print=excluded.auto_print,
 auto_cut=excluded.auto_cut,copies=excluded.copies,destination=excluded.destination,revision=excluded.revision,updated_at=now(),updated_by=auth.uid() returning * into v;
 if p_config ? 'categoryRoutes' then
 if jsonb_typeof(p_config->'categoryRoutes')<>'array' or jsonb_array_length(p_config->'categoryRoutes')>500 then raise exception 'INVALID_CATEGORY_ROUTES';end if;
 for route in select value from jsonb_array_elements(p_config->'categoryRoutes') loop
 cid:=(route->>'categoryId')::uuid;
 if not exists(select 1 from public.categories where id=cid and restaurant_id=p_restaurant_id) then raise exception 'CATEGORY_TENANT_MISMATCH';end if;
 insert into public.kitchen_print_category_routes values(p_restaurant_id,cid,route->>'destination')
 on conflict(restaurant_id,category_id) do update set destination=excluded.destination;
 end loop;
 end if;
 perform public.kp_audit(p_restaurant_id,'printer_saved',jsonb_build_object('revision',v.revision),null,v.id);
 return to_jsonb(v);
end $$;
create function public.disable_kitchen_printer(p_printer_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r uuid;
begin
 select restaurant_id into r from public.kitchen_printers where id=p_printer_id for update;
 perform public.kp_require_role(r,true);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
 update public.kitchen_printers set enabled=false,auto_print=false,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_printer_id;
 perform public.kp_audit(r,'printer_disabled',jsonb_build_object('reason',left(p_reason,500)),null,p_printer_id);return true;
end $$;
create function public.begin_kitchen_print_pairing(p_restaurant_id uuid,p_device_name text,p_secret_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.kitchen_print_pairings;
begin
 perform public.kp_require_role(p_restaurant_id);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,19));
 if length(trim(coalesce(p_device_name,''))) not between 1 and 80 then raise exception 'INVALID_DEVICE_NAME';end if;
 if (select count(*) from public.kitchen_print_pairings where operator_id=auth.uid() and created_at>now()-interval '10 minutes')>=5 then raise exception 'PAIRING_RATE_LIMIT';end if;
 insert into public.kitchen_print_pairings(restaurant_id,operator_id,name,secret_hash) values(p_restaurant_id,auth.uid(),trim(p_device_name),p_secret_hash) returning * into v;
 perform public.kp_audit(p_restaurant_id,'pairing_requested',jsonb_build_object('pairingId',v.id));
 return jsonb_build_object('id',v.id,'expiresAt',v.expires_at);
end $$;
create function public.approve_kitchen_print_pairing(p_pairing_id uuid,p_printer_ids uuid[])
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.kitchen_print_pairings;
begin
 select * into v from public.kitchen_print_pairings where id=p_pairing_id for update;
 perform public.kp_require_role(v.restaurant_id,true);
 if v.state<>'pending' or v.expires_at<=now() then raise exception 'PAIRING_NOT_PENDING';end if;
 if coalesce(cardinality(p_printer_ids),0) not between 1 and 20 or exists(select 1 from unnest(p_printer_ids) p where not exists(select 1 from public.kitchen_printers where id=p and restaurant_id=v.restaurant_id and enabled)) then raise exception 'INVALID_PRINTER_ASSIGNMENTS';end if;
 update public.kitchen_print_pairings set state='approved',approved_by=auth.uid(),printer_ids=p_printer_ids where id=v.id;
 perform public.kp_audit(v.restaurant_id,'pairing_approved',jsonb_build_object('pairingId',v.id));return true;
end $$;
create function public.activate_kitchen_print_pairing(p_pairing_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.kitchen_print_pairings; d uuid;
begin
 select * into v from public.kitchen_print_pairings where id=p_pairing_id for update;
 perform public.kp_require_role(v.restaurant_id);
 if v.operator_id<>auth.uid() or v.state<>'approved' or v.expires_at<=now() or v.failures>=5 then raise exception 'PAIRING_NOT_AVAILABLE';end if;
 if length(coalesce(p_secret,''))<>64 or v.secret_hash<>encode(extensions.digest(p_secret,'sha256'),'hex') then
 update public.kitchen_print_pairings set failures=failures+1 where id=v.id;
 return jsonb_build_object('error','PAIRING_PROOF_INVALID');
 end if;
 insert into public.kitchen_print_devices(restaurant_id,operator_id,name,secret_hash) values(v.restaurant_id,auth.uid(),v.name,v.secret_hash) returning id into d;
 insert into public.kitchen_print_device_printers select v.restaurant_id,d,p from unnest(v.printer_ids) p;
 update public.kitchen_print_pairings set state='consumed' where id=v.id;
 perform public.kp_audit(v.restaurant_id,'device_activated','{}',null,null,d);return jsonb_build_object('deviceId',d,'restaurantId',v.restaurant_id);
end $$;
create function public.revoke_kitchen_print_device(p_device_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r uuid;
begin
 select restaurant_id into r from public.kitchen_print_devices where id=p_device_id for update;
 perform public.kp_require_role(r,true);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
 update public.kitchen_print_devices set revoked_at=coalesce(revoked_at,now()) where id=p_device_id;
 perform public.kp_audit(r,'device_revoked',jsonb_build_object('reason',left(p_reason,500)),null,null,p_device_id);return true;
end $$;
create function public.kp_device(p_device_id uuid,p_device_secret text)
returns public.kitchen_print_devices language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;
begin
 select * into d from public.kitchen_print_devices where id=p_device_id and operator_id=auth.uid() and revoked_at is null for share;
 perform public.kp_require_role(d.restaurant_id);
 if d.id is null or length(coalesce(p_device_secret,''))<>64 or d.secret_hash<>encode(extensions.digest(p_device_secret,'sha256'),'hex') then raise exception 'DEVICE_ACCESS_DENIED' using errcode='42501';end if;
 return d;
end $$;
-- No direct client access to identity hashes, audits or configuration mutation.
do $$ declare t text; f record; begin
 foreach t in array array['kitchen_print_controls','kitchen_printers','kitchen_print_category_routes','kitchen_print_pairings','kitchen_print_devices','kitchen_print_device_printers','kitchen_print_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'kp_%' or proname in('save_kitchen_printer','disable_kitchen_printer','begin_kitchen_print_pairing','approve_kitchen_print_pairing','activate_kitchen_print_pairing','revoke_kitchen_print_device')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.proname not like 'kp_%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;




-- Reviewed source 20261020062652_kitchen_print_queue_v2.sql

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
 if not coalesce(c.enabled,false) or c.protocol_version<>2 or o.status<>'new' or (coalesce((to_jsonb(o)->>'is_test_order')::boolean,false) and not c.allow_test_orders) then return;end if;
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
do $compat$ begin if to_regprocedure('public.claim_kitchen_print_job(text)') is not null then alter function public.claim_kitchen_print_job(text) rename to kp_legacy_claim;end if;end $compat$;
do $compat$ begin if to_regprocedure('public.finish_kitchen_print_job(uuid,uuid,boolean,text)') is not null then alter function public.finish_kitchen_print_job(uuid,uuid,boolean,text) rename to kp_legacy_finish;end if;end $compat$;
create function public.claim_kitchen_print_job(p_restaurant_slug text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.kitchen_print_controls c join public.restaurants r on r.id=c.restaurant_id where r.slug=p_restaurant_slug and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 if to_regprocedure('public.kp_legacy_claim(text)') is null then raise exception 'LEGACY_PRINTING_UNAVAILABLE';end if;
 return public.kp_legacy_claim(p_restaurant_slug);
end $$;
create function public.finish_kitchen_print_job(p_order_id uuid,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.kitchen_print_controls c join public.orders o on o.restaurant_id=c.restaurant_id where o.id=p_order_id and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 if to_regprocedure('public.kp_legacy_finish(uuid,uuid,boolean,text)') is null then raise exception 'LEGACY_PRINTING_UNAVAILABLE';end if;
 return public.kp_legacy_finish(p_order_id,p_claim_token,p_success,p_error);
end $$;
create function public.set_kitchen_print_control(p_restaurant_id uuid,p_enabled boolean,p_allow_test_orders boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.kitchen_print_controls;
begin
 perform public.kp_require_role(p_restaurant_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,27));
 if exists(select 1 from public.orders where restaurant_id=p_restaurant_id and (to_jsonb(orders)->>'kitchen_print_claimed_at')::timestamptz>now()-interval '2 minutes' and to_jsonb(orders)->>'kitchen_printed_at' is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;
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






-- Reviewed source 20261020062859_kitchen_print_delivery_protocol.sql

create function public.kp_transition(p_job_id uuid,p_event text,p_detail jsonb default '{}') returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.kitchen_print_attempts(restaurant_id,job_id,attempt_id,event,device_id,actor_id,detail)
 select restaurant_id,id,attempt_id,p_event,device_id,auth.uid(),p_detail from public.kitchen_print_jobs where id=p_job_id
$$;
create function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb default '{}')
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
 return jsonb_build_object('serverTime',clock_timestamp(),'printers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'ip',p.ip,'port',p.port,'revision',p.revision)) from public.kitchen_printers p join public.kitchen_print_device_printers a on a.printer_id=p.id where a.device_id=d.id and p.enabled),'[]'::jsonb));
end $$;
create function public.claim_kitchen_printer_job(p_device_id uuid,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;p public.kitchen_printers;j public.kitchen_print_jobs;c public.kitchen_print_controls;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 update public.kitchen_print_devices set last_seen_at=clock_timestamp() where id=d.id;
 for p in select pr.* from public.kitchen_printers pr join public.kitchen_print_device_printers a on a.printer_id=pr.id and a.restaurant_id=pr.restaurant_id
 where a.device_id=d.id and pr.enabled and pr.ip is not null order by pr.id for update of pr skip locked limit 20 loop
 select * into j from public.kitchen_print_jobs where printer_id=p.id and state in('leased','dispatching','uncertain') for update;
 if j.id is not null then
 if j.state='dispatching' and j.lease_expires_at<clock_timestamp() then
 update public.kitchen_print_jobs set state='uncertain',error_code='DISPATCH_ACK_MISSING' where id=j.id;
 perform public.kp_transition(j.id,'uncertain','{"code":"DISPATCH_ACK_MISSING"}');
 elsif j.state='leased' and j.lease_expires_at<clock_timestamp() then
 update public.kitchen_print_jobs set state=case when attempt_count>=5 then 'failed' else 'retry_wait' end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>case attempt_count when 1 then 5 when 2 then 15 when 3 then 60 else 180 end),
 error_code='LEASE_EXPIRED_BEFORE_DISPATCH',claim_token=null,device_id=null where id=j.id;
 perform public.kp_transition(j.id,'pre_dispatch_lease_expired');
 else continue;
 end if;
 if j.state<>'leased' then continue;end if;
 end if;
 select * into c from public.kitchen_print_controls where restaurant_id=d.restaurant_id;
 select * into j from public.kitchen_print_jobs where printer_id=p.id and restaurant_id=d.restaurant_id and state in('queued','retry_wait')
 and next_attempt_at<=clock_timestamp() and attempt_count<5 and (kind<>'automatic' or (c.enabled and p.auto_print)) order by created_at,id for update skip locked limit 1;
 if j.id is null then continue;end if;
 update public.kitchen_print_jobs set state='leased',claim_token=gen_random_uuid(),device_id=d.id,
 lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1,config_revision=p.revision,attempt_id=null,last_outcome=null,error_code=null
 where id=j.id returning * into j;
 perform public.kp_transition(j.id,'leased');
 return jsonb_build_object('jobId',j.id,'claimToken',j.claim_token,'configRevision',j.config_revision,'printerId',p.id,'ip',p.ip,'port',p.port,'snapshot',j.snapshot);
 end loop;
 return null;
end $$;
create function public.begin_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_config_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or p_claim_token is null or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p.revision<>p_config_revision or j.config_revision<>p_config_revision or not p.enabled or p.ip is null
 or not exists(select 1 from public.kitchen_print_device_printers where device_id=d.id and printer_id=p.id)
 or (j.kind='automatic' and (not p.auto_print or not exists(select 1 from public.kitchen_print_controls where restaurant_id=d.restaurant_id and enabled and protocol_version=2))) then raise exception 'PRINT_CONFIG_OR_AUTH_CHANGED';end if;
 if j.state='dispatching' and j.attempt_id=p_attempt_id then return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);end if;
 if j.state<>'leased' or j.lease_expires_at<=clock_timestamp() then raise exception 'PRINT_LEASE_EXPIRED';end if;
 update public.kitchen_print_jobs set state='dispatching',attempt_id=p_attempt_id,lease_expires_at=clock_timestamp()+interval '30 seconds' where id=j.id;
 perform public.kp_transition(j.id,'dispatching');
 return jsonb_build_object('authorized',true,'jobId',j.id,'snapshot',j.snapshot,'ip',p.ip,'port',p.port);
end $$;
create function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;p public.kitchen_printers;v_state text;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 select pr.* into p from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=d.restaurant_id for update;
 if j.id is null or j.device_id is distinct from d.id or j.claim_token is distinct from p_claim_token or j.attempt_id is distinct from p_attempt_id or p_attempt_id is null then raise exception 'PRINT_CLAIM_NOT_CURRENT';end if;
 if p_outcome not in('not_sent','transmitted','uncertain') then raise exception 'INVALID_TRANSPORT_OUTCOME';end if;
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
create function public.kp_manual_job(p_printer_id uuid,p_kind text,p_key uuid,p_snapshot jsonb,p_order_id uuid,p_parent uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;v uuid;
begin
 select * into p from public.kitchen_printers where id=p_printer_id for update;
 perform public.kp_require_role(p.restaurant_id);
 if not p.enabled or p.ip is null then raise exception 'PRINTER_NOT_CONFIGURED';end if;
 if p_key is null then raise exception 'REQUEST_KEY_REQUIRED';end if;
 if exists(select 1 from public.orders where restaurant_id=p.restaurant_id and (to_jsonb(orders)->>'kitchen_print_claimed_at')::timestamptz>now()-interval '2 minutes' and to_jsonb(orders)->>'kitchen_printed_at' is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;
 insert into public.kitchen_print_controls(restaurant_id,protocol_version) values(p.restaurant_id,2) on conflict(restaurant_id) do update set protocol_version=2;
 insert into public.kitchen_print_jobs(restaurant_id,printer_id,order_id,kind,dispatch_key,snapshot,parent_job_id,requested_by,reason)
 values(p.restaurant_id,p.id,p_order_id,p_kind,p_kind||':'||auth.uid()||':'||p_key,p_snapshot,p_parent,auth.uid(),left(p_reason,500))
 on conflict(restaurant_id,printer_id,dispatch_key) do nothing returning id into v;
 if v is null then select id into v from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and printer_id=p.id and dispatch_key=p_kind||':'||auth.uid()||':'||p_key;
 else perform public.kp_audit(p.restaurant_id,p_kind||'_requested',jsonb_build_object('reason',left(p_reason,500)),v,p.id);end if;
 return v;
end $$;
create function public.request_kitchen_test_print(p_printer_id uuid,p_request_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.kitchen_printers;r public.restaurants;s jsonb;
begin
 select * into p from public.kitchen_printers where id=p_printer_id;
 perform public.kp_require_role(p.restaurant_id);
 select * into r from public.restaurants where id=p.restaurant_id;
 s:=jsonb_build_object('version',1,'restaurantName',r.name,'timezone',r.timezone,'orderNumber','TEST','tableName','TEST PRINT','createdAt',now(),'destination',p.destination,'copies',p.copies,'autoCut',p.auto_cut,'instructions','Synthetic setup ticket. Paper output must be checked by staff.','items',jsonb_build_array(jsonb_build_object('name','TEST ITEM','quantity',1,'notes','No customer order','modifiers','[]'::jsonb)));
 return public.kp_manual_job(p.id,'test',p_request_key,s,null,null,'Explicit test print');
end $$;
create function public.request_kitchen_reprint(p_job_id uuid,p_reason text,p_request_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.kitchen_print_jobs;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kp_require_role(j.restaurant_id);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REPRINT_REASON_REQUIRED';end if;
 return public.kp_manual_job(j.printer_id,'reprint',p_request_key,j.snapshot||jsonb_build_object('reprint',true),j.order_id,j.id,p_reason);
end $$;
create function public.request_legacy_kitchen_reprint(p_order_id uuid,p_printer_id uuid,p_reason text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb;r uuid;
begin
 select restaurant_id into r from public.orders where id=p_order_id;
 perform public.kp_require_role(r);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REPRINT_REASON_REQUIRED';end if;
 s:=public.kp_snapshot(p_order_id,p_printer_id);
 if s is null or jsonb_array_length(s->'items')=0 then raise exception 'PRINT_SOURCE_NOT_FOUND';end if;
 return public.kp_manual_job(p_printer_id,'reprint',p_request_key,s||'{"reprint":true,"legacySource":true}'::jsonb,p_order_id,null,p_reason);
end $$;
create function public.resolve_kitchen_print_uncertainty(p_job_id uuid,p_resolution text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.kitchen_print_jobs;
begin
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kp_require_role(j.restaurant_id);
 perform 1 from public.kitchen_printers where id=j.printer_id for update;
 select * into j from public.kitchen_print_jobs where id=p_job_id for update;
 if p_resolution not in('paper_checked','agent_stopped') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'RESOLUTION_CONFIRMATION_REQUIRED';end if;
 if j.state='resolved' then return true;end if;
 if j.state not in('uncertain','failed') then raise exception 'PRINT_NOT_RESOLVABLE';end if;
 update public.kitchen_print_jobs set state='resolved' where id=j.id;
 perform public.kp_transition(j.id,'resolved',jsonb_build_object('resolution',p_resolution,'reason',left(p_reason,500)));
 perform public.kp_audit(j.restaurant_id,'uncertainty_resolved',jsonb_build_object('reason',left(p_reason,500)),j.id,j.printer_id);
 return true;
end $$;
do $$declare f record;begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'kp_%' or proname in('heartbeat_kitchen_print_device','claim_kitchen_printer_job','begin_kitchen_print_attempt','finish_kitchen_print_attempt','request_kitchen_test_print','request_kitchen_reprint','request_legacy_kitchen_reprint','resolve_kitchen_print_uncertainty')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.proname not like 'kp_%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;






-- Reviewed source 20261020063746_kitchen_print_endpoint_and_revision_guards.sql

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
 if exists(select 1 from public.orders where restaurant_id=p.restaurant_id and (to_jsonb(orders)->>'kitchen_print_claimed_at')::timestamptz>now()-interval '2 minutes' and to_jsonb(orders)->>'kitchen_printed_at' is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;
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
 if to_regprocedure('public.kp_legacy_claim(text)') is null then raise exception 'LEGACY_PRINTING_UNAVAILABLE';end if;
 return public.kp_legacy_claim(p_restaurant_slug);
end $$;
create or replace function public.finish_kitchen_print_job(p_order_id uuid,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended((select restaurant_id::text from public.orders where id=p_order_id),27));
 if exists(select 1 from public.kitchen_print_controls c join public.orders o on o.restaurant_id=c.restaurant_id where o.id=p_order_id and c.protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED';end if;
 if to_regprocedure('public.kp_legacy_finish(uuid,uuid,boolean,text)') is null then raise exception 'LEGACY_PRINTING_UNAVAILABLE';end if;
 return public.kp_legacy_finish(p_order_id,p_claim_token,p_success,p_error);
end $$;



-- Reviewed source 20261020064725_kitchen_print_bounded_status_and_lock_order.sql

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
 if exists(select 1 from public.orders where restaurant_id=p.restaurant_id and (to_jsonb(orders)->>'kitchen_print_claimed_at')::timestamptz>now()-interval '2 minutes' and to_jsonb(orders)->>'kitchen_printed_at' is null) then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE';end if;

 insert into public.kitchen_print_jobs(restaurant_id,printer_id,order_id,kind,dispatch_key,snapshot,parent_job_id,requested_by,reason)
 values(p.restaurant_id,p.id,p_order_id,p_kind,p_kind||':'||auth.uid()||':'||p_key,p_snapshot,p_parent,auth.uid(),left(p_reason,500))
 on conflict(restaurant_id,printer_id,dispatch_key) do nothing returning id into v;
 if v is null then select id into v from public.kitchen_print_jobs where restaurant_id=p.restaurant_id and printer_id=p.id and dispatch_key=p_kind||':'||auth.uid()||':'||p_key;
 else perform public.kp_audit(p.restaurant_id,p_kind||'_requested',jsonb_build_object('reason',left(p_reason,500)),v,p.id);end if;
 return v;
end $$;



-- Reviewed source 20261020070008_kitchen_print_operational_status_bounds.sql

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



-- Reviewed source 20261020071621_kitchen_print_lint_contracts.sql
 alter function public.kp_require_role(uuid,boolean) stable;
create or replace function public.heartbeat_kitchen_print_device(p_device_id uuid,p_device_secret text,p_observations jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices; entry jsonb; result jsonb:='{}'::jsonb; pid uuid;
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
create or replace function public.finish_kitchen_print_attempt(p_device_id uuid,p_device_secret text,p_job_id uuid,p_claim_token uuid,p_attempt_id uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.kitchen_print_devices;j public.kitchen_print_jobs;v_state text;
begin
 d:=public.kp_device(p_device_id,p_device_secret);
 perform 1 from public.kitchen_printers pr join public.kitchen_print_jobs q on q.printer_id=pr.id where q.id=p_job_id and q.restaurant_id=d.restaurant_id for update of pr;
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



commit;
notify pgrst,'reload schema';
