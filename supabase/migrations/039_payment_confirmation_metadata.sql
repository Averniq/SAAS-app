-- Payment confirmation metadata and retry-safe payment recording.
-- Cash rounding remains disabled until an owner-controlled setting is introduced.

alter table public.payments
  add column if not exists cash_received_cents integer,
  add column if not exists change_given_cents integer,
  add column if not exists payment_reference text,
  add column if not exists rounding_adjustment_cents integer not null default 0;

alter table public.payments
  drop constraint if exists payments_cash_received_cents_check,
  drop constraint if exists payments_change_given_cents_check,
  drop constraint if exists payments_rounding_adjustment_cents_check;

alter table public.payments
  add constraint payments_cash_received_cents_check check (cash_received_cents is null or cash_received_cents >= 0),
  add constraint payments_change_given_cents_check check (change_given_cents is null or change_given_cents >= 0),
  add constraint payments_rounding_adjustment_cents_check check (rounding_adjustment_cents = 0);

drop function if exists public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid);

create function public.record_restaurant_payment(
  p_restaurant_id uuid, p_order_id uuid, p_amount_cents integer, p_method text,
  p_note text default '', p_split_bill_id uuid default null, p_idempotency_key uuid default gen_random_uuid(),
  p_cash_received_cents integer default null, p_change_given_cents integer default null,
  p_reference text default ''
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_role text; target_order public.orders; total_cents integer; paid_cents integer;
  split_total_cents integer; split_paid_cents integer; payment_row public.payments;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into target_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
  if target_role not in ('owner','manager','staff','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('Cash','Card','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if length(coalesce(p_note,'')) > 200 or length(coalesce(p_reference,'')) > 80 then raise exception 'PAYMENT_METADATA_TOO_LONG'; end if;
  if p_method = 'Cash' then
    if p_cash_received_cents is null or p_cash_received_cents < p_amount_cents or p_change_given_cents is null or p_change_given_cents < 0 or p_cash_received_cents - p_change_given_cents <> p_amount_cents then raise exception 'INVALID_CASH_TENDER'; end if;
  elsif p_cash_received_cents is not null or p_change_given_cents is not null then
    raise exception 'CASH_METADATA_ONLY_ALLOWED_FOR_CASH';
  end if;
  if p_method = 'Other' and length(trim(coalesce(p_note,''))) = 0 then raise exception 'OTHER_PAYMENT_NOTE_REQUIRED'; end if;

  select * into target_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if target_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  -- This runs after the order lock. A concurrent retry therefore sees the
  -- committed original payment and returns it rather than reporting a false failure.
  select * into payment_row from public.payments where restaurant_id=p_restaurant_id and idempotency_key=p_idempotency_key;
  if payment_row.id is not null then
    if payment_row.order_id is distinct from p_order_id
      or payment_row.amount_cents is distinct from p_amount_cents
      or payment_row.payment_method is distinct from p_method
      or payment_row.split_bill_id is distinct from p_split_bill_id
      or payment_row.note is distinct from coalesce(p_note,'')
      or payment_row.cash_received_cents is distinct from p_cash_received_cents
      or payment_row.change_given_cents is distinct from p_change_given_cents
      or coalesce(payment_row.payment_reference,'') is distinct from trim(coalesce(p_reference,'')) then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    select round(total * 100)::integer into total_cents from public.orders where id=p_order_id and restaurant_id=p_restaurant_id;
    select coalesce(sum(amount_cents),0) into paid_cents from public.payments where restaurant_id=p_restaurant_id and order_id=p_order_id and status='completed';
    return jsonb_build_object('payment_id',payment_row.id,'amount_cents',payment_row.amount_cents,'paid_cents',paid_cents,'remaining_cents',greatest(0,total_cents-paid_cents),'payment_status',case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end,'idempotent_replay',true);
  end if;
  if target_order.status in ('completed','paid','voided','cancelled') or target_order.payment_status='paid' then raise exception 'PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER'; end if;
  select round(target_order.total*100)::integer into total_cents;
  select coalesce(sum(amount_cents),0) into paid_cents from public.payments where restaurant_id=p_restaurant_id and order_id=p_order_id and status='completed';
  if p_amount_cents > total_cents-paid_cents then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;
  if p_split_bill_id is not null then
    select total_cents into split_total_cents from public.split_bills where id=p_split_bill_id and restaurant_id=p_restaurant_id and order_id=p_order_id for update;
    if split_total_cents is null then raise exception 'SPLIT_BILL_NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into split_paid_cents from public.payments where split_bill_id=p_split_bill_id and status='completed';
    if p_amount_cents > split_total_cents-split_paid_cents then raise exception 'PAYMENT_EXCEEDS_SPLIT_BALANCE'; end if;
  end if;
  insert into public.payments(restaurant_id,order_id,split_bill_id,amount_cents,payment_method,note,idempotency_key,recorded_by,cash_received_cents,change_given_cents,payment_reference,rounding_adjustment_cents)
  values(p_restaurant_id,p_order_id,p_split_bill_id,p_amount_cents,p_method,coalesce(p_note,''),p_idempotency_key,auth.uid(),p_cash_received_cents,p_change_given_cents,nullif(trim(p_reference),''),0)
  returning * into payment_row;
  paid_cents := paid_cents+p_amount_cents;
  if p_split_bill_id is not null then
    split_paid_cents := split_paid_cents+p_amount_cents;
    update public.split_bills set paid_cents=split_paid_cents,status=case when split_paid_cents>=split_total_cents then 'paid' when split_paid_cents>0 then 'partial' else 'unpaid' end where id=p_split_bill_id;
  end if;
  update public.orders set payment_status=case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end,status=case when paid_cents>=total_cents then 'completed' else status end,paid_at=case when paid_cents>=total_cents then coalesce(paid_at,now()) else paid_at end,closed_at=case when paid_cents>=total_cents then coalesce(closed_at,now()) else closed_at end,payment_method=case when paid_cents>=total_cents then p_method else payment_method end where id=p_order_id;
  return jsonb_build_object('payment_id',payment_row.id,'amount_cents',p_amount_cents,'paid_cents',paid_cents,'remaining_cents',total_cents-paid_cents,'payment_status',case when paid_cents>=total_cents then 'paid' when paid_cents>0 then 'partial' else 'unpaid' end);
end $$;

revoke all on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text) from public;
grant execute on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text) to authenticated;

notify pgrst, 'reload schema';
