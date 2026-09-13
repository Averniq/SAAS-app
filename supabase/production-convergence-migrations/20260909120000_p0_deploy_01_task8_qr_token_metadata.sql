begin;

-- Staff may learn whether a currently usable QR exists for each of their
-- restaurant's tables, but never receive a token, hash, or token identifier.
create or replace function public.get_public_qr_table_token_metadata(p_restaurant_id uuid)
returns table(table_id uuid, has_active_token boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.has_restaurant_role(p_restaurant_id, array['owner', 'manager']) then
    raise exception 'RESTAURANT_ACCESS_DENIED';
  end if;

  return query
  select
    t.id,
    exists (
      select 1
      from public.public_order_tokens tok
      where tok.restaurant_id = p_restaurant_id
        and tok.table_id = t.id
        and tok.revoked_at is null
        and (tok.expires_at is null or tok.expires_at > clock_timestamp())
    )
  from public.tables t
  where t.restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function public.get_public_qr_table_token_metadata(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_public_qr_table_token_metadata(uuid) to authenticated;

commit;
