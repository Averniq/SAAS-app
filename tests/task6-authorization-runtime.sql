\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000099', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
-- A non-member must be denied by the issuer before any token mutation.
select public.issue_public_qr_table_token('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',null);
rollback;
