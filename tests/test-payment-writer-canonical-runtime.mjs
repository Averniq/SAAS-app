import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = readFileSync(new URL("./task4-clean-replay-runtime.sql", import.meta.url), "utf8")
  .replace(/\nrollback;\s*$/i, "");
const verification = `
insert into public.orders(id,restaurant_id,table_id,status,subtotal,total,local_id) values
 ('94000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','new',10,10,'task4-method-card'),
 ('94000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','new',10,10,'task4-method-other'),
 ('94000000-0000-0000-0000-000000000006','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','new',10,10,'task4-method-invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-0000-0000-000000000001"}',true);
select public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000004',1000,'Card','','','95000000-0000-0000-0000-000000000004') as card_payment \\gset
select case when (:'card_payment'::jsonb->>'payment_status')='paid' then 'TASK4_CARD_PAYMENT_OK' else 'TASK4_CARD_PAYMENT_INVALID' end;
select public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000005',1000,'Other','','manual terminal','95000000-0000-0000-0000-000000000005') as other_payment \\gset
select case when (:'other_payment'::jsonb->>'payment_status')='paid' then 'TASK4_OTHER_PAYMENT_OK' else 'TASK4_OTHER_PAYMENT_INVALID' end;
do $$ begin
  begin
    perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000006',1000,'Other','','','95000000-0000-0000-0000-000000000006');
    raise exception 'TASK4_OTHER_NOTE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OTHER_PAYMENT_NOTE_REQUIRED' then raise; end if;
  end;
end $$;
select 'TASK4_OTHER_NOTE_FENCE_OK';
do $$ begin
  begin
    perform public.record_authoritative_payment('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000004',999,'Card','','','95000000-0000-0000-0000-000000000004');
    raise exception 'DIVERGENT_REUSE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.orders where id='94000000-0000-0000-0000-000000000004' and status='new' and paid_at is not null and closed_at is not null and payment_method='Card') then
    raise exception 'CANONICAL_PAYMENT_PROJECTION_INVALID';
  end if;
  if (select count(*) from public.payment_operations where order_id='94000000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'CANONICAL_PAYMENT_DUPLICATE';
  end if;
end $$;
select 'TASK4_DIVERGENCE_AND_PROJECTION_OK';
rollback;`;

const result = spawnSync("docker", [
  "exec", "-i", "supabase_db_p0d01final20260908", "psql", "-X", "-U", "postgres", "-d", "prod_shape_20260915", "-v", "ON_ERROR_STOP=1", "-At"
], { encoding: "utf8", input: `${base}\n${verification}` });

if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "canonical payment method runtime failed");
if (result.stdout.includes('INVALID')) throw new Error(result.stdout);
for (const marker of ["TASK4_CARD_PAYMENT_OK", "TASK4_OTHER_PAYMENT_OK", "TASK4_OTHER_NOTE_FENCE_OK", "TASK4_DIVERGENCE_AND_PROJECTION_OK"]) {
  if (!result.stdout.includes(marker)) throw new Error(`missing payment-method runtime marker: ${marker}`);
}
console.log("Canonical payment method runtime: PASS");
