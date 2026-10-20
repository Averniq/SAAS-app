import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPrinterSettings } from "../../src/kitchen-printing/printer-settings.js";
test("manager settings provide setup, bounded controls and no false physical success", () => {
  const html = renderPrinterSettings(
    {
      printers: [],
      devices: [],
      categories: [],
      pairings: [],
      control: { enabled: false },
    },
    "owner",
  );
  assert.match(html, /Kitchen Printers/);
  assert.match(html, /1.*2.*3/s);
  assert.match(html, /foreground/);
  assert.match(html, /Not Configured/);
});
test("Kitchen staff receive operational tools without configuration form", () => {
  const html = renderPrinterSettings(
    {
      printers: [{ id: "x", name: "<img src=x>", ip: null, enabled: true }],
      devices: [],
      categories: [],
      pairings: [],
      control: {},
    },
    "kitchen",
  );
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /id="kp-printer-form"/);
  assert.match(html, /Test Print/);
});
