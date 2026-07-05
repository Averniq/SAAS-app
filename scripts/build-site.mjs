import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "mobile-shell.js",
  "manifest.webmanifest",
  "service-worker.js",
  "supabase-client.js",
  "supabase-config.js"
];
const publicFolders = [];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(resolve(root, file), resolve(output, file))));
await Promise.all(
  publicFolders.map((folder) =>
    cp(resolve(root, folder), resolve(output, folder), { recursive: true, force: true })
  )
);

console.log(`Built ${publicFiles.length} public files and ${publicFolders.length} public folders in ${output}`);
