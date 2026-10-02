import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from 'node:vm';
import { validateSupabaseOrigin, isPublishableCredential, isServiceCredential } from './supabase-origin.mjs';

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
  if (mode !== "development" && (!url || !publishableKey)) {
    throw new Error("AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY are required for production builds.");
  }
  if (url && publishableKey) {
    return publicConfigSource({ url, publishableKey, source: "AVENIQ_SUPABASE_URL and AVENIQ_SUPABASE_PUBLISHABLE_KEY" });
  }
  // Development retains the checked-in local configuration only when an
  // explicit public environment pair was not supplied. Production never does.
  try {
    const source = await readFile(resolve(root, 'supabase-config.js'), 'utf8');
    if (isServiceCredential(source)) throw new Error();
    const context = vm.createContext({ window: {} });
    vm.runInContext(source, context, { timeout: 1000 });
    return publicConfigSource({ ...context.window.TABLEORDER_SUPABASE, source: 'validated development public config' });
  } catch { throw new Error('Development public configuration is invalid.'); }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(resolve(root, file), resolve(output, file))));
await writeFile(resolve(output, "supabase-config.js"), await buildPublicConfig(), "utf8");
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
