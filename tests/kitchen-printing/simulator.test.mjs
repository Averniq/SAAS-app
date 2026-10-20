import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startPrinterSimulator } from "../../scripts/escpos-printer-simulator.mjs";
test("TCP simulator captures exact bytes and copy/cut sequence", async () => {
  const s = await startPrinterSimulator({ host: "127.0.0.1", port: 0 });
  try {
    await new Promise((resolve, reject) => {
      const c = net.connect(s.address.port, "127.0.0.1", () =>
        c.end(Buffer.from([27, 64, 65, 10, 29, 86, 0])),
      );
      c.on("close", resolve);
      c.on("error", reject);
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(s.captures.length, 1);
    assert.deepEqual([...s.captures[0]], [27, 64, 65, 10, 29, 86, 0]);
  } finally {
    await s.close();
  }
});
test("TCP simulator closes a partial stream for uncertainty tests", async () => {
  const s = await startPrinterSimulator({
    host: "127.0.0.1",
    port: 0,
    mode: "disconnect_after_n_bytes",
    disconnectAfter: 3,
  });
  try {
    await new Promise((resolve) => {
      const c = net.connect(s.address.port, "127.0.0.1", () =>
        c.write(Buffer.alloc(100)),
      );
      c.on("error", () => {});
      c.on("close", resolve);
    });
    assert.ok(s.captures[0].length >= 3);
  } finally {
    await s.close();
  }
});
