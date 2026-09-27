import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const helperSource = app.slice(
  app.indexOf("function sakeStreetMenuPhotoUrl"),
  app.indexOf("function allMenuItems")
);
const photoFor = new Function(`${helperSource}; return sakeStreetMenuPhotoUrl;`)();

for (const [dish, expected] of [
  ["Salmon nigiri (4p)", "/assets/sake-street/menu/Salmon%20nigiri%20(4p).webp"],
  ["Assorted sashimi & nigiri combo (10p)", "/assets/sake-street/menu/Nigiri%20%26%20Sashimi%20combo%20(10p).webp"],
  ["Kimchi chicken", "/assets/sake-street/menu/Kimchi%20chicken.webp"],
  ["Salmon Diamond", "/assets/sake-street/menu/Salmon%20Diamond.webp"]
]) {
  assert.equal(photoFor(dish), expected, `${dish} must retain its recovered packaged photo.`);
  await access(new URL(`..${expected}`, import.meta.url));
}
assert.equal(photoFor("Unpictured menu item"), "", "An unmatched dish must not receive a fabricated photo.");

const renderMenuSource = app.slice(
  app.indexOf("function renderMenu()"),
  app.indexOf("function renderAlsoOrdered")
);
const grid = { innerHTML: "", querySelectorAll: () => [] };
const renderMenu = new Function(
  "document", "isAuthenticatedDashboardRoute", "dashboardCatalogueState", "restaurant", "allMenuItems", "activeCategory", "itemSoldOut", "escapeHtml", "optionTemplateLabel", "normalizePhotoUrl", "sakeStreetMenuPhotoUrl", "money",
  `${renderMenuSource}; return renderMenu;`
)(
  { getElementById: () => grid },
  () => false,
  "ready",
  () => ({ slug: "sake-street", isOpen: true }),
  () => [{ id: "salmon", name: "Salmon nigiri (4p)", category: "Nigiri", description: "", tags: [], photoData: "", photo: "photo-1", optionTemplate: "none" }],
  "All",
  () => false,
  (value) => String(value),
  () => "",
  (value) => String(value || ""),
  photoFor,
  (value) => `$${value}`
);
renderMenu();
assert.match(grid.innerHTML, /Salmon%20nigiri%20\(4p\)\.webp/, "A Sake Street menu item without a cloud photo must render its packaged fallback.");

console.log("Sake Street menu photo recovery checks passed.");
