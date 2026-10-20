-- Public image delivery is required for customer menu cards; uploads remain
-- restricted to an owner or manager of the restaurant named by the first path
-- segment: <restaurant-id>/<random-file-name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Restaurant team can upload menu images" on storage.objects;
create policy "Restaurant team can upload menu images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'menu-images'
  and exists (
    select 1
    from public.restaurant_staff rs
    where rs.restaurant_id::text = (storage.foldername(name))[1]
      and rs.user_id = (select auth.uid())
      and rs.role in ('owner', 'manager')
  )
);
