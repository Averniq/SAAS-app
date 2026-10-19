begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
create function pg_temp.denied(statement text, expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end; raise exception 'UNEXPECTED_ALLOW'; end$$;
insert into auth.users(id) values('41000000-0000-0000-0000-000000000001');
insert into public.restaurants(id,name,slug) values('42000000-0000-0000-0000-000000000001','Delivery fixture','kp-delivery');
insert into public.restaurant_staff(restaurant_id,user_id,role) values('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','kitchen');
insert into public.kitchen_printers(id,restaurant_id,name,ip,updated_by) values('43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','Fixture printer','192.168.1.60','41000000-0000-0000-0000-000000000001');
insert into public.kitchen_print_devices(id,restaurant_id,operator_id,device_name,secret_hash) values('44000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Fixture tablet',encode(extensions.digest(repeat('a',64),'sha256'),'hex'));
insert into public.kitchen_print_device_printers values('42000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.heartbeat_kitchen_print_device('44000000-0000-0000-0000-000000000001',repeat('a',64),'[]');
select pg_temp.denied($q$select public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('b',64))$q$,'PRINT_DEVICE_DENIED');
select public.request_kitchen_test_print('43000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001') as job \gset
select pg_temp.assert_true(public.request_kitchen_test_print('43000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001')=:'job'::uuid,'test key replay');
select public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) as claim \gset
select pg_temp.assert_true(public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) is null,'one active claim');
select public.begin_kitchen_print_attempt('44000000-0000-0000-0000-000000000001',repeat('a',64),:'job',(:'claim'::jsonb->>'claimToken')::uuid,'46000000-0000-0000-0000-000000000001',(:'claim'::jsonb->>'configRevision')::bigint) as begun \gset
select pg_temp.assert_true(:'begun'::jsonb->'snapshot'->>'kind'='test','begin returns authoritative snapshot');
select public.begin_kitchen_print_attempt('44000000-0000-0000-0000-000000000001',repeat('a',64),:'job',(:'claim'::jsonb->>'claimToken')::uuid,'46000000-0000-0000-0000-000000000001',(:'claim'::jsonb->>'configRevision')::bigint);
select public.finish_kitchen_print_attempt('44000000-0000-0000-0000-000000000001',repeat('a',64),:'job',(:'claim'::jsonb->>'claimToken')::uuid,'46000000-0000-0000-0000-000000000001','transmitted',null);
select pg_temp.assert_true(public.finish_kitchen_print_attempt('44000000-0000-0000-0000-000000000001',repeat('a',64),:'job',(:'claim'::jsonb->>'claimToken')::uuid,'46000000-0000-0000-0000-000000000001','transmitted',null)->>'outcome'='transmitted','lost finish response replay stable');
select public.request_kitchen_test_print('43000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002') as uncertain_job \gset
select public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) as second_claim \gset
select public.begin_kitchen_print_attempt('44000000-0000-0000-0000-000000000001',repeat('a',64),:'uncertain_job',(:'second_claim'::jsonb->>'claimToken')::uuid,'46000000-0000-0000-0000-000000000002',(:'second_claim'::jsonb->>'configRevision')::bigint);
reset role;
update public.kitchen_print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=:'uncertain_job';
set local role authenticated;
select public.list_kitchen_print_history('42000000-0000-0000-0000-000000000001',null,null,50);
select pg_temp.assert_true(public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) is null,'uncertainty quarantines endpoint');
-- Quarantine follows the physical endpoint even if a manager replaces its record.
reset role;
update public.kitchen_printers set enabled=false where id='43000000-0000-0000-0000-000000000001';
insert into public.kitchen_printers(id,restaurant_id,name,ip,updated_by) values('43000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001','Alias replacement','192.168.1.60','41000000-0000-0000-0000-000000000001');
insert into public.kitchen_print_device_printers values('42000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000002');
set local role authenticated;
select public.request_kitchen_test_print('43000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000004');
select pg_temp.assert_true(public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) is null,'replacement cannot escape endpoint quarantine');
reset role;
update public.kitchen_printers set enabled=false where id='43000000-0000-0000-0000-000000000002';
update public.kitchen_printers set enabled=true where id='43000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.list_kitchen_print_history('42000000-0000-0000-0000-000000000001',null,null,null)$q$,'INVALID_HISTORY_PAGE');
select pg_temp.denied($q$select public.heartbeat_kitchen_print_device('44000000-0000-0000-0000-000000000001',repeat('a',64),'[{"printerId":"43000000-0000-0000-0000-000000000001","configRevision":1}]')$q$,'INVALID_OBSERVATIONS');
select pg_temp.denied(format('select public.resolve_kitchen_print_uncertainty(%L::uuid,null,%L)',:'uncertain_job','Reason entered'),'CONFIRM_STOPPED_AGENT_AND_REASON');
select pg_temp.denied(format('select public.request_kitchen_reprint(%L::uuid,%L,gen_random_uuid())',:'uncertain_job','Reason only'),'REPRINT_CONFIRMATION_REQUIRED');
select public.request_kitchen_reprint(:'uncertain_job','Confirmed possible duplicate paper','45000000-0000-0000-0000-000000000003',true) as child \gset
select pg_temp.assert_true(public.request_kitchen_reprint(:'uncertain_job','Confirmed possible duplicate paper','45000000-0000-0000-0000-000000000003',true)=:'child'::uuid,'reprint replay same child');
select pg_temp.assert_true(public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64)) is null,'reprint waits for quarantine');
select public.resolve_kitchen_print_uncertainty(:'uncertain_job','no_paper_agent_stopped','Old tablet stopped; paper inspected',true);
select pg_temp.assert_true(public.claim_kitchen_printer_job('44000000-0000-0000-0000-000000000001',repeat('a',64))->>'jobId'=:'child','human resolution releases child');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.kitchen_print_attempts where restaurant_id='42000000-0000-0000-0000-000000000001' and event='dispatching'),'duplicate begin not duplicated');
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_attempts where restaurant_id='42000000-0000-0000-0000-000000000001' and event='transmitted'),'duplicate finish not duplicated');
select pg_temp.assert_true((select count(*)=1 from public.kitchen_print_attempts where restaurant_id='42000000-0000-0000-0000-000000000001' and event='uncertain'),'timeout append evidence');
select pg_temp.denied($q$update public.kitchen_print_attempts set error_code='TAMPER'$q$,'PRINT_HISTORY_IMMUTABLE');
select pg_temp.denied($q$update public.kitchen_print_jobs set snapshot='{}'$q$,'PRINT_SNAPSHOT_IMMUTABLE');
rollback;


