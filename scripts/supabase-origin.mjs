// Shared contract for browser configuration and privileged operator requests.
export function validateSupabaseOrigin(value, { allowLocal = false } = {}) {
  const invalid = () => { throw new Error('SUPABASE_URL_INVALID: require an origin-only hosted Supabase HTTPS URL or explicitly allowed loopback origin.'); };
  if (typeof value !== 'string' || !value.trim() || /[\\\s]/.test(value.trim())) invalid();
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(value.trim())) invalid();
  let url;
  try { url = new URL(value.trim()); } catch { invalid(); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || /[?#]/.test(value)) invalid();
  const hosted = url.protocol === 'https:' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co$/.test(url.hostname) && !url.port;
  const local = allowLocal && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && !/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/i.test(value.trim())) invalid();
  if (!hosted && !local) invalid();
  return url.origin;
}

export function isServiceCredential(value) {
  if (/sb_secret_|service[_-]?role/i.test(String(value))) return true;
  const parts = String(value).split('.');
  try { return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'service_role'; }
  catch { return false; }
}

export function isPublishableCredential(value) {
  const credential = String(value);
  if (isServiceCredential(credential)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(credential)) return true;
  const parts = credential.split('.');
  try { return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon'; }
  catch { return false; }
}
