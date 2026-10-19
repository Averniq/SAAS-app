begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end $$;
select pg_temp.assert_true(public.kitchen_private_ipv4('192.168.1.30'),'private');
select pg_temp.assert_true(public.kitchen_private_ipv4(null),'unconfigured allowed');
select pg_temp.assert_true(not public.kitchen_private_ipv4('127.0.0.1'),'loopback denied');
select pg_temp.assert_true(not public.kitchen_private_ipv4('169.254.169.254'),'metadata denied');
select pg_temp.assert_true(not public.kitchen_private_ipv4('192.168.001.1'),'octal denied');
select pg_temp.assert_true(not public.kitchen_private_ipv4('8.8.8.8'),'public denied');
select pg_temp.assert_true(not public.kitchen_private_ipv4('http://192.168.1.1'),'url denied');
create function pg_temp.expect_state(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlstate=expected then return; end if; raise; end; raise exception 'UNEXPECTED ALLOW: %',statement; end $$;
insert into auth.users(id) values('21000000-0000-0000-0000-000000000001');
insert into public.restaurants(id,name,slug) values('22000000-0000-0000-0000-000000000001','Synthetic Config','kp-config');
insert into public.restaurant_staff(restaurant_id,user_id,role) values('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.save_kitchen_printer('22000000-0000-0000-0000-000000000001',null,'{"name":"Kitchen","ip":"192.168.1.30"}') as configured \gset
select pg_temp.expect_state($q$select public.save_kitchen_printer('22000000-0000-0000-0000-000000000001',null,'{"name":"Duplicate","ip":"192.168.1.30"}')$q$,'23505');
select pg_temp.expect_state($q$select public.save_kitchen_printer('22000000-0000-0000-0000-000000000001',null,'{"name":"Bad copies","copies":4}')$q$,'23514');
select pg_temp.expect_state($q$select public.save_kitchen_printer('22000000-0000-0000-0000-000000000001',null,'{"name":"Bad port","port":80}')$q$,'23514');
select pg_temp.expect_state($q$select public.save_kitchen_printer('22000000-0000-0000-0000-000000000001',null,'{"name":"Public IP","ip":"8.8.8.8"}')$q$,'23514');
select pg_temp.expect_state(format('select public.save_kitchen_printer(%L::uuid,%L::uuid,%L::jsonb)','22000000-0000-0000-0000-000000000001',:'configured'::jsonb->>'id','{"name":"Stale","configRevision":999}'),'P0001');
reset role;
rollback;

