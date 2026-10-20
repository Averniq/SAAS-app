-- P0-01D Batch 14 Group 2: repair only the three verified malformed
-- SECURITY DEFINER function-local search_path configurations.
-- Bodies, signatures, ownership, and EXECUTE ACLs are intentionally untouched.

begin;

do $$
declare
  target regprocedure;
  current_path text;
begin
  foreach target in array array[
    'public.list_restaurant_team(uuid)'::regprocedure,
    'public.revoke_restaurant_invite(uuid)'::regprocedure,
    'public.update_restaurant_order_status(uuid,uuid,text)'::regprocedure
  ]
  loop
    select setting into current_path
    from pg_proc p
    cross join lateral unnest(coalesce(p.proconfig, array[]::text[])) setting
    where p.oid = target
      and setting like 'search_path=%';

    if current_path is distinct from 'search_path=public'
       and current_path is distinct from 'search_path="public, pg_temp"'
       and current_path is distinct from 'search_path=public, pg_temp'
    then
      raise exception 'UNRECOGNIZED_SECURITY_DEFINER_PATH: % has %', target, current_path;
    end if;

    if not exists (
      select 1
      from pg_proc p
      where p.oid = target
        and p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
    ) then
      raise exception 'UNRECOGNIZED_SECURITY_DEFINER_CONTRACT: %', target;
    end if;
  end loop;
end;
$$;

alter function public.list_restaurant_team(uuid) set search_path to public, pg_temp;
alter function public.revoke_restaurant_invite(uuid) set search_path to public, pg_temp;
alter function public.update_restaurant_order_status(uuid, uuid, text) set search_path to public, pg_temp;

commit;

notify pgrst, 'reload schema';
