// Caller authentication and email transport use the public key. Only the private reservation RPC uses the server credential.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set(['manager', 'staff', 'kitchen', 'cashier']);
function configuredUrl(value, originOnly = false) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/') ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', 'kong'].includes(url.hostname)))) throw Error('Invalid endpoint configuration');
  return originOnly ? url.origin : url.href.replace(/\/$/, '');
}
function isPublicKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { return false; }
}
function isServerKey(key) {
  if (typeof key !== 'string') return false;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch { return false; }
}
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > 4096) throw Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw Error('body');
  const chunks = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) { await reader.cancel(); throw Error('body'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createStaffInviteHandler({supabaseUrl, publicKey, serverKey, appOrigin, fetch: requestFetch = globalThis.fetch}) {
  const base = configuredUrl(supabaseUrl);
  const origin = configuredUrl(appOrigin, true);
  if (!isPublicKey(publicKey)) throw Error('Only a public Supabase key is permitted');
  if (!isServerKey(serverKey)) throw Error('A server-only service-role reservation credential is required');
  const serverHeaders = {apikey: serverKey, Authorization: `Bearer ${serverKey}`, 'Content-Type': 'application/json'};
  const publicHeaders = {apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json'};
  return async function staffInvite(request) {
    const requestOrigin = request.headers.get('Origin');
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(requestOrigin === origin ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info'} : {})};
    const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), {status, headers});
    if (requestOrigin && requestOrigin !== origin) return reply(403, {error: 'REQUEST_DENIED'});
    if (request.method === 'OPTIONS') return reply(204, null);
    if (request.method !== 'POST') return reply(405, {error: 'METHOD_NOT_ALLOWED'});
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply(400, {error: 'INVALID_REQUEST'});
    let input;
    try { input = await readBody(request); } catch { return reply(400, {error: 'INVALID_REQUEST'}); }
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !['restaurantId', 'requestId', 'email', 'role', 'displayName'].includes(k)) ||
        !uuid.test(input.restaurantId || '') || !uuid.test(input.requestId || '') || !roles.has(input.role) ||
        typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
        typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 100) return reply(400, {error: 'INVALID_REQUEST'});
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 8192) return reply(401, {error: 'SIGN_IN_REQUIRED'});
    const callerHeaders = {...publicHeaders, Authorization: authorization};
    try {
      const auth = await requestFetch(`${base}/auth/v1/user`, {headers: callerHeaders, signal: AbortSignal.timeout(10000)});
      const user = auth.ok ? await auth.json() : null;
      if (!uuid.test(user?.id || '')) return reply(401, {error: 'SIGN_IN_REQUIRED'});
      const reservation = await requestFetch(`${base}/rest/v1/rpc/reserve_staff_invitation_for_delivery`, {method: 'POST', headers: serverHeaders, signal: AbortSignal.timeout(10000), body: JSON.stringify({
        p_actor_user_id: user.id, p_restaurant_id: input.restaurantId, p_email: input.email.trim().toLowerCase(), p_role: input.role,
        p_display_name: input.displayName.trim(), p_request_id: input.requestId
      })});
      const raw = await reservation.json();
      if (!reservation.ok) {
        const message = String(raw?.message || '');
        if (/COOLDOWN|RATE_LIMIT/.test(message)) return reply(429, {error: 'INVITATION_COOLDOWN'});
        if (/FORBIDDEN|NOT_AUTHORIZED|UNAUTHORIZED|PERMISSION|OWNER_REQUIRED|ACCESS_DENIED|AUTH_REQUIRED|ONLY_OWNER/i.test(message) || raw?.code === '42501') return reply(403, {error: 'REQUEST_DENIED'});
        if (/MEMBERSHIP|CONFLICT|STALE|INVITE_EXIST/.test(message)) return reply(409, {error: 'INVITATION_CONFLICT'});
        return reply(503, {error: 'INVITATION_UNAVAILABLE'});
      }
      const invite = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
      if (!invite || !uuid.test(invite.id || '') || !uuid.test(invite.token || '') || invite.email !== input.email.trim().toLowerCase() || invite.role !== input.role || typeof invite.delivery_required !== 'boolean') return reply(503, {error: 'INVITATION_UNAVAILABLE'});
      if (!invite.delivery_required) return reply(202, {status: 'accepted', delivery: 'already_requested'});
      // No PKCE challenge belongs to the Owner browser. The recipient authenticates in their own browser.
      const otpUrl = new URL(`${base}/auth/v1/otp`);
      otpUrl.searchParams.set('redirect_to', `${origin}/join/${invite.token}`);
      try {
        const delivery = await requestFetch(otpUrl.href, {method: 'POST', headers: publicHeaders, signal: AbortSignal.timeout(10000), body: JSON.stringify({email: invite.email, create_user: true})});
        // Never expose Auth response bodies: user existence and transport details are private.
        return reply(202, {status: 'accepted', delivery: delivery.ok ? 'requested' : 'unconfirmed'});
      } catch {
        // The reservation remains consumed after ambiguous transport failure; a fresh request is cooldown-gated.
        return reply(202, {status: 'accepted', delivery: 'unconfirmed'});
      }
    } catch { return reply(503, {error: 'INVITATION_UNAVAILABLE'}); }
  };
}
