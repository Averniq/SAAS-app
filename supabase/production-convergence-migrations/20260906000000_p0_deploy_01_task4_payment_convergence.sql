-- P0-03 Gates 1-3: the append-only payment_operations ledger is the
-- financial authority. Order payment/status columns are presentation only.
begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='orders_restaurant_id_id_key' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_restaurant_id_id_key unique (restaurant_id, id);
  end if;
end;
$$;

create table public.payment_operations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('Cash','Card','EFTPOS','Other')),
  payment_reference text not null default '' check (length(payment_reference) <= 80),
  note text not null default '' check (length(note) <= 200),
  idempotency_key uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  result_snapshot jsonb not null,
  unique (restaurant_id, idempotency_key),
  foreign key (restaurant_id, order_id) references public.orders(restaurant_id, id) on delete restrict
);

create index payment_operations_order_recorded_idx on public.payment_operations(restaurant_id, order_id, recorded_at desc);
create index payment_operations_actor_recorded_idx on public.payment_operations(restaurant_id, recorded_by, recorded_at desc);
create index payment_operations_restaurant_recorded_idx on public.payment_operations(restaurant_id, recorded_at desc, id desc);

alter table public.payment_operations enable row level security;
create policy "payment operations finance read" on public.payment_operations for select to authenticated
  using (public.has_restaurant_role(restaurant_id, array['owner','manager','cashier']));
revoke all on table public.payment_operations from public, anon, authenticated;

-- Keep kitchen progression operational, but remove the historical implication
-- that Served/Completed establishes a financial state.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','draft','confirmed','kitchen_accepted','preparing','ready','served','completed','paid','cancelled','voided'));

create or replace function public.record_authoritative_payment(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_amount_cents integer,
  p_method text,
  p_reference text default '',
  p_note text default '',
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer set search_path=public,pg_temp
as $$
declare
  v_role text;
  v_order public.orders;
  v_existing public.payment_operations;
  v_total_cents integer;
  v_paid_cents integer;
  v_fingerprint text;
  v_result jsonb;
  v_operation_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff
    where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if v_role not in ('owner','manager','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('Cash','Card','EFTPOS','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if length(coalesce(p_reference,'')) > 80 or length(coalesce(p_note,'')) > 200 then raise exception 'PAYMENT_METADATA_TOO_LONG'; end if;
  if p_method='Other' and trim(coalesce(p_note,''))='' then raise exception 'OTHER_PAYMENT_NOTE_REQUIRED'; end if;

  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'restaurant_id',p_restaurant_id,'order_id',p_order_id,'amount_cents',p_amount_cents,
    'method',p_method,'reference',trim(coalesce(p_reference,'')),'note',trim(coalesce(p_note,''))
  )::text, 'sha256'), 'hex');
  -- Serialise a key across orders as well as serialising balance checks per order.
  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.payment_operations
    where restaurant_id=p_restaurant_id and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint is distinct from v_fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return v_existing.result_snapshot || jsonb_build_object('idempotent_replay',true);
  end if;

  select * into v_order from public.orders
    where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('voided','cancelled') then raise exception 'PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER'; end if;
  v_total_cents := round(v_order.total * 100)::integer;
  if v_total_cents <= 0 then raise exception 'ORDER_NOT_PAYABLE'; end if;
  select coalesce(sum(amount_cents),0) into v_paid_cents from public.payment_operations
    where restaurant_id=p_restaurant_id and order_id=p_order_id;
  if p_amount_cents > v_total_cents-v_paid_cents then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;

  v_paid_cents := v_paid_cents + p_amount_cents;
  v_operation_id := gen_random_uuid();
  v_result := jsonb_build_object(
    'payment_id',v_operation_id,'amount_cents',p_amount_cents,'paid_cents',v_paid_cents,
    'remaining_cents',v_total_cents-v_paid_cents,
    'payment_status',case when v_paid_cents=v_total_cents then 'paid' when v_paid_cents>0 then 'partial' else 'unpaid' end,
    'idempotent_replay',false
  );
  insert into public.payment_operations(id,restaurant_id,order_id,amount_cents,payment_method,payment_reference,note,idempotency_key,payload_fingerprint,recorded_by,result_snapshot)
  values(v_operation_id,p_restaurant_id,p_order_id,p_amount_cents,p_method,trim(coalesce(p_reference,'')),trim(coalesce(p_note,'')),p_idempotency_key,v_fingerprint,auth.uid(),v_result);
  -- This is a derived projection only. Financial settlement continues to be
  -- proven exclusively by payment_operations, never by orders.status.
  update public.orders
  set paid_at = case when v_paid_cents = v_total_cents then coalesce(paid_at, now()) else null end,
      payment_method = case when v_paid_cents = v_total_cents then p_method else payment_method end,
      closed_at = case when v_paid_cents = v_total_cents then coalesce(closed_at, now()) else closed_at end,
      updated_at = now()
  where id = p_order_id and restaurant_id = p_restaurant_id;
  return v_result;
end;
$$;
alter function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid) owner to postgres;

create or replace function public.list_authoritative_payment_operations(p_restaurant_id uuid, p_order_id uuid default null)
returns jsonb
language plpgsql stable
security definer set search_path=public,pg_temp
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if v_role not in ('owner','manager','cashier') then raise exception 'FINANCIAL_READ_ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',po.id,'order_id',po.order_id,'amount_cents',po.amount_cents,'payment_method',po.payment_method,
    'payment_reference',po.payment_reference,'note',po.note,'recorded_at',po.recorded_at,'recorded_by',po.recorded_by
  ) order by po.recorded_at desc, po.id desc)
  from (
    select * from public.payment_operations
    where restaurant_id=p_restaurant_id and (p_order_id is null or order_id=p_order_id)
    order by recorded_at desc, id desc limit 1000
  ) po), '[]'::jsonb);
end;
$$;
alter function public.list_authoritative_payment_operations(uuid,uuid) owner to postgres;

-- Legacy financial writers and the direct order-payment path cannot bypass the ledger.
revoke all on function public.record_restaurant_order_payment(uuid,uuid,text) from public, anon, authenticated;
do $$
declare target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_restaurant_payment','void_restaurant_payment')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', target.signature);
  end loop;
end;
$$;

create or replace function public.update_restaurant_order_status(p_restaurant_id uuid,p_order_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; v_role text; v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if v_role is null then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  if p_action='Paid' then raise exception 'PAID_STATUS_REQUIRES_PAYMENT_LEDGER'; end if;
  if p_action not in ('Preparing','Ready','Served') then raise exception 'INVALID_ORDER_ACTION_USE_VOID_OR_PAYMENT_RPC'; end if;
  if v_role not in ('owner','manager','staff','kitchen') then raise exception 'KITCHEN_ROLE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('voided','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  v_status:=case p_action when 'Preparing' then 'preparing' when 'Ready' then 'ready' when 'Served' then 'served' end;
  update public.orders set status=v_status,served_at=case when p_action='Served' then now() else served_at end where id=o.id;
  return jsonb_build_object('id',o.id,'status',v_status);
end;
$$;

revoke all on function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid) from public, anon;
revoke all on function public.list_authoritative_payment_operations(uuid,uuid) from public, anon;
grant execute on function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid), public.list_authoritative_payment_operations(uuid,uuid) to authenticated;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public, anon;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

commit;
notify pgrst, 'reload schema';
