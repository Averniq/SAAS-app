\set ON_ERROR_STOP on
-- Local-only fresh replay regression. The organization linkage is required by
-- the later Task 5 schema invariant; Task 4 payment behavior is unchanged.
begin;
insert into auth.users(id,email) values
 ('90000000-0000-0000-0000-000000000001','task4-owner@example.invalid'),
 ('90000000-0000-0000-0000-000000000002','task4-cashier@example.invalid'),
 ('90000000-0000-0000-0000-000000000003','task4-staff@example.invalid'),
 ('90000000-0000-0000-0000-000000000004','task4-other-owner@example.invalid');
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency)
values ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Task 4 replay org','task4-replay-org','AU','Australia/Sydney','AUD');
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency)
values ('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000004','Task 4 other org','task4-other-org','AU','Australia/Sydney','AUD');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,ordering_enabled,venue_status)
values ('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Task 4 replay','task4-replay',true,'active');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,ordering_enabled,venue_status)
values ('92000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000002','Task 4 other','task4-other',true,'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values
 ('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','owner'),
 ('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','cashier'),
 ('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','staff');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token)
values ('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',1,'Table 1','task4-replay-table','Table 1','task4-replay-table');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token)
values ('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002',1,'Table 1','task4-other-table','Table 1','task4-other-table');
insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id) values
 ('94000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','new',10,10,'task4-replay-order-a'),
 ('94000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','new',10,10,'task4-replay-order-b'),
 ('94000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000002','new',10,10,'task4-other-order');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-0000-0000-000000000001"}',true);
select public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',600,'Cash','','','95000000-0000-0000-0000-000000000001') as first_payment \gset
select public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',600,'Cash','','','95000000-0000-0000-0000-000000000001') as replay_payment \gset
select case when (:'replay_payment'::jsonb->>'idempotent_replay')='true' then 'TASK4_REPLAY_OK' else 'TASK4_REPLAY_INVALID' end;
create or replace function pg_temp.assert_task4_fences() returns text language plpgsql as $$
begin
 begin perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',599,'Cash','','','95000000-0000-0000-0000-000000000001'); exception when others then if sqlerrm like '%IDEMPOTENCY_KEY_REUSED%' then null; else raise; end if; end;
 begin perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',500,'Cash','','',gen_random_uuid()); exception when others then if sqlerrm like '%PAYMENT_EXCEEDS_REMAINING_BALANCE%' then null; else raise; end if; end;
 perform set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-0000-0000-000000000002"}',true);
 perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002',1000,'Card','','',gen_random_uuid());
 begin perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000003',1000,'Card','','',gen_random_uuid()); exception when sqlstate 'P0001' then if sqlerrm='CASHIER_ROLE_REQUIRED' then null; else raise; end if; end;
 perform set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-0000-0000-000000000003"}',true);
 begin perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002',1,'Cash','','',gen_random_uuid()); exception when others then if sqlerrm like '%CASHIER_ROLE_REQUIRED%' then return 'TASK4_PAYMENT_FENCES_OK'; else raise; end if; end;
 raise exception 'TASK4_STAFF_PAYMENT_ACCEPTED';
end $$;
select pg_temp.assert_task4_fences();
set local role postgres;
select case when (select count(*) from public.payment_operations where restaurant_id='92000000-0000-0000-0000-000000000001')=2 then 'TASK4_PAYMENT_CARDINALITY_OK' else 'TASK4_PAYMENT_CARDINALITY_INVALID' end;
rollback;
