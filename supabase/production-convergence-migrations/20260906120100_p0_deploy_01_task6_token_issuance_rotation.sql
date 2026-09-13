begin;

create table if not exists public.public_order_token_issuance_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_id uuid not null references public.tables(id) on delete restrict,
  token_id uuid not null references public.public_order_tokens(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('issued','rotated')),
  expires_at timestamptz,
  issued_at timestamptz not null default clock_timestamp()
);
alter table public.public_order_token_issuance_audit enable row level security;
revoke all on public.public_order_token_issuance_audit from public, anon, authenticated;

commit;

create or replace function public.issue_public_qr_table_token(p_restaurant_id uuid,p_table_id uuid,p_expires_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_token public.public_order_tokens; v_raw text; v_rotated boolean := false;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select organization_id into v_org from public.restaurants where id=p_restaurant_id;
 if v_org is null then raise exception 'RESTAURANT_ORGANIZATION_REQUIRED'; end if;
 perform 1 from public.tables where id=p_table_id and restaurant_id=p_restaurant_id for update;
 if not found then raise exception 'TABLE_RESTAURANT_MISMATCH'; end if;
 if not public.has_restaurant_role(p_restaurant_id,array['owner','manager']) then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
 if p_expires_at is not null and p_expires_at <= clock_timestamp() then raise exception 'INVALID_TOKEN_EXPIRY'; end if;
 v_raw := encode(extensions.gen_random_bytes(32),'hex');
 select * into v_token from public.public_order_tokens where table_id=p_table_id for update;
 if v_token.id is null then
   insert into public.public_order_tokens(organization_id,restaurant_id,table_id,token_hash,expires_at) values(v_org,p_restaurant_id,p_table_id,encode(extensions.digest(v_raw,'sha256'),'hex'),p_expires_at) returning * into v_token;
 else
   v_rotated := true;
   update public.public_order_tokens set organization_id=v_org,restaurant_id=p_restaurant_id,token_hash=encode(extensions.digest(v_raw,'sha256'),'hex'),revoked_at=null,expires_at=p_expires_at where id=v_token.id returning * into v_token;
 end if;
 insert into public.public_order_token_issuance_audit(organization_id,restaurant_id,table_id,token_id,actor_user_id,action,expires_at) values(v_org,p_restaurant_id,p_table_id,v_token.id,auth.uid(),case when v_rotated then 'rotated' else 'issued' end,p_expires_at);
 return jsonb_build_object('token',v_raw,'token_id',v_token.id,'organization_id',v_org,'restaurant_id',p_restaurant_id,'table_id',p_table_id,'expires_at',p_expires_at,'rotated',v_rotated);
end $$;
revoke all on function public.issue_public_qr_table_token(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.issue_public_qr_table_token(uuid,uuid,timestamptz) to authenticated;
