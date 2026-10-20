-- Group 5 catalog assertions for the approved 18-migration canonical chain.
-- These checks are read-only and are intended to run inside a transaction.
\set ON_ERROR_STOP on

begin;

do $$
declare
  roles text[];
  fn regprocedure;
  policy_count integer;
begin
  select array_agg(match[1] order by match[1]) into roles
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') match
  where n.nspname = 'public' and t.relname = 'restaurant_staff' and c.conname = 'restaurant_staff_role_check';
  if roles is distinct from array['attendance','cashier','kitchen','manager','owner','staff','waitstaff'] then raise exception 'B17_ROLE_VOCABULARY_MISMATCH: %', roles; end if;

  select count(*) into policy_count from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='restaurants' and p.polcmd='w' and p.polname='owners and platform admins update restaurants';
  if policy_count <> 1 or exists (select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='restaurants' and p.polcmd='w' and p.polname in ('authenticated update allowed restaurants','platform admins update restaurants')) then raise exception 'B17_RESTAURANTS_UPDATE_POLICY_MISMATCH'; end if;
  if not has_table_privilege('authenticated','public.restaurants','UPDATE') or has_table_privilege('authenticated','public.orders','UPDATE') then raise exception 'B17_TABLE_ACL_MISMATCH'; end if;

  foreach fn in array array['public.list_restaurant_team(uuid)'::regprocedure,'public.revoke_restaurant_invite(uuid)'::regprocedure,'public.update_restaurant_order_status(uuid,uuid,text)'::regprocedure] loop
    if not exists (select 1 from pg_proc p where p.oid=fn and p.prosecdef and p.proowner=(select oid from pg_roles where rolname='postgres') and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=public, pg_temp%') then raise exception 'B17_DEFINER_CONTRACT_MISMATCH: %', fn; end if;
    if not has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') then raise exception 'B17_DEFINER_ACL_MISMATCH: %', fn; end if;
  end loop;

  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='orders_kitchen_print_queue_idx' and indexdef like '%''new''%' and indexdef like '%''preparing''%') then raise exception 'B17_QUEUE_INDEX_MISMATCH'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='kitchen_print_claim_token') then raise exception 'B17_CLAIM_TOKEN_COLUMN_MISSING'; end if;
  if to_regprocedure('public.finish_kitchen_print_job(uuid,uuid,boolean,text)') is null or to_regprocedure('public.finish_kitchen_print_job(uuid,boolean,text)') is not null then raise exception 'B17_FINISH_SIGNATURE_MISMATCH'; end if;
  if not has_function_privilege('authenticated','public.claim_kitchen_print_job(text)'::regprocedure,'EXECUTE') or has_function_privilege('anon','public.claim_kitchen_print_job(text)'::regprocedure,'EXECUTE') or not has_function_privilege('authenticated','public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure,'EXECUTE') or has_function_privilege('anon','public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure,'EXECUTE') then raise exception 'B17_KITCHEN_RPC_ACL_MISMATCH'; end if;
end $$;

rollback;
