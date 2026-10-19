-- Enforce Aveniq public-registration requirements at the Auth boundary.
-- Configure this as the Supabase Auth "Before User Created" hook after applying
-- the migration: pg-functions://postgres/public.validate_self_service_signup
-- This function does not create or modify any public tenant data.

create or replace function public.validate_self_service_signup(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(p_event->'user'->'user_metadata', '{}'::jsonb);
  email text := lower(btrim(coalesce(p_event->'user'->>'email', '')));
  full_name text := btrim(coalesce(metadata->>'full_name', ''));
  business_name text := btrim(coalesce(metadata->>'business_name', ''));
  country text := btrim(coalesce(metadata->>'country', ''));
begin
  -- Existing invitation and staff-registration flows do not carry the public
  -- registration marker, so their established behavior is unchanged.
  if metadata->>'registration_type' is distinct from 'self_service' then
    return '{}'::jsonb;
  end if;

  if email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or full_name = '' or length(full_name) > 120
     or business_name = '' or length(business_name) > 160
     or country = '' or length(country) > 100
     or coalesce(metadata->>'terms_accepted_at', '') = ''
     or coalesce(metadata->>'privacy_accepted_at', '') = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Complete the required registration fields and accept the legal terms.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.validate_self_service_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.validate_self_service_signup(jsonb) from anon, authenticated, public;
