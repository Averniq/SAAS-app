\set ON_ERROR_STOP on
-- Local-only representation of the accepted historical Sake incomplete-linkage
-- state. The schema CHECK remains active: a NULL organization is valid only
-- for the legacy NULL venue_status state, never for a managed venue.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-0000-0000-000000000001','authenticated','authenticated','local-sake-owner@example.invalid','','{}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency)
values ('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','Historical boundary org','historical-boundary-org','AU','Australia/Sydney','AUD');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,country,currency_code,ordering_enabled,venue_status)
values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',null,'Sake Street','sake-street','AU','AUD',true,null);
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token)
values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'Table 1','historical-sake-table-1','Table 1','historical-sake-table-token-1');
select encode(extensions.gen_random_bytes(32),'hex') as token \gset
insert into public.public_order_tokens(organization_id,restaurant_id,table_id,token_hash)
values ('20000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',encode(extensions.digest(:'token','sha256'),'hex'));
select set_config('p0_test.historical_token',:'token',true) as historical_token_configured \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create or replace function pg_temp.assert_historical_null_org_closed() returns text language plpgsql as $$
begin
  begin perform public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null);
  exception when sqlstate 'P0001' then if sqlerrm='RESTAURANT_ORGANIZATION_REQUIRED' then null; else raise; end if; end;
  begin perform public.get_public_qr_order_context(current_setting('p0_test.historical_token'));
  exception when sqlstate 'P0001' then if sqlerrm='PUBLIC_TOKEN_NOT_FOUND' then return 'HISTORICAL_NULL_ORG_FAIL_CLOSED'; end if; raise; end;
  raise exception 'HISTORICAL_NULL_ORG_TOKEN_ACCEPTED';
end $$;
select pg_temp.assert_historical_null_org_closed();
rollback;
