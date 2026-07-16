const APP_ROUTE = window.TableOrderCloud?.routeContext?.() || { area: "app", restaurantSlug: "", tableRef: "" };
const STORAGE_KEY = `aveniq-restaurant-state:${APP_ROUTE.restaurantSlug || "onboarding"}`;
const SOUND_STORAGE_KEY = "tableorder-kitchen-sound";
const STYLE_VERSION = "japanese-logo-cards-v3";
const MENU_VERSION = "aveniq-sample-menu-v1";

const DEFAULT_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520">
  <rect width="900" height="520" fill="transparent"/>
  <path d="M206 305c67-128 221-191 360-150 108 32 174 105 178 184 4 89-83 153-211 160-137 8-281-48-344-134-21-29-15-42 17-60z" fill="#d6d2ca"/>
  <path d="M128 286c118 11 215 34 329 70 94 30 184 55 313 55" fill="none" stroke="#d6d2ca" stroke-width="76" stroke-linecap="round" opacity=".92"/>
  <circle cx="458" cy="266" r="94" fill="#b21f24" opacity=".22"/>
  <circle cx="458" cy="266" r="74" fill="#b21f24" opacity=".18"/>
  <text x="450" y="283" text-anchor="middle" font-size="98" font-family="Georgia, 'Times New Roman', serif" font-weight="800" fill="#fffaf0">鮨</text>
  <text x="450" y="357" text-anchor="middle" font-size="76" font-family="Arial Black, Arial, sans-serif" font-weight="900" letter-spacing="2" fill="#ffffff">SAKE</text>
  <text x="450" y="412" text-anchor="middle" font-size="38" font-family="Arial, sans-serif" font-weight="800" letter-spacing="9" fill="#ffffff">STREET</text>
  <path d="M286 116c82-36 201-44 294-18" fill="none" stroke="#151312" stroke-width="14" stroke-linecap="round" opacity=".8"/>
  <path d="M624 128c44 18 83 45 111 77" fill="none" stroke="#151312" stroke-width="14" stroke-linecap="round" opacity=".8"/>
</svg>`;

const DEFAULT_LOGO_DATA = "";
const DEFAULT_LOGO_WATERMARK = "";

const themePresets = {
  japaneseIzakaya: {
    label: "Japanese Izakaya",
    accent: "#b21f24",
    accentDark: "#731216",
    mint: "#516f4b",
    blue: "#243f5a",
    paper: "#f7f1e6",
    panel: "#fffdf8",
    line: "#d8cab6",
    muted: "#766b5d",
    ink: "#211b18",
    headerBg: "#151312",
    headerInk: "#fff8eb"
  },
  classic: {
    label: "Classic",
    accent: "#c7472c",
    accentDark: "#9f301d",
    mint: "#2d8069",
    blue: "#315f92",
    paper: "#fbfcfb",
    panel: "#ffffff",
    line: "#dde4e8",
    muted: "#66727a",
    headerBg: "#ffffff",
    headerInk: "#1d2428",
    ink: "#1d2428"
  },
  asian: {
    label: "Modern Asian",
    accent: "#b42318",
    accentDark: "#7f1d1d",
    mint: "#26735d",
    blue: "#37546d",
    paper: "#fffaf2",
    panel: "#fffdf8",
    line: "#e0d3c4",
    muted: "#75685d",
    headerBg: "#241d1a",
    headerInk: "#fffaf2",
    ink: "#241d1a"
  },
  cafe: {
    label: "Cafe",
    accent: "#7b4b2a",
    accentDark: "#57341d",
    mint: "#3f7568",
    blue: "#446170",
    paper: "#f8f5ef",
    panel: "#ffffff",
    line: "#ded4c7",
    muted: "#6d6258",
    headerBg: "#25221e",
    headerInk: "#f8f5ef",
    ink: "#25221e"
  },
  fresh: {
    label: "Fresh Casual",
    accent: "#1f8a70",
    accentDark: "#176653",
    mint: "#3f7f3a",
    blue: "#2f638f",
    paper: "#f7fbf8",
    panel: "#ffffff",
    line: "#dce7df",
    muted: "#63736b",
    headerBg: "#1f2926",
    headerInk: "#f7fbf8",
    ink: "#1f2926"
  },
  bistro: {
    label: "Bistro",
    accent: "#8b3f5f",
    accentDark: "#672b45",
    mint: "#34776d",
    blue: "#334f7c",
    paper: "#fbf9fb",
    panel: "#ffffff",
    line: "#e2dce2",
    muted: "#706774",
    headerBg: "#242229",
    headerInk: "#fbf9fb",
    ink: "#242229"
  }
};

const defaultRestaurant = {
  name: "Aveniq Demo Restaurant",
  subtitle: "QR table ordering",
  address: "",
  phone: "",
  taxId: "",
  taxRate: 10,
  isOpen: true,
  logoData: DEFAULT_LOGO_DATA,
  logoWatermarkData: DEFAULT_LOGO_WATERMARK,
  themePreset: "classic",
  primaryColor: "#c7472c",
  menuLayout: "grid",
  showPhotos: true,
  styleVersion: STYLE_VERSION
};

const defaultTables = [
  { id: "t1", name: "Table 1", token: "tk_1H8KQ" },
  { id: "t2", name: "Table 2", token: "tk_2V7MA" },
  { id: "t6", name: "Table 6", token: "tk_6P4NZ" },
  { id: "t8", name: "Patio 8", token: "tk_8W2CY" }
];

const optionTemplates = {
  none: { label: "No options", groups: [] },
  spiceAddons: {
    label: "Spice + add-ons",
    groups: [
      {
        id: "spice",
        name: "Spice level",
        choices: [
          { id: "mild", name: "Mild", price: 0 },
          { id: "medium", name: "Medium", price: 0 },
          { id: "hot", name: "Hot", price: 0 }
        ]
      },
      {
        id: "addon",
        name: "Add-on",
        choices: [
          { id: "none", name: "No add-on", price: 0 },
          { id: "rice", name: "Add steamed rice", price: 3 },
          { id: "egg", name: "Add fried egg", price: 2.5 }
        ]
      }
    ]
  },
  size: {
    label: "Size",
    groups: [
      {
        id: "size",
        name: "Size",
        choices: [
          { id: "regular", name: "Regular", price: 0 },
          { id: "large", name: "Large", price: 3.5 }
        ]
      }
    ]
  },
  drink: {
    label: "Drink ice + sugar",
    groups: [
      {
        id: "ice",
        name: "Ice",
        choices: [
          { id: "regular", name: "Regular ice", price: 0 },
          { id: "less", name: "Less ice", price: 0 },
          { id: "none", name: "No ice", price: 0 }
        ]
      },
      {
        id: "sugar",
        name: "Sugar",
        choices: [
          { id: "full", name: "100%", price: 0 },
          { id: "half", name: "50%", price: 0 },
          { id: "zero", name: "0%", price: 0 }
        ]
      }
    ]
  }
};

function optionConfigForTemplate(templateId) {
  const groups = optionTemplates[templateId || "none"]?.groups || [];
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    choices: group.choices.map((choice) => ({ ...choice }))
  }));
}

function defaultMenuItem(id, category, name, price, description = "", tags = [], photoIndex = 1) {
  return {
    id: `item_${id}`,
    category,
    name,
    price,
    tags,
    description: description || "Menu item.",
    photo: `photo-${photoIndex}`,
    optionTemplate: "none",
    soldOut: false
  };
}

const defaultMenuItems = [
  defaultMenuItem("miso_soup", "Soups", "Miso soup", 4, "", [], 4),
  defaultMenuItem("kimchi", "Salads", "Kimchi", 7, "", ["Vegetarian"], 3),
  defaultMenuItem("seaweed_salad", "Salads", "Seaweed salad", 8, "", ["Vegetarian"], 3),
  defaultMenuItem("wakame_salad", "Salads", "Wakame salad", 8, "Shiso dressing.", ["Vegetarian"], 3),
  defaultMenuItem("tofu_avocado_salad", "Salads", "Tofu & avocado salad", 14, "Sesame dressing.", ["Vegetarian"], 3),
  defaultMenuItem("salmon_salad", "Salads", "Salmon salad", 19, "With avocado and cucumber.", [], 1),
  defaultMenuItem("kingfish_carpaccio", "Cold Plates", "Kingfish carpaccio", 21, "", [], 1),
  defaultMenuItem("salmon_carpaccio", "Cold Plates", "Salmon carpaccio", 19, "", [], 1),
  defaultMenuItem("scallop_carpaccio", "Cold Plates", "Scallop carpaccio", 24, "", [], 1),
  defaultMenuItem("tuna_tataki", "Cold Plates", "Tuna tataki", 24, "Spicy, shiso, ponzu dressing.", [], 1),
  defaultMenuItem("edamame_salty", "Hot Plates", "Edamame - salty", 6, "", ["Vegetarian"], 3),
  defaultMenuItem("edamame_spicy", "Hot Plates", "Edamame - spicy or garlic & cheese", 8, "", ["Vegetarian"], 3),
  defaultMenuItem("agedashi_tofu", "Hot Plates", "Agedashi tofu (8p)", 13, "", ["Vegetarian"], 3),
  defaultMenuItem("sweet_potato_tempura", "Hot Plates", "Sweet potato tempura fries", 13, "", ["Vegetarian"], 3),
  defaultMenuItem("karaage_chicken", "Hot Plates", "Karaage chicken", 22, "Marinated, crispy fried.", [], 2),
  defaultMenuItem("katsu_chicken", "Hot Plates", "Katsu chicken", 22, "Panko, crispy fried.", [], 2),
  defaultMenuItem("spicy_soft_shell_crab_hot", "Hot Plates", "Spicy soft shell crab", 24, "", ["Spicy"], 2),
  defaultMenuItem("pork_gyoza", "Hot Plates", "Pork gyoza (6p)", 17, "", [], 2),
  defaultMenuItem("popcorn_prawn", "Hot Plates", "Popcorn prawn (5p)", 22, "", [], 2),
  defaultMenuItem("miso_eggplant", "Hot Plates", "Miso eggplant", 17, "", ["Vegetarian"], 3),
  defaultMenuItem("salmon_rice_bowl", "Hot Plates", "Salmon rice bowl", 21, "Aburi + $1.", [], 1),
  defaultMenuItem("dynamite_scallops", "Hot Plates", "Dynamite scallops (5p)", 29, "", [], 2),
  defaultMenuItem("tempura_white_fish", "Hot Plates", "Tempura white fish (6p)", 28, "", [], 2),
  defaultMenuItem("tempura_veggies", "Hot Plates", "Tempura veggies", 22, "5 types, chef's choice.", ["Vegetarian"], 3),
  defaultMenuItem("seared_salmon_belly", "Sashimi", "Seared salmon belly 6p", 20, "", [], 1),
  defaultMenuItem("seared_kingfish", "Sashimi", "Seared King fish 6p", 21, "", [], 1),
  defaultMenuItem("kingfish_sashimi", "Sashimi", "Kingfish sashimi 7p", 23, "", [], 1),
  defaultMenuItem("salmon_ocean", "Sashimi", "Salmon ocean 7p", 21, "", [], 1),
  defaultMenuItem("tuna_salmon_sashimi", "Sashimi", "Tuna & salmon sashimi 7p", 23, "", [], 1),
  defaultMenuItem("tuna_sashimi", "Sashimi", "Tuna sashimi 7p", 25, "", [], 1),
  defaultMenuItem("sashimi_ocean", "Sashimi", "Sashimi ocean 9p", 27, "Salmon, tuna, kingfish.", [], 1),
  defaultMenuItem("mixed_sashimi", "Sashimi", "Mixed sashimi 16p", 43, "Salmon, tuna, kingfish, scallops.", [], 1),
  defaultMenuItem("salmon_nigiri", "Nigiri", "Salmon nigiri (4p)", 15, "No wasabi.", [], 1),
  defaultMenuItem("kingfish_nigiri", "Nigiri", "Kingfish nigiri (4p)", 16, "No wasabi.", [], 1),
  defaultMenuItem("tuna_nigiri", "Nigiri", "Tuna nigiri (4p)", 16, "No wasabi.", [], 1),
  defaultMenuItem("aburi_salmon_nigiri", "Nigiri", "Aburi salmon nigiri (4p)", 17, "No wasabi.", [], 1),
  defaultMenuItem("aburi_kingfish_nigiri", "Nigiri", "Aburi King fish (4p)", 18, "No wasabi.", [], 1),
  defaultMenuItem("aburi_scallop_nigiri", "Nigiri", "Aburi scallop nigiri (4p)", 24, "No wasabi.", [], 1),
  defaultMenuItem("nigiri_platter", "Nigiri", "Nigiri platter assorted (8p)", 30, "No wasabi.", [], 1),
  defaultMenuItem("nigiri_sashimi_combo", "Nigiri & Sashimi combo", "Assorted sashimi & nigiri combo (10p)", 32, "6p sashimi, 4p nigiri.", [], 1),
  defaultMenuItem("maki_cucumber", "Maki", "Cucumber maki (6p)", 6, "Baby sushi roll, one ingredient only.", ["Vegetarian"], 3),
  defaultMenuItem("maki_avocado", "Maki", "Avocado maki (6p)", 6, "Baby sushi roll, one ingredient only.", ["Vegetarian"], 3),
  defaultMenuItem("maki_teriyaki_chicken", "Maki", "Teriyaki Chicken maki (6p)", 7, "Baby sushi roll, one ingredient only.", [], 2),
  defaultMenuItem("maki_salmon", "Maki", "Salmon maki (6p)", 7, "Baby sushi roll, one ingredient only.", [], 1),
  defaultMenuItem("maki_cooked_tuna", "Maki", "Cooked tuna maki (6p)", 6, "Baby sushi roll, one ingredient only.", [], 1),
  defaultMenuItem("maki_fresh_tuna", "Maki", "Fresh tuna maki (6p)", 8, "Baby sushi roll, one ingredient only.", [], 1),
  defaultMenuItem("maki_egg", "Maki", "Egg (Tamago) maki (6p)", 6, "Baby sushi roll, one ingredient only.", ["Vegetarian"], 3),
  defaultMenuItem("roll_vegetarian", "Sushi rolls", "Vegetarian sushi roll (8p)", 16.5, "Salad, avocado, cucumber, seaweed, sesame, no mayo.", ["Vegetarian"], 3),
  defaultMenuItem("roll_cooked_tuna", "Sushi rolls", "Cooked tuna sushi roll (8p)", 17.5, "With avocado, sesame, topped with mayo.", [], 1),
  defaultMenuItem("roll_chicken_schnitzel", "Sushi rolls", "Chicken schnitzel sushi roll (8p)", 17.5, "With avocado, sesame, topped with mayo.", [], 2),
  defaultMenuItem("roll_teriyaki_chicken", "Sushi rolls", "Teriyaki chicken sushi roll (8p)", 19, "With avocado, sesame, topped with mayo.", [], 2),
  defaultMenuItem("roll_fresh_salmon_deluxe", "Sushi rolls", "Fresh salmon deluxe sushi roll (8p)", 21, "With avocado, tobiko, topped with mayo.", [], 1),
  defaultMenuItem("roll_seared_salmon", "Sushi rolls", "Seared salmon sushi roll (8p)", 22, "With avocado, cream cheese, topped with mayo.", [], 1),
  defaultMenuItem("roll_fried_prawn", "Sushi rolls", "Fried prawn sushi roll (8p)", 17.5, "With avocado, cucumber, sesame, topped with mayo.", [], 2),
  defaultMenuItem("roll_spicy_soft_shell_crab", "Sushi rolls", "Spicy soft shell crab sushi roll (8p)", 19.5, "Avocado, cucumber, sesame, topped with mayo.", ["Spicy"], 2),
  defaultMenuItem("roll_fresh_tuna", "Sushi rolls", "Fresh tuna sushi roll (8p)", 19, "With cucumber, sesame, topped with mayo.", [], 1),
  defaultMenuItem("roll_spicy_fresh_tuna_deluxe", "Sushi rolls", "Spicy fresh tuna deluxe sushi roll (8p)", 21, "Cucumber, chilli mayo, topped with mayo.", ["Spicy"], 1),
  defaultMenuItem("roll_california", "Sushi rolls", "California sushi roll (8p)", 17.5, "Crab, avocado, cucumber, egg, tobiko.", [], 1),
  defaultMenuItem("ramen_vegetable", "Ramen", "Vegetable ramen", 18, "Noodle soup with wakame, nori, sesame. Udon + $1.", ["Vegetarian"], 2),
  defaultMenuItem("ramen_karaage_chicken", "Ramen", "Karaage chicken ramen", 22, "Noodle soup with wakame, nori, sesame. Udon + $1.", [], 2),
  defaultMenuItem("ramen_pork_belly", "Ramen", "Pork-belly ramen", 24, "Noodle soup with wakame, nori, sesame. Udon + $1.", [], 2),
  defaultMenuItem("ramen_seafood", "Ramen", "Seafood ramen", 29, "Whitefish, scallop, prawn. Udon + $1.", [], 2),
  defaultMenuItem("stir_fried_vegetables", "Mains", "Stir fried vegetables", 18, "Seasonal vegetable, chef recommend.", ["Vegetarian"], 3),
  defaultMenuItem("teriyaki_chicken", "Mains", "Teriyaki chicken", 28, "With salad.", [], 2),
  defaultMenuItem("teriyaki_tasmanian_salmon", "Mains", "Teriyaki Tasmanian salmon", 29, "With salad.", [], 1),
  defaultMenuItem("teriyaki_kingfish", "Mains", "Teriyaki King fish", 32, "With salad.", [], 1),
  defaultMenuItem("aburi_pork_belly", "Mains", "Aburi Pork Belly (4p)", 16, "", [], 2),
  defaultMenuItem("pork_bun", "Mains", "Pork bun", 8, "Japanese hamburger. Price per each.", [], 2),
  defaultMenuItem("white_rice", "Sides", "White rice", 3, "", ["Vegetarian"], 4)
];

defaultMenuItems.splice(
  0,
  defaultMenuItems.length,
  defaultMenuItem("vegetable_dumplings", "Starters", "Crispy vegetable dumplings", 9.5, "Five pieces with house dipping sauce.", ["Vegetarian"], 3),
  defaultMenuItem("chicken_rice_bowl", "Mains", "Grilled chicken rice bowl", 18, "Chicken, greens, rice and sesame dressing.", [], 2),
  defaultMenuItem("market_noodles", "Mains", "Market vegetable noodles", 16.5, "Wok-tossed vegetables and noodles.", ["Vegetarian"], 3),
  defaultMenuItem("sparkling_water", "Drinks", "Sparkling water", 4, "Chilled 330ml bottle.", [], 4),
  defaultMenuItem("vanilla_mochi", "Dessert", "Vanilla mochi", 7, "Two pieces.", [], 1)
);

let state = loadState();
let activeView = "customer";
let activeCategory = "All";
let lockedTableToken = tableTokenFromUrl();
let selectedTableId = tableIdFromUrl() || (lockedTableToken ? "" : state.selectedTableId) || "t6";
let selectedFrontTableId = selectedTableId;
let soundEnabled = loadSoundPreference();
let kitchenAudioContext = null;
let optionItemId = "";
let importPreviewItems = [];
let staffUser = null;
let pendingStaffView = "";
let cloudSyncTimer = null;
let cloudSyncBusy = false;
let cloudSyncInitialized = false;
let knownCloudOrderIds = new Set();
let lastCloudSyncAt = null;
let orderToastTimer = null;
let lastConfirmedOrderId = "";
let kitchenAlertTimer = null;
let highlightedKitchenOrderIds = new Set();
let customerStatusTimer = null;
let customerStatusBusy = false;
let customerStatusError = "";
let activeReportTab = "sales";
let reportRangePreset = "today";
let reportRange = null;
let reportDashboard = null;
let reportData = {};
let reportLoading = false;
let reportError = "";
let reportRequestId = 0;

const CUSTOMER_ORDER_STEPS = [
  { status: "New", label: "Received" },
  { status: "Preparing", label: "Preparing" },
  { status: "Ready", label: "Ready" },
  { status: "Served", label: "Served" }
];

const STAFF_VIEW_ROLES = {
  kitchen: ["owner", "manager", "staff", "kitchen"],
  frontdesk: ["owner", "manager", "staff", "cashier"],
  reports: ["owner", "manager"],
  setup: ["owner", "manager"]
};

const STAFF_ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager",
  staff: "All-round Staff",
  kitchen: "Kitchen",
  cashier: "Cashier"
};

const samplePhotoUrls = {
  Sushi: "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80",
  Ramen: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80",
  Salad: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
  Tempura: "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=900&q=80"
};

function loadState() {
  const fallback = {
    selectedTableId: "t6",
    cart: [],
    orders: [],
    soldOutIds: [],
    menuItems: defaultMenuItems,
    menuVersion: MENU_VERSION,
    restaurant: defaultRestaurant,
    tables: defaultTables
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const savedRestaurant = { ...defaultRestaurant, ...(saved.restaurant || {}) };
    if (savedRestaurant.styleVersion !== STYLE_VERSION) {
      savedRestaurant.themePreset = defaultRestaurant.themePreset;
      savedRestaurant.primaryColor = defaultRestaurant.primaryColor;
      savedRestaurant.menuLayout = defaultRestaurant.menuLayout;
      savedRestaurant.showPhotos = savedRestaurant.showPhotos !== false;
      savedRestaurant.logoData = DEFAULT_LOGO_DATA;
      savedRestaurant.logoWatermarkData = DEFAULT_LOGO_WATERMARK;
      savedRestaurant.styleVersion = STYLE_VERSION;
    }

    const savedMenuItems = saved.menuItems || [];
    const customMenuItems = savedMenuItems.filter((item) => !/^m[1-5]$/.test(item.id) && !String(item.id).startsWith("sake_"));
    const menuItems = saved.menuVersion === MENU_VERSION ? savedMenuItems || defaultMenuItems : [...defaultMenuItems, ...customMenuItems];

    return {
      ...fallback,
      ...saved,
      menuItems,
      menuVersion: MENU_VERSION,
      restaurant: savedRestaurant,
      tables: saved.tables?.length ? saved.tables : defaultTables
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  state.selectedTableId = selectedTableId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(value);
}

function nowLabel() {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(new Date());
}

function timeLabel(value) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function isToday(value) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhotoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("data:image/")) return url;
  if (url.startsWith("/assets/")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function allMenuItems() {
  return state.menuItems || defaultMenuItems;
}

function allTables() {
  return Array.isArray(state.tables) ? state.tables : defaultTables;
}

function restaurant() {
  return { ...defaultRestaurant, ...(state.restaurant || {}) };
}

function currentTheme() {
  const profile = restaurant();
  return themePresets[profile.themePreset] || themePresets.classic;
}

function applyTheme() {
  const profile = restaurant();
  const theme = currentTheme();
  const root = document.documentElement;
  const accent = profile.primaryColor || theme.accent;

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dark", theme.accentDark);
  root.style.setProperty("--mint", theme.mint);
  root.style.setProperty("--blue", theme.blue);
  root.style.setProperty("--paper", theme.paper);
  root.style.setProperty("--panel", theme.panel || "#ffffff");
  root.style.setProperty("--line", theme.line || "#dde4e8");
  root.style.setProperty("--muted", theme.muted || "#66727a");
  root.style.setProperty("--ink", theme.ink);
  root.style.setProperty("--header-bg", theme.headerBg || "#ffffff");
  root.style.setProperty("--header-ink", theme.headerInk || theme.ink);
  const watermark = profile.logoWatermarkData || profile.logoData;
  root.style.setProperty("--logo-watermark", watermark ? `url("${watermark}")` : "none");

  document.body.dataset.themePreset = profile.themePreset || "classic";
  document.body.dataset.menuLayout = profile.menuLayout || "grid";
  document.body.classList.toggle("hide-menu-photos", !profile.showPhotos);
}

function taxRate() {
  return Math.max(0, Number(restaurant().taxRate) || 0) / 100;
}

function currencyAmount(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function taxIncludedIn(grossAmount) {
  const rate = taxRate();
  if (!rate) return 0;
  return currencyAmount(grossAmount * rate / (1 + rate));
}

function subtotalBeforeTax(grossAmount) {
  return currencyAmount(grossAmount - taxIncludedIn(grossAmount));
}

function menuCategories() {
  return ["All", ...new Set(allMenuItems().map((item) => item.category).filter(Boolean))];
}

function currentTable() {
  return allTables().find((table) => table.id === selectedTableId) || allTables()[0];
}

function lockedTableFromCurrentData() {
  if (!lockedTableToken) return null;
  return allTables().find((table) => table.token === lockedTableToken || table.id === lockedTableToken) || null;
}

function applyLockedTableSelection() {
  const table = lockedTableFromCurrentData();
  if (!table) return null;
  selectedTableId = table.id;
  selectedFrontTableId = table.id;
  return table;
}

function itemById(id) {
  return allMenuItems().find((item) => item.id === id);
}

function itemSoldOut(item) {
  return state.soldOutIds.includes(item.id);
}

function modifierGroupsForItem(item) {
  return Array.isArray(item.optionConfig) ? item.optionConfig : optionTemplates[item.optionTemplate || "none"]?.groups || [];
}

function optionTemplateLabel(templateId) {
  return optionTemplates[templateId || "none"]?.label || optionTemplates.none.label;
}

function normalizeOptionTemplate(value) {
  const raw = String(value || "none").trim();
  if (optionTemplates[raw]) return raw;
  const match = Object.entries(optionTemplates).find(([, template]) => template.label.toLowerCase() === raw.toLowerCase());
  return match?.[0] || "none";
}

function optionExtraTotal(options = []) {
  return options.reduce((sum, option) => sum + (Number(option.price) || 0), 0);
}

function optionSummary(options = []) {
  return options.map((option) => `${option.groupName}: ${option.choiceName}${option.price ? ` +${money(option.price)}` : ""}`).join(", ");
}

function optionSignature(itemId, options = []) {
  return `${itemId}:${JSON.stringify(options.map((option) => [option.groupId, option.choiceId, option.price]))}`;
}

function normalizeCart() {
  if (Array.isArray(state.cart)) return;

  state.cart = Object.entries(state.cart || {})
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity], index) => ({
      id: `line_${Date.now()}_${index}`,
      itemId,
      quantity,
      options: []
    }));
}

function cartEntries() {
  normalizeCart();
  return state.cart
    .map((line) => {
      const item = itemById(line.itemId);
      return {
        line,
        lineId: line.id,
        item,
        quantity: line.quantity,
        options: line.options || [],
        unitPrice: item ? item.price + optionExtraTotal(line.options || []) : 0
      };
    })
    .filter((entry) => entry.item && entry.quantity > 0);
}

function cartSubtotal() {
  return cartEntries().reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
}

function cartTax() {
  return taxIncludedIn(cartSubtotal());
}

function cartTotal() {
  return cartSubtotal();
}

function addToCart(itemId, options = []) {
  normalizeCart();
  lastConfirmedOrderId = "";
  const signature = optionSignature(itemId, options);
  const existing = state.cart.find((line) => optionSignature(line.itemId, line.options || []) === signature);

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: `line_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      itemId,
      quantity: 1,
      options
    });
  }

  saveState();
  renderCart();
}

