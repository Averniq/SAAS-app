import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
const rootMenuRedirect = /\[\[redirects\]\]\s*from\s*=\s*"\/"\s*to\s*=\s*"\/order\/sake-street\/table-1"\s*status\s*=\s*302/;

assert.match(config, rootMenuRedirect, "the production root must enter the Sake Street menu");
assert.ok(
  config.search(rootMenuRedirect) < config.search(/\[\[redirects\]\]\s*from\s*=\s*"\/\*"/),
  "the exact root redirect must be evaluated before the SPA fallback"
);

console.log("Production root menu redirect check passed.");
