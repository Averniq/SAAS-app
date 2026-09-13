\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('10000000-0000-0000-0000-000000000099','authenticated','authenticated','local-alt-owner@example.invalid','','{}','{}');
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone) values ('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','Local alternate org','local-alt-org','AU','Australia/Sydney');
insert into public.restaurants(id,name,slug,organization_id,ordering_enabled,venue_status) values ('30000000-0000-0000-0000-000000000099','Local alternate restaurant','local-alt-restaurant','20000000-0000-0000-0000-000000000099',true,'active');
insert into public.tables(id,restaurant_id,table_name,local_id,name,table_token) values ('40000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000099','Alternate table','local-alt-table','Alternate table','local-alt-token');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null) as token_a \gset
select public.submit_public_qr_order(:'token_a'::jsonb->>'token','[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":1}]','', '', '70000000-0000-0000-0000-000000000005') as order_a \gset
create or replace function pg_temp.expect_context_rejection(p_token text) returns text language plpgsql as $$ begin begin perform public.get_public_qr_order_context(p_token); exception when sqlstate 'P0001' then return 'REJECTED'; end; raise exception 'LINKAGE_ACCEPTED'; end $$;
set local role postgres;
update public.public_order_tokens set organization_id='20000000-0000-0000-0000-000000000099' where token_hash=encode(extensions.digest((:'token_a'::jsonb->>'token'),'sha256'),'hex');
set local role authenticated; select pg_temp.expect_context_rejection(:'token_a'::jsonb->>'token') as org_mismatch;
set local role postgres; update public.public_order_tokens set organization_id='20000000-0000-0000-0000-000000000001',restaurant_id='30000000-0000-0000-0000-000000000099' where token_hash=encode(extensions.digest((:'token_a'::jsonb->>'token'),'sha256'),'hex');
set local role authenticated; select pg_temp.expect_context_rejection(:'token_a'::jsonb->>'token') as restaurant_mismatch;
set local role postgres; update public.public_order_tokens set restaurant_id='30000000-0000-0000-0000-000000000001',table_id='40000000-0000-0000-0000-000000000099' where token_hash=encode(extensions.digest((:'token_a'::jsonb->>'token'),'sha256'),'hex');
set local role authenticated; select pg_temp.expect_context_rejection(:'token_a'::jsonb->>'token') as table_mismatch;
set local role postgres; update public.public_order_tokens set table_id='40000000-0000-0000-0000-000000000001' where token_hash=encode(extensions.digest((:'token_a'::jsonb->>'token'),'sha256'),'hex');
create or replace function pg_temp.assert_managed_null_org_blocked() returns text language plpgsql as $$
declare constraint_name text;
begin
  begin
    update public.restaurants set organization_id=null where id='30000000-0000-0000-0000-000000000001';
  exception when check_violation then
    get stacked diagnostics constraint_name = CONSTRAINT_NAME;
    if constraint_name='restaurants_organization_required_for_managed_venue' then return 'NULL_ORG_SCHEMA_BOUNDARY_REJECTED'; end if;
    raise;
  end;
  raise exception 'MANAGED_NULL_ORG_ACCEPTED';
end $$;
select pg_temp.assert_managed_null_org_blocked();
rollback;
