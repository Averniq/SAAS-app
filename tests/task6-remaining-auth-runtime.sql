\set ON_ERROR_STOP on
begin;
set local role postgres;
select case when not has_function_privilege('anon','public.issue_public_qr_table_token(uuid,uuid,timestamp with time zone)'::regprocedure,'execute') then 'ANON_EXECUTE_REVOKED' else 'ANON_EXECUTE_EXPOSED' end;
set local role authenticated;
create or replace function pg_temp.expect_issue_rejection(p_user uuid,p_restaurant uuid,p_table uuid,p_expiry timestamptz,p_error text) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true); perform set_config('request.jwt.claim.role','authenticated',true);
 begin perform public.issue_public_qr_table_token(p_restaurant,p_table,p_expiry); exception when sqlstate 'P0001' then if sqlerrm=p_error then return 'REJECTED'; end if; raise; end;
 raise exception 'ISSUER_ACCEPTED';
end $$;
select pg_temp.expect_issue_rejection(null,'30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null,'AUTHENTICATION_REQUIRED') as unauthenticated;
select pg_temp.expect_issue_rejection('10000000-0000-0000-0000-000000000098','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null,'RESTAURANT_ACCESS_DENIED') as non_member;
select pg_temp.expect_issue_rejection('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000099',null,'TABLE_RESTAURANT_MISMATCH') as wrong_table;
select pg_temp.expect_issue_rejection('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',clock_timestamp()-interval '1 second','INVALID_TOKEN_EXPIRY') as past_expiry;
rollback;
