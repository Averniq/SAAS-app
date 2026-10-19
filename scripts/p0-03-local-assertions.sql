-- Disposable-local integration matrix. The surrounding transaction is rolled
-- back, and authenticated test identity is supplied through request.jwt.claims.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fn regprocedure := 'public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)'::regprocedure;
  legacy regprocedure := 'public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure;
  restaurant_a uuid := gen_random_uuid(); restaurant_b uuid := gen_random_uuid();
  table_a uuid := gen_random_uuid(); table_b uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid(); manager_id uuid := gen_random_uuid(); cashier_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  order_full uuid := gen_random_uuid(); order_partial uuid := gen_random_uuid(); order_served uuid := gen_random_uuid(); order_cashier uuid := gen_random_uuid();
  result jsonb; first_paid_at timestamptz; first_closed_at timestamptz; count_before integer; full_payment_idempotency_key uuid;
begin
  if not exists (select 1 from pg_class where oid='public.payment_operations'::regclass and relrowsecurity) then raise exception 'payment_operations RLS is not enabled'; end if;
  if has_table_privilege('anon','public.payment_operations','insert') or has_table_privilege('authenticated','public.payment_operations','insert') or has_table_privilege('authenticated','public.payment_operations','update') or has_table_privilege('authenticated','public.payment_operations','delete') then raise exception 'direct ledger mutation is exposed'; end if;
  if has_table_privilege('authenticated','public.orders','update') then raise exception 'direct orders PATCH is exposed'; end if;
  if has_function_privilege('anon',fn,'execute') or has_function_privilege('public',fn,'execute') or not has_function_privilege('authenticated',fn,'execute') then raise exception 'authoritative payment RPC ACL mismatch'; end if;
  if has_function_privilege('authenticated',legacy,'execute') then raise exception 'legacy order payment RPC remains client-callable'; end if;
  if (select proconfig from pg_proc where oid=fn) is distinct from array['search_path=public, pg_temp'] or (select pg_get_userbyid(proowner) from pg_proc where oid=fn) <> 'postgres' then raise exception 'authoritative payment RPC definer contract drift'; end if;

  insert into auth.users(id,email) values
    (owner_id, owner_id::text || '@p0-03.local'), (manager_id, manager_id::text || '@p0-03.local'),
    (cashier_id, cashier_id::text || '@p0-03.local'), (staff_id, staff_id::text || '@p0-03.local'),
    (outsider_id, outsider_id::text || '@p0-03.local');
  insert into public.restaurants(id,owner_user_id,name,slug,status) values
    (restaurant_a,owner_id,'P0-03 A', 'p0-03-a-' || left(restaurant_a::text,8),'active'),
    (restaurant_b,outsider_id,'P0-03 B', 'p0-03-b-' || left(restaurant_b::text,8),'active');
  insert into public.restaurant_staff(restaurant_id,user_id,role) values
    (restaurant_a,owner_id,'owner'),(restaurant_a,manager_id,'manager'),(restaurant_a,cashier_id,'cashier'),(restaurant_a,staff_id,'staff'),(restaurant_b,outsider_id,'owner');
  insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values
    (table_a,restaurant_a,1,'P0-03 A','p0-03-a-' || left(table_a::text,8),'P0-03 A','p0-03-a-' || table_a::text),
    (table_b,restaurant_b,1,'P0-03 B','p0-03-b-' || left(table_b::text,8),'P0-03 B','p0-03-b-' || table_b::text);
  insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id) values
    (order_full,restaurant_a,table_a,'ready',10,10,'p0-03-full-' || left(order_full::text,8)),
    (order_partial,restaurant_a,table_a,'new',10,10,'p0-03-partial-' || left(order_partial::text,8)),
    (order_served,restaurant_a,table_a,'ready',10,10,'p0-03-served-' || left(order_served::text,8)),
    (order_cashier,restaurant_a,table_a,'new',10,10,'p0-03-cashier-' || left(order_cashier::text,8));

  execute 'set local role authenticated'; perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
  result := public.record_authoritative_payment(restaurant_a,order_full,1000,'EFTPOS','','',gen_random_uuid());
  if result->>'payment_status' <> 'paid' or (result->>'remaining_cents')::integer <> 0 then raise exception 'owner full payment result incorrect'; end if;
  select paid_at,closed_at into first_paid_at,first_closed_at from public.orders where id=order_full;
  if first_paid_at is null or first_closed_at is null or (select payment_method from public.orders where id=order_full) <> 'EFTPOS' or (select status from public.orders where id=order_full) <> 'ready' then raise exception 'full settlement projection corrupted'; end if;
  result := public.record_authoritative_payment(restaurant_a,order_partial,400,'Cash','','',gen_random_uuid());
  if result->>'payment_status' <> 'partial' or (select paid_at from public.orders where id=order_partial) is not null then raise exception 'partial payment projection incorrect'; end if;
  result := public.record_authoritative_payment(restaurant_a,order_partial,600,'Card','','',gen_random_uuid());
  if result->>'payment_status' <> 'paid' or (select payment_method from public.orders where id=order_partial) <> 'Card' then raise exception 'final payment method projection incorrect'; end if;
  -- Direct ledger reads and mutations remain denied to authenticated callers.
  begin perform 1 from public.payment_operations where order_id=order_full; raise exception 'direct ledger read accepted'; exception when insufficient_privilege then null; end;
  -- Test fixture inspection deliberately runs as postgres after access-denial checks.
  execute 'set local role postgres';
  count_before := (select count(*) from public.payment_operations where order_id=order_full);
  select idempotency_key into full_payment_idempotency_key from public.payment_operations where order_id=order_full;
  execute 'set local role authenticated';
  -- Replay returns the persisted response and divergent reuse fails.
  result := public.record_authoritative_payment(restaurant_a,order_full,1000,'EFTPOS','','',full_payment_idempotency_key);
  execute 'set local role postgres';
  if result->>'idempotent_replay' <> 'true' or (select count(*) from public.payment_operations where order_id=order_full) <> count_before then raise exception 'idempotent replay incorrect'; end if;
  execute 'set local role authenticated';
  begin perform public.record_authoritative_payment(restaurant_a,order_full,999,'EFTPOS','','',full_payment_idempotency_key); raise exception 'divergent replay accepted'; exception when others then if sqlerrm not like '%IDEMPOTENCY_KEY_REUSED%' then raise; end if; end;
  begin perform public.record_authoritative_payment(restaurant_a,order_served,0,'Cash','','',gen_random_uuid()); raise exception 'zero payment accepted'; exception when others then if sqlerrm not like '%INVALID_PAYMENT_AMOUNT%' then raise; end if; end;
  begin perform public.record_authoritative_payment(restaurant_a,order_served,-1,'Cash','','',gen_random_uuid()); raise exception 'negative payment accepted'; exception when others then if sqlerrm not like '%INVALID_PAYMENT_AMOUNT%' then raise; end if; end;
  begin perform public.record_authoritative_payment(restaurant_a,order_served,1,'Cheque','','',gen_random_uuid()); raise exception 'invalid method accepted'; exception when others then if sqlerrm not like '%INVALID_PAYMENT_METHOD%' then raise; end if; end;
  begin perform public.record_authoritative_payment(restaurant_a,order_served,1,'Other','','',gen_random_uuid()); raise exception 'Other without note accepted'; exception when others then if sqlerrm not like '%OTHER_PAYMENT_NOTE_REQUIRED%' then raise; end if; end;
  begin perform public.record_authoritative_payment(restaurant_a,order_served,1001,'Cash','','',gen_random_uuid()); raise exception 'overpayment accepted'; exception when others then if sqlerrm not like '%PAYMENT_EXCEEDS_REMAINING_BALANCE%' then raise; end if; end;
  -- Served remains an operational state and does not establish payment.
  perform public.update_restaurant_order_status(restaurant_a,order_served,'Served');
  if (select status from public.orders where id=order_served) <> 'served' or (select paid_at from public.orders where id=order_served) is not null then raise exception 'served implied payment'; end if;
  begin perform public.update_restaurant_order_status(restaurant_a,order_served,'Paid'); raise exception 'Paid status accepted'; exception when others then if sqlerrm not like '%PAID_STATUS_REQUIRES_PAYMENT_LEDGER%' then raise; end if; end;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',manager_id)::text,true); perform public.record_authoritative_payment(restaurant_a,order_served,1000,'Other','','manual terminal',gen_random_uuid());
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cashier_id)::text,true);
  perform public.record_authoritative_payment(restaurant_a,order_cashier,1000,'Cash','','',gen_random_uuid());
  begin
    insert into public.payment_operations(restaurant_id,order_id,amount_cents,payment_method,idempotency_key,payload_fingerprint,recorded_by,result_snapshot)
    values(restaurant_a,order_cashier,1,'Cash',gen_random_uuid(),repeat('0',64),cashier_id,'{}'::jsonb);
    raise exception 'direct ledger insert accepted';
  exception when insufficient_privilege then null; end;
  begin update public.orders set status='paid' where id=order_cashier; raise exception 'direct orders PATCH accepted'; exception when insufficient_privilege then null; end;
  begin perform public.record_authoritative_payment(restaurant_b,order_served,1,'Cash','','',gen_random_uuid()); raise exception 'cashier crossed tenant boundary'; exception when others then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider_id)::text,true);
  begin perform public.record_authoritative_payment(restaurant_b,order_served,1,'Cash','','',gen_random_uuid()); raise exception 'wrong tenant/order pairing accepted'; exception when others then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',staff_id)::text,true);
  begin perform public.record_authoritative_payment(restaurant_a,order_served,1,'Cash','','',gen_random_uuid()); raise exception 'staff payment accepted'; exception when others then if sqlerrm not like '%CASHIER_ROLE_REQUIRED%' then raise; end if; end;
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  begin perform public.record_authoritative_payment(restaurant_a,order_served,1,'Cash','','',gen_random_uuid()); raise exception 'anonymous payment accepted'; exception when insufficient_privilege then null; end;
end $$;

rollback;
