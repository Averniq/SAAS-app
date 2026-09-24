import { spawnSync } from "node:child_process";

const result = spawnSync("docker", [
  "exec", "-i", "supabase_db_p0d01final20260908", "psql", "-X", "-U", "postgres", "-d", "prod_shape_20260915", "-v", "ON_ERROR_STOP=1", "-At"
], {
  encoding: "utf8",
  input: `do $$
begin
  if to_regprocedure('public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)') is null then
    raise exception 'CANONICAL_PAYMENT_WRITER_MISSING';
  end if;
  if not has_function_privilege('authenticated','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)'::regprocedure,'execute') then
    raise exception 'CANONICAL_PAYMENT_WRITER_NOT_GRANTED';
  end if;
  if has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure,'execute') then
    raise exception 'LEGACY_PAYMENT_WRITER_STILL_GRANTED';
  end if;
end $$;
select 'PAYMENT_WRITER_CUTOVER_ACL_GREEN';`
});

if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "payment writer cutover runtime failed");
if (!result.stdout.includes("PAYMENT_WRITER_CUTOVER_ACL_GREEN")) throw new Error(`unexpected payment writer cutover output: ${result.stdout}`);
console.log("Payment writer cutover runtime: PASS");
