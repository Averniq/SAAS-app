-- Post-UAT, pre-production database security hardening.
--
-- Trigger functions are invoked by PostgreSQL as part of their owning table
-- operation; callers do not require EXECUTE on the trigger function itself.

begin;

revoke execute on function public.capture_self_service_registration()
  from public, anon, authenticated;
revoke execute on function public.enforce_restaurant_live_order_entitlement()
  from public, anon, authenticated;
revoke execute on function public.order_payment_audit_trigger()
  from public, anon, authenticated;

-- Every application-owned SECURITY DEFINER function must have a fixed path.
-- Preserve each function's audited path exactly: some functions deliberately
-- use an empty path, while others require extensions or pg_temp.
do $$
declare
  function_record record;
begin
  for function_record in
    select
      p.oid,
      substring(config.setting from length('search_path=') + 1) as search_path
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join lateral (
      select setting
      from unnest(coalesce(p.proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    ) config on true
    where n.nspname = 'public'
      and p.prosecdef
  loop
    if function_record.search_path is null then
      raise exception 'SECURITY DEFINER function % has no fixed search_path',
        function_record.oid::regprocedure;
    end if;

    execute format(
      'alter function %s set search_path to %L',
      function_record.oid::regprocedure,
      function_record.search_path
    );
  end loop;
end;
$$;

-- Fail closed if a privilege or trigger attachment is unexpectedly absent.
do $$
declare
  function_oid regprocedure;
  trigger_is_attached boolean;
begin
  foreach function_oid in array array[
    'public.capture_self_service_registration()'::regprocedure,
    'public.enforce_restaurant_live_order_entitlement()'::regprocedure,
    'public.order_payment_audit_trigger()'::regprocedure
  ]
  loop
    if has_function_privilege('anon', function_oid, 'execute')
       or has_function_privilege('authenticated', function_oid, 'execute') then
      raise exception 'Internal trigger function % remains directly executable', function_oid;
    end if;
  end loop;

  select count(*) = 3 into trigger_is_attached
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and (
      (t.tgrelid = 'auth.users'::regclass
       and t.tgname = 'capture_self_service_registration'
       and p.oid = 'public.capture_self_service_registration()'::regprocedure)
      or (t.tgrelid = 'public.orders'::regclass
          and t.tgname = 'enforce_restaurant_live_order_entitlement'
          and p.oid = 'public.enforce_restaurant_live_order_entitlement()'::regprocedure)
      or (t.tgrelid = 'public.payments'::regclass
          and t.tgname = 'payments_audit_append_only'
          and p.oid = 'public.order_payment_audit_trigger()'::regprocedure)
    );

  if not trigger_is_attached then
    raise exception 'Expected internal trigger attachment is missing';
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