function openOrdersForTable(tableId) {
  return state.orders.filter((order) => order.tableId === tableId && order.status !== "Paid" && order.status !== "Cancelled");
}

function tableTotal(tableId) {
  return openOrdersForTable(tableId).reduce((sum, order) => sum + orderTotal(order), 0);
}

function orderLineTotal(order) {
  return (order.items || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function orderSubtotal(order) {
  return subtotalBeforeTax(orderTotal(order));
}

function orderTax(order) {
  return taxIncludedIn(orderTotal(order));
}

function orderTotal(order) {
  return orderLineTotal(order);
}

function tableTokenFromUrl() {
  return window.TableOrderCloud?.routeContext?.().tableRef || new URLSearchParams(window.location.search).get("table") || "";
}

function tableIdFromUrl() {
  const token = tableTokenFromUrl();
  if (!token) return "";
  const match = (state?.tables || defaultTables).find((table) => table.token === token || table.id === token);
  return match?.id || "";
}

function tableOrderingLink(table) {
  const url = new URL(window.location.href);
  const slug = restaurant().slug || staffUser?.restaurantSlug || APP_ROUTE.restaurantSlug || window.TableOrderCloud?.config?.restaurantSlug || "restaurant";
  url.pathname = `/order/${encodeURIComponent(slug)}/${encodeURIComponent(table.id)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function makeToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "tk_";
  for (let index = 0; index < 8; index += 1) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

const qrMath = (() => {
  const exp = new Array(512);
  const log = new Array(256);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255];
  return {
    mul(left, right) {
      if (!left || !right) return 0;
      return exp[log[left] + log[right]];
    },
    exp(index) {
      return exp[index];
    }
  };
})();

function qrBch(value, poly) {
  let shift = bitLength(value) - bitLength(poly);
  while (shift >= 0) {
    value ^= poly << shift;
    shift = bitLength(value) - bitLength(poly);
  }
  return value;
}

function bitLength(value) {
  let length = 0;
  while (value) {
    length += 1;
    value >>>= 1;
  }
  return length;
}

function qrGeneratorPolynomial(degree) {
  let poly = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let pIndex = 0; pIndex < poly.length; pIndex += 1) {
      next[pIndex] ^= poly[pIndex];
      next[pIndex + 1] ^= qrMath.mul(poly[pIndex], qrMath.exp(index));
    }
    poly = next;
  }
  return poly;
}

function qrErrorCorrection(data, ecCount) {
  const generator = qrGeneratorPolynomial(ecCount);
  const result = [...data, ...new Array(ecCount).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = result[index];
    if (!factor) continue;
    for (let gIndex = 0; gIndex < generator.length; gIndex += 1) {
      result[index + gIndex] ^= qrMath.mul(generator[gIndex], factor);
    }
  }
  return result.slice(result.length - ecCount);
}

function qrBytes(text) {
  return [...new TextEncoder().encode(text)];
}

function pushBits(target, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function createQrCode(text) {
  const version = 10;
  const size = version * 4 + 17;
  const dataCodewords = 274;
  const ecCodewords = 18;
  const blocks = [
    { count: 2, data: 68, total: 86 },
    { count: 2, data: 69, total: 87 }
  ];
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (row, col, dark = false) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    modules[row][col] = dark;
    reserved[row][col] = true;
  };

  drawQrFinder(modules, reserved, 0, 0);
  drawQrFinder(modules, reserved, size - 7, 0);
  drawQrFinder(modules, reserved, 0, size - 7);
  [6, 28, 50].forEach((row) => {
    [6, 28, 50].forEach((col) => {
      if (reserved[row]?.[col]) return;
      drawQrAlignment(modules, reserved, row, col);
    });
  });
  for (let index = 8; index < size - 8; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  set(size - 8, 8, true);
  reserveQrFormatAreas(reserved, size);
  reserveQrVersionAreas(reserved, size);

  const data = buildQrData(text, dataCodewords);
  const dataBlocks = [];
  let offset = 0;
  blocks.forEach((block) => {
    for (let index = 0; index < block.count; index += 1) {
      const chunk = data.slice(offset, offset + block.data);
      offset += block.data;
      dataBlocks.push({
        data: chunk,
        ec: qrErrorCorrection(chunk, block.total - block.data)
      });
    }
  });

  const codewords = [];
  for (let index = 0; index < 69; index += 1) {
    dataBlocks.forEach((block) => {
      if (index < block.data.length) codewords.push(block.data[index]);
    });
  }
  for (let index = 0; index < ecCodewords; index += 1) {
    dataBlocks.forEach((block) => codewords.push(block.ec[index]));
  }

  placeQrData(modules, reserved, codewords, 0);
  drawQrFormat(modules, reserved, size, 0);
  drawQrVersion(modules, reserved, size, version);
  return modules;
}

function buildQrData(text, dataCodewords) {
  const bytes = qrBytes(text);
  const bits = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 16);
  bytes.forEach((byte) => pushBits(bits, byte, 8));
  const maxBits = dataCodewords * 8;
  pushBits(bits, 0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let index = 0; index < bits.length; index += 8) {
    words.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (words.length < dataCodewords) {
    words.push(pads[padIndex % 2]);
    padIndex += 1;
  }
  return words;
}

function drawQrFinder(modules, reserved, row, col) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const r = row + y;
      const c = col + x;
      if (!modules[r] || modules[r][c] === undefined) continue;
      const dark = y >= 0 && y <= 6 && x >= 0 && x <= 6 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
      modules[r][c] = dark;
      reserved[r][c] = true;
    }
  }
}

function drawQrAlignment(modules, reserved, row, col) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const dark = Math.max(Math.abs(x), Math.abs(y)) !== 1;
      modules[row + y][col + x] = dark;
      reserved[row + y][col + x] = true;
    }
  }
}

function reserveQrFormatAreas(reserved, size) {
  for (let index = 0; index < 9; index += 1) {
    reserved[8][index] = true;
    reserved[index][8] = true;
    reserved[8][size - 1 - index] = true;
    reserved[size - 1 - index][8] = true;
  }
}

function reserveQrVersionAreas(reserved, size) {
  for (let row = 0; row < 6; row += 1) {
    for (let col = size - 11; col < size - 8; col += 1) reserved[row][col] = true;
  }
  for (let row = size - 11; row < size - 8; row += 1) {
    for (let col = 0; col < 6; col += 1) reserved[row][col] = true;
  }
}

function placeQrData(modules, reserved, codewords, mask) {
  const size = modules.length;
  const bits = codewords.flatMap((word) => Array.from({ length: 8 }, (_, index) => (word >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      const row = upward ? size - 1 - rowIndex : rowIndex;
      for (let offset = 0; offset < 2; offset += 1) {
        const c = col - offset;
        if (reserved[row][c]) continue;
        const maskBit = qrMask(mask, row, c);
        modules[row][c] = Boolean((bits[bitIndex] || 0) ^ maskBit);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function qrMask(mask, row, col) {
  if (mask === 0) return (row + col) % 2 === 0 ? 1 : 0;
  return 0;
}

function drawQrFormat(modules, reserved, size, mask) {
  const ecLevel = 1;
  const data = (ecLevel << 3) | mask;
  const bits = ((data << 10) | qrBch(data << 10, 0x537)) ^ 0x5412;
  const set = (row, col, index) => {
    modules[row][col] = Boolean((bits >>> index) & 1);
    reserved[row][col] = true;
  };
  for (let index = 0; index < 15; index += 1) {
    if (index < 6) set(index, 8, index);
    else if (index < 8) set(index + 1, 8, index);
    else set(size - 15 + index, 8, index);

    if (index < 8) set(8, size - index - 1, index);
    else if (index < 9) set(8, 7, index);
    else set(8, 15 - index - 1, index);
  }
  modules[size - 8][8] = true;
  reserved[size - 8][8] = true;
}

function drawQrVersion(modules, reserved, size, version) {
  const bits = (version << 12) | qrBch(version << 12, 0x1f25);
  for (let index = 0; index < 18; index += 1) {
    const dark = Boolean((bits >>> index) & 1);
    const rowA = Math.floor(index / 3);
    const colA = (index % 3) + size - 11;
    const rowB = (index % 3) + size - 11;
    const colB = Math.floor(index / 3);
    modules[rowA][colA] = dark;
    reserved[rowA][colA] = true;
    modules[rowB][colB] = dark;
    reserved[rowB][colB] = true;
  }
}

function drawQrCanvas(canvas, text) {
  const modules = createQrCode(text);
  const size = modules.length;
  const scale = Math.floor(canvas.width / (size + 8));
  const qrSize = scale * (size + 8);
  const offset = Math.floor((canvas.width - qrSize) / 2) + scale * 4;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) context.fillRect(offset + x * scale, offset + y * scale, scale, scale);
    });
  });
}

function staffCanAccess(view) {
  const allowedRoles = STAFF_VIEW_ROLES[view];
  return !allowedRoles || Boolean(staffUser && allowedRoles.includes(staffUser.role));
}

function setStaffAuthError(message = "") {
  const error = document.getElementById("staffAuthError");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

function openStaffLogin(view = "") {
  pendingStaffView = view || pendingStaffView;
  setStaffAuthError("");
  document.getElementById("staffAuthModal").classList.remove("hidden");
  window.setTimeout(() => document.getElementById("staffEmail").focus(), 0);
}

function closeStaffLogin() {
  document.getElementById("staffAuthModal").classList.add("hidden");
  document.getElementById("staffPassword").value = "";
  setStaffAuthError("");
}

function renderStaffSession() {
  const loginButton = document.getElementById("staffLoginButton");
  const identity = document.getElementById("staffIdentity");
  const tabs = document.querySelector(".tabs");
  loginButton.classList.toggle("hidden", Boolean(staffUser));
  document.getElementById("ownerSignupButton")?.classList.toggle("hidden", Boolean(staffUser));
  identity.classList.toggle("hidden", !staffUser);
  document.getElementById("soundToggle").classList.toggle("hidden", !staffUser);
  document.getElementById("printBillTop").classList.toggle("hidden", !staffUser);
  document.getElementById("cloudSyncCluster").classList.toggle("hidden", !staffUser);
  renderSoundToggle();
  document.body.dataset.staffRole = staffUser?.role || "customer";
  tabs.classList.toggle("customer-tabs-only", !staffUser);

  if (staffUser) {
    document.getElementById("staffName").textContent = staffUser.email.split("@")[0];
    document.getElementById("staffRole").textContent = STAFF_ROLE_LABELS[staffUser.role] || staffUser.role;
  }

  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    const view = tab.dataset.view;
    const protectedView = Boolean(STAFF_VIEW_ROLES[view]);
    const hiddenForSession = protectedView && (!staffUser || !staffCanAccess(view));
    tab.classList.toggle("hidden", hiddenForSession);
    tab.disabled = false;
    tab.title = "";
  });
}

function cloudSyncSummary() {
  const cloudOrders = state.orders.filter((order) => order.cloudId);
  const openOrders = cloudOrders.filter((order) => !["Paid", "Cancelled"].includes(order.status));
  const time = lastCloudSyncAt ? timeLabel(lastCloudSyncAt) : "never";
  return `Last sync ${time} · ${openOrders.length} open · ${cloudOrders.length} total`;
}

function setCloudSyncStatus(kind, label, detail = "") {
  const status = document.getElementById("cloudSyncStatus");
  const cluster = document.getElementById("cloudSyncCluster");
  const detailNode = document.getElementById("cloudSyncDetail");
  status.textContent = label;
  status.className = `status-pill sync-status ${kind}`;
  if (detailNode) detailNode.textContent = detail || cloudSyncSummary();
  if (cluster) cluster.classList.toggle("hidden", !staffUser);
}

function showOrderToast(message, kind = "success") {
  let toast = document.getElementById("orderToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "orderToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  window.clearTimeout(orderToastTimer);
  toast.textContent = message;
  toast.className = `order-toast ${kind}`;
  orderToastTimer = window.setTimeout(() => toast.classList.add("hidden"), 4500);
}

function closeOrderSuccessModal() {
  document.getElementById("orderSuccessModal")?.remove();
}

function showOrderSuccessModal(order) {
  const table = allTables().find((entry) => entry.id === order.tableId);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  closeOrderSuccessModal();

  const modal = document.createElement("div");
  modal.id = "orderSuccessModal";
  modal.className = "modal-backdrop";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <section class="order-success-dialog" aria-labelledby="orderSuccessTitle">
      <div class="success-mark">OK</div>
      <p class="eyebrow">Sent to kitchen</p>
      <h2 id="orderSuccessTitle">Order #${escapeHtml(order.number)}</h2>
      <p class="muted">${escapeHtml(table?.name || "Table")} - ${itemCount} item${itemCount === 1 ? "" : "s"} - ${money(orderTotal(order))}</p>
      <div class="order-success-actions">
        <button class="submit-button" id="viewOrderStatus" type="button">View order status</button>
        <button class="ghost-button" id="orderSuccessOk" type="button">Continue ordering</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  document.getElementById("viewOrderStatus").focus();
  document.getElementById("viewOrderStatus").addEventListener("click", () => {
    closeOrderSuccessModal();
    scrollToCustomerOrderStatus();
  });
  document.getElementById("orderSuccessOk").addEventListener("click", closeOrderSuccessModal);
  modal.addEventListener("click", (event) => {
    if (event.target.id === "orderSuccessModal") closeOrderSuccessModal();
  });
}

function kitchenOrderAlertKey(order) {
  return order.cloudId || order.id;
}

function clearKitchenNewOrderAlert() {
  window.clearTimeout(kitchenAlertTimer);
  kitchenAlertTimer = null;
  highlightedKitchenOrderIds = new Set();
  const alert = document.getElementById("kitchenAlert");
  if (alert) {
    alert.classList.add("hidden");
    alert.innerHTML = "";
  }
  renderKitchen();
}

function showKitchenNewOrderAlert(orders) {
  if (!orders.length) return;
  const alert = document.getElementById("kitchenAlert");
  const tableNames = orders
    .map((order) => allTables().find((table) => table.id === order.tableId)?.name || "Table")
    .filter(Boolean);
  const summary = [...new Set(tableNames)].slice(0, 3).join(", ");

  orders.forEach((order) => highlightedKitchenOrderIds.add(kitchenOrderAlertKey(order)));
  if (alert) {
    alert.classList.remove("hidden");
    alert.innerHTML = `
      <div>
        <strong>New order just arrived</strong>
        <p>${orders.length} new order${orders.length === 1 ? "" : "s"}${summary ? ` - ${escapeHtml(summary)}` : ""}</p>
      </div>
      <button class="ghost-button" id="dismissKitchenAlert" type="button">Dismiss</button>
    `;
    document.getElementById("dismissKitchenAlert").addEventListener("click", clearKitchenNewOrderAlert);
  }

  window.clearTimeout(kitchenAlertTimer);
  kitchenAlertTimer = window.setTimeout(clearKitchenNewOrderAlert, 12000);
  renderKitchen();
}

function cloudOrderToLocal(row) {
  const relatedTable = Array.isArray(row.tables) ? row.tables[0] : row.tables;
  const table = allTables().find((entry) => entry.cloudId === row.table_id || entry.id === relatedTable?.local_id);
  const statusFromDatabase = { new: "New", preparing: "Preparing", ready: "Ready", completed: "Served", cancelled: "Cancelled" };
  return {
    id: row.local_id || `cloud_${row.id}`,
    cloudId: row.id,
    number: row.order_number,
    tableId: relatedTable?.local_id || table?.id || row.table_id,
    status: statusFromDatabase[row.status] || row.status,
    customerName: row.customer_name || "",
    note: row.note || "",
    createdAt: row.created_at,
    createdLabel: dateLabel(row.created_at),
    servedAt: row.served_at || null,
    closedAt: row.closed_at || null,
    subtotal: Number(row.subtotal) || 0,
    tax: Number(row.tax) || 0,
    total: Number(row.total) || 0,
    payment: row.payment_method ? { method: row.payment_method, paidAt: row.paid_at || row.closed_at || null } : null,
    cloudStatus: "synced",
    items: (row.order_items || []).map((item) => ({
      itemId: item.menu_item_id || "",
      menuItemCloudId: item.menu_item_id || null,
      name: item.item_name || item.name_snapshot,
      price: Number(item.price ?? item.unit_price) || 0,
      basePrice: Number(item.price ?? item.base_price) || 0,
      quantity: Number(item.quantity) || 0,
      options: Array.isArray(item.options) ? item.options : []
    }))
  };
}

async function syncCloudOrders({ notify = true } = {}) {
  if (!staffUser?.restaurantId || cloudSyncBusy) return;
  cloudSyncBusy = true;
  setCloudSyncStatus("syncing", "Syncing");

  try {
    const rows = await window.TableOrderCloud.loadOrders(staffUser.restaurantId);
    const cloudOrders = rows.map(cloudOrderToLocal);
    const trackedByCloudId = new Set(state.orders.filter((order) => order.customerTracked && order.cloudId).map((order) => order.cloudId));
    cloudOrders.forEach((order) => {
      if (trackedByCloudId.has(order.cloudId)) order.customerTracked = true;
    });
    const cloudIds = new Set(cloudOrders.map((order) => order.cloudId));
    const localOnlyOrders = state.orders.filter((order) => !order.cloudId || (!cloudIds.has(order.cloudId) && order.cloudStatus === "local"));
    const newOrders = cloudSyncInitialized
      ? cloudOrders.filter((order) => order.status === "New" && !knownCloudOrderIds.has(order.cloudId))
      : [];

    state.orders = [...cloudOrders, ...localOnlyOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    knownCloudOrderIds = cloudIds;
    cloudSyncInitialized = true;
    lastCloudSyncAt = new Date();
    saveState();
    renderKitchen();
    renderFrontDesk();
    renderReports();
    setCloudSyncStatus("live", "Live", cloudSyncSummary());

    if (notify && newOrders.length) {
      showKitchenNewOrderAlert(newOrders);
      if (soundEnabled) {
        playKitchenChime().catch(() => setSoundEnabled(false));
      }
    }
  } catch (error) {
    setCloudSyncStatus("offline", "Offline", `Sync failed · ${error.message}`);
    console.warn("Cloud order sync paused:", error.message);
  } finally {
    cloudSyncBusy = false;
  }
}

function startCloudOrderSync() {
  window.clearInterval(cloudSyncTimer);
  cloudSyncInitialized = false;
  knownCloudOrderIds = new Set();
  syncCloudOrders({ notify: false });
  cloudSyncTimer = window.setInterval(syncCloudOrders, 3000);
}

function stopCloudOrderSync() {
  window.clearInterval(cloudSyncTimer);
  cloudSyncTimer = null;
  cloudSyncBusy = false;
  cloudSyncInitialized = false;
  knownCloudOrderIds = new Set();
  lastCloudSyncAt = null;
  setCloudSyncStatus("offline", "Offline", "Not syncing");
}

async function handleStaffLogin(event) {
  event.preventDefault();
  const submit = document.getElementById("staffLoginSubmit");
  const username = document.getElementById("staffEmail").value.trim();
  const password = document.getElementById("staffPassword").value;
  submit.disabled = true;
  submit.textContent = "Logging in...";
  setStaffAuthError("");

  try {
    await window.TableOrderCloud.signInWithPassword(username, password);
    staffUser = await window.TableOrderCloud.getStaffProfile();
    const destination = pendingStaffView && staffCanAccess(pendingStaffView) ? pendingStaffView : "customer";
    pendingStaffView = "";
    closeStaffLogin();
    renderStaffSession();
    startCloudOrderSync();
    setView(destination);
  } catch (error) {
    staffUser = null;
    await window.TableOrderCloud.signOut().catch(() => {});
    const message = /invalid login credentials|username or password/i.test(error.message)
      ? "Username or password is incorrect."
      : error.message;
    setStaffAuthError(message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Log In";
  }
}

async function handleStaffLogout() {
  stopCloudOrderSync();
  await window.TableOrderCloud.signOut().catch(() => {});
  staffUser = null;
  pendingStaffView = "";
  renderStaffSession();
  setView("customer");
}

async function initializeStaffAuth() {
  if (!window.TableOrderCloud?.getStaffProfile) return;
  try {
    staffUser = await window.TableOrderCloud.getStaffProfile();
  } catch (error) {
    staffUser = null;
    console.warn("Staff access could not be initialized:", error.message);
  }
  renderStaffSession();
  if (staffUser) {
    startCloudOrderSync();
    if (APP_ROUTE.area === "kitchen") setView("kitchen", { updateUrl: false });
    else if (["dashboard", "frontdesk", "reports", "setup"].includes(APP_ROUTE.area)) setView(APP_ROUTE.area === "dashboard" ? "setup" : APP_ROUTE.area, { updateUrl: false });
  }
}

function setView(view, options = {}) {
  if (!staffCanAccess(view)) {
    if (!staffUser) openStaffLogin(view);
    return false;
  }
  clearPrintContent();
  activeView = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("active-view", panel.id === view);
  });
  render();
  if (view === "setup" && staffUser && ["owner", "manager"].includes(staffUser.role)) {
    loadRestaurantTeam();
  }
  if (view === "reports" && staffUser && ["owner", "manager"].includes(staffUser.role)) {
    window.setTimeout(() => loadReports({ refreshDashboard: true }), 0);
  }
  if (staffUser && options.updateUrl !== false && STAFF_VIEW_ROLES[view]) {
    const routeName = view === "setup" ? "dashboard" : view;
    window.history.pushState({}, "", `/dashboard/${encodeURIComponent(staffUser.restaurantSlug || restaurant().slug)}/${routeName}`);
  }
  return true;
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
}

function renderTablePicker() {
  const picker = document.getElementById("tablePicker");
  picker.innerHTML = allTables().map((table) => `<option value="${table.id}">${escapeHtml(table.name)}</option>`).join("");

  if (lockedTableToken) {
    const lockedTable = applyLockedTableSelection();
    picker.classList.add("hidden");
    picker.disabled = true;
    document.getElementById("customerTableName").textContent = lockedTable ? lockedTable.name : "Loading table...";
    return;
  }

  picker.classList.remove("hidden");
  picker.disabled = false;
  if (!allTables().some((table) => table.id === selectedTableId)) selectedTableId = allTables()[0].id;
  picker.value = selectedTableId;
  picker.onchange = (event) => {
    selectedTableId = event.target.value;
    selectedFrontTableId = selectedTableId;
    saveState();
    render();
  };
  document.getElementById("customerTableName").textContent = currentTable().name;
}

function renderCategories() {
  const row = document.getElementById("categoryRow");
  const categories = menuCategories();
  if (!categories.includes(activeCategory)) activeCategory = "All";
  row.innerHTML = categories
    .map(
      (category) =>
        `<button class="category-button ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    )
    .join("");

  row.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      row.querySelectorAll("button").forEach((categoryButton) => {
        categoryButton.classList.toggle("active", categoryButton.dataset.category === activeCategory);
      });
      renderMenu();
    });
  });
}

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  const profile = restaurant();
  const items = allMenuItems().filter((item) => activeCategory === "All" || item.category === activeCategory);
  grid.innerHTML = items
    .map((item) => {
      const soldOut = itemSoldOut(item);
      const tags = item.tags
        .map((tag) => `<span class="tag ${tag === "Hot" ? "hot" : tag === "Chef" ? "soft" : ""}">${escapeHtml(tag)}</span>`)
        .join("");
      const optionLabel = item.optionTemplate && item.optionTemplate !== "none" ? `<span class="tag soft">${escapeHtml(optionTemplateLabel(item.optionTemplate))}</span>` : "";
      const photoUrl = normalizePhotoUrl(item.photoData);
      const photo = photoUrl
        ? `<div class="food-photo custom-photo" style="background-image: url('${escapeHtml(photoUrl)}')" role="img" aria-label="${escapeHtml(item.name)}"></div>`
        : `<div class="food-photo ${item.photo}" role="img" aria-label="${escapeHtml(item.name)}"></div>`;
      return `
        <article class="menu-card ${soldOut ? "soldout" : ""}">
          ${photo}
          <div class="menu-body">
            <div class="menu-meta">
              <h3>${escapeHtml(item.name)}</h3>
            </div>
            <p class="menu-category">${escapeHtml(item.category)}</p>
            <p class="menu-desc">${escapeHtml(item.description)}</p>
            <div class="tag-row">${tags}${optionLabel}</div>
          </div>
          <div class="menu-buy"><strong>${money(item.price)}</strong><button aria-label="Add ${escapeHtml(item.name)}" data-add="${item.id}" ${soldOut || !profile.isOpen ? "disabled" : ""}>${soldOut ? "×" : profile.isOpen ? "+" : "—"}</button></div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.add;
      const item = itemById(id);
      if (modifierGroupsForItem(item).length) {
        openOptionModal(id);
      } else {
        addToCart(id);
      }
    });
  });
}

function renderAlsoOrdered() {
  const panel = document.getElementById("alsoOrdered");
  if (!panel) return;
  const orderedCounts = new Map();
  state.orders.forEach((order) => (order.items || []).forEach((line) => {
    orderedCounts.set(line.itemId, (orderedCounts.get(line.itemId) || 0) + Number(line.quantity || 0));
  }));
  const picks = allMenuItems()
    .filter((item) => !itemSoldOut(item))
    .sort((left, right) => (orderedCounts.get(right.id) || 0) - (orderedCounts.get(left.id) || 0) || left.name.localeCompare(right.name))
    .slice(0, 3);
  if (!picks.length) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = `<div class="also-ordered-heading"><div><p class="eyebrow">A little extra</p><h2>Customers also ordered</h2></div></div><div class="also-ordered-list">${picks.map((item) => `<button class="also-ordered-item" type="button" data-recommendation="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></span><b>${money(item.price)} +</b></button>`).join("")}</div>`;
  panel.querySelectorAll("[data-recommendation]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = itemById(button.dataset.recommendation);
      if (!item) return;
      if (modifierGroupsForItem(item).length) openOptionModal(item.id);
      else addToCart(item.id);
    });
  });
}

function renderCart() {
  const list = document.getElementById("cartList");
  const profile = restaurant();
  const entries = cartEntries();
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">Cart is empty.</div>`;
  } else {
    list.innerHTML = entries
      .map(
        ({ item, quantity, lineId, options, unitPrice }) => `
          <div class="cart-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <p class="muted">${optionSummary(options) || "No options"}</p>
              <p class="muted">${money(unitPrice)} each</p>
            </div>
            <div class="qty-controls" aria-label="Quantity controls">
              <button data-dec="${lineId}">-</button>
              <span>${quantity}</span>
              <button data-inc="${lineId}">+</button>
            </div>
          </div>
        `
      )
      .join("");
  }

  document.getElementById("cartSubtotal").textContent = money(cartSubtotal());
  document.getElementById("cartGst").textContent = money(cartTax());
  document.getElementById("cartTotal").textContent = money(cartTotal());
  document.getElementById("submitOrder").disabled = !profile.isOpen || !entries.length;
  document.getElementById("submitOrder").textContent = profile.isOpen ? "Send to Kitchen" : "Ordering Closed";
  renderMobileCustomerControls(entries);
  renderOrderConfirmation();
  list.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", () => {
      normalizeCart();
      lastConfirmedOrderId = "";
      const line = state.cart.find((entry) => entry.id === button.dataset.inc);
      if (line) line.quantity += 1;
      saveState();
      renderCart();
    });
  });
  list.querySelectorAll("[data-dec]").forEach((button) => {
    button.addEventListener("click", () => {
      normalizeCart();
      lastConfirmedOrderId = "";
      const line = state.cart.find((entry) => entry.id === button.dataset.dec);
      if (line) line.quantity -= 1;
      state.cart = state.cart.filter((entry) => entry.quantity > 0);
      saveState();
      renderCart();
    });
  });
}

