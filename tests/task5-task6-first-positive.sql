\set ON_ERROR_STOP on
-- This intentionally exercises the runtime contract rather than inspecting SQL text.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.issue_public_qr_table_token(
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  null
) as issuance \gset

-- Do not echo the plaintext token. Assert only its derived hash and public context.
set local role postgres;
select case when exists (
  select 1 from public.public_order_tokens t
  where t.restaurant_id = '30000000-0000-0000-0000-000000000001'
    and t.table_id = '40000000-0000-0000-0000-000000000001'
    and t.token_hash = encode(extensions.digest((:'issuance'::jsonb ->> 'token'), 'sha256'), 'hex')
) then 'TOKEN_HASH_MATCH' else 'TOKEN_HASH_MISMATCH' end;
set local role authenticated;
select case when (
  public.get_public_qr_order_context(:'issuance'::jsonb ->> 'token') ? 'categories'
  and public.get_public_qr_order_context(:'issuance'::jsonb ->> 'token') ? 'menu_items'
) then 'CONTEXT_MENU_OK' else 'CONTEXT_MENU_MISSING' end;
select public.submit_public_qr_order(
  :'issuance'::jsonb ->> 'token',
  '[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb,
  'Local customer',
  'Local test order',
  '70000000-0000-0000-0000-000000000001'
) as submitted \gset
select case when (:'submitted'::jsonb ? 'id') then 'ORDER_CREATED' else 'ORDER_NOT_CREATED' end;
select case when (public.get_public_qr_order_status(:'issuance'::jsonb ->> 'token', (:'submitted'::jsonb ->> 'id')::uuid) ? 'status') then 'ORDER_STATUS_OK' else 'ORDER_STATUS_MISSING' end;
select public.issue_public_qr_table_token(
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  null
) as rotated \gset
select case when (:'issuance'::jsonb ->> 'rotated') = 'false' and (:'rotated'::jsonb ->> 'rotated') = 'true' then 'ROTATION_FLAGS_OK' else 'ROTATION_FLAGS_INVALID' end;
set local role postgres;
select case when (
  select count(*) = 1 and bool_and(token_hash = encode(extensions.digest((:'rotated'::jsonb ->> 'token'), 'sha256'), 'hex'))
  from public.public_order_tokens where table_id = '40000000-0000-0000-0000-000000000001'
) then 'ROTATED_TOKEN_HASH_AND_CARDINALITY_OK' else 'ROTATED_TOKEN_HASH_OR_CARDINALITY_INVALID' end;
select case when (select count(*) = 1 from public.public_qr_order_operations where restaurant_id = '30000000-0000-0000-0000-000000000001') then 'ONE_QR_OPERATION_OK' else 'QR_OPERATION_COUNT_INVALID' end;
set local role authenticated;
select case when (public.get_public_qr_order_context(:'rotated'::jsonb ->> 'token') ? 'menu_items') then 'ROTATED_TOKEN_CONTEXT_OK' else 'ROTATED_TOKEN_CONTEXT_INVALID' end;
select set_config('p0_test.old_token', :'issuance'::jsonb ->> 'token', true) as old_token_configured \gset
create or replace function pg_temp.assert_old_token_rejected() returns text language plpgsql as $$
begin
  begin
    perform public.get_public_qr_order_context(current_setting('p0_test.old_token'));
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PUBLIC_TOKEN_NOT_FOUND' then return 'OLD_TOKEN_REJECTED'; end if;
    raise;
  end;
  raise exception 'OLD_TOKEN_ACCEPTED';
end $$;
select pg_temp.assert_old_token_rejected();
rollback;
