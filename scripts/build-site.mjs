import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const localConfig = process.env.KITCHEN_LOCAL_CONFIG ? (await import('./kitchen-local-config.mjs')).validateLocalBackend(JSON.parse(await readFile(process.env.KITCHEN_LOCAL_CONFIG,'utf8')),process.env.KITCHEN_NATIVE_DEBUG === '1') : null;
const publicFiles = [
  "index.html",
  "styles.css",
  "offline.html",
  "app.js",
  "mobile-shell.js",
  "manifest.webmanifest",
  "service-worker.js",
  "supabase-client.js",
  "supabase-config.js"
];
const publicFolders = ["icons", "assets"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => file === "supabase-config.js" && localConfig ? writeFile(resolve(output,file),`window.TABLEORDER_SUPABASE = ${JSON.stringify({url:localConfig.origin,publishableKey:localConfig.publishableKey,kitchenLocalReadOnlyCompatibility:true,restaurantSlug:"",staffUsername:"",staffEmail:""})};\n`) : cp(resolve(root, file), resolve(output, file))));
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

await cp(resolve(root,'src/kitchen-printing'),resolve(output,'src/kitchen-printing'),{recursive:true});
if(localConfig) await writeFile(resolve(output,'kitchen-print-backend.json'),JSON.stringify(localConfig));
