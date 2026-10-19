-- Phase 1 attendance. Shifts are immutable in spirit: manager corrections are
-- captured as audit events instead of silently replacing the original record.
create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  clock_in_location text not null default '',
  clock_in_device text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out_at is null or clock_out_at >= clock_in_at)
);

create table if not exists public.staff_shift_breaks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.staff_shifts(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.staff_shift_audit_log (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.staff_shifts(id) on delete cascade,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null default '',
  before_value jsonb not null default '{}'::jsonb,
  after_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists staff_shifts_one_open_shift_idx on public.staff_shifts(restaurant_id, staff_user_id) where clock_out_at is null;
create index if not exists staff_shifts_restaurant_clock_in_idx on public.staff_shifts(restaurant_id, clock_in_at desc);
create index if not exists staff_shift_breaks_shift_idx on public.staff_shift_breaks(shift_id, started_at);
create index if not exists staff_shift_audit_log_shift_idx on public.staff_shift_audit_log(shift_id, created_at desc);

create trigger staff_shifts_updated_at before update on public.staff_shifts for each row execute function public.set_updated_at();

alter table public.staff_shifts enable row level security;
alter table public.staff_shift_breaks enable row level security;
alter table public.staff_shift_audit_log enable row level security;

create policy "staff read restaurant shifts" on public.staff_shifts for select to authenticated using (public.is_restaurant_staff(restaurant_id));
create policy "staff start own shift" on public.staff_shifts for insert to authenticated with check (staff_user_id = auth.uid() and public.is_restaurant_staff(restaurant_id));
create policy "staff end own shift or managers edit" on public.staff_shifts for update to authenticated using (staff_user_id = auth.uid() or public.has_restaurant_role(restaurant_id,array['owner','manager'])) with check (staff_user_id = auth.uid() or public.has_restaurant_role(restaurant_id,array['owner','manager']));
create policy "staff read own shift breaks" on public.staff_shift_breaks for select to authenticated using (exists(select 1 from public.staff_shifts s where s.id=shift_id and public.is_restaurant_staff(s.restaurant_id)));
create policy "staff manage own shift breaks" on public.staff_shift_breaks for all to authenticated using (exists(select 1 from public.staff_shifts s where s.id=shift_id and (s.staff_user_id=auth.uid() or public.has_restaurant_role(s.restaurant_id,array['owner','manager'])))) with check (exists(select 1 from public.staff_shifts s where s.id=shift_id and (s.staff_user_id=auth.uid() or public.has_restaurant_role(s.restaurant_id,array['owner','manager']))));
create policy "managers read shift audit" on public.staff_shift_audit_log for select to authenticated using (exists(select 1 from public.staff_shifts s where s.id=shift_id and public.has_restaurant_role(s.restaurant_id,array['owner','manager'])));
create policy "staff write own audit" on public.staff_shift_audit_log for insert to authenticated with check (changed_by_user_id=auth.uid() and exists(select 1 from public.staff_shifts s where s.id=shift_id and (s.staff_user_id=auth.uid() or public.has_restaurant_role(s.restaurant_id,array['owner','manager']))));

notify pgrst, 'reload schema';
