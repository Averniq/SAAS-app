#!/usr/bin/env node
// Operator only: never loads .env, creates Auth identities, or changes passwords.
import { pathToFileURL } from 'node:url';
import { validateSupabaseOrigin, isServiceCredential } from './supabase-origin.mjs';

const allowedCodes = new Set(['INITIAL_OWNER_ALREADY_BOUND', 'INITIAL_OWNER_MEMBERSHIP_CONFLICT', 'PLATFORM_ADMIN_CONFLICT', 'INITIAL_OWNER_USER_NOT_FOUND', 'INITIAL_OWNER_RESTAURANT_NOT_FOUND']);
function fail(code) { throw new Error(code); }
export async function bootstrapInitialOwner({ url, serviceKey, email, restaurantSlug, allowLocal = false, dryRun = false }, fetchImpl = fetch) {
  // Validate every input before constructing any credential-bearing request.
  const origin = validateSupabaseOrigin(url, { allowLocal });
  if (!serviceKey || !isServiceCredential(serviceKey)) fail('INITIAL_OWNER_SERVICE_KEY_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) fail('INITIAL_OWNER_EMAIL_INVALID');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(restaurantSlug || '')) fail('INITIAL_OWNER_RESTAURANT_SLUG_INVALID');
  const request = async (path, options = {}) => {
    // Only fixed internal relative paths; never derive origins from API responses.
    if (!/^\/(auth|rest)\/v1\//.test(path) || new URL(path, origin).origin !== origin) fail('INITIAL_OWNER_REQUEST_PATH_INVALID');
    let response;
    try {
      response = await fetchImpl(new URL(path, origin), { ...options, redirect: 'error', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' } });
    } catch { fail('INITIAL_OWNER_TRANSPORT_FAILURE'); }
    if (!response.ok) {
      // Allow only exact known database codes; never echo arbitrary bodies/statusText.
      let code;
      try { code = (await response.json())?.message; } catch {}
      fail(allowedCodes.has(code) ? code : `INITIAL_OWNER_REMOTE_FAILURE status=${Number(response.status)}`);
    }
    try { return await response.json(); } catch { fail('INITIAL_OWNER_RESPONSE_INVALID'); }
  };
  const rows = await request(`/rest/v1/restaurants?slug=eq.${encodeURIComponent(restaurantSlug)}&select=id,slug&limit=2`);
  if (!Array.isArray(rows) || rows.length !== 1 || !/^[0-9a-f-]{36}$/i.test(rows[0]?.id)) fail('INITIAL_OWNER_RESTAURANT_NOT_FOUND');
  let user;
  for (let page = 1; page <= 20; page++) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    if (!Array.isArray(data?.users)) fail('INITIAL_OWNER_RESPONSE_INVALID');
    user = data.users.find(entry => String(entry.email || '').toLowerCase() === email.toLowerCase());
    if (user || data.users.length < 100) break;
  }
  if (!user || !/^[0-9a-f-]{36}$/i.test(user.id)) fail('INITIAL_OWNER_USER_NOT_FOUND');
  const restaurantId = rows[0].id;
  const claim = await request('/rest/v1/rpc/claim_initial_restaurant_owner', {
    method: 'POST', body: JSON.stringify({ p_restaurant_id: restaurantId, p_user_id: user.id, p_dry_run: dryRun })
  });
  if (claim?.action !== (dryRun ? 'would_bind_owner' : 'owner_bound')) fail('INITIAL_OWNER_CLAIM_INVALID');
  return { status: dryRun ? 'dry_run' : 'success', action: claim.action, restaurantId, restaurantSlug, userId: user.id, email, role: 'owner' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = flag => { const index = process.argv.indexOf(flag); return index >= 0 ? String(process.argv[index + 1] || '') : ''; };
  bootstrapInitialOwner({ url: process.env.AVENIQ_SUPABASE_URL, serviceKey: process.env.AVENIQ_SUPABASE_SERVICE_ROLE_KEY,
    email: option('--email').trim().toLowerCase(), restaurantSlug: option('--restaurant-slug').trim(),
    allowLocal: process.argv.includes('--allow-local'), dryRun: process.argv.includes('--dry-run')
  }).then(result => console.log(`INITIAL_OWNER_BOOTSTRAP_COMPLETE ${JSON.stringify(result)}`)).catch(error => {
    // Sanitize even unexpected execution failures. No stack, request or env output.
    const message = String(error?.message || '');
    console.error(/^(INITIAL_OWNER_[A-Z_]+(?: status=\d+)?|PLATFORM_ADMIN_CONFLICT|SUPABASE_URL_INVALID: require an origin-only hosted Supabase HTTPS URL or explicitly allowed loopback origin\.)$/.test(message) ? message : 'INITIAL_OWNER_BOOTSTRAP_FAILED');
    process.exitCode = 1;
  });
}
