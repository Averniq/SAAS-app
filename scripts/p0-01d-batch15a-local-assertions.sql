-- Batch 15A regression assertions. All fixture data is rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid();
  restaurant_a uuid := gen_random_uuid();
  restaurant_b uuid := gen_random_uuid();
  table_a uuid := gen_random_uuid();
  table_b uuid := gen_random_uuid();
  order_printed uuid := gen_random_uuid();
  order_unclaimed uuid := gen_random_uuid();
  order_reclaimed uuid := gen_random_uuid();
  order_cross_tenant uuid := gen_random_uuid();
  order_failed uuid := gen_random_uuid();
  first_claim jsonb;
  second_claim jsonb;
  failure_claim jsonb;
  token_a uuid;
  token_b uuid;
  token_failure uuid;
  did_finish boolean;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (user_a, 'authenticated', 'authenticated', 'batch15a-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (user_b, 'authenticated', 'authenticated', 'batch15a-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (user_c, 'authenticated', 'authenticated', 'batch15a-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.restaurants (id, owner_user_id, name, slug, restaurant_type, address, phone)
  values
    (restaurant_a, user_a, 'Batch 15A A', 'batch-15a-a', 'Test', '', ''),
    (restaurant_b, user_b, 'Batch 15A B', 'batch-15a-b', 'Test', '', '');
  insert into public.restaurant_staff (restaurant_id, user_id, role)
  values
    (restaurant_a, user_a, 'kitchen'),
    (restaurant_b, user_b, 'kitchen'),
    (restaurant_a, user_c, 'kitchen');
  insert into public.tables (id, restaurant_id, table_number, table_name, local_id, name, table_token)
  values
    (table_a, restaurant_a, 1, 'A1', 'a1', 'A1', 'batch-15a-a1'),
    (table_b, restaurant_b, 1, 'B1', 'b1', 'B1', 'batch-15a-b1');
  insert into public.orders (id, restaurant_id, table_id, status, subtotal, total, local_id, created_at)
  values
    (order_printed, restaurant_a, table_a, 'new', 0, 0, 'printed', now()),
    (order_reclaimed, restaurant_a, table_a, 'new', 0, 0, 'reclaimed', now() + interval '1 second'),
    (order_cross_tenant, restaurant_a, table_a, 'new', 0, 0, 'cross', now() + interval '2 seconds'),
    (order_failed, restaurant_a, table_a, 'new', 0, 0, 'failed', now() + interval '3 seconds'),
    (order_unclaimed, restaurant_a, table_a, 'new', 0, 0, 'unclaimed', now() + interval '4 seconds');

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  first_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_a := (first_claim ->> 'claim_token')::uuid;
  if first_claim is null or token_a is null
     or (select kitchen_print_claim_token = token_a and kitchen_print_claimed_by = user_a and kitchen_print_attempts = 1 from public.orders where id = order_printed) is not true then
    raise exception 'CLAIM_TOKEN_ISSUANCE_MISMATCH';
  end if;

  begin
    perform public.finish_kitchen_print_job(order_printed, gen_random_uuid(), true);
    raise exception 'WRONG_TOKEN_WAS_ACCEPTED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;

  did_finish := public.finish_kitchen_print_job(order_printed, token_a, true);
  if did_finish is not true
     or (select kitchen_printed_at is not null and kitchen_print_claimed_at is null and kitchen_print_claim_token is null and kitchen_print_claimed_by is null from public.orders where id = order_printed) is not true then
    raise exception 'CORRECT_TOKEN_DID_NOT_FINISH';
  end if;

  begin
    perform public.finish_kitchen_print_job(order_printed, token_a, true);
    raise exception 'PRINTED_ORDER_WAS_COMPLETED_TWICE';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.finish_kitchen_print_job(order_unclaimed, gen_random_uuid(), true);
    raise exception 'UNCLAIMED_ORDER_WAS_COMPLETED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.finish_kitchen_print_job(order_unclaimed, null, true);
    raise exception 'MISSING_TOKEN_WAS_ACCEPTED';
  exception when others then
    if position('PRINT_JOB_CLAIM_TOKEN_REQUIRED' in sqlerrm) = 0 then raise; end if;
  end;

  second_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_a := (second_claim ->> 'claim_token')::uuid;
  if (second_claim ->> 'id')::uuid <> order_reclaimed then
    raise exception 'RECLAIM_FIXTURE_ORDER_MISMATCH';
  end if;
  update public.orders set kitchen_print_claimed_at = now() - interval '2 minutes 1 second' where id = order_reclaimed;
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  second_claim := public.claim_kitchen_print_job('batch-15a-a');
  if second_claim is not null then
    raise exception 'CROSS_TENANT_CLAIM_WAS_ALLOWED';
  end if;
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  second_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_b := (second_claim ->> 'claim_token')::uuid;
  if token_b is null or token_b = token_a then
    raise exception 'STALE_RECLAIM_DID_NOT_REPLACE_TOKEN';
  end if;
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  begin
    perform public.finish_kitchen_print_job(order_reclaimed, token_a, true);
    raise exception 'STALE_TOKEN_WAS_ACCEPTED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.finish_kitchen_print_job(order_reclaimed, token_b, true);
    raise exception 'SAME_TENANT_NONCLAIMANT_WAS_ACCEPTED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', user_c::text, true);
  did_finish := public.finish_kitchen_print_job(order_reclaimed, token_b, true);
  if did_finish is not true then raise exception 'CURRENT_RECLAIM_TOKEN_DID_NOT_FINISH'; end if;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  second_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_a := (second_claim ->> 'claim_token')::uuid;
  if (second_claim ->> 'id')::uuid <> order_cross_tenant then
    raise exception 'CROSS_TENANT_FIXTURE_ORDER_MISMATCH';
  end if;
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  begin
    perform public.finish_kitchen_print_job(order_cross_tenant, token_a, true);
    raise exception 'CROSS_TENANT_FINISH_WAS_ALLOWED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  did_finish := public.finish_kitchen_print_job(order_cross_tenant, token_a, true);
  if did_finish is not true then raise exception 'CLAIM_OWNER_COULD_NOT_FINISH'; end if;

  failure_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_failure := (failure_claim ->> 'claim_token')::uuid;
  if (failure_claim ->> 'id')::uuid <> order_failed then
    raise exception 'FAILURE_FIXTURE_ORDER_MISMATCH';
  end if;
  did_finish := public.finish_kitchen_print_job(order_failed, token_failure, false, 'printer offline');
  if did_finish is not false
     or (select kitchen_printed_at is null and kitchen_print_claim_token is null and kitchen_print_claimed_by is null and kitchen_print_error = 'printer offline' from public.orders where id = order_failed) is not true then
    raise exception 'FAILURE_COMPLETION_CONTRACT_MISMATCH';
  end if;
  second_claim := public.claim_kitchen_print_job('batch-15a-a');
  token_b := (second_claim ->> 'claim_token')::uuid;
  if token_b is null or token_b = token_failure then
    raise exception 'FAILURE_RETRY_DID_NOT_REPLACE_TOKEN';
  end if;
  begin
    perform public.finish_kitchen_print_job(order_failed, token_failure, true);
    raise exception 'FAILED_CLAIM_TOKEN_WAS_ACCEPTED';
  exception when others then
    if position('PRINT_JOB_CLAIM_NOT_CURRENT' in sqlerrm) = 0 then raise; end if;
  end;
  if public.finish_kitchen_print_job(order_failed, token_b, true) is not true then
    raise exception 'FAILURE_RETRY_CURRENT_TOKEN_DID_NOT_FINISH';
  end if;
end;
$$;

do $$
declare
  update_policy_count integer;
begin
  select count(*) into update_policy_count
  from pg_policy p
  where p.polrelid = 'public.restaurants'::regclass and p.polcmd = 'w';

  if update_policy_count <> 1
     or to_regprocedure('public.finish_kitchen_print_job(uuid,boolean,text)') is not null
     or not has_function_privilege('authenticated', 'public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure, 'execute')
     or has_function_privilege('anon', 'public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure, 'execute')
     or has_function_privilege('service_role', 'public.finish_kitchen_print_job(uuid,uuid,boolean,text)'::regprocedure, 'execute')
     or has_function_privilege('anon', 'public.claim_kitchen_print_job(text)'::regprocedure, 'execute')
     or has_function_privilege('service_role', 'public.claim_kitchen_print_job(text)'::regprocedure, 'execute')
     or exists (
       select 1 from pg_policy p
       where p.polrelid = 'public.restaurants'::regclass
         and p.polname = 'platform admins update restaurants'
     )
     or not exists (
       select 1 from pg_policy p
       where p.polrelid = 'public.restaurants'::regclass
         and p.polname = 'owners and platform admins update restaurants'
         and p.polcmd = 'w'
         and p.polroles = array['authenticated'::regrole::oid]
         and pg_get_expr(p.polqual, p.polrelid) like '%has_restaurant_role%'
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%is_platform_admin%'
     ) then
    raise exception 'BATCH15A_CATALOG_CONTRACT_MISMATCH';
  end if;
end;
$$;

rollback;
