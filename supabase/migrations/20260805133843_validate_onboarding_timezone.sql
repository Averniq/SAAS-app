-- Use PostgreSQL's IANA timezone catalogue as the trusted validation boundary.
create or replace function public.assert_valid_restaurant_timezone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_restaurant_timezone on public.restaurants;
create trigger validate_restaurant_timezone
before insert or update of timezone on public.restaurants
for each row execute function public.assert_valid_restaurant_timezone();

revoke all on function public.assert_valid_restaurant_timezone() from public, anon, authenticated;
notify pgrst, 'reload schema';