function renderOrderConfirmation() {
  const panel = document.getElementById("orderConfirmation");
  const order = state.orders.find((entry) => entry.id === lastConfirmedOrderId);
  if (!order || order.cloudStatus !== "synced") {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  const table = allTables().find((entry) => entry.id === order.tableId);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="confirmation-mark">Sent</div>
    <div>
      <p class="eyebrow">Order confirmed</p>
      <h3>Order #${escapeHtml(order.number)}</h3>
      <p class="muted">${escapeHtml(table?.name || "Table")} - ${itemCount} item${itemCount === 1 ? "" : "s"} - ${money(orderTotal(order))}</p>
    </div>
    <button class="primary-button" id="trackConfirmedOrder" type="button">View order status</button>
    <button class="ghost-button" id="continueOrdering" type="button">OK / Continue ordering</button>
  `;

  document.getElementById("trackConfirmedOrder").addEventListener("click", scrollToCustomerOrderStatus);
  document.getElementById("continueOrdering").addEventListener("click", () => {
    lastConfirmedOrderId = "";
    renderCart();
    document.getElementById("categoryRow").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function trackedCustomerOrders() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return state.orders
    .filter(
      (order) =>
        order.customerTracked &&
        order.tableId === selectedTableId &&
        new Date(order.createdAt).getTime() > cutoff
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
}

function customerStatusIndex(status) {
  if (["Served", "Paid"].includes(status)) return CUSTOMER_ORDER_STEPS.length - 1;
  return Math.max(0, CUSTOMER_ORDER_STEPS.findIndex((step) => step.status === status));
}

function customerStatusLabel(status) {
  if (status === "New") return "Received";
  if (status === "Paid") return "Served";
  return status || "Received";
}

function scrollToCustomerOrderStatus() {
  renderCustomerOrderStatus();
  document.getElementById("customerOrderStatus")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function dismissTrackedCustomerOrder(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  order.customerTracked = false;
  saveState();
  renderCustomerOrderStatus();
}

function renderCustomerOrderStatus() {
  const panel = document.getElementById("customerOrderStatus");
  const orders = trackedCustomerOrders();
  if (!orders.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  const table = currentTable();
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="customer-status-header">
      <div>
        <p class="eyebrow">${escapeHtml(table?.name || "Your table")}</p>
        <h2>Order status</h2>
      </div>
      <span class="customer-status-live">${customerStatusError ? "Reconnecting to kitchen..." : "Updates automatically every 5 seconds"}</span>
    </div>
    <div class="customer-status-list">
      ${orders
        .map((order) => {
          const cancelled = order.status === "Cancelled";
          const currentIndex = customerStatusIndex(order.status);
          const progress = (currentIndex / (CUSTOMER_ORDER_STEPS.length - 1)) * 75;
          const finalStatus = ["Served", "Paid", "Cancelled"].includes(order.status);
          return `
            <article class="customer-status-card ${String(order.status || "").toLowerCase()}">
              <div class="customer-status-top">
                <div>
                  <p class="eyebrow">Order #${escapeHtml(order.number)}</p>
                  <h3>${escapeHtml(customerStatusLabel(order.status))}</h3>
                  <p class="customer-status-meta">${escapeHtml(order.createdLabel || dateLabel(order.createdAt))} - ${money(orderTotal(order))}</p>
                </div>
                <span class="status-pill ${String(order.status || "").toLowerCase()}">${escapeHtml(customerStatusLabel(order.status))}</span>
              </div>
              ${
                cancelled
                  ? `<p class="customer-status-warning">This order was cancelled. Please ask a staff member if you need help.</p>`
                  : `
                    <div class="customer-status-progress" style="--status-progress:${progress}%">
                      ${CUSTOMER_ORDER_STEPS.map(
                        (step, index) => `
                          <div class="customer-status-step ${index <= currentIndex ? "complete" : ""} ${index === currentIndex ? "current" : ""}">
                            <span class="customer-status-dot"></span>
                            <span>${step.label}</span>
                          </div>
                        `
                      ).join("")}
                    </div>
                  `
              }
              ${order.status === "Ready" ? `<p class="customer-status-callout">Your order is ready.</p>` : ""}
              ${order.cloudStatus !== "synced" ? `<p class="customer-status-warning">Live status is unavailable while this order is offline.</p>` : ""}
              <div class="customer-status-footer">
                <span>${customerStatusError && order.cloudId ? "Waiting for connection" : finalStatus ? "Order complete" : "Kitchen is updating this order"}</span>
                ${finalStatus ? `<button class="ghost-button" type="button" data-dismiss-customer-order="${escapeHtml(order.id)}">Hide</button>` : ""}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  panel.querySelectorAll("[data-dismiss-customer-order]").forEach((button) => {
    button.addEventListener("click", () => dismissTrackedCustomerOrder(button.dataset.dismissCustomerOrder));
  });
}

async function syncCustomerOrderStatuses() {
  if (customerStatusBusy || document.hidden || activeView !== "customer" || staffUser) return;
  const orders = trackedCustomerOrders().filter((order) => order.cloudId && !["Served", "Paid", "Cancelled"].includes(order.status));
  if (!orders.length || !window.TableOrderCloud?.loadCustomerOrderStatus) return;

  customerStatusBusy = true;
  try {
    const results = await Promise.all(
      orders.map((order) =>
        window.TableOrderCloud.loadCustomerOrderStatus(order.cloudId, order.id, currentTable()?.token)
      )
    );

    results.forEach((status, index) => {
      if (!status) return;
      const order = orders[index];
      order.number = Number(status.order_number) || order.number;
      order.status = ({ new: "New", preparing: "Preparing", ready: "Ready", completed: "Served", cancelled: "Cancelled" })[status.status] || status.status || order.status;
      order.total = Number(status.total) || order.total;
      order.servedAt = status.served_at || order.servedAt || null;
      order.closedAt = status.closed_at || order.closedAt || null;
      order.cloudStatus = "synced";
    });
    customerStatusError = "";
    saveState();
    renderCustomerOrderStatus();
  } catch (error) {
    customerStatusError = error.message;
    renderCustomerOrderStatus();
  } finally {
    customerStatusBusy = false;
  }
}

function startCustomerOrderStatusSync() {
  window.clearInterval(customerStatusTimer);
  syncCustomerOrderStatuses();
  customerStatusTimer = window.setInterval(syncCustomerOrderStatuses, 5000);
}

async function submitOrder() {
  if (!restaurant().isOpen) return;
  if (lockedTableToken && !applyLockedTableSelection()) {
    await loadCloudDataIntoApp({ silent: true });
    if (!applyLockedTableSelection()) {
      showOrderToast("This table link is not available. Please ask staff for a new QR code.", "warning");
      return;
    }
  }
  const entries = cartEntries();
  if (!entries.length) return;
  lastConfirmedOrderId = "";

  const total = cartTotal();
  const tax = cartTax();
  const subtotal = subtotalBeforeTax(total);
  const order = {
    id: `ord_${Date.now()}`,
    number: state.orders.length + 1001,
    tableId: selectedTableId,
    status: "New",
    note: document.getElementById("orderNote").value.trim(),
    createdAt: new Date().toISOString(),
    createdLabel: nowLabel(),
    subtotal,
    tax,
    taxRate: restaurant().taxRate,
    total,
    cloudStatus: "syncing",
    customerTracked: true,
    items: entries.map(({ item, quantity, options, unitPrice }) => ({
      itemId: item.id,
      menuItemCloudId: item.cloudId || null,
      name: item.name,
      price: unitPrice,
      basePrice: item.price,
      options,
      quantity
    }))
  };

  state.orders.unshift(order);
  state.cart = [];
  document.getElementById("orderNote").value = "";
  saveState();
  renderCart();

  try {
    if (!restaurant().cloudId || !allTables().find((entry) => entry.id === selectedTableId)?.cloudId) {
      await loadCloudDataIntoApp({ silent: true });
    }
    const profile = restaurant();
    const table = allTables().find((entry) => entry.id === selectedTableId);
    const cloudOrder = await window.TableOrderCloud.submitOrder(order, profile.cloudId, table?.cloudId);
    order.cloudId = cloudOrder.id;
    if (cloudOrder.number) order.number = cloudOrder.number;
    order.cloudStatus = "synced";
    order.cloudError = "";
    lastConfirmedOrderId = order.id;
    showOrderSuccessModal(order);
    showOrderToast("Order sent to the kitchen.", "success");
  } catch (error) {
    order.cloudStatus = "local";
    order.cloudError = error.message;
    console.error("Cloud order delivery failed:", error);
    showOrderToast(`Cloud delivery failed: ${error.message}`, "warning");
  }

  saveState();
  renderCart();
  renderCustomerOrderStatus();
  syncCustomerOrderStatuses();
}

async function updateOrderStatus(orderId, status) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  const previousStatus = order.status;
  const previousServedAt = order.servedAt;
  order.status = status;
  if (status === "Served") order.servedAt = new Date().toISOString();
  saveState();
  render();

  if (!order.cloudId) return;
  try {
    await window.TableOrderCloud.updateOrderStatus(order.cloudId, status);
    lastCloudSyncAt = new Date();
    setCloudSyncStatus("live", "Live", cloudSyncSummary());
    syncCloudOrders({ notify: false });
  } catch (error) {
    order.status = previousStatus;
    order.servedAt = previousServedAt;
    saveState();
    render();
    setCloudSyncStatus("offline", "Offline");
    showOrderToast(`Status was not updated: ${error.message}`, "warning");
  }
}

