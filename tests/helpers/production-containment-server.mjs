// Isolated browser fixture only. No upstream requests or Production credentials.
// Run: node tests/helpers/production-containment-server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const port = 4180;
function fixtureBootstrap() {
  if (window.containmentFixture) return;
  const restaurant = { id: '10000000-0000-4000-8000-000000000001', name: 'Sake Street', slug: 'sake-street', is_open: true, ordering_enabled: true };
  const menu_items = Array.from({ length: 71 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    local_id: `fixture-item-${index + 1}`, name: index === 0 ? 'Karaage ramen' : `Fixture dish ${index + 1}`,
    category: `Category ${index % 12 + 1}`, price: index === 0 ? 19 : 10,
    description: 'Synthetic isolated browser fixture', is_active: true, is_available: true,
    sold_out: false, option_template: index === 0 ? 'spiceAddons' : 'none'
  }));
  window.TABLEORDER_SUPABASE = { url: 'https://fixture.invalid', publishableKey: 'fixture-only', restaurantSlug: '' };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: async () => ({}), getRegistrations: async () => [], addEventListener() {}, controller: null
  } });
  // The real localhost shell also enumerates caches; keep this fixture read/write
  // isolated from any pre-existing browser CacheStorage entries.
  Object.defineProperty(window, 'caches', { configurable: true, value: { keys: async () => [] } });
  const calls = [];
  const orders = new Map();
  window.containmentFixture = { calls, orders };
  const unavailable = location.pathname === '/order/unavailable-fixture';
  const draftKey = 'aveniq-public-order:unavailable-fixture';
  if (unavailable && !sessionStorage.getItem(draftKey)) sessionStorage.setItem(draftKey, JSON.stringify({
    cart: [{ id: 'fixture-cart', itemId: 'fixture-item-1', menuItemCloudId: menu_items[0].id, name: 'Karaage ramen', price: 19, quantity: 2, options: [] }],
    note: 'Preserve synthetic fixture draft', idempotencyKey: '30000000-0000-4000-8000-000000000001'
  }));
  const initialUnavailableDraft = sessionStorage.getItem(draftKey);
  function updateDiagnostics() {
    if (!document.body) return;
    let output = document.getElementById('containmentFixtureStatus');
    if (!output) {
      output = document.createElement('pre');
      output.id = 'containmentFixtureStatus';
      output.setAttribute('aria-label', 'Isolated fixture diagnostics');
      output.style.cssText = 'position:relative;z-index:9999;display:block;background:#fff;color:#111;padding:12px;white-space:pre-wrap;font-size:12px';
      document.body.append(output);
    }
    const endpointCalls = {};
    for (const call of calls) endpointCalls[call.rpc] = (endpointCalls[call.rpc] || 0) + 1;
    output.textContent = JSON.stringify({
      fixtureOnly: true,
      endpointCalls,
      submissionCalls: calls.filter((call) => call.rpc === 'submit_public_qr_order').length,
      logicalMockOrders: orders.size,
      unavailableDraftBytesUnchanged: unavailable ? sessionStorage.getItem(draftKey) === initialUnavailableDraft : null,
      availableDraftPresent: Boolean(sessionStorage.getItem('aveniq-public-order:available-fixture'))
    }, null, 2);
  }
  document.addEventListener('DOMContentLoaded', updateDiagnostics, { once: true });
  // Includes storage changes made by the real application in this document;
  // storage events alone do not fire for same-document setItem/removeItem.
  setInterval(updateDiagnostics, 250);
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const rpc = url.pathname.split('/').pop();
    const body = JSON.parse(options.body || '{}');
    calls.push({ rpc, method: options.method || 'GET' });
    updateDiagnostics();
    if (url.origin !== 'https://fixture.invalid') throw new Error('Fixture blocked nonfixture fetch');
    if (rpc === 'get_public_restaurant') return response({ restaurant, menu_items, tables: [] });
    if (rpc === 'get_public_qr_order_context') {
      if (unavailable) return response({ code: 'PGRST202', message: 'Could not find canonical order context function' }, 404);
      if (location.pathname !== '/order/available-fixture') return response({ message: 'Invalid synthetic context' }, 403);
      return response({ restaurant, menu_items, table: { id: '40000000-0000-4000-8000-000000000001', name: 'Sake Table 1', number: 1 } });
    }
    if (rpc === 'submit_public_qr_order') {
      if (location.pathname !== '/order/available-fixture') throw new Error('Unexpected submission in unavailable fixture');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.p_idempotency_key || '')) return response({ message: 'UUID required' }, 400);
      const payload = JSON.stringify(body);
      const existing = orders.get(body.p_idempotency_key);
      if (existing && existing.payload !== payload) return response({ message: 'Divergent replay rejected' }, 409);
      if (!existing) orders.set(body.p_idempotency_key, { payload, result: { id: '50000000-0000-4000-8000-000000000001', order_number: 1 } });
      updateDiagnostics();
      return response(orders.get(body.p_idempotency_key).result);
    }
    if (rpc === 'get_public_qr_order_status') return response({ id: '50000000-0000-4000-8000-000000000001', status: 'new', payment_status: 'unpaid' });
    return response({ message: 'Fixture blocks unspecified endpoint' }, 403);
  };
}

const bootstrap = `(${fixtureBootstrap.toString()})();`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    res.setHeader('Cache-Control', 'no-store');
    // Defense in depth: CSS/images/scripts and browser APIs cannot reach remote hosts.
    res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; worker-src 'none'");
    if (pathname === '/supabase-config.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(bootstrap); return;
    }
    if (pathname === '/service-worker.js') { res.writeHead(404); res.end(); return; }
    const file = resolve(root, '.' + (extname(pathname) ? pathname : '/index.html'));
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    let data = await readFile(file);
    if (extname(file) === '.html') data = data.toString().replace('<head>', `<head><script>${bootstrap}</script>`);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log('Isolated containment browser fixture listening on port 4180; remote networking blocked.'));
