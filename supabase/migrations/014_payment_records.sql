-- Front-desk payment audit fields. Tenant and staff RLS remains unchanged.
alter table public.orders
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('Cash', 'Card', 'EFTPOS', 'Other'));

create index if not exists orders_restaurant_paid_at_idx
  on public.orders (restaurant_id, paid_at desc)
  where paid_at is not null;
