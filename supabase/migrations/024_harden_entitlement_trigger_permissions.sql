-- Trigger functions are internal implementation details and must not be
-- callable through the public Data API.
revoke all on function public.enforce_restaurant_entitlement_limits()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
