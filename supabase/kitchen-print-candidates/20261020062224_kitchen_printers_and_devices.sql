begin;
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
commit;

