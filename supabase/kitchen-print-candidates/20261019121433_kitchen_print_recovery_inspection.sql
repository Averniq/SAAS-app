-- Local candidate: staff-authorized exact recovery projection, never a new send authorization.
begin;
create function public.inspect_kitchen_print_recovery(p_job_id uuid,p_attempt_id uuid,p_claim_token uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.kitchen_print_jobs; v_started boolean; v_outcome text;
begin
 if p_job_id is null or p_attempt_id is null or p_claim_token is null then raise exception 'INVALID_RECOVERY_IDENTIFIERS'; end if;
 select * into j from public.kitchen_print_jobs where id=p_job_id;
 perform public.kitchen_require_role(j.restaurant_id);
 perform public.kitchen_reconcile_jobs(j.restaurant_id);
 select * into j from public.kitchen_print_jobs where id=p_job_id and restaurant_id=j.restaurant_id;
 select exists(select 1 from public.kitchen_print_attempts a where a.restaurant_id=j.restaurant_id and a.job_id=j.id and a.attempt_id=p_attempt_id and a.claim_token=p_claim_token and a.event='dispatching') into v_started;
 select a.event into v_outcome from public.kitchen_print_attempts a where a.restaurant_id=j.restaurant_id and a.job_id=j.id and a.attempt_id=p_attempt_id and a.claim_token=p_claim_token and a.event in('not_sent','transmitted','uncertain') order by a.id desc limit 1;
 return jsonb_build_object('jobId',j.id,'restaurantId',j.restaurant_id,'state',j.state,'attemptStarted',v_started,'attemptOutcome',v_outcome,'claimCurrent',coalesce(j.claim_token=p_claim_token and j.state in('leased','dispatching') and j.lease_expires_at>clock_timestamp(),false));
end $$;
revoke all on function public.inspect_kitchen_print_recovery(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.inspect_kitchen_print_recovery(uuid,uuid,uuid) to authenticated;
commit;
