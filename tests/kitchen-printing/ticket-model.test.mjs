import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicketModel,
  validatePrinter,
} from "../../src/kitchen-printing/ticket-model.js";
import { derivePrinterStatus } from "../../src/kitchen-printing/printer-status.js";
const snapshot = JSON.parse(await readFile(new URL("../fixtures/kitchen-ticket-v1.json", import.meta.url), "utf8"));

test("ticket retains tenant, notes, quantities, copies and Unicode without control bytes", () => {
  const m = buildTicketModel(snapshot);
  assert.equal(m.items[0].name, "和牛 @");
  assert.equal(m.items[0].notes, "Allergy note");
  assert.equal(m.copies, 3);
  assert.equal(m.tableName, "Table 5");
  assert.match(m.timeLabel, /12:35/);
});
test("invalid ticket never silently truncates or drops items", () => {
  assert.throws(() => buildTicketModel({ ...snapshot, copies: 4 }));
  assert.throws(() => buildTicketModel({ ...snapshot, items: [] }));
  assert.throws(() =>
    buildTicketModel({ ...snapshot, items: [{ name: "x", quantity: 0 }] }),
  );
});
test("printer literals are private and unambiguous; IP can be empty", () => {
  assert.equal(
    validatePrinter({ name: "A", ip: "", port: 9100, copies: 1 }).ip,
    null,
  );
  for (const ip of [
    "127.0.0.1",
    "169.254.169.254",
    "8.8.8.8",
    "010.1.2.3",
    "192.168.1.255",
    "http://192.168.1.2",
    "printer.local",
  ])
    assert.throws(() =>
      validatePrinter({ name: "A", ip, port: 9100, copies: 1 }),
    );
});
test("configured IP alone never produces Ready", () => {
  assert.equal(
    derivePrinterStatus(
      { printer: { ip: "192.168.1.2", enabled: true }, devices: [] },
      Date.now(),
    ),
    "Agent Offline",
  );
  assert.equal(
    derivePrinterStatus({ printer: { ip: null }, devices: [] }, Date.now()),
    "Not Configured",
  );
});
test("status uses recent assigned agent observation and attention precedence", () => {
  const now = Date.now();
  const printer = { id: "p", ip: "192.168.1.2", enabled: true };
  const devices = [
    {
      revoked_at: null,
      printer_ids: ["p"],
      last_seen_at: new Date(now).toISOString(),
      observations: {
        p: { reachable: true, observedAt: new Date(now).toISOString() },
      },
    },
  ];
  assert.equal(derivePrinterStatus({ printer, devices }, now), "Ready");
  assert.equal(
    derivePrinterStatus({ printer, devices }, now + 61000),
    "Agent Offline",
  );
  assert.equal(
    derivePrinterStatus(
      { printer: { ...printer, attention: true }, devices },
      now,
    ),
    "Attention Required",
  );
});
