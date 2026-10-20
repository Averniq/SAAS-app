import { readFile, mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (c) =>
  createHash("sha256").update(c.replace(/\r\n/g, "\n")).digest("hex");
export async function materializeKitchenCandidate({
  destination,
  projectId,
  ports,
  candidateFiles = [],
  databaseUrl,
}) {
  if (
    databaseUrl &&
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)
  )
    throw Error("Only local databases allowed");
  if (!/^[a-z][a-z0-9-]{3,60}$/.test(projectId))
    throw Error("Invalid isolated project ID");
  const dest = path.resolve(destination);
  if (await stat(dest).catch(() => null))
    throw Error("Destination exists; never overwrite a stack");
  const numbers = Object.values(ports);
  if (
    numbers.length < 2 ||
    new Set(numbers).size !== numbers.length ||
    numbers.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)
  )
    throw Error("Invalid ports");
  for (const port of numbers)
    await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", () => reject(Error("Port occupied: " + port)));
      s.listen(port, "127.0.0.1", () => s.close(resolve));
    });
  const manifest = JSON.parse(
    await readFile(path.join(root, "supabase/catalog-manifest.json"), "utf8"),
  );
  if (
    manifest.status !== "approved-local-canonical-chain" ||
    manifest.canonicalChain.length !== 22
  )
    throw Error("Unapproved baseline");
  const canonical = [];
  for (const e of manifest.canonicalChain) {
    const source = path.join(root, "supabase/migrations", e.filename);
    if (hash(await readFile(source, "utf8")) !== e.sha256)
      throw Error("Canonical hash mismatch: " + e.filename);
    canonical.push({ ...e, source });
  }
  const candidates = [];
  for (const file of candidateFiles) {
    const source = path.resolve(file);
    if (
      !source.startsWith(
        path.join(root, "supabase/kitchen-print-candidates") + path.sep,
      ) ||
      !/^\d{14}_[a-z0-9_]+\.sql$/.test(path.basename(source))
    )
      throw Error("Explicit candidate required");
    candidates.push({
      filename: path.basename(source),
      sha256: hash(await readFile(source, "utf8")),
      source,
    });
  }
  await mkdir(path.join(dest, "supabase/migrations"), { recursive: true });
  for (const e of [...canonical, ...candidates])
    await copyFile(
      e.source,
      path.join(dest, "supabase/migrations", e.filename),
    );
  let config = await readFile(path.join(root, "supabase/config.toml"), "utf8");
  config = config
    .replace(/project_id = "[^"]+"/, 'project_id = "' + projectId + '"')
    .replace("port = 54331", "port = " + ports.api)
    .replace("port = 54332", "port = " + ports.db)
    .replace(
      "shadow_port = 54330",
      "shadow_port = " + (ports.shadow ?? ports.db + 2),
    )
    .replace("port = 54333", "port = " + (ports.studio ?? ports.db + 3));
  await writeFile(path.join(dest, "supabase/config.toml"), config);
  const result = {
    projectId,
    ports,
    canonical: canonical.map(({ source, ...e }) => e),
    candidates: candidates.map(({ source, ...e }) => e),
  };
  await writeFile(
    path.join(dest, "kitchen-print-local.json"),
    JSON.stringify(result, null, 2),
  );
  return result;
}
