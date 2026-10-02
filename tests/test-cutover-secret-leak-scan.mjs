import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sentinel = ['sb','secret','adversarial_runtime_only'].join('_');
function containsCredential(value) {
  const source = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (source.includes(sentinel) || /\bsb_secret_[A-Za-z0-9_-]+\b/.test(source)) return true;
  for (const match of source.matchAll(/\b[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try { if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') return true; } catch {}
  }
  return false;
}
assert.equal(containsCredential(sentinel), true);
assert.equal(containsCredential(['header',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'signature'].join('.')), true);
assert.equal(containsCredential('sb_publishable_disposable'), false);

const intended = ['scripts/build-site.mjs','scripts/bootstrap-initial-owner.mjs','scripts/supabase-origin.mjs','scripts/verify-public-supabase-config.mjs','scripts/run-local-supabase-integration-gate.mjs','docs/production-clean-state-cutover-runbook-2026-10-02.md','supabase/migrations/20261003090000_initial_owner_bootstrap_claim.sql','tests/test-cutover-credential-safety.mjs','tests/test-build-public-supabase-config.mjs','tests/test-initial-owner-bootstrap-contract.mjs','tests/test-initial-owner-bootstrap-database-contract.mjs','tests/test-cutover-secret-leak-scan.mjs'];
let files = [...intended, 'docs/cutover-tooling-hardening-validation-2026-10-03.md'];
if (process.argv.includes('--staged')) {
  const result = spawnSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status, 0, 'staged file inventory failed');
  files = result.stdout.split('\0').filter(Boolean);
  assert.ok(files.length > 0, 'staged scan requires intended staged changes');
}
for (const file of files) {
  let content;
  if (process.argv.includes('--staged')) {
    const result = spawnSync('git',['show',`:${file}`],{cwd:root,maxBuffer:16*1024*1024});
    assert.equal(result.status, 0, 'staged blob read failed');
    content = result.stdout;
  } else content = readFileSync(new URL(`../${file}`, import.meta.url));
  assert.equal(containsCredential(content), false, `credential scan rejected source file: ${file}`);
}
let distFiles = 0;
for (const file of readdirSync(new URL('../dist/', import.meta.url), {recursive:true,withFileTypes:true})) {
  if (!file.isFile()) continue;
  assert.equal(containsCredential(readFileSync(`${file.parentPath}/${file.name}`)), false, 'credential scan rejected generated dist artifact');
  distFiles++;
}
assert.ok(distFiles > 0, 'generated dist must exist for credential scanning');
console.log(`Cutover credential leak scan: PASS (${files.length} source/staged files, ${distFiles} dist files)`);
