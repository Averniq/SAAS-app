\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null) as issuance \gset
create or replace function pg_temp.expect_context_rejection(p_token text) returns text language plpgsql as $$
begin
  begin perform public.get_public_qr_order_context(p_token);
  exception when sqlstate 'P0001' then return 'REJECTED'; end;
  raise exception 'UNEXPECTED_CONTEXT_ACCEPTANCE';
end $$;
select pg_temp.expect_context_rejection('not-a-token') as unknown_token;
set local role postgres;
update public.public_order_tokens set revoked_at=clock_timestamp() where token_hash=encode(extensions.digest((:'issuance'::jsonb ->> 'token'),'sha256'),'hex');
set local role authenticated;
select pg_temp.expect_context_rejection(:'issuance'::jsonb ->> 'token') as revoked_token;
set local role postgres;
update public.public_order_tokens set revoked_at=null, expires_at=clock_timestamp()-interval '1 second' where token_hash=encode(extensions.digest((:'issuance'::jsonb ->> 'token'),'sha256'),'hex');
set local role authenticated;
select pg_temp.expect_context_rejection(:'issuance'::jsonb ->> 'token') as expired_token;
set local role postgres;
update public.public_order_tokens set expires_at=null where token_hash=encode(extensions.digest((:'issuance'::jsonb ->> 'token'),'sha256'),'hex');
update public.restaurants set ordering_enabled=false where id='30000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.expect_context_rejection(:'issuance'::jsonb ->> 'token') as ordering_disabled;
set local role postgres;
update public.restaurants set ordering_enabled=true where id='30000000-0000-0000-0000-000000000001';
insert into public.restaurants(id,name,slug,organization_id,ordering_enabled,venue_status) values ('30000000-0000-0000-0000-000000000002','Coffee Shop','coffee-shop','20000000-0000-0000-0000-000000000001',true,'active');
insert into public.menu_items(id,restaurant_id,name,price,local_id,category) values ('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Other tenant item',1,'local-coffee-menu','Local');
set local role authenticated;
create or replace function pg_temp.expect_submit_rejection(p_token text) returns text language plpgsql as $$
begin
  begin perform public.submit_public_qr_order(p_token,'[{"menu_item_id":"60000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,'','', '70000000-0000-0000-0000-000000000003');
  exception when sqlstate 'P0001' then return 'REJECTED'; end;
  raise exception 'UNEXPECTED_SUBMIT_ACCEPTANCE';
end $$;
select pg_temp.expect_submit_rejection(:'issuance'::jsonb ->> 'token') as cross_tenant_menu;
rollback;
