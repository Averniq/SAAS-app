-- P0-04 disposable-local behavioral matrix. Run only against a disposable local
-- Supabase/Postgres database after the approved canonical chain. This transaction
-- rolls back all fixtures. The companion concurrency scripts use independent psql
-- sessions and are deliberately localhost-only.
\set ON_ERROR_STOP on
begin;

do $$
declare
  context_fn regprocedure := 'public.get_public_qr_order_context(text)'::regprocedure;
  submit_fn regprocedure := 'public.submit_public_qr_order(text,jsonb,text,text,uuid)'::regprocedure;
  status_fn regprocedure := 'public.get_public_qr_order_status(text,uuid)'::regprocedure;
  legacy_fn regprocedure := 'public.submit_order(uuid,uuid,text,text,jsonb,text)'::regprocedure;
  legacy_status regprocedure := 'public.get_customer_order_status(uuid,text,text)'::regprocedure;
  owner_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  restaurant_a uuid := gen_random_uuid(); restaurant_b uuid := gen_random_uuid(); table_a uuid := gen_random_uuid(); table_b uuid := gen_random_uuid();
  item_a uuid := gen_random_uuid(); item_hidden uuid := gen_random_uuid(); token_id uuid := gen_random_uuid(); raw_token text := repeat('q', 40); result jsonb; key uuid := gen_random_uuid(); before_count integer;
begin
  if not exists(select 1 from pg_class where oid='public.public_qr_order_operations'::regclass and relrowsecurity) then raise exception 'P0-04 operations RLS missing'; end if;
  foreach context_fn in array array[context_fn,submit_fn,status_fn] loop
    if (select pg_get_userbyid(proowner) from pg_proc where oid=context_fn) <> 'postgres'
       or not (select prosecdef from pg_proc where oid=context_fn)
       or (select proconfig from pg_proc where oid=context_fn) is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('anon',context_fn,'execute') or not has_function_privilege('authenticated',context_fn,'execute')
       or has_function_privilege('public',context_fn,'execute') then raise exception 'P0-04 definer ACL contract mismatch: %',context_fn; end if;
  end loop;
  if has_function_privilege('anon',legacy_fn,'execute') or has_function_privilege('anon',legacy_status,'execute')
     or has_function_privilege('anon','public.get_public_restaurant(text,text)'::regprocedure,'execute') then raise exception 'P0-04 legacy anonymous RPC still exposed'; end if;
  if has_table_privilege('anon','public.public_order_tokens','select') or has_table_privilege('anon','public.orders','insert') or has_table_privilege('anon','public.order_items','insert') then raise exception 'P0-04 raw anonymous relation access exposed'; end if;

  insert into auth.users(id,email) values(owner_id,owner_id::text||'@p0-04.local'),(outsider_id,outsider_id::text||'@p0-04.local');
  insert into public.restaurants(id,owner_user_id,name,slug,status,ordering_enabled,is_active,is_open,tax_rate) values
    (restaurant_a,owner_id,'P0-04 A','p0-04-a-r-'||left(restaurant_a::text,8),'active',true,true,true,10),
    (restaurant_b,outsider_id,'P0-04 B','p0-04-b-r-'||left(restaurant_b::text,8),'active',true,true,true,10);
  insert into public.public_qr_ordering_entitlements(restaurant_id,active,expires_at) values(restaurant_a,true,clock_timestamp()+interval '1 day'),(restaurant_b,true,clock_timestamp()+interval '1 day');
  insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values
    (table_a,restaurant_a,1,'P0-04 A','p0-04-a-t','P0-04 A','p0-04-a-token'),(table_b,restaurant_b,1,'P0-04 B','p0-04-b-t','P0-04 B','p0-04-b-token');
  insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values
    (item_a,restaurant_a,'Option meal',10,'p0-04-item','Menu','[{"id":"size","name":"Size","choices":[{"id":"regular","name":"Regular","price":0},{"id":"large","name":"Large","price":2.5}]}]'::jsonb),
    (item_hidden,restaurant_a,'Sold out',1,'p0-04-hidden','Menu','[]'::jsonb);
  update public.menu_items set sold_out=true where id=item_hidden;
  insert into public.public_order_tokens(id,restaurant_id,table_id,token_hash,expires_at) values(token_id,restaurant_a,table_a,encode(extensions.digest(raw_token,'sha256'),'hex'),clock_timestamp()+interval '1 hour');
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  result:=public.submit_public_qr_order(raw_token,jsonb_build_array(jsonb_build_object('menu_item_id',item_a,'quantity',2,'options',jsonb_build_array(jsonb_build_object('groupId','size','choiceId','large')))),'Ada','No onions',key);
  execute 'set local role postgres';
  if result->>'idempotent_replay' <> 'false' or (select total from public.orders where id=(result->>'id')::uuid) <> 25 or (select tax from public.orders where id=(result->>'id')::uuid) <> 2.27 then raise exception 'P0-04 canonical pricing/GST failed'; end if;
  if (select options->0->>'price' from public.order_items where order_id=(result->>'id')::uuid) <> '2.5' then raise exception 'P0-04 option snapshot failed'; end if;
  before_count:=(select count(*) from public.orders where restaurant_id=restaurant_a);
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  if (public.submit_public_qr_order(raw_token,jsonb_build_array(jsonb_build_object('menu_item_id',item_a,'quantity',2,'options',jsonb_build_array(jsonb_build_object('groupId','size','choiceId','large')))),'Ada','No onions',key)->>'idempotent_replay') <> 'true' then raise exception 'P0-04 identical replay failed'; end if;
  execute 'set local role postgres';
  if (select count(*) from public.orders where restaurant_id=restaurant_a) <> before_count then raise exception 'P0-04 replay created another order'; end if;
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  begin perform public.submit_public_qr_order(raw_token,jsonb_build_array(jsonb_build_object('menu_item_id',item_a,'quantity',1,'options',jsonb_build_array(jsonb_build_object('groupId','size','choiceId','large')))),'Ada','No onions',key); raise exception 'P0-04 divergent replay accepted'; exception when others then if sqlerrm not like '%IDEMPOTENCY_KEY_REUSED%' then raise; end if; end;
  begin perform public.submit_public_qr_order(raw_token,jsonb_build_array(jsonb_build_object('menu_item_id',item_a,'quantity',1,'options','[]'::jsonb),jsonb_build_object('menu_item_id',item_hidden,'quantity',1,'options','[]'::jsonb)),'','',gen_random_uuid()); raise exception 'P0-04 invalid mixed lines accepted'; exception when others then if sqlerrm not like '%INVALID_ORDER_%' then raise; end if; end;
  execute 'set local role postgres';
  if (select count(*) from public.orders where restaurant_id=restaurant_a) <> before_count then raise exception 'P0-04 invalid line was partially committed'; end if;
  execute 'set local role postgres';
  update public.public_order_tokens set revoked_at=clock_timestamp() where id=token_id;
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_public_qr_order_context(raw_token); raise exception 'P0-04 revoked token accepted'; exception when others then if sqlerrm not like '%PUBLIC_TOKEN_NOT_FOUND%' then raise; end if; end;
  execute 'set local role postgres';
  update public.public_order_tokens set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where id=token_id;
  execute 'set local role anon'; perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_public_qr_order_context(raw_token); raise exception 'P0-04 expired token accepted'; exception when others then if sqlerrm not like '%PUBLIC_TOKEN_NOT_FOUND%' then raise; end if; end;
end $$;
rollback;
