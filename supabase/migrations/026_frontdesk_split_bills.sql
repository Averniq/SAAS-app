-- Auditable, tenant-scoped front-desk payments and split-bill records.
-- Amounts are stored as integer cents; numeric order totals are only converted
-- at the database boundary to avoid rounding drift in allocation/payment logic.

alter table public.orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid','partial','paid'));

create table if not exists public.split_bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  split_type text not null check (split_type in ('equal','item','custom')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0 and paid_cents <= total_cents),
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','voided')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subtotal_cents + gst_cents = total_cents)
);

create table if not exists public.split_bill_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  split_bill_id uuid not null references public.split_bills(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  check (subtotal_cents + gst_cents = total_cents)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  split_bill_id uuid references public.split_bills(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('Cash','Card','Other')),
  status text not null default 'completed' check (status in ('completed','voided')),
  note text not null default '',
  idempotency_key uuid not null default gen_random_uuid(),
  recorded_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);

create index if not exists split_bills_order_idx on public.split_bills(restaurant_id, order_id);
create index if not exists split_bill_items_bill_idx on public.split_bill_items(restaurant_id, split_bill_id);
create index if not exists payments_order_idx on public.payments(restaurant_id, order_id, paid_at desc);

create trigger split_bills_updated_at before update on public.split_bills for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

alter table public.split_bills enable row level security;
alter table public.split_bill_items enable row level security;
alter table public.payments enable row level security;

create policy "staff read own split bills" on public.split_bills for select to authenticated using (public.is_restaurant_staff(restaurant_id));
create policy "staff read own split bill items" on public.split_bill_items for select to authenticated using (public.is_restaurant_staff(restaurant_id));
create policy "staff read own payments" on public.payments for select to authenticated using (public.is_restaurant_staff(restaurant_id));

create or replace function public.record_restaurant_payment(
  p_restaurant_id uuid, p_order_id uuid, p_amount_cents integer, p_method text,
  p_note text default '', p_split_bill_id uuid default null, p_idempotency_key uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target_role text; target_order public.orders; total_cents integer; paid_cents integer; split_total_cents integer; split_paid_cents integer; payment_row public.payments;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if target_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('Cash','Card','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into target_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if target_order.id is null or target_order.status='cancelled' then raise exception 'ORDER_NOT_PAYABLE'; end if;
  select round(target_order.total * 100)::integer into total_cents;
  select coalesce(sum(amount_cents),0) into paid_cents from public.payments where restaurant_id=p_restaurant_id and order_id=p_order_id and status='completed';
  if p_amount_cents > total_cents-paid_cents then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;
  if p_split_bill_id is not null then
    select total_cents into split_total_cents from public.split_bills where id=p_split_bill_id and restaurant_id=p_restaurant_id and order_id=p_order_id for update;
    if split_total_cents is null then raise exception 'SPLIT_BILL_NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into split_paid_cents from public.payments where split_bill_id=p_split_bill_id and status='completed';
    if p_amount_cents > split_total_cents-split_paid_cents then raise exception 'PAYMENT_EXCEEDS_SPLIT_BALANCE'; end if;
  end if;
  insert into public.payments(restaurant_id,order_id,split_bill_id,amount_cents,payment_method,note,idempotency_key,recorded_by)
  values(p_restaurant_id,p_order_id,p_split_bill_id,p_amount_cents,p_method,coalesce(p_note,''),p_idempotency_key,auth.uid())
  on conflict (restaurant_id,idempotency_key) do nothing returning * into payment_row;
  if payment_row.id is null then raise exception 'DUPLICATE_PAYMENT'; end if;
  paid_cents := paid_cents + p_amount_cents;
  if p_split_bill_id is not null then
    split_paid_cents := split_paid_cents + p_amount_cents;
    update public.split_bills set paid_cents=split_paid_cents, status=case when split_paid_cents>=split_total_cents then 'paid' when split_paid_cents>0 then 'partial' else 'unpaid' end where id=p_split_bill_id;
  end if;
  update public.orders set payment_status=case when paid_cents=0 then 'unpaid' when paid_cents>=total_cents then 'paid' else 'partial' end,
    status=case when paid_cents>=total_cents then 'completed' else status end,
    paid_at=case when paid_cents>=total_cents then coalesce(paid_at,now()) else paid_at end,
    closed_at=case when paid_cents>=total_cents then coalesce(closed_at,now()) else closed_at end,
    payment_method=case when paid_cents>=total_cents then p_method else payment_method end where id=p_order_id;
  return jsonb_build_object('payment_id',payment_row.id,'amount_cents',p_amount_cents,'paid_cents',paid_cents,'remaining_cents',total_cents-paid_cents,'payment_status',case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end);
end $$;

create or replace function public.void_restaurant_payment(p_restaurant_id uuid,p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_role text; p public.payments; total_cents integer; paid_cents integer; split_total_cents integer; split_paid_cents integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if target_role not in ('owner','manager') then raise exception 'MANAGER_ROLE_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'VOID_REASON_REQUIRED'; end if;
  select * into p from public.payments where id=p_payment_id and restaurant_id=p_restaurant_id for update;
  if p.id is null or p.status='voided' then raise exception 'PAYMENT_NOT_VOIDABLE'; end if;
  update public.payments set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=p.id;
  select round(total*100)::integer into total_cents from public.orders where id=p.order_id;
  select coalesce(sum(amount_cents),0) into paid_cents from public.payments where order_id=p.order_id and status='completed';
  if p.split_bill_id is not null then
    select total_cents into split_total_cents from public.split_bills where id=p.split_bill_id for update;
    select coalesce(sum(amount_cents),0) into split_paid_cents from public.payments where split_bill_id=p.split_bill_id and status='completed';
    update public.split_bills set paid_cents=split_paid_cents, status=case when split_paid_cents>=split_total_cents then 'paid' when split_paid_cents>0 then 'partial' else 'unpaid' end where id=p.split_bill_id;
  end if;
  update public.orders set payment_status=case when paid_cents=0 then 'unpaid' when paid_cents>=total_cents then 'paid' else 'partial' end,
    paid_at=case when paid_cents>=total_cents then paid_at else null end,
    closed_at=case when paid_cents>=total_cents then closed_at else null end where id=p.order_id;
  return jsonb_build_object('payment_id',p.id,'paid_cents',paid_cents,'remaining_cents',total_cents-paid_cents);
end $$;

revoke all on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid), public.void_restaurant_payment(uuid,uuid,text) from public;
grant execute on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid), public.void_restaurant_payment(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
