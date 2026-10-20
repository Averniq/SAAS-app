-- Batch 14 local regression assertions.
-- Read-only catalog checks plus rollback-safe behavioral probes.
\set ON_ERROR_STOP on

begin;

-- Group 1: exact role vocabulary and core RLS/ACL contract.
do $$
declare
  actual_roles text[];
  expected_roles text[] := array['attendance','cashier','kitchen','manager','owner','staff','waitstaff'];
  constraint_roles text[];
  policy_record text;
begin
  foreach policy_record in array array[
    'public.restaurant_staff.restaurant_staff_role_check',
    'public.restaurant_invites.restaurant_invites_role_check'
  ]
  loop
    select array_agg(match[1] order by match[1])
      into constraint_roles
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') match
     where n.nspname || '.' || t.relname || '.' || c.conname = policy_record;
    if constraint_roles is distinct from expected_roles then
      raise exception 'ROLE_CONTRACT_MISMATCH: %, got %', policy_record, constraint_roles;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.restaurants', 'update')
     or not has_table_privilege('authenticated', 'public.restaurants', 'select')
     or not has_table_privilege('authenticated', 'public.restaurant_staff', 'select')
     or not has_table_privilege('authenticated', 'public.orders', 'select')
     or has_table_privilege('authenticated', 'public.orders', 'update')
  then
    raise exception 'GROUP1_TABLE_ACL_MISMATCH';
  end if;

  if exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='restaurants' and p.polname='authenticated update allowed restaurants'
  ) then
    raise exception 'OBSOLETE_RESTAURANTS_UPDATE_POLICY_PRESENT';
  end if;

  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='restaurants' and p.polname='owners and platform admins update restaurants'
      and p.polcmd='w' and pg_get_expr(p.polqual,p.polrelid) like '%has_restaurant_role%' and pg_get_expr(p.polwithcheck,p.polrelid) like '%is_platform_admin%'
  ) then
    raise exception 'RESTAURANTS_OWNER_PLATFORM_ADMIN_POLICY_MISSING_OR_WRONG';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('restaurants','restaurant_staff','restaurant_invites','orders') and not c.relrowsecurity
  ) then
    raise exception 'GROUP1_RLS_DISABLED';
  end if;
end $$;

-- Group 2: signatures, owner, SECURITY DEFINER, path, and authenticated EXECUTE.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.list_restaurant_team(uuid)',
    'public.revoke_restaurant_invite(uuid)',
    'public.update_restaurant_order_status(uuid,uuid,text)'
  ]
  loop
    if not exists (
      select 1 from pg_proc p
      where p.oid=sig::regprocedure and p.prosecdef
        and pg_get_userbyid(p.proowner)='postgres'
        and p.proconfig @> array['search_path=public, pg_temp']
        and not (p.proconfig @> array['search_path="public, pg_temp"'])
    ) then
      raise exception 'GROUP2_FUNCTION_CONFIG_MISMATCH: %', sig;
    end if;
    if not has_function_privilege('authenticated', sig::regprocedure, 'execute')
       or has_function_privilege('anon', sig::regprocedure, 'execute') then
      raise exception 'GROUP2_FUNCTION_ACL_MISMATCH: %', sig;
    end if;
  end loop;
end $$;

-- Group 3: status, printer objects, exact queue predicate, and contract ACLs.
do $$
declare
  accepted_statuses text[];
  expected_statuses text[] := array['cancelled','completed','confirmed','draft','kitchen_accepted','new','paid','preparing','ready','voided'];
  claim_definition text;
  index_predicate text;
begin
  select array_agg(match[1] order by match[1]) into accepted_statuses
  from pg_constraint c
  cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') match
  where c.conrelid='public.orders'::regclass and c.conname='orders_status_check';
  if accepted_statuses is distinct from expected_statuses then
    raise exception 'ORDERS_STATUS_CONTRACT_MISMATCH: %', accepted_statuses;
  end if;

  if not exists (
    select 1
    from pg_attribute a
    join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.orders'::regclass
      and a.attname='kitchen_print_attempts'
      and a.attnotnull
      and pg_get_expr(d.adbin,d.adrelid)='0'
  ) then
    raise exception 'KITCHEN_PRINT_ATTEMPTS_COLUMN_MISMATCH';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid='public.orders'::regclass and a.attname in ('kitchen_printed_at','kitchen_print_claimed_at','kitchen_print_error','kitchen_print_claim_token','kitchen_print_claimed_by') and not a.attisdropped) <> 5 then
    raise exception 'KITCHEN_PRINT_COLUMNS_MISSING';
  end if;

  select pg_get_functiondef('public.claim_kitchen_print_job(text)'::regprocedure) into claim_definition;
  if claim_definition not like '%public.tables%'
     or claim_definition like '%public.restaurant_tables%'
     or claim_definition not like '%''new'', ''preparing''%'
     or claim_definition like '%''New''%'
     or claim_definition like '%''Preparing''%'
     or claim_definition not like '%claim_token%'
     or claim_definition not like '%kitchen_print_claimed_by%'
  then
    raise exception 'KITCHEN_CLAIM_DEFINITION_MISMATCH';
  end if;

  select pg_get_expr(i.indpred,i.indrelid) into index_predicate
  from pg_index i join pg_class c on c.oid=i.indexrelid
  where c.oid='public.orders_kitchen_print_queue_idx'::regclass;
  if index_predicate not like '%''new''%' or index_predicate not like '%''preparing''%'
     or index_predicate like '%''New''%' or index_predicate like '%''Preparing''%'
     or not (select indisvalid and indisready and indislive from pg_index i join pg_class c on c.oid=i.indexrelid where c.oid='public.orders_kitchen_print_queue_idx'::regclass)
  then
    raise exception 'KITCHEN_QUEUE_INDEX_MISMATCH: %', index_predicate;
  end if;

  if not exists (select 1 from pg_proc p where p.oid='public.claim_kitchen_print_job(text)'::regprocedure and p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=public, pg_temp'])
     or not exists (select 1 from pg_proc p where p.oid='public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure and p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=public, pg_temp'])
     or to_regprocedure('public.finish_kitchen_print_job(uuid,boolean,text)') is not null
     or not has_function_privilege('authenticated','public.claim_kitchen_print_job(text)'::regprocedure,'execute')
     or not has_function_privilege('authenticated','public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure,'execute')
     or has_function_privilege('anon','public.claim_kitchen_print_job(text)'::regprocedure,'execute')
     or has_function_privilege('anon','public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure,'execute')
  then
    raise exception 'KITCHEN_FUNCTION_CONTRACT_MISMATCH';
  end if;
end $$;

rollback;
