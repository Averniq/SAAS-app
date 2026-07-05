-- Remove anonymous access from authenticated/admin SECURITY DEFINER functions.
-- Supabase may create explicit anon/authenticated grants through default privileges,
-- so revoking only from PUBLIC is not sufficient.
-- Run after 005_all_round_staff.sql.

begin;

revoke all on function public.is_restaurant_staff(uuid) from public, anon;
revoke all on function public.has_restaurant_role(uuid,text[]) from public, anon;
revoke all on function public.create_restaurant_for_owner(text,text,text,text,text,text) from public, anon;
revoke all on function public.create_restaurant_tables(uuid,integer) from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.platform_create_restaurant(text,text,text,text,integer) from public, anon;
revoke all on function public.can_manage_restaurant_staff(uuid) from public, anon;
revoke all on function public.create_restaurant_invite(uuid,text,text) from public, anon;
revoke all on function public.accept_restaurant_invite(uuid) from public, anon;
revoke all on function public.list_restaurant_team(uuid) from public, anon;
revoke all on function public.revoke_restaurant_invite(uuid) from public, anon;
revoke all on function public.update_restaurant_order_status(uuid,uuid,text) from public, anon;

grant execute on function public.is_restaurant_staff(uuid) to authenticated;
grant execute on function public.has_restaurant_role(uuid,text[]) to authenticated;
grant execute on function public.create_restaurant_for_owner(text,text,text,text,text,text) to authenticated;
grant execute on function public.create_restaurant_tables(uuid,integer) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.platform_create_restaurant(text,text,text,text,integer) to authenticated;
grant execute on function public.can_manage_restaurant_staff(uuid) to authenticated;
grant execute on function public.create_restaurant_invite(uuid,text,text) to authenticated;
grant execute on function public.accept_restaurant_invite(uuid) to authenticated;
grant execute on function public.list_restaurant_team(uuid) to authenticated;
grant execute on function public.revoke_restaurant_invite(uuid) to authenticated;
grant execute on function public.update_restaurant_order_status(uuid,uuid,text) to authenticated;

-- These are the only V1 functions intentionally callable by anonymous customers.
revoke all on function public.get_public_restaurant(text,text) from public;
revoke all on function public.submit_order(uuid,uuid,text,text,jsonb,text) from public;
revoke all on function public.get_customer_order_status(uuid,text,text) from public;
grant execute on function public.get_public_restaurant(text,text) to anon, authenticated;
grant execute on function public.submit_order(uuid,uuid,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.get_customer_order_status(uuid,text,text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
