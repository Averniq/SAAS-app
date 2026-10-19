-- Local candidate only. Not part of the approved deployment chain.
begin;
create function public.kitchen_private_ipv4(p_ip text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare a integer[];
begin
 if p_ip is null then return true; end if;
 if p_ip !~ '^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$' then return false; end if;
 a:=string_to_array(p_ip,'.')::integer[];
 return 255>=all(a) and (a[1]=10 or (a[1]=172 and a[2] between 16 and 31) or (a[1]=192 and a[2]=168)) and a[4] not in (0,255);
end $$;
create table public.kitchen_print_controls (
 restaurant_id uuid primary key references public.restaurants(id), enabled boolean not null default false,
 allow_test_orders boolean not null default false, protocol_version integer not null default 1 check(protocol_version in(1,2)), activated_at timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
create table public.kitchen_printers (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), name text not null check(length(trim(name)) between 1 and 80),
 ip text check(public.kitchen_private_ipv4(ip)), port integer not null default 9100 check(port between 1024 and 65535),
 protocol text not null default 'escpos_lan' check(protocol='escpos_lan'), enabled boolean not null default true, auto_print boolean not null default false,
 auto_cut boolean not null default false, copies integer not null default 1 check(copies between 1 and 3),
 destination text not null default 'Kitchen' check(destination in('Kitchen','Bar','Dessert')), config_revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null references auth.users(id),
 disabled_at timestamptz, disabled_by uuid references auth.users(id), disable_reason text, unique(restaurant_id,id)
);
create unique index kitchen_printers_live_endpoint on public.kitchen_printers(restaurant_id,ip,port) where enabled and ip is not null;
alter table public.categories add constraint kitchen_categories_tenant_id unique(restaurant_id,id);
create table public.kitchen_printer_routes (
 restaurant_id uuid not null references public.restaurants(id), category_id uuid not null,
 destination text not null check(destination in('Kitchen','Bar','Dessert')), primary key(restaurant_id,category_id),
 foreign key(restaurant_id,category_id) references public.categories(restaurant_id,id)
);
create table public.kitchen_print_pairings (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), operator_id uuid not null references auth.users(id),
 device_name text not null check(length(trim(device_name)) between 1 and 80), secret_hash text not null check(secret_hash~'^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in('pending','approved','consumed','expired')), failed_activations integer not null default 0,
 approved_by uuid references auth.users(id), approved_printers uuid[] not null default '{}', created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'), unique(restaurant_id,id)
);
create index kitchen_pairings_operator_recent on public.kitchen_print_pairings(restaurant_id,operator_id,created_at desc);
create table public.kitchen_print_devices (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), operator_id uuid not null references auth.users(id),
 device_name text not null, secret_hash text not null, secret_version integer not null default 1, state text not null default 'active' check(state in('active','revoked')),
 created_at timestamptz not null default clock_timestamp(), last_heartbeat timestamptz, revoked_at timestamptz, revoked_by uuid references auth.users(id), revoke_reason text,
 observations jsonb not null default '{}', unique(restaurant_id,id)
);
create table public.kitchen_print_device_printers (
 restaurant_id uuid not null, device_id uuid not null, printer_id uuid not null, primary key(restaurant_id,device_id,printer_id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id),
 foreign key(restaurant_id,printer_id) references public.kitchen_printers(restaurant_id,id)
);
create table public.kitchen_print_audit (
 id bigint generated always as identity primary key, restaurant_id uuid not null references public.restaurants(id), event text not null,
 entity_id uuid, actor_id uuid references auth.users(id), created_at timestamptz not null default clock_timestamp(), details jsonb not null default '{}'
);
create index kitchen_audit_history on public.kitchen_print_audit(restaurant_id,created_at desc,id desc);
create function public.kitchen_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'PRINT_HISTORY_IMMUTABLE'; end $$;
create trigger kitchen_audit_immutable before update or delete on public.kitchen_print_audit for each row execute function public.kitchen_immutable();
create function public.kitchen_require_role(p_restaurant_id uuid,p_manager boolean default false) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not exists(select 1 from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=v_uid and role=any(case when p_manager then array['owner','manager'] else array['owner','manager','staff','kitchen'] end) for share) then raise exception 'PRINT_PERMISSION_DENIED' using errcode='42501'; end if;
 return v_uid;
