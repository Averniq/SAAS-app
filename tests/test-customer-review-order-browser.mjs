#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const customerUrl = process.env.P0_LOCAL_CUSTOMER_URL;
assert.match(customerUrl || "", /^http:\/\/localhost:4177\/order\/[^/?#]+$/, "Set P0_LOCAL_CUSTOMER_URL to an existing local canonical token route.");
const result = spawnSync(process.execPath, ["scripts/diagnose-local-token-browser.mjs", customerUrl, "--assert-customer-startup", "--assert-review-order"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
process.stdout.write(result.stdout.replace(/(\/order\/)[^/?#\s"]+/g, "$1<redacted>"));
assert.equal(result.status, 0, result.stderr || "Review Order browser regression failed.");
console.log("Customer Review Order browser regression: PASS");
