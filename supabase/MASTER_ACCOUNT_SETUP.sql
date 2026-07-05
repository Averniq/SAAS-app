-- 1. In Supabase: Authentication > Users > Add user.
-- 2. Replace the email below with that user's email.
-- 3. Run this statement in the Aveniq SQL Editor.

insert into public.platform_admins (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_MASTER_EMAIL')
on conflict (user_id) do nothing;
