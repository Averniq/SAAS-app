# Mobile and PWA foundation

Merchant navigation becomes a five-action safe-area bottom bar below 640px for Owners and Managers; desktop tabs remain unchanged. Public ordering keeps merchant navigation hidden. The service worker caches only the versioned application shell and static assets. It never handles API writes or caches Supabase responses. Navigation falls back to `offline.html` only when no network/shell response exists.

Offline mode shows a persistent banner and does not claim writes succeeded. Existing write paths surface their network errors; a reconnect triggers a safe order refresh. Raw tenant data is never persisted by the service worker.

Known limitation: install icons use the supplied SVG maskable icon; validate install prompts, iOS home-screen icon rendering, and all 320–768px flows manually before wrapping with a native shell.
