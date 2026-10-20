import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const origin = "http://127.0.0.1:57631";
const fixture = JSON.parse(
  await readFile(".local-print/emulator-fixture.json", "utf8"),
);
const raw = await readFile(".local-print/api-config.raw", "utf8");
const config = JSON.parse(raw.slice(raw.indexOf("{")));
if (config.API_URL !== origin) throw Error("Local only");
const html =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main style="max-width:1000px;margin:auto;padding:1rem"><p>LOCAL SYNTHETIC PRINTER COMPONENT TEST — no production connection</p><div id="fixture"></div></main><script type="module">import {mountKitchenPrinters} from "/src/kitchen-printing/printer-settings.js";const session=await fetch("/fixture-session").then(r=>r.json());const cloud={getSession:async()=>({access_token:session.accessToken}),request:async(path,options)=>{const r=await fetch("' +
  origin +
  '/rest/v1/"+path,{...options,headers:{apikey:session.anonKey,Authorization:"Bearer "+options.accessToken,"Content-Type":"application/json"}});const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d;}};mountKitchenPrinters({root:document.getElementById("fixture"),cloud,nativeAgent:null,staff:{id:session.uid,restaurantId:session.rid,role:new URLSearchParams(location.search).get("role")||"owner"}});</script></body></html>';
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/fixture-session") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ...fixture,
          anonKey: config.ANON_KEY,
          password: undefined,
          email: undefined,
        }),
      );
      return;
    }
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      return;
    }
    const rel = decodeURIComponent(url.pathname).slice(1);
    if (
      !(rel === "styles.css" || rel.startsWith("src/kitchen-printing/")) ||
      rel.includes("..")
    )
      throw Error("Denied");
    const data = await readFile(path.resolve(rel));
    res.setHeader(
      "Content-Type",
      rel.endsWith(".css") ? "text/css" : "text/javascript",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4177, "127.0.0.1", () =>
  console.log(
    "Local printer component fixture: http://127.0.0.1:4177 (synthetic only)",
  ),
);
