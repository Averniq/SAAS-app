-- P0-02 Batch 2A: harden only the approved authenticated SECURITY DEFINER
-- functions. The precondition checks deliberately fail closed on catalog drift.

begin;

create temporary table p0_02_batch2a_function_contract (
  oid oid primary key,
  prosrc text not null,
  prolang oid not null,
  provolatile "char" not null,
  prorettype oid not null,
  proargtypes oidvector not null,
  proowner oid not null,
  prosecdef boolean not null,
  proacl aclitem[]
) on commit drop;

do $$
declare
  target regprocedure;
  target_name text;
begin
  foreach target in array array[
    'public.is_restaurant_staff(uuid)'::regprocedure,
    'public.has_restaurant_role(uuid,text[])'::regprocedure,
    'public.create_restaurant_for_owner(text,text,text,text,text,text)'::regprocedure,
    'public.create_restaurant_tables(uuid,integer)'::regprocedure,
    'public.is_platform_admin()'::regprocedure,
    'public.platform_create_restaurant(text,text,text,text,integer)'::regprocedure,
    'public.can_manage_restaurant_staff(uuid)'::regprocedure,
    'public.accept_restaurant_invite(uuid)'::regprocedure,
    'public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure
  ]
  loop
    select p.proname into target_name
    from pg_proc p
    where p.oid = target;

    if to_regprocedure(target::text) is distinct from target
       or not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where p.oid = target
           and n.nspname = 'public'
           and pg_get_userbyid(p.proowner) = 'postgres'
           and p.prosecdef
           and p.proconfig = array['search_path=public']
       )
       or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = target_name) <> 1
       or not has_function_privilege('authenticated', target, 'EXECUTE')
       or has_function_privilege('anon', target, 'EXECUTE')
       or has_function_privilege('service_role', target, 'EXECUTE')
       or exists (
         select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where p.oid = target
           and privilege.privilege_type = 'EXECUTE'
           and privilege.grantee not in ('postgres'::regrole::oid, 'authenticated'::regrole::oid)
       )
    then
      raise exception 'P0_02_BATCH2A_UNRECOGNIZED_PRESTATE: %', target;
    end if;

    insert into p0_02_batch2a_function_contract
      (oid, prosrc, prolang, provolatile, prorettype, proargtypes, proowner, prosecdef, proacl)
    select p.oid, p.prosrc, p.prolang, p.provolatile, p.prorettype, p.proargtypes, p.proowner, p.prosecdef, p.proacl
    from pg_proc p
    where p.oid = target;
  end loop;
end;
$$;

alter function public.is_restaurant_staff(uuid) set search_path to public, pg_temp;
alter function public.has_restaurant_role(uuid, text[]) set search_path to public, pg_temp;
alter function public.create_restaurant_for_owner(text, text, text, text, text, text) set search_path to public, pg_temp;
alter function public.create_restaurant_tables(uuid, integer) set search_path to public, pg_temp;
alter function public.is_platform_admin() set search_path to public, pg_temp;
alter function public.platform_create_restaurant(text, text, text, text, integer) set search_path to public, pg_temp;
alter function public.can_manage_restaurant_staff(uuid) set search_path to public, pg_temp;
alter function public.accept_restaurant_invite(uuid) set search_path to public, pg_temp;
alter function public.record_restaurant_order_payment(uuid, uuid, text) set search_path to public, pg_temp;

do $$
begin
  if exists (
    select 1
    from p0_02_batch2a_function_contract expected
    join pg_proc p on p.oid = expected.oid
    where p.prosrc is distinct from expected.prosrc
       or p.prolang is distinct from expected.prolang
       or p.provolatile is distinct from expected.provolatile
       or p.prorettype is distinct from expected.prorettype
       or p.proargtypes is distinct from expected.proargtypes
       or p.proowner is distinct from expected.proowner
       or p.prosecdef is distinct from expected.prosecdef
       or p.proacl is distinct from expected.proacl
       or p.proconfig is distinct from array['search_path=public, pg_temp']
  ) then
    raise exception 'P0_02_BATCH2A_POSTSTATE_CONTRACT_MISMATCH';
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
