# Performance audit — 2026-08-12

## Scope and measurement limits

This review inspected the shipped static assets and code paths for customer ordering, Kitchen, Front Desk, reports, Supabase RPCs, and the PWA. Bundle transfer sizes were measured from the existing `dist` files with Node `zlib`. No production database telemetry, `EXPLAIN ANALYZE`, or Supabase Query Performance data was available, so query durations and scanned rows are not asserted.

## Measured frontend delivery

| Asset | Raw bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| `app.js` | 355,190 | 82,259 | 65,817 |
| `styles.css` | 151,537 | 23,973 | 19,505 |
| `supabase-client.js` | 39,997 | 8,228 | 7,199 |
| `index.html` | 55,382 | 10,608 | 8,774 |
| `vendor/qrcode.js` | 56,694 | 11,826 | 10,115 |

All routes load these scripts eagerly. The public QR menu therefore downloads and parses dashboard, Kitchen, reporting, attendance, and setup code. The five main assets total about 137 KB gzip before configuration and images. Route-level code splitting is a confirmed opportunity, but was not implemented because moving a monolithic, global-state application into modules is not low risk.

The supplied image set is 6,987,876 bytes. The main brand image is 940,354 bytes; menu JPEGs are commonly 146–333 KB. Menu photos are CSS backgrounds, so native lazy loading, responsive `srcset`, and decoding priority are unavailable. Convert them to `<img>` elements with sized responsive variants only as a separately tested UI change.

## Confirmed runtime findings

1. **High — operational polling was excessive.** A staff terminal polls every 3 seconds: up to 20 cycles/minute. Each cycle requests up to 500 orders with nested items and then payment records, sorts all orders, saves local state, and formerly rebuilt Kitchen, Front Desk, and Reports regardless of the visible view. This is now guarded when the tab is hidden and only the visible operational workspace is rebuilt. The team-list refresh now only runs on Setup.
2. **High — customer status polling is N requests per open tracked order.** Every 5 seconds the app executes one RPC for each unresolved order. Five tracked orders make 60 RPC/minute; ten make 120 RPC/minute per device. This needs a batched status RPC or a deliberate latest-order-only policy; neither is low risk without product confirmation.
3. **Medium — reports refetch on each Reports entry.** Dashboard and active-tab data are fetched on entry. Responses are guarded against stale rendering but not aborted. Cache results by range/tab only after defining freshness expectations.
4. **Medium — full menu/tables payload loads for operational routes.** The shared startup payload is useful to the customer shell but Kitchen and Reports do not need all menu data. Route-specific payloads are an architectural optimisation requiring API and UI validation.

## Supabase findings

- No client Realtime subscription was found; the app uses REST polling. The database publishes `orders`, but it is not consumed by this client.
- Existing tenant, order, payment, attendance, reporting, and foreign-key indexes cover the observed basic lookup patterns. No missing index is confirmed without query plans.
- `get_report_dashboard` aggregates the tenant's reporting history even for today's metrics. Report views also apply date filters after timezone conversion, which makes the existing `(restaurant_id, created_at)` index less effective for date ranges. Measure with `EXPLAIN (ANALYZE, BUFFERS)` and rewrite to timezone-correct UTC bounds before adding an index.
- Attendance reporting similarly casts `clock_in_at` to local date before filtering. Its existing restaurant/timestamp index can scope a tenant but cannot efficiently satisfy that date expression. Any rewrite must be validated across DST transitions.

## PWA and mobile findings

The service worker previously precached HTML, CSS, app JavaScript, and one logo but not the scripts needed by the HTML to start. It now precaches the native shell, Supabase config/client, and QR library. Restaurant-specific public menus are still online-only because their fetched data is not persisted; this is intentional until offline ordering/conflict behaviour is specified.

The service worker registers at `window.load`, which defers installation/cache warm-up. Registering earlier may improve first visit resilience, but it changes startup contention and was not changed without field measurements.

## Follow-up measurement plan

1. Capture per-route Web Vitals and resource transfer under a throttled 4G profile for a representative 20-, 100-, and 300-item menu.
2. Record Supabase query duration, calls/minute, and `EXPLAIN ANALYZE` for polling, each reporting RPC, and attendance reporting with realistic tenant data.
3. Measure Kitchen interaction latency with 50/200 active orders after deploying the polling guard.
4. Decide whether order updates should migrate from polling to a tenant-scoped Realtime channel, then test reconnection and state ordering before implementation.
