\set ON_ERROR_STOP on
-- Disposable-local P0-04 concurrency fixture. Persisted only in the local replay DB.
create schema if not exists p0_04_test;
create table if not exists p0_04_test.fixture (raw_token text primary key, item_id uuid not null, restaurant_id uuid not null, table_id uuid not null);
do $$ declare owner_id uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); raw text:=replace(gen_random_uuid()::text,'-','') || left(replace(gen_random_uuid()::text,'-',''),8); begin
  insert into auth.users(id,email) values(owner_id,owner_id::text||'@p0-04-concurrency.local');
  insert into public.restaurants(id,owner_user_id,name,slug,status,ordering_enabled,is_active,is_open,tax_rate) values(r,owner_id,'P0-04 concurrency','p0-04-c-'||left(r::text,8),'active',true,true,true,10);
  insert into public.public_qr_ordering_entitlements(restaurant_id,active) values(r,true);
  insert into public.tables(id,restaurant_id,table_number,table_name,local_id,name,table_token) values(t,r,1,'Concurrency','p0-04-c-t-'||left(t::text,8),'Concurrency','legacy-'||left(t::text,8));
  insert into public.menu_items(id,restaurant_id,name,price,local_id,category,option_config) values(i,r,'Concurrent item',10,'p0-04-c-i','Menu','[]'::jsonb);
  insert into public.public_order_tokens(restaurant_id,table_id,token_hash,expires_at) values(r,t,encode(extensions.digest(raw,'sha256'),'hex'),clock_timestamp()+interval '1 hour');
  insert into p0_04_test.fixture values(raw,i,r,t);
end $$;
