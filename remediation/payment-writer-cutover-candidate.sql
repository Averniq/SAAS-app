-- LOCAL-ONLY convergence candidate. Apply after 20260910120000 only.
-- Task 4's ledger writer remains the sole financial writer; platform routing
-- must not resurrect a direct order-status payment path.
begin;

revoke all on function public.record_restaurant_order_payment(uuid,uuid,text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