async function markOrdersPaid(orders, method = "Card") {
  if (!orders.length || orders.some((order) => order.status === "Paid")) return;
  const previous = orders.map((order) => ({ order, status: order.status, closedAt: order.closedAt, payment: order.payment || null }));
  const closedAt = new Date().toISOString();
  orders.forEach((order) => {
    order.status = "Paid";
    order.closedAt = closedAt;
    order.payment = { method, paidAt: closedAt };
  });
  saveState();
  render();

  try {
    await Promise.all(orders.filter((order) => order.cloudId).map((order) =>
      window.TableOrderCloud.recordOrderPayment
        ? window.TableOrderCloud.recordOrderPayment(order.cloudId, { method, total: orderTotal(order), paidAt: closedAt })
        : window.TableOrderCloud.updateOrderStatus(order.cloudId, "Paid")
    ));
    lastCloudSyncAt = new Date();
    setCloudSyncStatus("live", "Live", cloudSyncSummary());
    syncCloudOrders({ notify: false });
  } catch (error) {
    previous.forEach(({ order, status, closedAt: oldClosedAt, payment }) => {
      order.status = status;
      order.closedAt = oldClosedAt;
      order.payment = payment;
    });
    saveState();
    render();
    setCloudSyncStatus("offline", "Offline");
    showOrderToast(`Payment status was not updated: ${error.message}`, "warning");
  }
}

function renderKitchen() {
  const board = document.getElementById("kitchenBoard");
  const activeOrders = state.orders.filter((order) => !["Served", "Paid", "Cancelled"].includes(order.status));

  if (!activeOrders.length) {
    board.innerHTML = `<div class="empty-state">No active kitchen orders.</div>`;
    return;
  }

  board.innerHTML = activeOrders
    .map((order) => {
      const table = allTables().find((entry) => entry.id === order.tableId);
      const highlighted = highlightedKitchenOrderIds.has(kitchenOrderAlertKey(order));
      const lines = order.items
        .map(
          (item) => `
            <div class="line-row">
              <span>${item.quantity} x ${escapeHtml(item.name)}<p class="muted">${optionSummary(item.options) || "No options"}</p></span>
              <strong>${money(item.price * item.quantity)}</strong>
            </div>
          `
        )
        .join("");
      return `
        <article class="order-card ${highlighted ? "new-order-highlight" : ""}">
          <div class="order-card-header">
            <div>
              <p class="eyebrow">Order #${order.number}</p>
              <h3>${table?.name || "Table"}</h3>
              <p class="muted">${order.createdLabel}</p>
              <p class="cloud-order-state ${order.cloudStatus || "local"}">${order.cloudStatus === "synced" ? "Cloud synced" : order.cloudStatus === "syncing" ? "Cloud syncing" : "Local only"}</p>
            </div>
            <span class="status-pill ${order.status.toLowerCase()}">${order.status}</span>
          </div>
          <div>${lines}</div>
          ${order.note ? `<p class="muted"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ""}
          <div class="status-actions">
            <button data-status="${order.id}:Preparing">Preparing</button>
            <button data-status="${order.id}:Ready">Ready</button>
            <button data-status="${order.id}:Served">Served</button>
            <button class="danger-action" data-status="${order.id}:Cancelled">Cancel</button>
          </div>
        </article>
      `;
    })
    .join("");

  board.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [orderId, status] = button.dataset.status.split(":");
      if (status === "Cancelled" && !window.confirm("Cancel this order?")) return;
      updateOrderStatus(orderId, status);
    });
  });
}

function renderFrontDesk() {
  const tableList = document.getElementById("frontTableList");
  tableList.innerHTML = allTables()
    .map((table) => {
      const count = openOrdersForTable(table.id).length;
      return `
        <button class="table-button ${table.id === selectedFrontTableId ? "active" : ""}" data-front-table="${table.id}">
          ${table.name}
          <p class="muted">${count} open order${count === 1 ? "" : "s"} - ${money(tableTotal(table.id))}</p>
        </button>
      `;
    })
    .join("");

  tableList.querySelectorAll("[data-front-table]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFrontTableId = button.dataset.frontTable;
      renderFrontDesk();
    });
  });

  renderInvoice();
}

function renderInvoice() {
  const panel = document.getElementById("invoicePanel");
  const profile = restaurant();
  if (!allTables().some((table) => table.id === selectedFrontTableId)) selectedFrontTableId = allTables()[0].id;
  const table = allTables().find((entry) => entry.id === selectedFrontTableId) || allTables()[0];
  const orders = openOrdersForTable(table.id);
  const lines = orders.flatMap((order) => order.items.map((item) => ({ ...item, orderNumber: order.number })));
  const subtotal = orders.reduce((sum, order) => sum + orderSubtotal(order), 0);
  const tax = orders.reduce((sum, order) => sum + orderTax(order), 0);
  const total = orders.reduce((sum, order) => sum + orderTotal(order), 0);

  if (!orders.length) {
    panel.innerHTML = `
      <div class="invoice-header">
        <div>
          <p class="eyebrow">Invoice</p>
          <h2>${table.name}</h2>
        </div>
      </div>
      <div class="empty-state">No open orders for this table.</div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="invoice-header">
      <div>
        <p class="eyebrow">Invoice</p>
        <h2>${table.name}</h2>
        <p class="muted">${escapeHtml(profile.name)} - ABN ${escapeHtml(profile.taxId || "N/A")}</p>
        <p class="muted">${escapeHtml(profile.address || "")}</p>
      </div>
      <span class="status-pill">Open</span>
    </div>
    <div>
      ${lines
        .map(
          (item) => `
            <div class="line-row">
              <span>${item.quantity} x ${escapeHtml(item.name)}<p class="muted">${optionSummary(item.options) || "No options"} - Order #${item.orderNumber}</p></span>
              <strong>${money(item.price * item.quantity)}</strong>
            </div>
          `
        )
        .join("")}
    </div>
    <div class="line-row"><span>Subtotal ex. GST</span><strong>${money(subtotal)}</strong></div>
    <div class="line-row"><span>GST included</span><strong>${money(tax)}</strong></div>
    <div class="line-row"><span>Total</span><strong>${money(total)}</strong></div>
    <div class="invoice-actions">
      <select id="paymentMethod" aria-label="Payment method"><option>Card</option><option>Cash</option><option>EFTPOS</option><option>Other</option></select>
      <button class="primary-button" id="printInvoice">Print Invoice</button>
      <button class="ghost-button" id="markPaid">Record payment</button>
    </div>
  `;

  document.getElementById("printInvoice").addEventListener("click", () => printInvoice(table.id));
  document.getElementById("markPaid").addEventListener("click", () => markOrdersPaid(orders, document.getElementById("paymentMethod").value));
}

const REPORT_TAB_LABELS = { sales: "Sales", menu: "Menu", tables: "Tables", hourly: "Hourly", orders: "Orders" };
const REPORT_TAB_LOADERS = {
  sales: "loadSalesReport",
  menu: "loadMenuReport",
  tables: "loadTableReport",
  hourly: "loadHourlyReport",
  orders: "loadOrderReport"
};

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function restaurantToday() {
  if (reportDashboard?.today) return reportDashboard.today;
  const timezone = restaurant().timezone || "Australia/Sydney";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function rangeForReportPreset(preset) {
  const today = restaurantToday();
  if (preset === "yesterday") {
    const yesterday = shiftIsoDate(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "last7") return { from: shiftIsoDate(today, -6), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: today, to: today };
}

function formatReportPeriod(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function currentReportRange() {
  return reportRange || rangeForReportPreset(reportRangePreset);
}

function reportRangeText() {
  const range = currentReportRange();
  return range.from === range.to ? formatReportPeriod(range.from) : `${formatReportPeriod(range.from)} – ${formatReportPeriod(range.to)}`;
}

function reportTable(headers, rows) {
  if (!rows?.length) return `<div class="empty-state">No report data for this period.</div>`;
  return `
    <div class="report-table-wrap">
      <table class="report-data-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${header.format ? header.format(row[header.key], row) : escapeHtml(row[header.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderSalesLineChart(rows) {
  if (!rows?.length || !rows.some((row) => Number(row.sales) > 0)) return `<div class="empty-state report-chart-empty">No completed sales in this period.</div>`;
  const values = rows.map((row) => Number(row.sales) || 0);
  const maximum = Math.max(...values, 1);
  const width = 760;
  const height = 250;
  const left = 54;
  const top = 20;
  const chartWidth = width - left - 24;
  const chartHeight = height - top - 42;
  const points = values.map((value, index) => {
    const x = left + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth);
    const y = top + chartHeight - (value / maximum) * chartHeight;
    return { x, y, value, label: rows[index].period_start };
  });
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${left},${top + chartHeight} ${polyline} ${left + chartWidth},${top + chartHeight}`;
  return `
    <div class="report-chart" role="img" aria-label="Sales trend from ${escapeHtml(reportRangeText())}">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <line class="chart-axis" x1="${left}" y1="${top + chartHeight}" x2="${left + chartWidth}" y2="${top + chartHeight}"></line>
        <line class="chart-grid" x1="${left}" y1="${top}" x2="${left + chartWidth}" y2="${top}"></line>
        <line class="chart-grid" x1="${left}" y1="${top + chartHeight / 2}" x2="${left + chartWidth}" y2="${top + chartHeight / 2}"></line>
        <polygon class="chart-area" points="${area}"></polygon>
        <polyline class="chart-line" points="${polyline}"></polyline>
        ${points.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(formatReportPeriod(point.label))}: ${money(point.value)}</title></circle>`).join("")}
        <text class="chart-label" x="4" y="${top + 6}">${escapeHtml(money(maximum))}</text>
        <text class="chart-label" x="4" y="${top + chartHeight + 4}">$0</text>
      </svg>
      <div class="chart-caption"><span>${escapeHtml(formatReportPeriod(rows[0].period_start))}</span><span>${escapeHtml(formatReportPeriod(rows.at(-1).period_start))}</span></div>
    </div>`;
}

function reportBars(rows, labelKey, valueKey, formatValue = (value) => value) {
  if (!rows?.length) return `<div class="empty-state">No report data for this period.</div>`;
  const maximum = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return `<div class="report-bars">${rows.map((row) => {
    const width = Math.max(0, ((Number(row[valueKey]) || 0) / maximum) * 100);
    return `<div class="report-bar-row">
      <div class="report-bar-label"><span>${escapeHtml(row[labelKey])}</span><strong>${escapeHtml(formatValue(row[valueKey]))}</strong></div>
      <div class="report-bar-track"><span style="width:${width.toFixed(2)}%"></span></div>
    </div>`;
  }).join("")}</div>`;
}

function renderSalesReport(data) {
  const rows = data?.rows || [];
  const summary = data?.summary || {};
  return `
    <div class="report-section-heading"><div><p class="eyebrow">Completed orders</p><h3>Sales trend</h3></div><span class="report-chip">${escapeHtml(data?.granularity || "day")}</span></div>
    <div class="report-summary-strip">
      <div><span>Sales</span><strong>${money(summary.sales || 0)}</strong></div>
      <div><span>Orders</span><strong>${Number(summary.order_count) || 0}</strong></div>
      <div><span>Average order</span><strong>${money(summary.average_order_value || 0)}</strong></div>
    </div>
    ${renderSalesLineChart(rows)}
    ${reportTable([
      { label: "Period", key: "period_start", format: (value) => escapeHtml(formatReportPeriod(value)) },
      { label: "Sales", key: "sales", format: money },
      { label: "Orders", key: "order_count" },
      { label: "Average order", key: "average_order_value", format: money }
    ], rows)}`;
}

function renderMenuReport(data) {
  const top = data?.top_items || [];
  const lowest = data?.lowest_items || [];
  const categories = data?.categories || [];
  return `
    <div class="report-section-heading"><div><p class="eyebrow">What customers choose</p><h3>Menu performance</h3></div></div>
    <div class="report-split">
      <section><h4>Best-selling items</h4>${reportTable([
        { label: "Item", key: "item_name" }, { label: "Sold", key: "quantity" }, { label: "Revenue", key: "revenue", format: money }
      ], top)}</section>
      <section><h4>Lowest-selling items</h4>${reportTable([
        { label: "Item", key: "item_name" }, { label: "Sold", key: "quantity" }, { label: "Revenue", key: "revenue", format: money }
      ], lowest)}</section>
    </div>
    <section class="report-subsection"><h4>Revenue by category</h4>
      ${reportBars(categories, "category_name", "revenue", money)}
      ${reportTable([{ label: "Category", key: "category_name" }, { label: "Items sold", key: "quantity" }, { label: "Revenue", key: "revenue", format: money }], categories)}
    </section>`;
}

