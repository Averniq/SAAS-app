\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null) as issuance \gset
select public.submit_public_qr_order(:'issuance'::jsonb ->> 'token','[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'','', '70000000-0000-0000-0000-000000000002') as first_submit \gset
select public.submit_public_qr_order(:'issuance'::jsonb ->> 'token','[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'','', '70000000-0000-0000-0000-000000000002') as replay_submit \gset
select case when (:'first_submit'::jsonb ->> 'id') = (:'replay_submit'::jsonb ->> 'id') and (:'replay_submit'::jsonb ->> 'idempotent_replay') = 'true' then 'IDEMPOTENCY_REPLAY_OK' else 'IDEMPOTENCY_REPLAY_INVALID' end;
set local role postgres;
select case when (select count(*) = 1 from public.public_qr_order_operations where idempotency_key = '70000000-0000-0000-0000-000000000002') then 'IDEMPOTENCY_ONE_OPERATION_OK' else 'IDEMPOTENCY_OPERATION_COUNT_INVALID' end;
rollback;
