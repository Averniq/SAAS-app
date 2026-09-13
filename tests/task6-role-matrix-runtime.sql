\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000002','authenticated','authenticated','local-manager@example.invalid','','{}','{}'),
 ('10000000-0000-0000-0000-000000000003','authenticated','authenticated','local-staff@example.invalid','','{}','{}'),
 ('10000000-0000-0000-0000-000000000004','authenticated','authenticated','local-kitchen@example.invalid','','{}','{}'),
 ('10000000-0000-0000-0000-000000000005','authenticated','authenticated','local-cashier@example.invalid','','{}','{}'),
 ('10000000-0000-0000-0000-000000000006','authenticated','authenticated','local-wait@example.invalid','','{}','{}'),
 ('10000000-0000-0000-0000-000000000007','authenticated','authenticated','local-attendance@example.invalid','','{}','{}') on conflict do nothing;
insert into public.restaurant_staff(restaurant_id,user_id,role,attendance_report_access) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','manager',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','staff',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','kitchen',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','cashier',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','waitstaff',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','attendance',true) on conflict (restaurant_id,user_id) do update set role=excluded.role;
set local role authenticated;
create or replace function pg_temp.assert_role(p_user uuid,p_allowed boolean) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',p_user::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
 begin perform public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null);
  if p_allowed then return 'PASS'; end if; raise exception 'UNAUTHORIZED_ROLE_ACCEPTED';
 exception when sqlstate 'P0001' then if not p_allowed and sqlerrm='RESTAURANT_ACCESS_DENIED' then return 'REJECTED'; end if; raise; end;
end $$;
select array_agg(pg_temp.assert_role(u,allowed) order by u) from (values
 ('10000000-0000-0000-0000-000000000001'::uuid,true),('10000000-0000-0000-0000-000000000002'::uuid,true),('10000000-0000-0000-0000-000000000003'::uuid,false),('10000000-0000-0000-0000-000000000004'::uuid,false),('10000000-0000-0000-0000-000000000005'::uuid,false),('10000000-0000-0000-0000-000000000006'::uuid,false),('10000000-0000-0000-0000-000000000007'::uuid,false)) x(u,allowed);
rollback;