function renderTableReport(data) {
  const rows = data?.rows || [];
  return `
    <div class="report-section-heading"><div><p class="eyebrow">Where guests spend</p><h3>Table performance</h3></div></div>
    ${reportBars(rows, "table_name", "sales", money)}
    ${reportTable([
      { label: "Table", key: "table_name" }, { label: "Sales", key: "sales", format: money },
      { label: "Orders", key: "order_count" }, { label: "Average spend", key: "average_spend", format: money }
    ], rows)}`;
}

function renderHourlyReport(data) {
  const rows = (data?.rows || []).map((row) => ({ ...row, hour_label: `${String(row.hour).padStart(2, "0")}:00` }));
  return `
    <div class="report-section-heading"><div><p class="eyebrow">When orders arrive</p><h3>Hourly demand</h3></div></div>
    <div class="hourly-chart-wrap"><div class="hourly-chart">${rows.map((row) => {
      const maximum = Math.max(...rows.map((entry) => Number(entry.order_count) || 0), 1);
      const height = ((Number(row.order_count) || 0) / maximum) * 100;
      return `<div class="hour-column" title="${escapeHtml(row.hour_label)}: ${Number(row.order_count) || 0} orders, ${money(row.sales)}">
        <span class="hour-value">${Number(row.order_count) || 0}</span><div><i style="height:${height.toFixed(2)}%"></i></div><small>${String(row.hour).padStart(2, "0")}</small>
      </div>`;
    }).join("")}</div></div>
    ${reportTable([
      { label: "Hour", key: "hour_label" }, { label: "Orders", key: "order_count" }, { label: "Sales", key: "sales", format: money }
    ], rows)}`;
}

function renderOrderReport(data) {
  return `
    <div class="report-section-heading"><div><p class="eyebrow">Order outcomes</p><h3>Order summary</h3></div></div>
    <div class="order-report-grid">
      <article class="metric-card"><p class="eyebrow">Completed orders</p><strong>${Number(data?.completed_orders) || 0}</strong></article>
      <article class="metric-card"><p class="eyebrow">Cancelled orders</p><strong>${Number(data?.cancelled_orders) || 0}</strong></article>
      <article class="metric-card"><p class="eyebrow">Average preparation</p><strong>${data?.average_preparation_minutes == null ? "No data" : `${Number(data.average_preparation_minutes).toFixed(1)} min`}</strong></article>
      <article class="metric-card"><p class="eyebrow">Average order</p><strong>${money(data?.average_order_value || 0)}</strong></article>
    </div>
    ${reportTable([
      { label: "Completed", key: "completed_orders" }, { label: "Cancelled", key: "cancelled_orders" },
      { label: "Average preparation", key: "average_preparation_minutes", format: (value) => value == null ? "No data" : `${Number(value).toFixed(1)} min` },
      { label: "Average order", key: "average_order_value", format: money },
      { label: "Completed sales", key: "completed_sales", format: money }
    ], [data || {}])}`;
}

function renderReportWorkspace() {
  const workspace = document.getElementById("reportWorkspace");
  if (!workspace) return;
  if (reportLoading && !reportData[activeReportTab]) {
    workspace.innerHTML = `<div class="report-loading"><span></span><p>Loading ${escapeHtml(REPORT_TAB_LABELS[activeReportTab])} report…</p></div>`;
    return;
  }
  if (reportError && !reportData[activeReportTab]) {
    workspace.innerHTML = `<div class="empty-state"><strong>Report unavailable</strong><p>${escapeHtml(reportError)}</p><button class="ghost-button" type="button" id="retryReports">Try again</button></div>`;
    document.getElementById("retryReports")?.addEventListener("click", () => loadReports({ refreshDashboard: true }));
    return;
  }
  const renderers = { sales: renderSalesReport, menu: renderMenuReport, tables: renderTableReport, hourly: renderHourlyReport, orders: renderOrderReport };
  workspace.innerHTML = renderers[activeReportTab](reportData[activeReportTab]);
}

function renderReports() {
  const metrics = document.getElementById("reportMetrics");
  if (!metrics) return;
  const dashboard = reportDashboard || {};
  metrics.innerHTML = [
    ["Today's Sales", reportDashboard ? money(dashboard.today_sales || 0) : "—"],
    ["Orders Today", reportDashboard ? Number(dashboard.orders_today) || 0 : "—"],
    ["Average Order", reportDashboard ? money(dashboard.average_order_value || 0) : "—"],
    ["Active Tables", reportDashboard ? Number(dashboard.active_tables) || 0 : "—"],
    ["Pending Orders", reportDashboard ? Number(dashboard.pending_orders) || 0 : "—"]
  ].map(([label, value]) => `<article class="metric-card"><p class="eyebrow">${label}</p><strong>${value}</strong></article>`).join("");

  document.querySelectorAll("[data-report-range]").forEach((button) => button.classList.toggle("active", button.dataset.reportRange === reportRangePreset));
  document.querySelectorAll("[data-report-tab]").forEach((button) => {
    const active = button.dataset.reportTab === activeReportTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.getElementById("reportCustomRange")?.classList.toggle("hidden", reportRangePreset !== "custom");
  const range = currentReportRange();
  if (document.activeElement?.id !== "reportFrom") document.getElementById("reportFrom").value = range.from;
  if (document.activeElement?.id !== "reportTo") document.getElementById("reportTo").value = range.to;
  document.getElementById("reportRangeLabel").textContent = reportRangeText();
  const status = document.getElementById("reportStatus");
  status.className = `report-status${reportError ? " error" : reportLoading ? " loading" : ""}`;
  status.textContent = reportError || (reportLoading ? "Refreshing report…" : reportDashboard ? `Updated for ${restaurant().name}` : "Open Reports to load live data.");
  renderReportWorkspace();
}

async function loadReports({ refreshDashboard = false } = {}) {
  if (!staffUser?.restaurantId || !window.TableOrderCloud) return;
  const loader = window.TableOrderCloud[REPORT_TAB_LOADERS[activeReportTab]];
  if (!loader) {
    reportError = "Run migration 009_reporting_layer.sql before loading reports.";
    renderReports();
    return;
  }
  const requestId = ++reportRequestId;
  reportLoading = true;
  reportError = "";
  renderReports();
  try {
    const shouldLoadDashboard = refreshDashboard || !reportDashboard;
    let dashboard = null;
    if (shouldLoadDashboard) {
      dashboard = await window.TableOrderCloud.loadReportDashboard(staffUser.restaurantId);
      if (requestId !== reportRequestId) return;
      reportDashboard = dashboard;
      if (reportRangePreset !== "custom") reportRange = rangeForReportPreset(reportRangePreset);
    }
    const data = await loader(staffUser.restaurantId, currentReportRange());
    if (requestId !== reportRequestId) return;
    reportData[activeReportTab] = data;
  } catch (error) {
    if (requestId !== reportRequestId) return;
    reportError = error.message;
  } finally {
    if (requestId === reportRequestId) {
      reportLoading = false;
      renderReports();
    }
  }
}

function renderSetup() {
  renderBrand();
  renderProfileForm();
  renderThemeForm();

  document.getElementById("qrSheet").innerHTML = allTables()
    .map(
      (table) => {
        const link = tableOrderingLink(table);
        return `
        <article class="qr-card">
          <div class="qr-brand">
            <img src="${escapeHtml(restaurant().logoFullData || restaurant().logoData || DEFAULT_LOGO_DATA)}" alt="${escapeHtml(restaurant().name)} logo">
            <span>${escapeHtml(restaurant().name)}</span>
          </div>
          <canvas class="qr-canvas" width="220" height="220" data-qr-table="${table.id}" aria-label="QR code for ${escapeHtml(table.name)}"></canvas>
          <strong>${escapeHtml(table.name)}</strong>
          <p class="qr-instruction">Scan to order at your table</p>
          <p class="muted">${escapeHtml(table.token)}</p>
          <div class="qr-actions">
            <button class="ghost-button" data-copy-qr-table="${table.id}">Copy Link</button>
            <button class="ghost-button" data-download-qr="${table.id}">PNG</button>
          </div>
        </article>
      `;
      }
    )
    .join("");
  renderQrCanvases();

  renderTableAdmin();

  document.getElementById("categoryOptions").innerHTML = menuCategories()
    .filter((category) => category !== "All")
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");

  document.getElementById("dishOptionTemplate").innerHTML = Object.entries(optionTemplates)
    .map(([id, template]) => `<option value="${id}">${escapeHtml(template.label)}</option>`)
    .join("");

  document.getElementById("samplePhotoRow").innerHTML = Object.entries(samplePhotoUrls)
    .map(([label, url]) => `<button class="ghost-button" type="button" data-sample-photo="${escapeHtml(url)}">${escapeHtml(label)}</button>`)
    .join("");

  document.getElementById("menuStatus").innerHTML = allMenuItems()
    .map(
      (item) => `
        <div class="status-row">
          <span>${escapeHtml(item.name)}<p class="muted">${escapeHtml(item.category)} - ${money(item.price)} - ${escapeHtml(optionTemplateLabel(item.optionTemplate))}</p></span>
          <span class="status-buttons">
            <input class="photo-url-input" data-photo-url="${item.id}" type="url" placeholder="Photo URL" value="${escapeHtml(normalizePhotoUrl(item.photoData))}" />
            <button class="ghost-button" data-sample-item-photo="${item.id}" type="button">Sample</button>
            <button class="ghost-button" data-save-photo="${item.id}" type="button">Save Photo</button>
            <button class="ghost-button" data-soldout="${item.id}">${itemSoldOut(item) ? "Available" : "Sold Out"}</button>
            ${item.id.startsWith("custom_") ? `<button class="ghost-button" data-delete-item="${item.id}">Delete</button>` : ""}
          </span>
        </div>
      `
    )
    .join("");

  document.querySelectorAll("[data-sample-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("dishPhotoUrl").value = button.dataset.samplePhoto;
    });
  });

  document.querySelectorAll("[data-sample-item-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = itemById(button.dataset.sampleItemPhoto);
      const input = photoInputForItem(button.dataset.sampleItemPhoto);
      if (!item || !input) return;
      const sample = samplePhotoForItem(item);
      input.value = sample;
    });
  });

  document.querySelectorAll("[data-save-photo]").forEach((button) => {
    button.addEventListener("click", () => saveMenuItemPhoto(button.dataset.savePhoto));
  });

  document.querySelectorAll("[data-soldout]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.soldout;
      const item = itemById(id);
      const soldOut = !itemSoldOut({ id });
      state.soldOutIds = itemSoldOut({ id })
        ? state.soldOutIds.filter((entry) => entry !== id)
        : [...state.soldOutIds, id];
      saveState();
      render();

      if (!item?.cloudId || !window.TableOrderCloud?.updateMenuItemSoldOut || !staffUser) {
        showOrderToast(item?.cloudId ? "Sold out status saved locally. Staff login is required for cloud sync." : "Sold out status saved locally.", "success");
        return;
      }

      try {
        await window.TableOrderCloud.updateMenuItemSoldOut(item.cloudId, soldOut);
        showOrderToast("Sold out status saved to cloud.", "success");
        await loadCloudDataIntoApp({ silent: true });
      } catch (error) {
        showOrderToast(`Sold out cloud save failed: ${error.message}`, "warning");
      }
    });
  });

  document.querySelectorAll("[data-delete-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteItem;
      const item = itemById(id);
      state.menuItems = allMenuItems().filter((item) => item.id !== id);
      state.soldOutIds = state.soldOutIds.filter((entry) => entry !== id);
      normalizeCart();
      state.cart = state.cart.filter((line) => line.itemId !== id);
      saveState();
      render();

      if (!item?.cloudId || !window.TableOrderCloud?.deactivateMenuItem || !staffUser) {
        showOrderToast(item?.cloudId ? "Dish deleted locally. Staff login is required for cloud sync." : "Dish deleted locally.", "success");
        return;
      }

      try {
        await window.TableOrderCloud.deactivateMenuItem(item.cloudId);
        showOrderToast("Dish deleted from cloud.", "success");
        await loadCloudDataIntoApp({ silent: true });
      } catch (error) {
        showOrderToast(`Dish delete cloud save failed: ${error.message}`, "warning");
      }
    });
  });

  document.querySelectorAll("[data-copy-qr-table]").forEach((button) => {
    button.addEventListener("click", () => {
      const table = allTables().find((entry) => entry.id === button.dataset.copyQrTable);
      if (table) copyText(tableOrderingLink(table));
    });
  });

  document.querySelectorAll("[data-download-qr]").forEach((button) => {
    button.addEventListener("click", () => downloadQrPng(button.dataset.downloadQr));
  });
}

