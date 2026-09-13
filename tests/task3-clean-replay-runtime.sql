\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('96000000-0000-0000-0000-000000000001','task3-owner@example.invalid'),
 ('96000000-0000-0000-0000-000000000002','task3-worker@example.invalid');
insert into public.organizations(id,owner_user_id,name,slug,country,default_timezone,default_currency)
values ('96100000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001','Task 3 replay org','task3-replay-org','AU','Australia/Sydney','AUD');
insert into public.restaurants(id,owner_user_id,organization_id,name,slug,ordering_enabled,venue_status)
values ('96200000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001','96100000-0000-0000-0000-000000000001','Task 3 replay','task3-replay',true,'active');
insert into public.restaurant_staff(restaurant_id,user_id,role) values
 ('96200000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001','owner'),
 ('96200000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002','kitchen');
insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token)
values ('96300000-0000-0000-0000-000000000001','96200000-0000-0000-0000-000000000001',1,'Table 1','task3-replay-table','Table 1','task3-replay-table');
insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id,kitchen_print_attempts)
values ('96400000-0000-0000-0000-000000000001','96200000-0000-0000-0000-000000000001','96300000-0000-0000-0000-000000000001','new',10,10,'task3-replay-order',0);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"96000000-0000-0000-0000-000000000001"}',true);
select public.claim_kitchen_print_job('task3-replay') as job \gset
select case when (:'job'::jsonb ? 'claim_token') then 'TASK3_CLAIM_OK' else 'TASK3_CLAIM_INVALID' end;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"96000000-0000-0000-0000-000000000002"}',true) \gset
create or replace function pg_temp.assert_other_worker_rejected(p_order uuid,p_claim uuid) returns text language plpgsql as $$
begin
 begin perform public.finish_kitchen_print_job(p_order,p_claim,true,null); exception when sqlstate 'P0001' then if sqlerrm='PRINT_JOB_CLAIM_NOT_CURRENT' then return 'TASK3_CLAIM_FENCING_OK'; end if; raise; end;
 raise exception 'TASK3_OTHER_WORKER_ACCEPTED';
end $$;
select pg_temp.assert_other_worker_rejected((:'job'::jsonb->>'id')::uuid,(:'job'::jsonb->>'claim_token')::uuid);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"96000000-0000-0000-0000-000000000001"}',true) \gset
select case when public.finish_kitchen_print_job((:'job'::jsonb->>'id')::uuid,(:'job'::jsonb->>'claim_token')::uuid,true,null) then 'TASK3_FINISH_OK' else 'TASK3_FINISH_INVALID' end;
set local role postgres;
select case when (select kitchen_printed_at is not null and kitchen_print_claim_token is null and kitchen_print_claimed_by is null from public.orders where id='96400000-0000-0000-0000-000000000001') then 'TASK3_FINAL_STATE_OK' else 'TASK3_FINAL_STATE_INVALID' end;
rollback;
