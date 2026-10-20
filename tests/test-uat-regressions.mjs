import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const baseline = JSON.parse(
  await readFile("supabase/kitchen-print-mainline-baseline.json", "utf8"),
);
const hash = (s) =>
  createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
test("all24 actual main migrations retain their hashes and exact source set", async () => {
  const actual = (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    actual,
    baseline.canonicalChain.map((f) => f.filename),
  );
  for (const f of baseline.canonicalChain)
    assert.equal(
      hash(await readFile("supabase/migrations/" + f.filename, "utf8")),
      f.sha256,
      f.filename,
    );
});
test("main auth, cloud, staff transport, routing, dependencies and lockfile remain intact", async () => {
  for (const [p, h] of Object.entries(baseline.protectedFiles)) {
    let s = await readFile(p, "utf8");
    if (p === "app.js")
      s = s.slice(0, s.indexOf("\nwindow.getKitchenPrintContext ="));
    if (p === "scripts/build-site.mjs")
      s = s.replace('["assets", "src/kitchen-printing"]', '["assets"]');
    assert.equal(hash(s), h, p + " unexpectedly replaced main implementation");
  }
  assert.deepEqual(
    JSON.parse(await readFile("package.json", "utf8")).dependencies,
    baseline.dependencies,
  );
});
function coherent(html, worker) {
  for (const file of ["app.js", "styles.css"]) {
    const asset = html.match(
      new RegExp("/" + file.replace(".", "\\.") + '\\?v=[^"\\s]+'),
    )?.[0];
    assert(asset, "Versioned " + file + " missing");
    assert(
      worker.includes(JSON.stringify(asset)),
      file + " absent or stale in shell",
    );
  }
  const shell = worker.match(/aveniq-shell-v(\d+)/)?.[1],
    runtime = worker.match(/aveniq-runtime-v(\d+)/)?.[1];
  assert(shell && runtime);
  assert.equal(shell, runtime, "Shell/runtime generation must agree");
}
test("UAT validates actual HTML/SW asset coherence, not obsolete snapshot literals", async () => {
  const html = await readFile("index.html", "utf8"),
    worker = await readFile("service-worker.js", "utf8");
  coherent(html, worker);
  assert.throws(
    () => coherent(html.replace("/app.js?v=", "/app.js?v=stale-"), worker),
    /stale/,
  );
  assert.throws(
    () =>
      coherent(
        html,
        worker.replace(/aveniq-runtime-v\d+/, "aveniq-runtime-v0"),
      ),
    /generation/,
  );
});
test("main QR, recovery, staff and table UI contracts coexist with additive printing mounts", async () => {
  const html = await readFile("index.html", "utf8");
  for (const id of [
    "ownerAuthForm",
    "restaurantSelectionPanel",
    "restaurantInviteForm",
    "restaurantTeamList",
    "tableForm",
    "reviewOrderModal",
    "confirmReviewOrder",
    "kitchenBoard",
    "frontdesk",
    "kitchenPrintersSettings",
    "kitchenPrintStatus",
  ])
    assert(html.includes('id="' + id + '"'), id);
  assert(html.includes("/vendor/recovery-auth.js?v=20261013-pkce"));
  assert(html.includes("/src/kitchen-printing/native-agent.js"));
});
