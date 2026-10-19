-- Local candidate only; order creation must remain independent of print transport.
begin;
alter table public.orders add constraint kitchen_orders_tenant_id unique(restaurant_id,id);
create table public.kitchen_print_jobs (
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id),order_id uuid,printer_id uuid not null,
 kind text not null check(kind in('automatic','test','reprint')),dispatch_revision integer not null default 1,
 snapshot jsonb not null,snapshot_hash text not null,snapshot_version integer not null default 1 check(snapshot_version=1),
 destination text not null check(destination in('Kitchen','Bar','Dessert')),config_revision bigint not null,
 state text not null default 'queued' check(state in('queued','leased','dispatching','retry_wait','transmitted','uncertain','failed','resolved')),
 claim_token uuid,device_id uuid,lease_expires_at timestamptz,attempt_count integer not null default 0 check(attempt_count between 0 and 5),next_attempt_at timestamptz not null default clock_timestamp(),
 parent_job_id uuid,request_actor uuid references auth.users(id),request_key uuid,reason text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 foreign key(restaurant_id,order_id) references public.orders(restaurant_id,id),foreign key(restaurant_id,printer_id) references public.kitchen_printers(restaurant_id,id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id),unique(restaurant_id,id),
 foreign key(restaurant_id,parent_job_id) references public.kitchen_print_jobs(restaurant_id,id),unique(restaurant_id,request_actor,request_key)
);
-- Reprints must not collide with the automatic identity; a separate partial key
-- excludes deliberate child jobs while the dispatch revision remains immutable.

create unique index kitchen_jobs_dispatch_identity on public.kitchen_print_jobs(restaurant_id,order_id,printer_id,dispatch_revision) where kind='automatic';
create unique index kitchen_jobs_endpoint_active on public.kitchen_print_jobs(restaurant_id,printer_id) where state in('leased','dispatching','uncertain');
create index kitchen_jobs_claim on public.kitchen_print_jobs(restaurant_id,state,next_attempt_at,created_at,id) where state in('queued','retry_wait');
create index kitchen_jobs_history on public.kitchen_print_jobs(restaurant_id,created_at desc,id desc);
create index kitchen_jobs_lease on public.kitchen_print_jobs(restaurant_id,lease_expires_at) where state in('leased','dispatching');
create table public.kitchen_print_attempts (
 id bigint generated always as identity primary key,restaurant_id uuid not null,job_id uuid not null,printer_id uuid not null,device_id uuid not null,
 attempt_id uuid not null,claim_token uuid not null,event text not null check(event in('dispatching','transmitted','uncertain','not_sent','resolved')),
 error_code text,config_revision bigint not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(restaurant_id,job_id) references public.kitchen_print_jobs(restaurant_id,id),foreign key(restaurant_id,printer_id) references public.kitchen_printers(restaurant_id,id),
 foreign key(restaurant_id,device_id) references public.kitchen_print_devices(restaurant_id,id)
);
create unique index kitchen_attempt_begin_identity on public.kitchen_print_attempts(attempt_id) where event='dispatching';
create unique index kitchen_attempt_finish_identity on public.kitchen_print_attempts(attempt_id) where event in('transmitted','uncertain','not_sent');
create index kitchen_attempt_history on public.kitchen_print_attempts(restaurant_id,job_id,created_at,id);
create trigger kitchen_attempts_immutable before update or delete on public.kitchen_print_attempts for each row execute function public.kitchen_immutable();
create function public.kitchen_job_snapshot_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at']) is distinct from (to_jsonb(old)-array['state','claim_token','device_id','lease_expires_at','attempt_count','next_attempt_at','updated_at']) then raise exception 'PRINT_SNAPSHOT_IMMUTABLE'; end if; return new;
end $$;
create trigger kitchen_job_immutable before update or delete on public.kitchen_print_jobs for each row execute function public.kitchen_job_snapshot_immutable();
create function public.enqueue_kitchen_dispatch(p_order_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_order public.orders; v_control public.kitchen_print_controls; v_printer public.kitchen_printers; v_snapshot jsonb; v_items jsonb; v_restaurant public.restaurants; v_destination text;
begin
 select * into v_order from public.orders where id=p_order_id;
 select * into v_restaurant from public.restaurants where id=v_order.restaurant_id for update;
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
end $$;
create function public.kitchen_order_dispatch_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 perform public.enqueue_kitchen_dispatch(new.id); return new;
end $$;
create constraint trigger kitchen_order_dispatch after insert on public.orders deferrable initially deferred for each row execute function public.kitchen_order_dispatch_trigger();
-- Serialize the cutover with both legacy operations. Protocol 2 never reopens v1.
alter function public.claim_kitchen_print_job(text) rename to kitchen_legacy_claim_v1;
alter function public.finish_kitchen_print_job(uuid,uuid,boolean,text) rename to kitchen_legacy_finish_v1;
revoke all on function public.kitchen_legacy_claim_v1(text),public.kitchen_legacy_finish_v1(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
create function public.claim_kitchen_print_job(p_restaurant_slug text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare v_id uuid; begin
 select id into v_id from public.restaurants where slug=p_restaurant_slug for update;
 perform public.kitchen_require_role(v_id);
 if exists(select 1 from public.kitchen_print_controls where restaurant_id=v_id and protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED'; end if;
 return public.kitchen_legacy_claim_v1(p_restaurant_slug);
end $$;
create function public.finish_kitchen_print_job(p_order_id uuid,p_claim_token uuid,p_success boolean,p_error text default null) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare v_id uuid; begin
 select restaurant_id into v_id from public.orders where id=p_order_id;
 perform 1 from public.restaurants where id=v_id for update;
 perform public.kitchen_require_role(v_id);
 if exists(select 1 from public.kitchen_print_controls where restaurant_id=v_id and protocol_version=2) then raise exception 'PRINT_PROTOCOL_UPGRADE_REQUIRED'; end if;
 return public.kitchen_legacy_finish_v1(p_order_id,p_claim_token,p_success,p_error);
end $$;
alter table public.kitchen_print_jobs enable row level security;
alter table public.kitchen_print_attempts enable row level security;
revoke all on table public.kitchen_print_jobs,public.kitchen_print_attempts from public,anon,authenticated,service_role;
revoke all on function public.enqueue_kitchen_dispatch(uuid),public.kitchen_job_snapshot_immutable(),public.kitchen_order_dispatch_trigger(),public.claim_kitchen_print_job(text),public.finish_kitchen_print_job(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_kitchen_print_job(text),public.finish_kitchen_print_job(uuid,uuid,boolean,text) to authenticated;
commit;
notify pgrst,'reload schema';