function renderTableAdmin() {
  const list = document.getElementById("tableAdminList");
  list.innerHTML = allTables()
    .map((table) => {
      const hasOpenOrders = openOrdersForTable(table.id).length > 0;
      return `
        <div class="table-admin-row">
          <div>
            <strong>${escapeHtml(table.name)}</strong>
            <p class="muted">${escapeHtml(tableOrderingLink(table))}</p>
          </div>
          <span class="status-buttons">
            <button class="ghost-button" data-copy-table="${table.id}">Copy</button>
            <button class="ghost-button" data-reset-token="${table.id}">Reset Link</button>
            <button class="ghost-button" data-delete-table="${table.id}" ${hasOpenOrders || allTables().length === 1 ? "disabled" : ""}>Delete</button>
          </span>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-copy-table]").forEach((button) => {
    button.addEventListener("click", () => {
      const table = allTables().find((entry) => entry.id === button.dataset.copyTable);
      if (table) copyText(tableOrderingLink(table));
    });
  });

  list.querySelectorAll("[data-reset-token]").forEach((button) => {
    button.addEventListener("click", async () => {
      const table = allTables().find((entry) => entry.id === button.dataset.resetToken);
      if (!table) return;
      table.token = makeToken();
      saveState();
      render();

      if (!table.cloudId || !window.TableOrderCloud?.updateRestaurantTable || !staffUser) {
        showOrderToast(table.cloudId ? "Table link reset locally. Staff login is required for cloud sync." : "Table link reset locally.", "success");
        return;
      }

      try {
        await window.TableOrderCloud.updateRestaurantTable(table.cloudId, { table_token: table.token });
        showOrderToast("Table link reset in cloud.", "success");
        await loadCloudDataIntoApp({ silent: true });
      } catch (error) {
        showOrderToast(`Table link cloud save failed: ${error.message}`, "warning");
      }
    });
  });

  list.querySelectorAll("[data-delete-table]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteTable(button.dataset.deleteTable);
    });
  });
}

function renderQrCanvases() {
  document.querySelectorAll("[data-qr-table]").forEach((canvas) => {
    const table = allTables().find((entry) => entry.id === canvas.dataset.qrTable);
    if (!table) return;
    drawQrCanvas(canvas, tableOrderingLink(table));
  });
}

function downloadQrPng(tableId) {
  const table = allTables().find((entry) => entry.id === tableId);
  const canvas = [...document.querySelectorAll("[data-qr-table]")].find((entry) => entry.dataset.qrTable === tableId);
  if (!table || !canvas) return;

  const link = document.createElement("a");
  link.download = `${table.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table"}-qr.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function downloadAllQrCodes() {
  renderQrCanvases();
  const tables = allTables();
  if (!tables.length) return;
  const columns = tables.length > 4 ? 3 : 2;
  const cardWidth = 320;
  const cardHeight = 380;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cardWidth;
  canvas.height = Math.ceil(tables.length / columns) * cardHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  tables.forEach((table, index) => {
    const source = [...document.querySelectorAll("[data-qr-table]")].find((entry) => entry.dataset.qrTable === table.id);
    if (!source) return;
    const x = (index % columns) * cardWidth;
    const y = Math.floor(index / columns) * cardHeight;
    context.strokeStyle = "#ded4c7";
    context.strokeRect(x + 12, y + 12, cardWidth - 24, cardHeight - 24);
    context.fillStyle = "#211b18";
    context.font = "700 22px Arial";
    context.fillText(restaurant().name, x + cardWidth / 2, y + 48);
    context.drawImage(source, x + 50, y + 66, 220, 220);
    context.font = "700 20px Arial";
    context.fillText(table.name, x + cardWidth / 2, y + 315);
    context.font = "15px Arial";
    context.fillText("Scan to order", x + cardWidth / 2, y + 342);
  });
  const link = document.createElement("a");
  link.download = `${(restaurant().slug || restaurant().name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-all-table-qr-codes.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function renderQrPrintCard(table, qrDataUrl) {
  const profile = restaurant();
  return `
    <article class="print-qr-card">
      <img class="print-qr-logo" src="${escapeHtml(profile.logoFullData || profile.logoData || DEFAULT_LOGO_DATA)}" alt="${escapeHtml(profile.name)} logo">
      <h2>${escapeHtml(profile.name)}</h2>
      <p class="print-qr-subtitle">Japanese QR table ordering</p>
      <img class="print-qr-image" src="${qrDataUrl}" alt="QR code for ${escapeHtml(table.name)}">
      <h3>${escapeHtml(table.name)}</h3>
      <p>Scan to order from your table.</p>
      <small>${escapeHtml(tableOrderingLink(table))}</small>
    </article>
  `;
}

function printQrSheet() {
  renderQrCanvases();
  const cards = allTables()
    .map((table) => {
      const canvas = [...document.querySelectorAll("[data-qr-table]")].find((entry) => entry.dataset.qrTable === table.id);
      return canvas ? renderQrPrintCard(table, canvas.toDataURL("image/png")) : "";
    })
    .join("");

  setPrintContent(`<section class="print-qr-sheet">${cards}</section>`);
  printPreparedContent();
}

function renderBrand() {
  const profile = restaurant();
  document.getElementById("restaurantTitle").textContent = profile.name;
  document.getElementById("brandSubtitle").textContent = profile.subtitle || defaultRestaurant.subtitle;
  document.getElementById("openStatus").textContent = profile.isOpen ? "Open" : "Closed";
  document.getElementById("openStatus").className = `status-pill ${profile.isOpen ? "ready" : ""}`;

  const logo = document.getElementById("brandLogo");
  if (profile.logoData) {
    logo.innerHTML = `<img src="${profile.logoData}" alt="${escapeHtml(profile.name)} logo">`;
  } else {
    logo.textContent = profile.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  document.getElementById("authBrandLogo").innerHTML = logo.innerHTML;
}

function renderProfileForm() {
  const profile = restaurant();
  document.getElementById("restaurantName").value = profile.name;
  document.getElementById("restaurantSubtitle").value = profile.subtitle;
  document.getElementById("restaurantPhone").value = profile.phone;
  document.getElementById("restaurantTaxId").value = profile.taxId;
  document.getElementById("restaurantAddress").value = profile.address;
  document.getElementById("restaurantTaxRate").value = profile.taxRate;
  document.getElementById("restaurantIsOpen").value = profile.isOpen ? "open" : "closed";
}

function renderThemeForm() {
  const profile = restaurant();
  const theme = currentTheme();
  document.getElementById("themePreset").innerHTML = Object.entries(themePresets)
    .map(([id, preset]) => `<option value="${id}">${escapeHtml(preset.label)}</option>`)
    .join("");
  document.getElementById("themePreset").value = profile.themePreset || "classic";
  document.getElementById("primaryColor").value = profile.primaryColor || theme.accent;
  document.getElementById("menuLayout").value = profile.menuLayout || "grid";
  document.getElementById("showPhotos").checked = profile.showPhotos !== false;
  document.getElementById("themePreview").innerHTML = `
    <div class="preview-swatch" style="background:${escapeHtml(profile.primaryColor || theme.accent)}"></div>
    <div>
      <strong>${escapeHtml(theme.label)}</strong>
      <p class="muted">${escapeHtml(profile.menuLayout || "grid")} layout - photos ${profile.showPhotos === false ? "hidden" : "shown"}</p>
    </div>
  `;
}

function printKitchen() {
  const firstNewOrder = state.orders.find((order) => order.status === "New");
  if (!firstNewOrder) return;
  setPrintContent(renderPrintOrder(firstNewOrder, "Kitchen Docket"));
  printPreparedContent();
}

function printInvoice(tableId) {
  const profile = restaurant();
  const table = allTables().find((entry) => entry.id === tableId) || allTables()[0];
  const orders = openOrdersForTable(table.id);
  const lines = orders.flatMap((order) => order.items);
  const subtotal = orders.reduce((sum, order) => sum + orderSubtotal(order), 0);
  const tax = orders.reduce((sum, order) => sum + orderTax(order), 0);
  const total = orders.reduce((sum, order) => sum + orderTotal(order), 0);
  setPrintContent(`
    <h2>${table.name}</h2>
    <p>${escapeHtml(profile.name)}</p>
    <p>${escapeHtml(profile.address || "")}</p>
    <p>${escapeHtml(profile.phone || "")}</p>
    <hr>
    ${lines
      .map((item) => `<p>${item.quantity} x ${escapeHtml(item.name)}<br>${escapeHtml(optionSummary(item.options) || "No options")}<br>${money(item.price * item.quantity)}</p>`)
      .join("")}
    <hr>
    <p>Subtotal ex. GST: ${money(subtotal)}</p>
    <p>GST included: ${money(tax)}</p>
    <h3>Total: ${money(total)}</h3>
  `);
  printPreparedContent();
}

function printDailyReport() {
  if (!reportDashboard || !reportData[activeReportTab]) {
    showOrderToast("Load the report before printing.", "warning");
    return;
  }
  const workspace = document.getElementById("reportWorkspace");
  setPrintContent(`
    <h2>${escapeHtml(REPORT_TAB_LABELS[activeReportTab])} Report</h2>
    <p>${escapeHtml(restaurant().name)}</p>
    <p>${escapeHtml(reportRangeText())}</p>
    <hr>
    <p>Today's sales: ${money(reportDashboard.today_sales || 0)}</p>
    <p>Orders today: ${Number(reportDashboard.orders_today) || 0}</p>
    <p>Active tables: ${Number(reportDashboard.active_tables) || 0}</p>
    <hr>
    ${workspace?.innerHTML || "<p>No report data.</p>"}
  `);
  printPreparedContent();
}

function reportCsvRows() {
  const data = reportData[activeReportTab] || {};
  if (activeReportTab === "sales") return [
    ["Period", "Sales", "Orders", "Average order"],
    ...(data.rows || []).map((row) => [row.period_start, row.sales, row.order_count, row.average_order_value])
  ];
  if (activeReportTab === "menu") return [
    ["Section", "Name", "Quantity", "Revenue"],
    ...(data.top_items || []).map((row) => ["Best-selling", row.item_name, row.quantity, row.revenue]),
    ...(data.lowest_items || []).map((row) => ["Lowest-selling", row.item_name, row.quantity, row.revenue]),
    ...(data.categories || []).map((row) => ["Category", row.category_name, row.quantity, row.revenue])
  ];
  if (activeReportTab === "tables") return [
    ["Table", "Sales", "Orders", "Average spend"],
    ...(data.rows || []).map((row) => [row.table_name, row.sales, row.order_count, row.average_spend])
  ];
  if (activeReportTab === "hourly") return [
    ["Hour", "Orders", "Sales"],
    ...(data.rows || []).map((row) => [`${String(row.hour).padStart(2, "0")}:00`, row.order_count, row.sales])
  ];
  return [
    ["Completed orders", "Cancelled orders", "Average preparation minutes", "Average order value", "Completed sales"],
    [data.completed_orders, data.cancelled_orders, data.average_preparation_minutes ?? "", data.average_order_value, data.completed_sales]
  ];
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCurrentReportCsv() {
  if (!reportData[activeReportTab]) {
    showOrderToast("Load the report before exporting.", "warning");
    return;
  }
  const csv = `\uFEFF${reportCsvRows().map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `aveniq-${activeReportTab}-${currentReportRange().from}-to-${currentReportRange().to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderPrintOrder(order, title) {
  const profile = restaurant();
  const table = allTables().find((entry) => entry.id === order.tableId);
  return `
    <h2>${title}</h2>
    <p>${escapeHtml(profile.name)}</p>
    <p>Order #${order.number}</p>
    <p>${table?.name || "Table"} - ${order.createdLabel}</p>
    <hr>
    ${order.items
      .map((item) => `<p><strong>${item.quantity} x</strong> ${escapeHtml(item.name)}<br>${escapeHtml(optionSummary(item.options) || "No options")}</p>`)
      .join("")}
    ${order.note ? `<hr><p>Note: ${escapeHtml(order.note)}</p>` : ""}
  `;
}

function cloudProfilePayload(profile) {
  const logoUrl = !profile.logoData
    ? ""
    : /^https?:\/\//.test(profile.logoData) || profile.logoData.startsWith("/assets/")
      ? profile.logoData
      : DEFAULT_LOGO_DATA;
  return {
    ...profile,
    logoUrl,
    themeConfig: {
      themePreset: profile.themePreset,
      primaryColor: profile.primaryColor,
      menuLayout: profile.menuLayout,
      showPhotos: profile.showPhotos,
      logoWatermarkData: profile.logoWatermarkData,
      logoFullData: profile.logoFullData || ""
    }
  };
}

async function saveProfileToCloud(profile, successMessage) {
  if (!window.TableOrderCloud?.updateRestaurantProfile || !staffUser || !profile.cloudId) {
    showOrderToast(
      !staffUser
        ? "Saved locally. Staff login is required for cloud sync."
        : !profile.cloudId
          ? "Saved locally. Load Cloud Data first for cloud sync."
          : "Saved on this device.",
      "success"
    );
    return;
  }

  try {
    await window.TableOrderCloud.updateRestaurantProfile(profile.cloudId, cloudProfilePayload(profile));
    showOrderToast(successMessage, "success");
    await loadCloudDataIntoApp({ silent: true });
  } catch (error) {
    showOrderToast(`Saved locally, cloud save failed: ${error.message}`, "warning");
  }
}

async function saveRestaurantProfile(event) {
  event.preventDefault();

  const current = restaurant();
  const logoFile = document.getElementById("restaurantLogo").files[0];
  const logoData = logoFile ? await readPhotoAsDataUrl(logoFile) : current.logoData;
  const savedProfile = {
    ...current,
    name: document.getElementById("restaurantName").value.trim() || defaultRestaurant.name,
    subtitle: document.getElementById("restaurantSubtitle").value.trim() || defaultRestaurant.subtitle,
    phone: document.getElementById("restaurantPhone").value.trim(),
    taxId: document.getElementById("restaurantTaxId").value.trim(),
    address: document.getElementById("restaurantAddress").value.trim(),
    taxRate: Number(document.getElementById("restaurantTaxRate").value) || 0,
    isOpen: document.getElementById("restaurantIsOpen").value === "open",
    logoData,
    logoWatermarkData: logoFile ? logoData : current.logoWatermarkData
  };

  state.restaurant = savedProfile;
  saveState();
  render();

  await saveProfileToCloud(savedProfile, "Restaurant profile saved to cloud.");
}

async function saveThemeSettings(event) {
  event.preventDefault();
  state.restaurant = {
    ...restaurant(),
    themePreset: document.getElementById("themePreset").value,
    primaryColor: document.getElementById("primaryColor").value,
    menuLayout: document.getElementById("menuLayout").value,
    showPhotos: document.getElementById("showPhotos").checked
  };
  saveState();
  render();
  await saveProfileToCloud(restaurant(), "Theme settings saved to cloud.");
}

function applyPresetColor() {
  const preset = themePresets[document.getElementById("themePreset").value] || themePresets.classic;
  document.getElementById("primaryColor").value = preset.accent;
  state.restaurant = {
    ...restaurant(),
    themePreset: document.getElementById("themePreset").value,
    primaryColor: preset.accent,
    menuLayout: document.getElementById("menuLayout").value,
    showPhotos: document.getElementById("showPhotos").checked
  };
  saveState();
  render();
}

function samplePhotoForItem(item) {
  const text = `${item.name} ${item.category}`.toLowerCase();
  if (/ramen|noodle|udon/.test(text)) return samplePhotoUrls.Ramen;
  if (/salad|kimchi|wakame|seaweed|vegetable/.test(text)) return samplePhotoUrls.Salad;
  if (/tempura|karaage|prawn|fried|gyoza|tofu/.test(text)) return samplePhotoUrls.Tempura;
  return samplePhotoUrls.Sushi;
}

function photoInputForItem(itemId) {
  return [...document.querySelectorAll("[data-photo-url]")].find((input) => input.dataset.photoUrl === itemId) || null;
}

async function saveMenuItemPhoto(itemId) {
  const item = itemById(itemId);
  const input = photoInputForItem(itemId);
  if (!item || !input) return;

  const photoUrl = normalizePhotoUrl(input.value);
  input.value = photoUrl;
  item.photoData = photoUrl;
  saveState();
  renderMenu();

  if (!item.cloudId || !window.TableOrderCloud?.updateMenuItemPhoto || !staffUser) {
    showOrderToast(item.cloudId ? "Photo saved locally. Staff login is required for cloud sync." : "Photo saved locally.", "success");
    return;
  }

  try {
    await window.TableOrderCloud.updateMenuItemPhoto(item.cloudId, photoUrl);
    showOrderToast("Photo URL saved to cloud.", "success");
    await loadCloudDataIntoApp({ silent: true });
  } catch (error) {
    showOrderToast(`Photo cloud save failed: ${error.message}`, "warning");
  }
}

async function addTable(event) {
  event.preventDefault();
  const nameInput = document.getElementById("tableName");
  const name = nameInput.value.trim();
  if (!name) return;

  const table = {
    id: `table_${Date.now()}`,
    name,
    token: makeToken()
  };

  state.tables = [...allTables(), table];
  selectedTableId = table.id;
  selectedFrontTableId = table.id;
  nameInput.value = "";
  saveState();
  render();

  if (!window.TableOrderCloud?.createRestaurantTable || !staffUser || !restaurant().cloudId) {
    showOrderToast(!staffUser ? "Table saved locally. Staff login is required for cloud sync." : "Table saved locally.", "success");
    return;
  }

  try {
    const rows = await window.TableOrderCloud.createRestaurantTable(restaurant().cloudId, table, allTables().length);
    const created = rows?.[0];
    if (created) table.cloudId = created.id;
    saveState();
    showOrderToast("Table saved to cloud.", "success");
    await loadCloudDataIntoApp({ silent: true });
  } catch (error) {
    showOrderToast(`Table cloud save failed: ${error.message}`, "warning");
  }
}

async function deleteTable(tableId) {
  if (openOrdersForTable(tableId).length > 0 || allTables().length === 1) return;
  const table = allTables().find((entry) => entry.id === tableId);

  state.tables = allTables().filter((table) => table.id !== tableId);
  if (selectedTableId === tableId) selectedTableId = state.tables[0].id;
  if (selectedFrontTableId === tableId) selectedFrontTableId = state.tables[0].id;
  saveState();
  render();

  if (!table?.cloudId || !window.TableOrderCloud?.deactivateRestaurantTable || !staffUser) {
    showOrderToast(table?.cloudId ? "Table deleted locally. Staff login is required for cloud sync." : "Table deleted locally.", "success");
    return;
  }

  try {
    await window.TableOrderCloud.deactivateRestaurantTable(table.cloudId);
    showOrderToast("Table deleted from cloud.", "success");
    await loadCloudDataIntoApp({ silent: true });
  } catch (error) {
    showOrderToast(`Table delete cloud save failed: ${error.message}`, "warning");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseMenuCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], errors: ["CSV needs a header row and at least one menu item."] };

  const headers = rows[0].map((header) => header.toLowerCase().replace(/\s+/g, ""));
  const indexOf = (...names) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0);
  const nameIndex = indexOf("name", "dish", "dishname", "item");
  const categoryIndex = indexOf("category", "section");
  const priceIndex = indexOf("price", "amount");
  const descriptionIndex = indexOf("description", "desc");
  const tagsIndex = indexOf("tags", "tag");
  const optionIndex = indexOf("optiontemplate", "options", "modifier", "modifiers");

  if (nameIndex === undefined || categoryIndex === undefined || priceIndex === undefined) {
    return { items: [], errors: ["CSV must include name, category and price columns."] };
  }

  const errors = [];
  const items = rows.slice(1).flatMap((row, rowIndex) => {
    const name = row[nameIndex]?.trim();
    const category = row[categoryIndex]?.trim();
    const price = Number(row[priceIndex]);

    if (!name || !category || Number.isNaN(price)) {
      errors.push(`Row ${rowIndex + 2} skipped: name, category or price is invalid.`);
      return [];
    }

    return [
      {
        id: `import_${Date.now()}_${rowIndex}`,
        category,
        name,
        price,
        tags: (row[tagsIndex] || "")
          .split(/[|;]/)
          .flatMap((value) => value.split(","))
          .map((tag) => tag.trim())
          .filter(Boolean),
        description: row[descriptionIndex]?.trim() || "Imported menu item.",
        photo: `photo-${((allMenuItems().length + rowIndex) % 4) + 1}`,
        photoData: "",
        optionTemplate: normalizeOptionTemplate(row[optionIndex]),
        soldOut: false
      }
    ];
  });

  return { items, errors };
}

function renderImportPreview(items, errors = []) {
  const preview = document.getElementById("importPreview");
  document.getElementById("importCsv").disabled = !items.length;

  const errorHtml = errors.length
    ? `<div class="import-errors">${errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>`
    : "";

  if (!items.length) {
    preview.innerHTML = `${errorHtml}<div class="empty-state">No valid menu items ready to import.</div>`;
    return;
  }

  preview.innerHTML = `
    ${errorHtml}
    <div class="import-summary">${items.length} item${items.length === 1 ? "" : "s"} ready to import.</div>
    ${items
      .slice(0, 10)
      .map(
        (item) => `
          <div class="line-row">
            <span>${escapeHtml(item.name)}<p class="muted">${escapeHtml(item.category)} - ${escapeHtml(optionTemplateLabel(item.optionTemplate))}</p></span>
            <strong>${money(item.price)}</strong>
          </div>
        `
      )
      .join("")}
    ${items.length > 10 ? `<p class="muted">Showing first 10 items.</p>` : ""}
  `;
}

function previewCsvImport() {
  const csv = document.getElementById("csvText").value.trim();
  if (!csv) {
    importPreviewItems = [];
    renderImportPreview([], ["Paste CSV text or choose a CSV file first."]);
    return;
  }
  const result = parseMenuCsv(csv);
  importPreviewItems = result.items;
  renderImportPreview(result.items, result.errors);
}

function importCsvPreview() {
  if (!importPreviewItems.length) return;
  state.menuItems = [...importPreviewItems, ...allMenuItems()];
  importPreviewItems = [];
  document.getElementById("csvText").value = "";
  document.getElementById("csvFile").value = "";
  saveState();
  render();
  setView("customer");
}

function clearCsvImport() {
  importPreviewItems = [];
  document.getElementById("csvText").value = "";
  document.getElementById("csvFile").value = "";
  renderImportPreview([]);
}

function handleCsvFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("csvText").value = reader.result;
    previewCsvImport();
  };
  reader.readAsText(file);
}

function downloadSampleCsv() {
  const csv = [
    "name,category,price,description,tags,optionTemplate",
    '"Salt Pepper Squid",Mains,18.8,"Crispy squid with chilli and shallots","Popular;Spicy",spiceAddons',
    '"Beef Noodle Soup",Noodles,16.5,"Slow cooked beef noodle soup",Chef,size',
    '"Lemon Iced Tea",Drinks,6.5,"Fresh lemon black tea",Cold,drink'
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tableorder-menu-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function checkDatabaseConnection() {
  const status = document.getElementById("databaseStatus");
  if (!status) return;

  status.className = "database-status checking";
  status.innerHTML = `
    <span class="status-dot"></span>
    <div>
      <strong>Checking Supabase...</strong>
      <p class="muted">Local storage remains active during this check.</p>
    </div>
  `;

  try {
    const restaurantRow = await window.TableOrderCloud.checkConnection();
    if (!restaurantRow) {
      status.className = "database-status warning";
      status.innerHTML = `
        <span class="status-dot"></span>
        <div>
          <strong>Connected, restaurant seed missing</strong>
          <p class="muted">Run supabase-schema.sql in the Supabase SQL Editor.</p>
        </div>
      `;
      return;
    }

    status.className = "database-status connected";
    status.innerHTML = `
      <span class="status-dot"></span>
      <div>
        <strong>Connected to ${escapeHtml(restaurantRow.name)}</strong>
        <p class="muted">Project ${escapeHtml(window.TableOrderCloud.config.url)}</p>
      </div>
    `;
  } catch (error) {
    const schemaMissing = error.status === 404 || error.code === "PGRST205" || error.code === "42P01";
    status.className = `database-status ${schemaMissing ? "warning" : "error"}`;
    status.innerHTML = `
      <span class="status-dot"></span>
      <div>
        <strong>${schemaMissing ? "Project connected, schema pending" : "Supabase connection failed"}</strong>
        <p class="muted">${schemaMissing ? "Run supabase-schema.sql in the SQL Editor." : escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function setDatabaseStatus(kind, title, detail) {
  const status = document.getElementById("databaseStatus");
  if (!status) return;
  status.className = `database-status ${kind}`;
  status.innerHTML = `
    <span class="status-dot"></span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p class="muted">${escapeHtml(detail)}</p>
    </div>
  `;
}

function cloudMenuPayload() {
  return allMenuItems().map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    description: item.description,
    price: item.price,
    tags: item.tags || [],
    photoUrl: normalizePhotoUrl(item.photoData),
    optionTemplate: item.optionTemplate || "none",
    optionConfig: Array.isArray(item.optionConfig) ? item.optionConfig : optionConfigForTemplate(item.optionTemplate),
    soldOut: itemSoldOut(item)
  }));
}

async function uploadCurrentMenuToCloud() {
  const button = document.getElementById("uploadCloudMenu");
  button.disabled = true;
  setDatabaseStatus("checking", "Uploading menu...", "Keeping the local menu until Supabase confirms success.");

  try {
    const insertedCount = await window.TableOrderCloud.bootstrapMenu(cloudMenuPayload());
    setDatabaseStatus("connected", "Menu uploaded", `${insertedCount || allMenuItems().length} items added to Supabase.`);
    await loadCloudDataIntoApp();
  } catch (error) {
    const alreadyInitialized = String(error.message).includes("MENU_ALREADY_INITIALIZED");
    setDatabaseStatus(
      alreadyInitialized ? "warning" : "error",
      alreadyInitialized ? "Cloud menu already exists" : "Menu upload failed",
      alreadyInitialized ? "Use Load Cloud Data to read the existing menu." : error.message
    );
  } finally {
    button.disabled = false;
  }
}

async function importDashboardSampleMenu() {
  const button = document.getElementById("importDashboardSampleMenu");
  if (!button) return;
  if (!staffUser?.restaurantId || !restaurant().cloudId) {
    showOrderToast("Restaurant data is still loading. Please try again.", "warning");
    return;
  }
  if (allMenuItems().some((item) => item.cloudId)) {
    showOrderToast("This restaurant already has menu items.", "warning");
    return;
  }

  button.disabled = true;
  button.textContent = "Importing…";
  setDatabaseStatus("checking", "Importing sample menu...", "Adding a small test menu to this restaurant.");
  try {
    const items = ONBOARDING_SAMPLE_MENU.map((item, index) => ({
      ...item,
      id: `sample-${index + 1}`,
      tags: [],
      optionTemplate: "none"
    }));
    const count = await window.TableOrderCloud.importSampleMenu(staffUser.restaurantId, items);
    await loadCloudDataIntoApp({ silent: true });
    setDatabaseStatus("connected", "Sample menu imported", `${count} test items are ready for customer ordering.`);
    showOrderToast("Sample menu imported successfully.", "success");
  } catch (error) {
    setDatabaseStatus("error", "Sample menu import failed", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Import Sample Menu";
  }
}

function setRestaurantTeamError(message = "") {
  const node = document.getElementById("restaurantTeamError");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function restaurantInviteLink(token) {
  return `${window.location.origin}/join/${encodeURIComponent(token)}`;
}

function renderRestaurantTeam() {
  const staffList = document.getElementById("restaurantTeamList");
  const inviteList = document.getElementById("restaurantInviteList");
  if (!staffList || !inviteList) return;

  staffList.innerHTML = restaurantTeamData.staff.length
    ? restaurantTeamData.staff.map((member) => `
      <article class="team-row role-${escapeHtml(member.role)}">
        <div><strong>${escapeHtml(member.email || "Account")}</strong><span>${escapeHtml(STAFF_ROLE_LABELS[member.role] || member.role)}${member.is_current ? " · You" : ""}</span></div>
        <span class="role-badge">${escapeHtml(STAFF_ROLE_LABELS[member.role] || member.role)}</span>
      </article>`).join("")
    : `<div class="empty-state">No team members found.</div>`;

  inviteList.innerHTML = restaurantTeamData.invites.length
    ? restaurantTeamData.invites.map((invite) => `
      <article class="team-row invite-row">
        <div><strong>${escapeHtml(invite.email)}</strong><span>${escapeHtml(STAFF_ROLE_LABELS[invite.role] || invite.role)} · expires ${escapeHtml(new Date(invite.expires_at).toLocaleDateString())}</span></div>
        <div class="team-row-actions">
          <button class="ghost-button" type="button" data-copy-team-invite="${escapeHtml(invite.id)}">Copy link</button>
          <button class="ghost-button" type="button" data-revoke-team-invite="${escapeHtml(invite.id)}">Revoke</button>
        </div>
      </article>`).join("")
    : `<div class="empty-state">No pending invites.</div>`;

  inviteList.querySelectorAll("[data-copy-team-invite]").forEach((button) => {
    button.addEventListener("click", () => {
      const invite = restaurantTeamData.invites.find((entry) => entry.id === button.dataset.copyTeamInvite);
      if (invite?.token) copyText(restaurantInviteLink(invite.token));
    });
  });
  inviteList.querySelectorAll("[data-revoke-team-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await window.TableOrderCloud.revokeRestaurantInvite(button.dataset.revokeTeamInvite);
        await loadRestaurantTeam();
      } catch (error) { setRestaurantTeamError(error.message); }
      finally { button.disabled = false; }
    });
  });
}

async function loadRestaurantTeam() {
  if (!staffUser?.restaurantId || !["owner", "manager"].includes(staffUser.role)) return;
  setRestaurantTeamError("");
  try {
    restaurantTeamData = await window.TableOrderCloud.listRestaurantTeam(staffUser.restaurantId);
    renderRestaurantTeam();
  } catch (error) {
    const missingMigration = /list_restaurant_team|schema cache|could not find/i.test(error.message);
    setRestaurantTeamError(missingMigration ? "Run migration 003_restaurant_staff_invites.sql in Supabase first." : error.message);
  }
}

async function createRestaurantTeamInvite(event) {
  event.preventDefault();
  const button = document.getElementById("createRestaurantInvite");
  button.disabled = true;
  setRestaurantTeamError("");
  try {
    const invite = await window.TableOrderCloud.createRestaurantInvite(
      staffUser.restaurantId,
      document.getElementById("restaurantInviteEmail").value.trim(),
      document.getElementById("restaurantInviteRole").value
    );
    restaurantTeamData.invites = [{ ...invite }, ...restaurantTeamData.invites.filter((entry) => entry.email !== invite.email)];
    renderRestaurantTeam();
    await copyText(restaurantInviteLink(invite.token));
    document.getElementById("restaurantInviteEmail").value = "";
    showOrderToast("Invite link created and copied.", "success");
  } catch (error) { setRestaurantTeamError(error.message); }
  finally { button.disabled = false; }
}

async function loadCloudDataIntoApp(options = {}) {
  const silent = Boolean(options?.silent);
  const button = document.getElementById("loadCloudData");
  if (button) button.disabled = true;
  if (!silent) setDatabaseStatus("checking", "Loading cloud data...", "Local storage remains available as fallback.");

  try {
    const cloud = await window.TableOrderCloud.loadRestaurantData();
    const currentProfile = restaurant();
    state.restaurant = {
      ...currentProfile,
      ...(cloud.restaurant.theme_config || {}),
      slug: cloud.restaurant.slug,
      name: cloud.restaurant.name,
      subtitle: cloud.restaurant.subtitle || currentProfile.subtitle,
      address: cloud.restaurant.address || "",
      phone: cloud.restaurant.phone || "",
      taxId: cloud.restaurant.tax_id || "",
      taxRate: Number(cloud.restaurant.tax_rate) || defaultRestaurant.taxRate,
      timezone: cloud.restaurant.timezone || currentProfile.timezone || "Australia/Sydney",
      isOpen: cloud.restaurant.is_open,
      logoData: cloud.restaurant.logo_url || currentProfile.logoData,
      cloudId: cloud.restaurant.id
    };

    state.tables = cloud.tables.map((table) => ({
      id: table.local_id,
      cloudId: table.id,
      name: table.table_name || table.name,
      number: table.table_number,
      token: table.table_token
    }));
    if (state.tables.length) {
      const requestedToken = lockedTableToken || tableTokenFromUrl();
      const requestedTable = requestedToken
        ? state.tables.find((table) => table.token === requestedToken || table.id === requestedToken)
        : null;
      if (requestedTable) {
        lockedTableToken = requestedToken;
        selectedTableId = requestedTable.id;
        selectedFrontTableId = requestedTable.id;
      }
    }

    state.menuItems = cloud.menuItems.map((item, index) => ({
      id: item.local_id,
      cloudId: item.id,
      category: item.category,
      name: item.name,
      description: item.description || "",
      price: Number(item.price),
      tags: Array.isArray(item.tags) ? item.tags : [],
      photo: `photo-${(index % 4) + 1}`,
      categoryId: item.category_id || null,
      photoData: item.image_url || item.photo_url || "",
      optionTemplate: item.option_template || "none",
      optionConfig: Array.isArray(item.option_config) ? item.option_config : optionConfigForTemplate(item.option_template),
      soldOut: item.is_available === false || item.sold_out
    }));
    state.soldOutIds = cloud.menuItems.filter((item) => item.is_available === false || item.sold_out).map((item) => item.local_id);

    saveState();
    render();
    if (!silent) {
      setDatabaseStatus(
        cloud.menuItems.length ? "connected" : "warning",
        cloud.menuItems.length ? "Cloud data loaded" : "Connected, cloud menu is empty",
        `${cloud.tables.length} tables and ${cloud.menuItems.length} menu items found.`
      );
    }
    return true;
  } catch (error) {
    if (!silent) setDatabaseStatus("error", "Cloud load failed", error.message);
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 900;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = () => resolve(reader.result);
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addMenuItem(event) {
  event.preventDefault();

  const name = document.getElementById("dishName").value.trim();
  const category = document.getElementById("dishCategory").value.trim();
  const price = Number(document.getElementById("dishPrice").value);
  const description = document.getElementById("dishDescription").value.trim();
  const tags = document
    .getElementById("dishTags")
    .value.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const optionTemplate = document.getElementById("dishOptionTemplate").value || "none";
  const photoFile = document.getElementById("dishPhoto").files[0];
  const photoUrl = normalizePhotoUrl(document.getElementById("dishPhotoUrl").value);

  if (!name || !category || Number.isNaN(price) || price < 0) return;

  const photoData = photoUrl || (await readPhotoAsDataUrl(photoFile));
  const newItem = {
    id: `custom_${Date.now()}`,
    category,
    name,
    price,
    tags,
    description: description || "Restaurant menu item.",
    photo: `photo-${(allMenuItems().length % 4) + 1}`,
    photoData,
    optionTemplate,
    optionConfig: optionConfigForTemplate(optionTemplate),
    soldOut: false
  };

  state.menuItems = [newItem, ...allMenuItems()];
  saveState();
  event.target.reset();
  activeCategory = "All";
  render();
  setView("customer");

  if (!window.TableOrderCloud?.createMenuItem || !staffUser || !restaurant().cloudId) {
    showOrderToast(!staffUser ? "Dish saved locally. Staff login is required for cloud sync." : "Dish saved locally.", "success");
    return;
  }

  try {
    const rows = await window.TableOrderCloud.createMenuItem(restaurant().cloudId, newItem, 0);
    const created = rows?.[0];
    if (created) newItem.cloudId = created.id;
    saveState();
    showOrderToast("Dish saved to cloud.", "success");
    await loadCloudDataIntoApp({ silent: true });
  } catch (error) {
    showOrderToast(`Dish cloud save failed: ${error.message}`, "warning");
  }
}

function setPrintContent(html) {
  let page = document.querySelector(".print-page");
  if (!page) {
    page = document.createElement("section");
    page.className = "print-page";
    document.body.appendChild(page);
  }
  page.innerHTML = html;
}

function clearPrintContent() {
  document.querySelectorAll(".print-page").forEach((page) => page.remove());
}

function printPreparedContent() {
  const page = document.querySelector(".print-page");
  if (!page) return;
  page.getBoundingClientRect();
  window.print();
}

function openOptionModal(itemId) {
  const item = itemById(itemId);
  if (!item) return;

  optionItemId = itemId;
  document.getElementById("optionTitle").textContent = item.name;
  document.getElementById("optionBasePrice").textContent = money(item.price);
  document.getElementById("optionGroups").innerHTML = modifierGroupsForItem(item)
    .map(
      (group) => `
        <fieldset class="option-group">
          <legend>${escapeHtml(group.name)}</legend>
          ${group.choices
            .map(
              (choice, index) => `
                <label class="option-choice">
                  <input type="radio" name="option_${escapeHtml(group.id)}" value="${escapeHtml(choice.id)}" ${index === 0 ? "checked" : ""} />
                  <span>${escapeHtml(choice.name)}</span>
                  <strong>${choice.price ? `+${money(choice.price)}` : "Included"}</strong>
                </label>
              `
            )
            .join("")}
        </fieldset>
      `
    )
    .join("");

  document.getElementById("optionModal").classList.remove("hidden");
  document.querySelectorAll("#optionGroups input").forEach((input) => input.addEventListener("change", renderOptionTotal));
  renderOptionTotal();
}

function closeOptionModal() {
  optionItemId = "";
  document.getElementById("optionModal").classList.add("hidden");
}

function selectedOptionsForModal() {
  const item = itemById(optionItemId);
  if (!item) return [];

  return modifierGroupsForItem(item)
    .map((group) => {
      const checked = [...document.querySelectorAll("#optionGroups input")].find((input) => input.name === `option_${group.id}` && input.checked);
      const choice = group.choices.find((entry) => entry.id === checked?.value) || group.choices[0];
      return {
        groupId: group.id,
        groupName: group.name,
        choiceId: choice.id,
        choiceName: choice.name,
        price: choice.price || 0
      };
    })
    .filter(Boolean);
}

function renderOptionTotal() {
  const item = itemById(optionItemId);
  if (!item) return;
  document.getElementById("optionTotal").textContent = money(item.price + optionExtraTotal(selectedOptionsForModal()));
}

function confirmOptionSelection() {
  if (!optionItemId) return;
  addToCart(optionItemId, selectedOptionsForModal());
  closeOptionModal();
}

function loadSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function renderSoundToggle() {
  const button = document.getElementById("soundToggle");
  if (!button) return;
  button.textContent = soundEnabled ? "Sound On" : "Sound Off";
  button.setAttribute("aria-pressed", String(soundEnabled));
  button.title = soundEnabled ? "Kitchen order sound is on" : "Kitchen order sound is off";
  button.classList.toggle("active", soundEnabled);
}

function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
  } catch {
    // The current session still works when storage is unavailable.
  }
  renderSoundToggle();
}

function getKitchenAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio is not supported by this browser.");
  if (!kitchenAudioContext || kitchenAudioContext.state === "closed") {
    kitchenAudioContext = new AudioContextClass();
  }
  return kitchenAudioContext;
}

async function playKitchenChime() {
  const audioContext = getKitchenAudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();

  const start = audioContext.currentTime;
  [880, 1174].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const toneStart = start + index * 0.18;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.08, toneStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.16);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + 0.17);
  });
}

