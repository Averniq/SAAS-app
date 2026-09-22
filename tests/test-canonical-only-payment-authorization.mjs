// Runs a deterministic 156-case authorization matrix against an already-fresh
// database produced by the standalone transition rehearsal. No SQL definitions
// are loaded or rewritten here: only the installed package is exercised.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const database = process.argv[process.argv.indexOf('--database') + 1];
const from = Number(process.argv[process.argv.indexOf('--from') + 1] || 1);
const to = Number(process.argv[process.argv.indexOf('--to') + 1] || 156);
if (!database || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 156 || to < from) throw new Error('Use --database <fixture> --from <1..156> --to <1..156>.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateHash = createHash('sha256').update(readFileSync(path.join(root, 'remediation', 'canonical-only-payment-transition-candidate.sql'))).digest('hex');
const run = (input) => {
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_p0d01final20260908', 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const ids = Object.fromEntries(['manager','cashier','staff','kitchen','customer','nonmember','cross','platform','missing','noClaim','wrongRestaurant'].map((name) => [name, randomUUID()]));
const metadata = run(`select r.id,s.user_id from public.restaurants r join public.restaurant_staff s on s.restaurant_id=r.id and s.role='owner' limit 1;`).trim().split('|');
assert.equal(metadata.length, 2, 'fixture must expose one owner membership');
const [restaurant, owner] = metadata;
const orders = run(`select id from public.orders where restaurant_id='${restaurant}' and payment_status='unpaid' order by id limit 6;`).trim().split(/\r?\n/);
assert.equal(orders.length, 6, 'fixture must retain six payable manifest orders for allowed writer calls');
const otherRestaurant = randomUUID();
const actorRows = [
  ['owner', owner, 'authenticated'], ['manager', ids.manager, 'authenticated'], ['cashier', ids.cashier, 'authenticated'],
  ['staff', ids.staff, 'authenticated'], ['kitchen', ids.kitchen, 'authenticated'], ['customer', ids.customer, 'authenticated'],
  ['nonmember', ids.nonmember, 'authenticated'], ['cross-tenant', ids.cross, 'authenticated'], ['platform-admin-only', ids.platform, 'authenticated'],
  ['missing-membership', ids.missing, 'authenticated'], ['no-claim', '', 'authenticated'], ['wrong-restaurant', ids.wrongRestaurant, 'authenticated'], ['anonymous', '', 'anon']
];
let sql = `begin;\n`;
for (const id of Object.values(ids)) sql += `insert into auth.users(id,email) values ('${id}','${id}@example.invalid');\n`;
sql += `insert into public.restaurants(id,owner_user_id,organization_id,name,slug,status,venue_status) select '${otherRestaurant}',owner_user_id,organization_id,'Other fixture','other-${otherRestaurant}',status,venue_status from public.restaurants where id='${restaurant}';\n`;
sql += `insert into public.restaurant_staff(restaurant_id,user_id,role) values ('${restaurant}','${ids.manager}','manager'),('${restaurant}','${ids.cashier}','cashier'),('${restaurant}','${ids.staff}','staff'),('${restaurant}','${ids.kitchen}','kitchen'),('${otherRestaurant}','${ids.cross}','owner'),('${otherRestaurant}','${ids.wrongRestaurant}','owner');\n`;
sql += `insert into public.platform_admins(user_id) values ('${ids.platform}') on conflict do nothing;\n`;
const cases = [];
for (let round = 0; round < 2; round++) for (const [name, actor, dbRole] of actorRows) for (const operation of ['write','list','legacy-order','legacy-detailed','legacy-void','ledger-select']) cases.push({ name, actor, dbRole, operation, round });
assert.equal(cases.length, 156);
for (let index = from - 1; index < to; index++) {
  const test = cases[index];
  const allowed = ['owner','manager','cashier'].includes(test.name) && ['write','list'].includes(test.operation);
  const call = test.operation === 'write'
    ? `perform public.record_authoritative_payment('${restaurant}','${orders[(test.round * 3 + ['owner','manager','cashier'].indexOf(test.name) + 6) % 6]}',1,'Cash','','','${randomUUID()}');`
    : test.operation === 'list' ? `perform public.list_authoritative_payment_operations('${restaurant}',null);`
      : test.operation === 'legacy-order' ? `perform public.record_restaurant_order_payment('${restaurant}','${orders[0]}','Cash');`
        : test.operation === 'legacy-detailed' ? `perform public.record_restaurant_payment('${restaurant}','${orders[0]}',1,'Cash');`
          : test.operation === 'legacy-void' ? `perform public.void_restaurant_payment('${restaurant}','${randomUUID()}','test');`
            : `perform 1 from public.payment_operations;`;
  sql += `set local role ${test.dbRole}; select set_config('request.jwt.claim.sub','${test.actor}',true); do $$ begin `;
  if (allowed) sql += `${call} `;
  else sql += `begin ${call} raise exception 'UNAUTHORIZED_CASE_${index + 1}_SUCCEEDED'; exception when insufficient_privilege then null; when raise_exception then if sqlerrm not in ('CASHIER_ROLE_REQUIRED','FINANCIAL_READ_ACCESS_DENIED','AUTH_REQUIRED') then raise; end if; end; `;
  sql += `end $$; reset role;\n`;
}
sql += 'rollback;';
run(sql);
console.log(`Canonical-only exact authorization shard ${from}-${to}: ${to - from + 1}/${to - from + 1} PASS fixture=${database} candidate_sha256=${candidateHash}`);
