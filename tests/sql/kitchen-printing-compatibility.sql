begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label; end if; end$$;
select pg_temp.assert_true(not has_function_privilege('anon','public.enqueue_kitchen_dispatch(uuid)','EXECUTE'),'private enqueue');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.submit_order(uuid,uuid,text,text,jsonb,text)','EXECUTE'),'legacy public submission stays denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.kitchen_legacy_claim_v1(text)','EXECUTE'),'legacy internal not callable');
rollback;