end $$;
create function public.save_kitchen_printer(p_restaurant_id uuid,p_printer_id uuid,p_config jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_uid uuid; v_row public.kitchen_printers; v_route jsonb; v_routes boolean:=p_config?'routes';
begin
 v_uid:=public.kitchen_require_role(p_restaurant_id,true);
 if p_config is null or jsonb_typeof(p_config)<>'object' or length(p_config::text)>32768 then raise exception 'INVALID_CONFIG'; end if;
 perform 1 from public.restaurants where id=p_restaurant_id for update;
 if p_printer_id is null then
  insert into public.kitchen_printers(restaurant_id,name,ip,port,enabled,auto_print,auto_cut,copies,destination,updated_by)
  values(p_restaurant_id,p_config->>'name',nullif(p_config->>'ip',''),coalesce((p_config->>'port')::integer,9100),coalesce((p_config->>'enabled')::boolean,true),coalesce((p_config->>'autoPrint')::boolean,false),coalesce((p_config->>'autoCut')::boolean,false),coalesce((p_config->>'copies')::integer,1),coalesce(p_config->>'destination','Kitchen'),v_uid) returning * into v_row;
 else
  select * into v_row from public.kitchen_printers where restaurant_id=p_restaurant_id and id=p_printer_id for update;
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
end $$;
create function public.disable_kitchen_printer(p_printer_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_row public.kitchen_printers; v_uid uuid;
begin
 select * into v_row from public.kitchen_printers where id=p_printer_id;
 v_uid:=public.kitchen_require_role(v_row.restaurant_id,true);
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'REASON_REQUIRED'; end if;
 update public.kitchen_printers set enabled=false,auto_print=false,disabled_at=clock_timestamp(),disabled_by=v_uid,disable_reason=p_reason,config_revision=config_revision+1,updated_at=clock_timestamp(),updated_by=v_uid where id=p_printer_id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(v_row.restaurant_id,'printer_disabled',p_printer_id,v_uid,jsonb_build_object('reason',p_reason)); return true;
end $$;
create function public.set_kitchen_print_control(p_restaurant_id uuid,p_enabled boolean,p_allow_test_orders boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_uid uuid; v_row public.kitchen_print_controls;
begin
 v_uid:=public.kitchen_require_role(p_restaurant_id,true);
 perform 1 from public.restaurants where id=p_restaurant_id for update;
 if p_enabled and exists(select 1 from public.orders where restaurant_id=p_restaurant_id and kitchen_print_claimed_at>clock_timestamp()-interval '2 minutes') then raise exception 'LEGACY_PRINT_CLAIM_ACTIVE'; end if;
 insert into public.kitchen_print_controls(restaurant_id,enabled,allow_test_orders,protocol_version,activated_at) values(p_restaurant_id,p_enabled,p_allow_test_orders,case when p_enabled then 2 else 1 end,case when p_enabled then clock_timestamp() end)
 on conflict(restaurant_id) do update set enabled=excluded.enabled,allow_test_orders=excluded.allow_test_orders,protocol_version=greatest(kitchen_print_controls.protocol_version,excluded.protocol_version),activated_at=case when excluded.enabled and not kitchen_print_controls.enabled then clock_timestamp() else kitchen_print_controls.activated_at end,updated_at=clock_timestamp() returning * into v_row;
 insert into public.kitchen_print_audit(restaurant_id,event,actor_id,details) values(p_restaurant_id,'control_changed',v_uid,jsonb_build_object('enabled',p_enabled,'allowTestOrders',p_allow_test_orders)); return to_jsonb(v_row);
end $$;
create function public.list_kitchen_printers(p_restaurant_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform public.kitchen_require_role(p_restaurant_id);
 return jsonb_build_object('printers',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from public.kitchen_printers p where p.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'control',coalesce((select to_jsonb(c) from public.kitchen_print_controls c where restaurant_id=p_restaurant_id),'{}'::jsonb),
 'routes',coalesce((select jsonb_agg(to_jsonb(r)) from public.kitchen_printer_routes r where restaurant_id=p_restaurant_id),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'operatorId',d.operator_id,'name',d.device_name,'state',d.state,'lastHeartbeat',d.last_heartbeat,'observations',d.observations,'printers',(select coalesce(jsonb_agg(a.printer_id),'[]'::jsonb) from public.kitchen_print_device_printers a where a.device_id=d.id))) from public.kitchen_print_devices d where d.restaurant_id=p_restaurant_id),'[]'::jsonb),
 'pairings',case when public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then coalesce((select jsonb_agg(jsonb_build_object('pairingId',id,'deviceName',device_name,'operatorId',operator_id,'state',state,'expiresAt',expires_at)) from public.kitchen_print_pairings where restaurant_id=p_restaurant_id and expires_at>clock_timestamp() and state in('pending','approved')),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create function public.begin_kitchen_print_pairing(p_restaurant_id uuid,p_device_name text,p_secret_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_uid uuid; v_row public.kitchen_print_pairings;
begin
 v_uid:=public.kitchen_require_role(p_restaurant_id);
 perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text||v_uid::text,0));
 if (select count(*) from public.kitchen_print_pairings where restaurant_id=p_restaurant_id and operator_id=v_uid and created_at>clock_timestamp()-interval '10 minutes')>=5 then raise exception 'PAIRING_RATE_LIMIT'; end if;
 insert into public.kitchen_print_pairings(restaurant_id,operator_id,device_name,secret_hash) values(p_restaurant_id,v_uid,p_device_name,p_secret_hash) returning * into v_row;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id) values(p_restaurant_id,'pairing_started',v_row.id,v_uid);
 return jsonb_build_object('pairingId',v_row.id,'expiresAt',v_row.expires_at);
end $$;
create function public.approve_kitchen_print_pairing(p_pairing_id uuid,p_printer_ids uuid[]) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_pair public.kitchen_print_pairings; v_uid uuid;
begin
 select * into v_pair from public.kitchen_print_pairings where id=p_pairing_id;
 v_uid:=public.kitchen_require_role(v_pair.restaurant_id,true);
 select * into v_pair from public.kitchen_print_pairings where id=p_pairing_id for update;
 if v_pair.state<>'pending' or v_pair.expires_at<=clock_timestamp() or coalesce(array_length(p_printer_ids,1),0) not between 1 and 20 or (select count(distinct p.id) from public.kitchen_printers p where p.restaurant_id=v_pair.restaurant_id and p.enabled and p.id=any(p_printer_ids))<>array_length(p_printer_ids,1) then raise exception 'PAIRING_ASSIGNMENT_DENIED'; end if;
 update public.kitchen_print_pairings set state='approved',approved_by=v_uid,approved_printers=p_printer_ids where id=p_pairing_id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id) values(v_pair.restaurant_id,'pairing_approved',p_pairing_id,v_uid); return true;
