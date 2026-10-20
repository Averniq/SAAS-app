import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export async function startPrinterSimulator({
  host = "127.0.0.1",
  port = 0,
  mode = "capture",
  disconnectAfter = 32,
  outputDir,
} = {}) {
  if (
    !["capture", "refuse", "disconnect_after_n_bytes", "stall"].includes(mode)
  )
    throw Error("Invalid simulator mode");
  const captures = [],
    sockets = new Set();
  let connectionCount = 0;
  const server = net.createServer((socket) => {
    connectionCount++;
    sockets.add(socket);
    const chunks = [];
    let size = 0;
    socket.on("error", () => {});
    socket.on("data", (data) => {
      if (mode === "stall") {
        socket.pause();
        return;
      }
      chunks.push(data);
      size += data.length;
      if (
        size > 1024 * 1024 ||
        mode === "refuse" ||
        (mode === "disconnect_after_n_bytes" && size >= disconnectAfter)
      )
        socket.destroy();
    });
    socket.on("close", async () => {
      sockets.delete(socket);
      const buffer = Buffer.concat(chunks);
      captures.push(buffer);
      if (outputDir) {
        await mkdir(outputDir, { recursive: true });
        await writeFile(
          outputDir + "/capture-" + Date.now() + "-" + connectionCount + ".bin",
          buffer,
        );
      }
    });
    if (mode === "refuse") socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    address: server.address(),
    captures,
    get connectionCount() {
      return connectionCount;
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(resolve);
      }),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.argv[2] || "127.0.0.1",
    port = Number(process.argv[3] || 19100),
    mode = process.argv[4] || "capture";
  const s = await startPrinterSimulator({
    host,
    port,
    mode,
    outputDir: ".local-print/captures",
  });
  console.log(
    "Synthetic ESC/POS simulator listening on " +
      s.address.address +
      ":" +
      s.address.port +
      " (" +
      mode +
      ")",
  );
}
