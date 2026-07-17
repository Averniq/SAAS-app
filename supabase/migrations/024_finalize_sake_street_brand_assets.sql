-- Additive tenant-brand metadata for the bundled Sake Street asset set.
-- This updates only the Sake Street test tenant and keeps all other tenant branding unchanged.
update public.restaurants
set
  logo_url = '/assets/brand/sake-street-logo-mark.webp',
  theme_config = coalesce(theme_config, '{}'::jsonb) || jsonb_build_object(
    'logo_mark_url', '/assets/brand/sake-street-logo-mark.webp',
    'logo_round_url', '/assets/brand/sake-street-logo-round.webp',
    'logo_full_url', '/assets/brand/sake-street-logo-full.webp',
    'favicon_url', '/assets/brand/sake-street-logo-mark.webp',
    'primary_color', '#b21f24',
    'header_background_color', '#151312',
    'logoMarkData', '/assets/brand/sake-street-logo-mark.webp',
    'logoRoundData', '/assets/brand/sake-street-logo-round.webp',
    'logoFullData', '/assets/brand/sake-street-logo-full.webp',
    'faviconData', '/assets/brand/sake-street-logo-mark.webp',
    'headerBackgroundColor', '#151312'
  )
where slug = 'sake-street';