const ONBOARDING_SAMPLE_MENU = [
  { category: "Starters", name: "Crispy vegetable dumplings", description: "Five pieces with house dipping sauce.", price: 9.5 },
  { category: "Mains", name: "Grilled chicken rice bowl", description: "Chicken, greens, rice and sesame dressing.", price: 18 },
  { category: "Mains", name: "Market vegetable noodles", description: "Wok-tossed vegetables and noodles.", price: 16.5 },
  { category: "Drinks", name: "Sparkling water", description: "Chilled 330ml bottle.", price: 4 },
  { category: "Dessert", name: "Vanilla mochi", description: "Two pieces.", price: 7 }
];

let ownerAuthMode = "login";
let onboardingStep = 1;
let onboardingRestaurant = null;
let onboardingMenuItems = [];
let platformUser = null;
let platformRestaurants = [];
let inviteAuthMode = "signup";
let restaurantTeamData = { staff: [], invites: [] };

function setGatewayVisible(visible) {
  document.getElementById("accountGateway")?.classList.toggle("hidden", !visible);
  document.body.classList.toggle("account-flow-active", Boolean(visible));
}

function setOwnerAuthMode() {
  ownerAuthMode = "login";
  document.getElementById("ownerAuthTitle").textContent = "Sign in to Aveniq";
  document.getElementById("ownerAuthSubmit").textContent = "Log in";
  document.getElementById("ownerPassword").autocomplete = "current-password";
  setOwnerFlowError("");
}

