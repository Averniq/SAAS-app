import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
assert.match(
  app,
  /step === "tables" && details\.choice === "sample_tables"\)\) await window\.TableOrderCloud\.createSampleVenueData\(\)/,
  "Selecting Sample tables must create active tables before the QR step."
);
console.log("Sample-tables onboarding regression check passed.");
