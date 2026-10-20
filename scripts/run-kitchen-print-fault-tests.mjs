import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { startPrinterSimulator } from "./escpos-printer-simulator.mjs";
import {
  createFaultFixture,
  jobEvidence,
  localOrigin,
} from "./kitchen-print-fault-fixture.mjs";
const serial = process.argv[process.argv.indexOf("--emulator") + 1];
assert.equal(serial, "emulator-5554", "Explicit dedicated emulator required");
const env = JSON.parse(
  await readFile(".tools/android/environment.json", "utf8"),
);
const adb = path.join(env.ANDROID_HOME, "platform-tools/adb.exe");
const call = (args, options = {}) =>
  spawnSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
assert.equal(call(["shell", "getprop", "ro.kernel.qemu"]).stdout.trim(), "1");
assert.match(call(["emu", "avd", "name"]).stdout, /aveniq-kitchen-p0/);
const backend = JSON.parse(
  await readFile("android/app/src/main/assets/kitchen-backend.json", "utf8"),
);
assert.equal(
  backend.url,
  "http://10.0.2.2:57635",
  "Build isolated fault APK against loopback proxy57635 first",
);
await mkdir(".local-print/faults", { recursive: true });
const simulator = await startPrinterSimulator({
  host: "127.0.0.1",
  port: 19130,
});
let dropFinish = false,
  dropped = 0,
  finishResponses = 0,
  finishAttempts = 0;
