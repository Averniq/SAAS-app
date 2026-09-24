-- LOCAL-ONLY candidate for the verified Production legacy-three surface.
-- This preserves signatures, owners, SECURITY DEFINER, search_path, ACLs, and
-- payment/split/void behavior. It changes only membership authorization:
-- missing membership fails closed and staff loses payment mutation authority.
do $legacy_payment_authorization$
declare
  target record;
  definition text;
  replacement text;
  guard_pattern text;
  match_count integer;
  expected text[] := array[
    'record_restaurant_order_payment(uuid,uuid,text)',
    'record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)',
    'void_restaurant_payment(uuid,uuid,text)'
  ];
  matched integer := 0;
  named_count integer;
begin
  select count(*) into named_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'record_restaurant_order_payment',
      'record_restaurant_payment',
      'void_restaurant_payment'
    );
  if named_count <> cardinality(expected) then
    raise exception 'LEGACY_PAYMENT_INVENTORY_DRIFT: expected %, found %', cardinality(expected), named_count;
  end if;

  for target in
    select p.oid, p.proname, p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname = 'record_restaurant_order_payment' and pg_get_function_identity_arguments(p.oid) = 'p_restaurant_id uuid, p_order_id uuid, p_method text')
        or (p.proname = 'record_restaurant_payment' and pg_get_function_identity_arguments(p.oid) = 'p_restaurant_id uuid, p_order_id uuid, p_amount_cents integer, p_method text, p_note text, p_split_bill_id uuid, p_idempotency_key uuid, p_cash_received_cents integer, p_change_given_cents integer, p_reference text')
        or (p.proname = 'void_restaurant_payment' and pg_get_function_identity_arguments(p.oid) = 'p_restaurant_id uuid, p_payment_id uuid, p_reason text')
      )
  loop
    definition := pg_get_functiondef(target.oid);
    replacement := definition;

    if definition ~ 'target_role\s+is\s+null\s+OR\s+target_role\s+not\s+in' then
      null;
    elsif target.proname in ('record_restaurant_order_payment', 'record_restaurant_payment') then
      guard_pattern := 'target_role\s+not\s+in\s*\(\s*''owner''\s*,\s*''manager''\s*,\s*''staff''\s*,\s*''cashier''\s*\)';
      match_count := regexp_count(definition, guard_pattern);
      if match_count <> 1 then raise exception 'LEGACY_PAYMENT_AUTHORIZATION_GUARD_DRIFT: %', target.signature; end if;
      replacement := regexp_replace(
        replacement,
        guard_pattern,
        'target_role is null OR target_role not in (''owner'', ''manager'', ''cashier'')',
        'g'
      );
    else
      guard_pattern := 'target_role\s+not\s+in\s*\(\s*''owner''\s*,\s*''manager''\s*\)';
      match_count := regexp_count(definition, guard_pattern);
      if match_count <> 1 then raise exception 'LEGACY_PAYMENT_AUTHORIZATION_GUARD_DRIFT: %', target.signature; end if;
      replacement := regexp_replace(
        replacement,
        guard_pattern,
        'target_role is null OR target_role not in (''owner'', ''manager'')',
        'g'
      );
    end if;

    if replacement = definition then
      if definition !~ 'target_role is null OR target_role not in' then
        raise exception 'LEGACY_PAYMENT_AUTHORIZATION_GUARD_DRIFT: %', target.signature;
      end if;
    else
      execute replacement;
    end if;
    matched := matched + 1;
  end loop;

  if matched <> cardinality(expected) then
    raise exception 'LEGACY_PAYMENT_SIGNATURE_DRIFT: expected %, found %', cardinality(expected), matched;
  end if;
end
$legacy_payment_authorization$;
