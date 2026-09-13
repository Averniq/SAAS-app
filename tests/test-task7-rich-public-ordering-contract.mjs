#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const task7 = resolve(root, 'supabase/production-convergence-migrations/20260908120000_p0_deploy_01_task7_rich_public_ordering_convergence.sql');
assert.ok(existsSync(task7), 'Task 7 forward migration must exist');
const sql = readFileSync(task7, 'utf8');

// Context must expose the existing authoritative menu model, rather than a
// client-side Sake-specific mapping.
for (const field of ["'logo_url'", "'theme_config'", "'image_url'", "'tags'", "'option_config'", "'option_template'", "'is_active'"]) {
  assert.ok(sql.includes(field), `rich public context must expose ${field}`);
}

// Submission must retain the existing option JSON model, calculate values on
// the server, snapshot selections, and make selections part of idempotency.
for (const marker of ['option_config', 'canonical_options', "input_item->'options'", "'options',canonical_options", 'payload_fingerprint', 'IDEMPOTENCY_KEY_REUSED']) {
  assert.ok(sql.includes(marker), `rich canonical submission must contain ${marker}`);
}
assert.match(sql, /m\.restaurant_id=t\.restaurant_id/, 'menu lookup must remain token-restaurant scoped');
assert.match(sql, /m\.is_active and m\.is_available and not m\.sold_out/, 'unavailable menu items must fail closed');
assert.match(sql, /option_matches\s*<>\s*1/, 'each configured option group must have exactly one canonical choice');
assert.match(sql, /name_snapshot,category_snapshot,quantity,price,base_price,unit_price,options/, 'selected options must be persisted with immutable item snapshots');
assert.match(sql, /security definer set search_path=public,pg_temp/, 'canonical RPCs must retain the Task 5 definer/search-path boundary');

console.log('Task 7 rich public ordering contract regression: PASS');