end $$;
create function public.activate_kitchen_print_pairing(p_pairing_id uuid,p_secret text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_pair public.kitchen_print_pairings; v_uid uuid; v_device uuid;
begin
 select * into v_pair from public.kitchen_print_pairings where id=p_pairing_id;
 v_uid:=public.kitchen_require_role(v_pair.restaurant_id);
 select * into v_pair from public.kitchen_print_pairings where id=p_pairing_id for update;
 if v_pair.operator_id<>v_uid then raise exception 'PAIRING_OPERATOR_DENIED' using errcode='42501'; end if;
 if v_pair.state<>'approved' or v_pair.expires_at<=clock_timestamp() or v_pair.failed_activations>=5 then return jsonb_build_object('status','denied','code','PAIRING_UNAVAILABLE'); end if;
 if coalesce(p_secret,'')!~'^[a-f0-9]{64}$' or encode(extensions.digest(p_secret,'sha256'),'hex')<>v_pair.secret_hash then
  update public.kitchen_print_pairings set failed_activations=failed_activations+1,state=case when failed_activations+1>=5 then 'expired' else state end where id=p_pairing_id;
  insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id) values(v_pair.restaurant_id,'pairing_denied',p_pairing_id,v_uid);
  return jsonb_build_object('status','denied','code','PAIRING_PROOF_DENIED');
 end if;
 if (select count(*) from public.kitchen_printers where restaurant_id=v_pair.restaurant_id and enabled and id=any(v_pair.approved_printers))<>array_length(v_pair.approved_printers,1) then return jsonb_build_object('status','denied','code','ASSIGNMENT_CHANGED'); end if;
 insert into public.kitchen_print_devices(restaurant_id,operator_id,device_name,secret_hash) values(v_pair.restaurant_id,v_uid,v_pair.device_name,v_pair.secret_hash) returning id into v_device;
 insert into public.kitchen_print_device_printers(restaurant_id,device_id,printer_id) select v_pair.restaurant_id,v_device,unnest(v_pair.approved_printers);
 update public.kitchen_print_pairings set state='consumed' where id=p_pairing_id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id) values(v_pair.restaurant_id,'device_activated',v_device,v_uid);
 return jsonb_build_object('status','active','deviceId',v_device,'restaurantId',v_pair.restaurant_id,'operatorId',v_uid);
end $$;
create function public.revoke_kitchen_print_device(p_device_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_row public.kitchen_print_devices; v_uid uuid;
begin
 select * into v_row from public.kitchen_print_devices where id=p_device_id; v_uid:=public.kitchen_require_role(v_row.restaurant_id,true);
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'REASON_REQUIRED'; end if;
 update public.kitchen_print_devices set state='revoked',revoked_at=clock_timestamp(),revoked_by=v_uid,revoke_reason=p_reason where id=p_device_id;
 insert into public.kitchen_print_audit(restaurant_id,event,entity_id,actor_id,details) values(v_row.restaurant_id,'device_revoked',p_device_id,v_uid,jsonb_build_object('reason',p_reason)); return true;
end $$;
-- No secret-bearing table is selectable; every access is through a fixed projection.
do $$ declare t text; f regprocedure; begin
 foreach t in array array['kitchen_print_controls','kitchen_printers','kitchen_printer_routes','kitchen_print_pairings','kitchen_print_devices','kitchen_print_device_printers','kitchen_print_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and (proname like '%kitchen%printer%' or proname like '%kitchen%pairing%' or proname in('kitchen_private_ipv4','kitchen_immutable','kitchen_require_role','set_kitchen_print_control','revoke_kitchen_print_device')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
grant execute on function public.save_kitchen_printer(uuid,uuid,jsonb),public.disable_kitchen_printer(uuid,text),public.set_kitchen_print_control(uuid,boolean,boolean),public.list_kitchen_printers(uuid),public.begin_kitchen_print_pairing(uuid,text,text),public.approve_kitchen_print_pairing(uuid,uuid[]),public.activate_kitchen_print_pairing(uuid,text),public.revoke_kitchen_print_device(uuid,text) to authenticated;
commit;
notify pgrst,'reload schema';
