import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functionSource = app.slice(
  app.indexOf("function sakeStreetMenuPhotoUrl"),
  app.indexOf("function allMenuItems")
);
const photoFor = new Function(`${functionSource}; return sakeStreetMenuPhotoUrl;`)();

assert.equal(
  photoFor("Salmon nigiri (4p)"),
  "/assets/sake-street/menu/Salmon%20nigiri%20(4p).webp",
  "A named menu item must use its matching packaged image."
);
assert.equal(
  photoFor("Assorted sashimi & nigiri combo (10p)"),
  "/assets/sake-street/menu/Nigiri%20%26%20Sashimi%20combo%20(10p).webp",
  "Known menu-name wording differences must retain their matching image."
);
assert.equal(
  photoFor("Kimchi chicken"),
  "/assets/sake-street/menu/Kimchi%20chicken.webp",
  "A named image must remain available even when its menu item is not in the local fallback menu."
);
assert.equal(
  photoFor("Salmon Diamond"),
  "/assets/sake-street/menu/Salmon%20Diamond.webp",
  "Every named Sake Street menu image must be available by its menu name."
);
assert.equal(
  photoFor("Unpictured menu item"),
  "",
  "Items without a named image must continue using their existing presentation."
);

const publicMenuSource = app.slice(
  app.indexOf("async function initializePublicTenantMenu"),
  app.indexOf("renderTabs();")
);
const customer = { innerHTML: "" };
const classList = { add() {}, remove() {} };
const publicMenu = new Function(
  "window", "APP_ROUTE", "document", "staffLoginUrl", "escapeHtml", "money", "normalizePhotoUrl", "sakeStreetMenuPhotoUrl",
  `${publicMenuSource}; return initializePublicTenantMenu;`
)(
  {
    location: { pathname: "/", hostname: "sake-street.example" },
    TableOrderCloud: {
      routeContext: () => ({ area: "app" }),
      getPublicTenantContext: async () => ({ venues: [{ slug: "sake-street", name: "Sake Street" }] }),
      request: async () => ({ restaurant: { slug: "sake-street", name: "Sake Street" }, menu_items: [{ name: "Salmon nigiri (4p)", category: "Nigiri", description: "", price: 15 }] })
    }
  },
  { area: "app" },
  {
    getElementById(id) {
      if (id === "customer") return customer;
      if (id === "staffLoginButton") return { classList, href: "" };
      if (id === "restaurantTitle" || id === "brandSubtitle" || id === "mobileBottomNav") return { classList, textContent: "" };
      return null;
    },
    querySelector() { return { classList }; },
    body: { classList }
  },
  () => "/staff",
  (value) => String(value),
  (value) => `$${value}`,
  (value) => String(value || ""),
  photoFor
);

await publicMenu();
assert.match(customer.innerHTML, /food-photo custom-photo/, "The public Sake Street menu must render a packaged photo when the cloud record has none.");
assert.match(customer.innerHTML, /Salmon%20nigiri%20\(4p\)\.webp/);

console.log("Sake Street menu image mapping checks passed.");
