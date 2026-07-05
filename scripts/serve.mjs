import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT || 4175);
const root = resolve(process.cwd(), "dist");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const candidate = resolve(join(root, relative));
  return candidate.startsWith(root) ? candidate : null;
}

createServer(async (request, response) => {
  try {
    let file = safePath(request.url || "/");
    if (!file) throw new Error("Invalid path");
    if ((request.url || "/").split("?")[0] === "/") file = join(root, "index.html");

    try {
      const details = await stat(file);
      if (details.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(root, "index.html");
    }

    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=0"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Aveniq preview error: ${error.message}`);
  }
}).listen(port, () => {
  console.log(`Aveniq is running at http://localhost:${port}`);
});
