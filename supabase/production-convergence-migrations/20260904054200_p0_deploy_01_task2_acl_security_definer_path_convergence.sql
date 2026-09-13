-- P0-DEPLOY-01 Task 2: forward-only Group 1/2 + Batch 2A ACL/path convergence.
-- Production-forward release material only. Never add this file to canonical fresh-stack migrations.

begin;

create temporary table p0_deploy_01_task2_before_functions (
  target regprocedure primary key, prosrc text not null, prolang oid not null,
  provolatile "char" not null, prorettype oid not null, proargtypes oidvector not null,
  proowner oid not null, prosecdef boolean not null
) on commit drop;

create temporary table p0_deploy_01_task2_before_relations as
select c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity, c.relacl,
  coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd::text,'permissive',p.polpermissive,'roles',(select jsonb_agg(r.rolname order by r.rolname) from pg_roles r where r.oid=any(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) policies,
  coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',regexp_replace(pg_get_triggerdef(t.oid), ';$', ''),'enabled',t.tgenabled::text) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb) triggers
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('restaurants','restaurant_staff','restaurant_invites','orders');

do $p0_task2_precondition$
declare expected record; actual_name text;
begin
  if (select count(*) from p0_deploy_01_task2_before_relations) <> 4
     or exists (select 1 from p0_deploy_01_task2_before_relations where not relrowsecurity or relforcerowsecurity or pg_get_userbyid(relowner)<>'postgres') then
    raise exception 'P0_DEPLOY_01_TASK2_RELATION_RLS_OWNER_PRESTATE_MISMATCH';
  end if;
  if not exists (select 1 from pg_class c where c.oid='public.restaurant_invites'::regclass and c.relacl::text='{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}')
     or (select count(*) from pg_attribute a where a.attrelid='public.restaurant_invites'::regclass and a.attnum>0 and not a.attisdropped) <> 11
     or (select count(*) from pg_constraint c where c.conrelid='public.restaurant_invites'::regclass) <> 7
     or (select count(*) from pg_index i where i.indrelid='public.restaurant_invites'::regclass) <> 6
     or exists (select 1 from pg_policy p where p.polrelid='public.restaurant_invites'::regclass)
     or exists (select 1 from pg_trigger t where t.tgrelid='public.restaurant_invites'::regclass and not t.tgisinternal) then
    raise exception 'P0_DEPLOY_01_TASK2_RESTAURANT_INVITES_PRESTATE_MISMATCH';
  end if;
  for expected in select * from (values
      ('public.is_restaurant_staff(uuid)', '530b16ed37f154c9863c3d4fe42ae033305a0a87e11a225eb23a20876151f07a', 'search_path=public', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
      ('public.has_restaurant_role(uuid,text[])', '8cfe28fb8b4b6d17e95a29c436428ad08edf70ca5b3b1c8ffa92511374122940', 'search_path=public', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
      ('public.create_restaurant_for_owner(text,text,text,text,text,text)', '89bb5c06aafd12e6efe3d6e22712abf9cb9f2082ee8483571475d954266b7a74', 'search_path=public', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.create_restaurant_tables(uuid,integer)', '81dd581345110d7f21a7ac9ac80be84fe40fe196a3ccc54a620e490dca7c8bc0', 'search_path=public', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.is_platform_admin()', 'ff83cb09b1c294610e3d607444cf5566ba27347f32ddf53442658384aa2103a2', 'search_path=public', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
      ('public.platform_create_restaurant(text,text,text,text,integer)', '1f876606b9d08ebba6d1248bf7b5a13ba010b83c0192224851ffa048997c5742', 'search_path=public', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.can_manage_restaurant_staff(uuid)', '41aa15cf20e64043d5f6d0710249791c53ea09631c63d59fa7a1f9eec710f05c', 'search_path=public', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
      ('public.accept_restaurant_invite(uuid)', 'bf59735ed7a46f6f700e774e89d1c5091581e4afc8b2a779a620491dcd3df395', 'search_path=public', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.record_restaurant_order_payment(uuid,uuid,text)', 'c51d75b5d9bf895ad49eb70acfb431b1e4d512b9e276a181f6e2c53d52dda6f2', 'search_path=public', '{postgres=X/postgres,authenticated=X/postgres}'),
      ('public.list_restaurant_team(uuid)', 'c9b8983c842796e2d615d04453e99bfe43345f81087b8b7963c57d206783f794', 'search_path="public, pg_temp"', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.revoke_restaurant_invite(uuid)', 'fa527687720dd06b5599aec1511f05f0bd72512ee4e66951c2e8ed2368c0edb2', 'search_path="public, pg_temp"', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
    ) as v(identity, definition_sha256, expected_path, explicit_acl)
  loop
    if to_regprocedure(expected.identity) is null then raise exception 'P0_DEPLOY_01_TASK2_IDENTITY_MISSING: %', expected.identity; end if;
    select p.proname into actual_name from pg_proc p where p.oid=to_regprocedure(expected.identity);
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=actual_name) <> 1 then raise exception 'P0_DEPLOY_01_TASK2_OVERLOAD_MISMATCH: %', expected.identity; end if;
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=to_regprocedure(expected.identity) and n.nspname='public' and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and p.proconfig=array[expected.expected_path] and p.proacl::text=expected.explicit_acl and encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')=expected.definition_sha256 and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) then
      raise exception 'P0_DEPLOY_01_TASK2_UNRECOGNIZED_FUNCTION_PRESTATE: %', expected.identity;
    end if;
    insert into p0_deploy_01_task2_before_functions select p.oid,p.prosrc,p.prolang,p.provolatile,p.prorettype,p.proargtypes,p.proowner,p.prosecdef from pg_proc p where p.oid=to_regprocedure(expected.identity);
  end loop;
end
$p0_task2_precondition$;

alter function public.is_restaurant_staff(uuid) set search_path to public, pg_temp;
alter function public.has_restaurant_role(uuid,text[]) set search_path to public, pg_temp;
alter function public.create_restaurant_for_owner(text,text,text,text,text,text) set search_path to public, pg_temp;
alter function public.create_restaurant_tables(uuid,integer) set search_path to public, pg_temp;
alter function public.is_platform_admin() set search_path to public, pg_temp;
alter function public.platform_create_restaurant(text,text,text,text,integer) set search_path to public, pg_temp;
alter function public.can_manage_restaurant_staff(uuid) set search_path to public, pg_temp;
alter function public.accept_restaurant_invite(uuid) set search_path to public, pg_temp;
alter function public.record_restaurant_order_payment(uuid,uuid,text) set search_path to public, pg_temp;
alter function public.list_restaurant_team(uuid) set search_path to public, pg_temp;
alter function public.revoke_restaurant_invite(uuid) set search_path to public, pg_temp;
revoke execute on function public.is_restaurant_staff(uuid), public.has_restaurant_role(uuid,text[]), public.create_restaurant_for_owner(text,text,text,text,text,text), public.create_restaurant_tables(uuid,integer), public.is_platform_admin(), public.platform_create_restaurant(text,text,text,text,integer), public.can_manage_restaurant_staff(uuid), public.accept_restaurant_invite(uuid), public.record_restaurant_order_payment(uuid,uuid,text), public.list_restaurant_team(uuid), public.revoke_restaurant_invite(uuid) from service_role;

do $p0_task2_postcondition$
begin
  if exists (select 1 from p0_deploy_01_task2_before_functions before join pg_proc p on p.oid=before.target where p.prosrc is distinct from before.prosrc or p.prolang is distinct from before.prolang or p.provolatile is distinct from before.provolatile or p.prorettype is distinct from before.prorettype or p.proargtypes is distinct from before.proargtypes or p.proowner is distinct from before.proowner or p.prosecdef is distinct from before.prosecdef or p.proconfig is distinct from array['search_path=public, pg_temp'] or p.proacl::text is distinct from '{postgres=X/postgres,authenticated=X/postgres}' or not has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')) then
    raise exception 'P0_DEPLOY_01_TASK2_FUNCTION_POSTSTATE_MISMATCH';
  end if;
  if exists (select 1 from p0_deploy_01_task2_before_relations before join pg_class c on c.oid=before.oid where c.relowner is distinct from before.relowner or c.relrowsecurity is distinct from before.relrowsecurity or c.relforcerowsecurity is distinct from before.relforcerowsecurity or c.relacl is distinct from before.relacl or coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd::text,'permissive',p.polpermissive,'roles',(select jsonb_agg(r.rolname order by r.rolname) from pg_roles r where r.oid=any(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),'[]'::jsonb) is distinct from before.policies or coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',regexp_replace(pg_get_triggerdef(t.oid), ';$', ''),'enabled',t.tgenabled::text) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb) is distinct from before.triggers) then
    raise exception 'P0_DEPLOY_01_TASK2_RELATION_PRESERVATION_MISMATCH';
  end if;
end
$p0_task2_postcondition$;

commit;
notify pgrst, 'reload schema';
