#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = new URL('../supabase/migrations/20261003090000_initial_owner_bootstrap_claim.sql', import.meta.url);
const source = readFileSync(migration, 'utf8');

assert.match(source, /create table public\.initial_owner_bootstrap_claims/i);
assert.match(source, /restaurant_id uuid primary key/i, 'one restaurant must have at most one bootstrap claim');
assert.match(source, /create or replace function public\.claim_initial_restaurant_owner\(\s*p_restaurant_id uuid,\s*p_user_id uuid,\s*p_dry_run boolean default false\s*\)/i);
assert.match(source, /security definer/i);
assert.match(source, /pg_advisory_xact_lock/i, 'concurrent attempts must serialize before ownership is bound');
assert.match(source, /INITIAL_OWNER_ALREADY_BOUND/i);
assert.match(source, /p_dry_run then return pg_catalog\.jsonb_build_object\('action','would_bind_owner'\)/i, 'dry run must validate atomically without a write');
assert.match(source, /revoke all on function public\.claim_initial_restaurant_owner\(uuid,uuid,boolean\) from public, anon, authenticated/i);
assert.match(source, /grant execute on function public\.claim_initial_restaurant_owner\(uuid,uuid,boolean\) to service_role/i);

console.log('Initial owner bootstrap database contract: PASS');