function setOwnerFlowError(message = "", target = "ownerAuthError") {
  const node = document.getElementById(target);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function renderMobileCustomerControls(entries = cartEntries()) {
  const dock = document.getElementById("mobileCartDock");
  const nav = document.getElementById("mobileBottomNav");
  if (!dock || !nav) return;
  const isCustomer = !staffUser && activeView === "customer";
  const quantity = entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  dock.classList.toggle("hidden", !isCustomer || !quantity);
  nav.classList.toggle("hidden", !isCustomer);
  document.getElementById("mobileCartCount").textContent = String(quantity);
  document.getElementById("mobileCartTotal").textContent = money(cartTotal());
}


function showOwnerAuth() {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.remove("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  setOwnerAuthMode();
}

function showOnboarding(step = 1) {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.remove("hidden");
  setOnboardingStep(step);
}

function setInviteAuthError(message = "", success = false) {
  const node = document.getElementById("inviteAuthError");
  node.textContent = message;
  node.classList.toggle("hidden", !message);
  node.classList.toggle("success-message", Boolean(message && success));
}

function showInviteAuth(message = "") {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.remove("hidden");
  setInviteAuthError(message);
}

function updateInviteAuthMode(mode) {
  inviteAuthMode = mode === "login" ? "login" : "signup";
  const login = inviteAuthMode === "login";
  document.getElementById("inviteAuthTitle").textContent = login ? "Sign in and join the team" : "Join your restaurant team";
  document.getElementById("inviteAuthDescription").textContent = login
    ? "Use the account matching the email address on this invitation."
    : "Create an account using the email address that received this invitation.";
  document.getElementById("inviteAuthSubmit").textContent = login ? "Sign in and accept invite" : "Create account and join";
  document.getElementById("toggleInviteAuthMode").textContent = login ? "Create a new account" : "I already have an account";
  document.getElementById("invitePassword").autocomplete = login ? "current-password" : "new-password";
  setInviteAuthError("");
}

async function acceptCurrentRestaurantInvite() {
  const token = window.TableOrderCloud.routeContext().inviteToken;
  if (!token) throw new Error("This invitation link is incomplete.");
  const accepted = await window.TableOrderCloud.acceptRestaurantInvite(token);
  window.location.href = `/dashboard/${encodeURIComponent(accepted.restaurant_slug)}/dashboard`;
}

async function handleInviteAuth(event) {
  event.preventDefault();
  const button = document.getElementById("inviteAuthSubmit");
  const email = document.getElementById("inviteEmail").value.trim();
  const password = document.getElementById("invitePassword").value;
  button.disabled = true;
  setInviteAuthError("");
  try {
    if (inviteAuthMode === "login") {
      await window.TableOrderCloud.signInWithPassword(email, password);
      await acceptCurrentRestaurantInvite();
      return;
    }
    const result = await window.TableOrderCloud.signUp(email, password);
    if (!result?.access_token) {
      setInviteAuthError("Check your email to confirm the account, then open this invitation link again.", true);
      return;
    }
    await acceptCurrentRestaurantInvite();
  } catch (error) {
    setInviteAuthError(/invalid login credentials/i.test(error.message) ? "Email or password is incorrect." : error.message);
  } finally {
    button.disabled = false;
  }
}

function setOnboardingStep(step) {
  onboardingStep = Math.max(1, Math.min(5, Number(step) || 1));
  document.querySelectorAll("[data-onboarding-step]").forEach((panel) => panel.classList.toggle("hidden", Number(panel.dataset.onboardingStep) !== onboardingStep));
  document.getElementById("onboardingStepLabel").textContent = `Step ${onboardingStep} of 5`;
  document.getElementById("onboardingProgressBar").style.width = `${onboardingStep * 20}%`;
  setOwnerFlowError("", "onboardingError");
  if (onboardingStep === 4) renderOnboardingQrCodes();
  if (onboardingStep === 5) configureOnboardingSuccessLinks();
}

async function handleOwnerAuth(event) {
  event.preventDefault();
  const button = document.getElementById("ownerAuthSubmit");
  const email = document.getElementById("ownerEmail").value.trim();
  const password = document.getElementById("ownerPassword").value;
  button.disabled = true;
  setOwnerFlowError("");
  try {
    await window.TableOrderCloud.signInWithPassword(email, password);
    await continueOwnerSession();
  } catch (error) {
    setOwnerFlowError(/invalid login credentials/i.test(error.message) ? "Email or password is incorrect." : error.message);
  } finally { button.disabled = false; }
}

async function continueOwnerSession() {
  try {
    const route = window.TableOrderCloud?.routeContext?.() || APP_ROUTE;
    const restaurantArea = ["dashboard", "kitchen", "frontdesk", "reports", "setup"].includes(route.area);

    if (restaurantArea && route.restaurantSlug) {
      const profile = await window.TableOrderCloud.getStaffProfile();
      staffUser = profile;
      onboardingRestaurant = { id: profile.restaurantId, slug: profile.restaurantSlug, name: profile.restaurantName };
      setGatewayVisible(false);
      await loadCloudDataIntoApp({ silent: true });
      renderStaffSession();
      startCloudOrderSync();
      setView(route.area === "dashboard" ? "setup" : route.area, { updateUrl: false });
      return;
    }

    const master = await window.TableOrderCloud.getPlatformProfile();
    if (master) {
      await showPlatformConsole(master);
      return;
    }
    const profile = await window.TableOrderCloud.getStaffProfile();
    staffUser = profile;
    onboardingRestaurant = { id: profile.restaurantId, slug: profile.restaurantSlug, name: profile.restaurantName };
    if (profile.restaurantStatus === "onboarding") {
      await loadCloudDataIntoApp({ silent: true });
      onboardingMenuItems = allMenuItems().filter((item) => item.cloudId);
      const nextStep = !allTables().some((table) => table.cloudId) ? 2 : onboardingMenuItems.length ? 4 : 3;
      showOnboarding(nextStep);
      window.history.replaceState({}, "", `/onboarding?restaurant=${encodeURIComponent(profile.restaurantSlug)}`);
      return;
    }
    const dashboardUrl = `/dashboard/${encodeURIComponent(profile.restaurantSlug)}/dashboard`;
    if (window.location.pathname !== dashboardUrl) window.location.href = dashboardUrl;
  } catch (error) {
    if (error.code === "ONBOARDING_REQUIRED" || error.message === "ONBOARDING_REQUIRED") {
      showOwnerAuth();
      setOwnerFlowError("This account has not been assigned platform or restaurant access.");
      return;
    }
    throw error;
  }
}

function setPlatformError(message = "") {
  const node = document.getElementById("platformError");
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function renderPlatformRestaurants() {
  const list = document.getElementById("platformRestaurantList");
  if (!platformRestaurants.length) {
    list.innerHTML = `<div class="empty-state">No restaurants yet. Create your first one.</div>`;
    return;
  }
  list.innerHTML = platformRestaurants.map((entry) => `
    <article class="platform-restaurant-card">
      <div>
        <span class="status-pill ${entry.status === "active" ? "ready" : ""}">${escapeHtml(entry.status || "active")}</span>
        <h3>${escapeHtml(entry.name)}</h3>
        <p class="muted">/${escapeHtml(entry.slug)}${entry.restaurant_type ? ` · ${escapeHtml(entry.restaurant_type)}` : ""}</p>
        <p class="platform-address">${escapeHtml(entry.address || "No address added")}</p>
      </div>
      <div class="platform-card-actions">
        <a class="ghost-button" href="/order/${encodeURIComponent(entry.slug)}/table-1" target="_blank" rel="noopener">Customer page</a>
        <a class="submit-button" href="/dashboard/${encodeURIComponent(entry.slug)}/dashboard" target="_blank" rel="noopener">Open dashboard</a>
      </div>
    </article>
  `).join("");
}

async function loadPlatformRestaurants() {
  const list = document.getElementById("platformRestaurantList");
  list.innerHTML = `<div class="empty-state">Loading restaurants…</div>`;
  try {
    platformRestaurants = await window.TableOrderCloud.loadPlatformRestaurants();
    renderPlatformRestaurants();
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function showPlatformConsole(master) {
  platformUser = master;
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.remove("hidden");
  document.getElementById("platformUserEmail").textContent = master.email;
  window.history.replaceState({}, "", "/platform");
  await loadPlatformRestaurants();
}

async function createPlatformRestaurant(event) {
  event.preventDefault();
  const submit = document.getElementById("platformCreateSubmit");
  submit.disabled = true;
  submit.textContent = "Creating…";
  setPlatformError("");
  try {
    const created = await window.TableOrderCloud.platformCreateRestaurant({
      name: document.getElementById("platformRestaurantName").value.trim(),
      restaurantType: document.getElementById("platformRestaurantType").value,
      phone: document.getElementById("platformRestaurantPhone").value.trim(),
      address: document.getElementById("platformRestaurantAddress").value.trim(),
      tableCount: Number(document.getElementById("platformRestaurantTables").value)
    });
    event.target.reset();
    document.getElementById("platformRestaurantTables").value = "10";
    await loadPlatformRestaurants();
    showOrderToast(`${created.name} created with ${created.table_count} tables.`, "success");
  } catch (error) {
    setPlatformError(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Create restaurant";
  }
}

async function handlePlatformLogout() {
  await window.TableOrderCloud.signOut().catch(() => {});
  platformUser = null;
  platformRestaurants = [];
  window.history.replaceState({}, "", "/");
  showOwnerAuth();
}

async function createOnboardingRestaurant(event) {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  setOwnerFlowError("", "onboardingError");
  try {
    onboardingRestaurant = await window.TableOrderCloud.createRestaurant({
      name: document.getElementById("onboardingRestaurantName").value.trim(),
      restaurantType: document.getElementById("onboardingRestaurantType").value,
      phone: document.getElementById("onboardingPhone").value.trim(),
      address: document.getElementById("onboardingAddress").value.trim(),
      logoUrl: document.getElementById("onboardingLogoUrl").value.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney"
    });
    state.restaurant = { ...defaultRestaurant, ...state.restaurant, cloudId: onboardingRestaurant.id, slug: onboardingRestaurant.slug, name: onboardingRestaurant.name };
    saveState();
    window.history.replaceState({}, "", `/onboarding?restaurant=${encodeURIComponent(onboardingRestaurant.slug)}`);
    setOnboardingStep(2);
  } catch (error) { setOwnerFlowError(error.message, "onboardingError"); }
  finally { if (submit) submit.disabled = false; }
}

async function createOnboardingTables(event) {
  event.preventDefault();
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    await window.TableOrderCloud.createTables(onboardingRestaurant.id, Number(document.getElementById("onboardingTableCount").value));
    await loadCloudDataIntoApp({ silent: true });
    setOnboardingStep(3);
  } catch (error) { setOwnerFlowError(error.message, "onboardingError"); }
  finally { if (submit) submit.disabled = false; }
}

function renderOnboardingMenuList() {
  const list = document.getElementById("onboardingMenuList");
  list.innerHTML = onboardingMenuItems.length
    ? onboardingMenuItems.map((item) => `<div class="onboarding-menu-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></span><strong>${money(item.price)}</strong></div>`).join("")
    : `<div class="empty-state">No menu items yet.</div>`;
  document.getElementById("continueFromMenu").disabled = onboardingMenuItems.length < 1;
}

async function addOnboardingMenuItem(event) {
  event.preventDefault();
  const item = {
    id: `item-${Date.now()}`,
    category: document.getElementById("onboardingCategory").value.trim(),
    name: document.getElementById("onboardingItemName").value.trim(),
    description: document.getElementById("onboardingItemDescription").value.trim(),
    price: Number(document.getElementById("onboardingItemPrice").value), tags: [], optionTemplate: "none"
  };
  try {
    const rows = await window.TableOrderCloud.createMenuItem(onboardingRestaurant.id, item, onboardingMenuItems.length + 1);
    onboardingMenuItems.push({ ...item, cloudId: rows?.[0]?.id });
    event.target.reset();
    renderOnboardingMenuList();
  } catch (error) { setOwnerFlowError(error.message, "onboardingError"); }
}

async function importOnboardingSampleMenu() {
  const button = document.getElementById("importSampleMenu");
  button.disabled = true;
  button.textContent = "Importing…";
  try {
    const items = ONBOARDING_SAMPLE_MENU.map((item, index) => ({ ...item, id: `sample-${index + 1}`, tags: [], optionTemplate: "none" }));
    await window.TableOrderCloud.importSampleMenu(onboardingRestaurant.id, items);
    onboardingMenuItems = items;
    await loadCloudDataIntoApp({ silent: true });
    onboardingMenuItems = allMenuItems().filter((item) => item.cloudId);
    renderOnboardingMenuList();
  } catch (error) { setOwnerFlowError(error.message, "onboardingError"); }
  finally { button.disabled = false; button.textContent = "Import sample menu"; }
}

function renderOnboardingQrCodes() {
  const grid = document.getElementById("onboardingQrGrid");
  grid.innerHTML = allTables().map((table) => `<article class="onboarding-qr-card"><canvas width="180" height="180" data-onboarding-qr="${escapeHtml(table.id)}"></canvas><strong>${escapeHtml(table.name)}</strong><span>Scan to order</span></article>`).join("");
  grid.querySelectorAll("[data-onboarding-qr]").forEach((canvas) => {
    const table = allTables().find((entry) => entry.id === canvas.dataset.onboardingQr);
    if (table) drawQrCanvas(canvas, tableOrderingLink(table));
  });
}

async function finishOnboarding() {
  const button = document.getElementById("finishOnboarding");
  button.disabled = true;
  try {
    await window.TableOrderCloud.completeOnboarding(onboardingRestaurant.id);
    setOnboardingStep(5);
  } catch (error) { setOwnerFlowError(error.message, "onboardingError"); button.disabled = false; }
}

function configureOnboardingSuccessLinks() {
  const slug = onboardingRestaurant?.slug || restaurant().slug;
  const firstTable = allTables()[0];
  document.getElementById("openCustomerOrdering").href = `/order/${encodeURIComponent(slug)}/${encodeURIComponent(firstTable?.id || "table-1")}`;
  document.getElementById("openKitchenScreen").href = `/dashboard/${encodeURIComponent(slug)}/kitchen`;
  document.getElementById("openRestaurantDashboard").href = `/dashboard/${encodeURIComponent(slug)}/dashboard`;
}

async function initializeAccountFlow() {
  const route = window.TableOrderCloud?.routeContext?.() || APP_ROUTE;
  if (["order", "restaurant"].includes(route.area)) return;
  window.TableOrderCloud.consumeAuthRedirect?.();
  if (route.area === "join") {
    const inviteSession = await window.TableOrderCloud.getSession();
    if (inviteSession) {
      try {
        await acceptCurrentRestaurantInvite();
        return;
      } catch (error) {
        await window.TableOrderCloud.signOut().catch(() => {});
        showInviteAuth(error.message);
        updateInviteAuthMode("login");
        return;
      }
    }
    showInviteAuth();
    updateInviteAuthMode("signup");
    return;
  }
  const session = await window.TableOrderCloud.getSession();
  if (!session) {
    showOwnerAuth();
    return;
  }
  await continueOwnerSession().catch((error) => {
    showOwnerAuth();
    setOwnerFlowError(error.message);
  });
}

function bindGlobalActions() {
  document.getElementById("ownerAuthForm").addEventListener("submit", handleOwnerAuth);
  document.getElementById("inviteAuthForm").addEventListener("submit", handleInviteAuth);
  document.getElementById("toggleInviteAuthMode").addEventListener("click", () => updateInviteAuthMode(inviteAuthMode === "signup" ? "login" : "signup"));
  document.getElementById("platformRestaurantForm").addEventListener("submit", createPlatformRestaurant);
  document.getElementById("refreshPlatformRestaurants").addEventListener("click", loadPlatformRestaurants);
  document.getElementById("platformLogout").addEventListener("click", handlePlatformLogout);
  document.getElementById("onboardingRestaurantForm").addEventListener("submit", createOnboardingRestaurant);
  document.getElementById("onboardingTablesForm").addEventListener("submit", createOnboardingTables);
  document.getElementById("onboardingMenuForm").addEventListener("submit", addOnboardingMenuItem);
  document.getElementById("importSampleMenu").addEventListener("click", importOnboardingSampleMenu);
  document.getElementById("continueFromMenu").addEventListener("click", () => setOnboardingStep(4));
  document.getElementById("onboardingDownloadAllQr").addEventListener("click", downloadAllQrCodes);
  document.getElementById("onboardingPrintQr").addEventListener("click", printQrSheet);
  document.getElementById("finishOnboarding").addEventListener("click", finishOnboarding);
  document.getElementById("staffLoginButton").addEventListener("click", () => openStaffLogin());
  document.getElementById("staffLogoutButton").addEventListener("click", handleStaffLogout);
  document.getElementById("staffLoginForm").addEventListener("submit", handleStaffLogin);
  document.getElementById("cancelStaffLogin").addEventListener("click", closeStaffLogin);
  document.getElementById("staffAuthModal").addEventListener("click", (event) => {
    if (event.target.id === "staffAuthModal") closeStaffLogin();
  });
  document.getElementById("clearCart").addEventListener("click", () => {
    state.cart = [];
    lastConfirmedOrderId = "";
    saveState();
    renderCart();
  });

  document.getElementById("submitOrder").addEventListener("click", submitOrder);
  document.getElementById("printKitchen").addEventListener("click", printKitchen);
  document.getElementById("mobileCartDock").addEventListener("click", () => {
    document.querySelector(".order-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("mobileBottomNav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-nav]");
    if (!button) return;
    const action = button.dataset.mobileNav;
    if (action === "home") window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "menu") document.getElementById("categoryRow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (action === "orders") scrollToCustomerOrderStatus();
    if (action === "account") openStaffLogin();
  });
  document.getElementById("clearLocalOrders").addEventListener("click", () => {
    clearKitchenNewOrderAlert();
    showOrderToast("Local display cleared. Orders were not deleted.");
  });
  document.getElementById("printReport").addEventListener("click", printDailyReport);
  document.getElementById("exportReportCsv").addEventListener("click", exportCurrentReportCsv);
  document.getElementById("reportRangePresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-range]");
    if (!button) return;
    reportRangePreset = button.dataset.reportRange;
    if (reportRangePreset !== "custom") {
      reportRange = rangeForReportPreset(reportRangePreset);
      reportData = {};
      loadReports();
    } else {
      reportRange ||= rangeForReportPreset("today");
      renderReports();
      document.getElementById("reportFrom").focus();
    }
  });
  document.getElementById("reportCustomRange").addEventListener("submit", (event) => {
    event.preventDefault();
    const from = document.getElementById("reportFrom").value;
    const to = document.getElementById("reportTo").value;
    const days = from && to ? Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) : -1;
    if (!from || !to || days < 0 || days > 365) {
      reportError = "Choose a valid range of up to 366 days.";
      renderReports();
      return;
    }
    reportRange = { from, to };
    reportData = {};
    loadReports();
  });
  document.getElementById("reportTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-tab]");
    if (!button || button.dataset.reportTab === activeReportTab) return;
    activeReportTab = button.dataset.reportTab;
    reportError = "";
    renderReports();
    if (!reportData[activeReportTab]) loadReports();
  });
  document.getElementById("printBillTop").addEventListener("click", () => {
    setView("frontdesk");
    printInvoice(selectedFrontTableId);
  });
  document.getElementById("downloadQr").addEventListener("click", printQrSheet);
  document.getElementById("downloadAllQr").addEventListener("click", downloadAllQrCodes);
  document.getElementById("resetDemo").addEventListener("click", () => {
    state = {
      selectedTableId: "t6",
      cart: [],
      orders: [],
      soldOutIds: [],
      menuItems: defaultMenuItems,
      menuVersion: MENU_VERSION,
      restaurant: defaultRestaurant,
      tables: defaultTables
    };
    selectedTableId = "t6";
    selectedFrontTableId = "t6";
    saveState();
    render();
  });
  document.getElementById("soundToggle").addEventListener("click", async () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      showOrderToast("Kitchen order sound is off.");
      return;
    }

    try {
      setSoundEnabled(true);
      await playKitchenChime();
      showOrderToast("Kitchen order sound is on. Test chime played.");
    } catch (error) {
      setSoundEnabled(false);
      showOrderToast(`Sound could not start: ${error.message}`, "warning");
    }
  });
  document.getElementById("menuForm").addEventListener("submit", addMenuItem);
  document.getElementById("clearMenuForm").addEventListener("click", () => document.getElementById("menuForm").reset());
  document.getElementById("profileForm").addEventListener("submit", saveRestaurantProfile);
  document.getElementById("themeForm").addEventListener("submit", saveThemeSettings);
  document.getElementById("applyPresetColor").addEventListener("click", applyPresetColor);
  document.getElementById("themePreset").addEventListener("change", () => {
    const preset = themePresets[document.getElementById("themePreset").value] || themePresets.classic;
    document.getElementById("primaryColor").value = preset.accent;
  });
  document.getElementById("tableForm").addEventListener("submit", addTable);
  document.getElementById("csvFile").addEventListener("change", handleCsvFile);
  document.getElementById("previewCsv").addEventListener("click", previewCsvImport);
  document.getElementById("importCsv").addEventListener("click", importCsvPreview);
  document.getElementById("clearCsv").addEventListener("click", clearCsvImport);
  document.getElementById("downloadSampleCsv").addEventListener("click", downloadSampleCsv);
  document.getElementById("checkDatabase").addEventListener("click", checkDatabaseConnection);
  document.getElementById("restaurantInviteForm").addEventListener("submit", createRestaurantTeamInvite);
  document.getElementById("refreshRestaurantTeam").addEventListener("click", loadRestaurantTeam);
  document.getElementById("importDashboardSampleMenu").addEventListener("click", importDashboardSampleMenu);
  document.getElementById("uploadCloudMenu").addEventListener("click", uploadCurrentMenuToCloud);
  document.getElementById("loadCloudData").addEventListener("click", loadCloudDataIntoApp);
  document.getElementById("confirmOptions").addEventListener("click", confirmOptionSelection);
  document.getElementById("cancelOptions").addEventListener("click", closeOptionModal);
  document.getElementById("optionModal").addEventListener("click", (event) => {
    if (event.target.id === "optionModal") closeOptionModal();
  });
  document.getElementById("clearLogo").addEventListener("click", async () => {
    state.restaurant = { ...restaurant(), logoData: "", logoWatermarkData: "" };
    document.getElementById("restaurantLogo").value = "";
    saveState();
    render();
    await saveProfileToCloud(restaurant(), "Logo removed from cloud.");
  });
}

function render() {
  applyTheme();
  renderStaffSession();
  renderTablePicker();
  renderCategories();
  renderMenu();
  renderAlsoOrdered();
  renderCart();
  renderCustomerOrderStatus();
  renderKitchen();
  renderFrontDesk();
  renderReports();
  renderSetup();
}

renderTabs();
bindGlobalActions();
render();
checkDatabaseConnection();
loadCloudDataIntoApp({ silent: true });
initializeStaffAuth();
initializeAccountFlow();
startCustomerOrderStatusSync();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && staffUser) syncCloudOrders({ notify: false });
  if (!document.hidden && !staffUser) syncCustomerOrderStatuses();
});
