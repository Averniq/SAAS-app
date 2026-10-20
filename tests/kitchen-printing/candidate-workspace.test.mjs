import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
import { materializeKitchenCandidate } from "../../scripts/materialize-kitchen-print-candidate.mjs";
test("refuse existing destination and remote database", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "aveniq-print-"));
  try {
    await assert.rejects(
      materializeKitchenCandidate({
        destination: root,
        projectId: "print-test",
        ports: { api: await freePort(), db: await freePort() },
        candidateFiles: [],
      }),
      /exists/,
    );
    await assert.rejects(
      materializeKitchenCandidate({
        destination: path.join(root, "new"),
        databaseUrl: "postgresql://remote/db",
        projectId: "print-test",
        ports: { api: await freePort(), db: await freePort() },
        candidateFiles: [],
      }),
      /local/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("verify and copy exactly the canonical baseline", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "aveniq-print-"));
  try {
    const m = await materializeKitchenCandidate({
      destination: path.join(root, "new"),
      projectId: "print-test",
      ports: { api: await freePort(), db: await freePort() },
      candidateFiles: [],
    });
    assert.equal(m.canonical.length, 22);
    assert.equal(m.candidates.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
