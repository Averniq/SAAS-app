#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// P0 token boundary: these assertions deliberately fail at the latest-good
// legacy baseline and prevent a later regression to deterministic table URLs.
assert.match(app, /function\s+orderingTokenUrl\s*\(token\)/, 'customer URLs must be built from an issued token');
assert.doesNotMatch(app, /function\s+tableOrderingLink\s*\(/, 'legacy deterministic table-link helper must not remain active');
assert.doesNotMatch(app, /\/order\/\$\{encodeURIComponent\([^)]*slug[^)]*\)\}\/\$\{encodeURIComponent\(/, 'active UI must not generate slug/table customer URLs');
assert.doesNotMatch(app, /\/order\/\$\{encodeURIComponent\([^)]*slug[^)]*\)\}\/table-1/, 'platform must never invent a table-1 customer route');
assert.match(client, /issuePublicQrTableToken/, 'QR issuance wrapper must use the canonical RPC');
assert.match(client, /getPublicQrOrderContext/, 'customer context wrapper must use the canonical RPC');
assert.match(client, /submitPublicQrOrder/, 'customer submission wrapper must use the canonical RPC');
assert.match(client, /getPublicQrOrderStatus/, 'customer status wrapper must use the canonical RPC');
assert.doesNotMatch(client, /\|\| \(!slug \? memberships\[0\] : null\)/, 'unscoped membership selection is forbidden');

// Product authority: a token port must not replace the mature Sake Street UI.
for (const marker of [
  'SAKE_STREET_LOGO_FULL',
  'Japanese QR table ordering',
  'modifierGroupsForItem',
  'renderMenu',
  'openReviewOrder',
  'orderNote',
  'order-panel',
  'tablePicker',
  'renderKitchen',
  'renderFrontDesk'
]) assert.ok(app.includes(marker), `mature product surface missing: ${marker}`);
assert.ok(html.includes('Staff Login'), 'Staff Login entry point must remain');
assert.ok(html.includes('Review Order') && html.includes('Confirm &amp; Send to Kitchen'), 'mature customer review-and-confirm flow must remain');
assert.doesNotMatch(app, /function tenantMenuPhotoFallback/, 'customer product images must come from authoritative item metadata, not restaurant-specific fabrication');

console.log('P0 integration product-preservation regression: PASS');
