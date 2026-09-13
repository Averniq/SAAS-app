#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const migrationsDir = new URL("../supabase/production-convergence-migrations/", import.meta.url);
const migrationsPath = fileURLToPath(migrationsDir);
const migrationFiles = readdirSync(migrationsPath).filter((name) => name.endsWith(".sql"));
const migrationSource = migrationFiles
  .map((name) => readFileSync(new URL(`../supabase/production-convergence-migrations/${name}`, import.meta.url), "utf8"))
  .join("\n");

for (const signature of [
  "public.get_public_restaurant(text,text)",
  "public.submit_order(uuid,uuid,text,text,jsonb,text)",
  "public.resolve_public_order_token(text)",
  "public.get_public_order_context(text)",
  "public.submit_public_token_order(text,jsonb,text,text)",
  "public.generate_current_qr_token(uuid)"
]) {
  assert.match(
    migrationSource,
    new RegExp(`to_regprocedure\\('${signature.replace(/[()[\].,]/g, "\\$&")}\\'\\)`, "i"),
    `${signature} must be unavailable to the legacy public boundary`
  );
}
assert.match(migrationSource, /revoke all on function %s from public, anon, authenticated/i,
  "legacy public-order RPCs must be revoked from every browser-accessible role");

console.log("Legacy public-order RPC revocation regression: PASS");

// Opt-in database proof. This deliberately accepts no remote connection string:
// every statement runs inside a rollback-only transaction in the disposable P0 DB.
if (process.argv.includes("--local-rollback")) {
  const container = "supabase_db_aveniq-p0-ui-runtime-20260908-local";
  const source = readFileSync(new URL(
    "../supabase/production-convergence-migrations/20260913120000_p0_deploy_01_legacy_public_order_rpc_revocation.sql",
    import.meta.url
  ), "utf8");
  const body = source.replace(/^begin;\s*$/gmi, "")
    .replace(/^commit;\s*$/gmi, "")
    .replace(/^notify pgrst, 'reload schema';\s*$/gmi, "");
  assert.doesNotMatch(body, /\b(?:commit|rollback)\s*;/i);
  const sql = `
begin;
create temporary table before_rpc_acl as
select p.oid, p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public';
${body}
do $verify$
declare
  endpoint record;
  signature text;
  legacy_names text[] := array['get_public_restaurant','submit_order',
    'resolve_public_order_token','get_public_order_context',
    'submit_public_token_order','generate_current_qr_token'];
begin
  -- Inspect every overload, not just the signatures named in the migration.
  for endpoint in select p.oid, p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(legacy_names)
  loop
    if has_function_privilege('anon',endpoint.oid,'execute')
      or has_function_privilege('authenticated',endpoint.oid,'execute')
      or exists(select 1 from pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=endpoint.oid and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'LEGACY_RPC_STILL_CALLABLE: %', endpoint.signature;
    end if;
  end loop;
  foreach signature in array array[
    'public.get_public_qr_order_context(text)',
    'public.submit_public_qr_order(text,jsonb,text,text,uuid)',
    'public.get_public_qr_order_status(text,uuid)']
  loop
    if to_regprocedure(signature) is null
      or not has_function_privilege('anon',signature,'execute')
      or not has_function_privilege('authenticated',signature,'execute') then
      raise exception 'CANONICAL_PUBLIC_RPC_UNAVAILABLE: %', signature;
    end if;
  end loop;
  foreach signature in array array[
    'public.issue_public_qr_table_token(uuid,uuid,timestamp with time zone)',
    'public.get_public_qr_table_token_metadata(uuid)']
  loop
    if to_regprocedure(signature) is null
      or not has_function_privilege('authenticated',signature,'execute')
      or has_function_privilege('anon',signature,'execute') then
      raise exception 'CANONICAL_STAFF_RPC_ACL_CHANGED: %', signature;
    end if;
  end loop;
  if exists(select 1 from before_rpc_acl b join pg_proc p on p.oid=b.oid
    where not p.proname=any(legacy_names) and p.proacl is distinct from b.proacl) then
    raise exception 'UNRELATED_RPC_ACL_CHANGED';
  end if;
end
$verify$;
rollback;
select 'LEGACY_RPC_ROLLBACK_GREEN';
`;
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres",
    "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
  { input: sql, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /LEGACY_RPC_ROLLBACK_GREEN/);
  console.log("Legacy RPC all-overload ACL + canonical/staff preservation (rolled back): PASS");
}
