-- P0-01D Batch 12A
-- READ-ONLY PRODUCTION CATALOG CAPTURE
--
-- Human execution only.
-- Run manually in the Supabase Production SQL Editor.
-- Do not modify this script before execution.
-- Expected purpose: metadata/catalog evidence only.
--
-- This script has one final, copyable result set. It does not invoke application
-- functions and does not read application-row data, auth data, or secret stores.
-- Save/export the complete result as CSV or JSON and provide it to Batch 12B.

WITH
expected_tables(schema_name, object_name) AS (
  VALUES
    ('public', 'restaurants'),
    ('public', 'restaurant_staff'),
    ('public', 'restaurant_invites'),
    ('public', 'orders'),
    ('public', 'payments'),
    ('public', 'split_bills'),
    ('public', 'split_bill_items'),
    ('public', 'staff_shifts'),
    ('public', 'staff_shift_breaks')
),
target_relations AS (
  SELECT e.schema_name, e.object_name, c.oid, c.relkind, c.relowner, c.relacl,
         c.relrowsecurity, c.relforcerowsecurity
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.object_name
),
role_columns AS (
  SELECT n.nspname AS schema_name, c.relname AS object_name, c.oid AS relid,
         a.attnum, a.attname, a.atttypid, a.atttypmod, a.attnotnull,
         a.attidentity::text AS attidentity, a.attgenerated::text AS attgenerated, ad.adbin, a.atthasdef
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname IN ('restaurant_staff', 'restaurant_invites')
    AND a.attname = 'role'
    AND a.attnum > 0
    AND NOT a.attisdropped
),
target_functions AS (
  SELECT p.oid, n.nspname AS schema_name, p.proname, p.proowner, p.proacl,
         p.provolatile, p.prosecdef, p.proconfig, p.proisstrict, p.proparallel,
         l.lanname, p.oid::regprocedure::text AS signature,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
         pg_catalog.pg_get_function_result(p.oid) AS result_type,
         pg_catalog.pg_get_functiondef(p.oid) AS complete_definition
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND (
      p.proname IN (
        'is_restaurant_staff',
        'has_restaurant_role',
        'is_platform_admin',
        'can_manage_restaurant_staff',
        'create_restaurant_invite',
        'accept_restaurant_invite',
        'list_restaurant_team',
        'revoke_restaurant_invite',
        'touch_staff_presence',
        'update_restaurant_order_status',
        'record_restaurant_order_payment',
        'record_restaurant_payment',
        'void_restaurant_payment'
      )
      OR p.oid = pg_catalog.to_regprocedure('public.claim_kitchen_print_job(text)')
      OR p.oid = pg_catalog.to_regprocedure('public.finish_kitchen_print_job(uuid,boolean,text)')
    )
),
function_paths AS (
  SELECT f.*,
         (
           SELECT cfg.setting
           FROM unnest(coalesce(f.proconfig, ARRAY[]::text[])) AS cfg(setting)
           WHERE cfg.setting LIKE 'search_path=%'
           LIMIT 1
         ) AS search_path_setting
  FROM target_functions f
),
target_order_columns(column_name) AS (
  VALUES
    ('status'),
    ('kitchen_printed_at'),
    ('kitchen_print_claimed_at'),
    ('kitchen_print_attempts'),
    ('kitchen_print_error')
),
orders_relation AS (
  SELECT c.oid, c.relowner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders'
),
expected_policy AS (
  SELECT 'public'::text AS schema_name,
         'restaurants'::text AS object_name,
         'authenticated update allowed restaurants'::text AS policy_name
),
rows AS (
  SELECT
    'completeness'::text AS section,
    'table'::text AS object_type,
    e.schema_name,
    e.object_name,
    ''::text AS identity,
    'exists'::text AS attribute,
    CASE WHEN r.oid IS NULL THEN 'false' ELSE 'true' END AS value
  FROM expected_tables e
  LEFT JOIN target_relations r ON r.schema_name = e.schema_name AND r.object_name = e.object_name

  UNION ALL

  SELECT
    'role_model',
    'column',
    rc.schema_name,
    rc.object_name,
    rc.attname,
    'metadata',
    'type=' || pg_catalog.format_type(rc.atttypid, rc.atttypmod) ||
    '; not_null=' || rc.attnotnull::text ||
    '; default=' || coalesce(pg_catalog.pg_get_expr(rc.adbin, rc.relid), '<none>') ||
    '; identity=' || coalesce(nullif(rc.attidentity::text, ''), '<none>') ||
    '; generated=' || coalesce(nullif(rc.attgenerated::text, ''), '<none>')
  FROM role_columns rc

  UNION ALL

  SELECT
    'role_model',
    'constraint',
    n.nspname,
    c.relname,
    con.conname,
    'definition',
    'type=' || con.contype::text ||
    '; validated=' || con.convalidated::text ||
    '; definition=' || pg_catalog.pg_get_constraintdef(con.oid, true)
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN role_columns rc ON rc.relid = con.conrelid
  WHERE con.conkey @> ARRAY[rc.attnum]::smallint[]
     OR pg_catalog.pg_get_constraintdef(con.oid, true) ILIKE '%role%'

  UNION ALL

  SELECT
    'role_model',
    'enum_value',
    n.nspname,
    t.typname,
    rc.schema_name || '.' || rc.object_name || '.' || rc.attname,
    'value_' || e.enumsortorder::text,
    e.enumlabel::text
  FROM role_columns rc
  JOIN pg_catalog.pg_type t ON t.oid = rc.atttypid AND t.typtype = 'e'
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid

  UNION ALL

  SELECT
    'rls',
    'table',
    r.schema_name,
    r.object_name,
    ''::text,
    'state',
    'owner=' || coalesce(pg_catalog.pg_get_userbyid(r.relowner), '<unknown>') ||
    '; relrowsecurity=' || coalesce(r.relrowsecurity::text, 'false') ||
    '; relforcerowsecurity=' || coalesce(r.relforcerowsecurity::text, 'false')
  FROM target_relations r
  WHERE r.oid IS NOT NULL

  UNION ALL

  SELECT
    'rls',
    'policy',
    n.nspname,
    c.relname,
    pol.polname,
    'definition',
    'command=' || CASE pol.polcmd
      WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE pol.polcmd::text END ||
    '; permissive=' || pol.polpermissive::text ||
    '; roles=' || coalesce((
      SELECT string_agg(CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END, ',' ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END)
      FROM unnest(pol.polroles::oid[]) AS role_oid
    ), '<none>') ||
    '; using=' || coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '<none>') ||
    '; with_check=' || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '<none>')
  FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN target_relations r ON r.oid = c.oid

  UNION ALL

  SELECT
    'completeness',
    'policy',
    e.schema_name,
    e.object_name,
    e.policy_name,
    'exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy pol
      JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = e.schema_name AND c.relname = e.object_name AND pol.polname = e.policy_name
    ) THEN 'true' ELSE 'false' END
  FROM expected_policy e

  UNION ALL

  SELECT
    'acl',
    CASE WHEN r.relkind = 'S' THEN 'sequence' ELSE 'table' END,
    r.schema_name,
    r.object_name,
    ''::text,
    'raw_acl',
    'owner=' || pg_catalog.pg_get_userbyid(r.relowner) ||
    '; relacl=' || coalesce(r.relacl::text, '<null: PostgreSQL default ACL applies>')
  FROM target_relations r
  WHERE r.oid IS NOT NULL

  UNION ALL

  SELECT
    'acl',
    'table',
    r.schema_name,
    r.object_name,
    ''::text,
    'privilege',
    'grantee=' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END ||
    '; grantor=' || pg_catalog.pg_get_userbyid(x.grantor) ||
    '; privilege=' || x.privilege_type ||
    '; grant_option=' || x.is_grantable::text
  FROM target_relations r
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner))) x
  WHERE r.oid IS NOT NULL AND r.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'acl',
    'sequence',
    n.nspname,
    s.relname,
    ''::text,
    'raw_acl',
    'owner=' || pg_catalog.pg_get_userbyid(s.relowner) ||
    '; relacl=' || coalesce(s.relacl::text, '<null: PostgreSQL default ACL applies>')
  FROM pg_catalog.pg_class s
  JOIN pg_catalog.pg_namespace n ON n.oid = s.relnamespace
  WHERE s.relkind = 'S'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      JOIN target_relations r ON r.oid = d.refobjid
      WHERE d.objid = s.oid
    )

  UNION ALL

  SELECT
    'acl',
    'sequence',
    n.nspname,
    s.relname,
    ''::text,
    'privilege',
    'grantee=' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END ||
    '; grantor=' || pg_catalog.pg_get_userbyid(x.grantor) ||
    '; privilege=' || x.privilege_type ||
    '; grant_option=' || x.is_grantable::text
  FROM pg_catalog.pg_class s
  JOIN pg_catalog.pg_namespace n ON n.oid = s.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(s.relacl, pg_catalog.acldefault('s', s.relowner))) x
  WHERE s.relkind = 'S'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      JOIN target_relations r ON r.oid = d.refobjid
      WHERE d.objid = s.oid
    )

  UNION ALL

  SELECT
    'completeness',
    'function',
    'public',
    name,
    signature,
    'exists',
    CASE WHEN pg_catalog.to_regprocedure(signature) IS NULL THEN 'false' ELSE 'true' END
  FROM (VALUES
    ('claim_kitchen_print_job', 'public.claim_kitchen_print_job(text)'),
    ('finish_kitchen_print_job', 'public.finish_kitchen_print_job(uuid,boolean,text)')
  ) AS expected(name, signature)

  UNION ALL

  SELECT
    CASE WHEN fp.proname IN ('claim_kitchen_print_job', 'finish_kitchen_print_job') THEN 'kitchen_print' ELSE 'role_rls_acl' END,
    'function',
    fp.schema_name,
    fp.proname,
    fp.signature,
    'metadata',
    'identity_arguments=' || fp.identity_arguments ||
    '; result=' || fp.result_type ||
    '; language=' || fp.lanname ||
    '; volatility=' || CASE fp.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END ||
    '; strict=' || fp.proisstrict::text ||
    '; parallel=' || CASE fp.proparallel WHEN 's' THEN 'SAFE' WHEN 'r' THEN 'RESTRICTED' WHEN 'u' THEN 'UNSAFE' ELSE fp.proparallel::text END ||
    '; security_definer=' || fp.prosecdef::text ||
    '; owner=' || pg_catalog.pg_get_userbyid(fp.proowner) ||
    '; proconfig=' || coalesce(array_to_string(fp.proconfig, ','), '<null>')
  FROM function_paths fp

  UNION ALL

  SELECT
    'security_definer',
    'function',
    fp.schema_name,
    fp.proname,
    fp.signature,
    'search_path_state',
    CASE
      WHEN NOT fp.prosecdef THEN 'not_security_definer'
      WHEN fp.search_path_setting IS NULL THEN 'no function-local search_path'
      WHEN substring(fp.search_path_setting FROM length('search_path=') + 1) ~ '^".*,.*"$' THEN 'malformed/unsafe explicit search_path'
      ELSE 'safe explicit search_path'
    END || '; setting=' || coalesce(fp.search_path_setting, '<none>')
  FROM function_paths fp

  UNION ALL

  SELECT
    CASE WHEN fp.proname IN ('claim_kitchen_print_job', 'finish_kitchen_print_job') THEN 'kitchen_print' ELSE 'role_rls_acl' END,
    'function',
    fp.schema_name,
    fp.proname,
    fp.signature,
    'raw_acl',
    coalesce(fp.proacl::text, '<null: PostgreSQL default ACL applies>')
  FROM function_paths fp

  UNION ALL

  SELECT
    CASE WHEN fp.proname IN ('claim_kitchen_print_job', 'finish_kitchen_print_job') THEN 'kitchen_print' ELSE 'role_rls_acl' END,
    'function_execute_acl',
    fp.schema_name,
    fp.proname,
    fp.signature,
    'execute_privilege',
    'grantee=' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END ||
    '; grantor=' || pg_catalog.pg_get_userbyid(x.grantor) ||
    '; privilege=' || x.privilege_type ||
    '; grant_option=' || x.is_grantable::text
  FROM function_paths fp
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(fp.proacl, pg_catalog.acldefault('f', fp.proowner))) x
  WHERE x.privilege_type = 'EXECUTE'

  UNION ALL

  SELECT
    CASE WHEN fp.proname IN ('claim_kitchen_print_job', 'finish_kitchen_print_job') THEN 'kitchen_print' ELSE 'role_rls_acl' END,
    'function',
    fp.schema_name,
    fp.proname,
    fp.signature,
    'definition',
    fp.complete_definition
  FROM function_paths fp

  UNION ALL

  SELECT
    'completeness',
    'orders_column',
    'public',
    'orders',
    e.column_name,
    'exists',
    CASE WHEN a.attnum IS NULL THEN 'false' ELSE 'true' END
  FROM target_order_columns e
  LEFT JOIN orders_relation o ON true
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = o.oid AND a.attname = e.column_name AND a.attnum > 0 AND NOT a.attisdropped

  UNION ALL

  SELECT
    'kitchen_print',
    'orders_column',
    'public',
    'orders',
    a.attname,
    'metadata',
    'type=' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||
    '; not_null=' || a.attnotnull::text ||
    '; default=' || coalesce(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '<none>') ||
    '; identity=' || coalesce(nullif(a.attidentity::text, ''), '<none>') ||
    '; generated=' || coalesce(nullif(a.attgenerated::text, ''), '<none>')
  FROM orders_relation o
  JOIN pg_catalog.pg_attribute a ON a.attrelid = o.oid
  LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  JOIN target_order_columns e ON e.column_name = a.attname
  WHERE a.attnum > 0 AND NOT a.attisdropped

  UNION ALL

  SELECT
    'kitchen_print',
    'constraint',
    'public',
    'orders',
    con.conname,
    'status_constraint',
    'type=' || con.contype::text ||
    '; validated=' || con.convalidated::text ||
    '; definition=' || pg_catalog.pg_get_constraintdef(con.oid, true)
  FROM orders_relation o
  JOIN pg_catalog.pg_attribute a ON a.attrelid = o.oid AND a.attname = 'status' AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_catalog.pg_constraint con ON con.conrelid = o.oid
  WHERE con.conkey @> ARRAY[a.attnum]::smallint[]
     OR pg_catalog.pg_get_constraintdef(con.oid, true) ILIKE '%status%'

  UNION ALL

  SELECT
    'completeness',
    'status_constraint',
    'public',
    'orders',
    ''::text,
    'exists',
    CASE WHEN EXISTS (
      SELECT 1
      FROM orders_relation o
      JOIN pg_catalog.pg_attribute a ON a.attrelid = o.oid AND a.attname = 'status'
      JOIN pg_catalog.pg_constraint con ON con.conrelid = o.oid
      WHERE con.conkey @> ARRAY[a.attnum]::smallint[]
         OR pg_catalog.pg_get_constraintdef(con.oid, true) ILIKE '%status%'
    ) THEN 'true' ELSE 'false' END

  UNION ALL

  SELECT
    'completeness',
    'index',
    'public',
    'orders',
    'orders_kitchen_print_queue_idx',
    'exists',
    CASE WHEN pg_catalog.to_regclass('public.orders_kitchen_print_queue_idx') IS NULL THEN 'false' ELSE 'true' END

  UNION ALL

  SELECT
    'kitchen_print',
    'index',
    n.nspname,
    c.relname,
    i.relname,
    'metadata',
    'unique=' || ix.indisunique::text ||
    '; valid=' || ix.indisvalid::text ||
    '; ready=' || ix.indisready::text ||
    '; live=' || ix.indislive::text ||
    '; access_method=' || am.amname ||
    '; definition=' || pg_catalog.pg_get_indexdef(i.oid) ||
    '; predicate=' || coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '<none>')
  FROM pg_catalog.pg_index ix
  JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
  JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_am am ON am.oid = i.relam
  WHERE n.nspname = 'public'
    AND c.relname = 'orders'
    AND i.relname = 'orders_kitchen_print_queue_idx'
)
SELECT section, object_type, schema_name, object_name, identity, attribute, value
FROM rows
ORDER BY section, object_type, schema_name, object_name, identity, attribute, value;