const proxy = http.createServer(async (req, res) => {
  if (req.url === "/rest/v1/rpc/finish_kitchen_print_attempt") finishAttempts++;
  try {
    const chunks = [];
    for await (const b of req) chunks.push(b);
    const r = await fetch(localOrigin + req.url, {
      method: req.method,
      headers: { ...req.headers, host: "127.0.0.1:57631" },
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const data = Buffer.from(await r.arrayBuffer());
    if (req.url === "/rest/v1/rpc/finish_kitchen_print_attempt" && r.ok) {
      finishResponses++;
      if (dropFinish) {
        dropFinish = false;
        dropped++;
        res.destroy();
        return;
      }
    }
    res.writeHead(r.status, {
      "content-type": r.headers.get("content-type") || "application/json",
    });
    res.end(data);
  } catch {
    res.destroy();
  }
});
await new Promise((resolve, reject) => {
  proxy.once("error", reject);
  proxy.listen(57635, "127.0.0.1", resolve);
});
const results = [];
const packageName = "com.aveniq.kitchen";
function argsFor(f, method, extra = {}) {
  const values = {
    staffJwt: f.accessToken,
    operatorId: f.uid,
    restaurantId: f.rid,
    printerId: f.printerId,
    jobId: f.jobId,
    expiresAt: String(f.expiresAt),
    class:
      "com.aveniq.kitchen.printing.FaultInjectionInstrumentedTest#" + method,
    ...extra,
  };
  return [
    "shell",
    "am",
    "instrument",
    "-w",
    ...Object.entries(values).flatMap(([k, v]) => ["-e", k, String(v)]),
    packageName + ".test/androidx.test.runner.AndroidJUnitRunner",
  ];
}
function instrument(f, method, extra) {
  const proc = spawn(adb, ["-s", serial, ...argsFor(f, method, extra)], {
    windowsHide: true,
  });
  let output = "";
  proc.stdout.on("data", (b) => (output += b));
  proc.stderr.on("data", (b) => (output += b));
  const done = new Promise((resolve) =>
    proc.on("close", (code) => resolve({ code, output })),
  );
  return { proc, done };
}
async function waitFor(predicate, label, ms = 45000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const r = await predicate();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error("Timeout: " + label);
}
const nonempty = () => simulator.captures.filter((b) => b.length);
async function pairedDevice(f, name) {
  const secret = randomBytes(32).toString("hex");
  const pair = await f.rpc("begin_kitchen_print_pairing", {
    p_restaurant_id: f.rid,
    p_device_name: name,
    p_secret_hash: createHash("sha256").update(secret).digest("hex"),
  });
  await f.rpc("approve_kitchen_print_pairing", {
    p_pairing_id: pair.id,
    p_printer_ids: [f.printerId],
  });
  const d = await f.rpc("activate_kitchen_print_pairing", {
    p_pairing_id: pair.id,
    p_secret: secret,
  });
  return { p_device_id: d.deviceId, p_device_secret: secret };
}
function unchanged(before, after) {
  for (const key of [
    "orderStatus",
    "paidAt",
    "orderFingerprint",
    "itemsFingerprint",
    "paymentsFingerprint",
  ])
    assert.equal(after[key], before[key], key + " changed during printing");
}
try {
  for (const apk of [
    "android/app/build/outputs/apk/debug/app-debug.apk",
    "android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
  ]) {
    const r = call(["install", "-r", apk]);
    assert.equal(r.status, 0, "Dedicated emulator install");
  }
  for (const scenario of [
    "before_connect",
    "during_write",
    "after_tcp_write",
    "before_ack",
    "before_ack_quarantined_lost_ack",
  ]) {
    const point =
      scenario === "before_ack_quarantined_lost_ack" ? "before_ack" : scenario;
    const late = scenario === "before_ack_quarantined_lost_ack";
    const f = await createFaultFixture(19130);
    const before = jobEvidence(f);
    const index = nonempty().length;
    call([
      "shell",
      "run-as",
      packageName,
      "rm",
      "-f",
      "files/fault-checkpoint.json",
    ]);
    const attempt = instrument(f, "crashAtCheckpoint", { checkpoint: point });
    const marker = await waitFor(() => {
      const r = call([
        "shell",
        "run-as",
        packageName,
        "cat",
        "files/fault-checkpoint.json",
      ]);
      try {
        const m = JSON.parse(r.stdout);
        return m.point === point ? m : null;
      } catch {
        return null;
      }
    }, "real native " + point);
    assert.equal(jobEvidence(f).state, "dispatching");
    const stopped = call(["shell", "am", "force-stop", packageName]);
    assert.equal(stopped.status, 0);
    await waitFor(
      () => !call(["shell", "pidof", packageName]).stdout.trim(),
      "process termination",
    );
    await attempt.done; // killed instrumentation is intentional; never counted as a passed test
    if (point !== "before_connect")
      await waitFor(() => nonempty().length > index, "socket close capture");
    if (late) {
      const observer = await pairedDevice(f, "QUARANTINE OBSERVER");
      await new Promise((r) => setTimeout(r, 31000));
      assert.equal(await f.rpc("claim_kitchen_printer_job", observer), null);
      assert.equal(jobEvidence(f).state, "uncertain");
      dropFinish = true;
    }
    const dropStart = dropped,
      replyStart = finishResponses,
      requestStart = finishAttempts;
    const expectedState =
      point === "before_ack" && !late ? "transmitted" : "uncertain";
    const recovery = await instrument(f, "recoverWithoutReprinting", {
      expectedState,
    }).done;
    await writeFile(
      ".local-print/faults/" + scenario + "-recovery.log",
      recovery.output,
    );
    assert.match(
      recovery.output,
      /OK \(1 test\)/,
      "Recovery instrumentation must pass",
    );
    if (late) {
      assert.equal(dropped - dropStart, 1);
      assert(finishResponses - replyStart >= 2);
      assert(finishAttempts - requestStart >= 3);
    }
    const captures = nonempty().slice(index),
      after = jobEvidence(f);
    assert.equal(captures.length, point === "before_connect" ? 0 : 1);
    assert.equal(after.state, expectedState);
    assert.equal(after.attemptCount, 1);
    assert.equal(after.attemptRows, 1);
    unchanged(before, after);
    if (point === "during_write") assert.equal(captures[0].length, 4096);
    if (point === "after_tcp_write" || point === "before_ack")
      assert(captures[0].length > 4096);
    results.push({
      scenario,
      result: "PASS",
      droppedHttpResponses: dropped - dropStart,
      successfulAckResponses: finishResponses - replyStart,
      ackRequestCount: finishAttempts - requestStart,
      realProcessTerminated: true,
      killedPid: marker.pid,
      journalPhase: marker.phase,
      journalOutcome: marker.outcome,
      nonemptyConnections: captures.length,
      capturedBytes: captures.reduce((n, b) => n + b.length, 0),
      ...after,
    });
    console.log(
      "PASS real emulator force-stop " +
        scenario +
        "; recovery=" +
        after.state +
        "; no automatic resend",
    );
  }
  const f = await createFaultFixture(19130),
    baseline = jobEvidence(f),
    index = nonempty().length,
    startReplies = finishResponses,
    startDropped = dropped;
  dropFinish = true;
  const lost = await instrument(f, "lostAcknowledgement", {}).done;
  await writeFile(".local-print/faults/lost-ack.log", lost.output);
  assert.match(lost.output, /OK \(1 test\)/);
  assert.equal(dropped - startDropped, 1);
  assert(finishResponses - startReplies >= 2);
  const end = jobEvidence(f);
  unchanged(baseline, end);
  assert.equal(end.state, "transmitted");
  assert.equal(end.attemptCount, 1);
  assert.equal(end.attemptRows, 1);
  assert.equal(nonempty().length - index, 1);
  results.push({
    scenario: "lost_server_acknowledgement",
    result: "PASS",
    droppedRealHttpResponses: dropped - startDropped,
    finishRequests: finishResponses - startReplies,
    nonemptyConnections: 1,
    ...end,
  });
  console.log(
    "PASS lost real HTTP finish response; acknowledgement retried without TCP resend",
  );
  const g = await createFaultFixture(19130);
  const devices = await Promise.all([
    pairedDevice(g, "CONCURRENT TABLET A"),
    pairedDevice(g, "CONCURRENT TABLET B"),
  ]);
  const claims = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      g.rpc("claim_kitchen_printer_job", devices[i % 2]),
    ),
  );
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(jobEvidence(g).attemptCount, 1);
  results.push({
    scenario: "two_tablets_concurrent_claims",
    result: "PASS",
    registeredDevices: 2,
    concurrentRequests: 20,
    winningClaims: 1,
  });
  console.log(
    "PASS 20 concurrent claims from two registered device credentials; one winner",
  );
  const evidence = {
    date: new Date().toISOString(),
    environment:
      "dedicated API36 emulator + isolated local Supabase + loopback TCP simulator",
    faultInjection:
      "package-private instrumentation seam, actual adb force-stop; real loopback HTTP response dropped after server commit",
    apkSha256: createHash("sha256")
      .update(
        await readFile("android/app/build/outputs/apk/debug/app-debug.apk"),
      )
      .digest("hex"),
    results,
    paperOutput: "NOT TESTED",
    production: "NOT ACCESSED",
  };
  await writeFile(
    "docs/evidence/kitchen-printing/fault-injection-results.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
} finally {
  call(["shell", "am", "force-stop", packageName]);
  await simulator.close();
  await new Promise((r) => proxy.close(r));
}
