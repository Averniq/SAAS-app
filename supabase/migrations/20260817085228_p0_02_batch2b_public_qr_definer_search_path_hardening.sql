-- P0-02 Batch 2B: harden only the approved public QR SECURITY DEFINER
-- functions. Preconditions deliberately fail closed on catalog drift.

begin;

create temporary table p0_02_batch2b_function_contract (
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
    'public.get_public_restaurant(text,text)'::regprocedure,
    'public.submit_order(uuid,uuid,text,text,jsonb,text)'::regprocedure,
    'public.get_customer_order_status(uuid,text,text)'::regprocedure
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
       or not has_function_privilege('anon', target, 'EXECUTE')
       or not has_function_privilege('authenticated', target, 'EXECUTE')
       or has_function_privilege('service_role', target, 'EXECUTE')
       or exists (
         select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where p.oid = target
           and privilege.privilege_type = 'EXECUTE'
           and privilege.grantee not in ('postgres'::regrole::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
       )
    then
      raise exception 'P0_02_BATCH2B_UNRECOGNIZED_PRESTATE: %', target;
    end if;

    insert into p0_02_batch2b_function_contract
      (oid, prosrc, prolang, provolatile, prorettype, proargtypes, proowner, prosecdef, proacl)
    select p.oid, p.prosrc, p.prolang, p.provolatile, p.prorettype, p.proargtypes, p.proowner, p.prosecdef, p.proacl
    from pg_proc p
    where p.oid = target;
  end loop;
end;
$$;

alter function public.get_public_restaurant(text, text) set search_path to public, pg_temp;
alter function public.submit_order(uuid, uuid, text, text, jsonb, text) set search_path to public, pg_temp;
alter function public.get_customer_order_status(uuid, text, text) set search_path to public, pg_temp;

do $$
begin
  if exists (
    select 1
    from p0_02_batch2b_function_contract expected
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
    raise exception 'P0_02_BATCH2B_POSTSTATE_CONTRACT_MISMATCH';
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
