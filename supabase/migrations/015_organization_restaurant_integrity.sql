-- New organization-backed venues must always retain their parent link.
-- Legacy restaurants have a NULL venue_status and remain unaffected.

-- Permit a clean retry if a previous migration attempt added the constraint
-- before the validation step completed.
alter table public.restaurants
  drop constraint if exists restaurants_organization_required_for_managed_venue;

alter table public.restaurants
  add constraint restaurants_organization_required_for_managed_venue
  check (venue_status is null or organization_id is not null) not valid;

alter table public.restaurants
  validate constraint restaurants_organization_required_for_managed_venue;
