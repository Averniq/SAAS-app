-- P0-02 Batch 2B catalog assertions. All checks are rollback-safe.
\set ON_ERROR_STOP on

begin;

do $$
declare
  expected record;
  target_fn regprocedure;
  target_name text;
begin
  for expected in
    select * from (values
      ('public.get_public_restaurant(text,text)', 'plpgsql', 's'),
      ('public.submit_order(uuid,uuid,text,text,jsonb,text)', 'plpgsql', 'v'),
      ('public.get_customer_order_status(uuid,text,text)', 'sql', 's')
    ) as targets(signature, language_name, volatility)
  loop
    target_fn := to_regprocedure(expected.signature);
    if target_fn is null then
      raise exception 'B2B_TARGET_MISSING: %', expected.signature;
    end if;

    select p.proname into target_name from pg_proc p where p.oid = target_fn;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = target_name) <> 1 then
      raise exception 'B2B_OBSOLETE_OR_DUPLICATE_OVERLOAD: %', expected.signature;
    end if;

    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.oid = target_fn
        and n.nspname = 'public'
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.prosecdef
        and p.proconfig = array['search_path=public, pg_temp']
        and (select l.lanname from pg_language l where l.oid = p.prolang) = expected.language_name
        and p.provolatile = expected.volatility
    ) then
      raise exception 'B2B_FUNCTION_CONTRACT_MISMATCH: %', expected.signature;
    end if;

    -- P0-04 retires these legacy public entry points. Keep the P0-02
    -- definer/search-path verification, but assert their forward ACL state.
    if has_function_privilege('anon', target_fn, 'EXECUTE')
       or has_function_privilege('authenticated', target_fn, 'EXECUTE')
       or has_function_privilege('service_role', target_fn, 'EXECUTE')
       or exists (
         select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where p.oid = target_fn
           and privilege.privilege_type = 'EXECUTE'
           and privilege.grantee not in ('postgres'::regrole::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
       ) then
      raise exception 'B2B_FUNCTION_ACL_MISMATCH: %', expected.signature;
    end if;
  end loop;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef) < 18
     or exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef
         and p.proconfig is distinct from array['search_path=public, pg_temp']
     )
     or exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef
         and p.proconfig = array['search_path=public']
     )
     or exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral unnest(coalesce(p.proconfig, array[]::text[])) setting
       where n.nspname = 'public'
         and p.prosecdef
         and setting = 'search_path="public, pg_temp"'
     ) then
    raise exception 'B2B_CANONICAL_DEFINER_PATH_CONTRACT_MISMATCH';
  end if;
end;
$$;

rollback;
