\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null) as issuance \gset
select public.submit_public_qr_order(:'issuance'::jsonb ->> 'token','[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'','first', '70000000-0000-0000-0000-000000000004');
create or replace function pg_temp.expect_conflict(p_token text) returns text language plpgsql as $$
begin
 begin perform public.submit_public_qr_order(p_token,'[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb,'','changed', '70000000-0000-0000-0000-000000000004');
 exception when sqlstate 'P0001' then if sqlerrm='IDEMPOTENCY_KEY_REUSED' then return 'IDEMPOTENCY_CONFLICT_REJECTED'; end if; raise; end;
 raise exception 'IDEMPOTENCY_CONFLICT_ACCEPTED';
end $$;
select pg_temp.expect_conflict(:'issuance'::jsonb ->> 'token');
set local role postgres;
select case when (select count(*)=1 from public.orders where restaurant_id='30000000-0000-0000-0000-000000000001') and (select count(*)=1 from public.public_qr_order_operations where idempotency_key='70000000-0000-0000-0000-000000000004') and (select count(*)=1 from public.order_items) then 'IDEMPOTENCY_CONFLICT_CARDINALITY_OK' else 'IDEMPOTENCY_CONFLICT_CARDINALITY_INVALID' end;
rollback;
