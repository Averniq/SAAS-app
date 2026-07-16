-- Configure only the disposable Sake Street test tenant with its bundled brand assets.
-- Other tenants keep their own branding unchanged.
update public.restaurants
set
  logo_url = '/assets/brand/sake-street-logo-mark.webp',
  theme_config = coalesce(theme_config, '{}'::jsonb) || jsonb_build_object(
    'logoFullData', '/assets/brand/sake-street-logo-full.webp'
  )
where slug = 'sake-street';
