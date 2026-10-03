import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSupabaseOrigin, isPublishableCredential } from './supabase-origin.mjs';

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "mobile-shell.js",
  "manifest.webmanifest",
  "service-worker.js",
  "supabase-client.js"
];
const publicFolders = ["assets"];

function configuredMode() {
  const explicit = String(process.env.AVENIQ_PUBLIC_CONFIG_MODE || "").trim().toLowerCase();
  if (explicit && !["development", "preview", "production"].includes(explicit)) {
    throw new Error("AVENIQ_PUBLIC_CONFIG_MODE must be development, preview, or production.");
  }
  if (process.env.CONTEXT === "production") {
    if (explicit && explicit !== "production") {
      throw new Error("AVENIQ_PUBLIC_CONFIG_MODE cannot override a production deployment context.");
    }
    return "production";
  }
  // Netlify deploy contexts cannot be downgraded to development fallback.
  if (["deploy-preview", "branch-deploy"].includes(process.env.CONTEXT)) return "preview";
  return explicit || "development";
}

function publicConfigSource({ url, publishableKey, source }) {
  const origin = validateSupabaseOrigin(url, { allowLocal: configuredMode() !== 'production' });
  if (!isPublishableCredential(publishableKey)) throw new Error('AVENIQ_SUPABASE_PUBLISHABLE_KEY must be a publishable key or anon JWT, never a service credential.');
  const config = { url: origin, publishableKey, restaurantSlug: "", staffUsername: "", staffEmail: "" };
  return `// Generated at build time from ${source}; safe for browser delivery.\nwindow.TABLEORDER_SUPABASE = ${JSON.stringify(config)};\n`;
}

async function buildPublicConfig() {
  const mode = configuredMode();
  const url = String(process.env.AVENIQ_SUPABASE_URL || "").trim();
  const publishableKey = String(process.env.AVENIQ_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (Boolean(url) !== Boolean(publishableKey)) {
    throw new Error("AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY must be supplied together.");
  }
  if (mode === "production" && (!url || !publishableKey)) {
    throw new Error("AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY are required for production builds.");
  }
  if (url && publishableKey) {
    return publicConfigSource({ url, publishableKey, source: "AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY" });
  }
  // No checked-in backend fallback in any mode. An unconfigured preview or
  // local build succeeds with a static disabled entrypoint and empty config.
  return '// Backend disabled: supply an explicit disposable public configuration pair.\nwindow.TABLEORDER_SUPABASE = {url:"",publishableKey:"",restaurantSlug:"",staffUsername:"",staffEmail:""};\n';
}

// Validate before replacing output; no invalid configured build can publish.
const publicConfig = await buildPublicConfig();
const backendDisabled = !String(process.env.AVENIQ_SUPABASE_URL || '').trim();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(resolve(root, file), resolve(output, file))));
await writeFile(resolve(output, "supabase-config.js"), publicConfig, "utf8");
if (backendDisabled) {
  // Do not execute the application, Auth client, or service-worker registration.
  // The restrictive meta policy also applies alongside Netlify's normal CSP.
  await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Aveniq — Backend disabled</title>
<style>body{font:18px system-ui;margin:3rem auto;padding:1rem;max-width:38rem;background:#fff;color:#17202a}</style></head>
<body><main><h1>Backend disabled</h1><p>This preview or local build has no backend connection.</p><p>Supply an explicit disposable AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY pair to enable the application.</p></main></body></html>`, 'utf8');
}
await Promise.all(
  publicFolders.map((folder) =>
    cp(resolve(root, folder), resolve(output, folder), { recursive: true, force: true })
  )
);
await mkdir(resolve(output, "vendor"), { recursive: true });
await cp(
  resolve(root, "node_modules", "qrcode-generator", "qrcode.js"),
  resolve(output, "vendor", "qrcode.js")
);

console.log(`Built ${publicFiles.length} public files, ${publicFolders.length} public folders and 1 QR vendor file in ${output}`);
