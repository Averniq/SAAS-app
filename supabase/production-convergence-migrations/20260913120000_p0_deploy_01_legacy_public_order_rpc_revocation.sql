-- P0-DEPLOY-01: the Task 5/7 token-bound RPCs are the sole public-order API.
-- Older deployments may contain one or both legacy public-order API families.
begin;

do $p0_revoke_legacy_public_order_rpcs$
declare
  target regprocedure;
begin
  foreach target in array array[
    to_regprocedure('public.get_public_restaurant(text,text)'),
    to_regprocedure('public.submit_order(uuid,uuid,text,text,jsonb,text)'),
    to_regprocedure('public.resolve_public_order_token(text)'),
    to_regprocedure('public.get_public_order_context(text)'),
    to_regprocedure('public.submit_public_token_order(text,jsonb,text,text)'),
    to_regprocedure('public.generate_current_qr_token(uuid)')
  ] loop
    if target is not null then
      execute format('revoke all on function %s from public, anon, authenticated', target);
    end if;
  end loop;
end
$p0_revoke_legacy_public_order_rpcs$;

commit;
notify pgrst, 'reload schema';
