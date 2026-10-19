-- P0-02 Batch 2A catalog assertions. All checks are rollback-safe.
\set ON_ERROR_STOP on

begin;

do $$
declare
  expected record;
  target regprocedure;
  target_name text;
begin
  for expected in
    select * from (values
      ('public.is_restaurant_staff(uuid)', 'sql', 's'),
      ('public.has_restaurant_role(uuid,text[])', 'sql', 's'),
      ('public.create_restaurant_for_owner(text,text,text,text,text,text)', 'plpgsql', 'v'),
      ('public.create_restaurant_tables(uuid,integer)', 'plpgsql', 'v'),
      ('public.is_platform_admin()', 'sql', 's'),
      ('public.platform_create_restaurant(text,text,text,text,integer)', 'plpgsql', 'v'),
      ('public.can_manage_restaurant_staff(uuid)', 'sql', 's'),
      ('public.accept_restaurant_invite(uuid)', 'plpgsql', 'v'),
      ('public.record_restaurant_order_payment(uuid,uuid,text)', 'plpgsql', 'v')
    ) as targets(signature, language_name, volatility)
  loop
    target := to_regprocedure(expected.signature);
    if target is null then
      raise exception 'B2A_TARGET_MISSING: %', expected.signature;
    end if;

    select proname into target_name from pg_proc where oid = target;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = target_name) <> 1 then
      raise exception 'B2A_OBSOLETE_OR_DUPLICATE_OVERLOAD: %', expected.signature;
    end if;

    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.oid = target
        and n.nspname = 'public'
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.prosecdef
        and p.proconfig = array['search_path=public, pg_temp']
        and (select l.lanname from pg_language l where l.oid = p.prolang) = expected.language_name
        and p.provolatile = expected.volatility
    ) then
      raise exception 'B2A_FUNCTION_CONTRACT_MISMATCH: %', expected.signature;
    end if;

    if (expected.signature <> 'public.record_restaurant_order_payment(uuid,uuid,text)'
          and not has_function_privilege('authenticated', target, 'EXECUTE'))
       or has_function_privilege('anon', target, 'EXECUTE')
       or has_function_privilege('service_role', target, 'EXECUTE')
       or exists (
         select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where p.oid = target
           and privilege.privilege_type = 'EXECUTE'
           and privilege.grantee not in ('postgres'::regrole::oid, 'authenticated'::regrole::oid)
       ) then
      raise exception 'B2A_FUNCTION_ACL_MISMATCH: %', expected.signature;
    end if;

    if expected.signature = 'public.record_restaurant_order_payment(uuid,uuid,text)'
       and has_function_privilege('authenticated', target, 'EXECUTE') then
      raise exception 'B2A_REVOKED_LEGACY_PAYMENT_RPC_STILL_EXECUTABLE';
    end if;
  end loop;

  if exists (
    select 1
    from unnest(array[
      'public.is_restaurant_staff(uuid)'::regprocedure,
      'public.has_restaurant_role(uuid,text[])'::regprocedure,
      'public.create_restaurant_for_owner(text,text,text,text,text,text)'::regprocedure,
      'public.create_restaurant_tables(uuid,integer)'::regprocedure,
      'public.is_platform_admin()'::regprocedure,
      'public.platform_create_restaurant(text,text,text,text,integer)'::regprocedure,
      'public.can_manage_restaurant_staff(uuid)'::regprocedure,
      'public.accept_restaurant_invite(uuid)'::regprocedure,
      'public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure
    ]) as candidate(target_fn)
    join pg_proc p on p.oid = candidate.target_fn
    where p.proconfig = array['search_path=public']
  ) then
    raise exception 'B2A_PUBLIC_ONLY_PATH_REMAINS';
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.list_restaurant_team(uuid)'::regprocedure,
      'public.revoke_restaurant_invite(uuid)'::regprocedure,
      'public.update_restaurant_order_status(uuid,uuid,text)'::regprocedure
    ]) as candidate(target_fn)
    join pg_proc p on p.oid = candidate.target_fn
    where pg_get_userbyid(p.proowner) <> 'postgres'
       or not p.prosecdef
       or p.proconfig is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('authenticated', candidate.target_fn, 'EXECUTE')
       or has_function_privilege('anon', candidate.target_fn, 'EXECUTE')
       or has_function_privilege('service_role', candidate.target_fn, 'EXECUTE')
       or exists (
         select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where privilege.privilege_type = 'EXECUTE'
           and privilege.grantee not in ('postgres'::regrole::oid, 'authenticated'::regrole::oid)
       )
  ) then
    raise exception 'B2A_P0_01D_GROUP2_REGRESSION';
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.get_public_restaurant(text,text)'::regprocedure,
      'public.submit_order(uuid,uuid,text,text,jsonb,text)'::regprocedure,
      'public.get_customer_order_status(uuid,text,text)'::regprocedure
    ]) as candidate(target_fn)
    join pg_proc p on p.oid = candidate.target_fn
    where p.proconfig is distinct from array['search_path=public, pg_temp']
       or has_function_privilege('anon', candidate.target_fn, 'EXECUTE')
       or has_function_privilege('authenticated', candidate.target_fn, 'EXECUTE')
       or has_function_privilege('service_role', candidate.target_fn, 'EXECUTE')
       or exists (
         select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where privilege.privilege_type = 'EXECUTE'
         and privilege.grantee not in ('postgres'::regrole::oid)
       )
  ) then
    raise exception 'B2A_PUBLIC_QR_CONTRACT_CHANGED';
  end if;
end;
$$;

rollback;
