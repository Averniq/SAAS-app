\set ON_ERROR_STOP on
begin;
insert into public.tables(id,restaurant_id,table_name,local_id,name,table_token) values ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Local second table','local-sake-table-2','Local second table','local-sake-table-token-2');
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ('10000000-0000-0000-0000-000000000099','authenticated','authenticated','local-alt-owner@example.invalid','','{}','{}');
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone) values ('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','Local alternate org','local-alt-org','AU','Australia/Sydney');
insert into public.restaurants(id,owner_user_id,name,slug,organization_id,ordering_enabled,venue_status) values ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','Local alternate restaurant','local-alt-restaurant','20000000-0000-0000-0000-000000000099',true,'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','owner');
insert into public.tables(id,restaurant_id,table_name,local_id,name,table_token) values ('40000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000099','Alternate table','local-alt-table','Alternate table','local-alt-token');
insert into public.public_qr_ordering_entitlements(restaurant_id,active) values ('30000000-0000-0000-0000-000000000099',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null) a \gset
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',null) b \gset
set local role postgres; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',true); set local role authenticated;
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000099','40000000-0000-0000-0000-000000000099',null) c \gset
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.submit_public_qr_order(:'a'::jsonb->>'token','[{"menu_item_id":"60000000-0000-0000-0000-000000000001","quantity":1}]','','','70000000-0000-0000-0000-000000000006') o \gset
create or replace function pg_temp.reject_status(p_token text,p_order uuid) returns text language plpgsql as $$ begin begin perform public.get_public_qr_order_status(p_token,p_order); exception when sqlstate 'P0001' then return 'REJECTED'; end; raise exception 'STATUS_LEAK'; end $$;
select pg_temp.reject_status(:'b'::jsonb->>'token',(:'o'::jsonb->>'id')::uuid) as other_table_token;
select pg_temp.reject_status(:'c'::jsonb->>'token',(:'o'::jsonb->>'id')::uuid) as other_restaurant_token;
rollback;
