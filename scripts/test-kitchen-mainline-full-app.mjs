import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { resolve, join, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  localConfig,
  localSql,
  jobEvidence,
} from "./kitchen-print-fault-fixture.mjs";
const root = process.cwd(),
  origin = "http://127.0.0.1:58140",
  publicRoot = resolve(".local-print/mainline-web"),
  config = await localConfig(),
  fixture = JSON.parse(
    await readFile(".local-print/emulator-fixture.json", "utf8"),
  );
const built = spawnSync(process.execPath, ["scripts/build-site.mjs"], {
  encoding: "utf8",
  env: {
    ...process.env,
    AVENIQ_PUBLIC_CONFIG_MODE: "development",
    AVENIQ_SUPABASE_URL: origin,
    AVENIQ_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
  },
});
assert.equal(built.status, 0, built.stderr);
await mkdir(publicRoot, { recursive: true });
await cp("dist", publicRoot, { recursive: true });
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, origin);
    if (
      u.pathname.startsWith("/auth/v1/") ||
      u.pathname.startsWith("/rest/v1/")
    ) {
      const chunks = [];
      for await (const b of req) chunks.push(b);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      const r = await fetch("http://127.0.0.1:58031" + u.pathname + u.search, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
      requests.push({ method: req.method, path: u.pathname, status: r.status });
      res.writeHead(r.status, {
        "content-type": r.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      });
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let path =
      u.pathname === "/" || !extname(u.pathname)
        ? "index.html"
        : decodeURIComponent(u.pathname.slice(1));
    const full = resolve(publicRoot, path);
    if (
      !full.startsWith(publicRoot + sep) &&
      full !== join(publicRoot, "index.html")
    )
      throw Error("Path outside public build");
    const type =
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
      }[extname(full)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(await readFile(full));
  } catch {
    res.writeHead(404);
    res.end("Local test resource unavailable");
  }
});
await new Promise((ok, no) => {
  server.once("error", no);
  server.listen(58140, "127.0.0.1", ok);
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(name, body) {
  const r = await fetch("http://127.0.0.1:58031/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: config.ANON_KEY,
      authorization: "Bearer " + fixture.accessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert(r.ok, "Real local RPC " + name + " HTTP" + r.status);
  return r.json();
}
async function browser() {
  const profile = await mkdtemp(join(tmpdir(), "aveniq-mainline-e2e-"));
  const proc = spawn(
    process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await delay(50);
    }
  }
  assert(port);
  const pages = await (
    await fetch("http://127.0.0.1:" + port + "/json")
  ).json();
  const ws = new WebSocket(
    pages.find((p) => p.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const pending = new Map();
  let id = 0;
  const exceptions = [];
  ws.addEventListener("message", ({ data }) => {
    const e = JSON.parse(data);
    if (e.id && pending.has(e.id)) {
      const p = pending.get(e.id);
      pending.delete(e.id);
      clearTimeout(p.timer);
      e.error ? p.reject(Error(e.error.message)) : p.resolve(e.result);
    } else if (e.method === "Runtime.exceptionThrown")
      exceptions.push(e.params.exceptionDetails.text);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(Error("CDP timeout " + method));
      }, 15000);
      pending.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(r.exceptionDetails, undefined, "Browser evaluation threw");
    return r.result.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await delay(250);
    }
    throw Error("Browser timeout " + label);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["https://*"] });
  return {
    send,
    evaluate,
    wait,
    exceptions,
    navigate: async (path) => {
      await send("Page.navigate", { url: origin + path });
      await wait(
        'document.readyState==="complete" && Boolean(window.TableOrderCloud)',
        "application load",
      );
    },
    close: async () => {
      ws.close();
      proc.kill();
      await new Promise((r) => proc.once("exit", r));
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    },
  };
}
let owner, customer;
const checks = [];
const pass = (label) => {
  checks.push(label);
  console.log("PASS " + label);
};
try {
  const table = JSON.parse(
    localSql(
      `select row_to_json(t) from public.tables t where restaurant_id='${fixture.rid}' limit 1;`,
    ),
  );
  const restaurant = JSON.parse(
    localSql(
      `select row_to_json(r) from public.restaurants r where id='${fixture.rid}';`,
    ),
  );
  const issued = await rpc("issue_public_qr_table_token", {
    p_restaurant_id: fixture.rid,
    p_table_id: table.id,
    p_expires_at: null,
  });
  assert(issued.token);
  owner = await browser();
  await owner.navigate("/dashboard/" + restaurant.slug + "/kitchen");
  await owner.wait(
    'document.getElementById("ownerEmail") && !document.getElementById("accountGateway").classList.contains("hidden")',
    "login form",
  );
  await owner.evaluate(
    'document.getElementById("ownerEmail").value=' +
      JSON.stringify(fixture.email) +
      ';document.getElementById("ownerPassword").value=' +
      JSON.stringify(fixture.password) +
      ';document.getElementById("ownerAuthForm").requestSubmit()',
  );
  await owner.wait(
    'Boolean(staffUser) && activeView==="kitchen" && state.menuItems?.length>0',
    "real authenticated Kitchen",
  );
  pass(
    "Real browser password login and complete mainline restaurant/menu/order load",
  );
  await owner.evaluate('document.querySelector("[data-view=setup]").click()');
  await owner.wait(
    'Boolean(document.querySelector("#kitchenPrintersSettings [data-kp=edit]"))',
    "actual Kitchen Printers management",
  );
  await owner.evaluate(
    "document.querySelector(" +
      JSON.stringify(
        '#kitchenPrintersSettings [data-kp=edit][data-id="' +
          fixture.printerId +
          '"]',
      ) +
      ").click()",
  );
  await owner.evaluate(
    'document.querySelector("#kp-printer-form [name=name]").value="Mainline E2E printer";document.getElementById("kp-printer-form").requestSubmit()',
  );
  await owner.wait(
    'document.querySelector("#kitchenPrintersSettings").textContent.includes("Mainline E2E printer")',
    "printer save persisted",
  );
  assert(
    (
      await rpc("list_kitchen_printers", { p_restaurant_id: fixture.rid })
    ).printers.some((p) => p.name === "Mainline E2E printer"),
  );
  pass("Actual Admin printer settings Save backed by tenant RPC");
  await owner.evaluate('document.querySelector("[data-view=kitchen]").click()');
  customer = await browser();
  await customer.navigate("/order/" + issued.token);
  await customer.wait(
    'Boolean(document.querySelector("[data-add]:not([disabled])"))',
    "real public QR catalogue",
  );
  await customer.evaluate(
    `document.querySelector('[data-category="Kitchen"]').click()`,
  );
  await customer.wait(
    `Boolean(document.querySelector('[aria-label="Add SYNTHETIC WAGYU"]'))`,
    "Kitchen menu item",
  );
  await customer.evaluate(
    `document.querySelector('[aria-label="Add SYNTHETIC WAGYU"]').click()`,
  );
  const note = "MAINLINE UI E2E " + randomUUID();
  await customer.evaluate(
    'document.getElementById("orderNote").value=' +
      JSON.stringify(note) +
      ';document.getElementById("orderNote").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("submitOrder").click()',
  );
  await customer.wait(
    '!document.getElementById("reviewOrderModal").classList.contains("hidden")',
    "review order visible",
  );
  await customer.evaluate(
    'document.getElementById("confirmReviewOrder").click();document.getElementById("confirmReviewOrder").click()',
  );
  await customer.wait(
    "Boolean(state.orders.find(o=>o.note===" +
      JSON.stringify(note) +
      ' && o.cloudStatus==="synced"))',
    "actual Confirm and Send to Kitchen",
  );
  const orders = JSON.parse(
    localSql(
      `select json_agg(o) from public.orders o where restaurant_id='${fixture.rid}' and note='${note}';`,
    ),
  );
  assert.equal(orders.length, 1, "Double confirm must create one order");
  const order = orders[0];
  const jobs = JSON.parse(
    localSql(
      `select json_agg(j) from public.kitchen_print_jobs j where restaurant_id='${fixture.rid}' and order_id='${order.id}';`,
    ),
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].state, "queued");
  assert.equal(order.status, "new");
  assert.equal(order.total, 10);
  assert.equal(order.paid_at, null);
  pass(
    "Public QR Review → double Confirm & Send → one trusted order and one immutable print job",
  );
  await owner.wait(
    'document.querySelector("#kitchenBoard").textContent.includes(' +
      JSON.stringify(note) +
      ")",
    "automatic Kitchen Display synchronization",
  );
  pass("Actual Kitchen Display automatically receives the same cloud order");
  await owner.evaluate(
    'document.querySelector("[data-view=frontdesk]").click()',
  );
  await owner.wait(
    'document.getElementById("frontdesk").textContent.includes("Table 5")',
    "actual Front Desk table/order",
  );
  assert(
    await owner.evaluate(
      "state.orders.some(o=>o.cloudId===" +
        JSON.stringify(order.id) +
        ' && o.status==="New")',
    ),
  );
  pass("Front Desk retains the same new unpaid cloud order");
  await owner.evaluate('document.querySelector("[data-view=kitchen]").click()');
  await mkdir("docs/evidence/kitchen-printing-mainline", { recursive: true });
  await owner.evaluate("window.scrollTo(0,0)");
  const shot = await owner.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "docs/evidence/kitchen-printing-mainline/full-app-kitchen.png",
    Buffer.from(shot.data, "base64"),
  );
  assert.equal(
    requests.filter((r) => r.status >= 400).length,
    0,
    "Actual Auth/REST app path must not hide schema errors",
  );
  assert.equal(owner.exceptions.length, 0);
  assert.equal(customer.exceptions.length, 0);
  await writeFile(
    ".local-print/mainline-e2e-fixture.json",
    JSON.stringify(
      {
        ...fixture,
        jobId: jobs[0].id,
        orderId: order.id,
        orderNumber: order.order_number,
      },
      null,
      2,
    ),
  );
  const result = {
    date: new Date().toISOString(),
    backend: "isolated local Supabase main24 + mainline printing candidate",
    browser:
      "actual headless Chrome DOM/UI, real local Auth/REST, external HTTPS blocked",
    checks,
    orderStatus: order.status,
    paidAt: order.paid_at,
    orderCount: orders.length,
    printJobCount: jobs.length,
    printJobState: jobs[0].state,
    apiErrors: requests.filter((r) => r.status >= 400),
    nativeDelivery:
      "PENDING separate Android test against this exact UI-created job",
    physicalHardware: "PENDING",
    production: "NOT ACCESSED",
  };
  await writeFile(
    "docs/evidence/kitchen-printing-mainline/full-app-e2e.json",
    JSON.stringify(result, null, 2) + "\n",
  );
} finally {
  await customer?.close();
  await owner?.close();
  await new Promise((r) => server.close(r));
}
