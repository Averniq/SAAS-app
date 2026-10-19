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

const SAKE_STREET_LOGOS = {
  header: "/assets/brand/sake-street-logo-round.webp",
  mark: "/assets/brand/sake-street-logo-mark.webp",
  watermark: "/assets/brand/sake-street-logo-full.webp"
};
const DEFAULT_LOGO_DATA = "/assets/brand/aveniq-leaf-logo-reverse.png";
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
let activeMobileCustomerNav = "menu";
let customerCartPanelVisible = false;
let mobileCartBumpRequested = false;
let mobileCartBumpTimer = null;
let staffPresenceTimer = null;
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
let frontdeskMode = "summary";
let frontdeskSplitMode = "equal";
let frontdeskPeople = 2;
let frontdeskItemBills = [];
let itemSplitConfirmed = false;
let frontdeskBusy = false;
let selectedInvoiceOrderId = "";
let paymentModalState = null;
let paymentModalReturnFocus = null;
let reviewOrderReturnFocus = null;
let reviewOrderError = "";
let reviewOrderConfirmPending = false;
let orderSubmissionInProgress = false;
let attendanceTimer = null;
let attendanceReport = { open: false, loading: false, data: null, settings: null, from: "", to: "", staffUserId: "", location: "", shiftStatus: "all" };

const CUSTOMER_ORDER_STEPS = [
  { status: "New", label: "Received" },
  { status: "Preparing", label: "Preparing" },
  { status: "Ready", label: "Ready" },
  { status: "Served", label: "Served" }
];

const STAFF_VIEW_ROLES = {
  kitchen: ["owner", "manager", "staff", "kitchen"],
  frontdesk: ["owner", "manager", "staff", "cashier", "waitstaff"],
  reports: ["owner", "manager"],
  attendance: ["owner", "manager", "staff", "kitchen", "cashier", "attendance"],
  setup: ["owner", "manager"]
};

function staffDefaultDestination(role) {
  if (["owner", "manager"].includes(role)) return "dashboard";
  if (role === "kitchen") return "kitchen";
  if (role === "cashier") return "frontdesk";
  if (role === "waitstaff") return "frontdesk";
  if (role === "attendance") return "attendance";
  return "frontdesk";
}

function staffRequestedDestination(profile) {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  let requested = "";
  try {
    const path = new URL(next, window.location.origin);
    if (path.origin !== window.location.origin) return staffDefaultDestination(profile.role);
    const parts = path.pathname.split("/").filter(Boolean);
    if (parts[0] === "dashboard" && parts.length === 3 && parts[1] === profile.restaurantSlug) requested = parts[2];
    else if (parts.length === 1) requested = parts[0];
  } catch {}
  const view = requested === "admin" || requested === "dashboard" ? "setup" : requested;
  return view && staffCanAccess(view) ? view : staffDefaultDestination(profile.role);
}

function staffLoginUrl(restaurantSlug = "", next = "") {
  const params = new URLSearchParams();
  if (restaurantSlug) params.set("restaurant", restaurantSlug);
  if (next) params.set("next", next);
  const query = params.toString();
  return `/staff${query ? `?${query}` : ""}`;
}

const STAFF_ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager",
  staff: "All-round Staff",
  kitchen: "Kitchen",
  cashier: "Cashier",
  waitstaff: "Waitstaff",
  attendance: "Attendance only"
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
    tables: defaultTables,
    payments: [],
    splitBills: [],
    attendance: { shifts: [], audit: [] }
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

function sakeStreetMenuPhotoUrl(name) {
  const key = String(name || "")
    .toLowerCase()
    .replace(/\(?\d+p\)?/g, "")
    .replace(/sushi\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const file = {
    "miso soup": "Miso soup.webp", kimchi: "Kimchi.webp", "kimchi chicken": "Kimchi chicken.webp", "seaweed salad": "Seaweed salad.webp",
    "tofu & avocado salad": "Tofu & avocado salad.webp", "salmon salad": "Salmon salad.webp",
    "kingfish carpaccio": "Kingfish carpaccio.webp", "salmon carpaccio": "Salmon carpaccio.webp",
    "scallop carpaccio": "Scallop carpaccio.webp", "tuna tataki": "Tuna tataki.webp",
    "agedashi tofu": "Agedashi tofu (8p).webp", "karaage chicken": "Karaage chicken.webp",
    "katsu chicken": "Katsu chicken.webp", "spicy soft shell crab": "Spicy soft shell crab.webp",
    "pork gyoza": "Pork gyoza (6p).webp", "popcorn prawn": "Popcorn prawn (5p).webp",
    "miso eggplant": "Miso eggplant.webp", "salmon rice bowl": "Salmon rice bowl.webp",
    "dynamite scallops": "Dynamite scallops (5p).webp", "tempura white fish": "Tempura White fish (6p).webp",
    "tempura veggies": "Tempura Veggies - 5 types.webp", "seared salmon belly": "Seared salmon belly (6p).webp",
    "seared king fish": "Seared King fish (6p).webp", "kingfish sashimi": "Kingfish sashimi (7p).webp",
    "salmon ocean": "Salmon ocean (7p).webp", "tuna & salmon sashimi": "Tuna & salmon sashimi (7p).webp",
    "mixed sashimi": "Mixed sashimi (16p).webp", "salmon diamond": "Salmon Diamond.webp", "salmon nigiri": "Salmon nigiri (4p).webp",
    "kingfish nigiri": "Kingfish nigiri (4p).webp", "tuna nigiri": "Tuna nigiri (4p).webp",
    "aburi salmon nigiri": "Aburi salmon nigiri (4p).webp", "aburi king fish": "Aburi King fish (4p).webp",
    "aburi scallop nigiri": "Aburi scallop nigiri (4p).webp", "nigiri platter assorted": "Nigiri platter assorted (8p).webp",
    "assorted sashimi & nigiri combo": "Nigiri & Sashimi combo (10p).webp", "cucumber maki": "Cucumber Maki.webp",
    "avocado maki": "Avocado Maki.webp", "teriyaki chicken maki": "Teriyaki Chicken Maki.webp",
    "salmon maki": "Salmon Maki.webp", "cooked tuna maki": "Cooked tuna Maki.webp",
    "fresh tuna maki": "Fresh tuna Maki.webp", "egg (tamago) maki": "Egg (Tamago) Maki.webp",
    "vegetarian roll": "Vegetarian Salad roll.webp", "cooked tuna roll": "Cooked tuna roll.webp",
    "chicken schnitzel roll": "Chicken schnitzel roll.webp", "teriyaki chicken roll": "Teriyaki chicken roll.webp",
    "fresh salmon deluxe roll": "Fresh salmon deluxe.webp", "seared salmon roll": "Seared salmon roll.webp",
    "fried prawn roll": "Fried prawn roll.webp", "spicy soft shell crab roll": "Spicy soft shell crab roll.webp",
    "fresh tuna roll": "Fresh tuna roll.webp", "spicy fresh tuna deluxe roll": "Spicy fresh tuna deluxe.webp",
    "california roll": "California roll.webp", "vegetable ramen": "Vegetable ramen.webp",
    "karaage chicken ramen": "Karaage chicken ramen.webp", "pork-belly ramen": "Pork-belly ramen.webp",
    "seafood ramen": "Seafood ramen.webp", "stir fried vegetables": "Stir fried vegetables.webp",
    "teriyaki chicken": "Teriyaki chicken with salad.webp", "teriyaki tasmanian salmon": "Teriyaki Tasmanian salmon with salad.webp",
    "teriyaki king fish": "Teriyaki King fish with salad.webp", "aburi pork belly": "Aburi Pork Belly (4p).webp",
    "pork bun": "Pork bun.webp"
  }[key];
  return file ? `/assets/sake-street/menu/${encodeURIComponent(file)}` : "";
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
  const watermark = isSakeStreetBrand(profile)
    ? SAKE_STREET_LOGOS.watermark
    : (profile.logoWatermarkData || profile.logoData);
  root.style.setProperty("--logo-watermark", watermark ? `url("${watermark}")` : "none");

  document.body.dataset.themePreset = profile.themePreset || "classic";
  document.body.dataset.menuLayout = profile.menuLayout || "grid";
  document.body.classList.toggle("hide-menu-photos", !profile.showPhotos);
}

function taxRateBasisPoints() {
  // Tax rates are represented as basis points (10.00% = 1000) before any
  // calculation, so checkout rounding never depends on binary float values.
  return Math.max(0, Math.round((Number(restaurant().taxRate) || 0) * 100));
}

const sharedClock = { pin: "", token: "", staff: null, status: "entry", lockUntil: 0, timer: null, returnFocus: null };
const externalStaffClock = { token: APP_ROUTE.publicClockToken || "", pin: "", actionToken: "", staff: null, status: "loading", timer: null };
function sharedDeviceId() { let id = localStorage.getItem("aveniq-attendance-device-id"); if (!id) { id = crypto.randomUUID?.() || `device-${Date.now()}`; localStorage.setItem("aveniq-attendance-device-id", id); } return id; }
function sharedDeviceLabel() { return localStorage.getItem("aveniq-attendance-device-name") || "Front Counter · This device"; }
function openSharedClock() { sharedClock.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; sharedClock.pin = ""; sharedClock.token = ""; sharedClock.staff = null; sharedClock.status = "entry"; document.getElementById("sharedClockModal").classList.remove("hidden"); renderSharedClock(); window.setTimeout(() => document.getElementById("closeSharedClock")?.focus(), 0); }
function closeSharedClock() { document.getElementById("sharedClockModal").classList.add("hidden"); clearTimeout(sharedClock.timer); sharedClock.returnFocus?.focus(); sharedClock.returnFocus = null; }
function clockKey(value) { if (sharedClock.status !== "entry") return; if (value === "clear") sharedClock.pin = ""; else if (value === "back") sharedClock.pin = sharedClock.pin.slice(0, -1); else if (/^\d$/.test(value) && sharedClock.pin.length < 4) sharedClock.pin += value; renderSharedClock(); if (sharedClock.pin.length === 4) identifySharedPin(); }
async function identifySharedPin() {
  const pin = sharedClock.pin; sharedClock.status = "loading"; renderSharedClock();
  try { const data = await window.TableOrderCloud.identifyAttendancePin(staffUser.restaurantId, pin, sharedDeviceId()); if (!data?.action_token) { sharedClock.pin = ""; sharedClock.status = "error"; } else { sharedClock.token = data.action_token; sharedClock.staff = data; sharedClock.status = data.status.toLowerCase(); } }
  catch { sharedClock.pin = ""; sharedClock.status = "error"; }
  renderSharedClock();
}
function sharedClockReturn() { sharedClock.status = "entry"; sharedClock.pin = ""; sharedClock.token = ""; sharedClock.staff = null; renderSharedClock(); }
async function sharedClockAction(action) {
  if (!sharedClock.token) return; sharedClock.status = "loading"; renderSharedClock();
  try { const data = await window.TableOrderCloud.sharedAttendanceAction(sharedClock.token, action); sharedClock.status = "success"; sharedClock.successText = data.message || action.replace("_", " "); sharedClock.successDetail = data.worked_minutes === undefined ? "" : `Total worked: ${attendanceDuration(data.worked_minutes)}`; renderSharedClock(); renderAttendance(); sharedClock.timer = setTimeout(sharedClockReturn, 2000); }
  catch (error) { sharedClock.status = "error"; sharedClock.errorText = error.message.includes("OPEN_BREAK") ? "You are currently on break. End your break before clocking out." : "Unable to connect. Please try again."; renderSharedClock(); }
}
function renderSharedClock() {
  const root = document.getElementById("sharedClockContent"); if (!root) return;
  const person = escapeHtml(sharedClock.staff?.display_name || "");
  if (sharedClock.status === "entry" || sharedClock.status === "loading" || sharedClock.status === "error") {
    const locked = Date.now() < sharedClock.lockUntil;
    root.innerHTML = `<p class="shared-clock-prompt">${sharedClock.status === "error" ? "PIN not recognised." : locked ? "Please wait a moment." : "Enter your 4-digit PIN"}</p><p class="attendance-meta">${escapeHtml(sharedDeviceLabel())}</p><div class="pin-dots" aria-label="PIN digits">${[0,1,2,3].map((i) => `<span class="${sharedClock.pin[i] ? "filled" : ""}"></span>`).join("")}</div><div class="pin-pad">${[1,2,3,4,5,6,7,8,9,"clear",0,"back"].map((key) => `<button type="button" data-clock-key="${key}" ${locked || sharedClock.status === "loading" ? "disabled" : ""}>${key === "clear" ? "Clear" : key === "back" ? "⌫" : key}</button>`).join("")}</div>`;
    root.querySelectorAll("[data-clock-key]").forEach((button) => button.addEventListener("click", () => clockKey(button.dataset.clockKey)));
    return;
  }
  if (sharedClock.status === "success") { root.innerHTML = `<div class="shared-clock-result success"><span>✓</span><h3>${escapeHtml(sharedClock.successText)}</h3><p>${escapeHtml(sharedClock.successDetail || "Thank you.")}</p></div>`; return; }
  if (sharedClock.status === "off_duty") root.innerHTML = `<div class="shared-clock-status"><h3>Welcome, ${person}</h3><p>You are currently off duty.</p><button class="submit-button" data-clock-action="clock_in">Clock In</button><button class="shared-clock-cancel" data-clock-cancel>Cancel</button></div>`;
  if (sharedClock.status === "working") root.innerHTML = `<div class="shared-clock-status"><h3>Welcome back, ${person}</h3><p>Clocked in ${timeLabel(sharedClock.staff.clock_in_at)} · Working ${attendanceDuration(sharedClock.staff.worked_minutes || 0)}</p><button class="ghost-button" data-clock-action="break_start">Start Break</button><button class="shared-clock-danger" data-clock-confirm>Clock Out</button><button class="shared-clock-cancel" data-clock-cancel>Cancel</button></div>`;
  if (sharedClock.status === "on_break") root.innerHTML = `<div class="shared-clock-status"><h3>${person}</h3><p>You are on break · ${attendanceDuration(sharedClock.staff.break_minutes || 0)}</p><button class="submit-button" data-clock-action="break_end">End Break</button><button class="shared-clock-cancel" data-clock-cancel>Cancel</button></div>`;
  if (sharedClock.status === "confirm_clock_out") root.innerHTML = `<div class="shared-clock-status"><h3>Clock out?</h3><p>${person}<br>Worked ${attendanceDuration(sharedClock.staff.worked_minutes || 0)}</p><button class="shared-clock-danger" data-clock-action="clock_out">Confirm Clock Out</button><button class="shared-clock-cancel" data-clock-cancel>Cancel</button></div>`;
  root.querySelector("[data-clock-confirm]")?.addEventListener("click", () => { sharedClock.status = "confirm_clock_out"; renderSharedClock(); });
  root.querySelectorAll("[data-clock-action]").forEach((button) => button.addEventListener("click", () => sharedClockAction(button.dataset.clockAction)));
  root.querySelectorAll("[data-clock-cancel]").forEach((button) => button.addEventListener("click", sharedClockReturn));
}

async function initializeExternalStaffClock() {
  document.body.classList.add("external-staff-clock-active");
  document.getElementById("externalStaffClock")?.classList.remove("hidden");
  const root = document.getElementById("externalStaffClockContent");
  const render = () => {
    const person = escapeHtml(externalStaffClock.staff?.display_name || "");
    if (["loading", "entry", "error", "invalid"].includes(externalStaffClock.status)) {
      const message = externalStaffClock.status === "loading" ? "Checking…" : externalStaffClock.status === "invalid" ? "This Staff Clock link is unavailable." : externalStaffClock.status === "error" ? "PIN not recognised." : "Enter your 4-digit PIN";
      root.innerHTML = `<p class="shared-clock-prompt">${message}</p>${externalStaffClock.status === "invalid" ? "" : `<div class="pin-dots">${[0,1,2,3].map((i) => `<span class="${externalStaffClock.pin[i] ? "filled" : ""}"></span>`).join("")}</div><div class="pin-pad">${[1,2,3,4,5,6,7,8,9,"clear",0,"back"].map((key) => `<button type="button" data-external-clock-key="${key}" ${externalStaffClock.status === "loading" ? "disabled" : ""}>${key === "clear" ? "Clear" : key === "back" ? "⌫" : key}</button>`).join("")}</div>`}`;
      root.querySelectorAll("[data-external-clock-key]").forEach((button) => button.addEventListener("click", async () => { if (!["entry", "error"].includes(externalStaffClock.status)) return; externalStaffClock.status = "entry"; const key = button.dataset.externalClockKey; if (key === "clear") externalStaffClock.pin = ""; else if (key === "back") externalStaffClock.pin = externalStaffClock.pin.slice(0, -1); else if (/^\d$/.test(key) && externalStaffClock.pin.length < 4) externalStaffClock.pin += key; if (externalStaffClock.pin.length < 4) return render(); externalStaffClock.status = "loading"; render(); try { const data = await window.TableOrderCloud.identifyPublicStaffClockPin(externalStaffClock.token, externalStaffClock.pin); if (!data?.action_token) { externalStaffClock.pin = ""; externalStaffClock.status = "error"; } else { externalStaffClock.actionToken = data.action_token; externalStaffClock.staff = data; externalStaffClock.status = data.status.toLowerCase(); } } catch { externalStaffClock.status = "invalid"; } render(); }));
      return;
    }
    if (externalStaffClock.status === "success") { root.innerHTML = `<div class="shared-clock-result success"><span>✓</span><h3>${escapeHtml(externalStaffClock.successText)}</h3></div>`; return; }
    const actions = externalStaffClock.status === "off_duty" ? [["clock_in","Clock In","submit-button"]] : externalStaffClock.status === "working" ? [["break_start","Start Break","ghost-button"],["clock_out","Clock Out","shared-clock-danger"]] : [["break_end","End Break","submit-button"]];
    root.innerHTML = `<div class="shared-clock-status"><h3>${person}</h3><p>${externalStaffClock.status === "off_duty" ? "You are currently off duty." : externalStaffClock.status === "on_break" ? "You are on break." : "You are clocked in."}</p>${actions.map(([action,label,className]) => `<button class="${className}" data-external-clock-action="${action}">${label}</button>`).join("")}<button class="shared-clock-cancel" data-external-clock-cancel>Cancel</button></div>`;
    root.querySelectorAll("[data-external-clock-action]").forEach((button) => button.addEventListener("click", async () => { externalStaffClock.status = "loading"; render(); try { const data = await window.TableOrderCloud.publicStaffClockAction(externalStaffClock.actionToken, button.dataset.externalClockAction); externalStaffClock.status = "success"; externalStaffClock.successText = data.message || "Done"; setTimeout(() => { externalStaffClock.pin = ""; externalStaffClock.actionToken = ""; externalStaffClock.staff = null; externalStaffClock.status = "entry"; render(); }, 1800); } catch { externalStaffClock.pin = ""; externalStaffClock.status = "error"; } render(); }));
    root.querySelector("[data-external-clock-cancel]")?.addEventListener("click", () => { externalStaffClock.pin = ""; externalStaffClock.actionToken = ""; externalStaffClock.staff = null; externalStaffClock.status = "entry"; render(); });
  };
  try { const context = await window.TableOrderCloud.getPublicStaffClockContext(externalStaffClock.token); document.getElementById("externalStaffClockRestaurant").textContent = context.restaurant_name; document.getElementById("externalStaffClockLabel").textContent = context.device_label || ""; externalStaffClock.status = "entry"; } catch { externalStaffClock.status = "invalid"; document.getElementById("externalStaffClockRestaurant").textContent = "Staff Clock unavailable"; }
  render();
}


function attendanceStore() {
  state.attendance ||= { shifts: [], audit: [] };
  state.attendance.shifts ||= [];
  state.attendance.audit ||= [];
  return state.attendance;
}

function attendanceName(userId) {
  if (userId === staffUser?.userId || userId === staffUser?.id) return staffUser.email.split("@")[0];
  const member = restaurantTeamData.staff?.find((item) => item.user_id === userId);
  return member?.email?.split("@")[0] || "Team member";
}

function durationMinutes(shift, end = new Date().toISOString()) {
  if (!shift?.clockIn) return 0;
  const finish = shift.clockOut || end;
  const elapsed = Math.max(0, new Date(finish) - new Date(shift.clockIn)) / 60000;
  const breaks = (shift.breaks || []).reduce((total, item) => total + Math.max(0, new Date(item.end || finish) - new Date(item.start)) / 60000, 0);
  return Math.max(0, Math.round(elapsed - breaks));
}

function attendanceDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

function currentShift() {
  const userId = staffUser?.userId || staffUser?.id;
  return attendanceStore().shifts.find((item) => item.userId === userId && !item.clockOut) || null;
}

function activeBreak(shift) {
  return shift?.breaks?.find((item) => !item.end) || null;
}

function recordAttendanceAudit(shift, action, reason = "") {
  attendanceStore().audit.unshift({ shiftId: shift.id, action, reason, changedAt: new Date().toISOString(), changedBy: staffUser?.email || "System" });
}

function clockIn() {
  if (!staffUser || currentShift()) return;
  const now = new Date().toISOString();
  const shift = { id: `shift-${Date.now()}`, userId: staffUser.userId || staffUser.id, clockIn: now, clockOut: "", location: "Front Counter", device: "This device", breaks: [], notes: "" };
  attendanceStore().shifts.unshift(shift);
  recordAttendanceAudit(shift, "Clocked in");
  saveState(); renderAttendance(); showOrderToast("Clocked in. Have a good shift.", "success");
}

function clockOut() {
  const shift = currentShift();
  if (!shift) return;
  if (activeBreak(shift)) activeBreak(shift).end = new Date().toISOString();
  shift.clockOut = new Date().toISOString();
  recordAttendanceAudit(shift, "Clocked out");
  saveState(); renderAttendance(); showOrderToast(`Shift completed — ${attendanceDuration(durationMinutes(shift))}.`, "success");
}

function toggleBreak() {
  const shift = currentShift();
  if (!shift) return;
  const open = activeBreak(shift);
  if (open) { open.end = new Date().toISOString(); recordAttendanceAudit(shift, "Ended break"); }
  else { shift.breaks.push({ start: new Date().toISOString(), end: "" }); recordAttendanceAudit(shift, "Started break"); }
  saveState(); renderAttendance();
}

function editAttendanceShift(id) {
  if (!["owner", "manager"].includes(staffUser?.role)) return;
  const shift = attendanceStore().shifts.find((item) => item.id === id);
  if (!shift) return;
  const reason = window.prompt("Reason for this edit (required)");
  if (!reason?.trim()) return;
  const clockOut = window.prompt("Clock-out time (YYYY-MM-DDTHH:MM), or leave blank to keep open", shift.clockOut ? shift.clockOut.slice(0, 16) : "");
  if (clockOut === null) return;
  shift.clockOut = clockOut ? new Date(clockOut).toISOString() : "";
  recordAttendanceAudit(shift, "Manager edited shift", reason.trim());
  saveState(); renderAttendance(); showOrderToast("Shift edit recorded in the audit log.", "success");
}

function renderAttendance() {
  const date = document.getElementById("attendanceDateLabel");
  if (!date) return;
  if (staffUser?.role === "owner" && !staffClockLink) loadStaffClockLink();
  renderStaffClockLink();
  const store = attendanceStore();
  const today = store.shifts.filter((shift) => isToday(shift.clockIn));
  const live = store.shifts.filter((shift) => !shift.clockOut);
  const mine = currentShift();
  const onBreak = activeBreak(mine);
  document.getElementById("attendanceDateLabel").textContent = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const average = today.length ? Math.round(today.reduce((sum, shift) => sum + durationMinutes(shift), 0) / today.length) : 0;
  const missed = store.shifts.filter((shift) => !shift.clockOut && !isToday(shift.clockIn)).length;
  document.getElementById("attendanceMetrics").innerHTML = [["On duty", live.length, "live now"], ["Average shift", attendanceDuration(average), "today"], ["Missed clock-outs", missed, missed ? "needs review" : "all clear"], ["Breaks now", live.filter(activeBreak).length, "on break"]].map(([label, value, note]) => `<div class="attendance-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
  document.getElementById("myAttendanceCard").innerHTML = !staffUser ? "" : mine ? `<p class="eyebrow">Your shift</p><div class="attendance-status"><span class="attendance-status-dot ${onBreak ? "break" : ""}"></span><div><h3>${onBreak ? "On break" : "On duty"}</h3><p>Clocked in ${timeLabel(mine.clockIn)} · ${attendanceDuration(durationMinutes(mine))} worked</p></div></div><div class="attendance-actions"><button class="ghost-button" id="attendanceBreakButton">${onBreak ? "End Break" : "Start Break"}</button><button class="primary-button" id="attendanceClockOut">Clock Out</button></div><p class="attendance-meta">${mine.location} · ${mine.device}</p>` : `<p class="eyebrow">Your shift</p><div class="attendance-status off"><span class="attendance-status-dot"></span><div><h3>Off duty</h3><p>Ready when you are.</p></div></div><button class="submit-button" id="attendanceClockIn">Clock In</button><p class="attendance-meta">Front Counter · This device</p>`;
  document.getElementById("attendanceLiveCount").textContent = `${live.length} on duty`;
  document.getElementById("attendanceLiveList").innerHTML = live.length ? live.map((shift) => `<div class="attendance-row"><span class="attendance-avatar">${escapeHtml(attendanceName(shift.userId).slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(attendanceName(shift.userId))}</strong><p>${activeBreak(shift) ? "On break" : `Since ${timeLabel(shift.clockIn)}`}</p></div><strong>${attendanceDuration(durationMinutes(shift))}</strong></div>`).join("") : `<div class="empty-state">No one is clocked in yet.</div>`;
  const weekly = store.shifts.filter((shift) => new Date(shift.clockIn) >= new Date(Date.now() - 6 * 86400000));
  document.getElementById("attendanceWeekTotal").textContent = `Total ${attendanceDuration(weekly.reduce((sum, shift) => sum + durationMinutes(shift), 0))}`;
  document.getElementById("attendanceHistory").innerHTML = weekly.length ? weekly.slice(0, 8).map((shift) => `<div class="attendance-history-row"><div><strong>${escapeHtml(attendanceName(shift.userId))}</strong><p>${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(new Date(shift.clockIn))} · ${timeLabel(shift.clockIn)}${shift.clockOut ? ` – ${timeLabel(shift.clockOut)}` : " · in progress"}</p></div><strong>${attendanceDuration(durationMinutes(shift))}</strong></div>`).join("") : `<div class="empty-state">Clocked shifts will appear here.</div>`;
  const manager = document.getElementById("attendanceManagerCard");
  const canManage = ["owner", "manager"].includes(staffUser?.role);
  document.getElementById("openAttendanceReports")?.classList.toggle("hidden", !["owner", "manager"].includes(staffUser?.role));
  manager.classList.toggle("hidden", !canManage);
  if (canManage) document.getElementById("attendanceManagerList").innerHTML = store.shifts.filter((shift) => !shift.clockOut || isToday(shift.clockIn)).map((shift) => `<div class="attendance-row"><div><strong>${escapeHtml(attendanceName(shift.userId))}</strong><p>${shift.clockOut ? "Completed" : "Open shift"}${store.audit.find((audit) => audit.shiftId === shift.id && audit.reason) ? " · edited" : ""}</p></div><span>${attendanceDuration(durationMinutes(shift))}</span><button class="ghost-button attendance-edit" data-attendance-edit="${shift.id}">Edit</button></div>`).join("") || `<div class="empty-state">No exceptions today.</div>`;
  document.getElementById("attendanceClockIn")?.addEventListener("click", clockIn);
  document.getElementById("attendanceClockOut")?.addEventListener("click", clockOut);
  document.getElementById("attendanceBreakButton")?.addEventListener("click", toggleBreak);
  document.querySelectorAll("[data-attendance-edit]").forEach((button) => button.addEventListener("click", () => editAttendanceShift(button.dataset.attendanceEdit)));
  const attendanceReportsButton = document.getElementById("openAttendanceReports");
  if (attendanceReportsButton) attendanceReportsButton.onclick = openAttendanceReports;
}

function attendanceReportDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
function attendanceReportIso(date) { return date.toISOString().slice(0, 10); }
function shiftAttendanceReportWeek(offset) {
  const start = new Date(`${attendanceReport.from}T12:00:00`);
  start.setDate(start.getDate() + offset * 7);
  attendanceReport.from = attendanceReportIso(start);
  start.setDate(start.getDate() + 6);
  attendanceReport.to = attendanceReportIso(start);
  const from = document.getElementById("attendanceReportFrom");
  const to = document.getElementById("attendanceReportTo");
  if (from) from.value = attendanceReport.from;
  if (to) to.value = attendanceReport.to;
  loadAttendanceReport();
}
function attendanceReportWeekRange(offset = 0, weekStartsOn = 1) {
  const local = new Date(); local.setHours(12, 0, 0, 0);
  const back = (local.getDay() - weekStartsOn + 7) % 7;
  local.setDate(local.getDate() - back + offset * 7);
  const from = attendanceReportIso(local); local.setDate(local.getDate() + 6);
  return { from, to: attendanceReportIso(local) };
}
function attendanceReportCanSetSettings() { return staffUser?.role === "owner"; }
function attendanceReportMinutes(value) { return attendanceDuration(Number(value || 0)); }
function attendanceReportLocalTime(value) { return value ? new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"; }
function attendanceReportCsv(rows, filename) { const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename }); link.click(); URL.revokeObjectURL(link.href); }

async function openAttendanceReports() {
  if (!staffUser?.restaurantId || !["owner", "manager"].includes(staffUser.role)) return;
  const panel = document.getElementById("attendanceReportsPanel"); panel.classList.remove("hidden"); attendanceReport.open = true;
  try {
    attendanceReport.settings = await window.TableOrderCloud.getAttendanceReportSettings(staffUser.restaurantId);
    if (!attendanceReport.from) Object.assign(attendanceReport, attendanceReportWeekRange(0, attendanceReport.settings.week_starts_on));
    document.getElementById("attendanceReportWeekStarts").value = String(attendanceReport.settings.week_starts_on);
    await loadAttendanceReport();
  } catch (error) { setAttendanceReportStatus(error.message.includes("ACCESS_DENIED") ? "You do not have permission to view attendance reports." : "Unable to load attendance report."); }
}
function setAttendanceReportStatus(message = "") { const el = document.getElementById("attendanceReportStatus"); if (el) el.textContent = message; }
async function loadAttendanceReport() {
  if (!attendanceReport.open || !staffUser?.restaurantId) return;
  attendanceReport.loading = true; setAttendanceReportStatus("Loading report…"); renderAttendanceReport();
  try {
    attendanceReport.from = document.getElementById("attendanceReportFrom")?.value || attendanceReport.from;
    attendanceReport.to = document.getElementById("attendanceReportTo")?.value || attendanceReport.to;
    attendanceReport.staffUserId = document.getElementById("attendanceReportStaff")?.value || "";
    attendanceReport.location = document.getElementById("attendanceReportLocation")?.value || "";
    attendanceReport.shiftStatus = document.getElementById("attendanceReportShiftStatus")?.value || attendanceReport.shiftStatus;
    attendanceReport.data = await window.TableOrderCloud.getWeeklyAttendanceReport(staffUser.restaurantId, attendanceReport);
    setAttendanceReportStatus("");
  } catch (error) { attendanceReport.data = null; setAttendanceReportStatus(error.message.includes("ACCESS_DENIED") ? "You do not have permission to view attendance reports." : "Report generation failed. Try again."); }
  attendanceReport.loading = false; renderAttendanceReport();
}
function renderAttendanceReport() {
  const panel = document.getElementById("attendanceReportsPanel"); if (!panel || !attendanceReport.open) return;
  const from = document.getElementById("attendanceReportFrom"); const to = document.getElementById("attendanceReportTo"); if (from) from.value = attendanceReport.from; if (to) to.value = attendanceReport.to;
  document.getElementById("attendanceReportSettings")?.classList.toggle("hidden", !attendanceReportCanSetSettings());
  if (!attendanceReport.data) { document.getElementById("attendanceReportMetrics").innerHTML = attendanceReport.loading ? "" : `<div class="empty-state">No report data to display.</div>`; document.getElementById("attendanceReportHead").innerHTML = ""; document.getElementById("attendanceReportBody").innerHTML = ""; return; }
  const data = attendanceReport.data; const summary = data.summary || {}; const days = []; for (let d = new Date(`${data.from}T12:00:00`); d <= new Date(`${data.to}T12:00:00`); d.setDate(d.getDate() + 1)) days.push(attendanceReportIso(d));
  document.getElementById("attendanceReportRangeLabel").textContent = `${attendanceReportDate(data.from)} – ${attendanceReportDate(data.to)} · ${data.timezone}`;
  const members = data.staff || []; const locations = [...new Set((data.details || []).map((row) => row.location).filter(Boolean))];
  const staffSelect = document.getElementById("attendanceReportStaff"); const locationSelect = document.getElementById("attendanceReportLocation");
  if (staffSelect) { staffSelect.innerHTML = `<option value="">All staff</option>${members.map((m) => `<option value="${escapeHtml(m.staff_user_id)}">${escapeHtml(m.staff_name)}</option>`).join("")}`; staffSelect.value = attendanceReport.staffUserId; }
  if (locationSelect) { locationSelect.innerHTML = `<option value="">All locations</option>${locations.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}`; locationSelect.value = attendanceReport.location; }
  document.getElementById("attendanceReportShiftStatus").value = attendanceReport.shiftStatus;
  document.getElementById("attendanceReportMetrics").innerHTML = [["Staff hours", attendanceReportMinutes(summary.total_paid_minutes)], ["Completed shifts", summary.completed_shifts || 0], ["Open / missed", summary.open_shifts || 0], ["Break time", attendanceReportMinutes(summary.total_break_minutes)], ["Rounding adjustment", `${Number(summary.rounding_adjustment_minutes || 0)}m`]].map(([label,value]) => `<div class="attendance-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const warning = document.getElementById("attendanceReportWarning"); const reviewCount = Number(summary.review_shifts || 0) + Number(summary.open_shifts || 0); warning.classList.toggle("hidden", !reviewCount); warning.textContent = reviewCount ? `${reviewCount} shift${reviewCount === 1 ? "" : "s"} require manager review and ${reviewCount === 1 ? "is" : "are"} excluded from calculated hours.` : "";
  document.getElementById("attendanceReportHead").innerHTML = `<tr><th>Staff</th>${days.map((day) => `<th>${escapeHtml(attendanceReportDate(day))}</th>`).join("")}<th>Weekly total</th></tr>`;
  document.getElementById("attendanceReportBody").innerHTML = members.length ? members.map((member) => `<tr><th><button class="text-button attendance-report-detail-trigger" data-report-staff="${escapeHtml(member.staff_user_id)}">${escapeHtml(member.staff_name)}</button></th>${days.map((day) => `<td>${attendanceReportMinutes(member.daily_paid_minutes?.[day] || 0)}</td>`).join("")}<td><strong>${attendanceReportMinutes(member.weekly_paid_minutes)}</strong></td></tr>`).join("") : `<tr><td colspan="${days.length + 2}" class="muted">No attendance records for this period.</td></tr>`;
  document.querySelectorAll(".attendance-report-detail-trigger").forEach((button) => button.addEventListener("click", () => openAttendanceReportDetails(button.dataset.reportStaff)));
}
function openAttendanceReportDetails(staffId) {
  const rows = (attendanceReport.data?.details || []).filter((row) => row.staff_user_id === staffId); const content = document.getElementById("attendanceReportDetailContent");
  document.getElementById("attendanceReportDetailTitle").textContent = rows[0]?.staff_name || "Shift details";
  content.innerHTML = rows.length ? rows.map((row) => `<article class="attendance-detail-row"><strong>${escapeHtml(row.date)} · ${escapeHtml(row.location || "No location")}</strong><dl><div><dt>Actual in</dt><dd>${attendanceReportLocalTime(row.actual_clock_in_at)}</dd></div><div><dt>Actual out</dt><dd>${attendanceReportLocalTime(row.actual_clock_out_at)}</dd></div><div><dt>Report out</dt><dd>${attendanceReportLocalTime(row.report_clock_out_at)}</dd></div><div><dt>Break</dt><dd>${attendanceReportMinutes(row.break_minutes)}</dd></div><div><dt>Paid</dt><dd>${attendanceReportMinutes(row.calculated_paid_minutes)}</dd></div><div><dt>Adjustment</dt><dd>${row.clock_out_rounding_adjustment_minutes ?? "—"}m</dd></div></dl><p class="muted">${escapeHtml(row.device || "No device")} · ${row.manager_review_required ? "Manager review required" : "Calculated"}</p></article>`).join("") : `<div class="empty-state">No shifts for this staff member in the selected range.</div>`;
  document.getElementById("attendanceReportDetailModal").classList.remove("hidden");
}
function exportAttendanceReport(kind) {
  const data = attendanceReport.data; if (!data) return; const days = []; for (let d = new Date(`${data.from}T12:00:00`); d <= new Date(`${data.to}T12:00:00`); d.setDate(d.getDate() + 1)) days.push(attendanceReportIso(d));
  if (kind === "summary") { const header = ["Staff Name", ...days.map((day) => `${attendanceReportDate(day)} Hours`), "Weekly Total Hours", "Weekly Total Minutes"]; const rows = (data.staff || []).map((m) => [m.staff_name, ...days.map((day) => attendanceReportMinutes(m.daily_paid_minutes?.[day] || 0)), attendanceReportMinutes(m.weekly_paid_minutes), m.weekly_paid_minutes]); attendanceReportCsv([header, ...rows], `attendance-weekly-summary-${data.from}.csv`); }
  else { const header = ["Staff Name","Staff ID","Date","Location","Actual Clock In","Actual Clock Out","Report Clock Out","Clock-Out Adjustment Minutes","Break Minutes","Calculated Paid Minutes","Calculated Paid Hours","Shift Status","Manager Review Required"]; const rows = (data.details || []).map((r) => [r.staff_name,r.staff_user_id,r.date,r.location,r.actual_clock_in_at,r.actual_clock_out_at,r.report_clock_out_at,r.clock_out_rounding_adjustment_minutes,r.break_minutes,r.calculated_paid_minutes,attendanceReportMinutes(r.calculated_paid_minutes),r.shift_status,r.manager_review_required]); attendanceReportCsv([header, ...rows], `attendance-weekly-detail-${data.from}.csv`); }
}

function exportAttendanceCsv() {
  const rows = [["Employee", "Date", "Clock in", "Clock out", "Break minutes", "Worked minutes", "Location", "Device"]];
  attendanceStore().shifts.forEach((shift) => { const breaks = (shift.breaks || []).reduce((sum, item) => sum + Math.round(Math.max(0, new Date(item.end || Date.now()) - new Date(item.start)) / 60000), 0); rows.push([attendanceName(shift.userId), new Date(shift.clockIn).toLocaleDateString("en-CA"), shift.clockIn, shift.clockOut || "", breaks, durationMinutes(shift), shift.location, shift.device]); });
  const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `attendance-${restaurantToday()}.csv` }); link.click(); URL.revokeObjectURL(link.href);
}

function taxIncludedCents(grossCents) {
  const rateBps = taxRateBasisPoints();
  return rateBps ? Math.round((Number(grossCents) || 0) * rateBps / (10000 + rateBps)) : 0;
}

function subtotalBeforeTaxCents(grossCents) { return (Number(grossCents) || 0) - taxIncludedCents(grossCents); }
function taxIncludedIn(grossAmount) { return fromCents(taxIncludedCents(toCents(grossAmount))); }
function subtotalBeforeTax(grossAmount) { return fromCents(subtotalBeforeTaxCents(toCents(grossAmount))); }

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
      options: [],
      notes: ""
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
        notes: line.notes || "",
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
  if (orderSubmissionInProgress) return;
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
      options,
      notes: ""
    });
  }

  saveState();
  mobileCartBumpRequested = true;
  renderCart();
}

// Monetary values are converted at the boundary only. All checkout arithmetic
// below uses integer cents so split totals never inherit floating-point drift.
function toCents(value) { return Math.round((Number(value) || 0) * 100); }
function fromCents(value) { return (Number(value) || 0) / 100; }
function moneyCents(value) { return money(fromCents(value)); }
function splitEvenly(totalCents, people) {
  const count = Math.max(1, Math.floor(Number(people) || 1));
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => base + (index < totalCents % count ? 1 : 0));
}
function paymentStatus(totalCents, paidCents) {
  if (paidCents <= 0) return "Unpaid";
  return paidCents >= totalCents ? "Paid" : "Partially Paid";
}
function activePaymentsForOrders(orders) {
  const ids = new Set(orders.map((order) => order.cloudId || order.id));
  return (state.payments || []).filter((payment) => payment.status !== "voided" && ids.has(payment.orderId));
}

function openOrdersForTable(tableId) {
  return state.orders.filter((order) => order.tableId === tableId && isPayableOrder(order));
}

function isPayableOrder(order) {
  return !["Paid", "Served", "Completed", "Voided", "Cancelled"].includes(order.status);
}

function checkoutOrdersForTable(tableId) {
  const payable = openOrdersForTable(tableId);
  const selected = payable.find((order) => order.id === selectedInvoiceOrderId);
  return selected ? [selected] : payable.length ? [payable[0]] : [];
}

function tableTotal(tableId) {
  return openOrdersForTable(tableId).reduce((sum, order) => sum + orderTotal(order), 0);
}

function orderTotal(order) {
  return fromCents(orderTotalCents(order));
}

function orderTotalCents(order) {
  return (order.items || []).reduce((sum, item) => sum + toCents(item.price) * Math.max(0, Number(item.quantity) || 0), 0);
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
  if (typeof window.qrcode !== "function") {
    throw new Error("QR generator failed to load. Please refresh and try again.");
  }

  // qrcode-generator selects the smallest valid QR version automatically.
  // Level M plus a four-module quiet zone is reliable for screen, PNG and print.
  const qr = window.qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();

  const size = qr.getModuleCount();
  const quietZone = 4;
  const scale = Math.max(1, Math.floor(canvas.width / (size + quietZone * 2)));
  const qrSize = scale * (size + quietZone * 2);
  const offset = Math.floor((canvas.width - qrSize) / 2) + scale * quietZone;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col)) context.fillRect(offset + col * scale, offset + row * scale, scale, scale);
    }
  }
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
  if (window.TableOrderCloud?.routeContext?.().area !== "staff") {
    window.location.assign(staffLoginUrl(APP_ROUTE.restaurantSlug, view ? `/${view}` : ""));
    return;
  }
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
  document.getElementById("mobileHeaderMenu").classList.toggle("hidden", !staffUser);
  loginButton.classList.toggle("hidden", Boolean(staffUser));
  document.getElementById("ownerSignupButton")?.classList.toggle("hidden", Boolean(staffUser));
  identity.classList.toggle("hidden", !staffUser);
  document.getElementById("soundToggle").classList.toggle("hidden", !staffUser);
  document.getElementById("printBillTop").classList.toggle("hidden", !staffUser || activeView !== "frontdesk");
  document.getElementById("cloudSyncCluster").classList.toggle("hidden", !staffUser);
  renderSoundToggle();
  document.body.classList.toggle("staff-session", Boolean(staffUser));
  document.body.dataset.staffRole = staffUser?.role || "customer";
  const managerSetupOnly = staffUser?.role === "manager";
  document.querySelectorAll("#setup .setup-panel").forEach((panel) => {
    panel.hidden = managerSetupOnly && panel.id !== "teamManagementPanel";
  });
  const inviteRole = document.getElementById("restaurantInviteRole");
  const ownerInviteOption = inviteRole?.querySelector('option[value="owner"]');
  if (ownerInviteOption) {
    ownerInviteOption.hidden = staffUser?.role !== "owner";
    ownerInviteOption.disabled = staffUser?.role !== "owner";
    if (staffUser?.role !== "owner" && inviteRole.value === "owner") inviteRole.value = "staff";
  }
  const mobileNav = document.getElementById("mobileBottomNav");
  mobileNav.classList.remove("hidden");
  if (staffUser) {
    mobileNav.setAttribute("aria-label", "Merchant navigation");
    const mobileViews = [["customer", "Customer"], ["kitchen", "Kitchen"], ["frontdesk", "Front Desk"], ["reports", "Reports"], ["attendance", "Time"], ["setup", "Admin"]].filter(([view]) => staffCanAccess(view));
    mobileNav.innerHTML = mobileViews.map(([view, label]) => `<button type="button" data-mobile-view="${view}" class="${view === activeView ? "active" : ""}" ${view === activeView ? 'aria-current="page"' : ""}>${label}</button>`).join("");
  } else {
    mobileNav.setAttribute("aria-label", "Customer navigation");
    mobileNav.innerHTML = [
      ["menu", "Menu"],
      ["orders", "Orders"],
      ["account", "Account"]
    ].map(([action, label]) => `<button type="button" data-mobile-nav="${action}" class="${action === activeMobileCustomerNav ? "active" : ""}" ${action === activeMobileCustomerNav ? 'aria-current="page"' : ""}>${label}</button>`).join("");
  }
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
      <div class="success-mark" aria-hidden="true">✓</div>
      <p class="eyebrow">Order #${escapeHtml(order.number)}</p>
      <h2 id="orderSuccessTitle">Order sent</h2>
      <p>Your order has been sent to the kitchen.</p>
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
  document.getElementById("orderSuccessOk").addEventListener("click", () => {
    closeOrderSuccessModal();
    document.getElementById("categoryRow")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  const statusFromDatabase = { new: "New", draft: "New", confirmed: "New", kitchen_accepted: "Preparing", preparing: "Preparing", ready: "Ready", completed: row.payment_status === "paid" ? "Paid" : "Served", paid: "Paid", voided: "Voided", cancelled: "Cancelled" };
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
    isTestOrder: Boolean(row.is_test_order),
    cloudStatus: "synced",
    items: (row.order_items || []).map((item) => ({
      id: item.id,
      itemId: item.menu_item_id || "",
      menuItemCloudId: item.menu_item_id || null,
      name: item.item_name || item.name_snapshot,
      price: Number(item.price ?? item.unit_price) || 0,
      basePrice: Number(item.price ?? item.base_price) || 0,
      quantity: Number(item.quantity) || 0,
      status: item.status || "active",
      voidedAt: item.voided_at || null,
      voidReason: item.void_reason || "",
      options: Array.isArray(item.options) ? item.options : []
    }))
  };
}

async function syncCloudOrders({ notify = true } = {}) {
  // Browsers already throttle background timers. Avoid turning those wake-ups
  // into complete order and payment requests until the staff member returns.
  if (!staffUser?.restaurantId || cloudSyncBusy || document.hidden) return;
  cloudSyncBusy = true;
  setCloudSyncStatus("syncing", "Syncing");

  try {
    const rows = await window.TableOrderCloud.loadOrders(staffUser.restaurantId);
    const cloudPayments = window.TableOrderCloud.loadFrontdeskPayments
      ? await window.TableOrderCloud.loadFrontdeskPayments(staffUser.restaurantId).catch(() => null) : null;
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
    if (cloudPayments) state.payments = cloudPayments.map((payment) => ({ id: payment.id, orderId: payment.order_id, amountCents: Number(payment.amount_cents), method: payment.payment_method, label: payment.note || payment.payment_method, reference: payment.payment_reference, paidAt: payment.recorded_at, status: "completed" }));
    knownCloudOrderIds = cloudIds;
    cloudSyncInitialized = true;
    lastCloudSyncAt = new Date();
    saveState();
    // Each workspace is fully rendered when opened. Updating only the visible
    // workspace prevents three large DOM rebuilds on every polling cycle.
    if (activeView === "kitchen") renderKitchen();
    if (activeView === "frontdesk") renderFrontDesk();
    if (activeView === "reports") renderReports();
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

async function refreshStaffPresence() {
  if (!staffUser?.restaurantId) return;
  try {
    await window.TableOrderCloud?.touchStaffPresence?.(staffUser.restaurantId);
    if (activeView === "setup" && ["owner", "manager"].includes(staffUser.role)) await loadRestaurantTeam();
  } catch (error) {
    console.warn("Staff presence refresh paused:", error.message);
  }
}

function startCloudOrderSync() {
  window.clearInterval(cloudSyncTimer);
  cloudSyncInitialized = false;
  knownCloudOrderIds = new Set();
  syncCloudOrders({ notify: false });
  cloudSyncTimer = window.setInterval(syncCloudOrders, 3000);
  window.clearInterval(staffPresenceTimer);
  refreshStaffPresence();
  staffPresenceTimer = window.setInterval(refreshStaffPresence, 20000);
}

function stopCloudOrderSync() {
  window.clearInterval(cloudSyncTimer);
  window.clearInterval(staffPresenceTimer);
  staffPresenceTimer = null;
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
    staffUser = await window.TableOrderCloud.getStaffProfile({ preferActiveRestaurant: true });
    const destination = pendingStaffView && staffCanAccess(pendingStaffView) ? pendingStaffView : staffDefaultDestination(staffUser.role);
    pendingStaffView = "";
    // A staff sign-in can begin from the public/customer shell, whose local
    // state belongs to the last restaurant viewed on this browser. Move to the
    // authenticated restaurant route before rendering so its cloud tables and
    // menu replace that stale state before an order can be submitted.
    const routeName = destination === "customer" ? "dashboard" : destination;
    const targetPath = `/dashboard/${encodeURIComponent(staffUser.restaurantSlug)}/${routeName}`;
    if (window.location.pathname !== targetPath) {
      window.location.assign(targetPath);
      return;
    }
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
    else if (["dashboard", "frontdesk", "reports", "attendance", "setup"].includes(APP_ROUTE.area)) setView(APP_ROUTE.area === "dashboard" ? "setup" : APP_ROUTE.area, { updateUrl: false });
  }
}

function setView(view, options = {}) {
  if (!staffCanAccess(view)) {
    if (!staffUser) openStaffLogin(view);
    return false;
  }
  clearPrintContent();
  activeView = view;
  document.body.dataset.activeView = view;
  document.body.dataset.layoutFamily = ["setup", "reports", "attendance"].includes(view) ? "admin" : "operations";
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
  if (view === "setup" && staffUser) loadPlanEntitlement();
  if (view === "setup" && staffUser) loadOnboardingChecklist();
  if (view === "reports" && staffUser && ["owner", "manager"].includes(staffUser.role)) {
    window.setTimeout(() => loadReports({ refreshDashboard: true }), 0);
  }
  if (view === "attendance") {
    renderAttendance();
    window.clearInterval(attendanceTimer);
    attendanceTimer = window.setInterval(renderAttendance, 60000);
  } else {
    window.clearInterval(attendanceTimer);
    attendanceTimer = null;
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
          <div class="menu-buy"><strong>${money(item.price)}</strong><button aria-label="Add ${escapeHtml(item.name)}" data-add="${item.id}" ${soldOut || !profile.isOpen || orderSubmissionInProgress ? "disabled" : ""}>${soldOut ? "×" : profile.isOpen ? "+" : "—"}</button></div>
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
        button.classList.add("added-feedback");
        button.textContent = "✓";
        window.setTimeout(() => renderMenu(), 650);
      }
    });
  });
}

function adminSelectionFromHash() {
  const selection = window.location.hash.replace(/^#/, "");
  if (selection.startsWith("menu-")) return { section: "menu", menu: selection.slice(5) };
  return { section: selection || "overview", menu: "status" };
}

function updateAdminHash(selection) {
  const hash = selection.section === "menu" ? `menu-${selection.menu || "status"}` : selection.section;
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${hash}`);
}

function selectAdminMenuSection(menu, { updateUrl = true } = {}) {
  const available = new Set(["status", "add", "theme", "import"]);
  const selected = available.has(menu) ? menu : "status";
  document.querySelectorAll("[data-menu-section]").forEach((button) => {
    const active = button.dataset.menuSection === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-menu-panel]").forEach((panel) => {
    panel.classList.toggle("admin-panel-inactive", panel.dataset.menuPanel !== selected);
  });
  if (updateUrl) updateAdminHash({ section: "menu", menu: selected });
}

function selectAdminSection(section, { menu = "status", updateUrl = true } = {}) {
  const available = new Set(["overview", "menu", "restaurant", "team", "tables"]);
  const selected = available.has(section) ? section : "overview";
  document.querySelectorAll("[data-admin-section]").forEach((button) => {
    const active = button.dataset.adminSection === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("admin-panel-inactive", panel.dataset.adminPanel !== selected);
  });
  document.getElementById("adminMenuNav")?.classList.toggle("hidden", selected !== "menu");
  if (selected === "menu") selectAdminMenuSection(menu, { updateUrl: false });
  if (updateUrl) updateAdminHash({ section: selected, menu });
}

function bindAdminSettingsNavigation() {
  document.querySelectorAll("[data-admin-section]").forEach((button) => {
    button.addEventListener("click", () => selectAdminSection(button.dataset.adminSection));
  });
  document.querySelectorAll("[data-menu-section]").forEach((button) => {
    button.addEventListener("click", () => {
      selectAdminSection("menu", { menu: button.dataset.menuSection, updateUrl: false });
      selectAdminMenuSection(button.dataset.menuSection);
    });
  });
  const initial = adminSelectionFromHash();
  selectAdminSection(initial.section, { menu: initial.menu, updateUrl: false });
  window.addEventListener("hashchange", () => {
    const selection = adminSelectionFromHash();
    selectAdminSection(selection.section, { menu: selection.menu, updateUrl: false });
  });
}

function formatEntitlementDate(value) {
  if (!value) return "Not applicable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString();
}

async function loadOnboardingChecklist() {
  const panel = document.getElementById("onboardingChecklistPanel");
  const percent = document.getElementById("onboardingChecklistPercent");
  const summary = document.getElementById("onboardingChecklistSummary");
  const items = document.getElementById("onboardingChecklistItems");
  if (!panel || !percent || !summary || !items || !staffUser || staffUser.role !== "owner") return;
  try {
    const onboarding = await window.TableOrderCloud.getCurrentOnboarding();
    if (!onboarding?.eligible || onboarding.status === "completed") { panel.hidden = true; return; }
    const steps = [
      ["business_details", "Add business details"], ["venue_details", "Add venue details"], ["branding", "Upload branding"],
      ["menu", "Add your first menu item"], ["tables", "Create your first table"], ["qr_code", "Generate a QR code"], ["test_order", "Submit a test order"]
    ];
    const done = steps.filter(([key]) => ["completed", "skipped"].includes(onboarding.steps?.[key]?.status)).length;
    panel.hidden = false; percent.textContent = `${Math.round(done / steps.length * 100)}%`;
    summary.textContent = `${done} of ${steps.length} setup items saved. Continue where you left off.`;
    items.innerHTML = steps.map(([key, label]) => {
      const status = onboarding.steps?.[key]?.status || "not_started";
      const marker = status === "completed" ? "✓" : status === "skipped" ? "–" : "□";
      return `<a class="team-row" href="/onboarding#${encodeURIComponent(key)}"><span>${marker} ${escapeHtml(label)}</span><strong>${escapeHtml(status.replace(/_/g, " "))}</strong></a>`;
    }).join("");
  } catch { panel.hidden = true; }
}

async function loadPlanEntitlement() {
  const title = document.getElementById("planEntitlementTitle");
  const status = document.getElementById("planEntitlementStatus");
  const dates = document.getElementById("planEntitlementDates");
  const usage = document.getElementById("planEntitlementUsage");
  if (!title || !status || !dates || !usage || !staffUser) return;
  try {
    const entitlement = await window.TableOrderCloud.getRestaurantEntitlement(staffUser.restaurantId);
    if (entitlement.is_legacy) {
      title.textContent = "Legacy access";
      status.textContent = "Not restricted";
      status.className = "status-pill ready";
      dates.textContent = "This existing restaurant has no Trial entitlement and is not automatically restricted.";
      usage.innerHTML = "";
      return;
    }
    const expired = entitlement.status === "expired";
    title.textContent = entitlement.plan_name || entitlement.plan_code || "Plan";
    status.textContent = expired ? "Trial expired" : String(entitlement.status || "active").replace(/_/g, " ");
    status.className = `status-pill ${expired ? "warning" : "ready"}`;
    dates.textContent = expired
      ? "Your Trial has expired. Existing data remains available, but new live orders are blocked."
      : `Trial: ${formatEntitlementDate(entitlement.trial_start)} – ${formatEntitlementDate(entitlement.trial_end)} · ${entitlement.days_remaining ?? 0} day(s) remaining`;
    const labels = { organizations: "Organisation", venues: "Venues", tables: "Tables", menu_items: "Menu items", staff_accounts: "Staff accounts" };
    usage.innerHTML = Object.entries(labels).map(([key, label]) => {
      const maximum = entitlement.limits?.[`max_${key}`];
      return `<div class="team-row"><span>${escapeHtml(label)}</span><strong>${Number(entitlement.usage?.[key] || 0)}${maximum == null ? "" : ` / ${Number(maximum)}`}</strong></div>`;
    }).join("");
  } catch {
    title.textContent = "Plan unavailable";
    status.textContent = "Unavailable";
    status.className = "status-pill";
    dates.textContent = "We could not load plan details right now.";
    usage.innerHTML = "";
  }
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
        ({ item, quantity, lineId, options, notes, unitPrice }) => `
          <div class="cart-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <p class="muted">${optionSummary(options) || "No options"}</p>
              ${notes ? `<p class="muted">${escapeHtml(notes)}</p>` : ""}
              <p class="muted">${money(unitPrice)} each</p>
            </div>
            <div class="qty-controls" aria-label="Quantity controls">
              <button data-dec="${lineId}" ${orderSubmissionInProgress ? "disabled" : ""}>-</button>
              <span>${quantity}</span>
              <button data-inc="${lineId}" ${orderSubmissionInProgress ? "disabled" : ""}>+</button>
            </div>
          </div>
        `
      )
      .join("");
  }

  document.getElementById("cartSubtotal").textContent = money(cartSubtotal());
  document.getElementById("cartGst").textContent = money(cartTax());
  document.getElementById("cartTotal").textContent = money(cartTotal());
  document.getElementById("clearCart").disabled = orderSubmissionInProgress;
  document.getElementById("submitOrder").disabled = orderSubmissionInProgress || !profile.isOpen || !entries.length;
  document.getElementById("submitOrder").textContent = orderSubmissionInProgress
    ? "Sending order…"
    : profile.isOpen
      ? `Review order (${entries.reduce((sum, entry) => sum + entry.quantity, 0)})`
      : "Ordering Closed";
  renderMobileCustomerControls(entries);
  renderOrderConfirmation();
  list.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", () => {
      if (orderSubmissionInProgress) return;
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
      if (orderSubmissionInProgress) return;
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
              <details class="customer-order-history">
                <summary>Sent ${escapeHtml(order.createdLabel || timeLabel(order.createdAt))} · ${order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} items</summary>
                <ul>${order.items.map((item) => `<li><span>${escapeHtml(item.name)} × ${item.quantity}${optionSummary(item.options) ? ` · ${escapeHtml(optionSummary(item.options))}` : ""}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</span><strong>${money((Number(item.price) || 0) * Number(item.quantity || 0))}</strong></li>`).join("")}</ul>
              </details>
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
  if (orderSubmissionInProgress || !restaurant().isOpen) return { ok: false, error: "Ordering is not available right now." };
  if (lockedTableToken && !applyLockedTableSelection()) {
    await loadCloudDataIntoApp({ silent: true });
    if (!applyLockedTableSelection()) {
      const message = "This table link is not available. Please ask staff for a new QR code.";
      showOrderToast(message, "warning");
      return { ok: false, error: message };
    }
  }
  const entries = cartEntries();
  if (!entries.length) return { ok: false, error: "Your cart is empty." };
  lastConfirmedOrderId = "";

  const submittedLines = entries.map(({ lineId, quantity }) => ({ lineId, quantity }));
  const submittedNote = document.getElementById("orderNote").value.trim();
  // Keep the idempotency key with the unchanged cart after an ambiguous
  // network failure. Retrying must resolve the original server transaction,
  // not create a second kitchen ticket.
  const submissionFingerprint = JSON.stringify({
    tableId: selectedTableId,
    note: submittedNote,
    lines: entries.map(({ lineId, quantity, options, notes }) => ({ lineId, quantity, options, notes }))
  });
  const pendingSubmission = state.pendingOrderSubmission;
  const orderId = pendingSubmission?.fingerprint === submissionFingerprint && pendingSubmission?.id
    ? pendingSubmission.id
    : (crypto.randomUUID?.() || `ord_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  state.pendingOrderSubmission = { id: orderId, fingerprint: submissionFingerprint, createdAt: new Date().toISOString() };
  saveState();
  const total = cartTotal();
  const tax = cartTax();
  const subtotal = subtotalBeforeTax(total);
  const order = {
    id: orderId,
    number: state.orders.length + 1001,
    tableId: selectedTableId,
    status: "New",
    note: submittedNote,
    createdAt: new Date().toISOString(),
    createdLabel: nowLabel(),
    subtotal,
    tax,
    taxRate: restaurant().taxRate,
    total,
    cloudStatus: "syncing",
    customerTracked: true,
    items: entries.map(({ item, quantity, options, notes, unitPrice }) => ({
      itemId: item.id,
      menuItemCloudId: item.cloudId || null,
      name: item.name,
      price: unitPrice,
      basePrice: item.price,
      options,
      notes,
      quantity
    }))
  };

  orderSubmissionInProgress = true;
  renderCart();

  let result = { ok: false, error: "Order was not sent. Your cart is still ready to review." };
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
    delete state.pendingOrderSubmission;
    state.orders.unshift(order);
    submittedLines.forEach(({ lineId, quantity }) => {
      const line = state.cart.find((entry) => entry.id === lineId);
      if (line) line.quantity = Math.max(0, Number(line.quantity || 0) - quantity);
    });
    state.cart = state.cart.filter((line) => Number(line.quantity || 0) > 0);
    const orderNote = document.getElementById("orderNote");
    if (orderNote?.value.trim() === submittedNote) orderNote.value = "";
    lastConfirmedOrderId = order.id;
    closeReviewOrder(false);
    showOrderSuccessModal(order);
    showOrderToast("Order sent to the kitchen.", "success");
    result = { ok: true, order };
  } catch (error) {
    console.error("Cloud order delivery failed:", error);
    showOrderToast(`Order was not sent. Your cart is still ready to review: ${error.message}`, "warning");
    result = { ok: false, error: `Order was not sent. ${error.message}` };
  } finally {
    orderSubmissionInProgress = false;
  }

  saveState();
  renderCart();
  renderCustomerOrderStatus();
  syncCustomerOrderStatuses();
  return result;
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

function renderKitchen() {
  const board = document.getElementById("kitchenBoard");
  const activeOrders = state.orders.filter((order) => !["Served", "Paid", "Voided", "Cancelled"].includes(order.status));

  if (!activeOrders.length) {
    board.innerHTML = `<div class="empty-state">No active kitchen orders.</div>`;
    return;
  }

  board.innerHTML = activeOrders
    .map((order) => {
      const table = allTables().find((entry) => entry.id === order.tableId);
      const highlighted = highlightedKitchenOrderIds.has(kitchenOrderAlertKey(order));
      const canVoid = canUseKitchenVoidActions();
      const lines = order.items
        .map(
          (item) => `
            <div class="line-row kitchen-item-row ${item.status === "voided" ? "is-voided" : ""}" data-kitchen-item-row="${item.id}:${order.id}" tabindex="0">
              <div class="kitchen-item-copy">
                <strong>${item.quantity} × ${escapeHtml(item.name)}</strong>
                ${optionSummary(item.options) ? `<p class="kitchen-item-options">${escapeHtml(optionSummary(item.options))}</p>` : ""}
                ${item.note ? `<p class="kitchen-item-note">${escapeHtml(item.note)}</p>` : ""}
                ${item.status && item.status !== "voided" ? `<span class="kitchen-item-status">${escapeHtml(item.status)}</span>` : ""}
              </div>
              ${item.status === "voided" ? `<span class="status-pill warning">Voided</span>` : canVoid && item.id ? `<button class="kitchen-item-menu-button" type="button" data-item-actions="${item.id}:${order.id}" aria-label="More actions for ${escapeHtml(item.name)}" aria-haspopup="menu" title="More item actions">⋮</button>` : ""}
            </div>
          `
        )
        .join("");
      return `
        <article class="order-card ${highlighted ? "new-order-highlight" : ""}">
          <div class="order-card-header">
            <div>
              <p class="eyebrow">Order #${order.number}</p>
              ${order.isTestOrder ? `<span class="status-pill warning">Test</span>` : ""}
              <h3>${table?.name || "Table"}</h3>
              <p class="muted">${order.createdLabel}</p>
              <p class="cloud-order-state ${order.cloudStatus || "local"}">${order.cloudStatus === "synced" ? "Cloud synced" : order.cloudStatus === "syncing" ? "Cloud syncing" : "Local only"}</p>
            </div>
            <span class="status-pill ${order.status.toLowerCase()}">${order.status}</span>
          </div>
          <div>${lines}</div>
          ${order.note ? `<p class="muted"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ""}
          <div class="status-actions kitchen-status-actions">
            ${["Preparing", "Ready", "Served"].map((status) => `<button type="button" data-status="${order.id}:${status}" class="${order.status === status ? "active" : ""}" ${!canApplyKitchenStatus(order.status, status) ? "disabled" : ""} ${order.status === status ? "aria-current=\"step\"" : ""}>${status}</button>`).join("")}
            <div class="kitchen-order-menu-wrap">
              <button type="button" data-order-actions="${order.id}" aria-label="More actions for Order ${escapeHtml(order.number)}" aria-haspopup="menu">⋯ More</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  board.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [orderId, status] = button.dataset.status.split(":");
      updateOrderStatus(orderId, status);
    });
  });
  board.querySelectorAll("[data-order-actions]").forEach((button) => button.addEventListener("click", () => openKitchenOrderMenu(button)));
  board.querySelectorAll("[data-item-actions]").forEach((button) => button.addEventListener("click", () => openKitchenItemMenu(button)));
  enableKitchenItemLongPress(board);
}

function openReviewOrder() {
  const entries = cartEntries();
  if (!restaurant().isOpen || !entries.length) return;
  reviewOrderError = "";
  reviewOrderReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const modal = document.getElementById("reviewOrderModal");
  modal.onclick = (event) => {
    if (event.target === modal && !reviewOrderConfirmPending && !orderSubmissionInProgress) closeReviewOrder();
  };
  document.body.classList.add("review-order-open");
  document.documentElement.classList.add("review-order-open");
  document.querySelectorAll("body > .app-header, body > main, body > .mobile-bottom-nav, body > .mobile-cart-dock").forEach((element) => { element.inert = true; });
  renderReviewOrder();
  modal.classList.remove("hidden");
  queueMicrotask(() => document.getElementById("reviewOrderContent")?.focus());
}

function closeReviewOrder(restoreFocus = true) {
  const modal = document.getElementById("reviewOrderModal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  document.body.classList.remove("review-order-open");
  document.documentElement.classList.remove("review-order-open");
  document.querySelectorAll("body > .app-header, body > main, body > .mobile-bottom-nav, body > .mobile-cart-dock").forEach((element) => { element.inert = false; });
  if (restoreFocus) reviewOrderReturnFocus?.focus();
  reviewOrderReturnFocus = null;
}

function changeReviewOrderQuantity(lineId, change) {
  if (reviewOrderConfirmPending || orderSubmissionInProgress) return;
  normalizeCart();
  const line = state.cart.find((entry) => entry.id === lineId);
  if (!line) return;
  line.quantity = Math.max(0, Number(line.quantity || 0) + change);
  state.cart = state.cart.filter((entry) => entry.quantity > 0);
  lastConfirmedOrderId = "";
  saveState();
  renderCart();
  reviewOrderError = "";
  renderReviewOrder();
}

function restoreReviewOrderControlFocus(attribute, lineId) {
  queueMicrotask(() => {
    const matchingControl = [...document.querySelectorAll(`#reviewOrderModal [${attribute}]`)]
      .find((control) => control.getAttribute(attribute) === lineId);
    const fallback = document.querySelector("#reviewOrderModal [data-review-remove], #reviewOrderModal #reviewOrderNote, #reviewOrderModal #editReviewOrder")
      || document.getElementById("reviewOrderContent");
    (matchingControl || fallback)?.focus();
  });
}

function renderReviewOrder() {
  const panel = document.getElementById("reviewOrderContent");
  const entries = cartEntries();
  if (!panel) return;
  const note = document.getElementById("orderNote")?.value || "";
  const table = currentTable();
  const itemCount = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const busy = reviewOrderConfirmPending || orderSubmissionInProgress;
  panel.innerHTML = `
    <div class="review-order-header">
      <div>
        <p class="eyebrow">${escapeHtml(table?.name || "Your table")} <span aria-hidden="true">/</span> ${itemCount} item${itemCount === 1 ? "" : "s"}</p>
        <h2 id="reviewOrderTitle">Review order</h2>
        <p class="muted">Make any last changes before sending it to the kitchen.</p>
      </div>
      <button class="icon-button" id="closeReviewOrder" type="button" aria-label="Close review order" ${busy ? "disabled" : ""}>×</button>
    </div>
    <div class="review-order-lines">
      ${entries.length ? entries.map(({ item, quantity, lineId, options, notes, unitPrice }) => {
        const photoUrl = normalizePhotoUrl(item.photoData);
        const extras = Math.max(0, unitPrice - Number(item.price || 0));
        return `
        <article class="review-order-line">
          ${photoUrl ? `<img class="review-order-image" src="${escapeHtml(photoUrl)}" alt="" onerror="this.remove()" />` : ""}
          <div class="review-order-item-copy"><strong>${escapeHtml(item.name)}</strong>${optionSummary(options) ? `<p class="muted">${escapeHtml(optionSummary(options))}</p>` : ""}${extras ? `<small class="review-order-extra">Includes ${money(extras)} chargeable extras</small>` : ""}<small>${money(unitPrice)} each</small></div>
          <div class="review-quantity" aria-label="Quantity for ${escapeHtml(item.name)}">
            <button type="button" data-review-dec="${escapeHtml(lineId)}" aria-label="Remove one ${escapeHtml(item.name)}" ${busy ? "disabled" : ""}>−</button>
            <strong aria-live="polite">${quantity}</strong>
            <button type="button" data-review-inc="${escapeHtml(lineId)}" aria-label="Add one ${escapeHtml(item.name)}" ${busy ? "disabled" : ""}>+</button>
          </div>
          <strong class="review-order-line-price">${money(unitPrice * quantity)}</strong>
          <label class="field review-item-note"><span>Item instructions</span><input data-review-note="${escapeHtml(lineId)}" maxlength="500" value="${escapeHtml(notes)}" placeholder="e.g. no coriander" ${busy ? "disabled" : ""} /></label>
          <button class="review-remove" type="button" data-review-remove="${escapeHtml(lineId)}" ${busy ? "disabled" : ""}>Remove</button>
        </article>`;
      }).join("") : `<div class="review-order-empty"><strong>Your cart is empty</strong><p>Add a dish from the menu when you are ready.</p></div>`}
    </div>
    ${entries.length ? `<label class="field review-order-note"><span>Order note</span><textarea id="reviewOrderNote" rows="3" placeholder="Less spicy, no coriander, allergy note" ${busy ? "disabled" : ""}>${escapeHtml(note)}</textarea></label>` : ""}
    ${reviewOrderError ? `<p class="review-order-error" role="alert">${escapeHtml(reviewOrderError)} Your items and notes have been kept.</p>` : ""}
    <div class="review-order-dock">
      <div class="review-order-totals"><div><span>Subtotal</span><strong>${money(cartSubtotal())}</strong></div><div><span>GST included</span><strong>${money(cartTax())}</strong></div><div class="review-order-total"><span>Total</span><strong>${money(cartTotal())}</strong></div></div>
      <div class="review-order-actions"><button class="ghost-button" id="editReviewOrder" type="button" ${busy ? "disabled" : ""}>Continue ordering</button><button class="submit-button" id="confirmReviewOrder" type="button" ${busy || !entries.length ? "disabled" : ""}>${busy ? "Sending order…" : `Confirm order · ${money(cartTotal())}`}</button></div>
    </div>`;
  panel.setAttribute("aria-busy", String(busy));
  document.getElementById("closeReviewOrder").addEventListener("click", closeReviewOrder);
  document.getElementById("editReviewOrder").addEventListener("click", () => {
    closeReviewOrder();
    document.getElementById("categoryRow")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelectorAll("[data-review-inc]").forEach((button) => button.addEventListener("click", () => {
    const lineId = button.dataset.reviewInc;
    changeReviewOrderQuantity(lineId, 1);
    restoreReviewOrderControlFocus("data-review-inc", lineId);
  }));
  document.querySelectorAll("[data-review-dec]").forEach((button) => button.addEventListener("click", () => {
    const lineId = button.dataset.reviewDec;
    changeReviewOrderQuantity(lineId, -1);
    restoreReviewOrderControlFocus("data-review-dec", lineId);
  }));
  document.querySelectorAll("[data-review-remove]").forEach((button) => button.addEventListener("click", () => {
    const line = state.cart.find((entry) => entry.id === button.dataset.reviewRemove);
    if (line) {
      changeReviewOrderQuantity(line.id, -Number(line.quantity || 0));
      restoreReviewOrderControlFocus("data-review-remove", line.id);
    }
  }));
  document.querySelectorAll("[data-review-note]").forEach((input) => input.addEventListener("input", (event) => {
    const line = state.cart.find((entry) => entry.id === event.target.dataset.reviewNote);
    if (!line) return;
    line.notes = event.target.value;
    reviewOrderError = "";
    saveState();
  }));
  document.getElementById("reviewOrderNote")?.addEventListener("input", (event) => {
    const orderNote = document.getElementById("orderNote");
    if (orderNote) orderNote.value = event.target.value;
    reviewOrderError = "";
  });
  document.getElementById("confirmReviewOrder").addEventListener("click", async () => {
    if (reviewOrderConfirmPending || orderSubmissionInProgress || !cartEntries().length) return;
    const orderNote = document.getElementById("orderNote");
    if (orderNote) orderNote.value = document.getElementById("reviewOrderNote")?.value.trim() || "";
    reviewOrderError = "";
    reviewOrderConfirmPending = true;
    const submission = submitOrder();
    renderReviewOrder();
    let result;
    try {
      result = await submission;
    } catch (error) {
      result = { ok: false, error: `Order was not sent. ${error.message}` };
    } finally {
      reviewOrderConfirmPending = false;
    }
    if (!result?.ok && !document.getElementById("reviewOrderModal").classList.contains("hidden")) {
      reviewOrderError = result?.error || "Order was not sent. Please try again.";
      renderReviewOrder();
    }
  });
}

document.addEventListener("keydown", (event) => {
  const modalOpen = !document.getElementById("reviewOrderModal")?.classList.contains("hidden");
  if (!modalOpen) return;
  if (event.key === "Escape" && !reviewOrderConfirmPending && !orderSubmissionInProgress) {
    event.preventDefault();
    closeReviewOrder();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...document.querySelectorAll("#reviewOrderModal button:not([disabled]), #reviewOrderModal input:not([disabled]), #reviewOrderModal textarea:not([disabled]), #reviewOrderModal [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  const dialog = document.getElementById("reviewOrderContent");
  if (event.shiftKey && [dialog, first].includes(document.activeElement)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && [dialog, last].includes(document.activeElement)) { event.preventDefault(); first.focus(); }
});

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
      selectedInvoiceOrderId = "";
      frontdeskMode = "summary";
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
  const payableOrders = openOrdersForTable(table.id);
  const orders = checkoutOrdersForTable(table.id);
  const lines = groupCheckoutLines(orders);
  const totalCents = orders.reduce((sum, order) => sum + orderTotalCents(order), 0);
  const taxCents = taxIncludedCents(totalCents);
  const subtotalCents = subtotalBeforeTaxCents(totalCents);
  const paymentRecords = allPaymentsForOrders(orders);
  const payments = paymentRecords.filter((payment) => payment.status !== "voided");
  const paidCents = payments.reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const status = paymentStatus(totalCents, paidCents);

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
      <span class="status-pill ${status === "Paid" ? "ready" : status === "Partially Paid" ? "warning" : ""}">${status === "Paid" ? "PAID" : status}</span>
    </div>
    ${payableOrders.length > 1 ? `<section class="payment-history"><p class="eyebrow">Open orders</p>${payableOrders.map((order) => `<button class="ghost-button ${order.id === orders[0]?.id ? "active" : ""}" data-select-invoice-order="${order.id}">Order #${escapeHtml(order.number)} · ${moneyCents(orderTotalCents(order))}</button>`).join("")}</section>` : ""}
    <div>
      ${lines.map((item) => `<div class="line-row checkout-item-row"><span>${item.quantity} x ${escapeHtml(item.name)}<p class="muted">${item.optionsLabel || "No options"}${item.orderNumbers.length ? ` · From order${item.orderNumbers.length === 1 ? "" : "s"} ${item.orderNumbers.map((number) => `#${number}`).join(", ")}` : ""}</p></span><strong>${moneyCents(item.totalCents)}</strong></div>`).join("")}
    </div>
    <div class="checkout-summary">
      <div><span>Subtotal ex. GST</span><strong>${moneyCents(subtotalCents)}</strong></div>
      <div><span>GST</span><strong>${moneyCents(taxCents)}</strong></div>
      <div><span>Order total</span><strong>${moneyCents(totalCents)}</strong></div>
      <div><span>Amount paid</span><strong>${moneyCents(paidCents)}</strong></div>
      <div class="checkout-balance"><span>Remaining</span><strong>${moneyCents(remainingCents)}</strong></div>
    </div>
    <div class="invoice-actions ${status === "Paid" ? "is-paid" : ""}">
      ${remainingCents ? `<button class="primary-button checkout-pay-button" id="recordFullPayment">${paidCents ? "Pay remaining" : "Pay"} ${moneyCents(remainingCents)}</button><div class="checkout-secondary-actions"><button class="ghost-button" id="splitBill">Split bill</button><button class="ghost-button" id="printInvoice">Print bill</button></div>` : `<div class="paid-actions"><button class="ghost-button" id="printInvoice">Print receipt</button><button class="ghost-button" id="viewPayments">View payments</button></div>`}
    </div>
    <section class="payment-history"><p class="eyebrow">Order activity</p>${orders.map((order) => `<div class="line-row"><span><strong>Order #${escapeHtml(order.number)}</strong><p class="muted">${["Paid", "Served"].includes(order.status) ? "Locked — history and receipt only" : order.status === "Voided" ? "Voided — read only" : "Open"}</p></span><span><button class="ghost-button" data-order-activity="${order.id}">View activity</button>${!["Paid", "Served", "Voided", "Cancelled"].includes(order.status) ? `<button class="ghost-button danger-action" data-invoice-void="${order.id}">Void order</button>` : ""}</span></div>`).join("")}</section>
    ${frontdeskMode === "split" ? renderSplitCheckout(orders, totalCents, paidCents) : ""}
    ${paymentRecords.length ? `<section class="payment-history" id="paymentHistory"><p class="eyebrow">Payments</p>${paymentRecords.map((payment) => `<div class="line-row"><span><strong>${moneyCents(payment.amountCents)} · ${escapeHtml(payment.method)}</strong><p class="muted">${new Date(payment.paidAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}${payment.staffName ? ` · ${escapeHtml(payment.staffName)}` : ""} · Completed</p></span><span class="status-pill ready">Completed</span></div>`).join("")}</section>` : ""}
  `;

  document.getElementById("printInvoice").addEventListener("click", () => printInvoice(table.id));
  panel.querySelectorAll("[data-select-invoice-order]").forEach((button) => button.addEventListener("click", () => { selectedInvoiceOrderId = button.dataset.selectInvoiceOrder; frontdeskMode = "summary"; renderInvoice(); }));
  document.getElementById("splitBill")?.addEventListener("click", () => { frontdeskMode = "split"; ensureItemBills(orders); renderInvoice(); });
  document.getElementById("recordFullPayment")?.addEventListener("click", () => openPaymentModal(orders, { amountCents: remainingCents, label: "Table balance" }));
  document.getElementById("viewPayments")?.addEventListener("click", () => document.getElementById("paymentHistory")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  bindSplitCheckout(orders, totalCents, paidCents);
  panel.querySelectorAll("[data-order-activity]").forEach((button) => button.addEventListener("click", () => showOrderActivity(button.dataset.orderActivity)));
  panel.querySelectorAll("[data-invoice-void]").forEach((button) => button.addEventListener("click", () => voidOrderWithReason(button.dataset.invoiceVoid)));
}

function allPaymentsForOrders(orders) {
  const ids = new Set(orders.map((order) => order.cloudId || order.id));
  return (state.payments || []).filter((payment) => ids.has(payment.orderId));
}

function groupCheckoutLines(orders) {
  const groups = new Map();
  orders.forEach((order) => (order.items || []).forEach((item, index) => {
    const optionsLabel = optionSummary(item.options) || "No options";
    const itemIdentity = item.menuItemCloudId || item.itemId || item.id || item.name;
    const key = `${itemIdentity}|${toCents(item.price)}|${JSON.stringify(item.options || [])}`;
    const current = groups.get(key) || { name: item.name, quantity: 0, totalCents: 0, optionsLabel, orderNumbers: [], itemRefs: [] };
    current.quantity += Number(item.quantity) || 0;
    current.totalCents += toCents(item.price) * (Number(item.quantity) || 0);
    if (!current.orderNumbers.includes(order.number)) current.orderNumbers.push(order.number);
    current.itemRefs.push({ orderId: order.cloudId || order.id, itemId: item.id || item.itemId || index });
    groups.set(key, current);
  }));
  return [...groups.values()].map((group) => ({ ...group, orderNumbers: group.orderNumbers.sort((a, b) => Number(a) - Number(b)) }));
}

function checkoutLines(orders) {
  return orders.flatMap((order) => order.items.map((item, index) => ({ ...item, order, key: `${order.cloudId || order.id}:${item.id || item.itemId || index}` })));
}

function ensureItemBills(orders) {
  const lines = checkoutLines(orders);
  if (!frontdeskItemBills.length) frontdeskItemBills = [1, 2].map((number) => ({ id: crypto.randomUUID(), name: `Bill ${number}`, allocations: {} }));
  const keys = new Set(lines.map((line) => line.key));
  frontdeskItemBills.forEach((bill) => Object.keys(bill.allocations).forEach((key) => { if (!keys.has(key)) delete bill.allocations[key]; }));
}

function itemBillCents(bill, lines, totalCents) {
  const raw = lines.reduce((sum, line) => sum + toCents(line.price) * Number(bill.allocations[line.key] || 0), 0);
  const allRaw = frontdeskItemBills.reduce((sum, entry) => sum + lines.reduce((lineSum, line) => lineSum + toCents(line.price) * Number(entry.allocations[line.key] || 0), 0), 0);
  // Allocate the GST rounding remainder to the first bill once every item is assigned.
  return raw + (bill === frontdeskItemBills[0] && allRaw === lines.reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0) ? totalCents - allRaw : 0);
}

function allocatedQuantityForLine(line) {
  return frontdeskItemBills.reduce((sum, bill) => sum + Number(bill.allocations[line.key] || 0), 0);
}

function remainingQuantityForLine(line) {
  return Math.max(0, Number(line.quantity) - allocatedQuantityForLine(line));
}

function renderSplitCheckout(orders, totalCents, paidCents) {
  const lines = checkoutLines(orders);
  const allocatedCents = frontdeskSplitMode === "item" ? frontdeskItemBills.reduce((sum, bill) => sum + itemBillCents(bill, lines, totalCents), 0) : totalCents;
  const unpaidCents = Math.max(0, totalCents - paidCents);
  const tab = (id, label) => `<button type="button" class="split-tab ${frontdeskSplitMode === id ? "active" : ""}" data-split-mode="${id}">${label}</button>`;
  let body = "";
  if (frontdeskSplitMode === "equal") {
    const shares = splitEvenly(unpaidCents, frontdeskPeople);
    body = `<div class="split-config"><label class="field"><span>People</span><input id="splitPeople" type="number" min="2" max="20" value="${frontdeskPeople}"></label></div><div class="split-bill-grid">${shares.map((amount, index) => splitBillCard({ id: `equal-${index}`, name: `Bill ${index + 1}`, totalCents: amount }, orders)).join("")}</div>`;
  } else if (frontdeskSplitMode === "item") {
    ensureItemBills(orders);
    const unallocated = lines.reduce((sum, line) => sum + remainingQuantityForLine(line), 0);
    body = `<div class="split-item-workspace"><section class="split-items"><div class="panel-title"><div><p class="eyebrow">Tap to allocate</p><h3>${unallocated ? `${unallocated} item${unallocated === 1 ? "" : "s"} remaining` : "All items allocated"}</h3></div><button class="ghost-button" id="addSplitBill" type="button">+ Add bill</button></div>${lines.map((line) => { const allocated = allocatedQuantityForLine(line); const remaining = remainingQuantityForLine(line); const itemKey = encodeURIComponent(line.key); return `<article class="split-item-card"><div class="split-item-heading"><div><strong>${escapeHtml(line.name)}</strong><small>${line.quantity} × ${money(line.price)} · ${allocated} allocated · Remaining ${remaining}</small></div><button class="ghost-button assign-all-button" type="button" data-assign-all="${itemKey}" ${remaining ? "" : "disabled"}>Assign all to ${escapeHtml(frontdeskItemBills[0]?.name || "Bill 1")}</button></div><div class="allocation-bill-buttons">${frontdeskItemBills.map((bill) => `<button type="button" class="bill-tap-button" data-assign-unit="${itemKey}" data-bill-id="${bill.id}" ${remaining ? "" : "disabled"}><span>${escapeHtml(bill.name)}</span><strong>${bill.allocations[line.key] || 0}</strong></button>`).join("")}</div>${allocated ? `<div class="allocation-summary">${frontdeskItemBills.filter((bill) => Number(bill.allocations[line.key] || 0) > 0).map((bill) => `<span>${escapeHtml(bill.name)}: ${bill.allocations[line.key]} <button type="button" data-unassign-unit="${itemKey}" data-bill-id="${bill.id}" aria-label="Undo one ${escapeHtml(line.name)} from ${escapeHtml(bill.name)}">Undo</button></span>`).join("")}</div>` : ""}</article>`; }).join("")}<button class="primary-button confirm-split-button" id="confirmItemSplit" type="button" ${unallocated === 0 ? "" : "disabled"}>${itemSplitConfirmed ? "Split confirmed" : "Confirm split"}</button></section><div class="split-bill-grid">${frontdeskItemBills.map((bill) => splitBillCard({ ...bill, totalCents: itemBillCents(bill, lines, totalCents) }, orders, unallocated === 0 && itemSplitConfirmed)).join("")}</div></div>`;
  } else {
    body = `<form class="custom-payment-form" id="customPaymentForm"><label class="field"><span>Payment label</span><input id="customPaymentLabel" maxlength="60" placeholder="e.g. Seat 2"></label><label class="field"><span>Amount</span><input id="customPaymentAmount" type="number" min="0.01" max="${fromCents(unpaidCents).toFixed(2)}" step="0.01" required></label><label class="field"><span>Method</span><select id="customPaymentMethod"><option>Cash</option><option>Card</option><option>Other</option></select></label><button class="primary-button" type="submit">Record payment</button></form>`;
  }
  return `<section class="split-checkout"><div class="split-checkout-header"><div><p class="eyebrow">Split bill</p><h3>Allocate and record payment</h3></div><button type="button" class="ghost-button" id="closeSplit">Close</button></div><div class="split-totals"><span>Original ${moneyCents(totalCents)}</span><span>Allocated ${moneyCents(allocatedCents)}</span><span>Paid ${moneyCents(paidCents)}</span><span>Remaining ${moneyCents(unpaidCents)}</span></div><div class="split-tabs">${tab("equal", "Split equally")}${tab("item", "By item")}${tab("custom", "Custom amount")}</div>${body}</section>`;
}

function splitBillCard(bill, orders, canPay = true) {
  const paid = 0;
  return `<article class="split-bill-card"><label class="split-bill-name"><span>Bill name</span><input data-bill-name="${bill.id}" value="${escapeHtml(bill.name)}"></label><strong>${moneyCents(bill.totalCents)}</strong><p class="muted">GST ${moneyCents(Math.round(bill.totalCents - bill.totalCents / (1 + (Number(restaurant().taxRate) || 10) / 100)))}</p><span class="status-pill">${paymentStatus(bill.totalCents, paid)}</span><div class="split-bill-actions"><select data-bill-method="${bill.id}"><option>Card</option><option>Cash</option><option>Other</option></select><button class="primary-button" data-pay-bill="${bill.id}" ${canPay && bill.totalCents > 0 ? "" : "disabled"}>Pay</button><button class="ghost-button" data-print-bill="${bill.id}">Print</button><button class="ghost-button" data-download-bill="${bill.id}">Download PDF</button></div></article>`;
}

function bindSplitCheckout(orders, totalCents, paidCents) {
  document.querySelectorAll("[data-split-mode]").forEach((button) => button.addEventListener("click", () => { frontdeskSplitMode = button.dataset.splitMode; renderInvoice(); }));
  document.getElementById("closeSplit")?.addEventListener("click", () => { frontdeskMode = "summary"; renderInvoice(); });
  document.getElementById("splitPeople")?.addEventListener("input", (event) => { frontdeskPeople = Math.max(2, Math.min(20, Number(event.target.value) || 2)); renderInvoice(); });
  document.getElementById("addSplitBill")?.addEventListener("click", () => { frontdeskItemBills.push({ id: crypto.randomUUID(), name: `Bill ${frontdeskItemBills.length + 1}`, allocations: {} }); itemSplitConfirmed = false; renderInvoice(); });
  document.querySelectorAll("[data-assign-unit]").forEach((button) => button.addEventListener("click", () => { const key = decodeURIComponent(button.dataset.assignUnit); const bill = frontdeskItemBills.find((entry) => entry.id === button.dataset.billId); const line = checkoutLines(orders).find((entry) => entry.key === key); if (!bill || !line || remainingQuantityForLine(line) <= 0) return; bill.allocations[key] = Number(bill.allocations[key] || 0) + 1; itemSplitConfirmed = false; renderInvoice(); }));
  document.querySelectorAll("[data-unassign-unit]").forEach((button) => button.addEventListener("click", () => { const key = decodeURIComponent(button.dataset.unassignUnit); const bill = frontdeskItemBills.find((entry) => entry.id === button.dataset.billId); if (!bill || Number(bill.allocations[key] || 0) <= 0) return; bill.allocations[key] -= 1; itemSplitConfirmed = false; renderInvoice(); }));
  document.querySelectorAll("[data-assign-all]").forEach((button) => button.addEventListener("click", () => { const key = decodeURIComponent(button.dataset.assignAll); const line = checkoutLines(orders).find((entry) => entry.key === key); const bill = frontdeskItemBills[0]; if (!line || !bill) return; bill.allocations[key] = Number(bill.allocations[key] || 0) + remainingQuantityForLine(line); itemSplitConfirmed = false; renderInvoice(); }));
  document.getElementById("confirmItemSplit")?.addEventListener("click", () => { itemSplitConfirmed = true; renderInvoice(); });
  document.querySelectorAll("[data-bill-name]").forEach((input) => input.addEventListener("change", () => { const bill = frontdeskItemBills.find((entry) => entry.id === input.dataset.billName); if (bill) bill.name = input.value.trim() || bill.name; }));
  document.querySelectorAll("[data-pay-bill]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.payBill; const amount = frontdeskSplitMode === "equal" ? splitEvenly(Math.max(0, totalCents - paidCents), frontdeskPeople)[Number(id.split("-")[1])] : itemBillCents(frontdeskItemBills.find((bill) => bill.id === id), checkoutLines(orders), totalCents); const name = frontdeskSplitMode === "equal" ? `Bill ${Number(id.split("-")[1]) + 1}` : frontdeskItemBills.find((bill) => bill.id === id).name; openPaymentModal(orders, { amountCents: amount, label: name, method: document.querySelector(`[data-bill-method="${id}"]`).value }); }));
  document.querySelectorAll("[data-print-bill]").forEach((button) => button.addEventListener("click", () => printSplitBill(button.dataset.printBill, orders, totalCents)));
  document.querySelectorAll("[data-download-bill]").forEach((button) => button.addEventListener("click", () => printSplitBill(button.dataset.downloadBill, orders, totalCents)));
  document.getElementById("customPaymentForm")?.addEventListener("submit", (event) => { event.preventDefault(); const amount = toCents(document.getElementById("customPaymentAmount").value); openPaymentModal(orders, { amountCents: amount, label: document.getElementById("customPaymentLabel").value.trim() || "Custom payment", method: document.getElementById("customPaymentMethod").value }); });
}

function paymentMethodLabel(method) {
  return method === "Card" ? "Card / EFTPOS" : method;
}

function openPaymentModal(orders, prefill = {}) {
  if (orders.length !== 1 || !isPayableOrder(orders[0])) return showOrderToast("Select one open order before recording payment.", "warning");
  const totalCents = orderTotalCents(orders[0]);
  const paidCents = activePaymentsForOrders(orders).reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  paymentModalState = {
    orders, totalCents, paidCents, remainingCents,
    amountCents: Math.min(Math.max(0, Number(prefill.amountCents) || remainingCents), remainingCents),
    method: prefill.method || "Card", label: prefill.label || "Table balance", cashReceivedCents: 0,
    note: "", reference: "", submitting: false, idempotencyKey: crypto.randomUUID(), completed: null
  };
  paymentModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.classList.add("payment-modal-open");
  document.documentElement.classList.add("payment-modal-open");
  document.querySelectorAll("body > .app-header, body > main, body > .mobile-bottom-nav, body > .mobile-cart-dock").forEach((element) => { element.inert = true; });
  const modal = document.getElementById("paymentModal");
  modal.onclick = (event) => { if (event.target === modal) closePaymentModal(); };
  renderPaymentModal();
  modal.classList.remove("hidden");
}

function closePaymentModal() {
  if (paymentModalState?.submitting) return;
  document.getElementById("paymentModal").classList.add("hidden");
  document.body.classList.remove("payment-modal-open");
  document.documentElement.classList.remove("payment-modal-open");
  document.querySelectorAll("body > .app-header, body > main, body > .mobile-bottom-nav, body > .mobile-cart-dock").forEach((element) => { element.inert = false; });
  paymentModalState = null;
  paymentModalReturnFocus?.focus();
  paymentModalReturnFocus = null;
}

function handlePaymentModalKeys(event) {
  if (!paymentModalState) return;
  if (event.key === "Escape") { event.preventDefault(); closePaymentModal(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...document.querySelectorAll("#paymentModal button:not([disabled]), #paymentModal input:not([disabled]), #paymentModal [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

document.addEventListener("keydown", handlePaymentModalKeys);

function paymentQuickAmounts(amountCents) {
  const roundUp = (increment) => Math.ceil(amountCents / increment) * increment;
  const common = [5000, 10000].filter((value) => value >= amountCents).map((value) => ({ value, label: moneyCents(value) }));
  return [
    { value: amountCents, label: "Exact" },
    { value: roundUp(500), label: "Next $5" },
    { value: roundUp(1000), label: "Next $10" },
    ...common
  ].filter((entry, index, entries) => entries.findIndex((other) => other.value === entry.value) === index);
}

function renderPaymentModal() {
  const modal = document.getElementById("paymentModal");
  const panel = document.getElementById("paymentModalContent");
  const payment = paymentModalState;
  if (!payment) return;
  if (payment.completed) {
    panel.innerHTML = `<div class="payment-sheet-handle" aria-hidden="true"></div><div class="payment-modal-header"><div><p class="eyebrow">Front desk checkout</p><h2 id="paymentModalTitle">Payment complete</h2></div><button class="icon-button" id="closeCompletedPayment" type="button" aria-label="Close payment dialog">×</button></div><div class="payment-modal-scroll"><div class="payment-complete"><span class="payment-complete-mark">✓</span><p class="eyebrow">Payment complete</p><h3>${moneyCents(payment.completed.amountCents)} recorded</h3><p>${escapeHtml(paymentMethodLabel(payment.completed.method))}${payment.completed.cashReceivedCents ? ` · Received ${moneyCents(payment.completed.cashReceivedCents)} · Change ${moneyCents(payment.completed.changeGivenCents)}` : ""}</p></div></div><div class="payment-modal-actions"><button class="ghost-button" id="closeCompletedPaymentFooter" type="button">Done</button><button class="primary-button" id="printCompletedReceipt" type="button">Print receipt</button></div>`;
    document.getElementById("printCompletedReceipt").addEventListener("click", () => printInvoice(selectedFrontTableId));
    document.getElementById("closeCompletedPayment").addEventListener("click", closePaymentModal);
    document.getElementById("closeCompletedPaymentFooter").addEventListener("click", closePaymentModal);
    queueMicrotask(() => document.getElementById("printCompletedReceipt")?.focus());
    return;
  }
  const changeCents = Math.max(0, payment.cashReceivedCents - payment.amountCents);
  const cashSection = payment.method === "Cash" ? `<div class="payment-detail"><label class="field"><span>Cash received</span><input id="paymentCashReceived" type="number" inputmode="decimal" min="0" step="0.01" value="${payment.cashReceivedCents ? fromCents(payment.cashReceivedCents).toFixed(2) : ""}" placeholder="0.00"></label><div class="cash-quick-actions">${paymentQuickAmounts(payment.amountCents).map((entry) => `<button class="ghost-button" type="button" data-cash-quick="${entry.value}">${entry.label}</button>`).join("")}</div><div class="payment-change"><span>Change to give</span><strong>${moneyCents(changeCents)}</strong></div></div>` : payment.method === "Card" ? `<div class="payment-detail payment-terminal-note"><strong>Confirm only after the external EFTPOS terminal approves the transaction.</strong><label class="field"><span>Terminal receipt / reference (optional)</span><input id="paymentReference" maxlength="80" value="${escapeHtml(payment.reference)}" placeholder="e.g. EFTPOS receipt number"></label></div>` : `<div class="payment-detail"><label class="field"><span>Payment note</span><input id="paymentNote" maxlength="200" value="${escapeHtml(payment.note)}" required placeholder="e.g. voucher, bank transfer, delivery platform"></label><p class="muted">A note is required for other payment types.</p></div>`;
  panel.innerHTML = `<div class="payment-sheet-handle" aria-hidden="true"></div><div class="payment-modal-header"><div><p class="eyebrow">Front desk checkout</p><h2 id="paymentModalTitle">Confirm payment</h2><p class="muted">${escapeHtml(payment.label)}</p></div><button class="icon-button" id="closePaymentModal" type="button" aria-label="Close payment dialog">×</button></div><div class="payment-modal-scroll"><div class="payment-totals"><div><span>Amount due</span><strong>${moneyCents(payment.totalCents)}</strong></div><div><span>Already paid</span><strong>${moneyCents(payment.paidCents)}</strong></div><div class="remaining"><span>Remaining</span><strong>${moneyCents(payment.remainingCents)}</strong></div></div><label class="field payment-amount-field"><span>Payment amount for this transaction</span><input id="paymentAmount" type="number" inputmode="decimal" min="0.01" max="${fromCents(payment.remainingCents).toFixed(2)}" step="0.01" value="${fromCents(payment.amountCents).toFixed(2)}" required></label><div class="payment-methods" role="radiogroup" aria-label="Payment method">${["Cash", "Card", "Other"].map((method) => `<button type="button" class="payment-method ${payment.method === method ? "active" : ""}" data-payment-method="${method}" role="radio" aria-checked="${payment.method === method}">${escapeHtml(paymentMethodLabel(method))}</button>`).join("")}</div>${cashSection}<p class="payment-error hidden" id="paymentModalError" role="alert"></p></div><div class="payment-modal-actions"><button class="ghost-button" id="cancelPayment" type="button">Cancel</button><button class="primary-button" id="confirmPayment" type="button">Confirm ${payment.method === "Card" ? "card payment" : payment.method === "Cash" ? "cash payment" : "payment"}</button></div>`;
  document.getElementById("closePaymentModal").addEventListener("click", closePaymentModal);
  document.getElementById("cancelPayment").addEventListener("click", closePaymentModal);
  document.getElementById("paymentAmount").addEventListener("input", (event) => { payment.amountCents = toCents(event.target.value); });
  document.querySelectorAll("[data-payment-method]").forEach((button) => button.addEventListener("click", () => { payment.method = button.dataset.paymentMethod; renderPaymentModal(); }));
  document.getElementById("paymentCashReceived")?.addEventListener("input", (event) => { payment.cashReceivedCents = toCents(event.target.value); const change = document.querySelector(".payment-change strong"); if (change) change.textContent = moneyCents(Math.max(0, payment.cashReceivedCents - payment.amountCents)); });
  document.querySelectorAll("[data-cash-quick]").forEach((button) => button.addEventListener("click", () => { payment.cashReceivedCents = Number(button.dataset.cashQuick); renderPaymentModal(); }));
  document.getElementById("paymentReference")?.addEventListener("input", (event) => { payment.reference = event.target.value; });
  document.getElementById("paymentNote")?.addEventListener("input", (event) => { payment.note = event.target.value; });
  document.getElementById("confirmPayment").addEventListener("click", submitPaymentModal);
  queueMicrotask(() => document.getElementById("paymentAmount")?.focus());
}

async function submitPaymentModal() {
  const payment = paymentModalState;
  if (!payment || payment.submitting) return;
  const error = document.getElementById("paymentModalError");
  const amountCents = payment.amountCents;
  if (amountCents <= 0 || amountCents > payment.remainingCents) { error.textContent = "Enter a payment amount between $0.01 and the remaining balance."; error.classList.remove("hidden"); return; }
  if (payment.method === "Cash" && payment.cashReceivedCents < amountCents) { error.textContent = "Cash received must cover this payment amount."; error.classList.remove("hidden"); return; }
  if (payment.method === "Other" && !payment.note.trim()) { error.textContent = "Add a note for this payment type."; error.classList.remove("hidden"); return; }
  payment.submitting = true;
  const button = document.getElementById("confirmPayment");
  button.disabled = true; button.textContent = "Processing…";
  const details = { cashReceivedCents: payment.method === "Cash" ? payment.cashReceivedCents : null, changeGivenCents: payment.method === "Cash" ? payment.cashReceivedCents - amountCents : null, reference: payment.reference.trim(), note: payment.note.trim(), idempotencyKey: payment.idempotencyKey };
  const result = await recordFrontdeskPayment(payment.orders, amountCents, payment.method, payment.label, details);
  if (!result) { payment.submitting = false; renderPaymentModal(); return; }
  if (result.remaining_cents > 0) { payment.submitting = false; closePaymentModal(); return; }
  payment.completed = { amountCents, method: payment.method, cashReceivedCents: details.cashReceivedCents, changeGivenCents: details.changeGivenCents };
  payment.submitting = false;
  renderPaymentModal();
}

async function recordFrontdeskPayment(orders, amountCents, method, label, details = {}) {
  if (orders.length !== 1 || !isPayableOrder(orders[0])) return showOrderToast("Select one open order before recording payment.", "warning");
  const remaining = Math.max(0, toCents(orders.reduce((sum, order) => sum + orderTotal(order), 0)) - activePaymentsForOrders(orders).reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0));
  if (frontdeskBusy || amountCents <= 0 || amountCents > remaining) return showOrderToast(amountCents > remaining ? "Payment cannot exceed the remaining balance." : "Enter a positive payment amount.", "warning");
  frontdeskBusy = true;
  const paidAt = new Date().toISOString();
  try {
    if (!orders[0].cloudId || !window.TableOrderCloud.recordFrontdeskPayment) throw new Error("A synced order is required before recording payment.");
    const cloudPayment = await window.TableOrderCloud.recordFrontdeskPayment(orders[0].cloudId, { amountCents, method, note: details.note || label, reference: details.reference, cashReceivedCents: details.cashReceivedCents, changeGivenCents: details.changeGivenCents, idempotencyKey: details.idempotencyKey });
    const paymentId = cloudPayment?.payment_id || crypto.randomUUID();
    if (!state.payments.some((payment) => payment.id === paymentId)) state.payments.push({ id: paymentId, orderId: orders[0].cloudId || orders[0].id, amountCents, method, label: details.note || label, paidAt, status: "completed", cashReceivedCents: details.cashReceivedCents, changeGivenCents: details.changeGivenCents, reference: details.reference });
    const fullyPaid = cloudPayment?.remaining_cents === 0;
    saveState();
    showOrderToast(fullyPaid ? "Order paid in full." : "Payment recorded.", "success");
    renderFrontDesk();
    return cloudPayment;
  } catch (error) { showOrderToast(`Payment was not recorded: ${error.message}`, "warning"); return false; } finally { frontdeskBusy = false; }
}

async function voidFrontdeskPayment(paymentId, orders) {
  const payment = (state.payments || []).find((entry) => entry.id === paymentId);
  if (!payment || !["owner", "manager"].includes(staffUser?.role)) return;
  const reason = window.prompt("Void reason (required):");
  if (!reason?.trim()) return showOrderToast("A void reason is required.", "warning");
  try {
    if (orders.length === 1 && orders[0].cloudId && window.TableOrderCloud.voidFrontdeskPayment) await window.TableOrderCloud.voidFrontdeskPayment(paymentId, reason.trim());
    payment.status = "voided";
    payment.voidedAt = new Date().toISOString();
    payment.voidReason = reason.trim();
    orders.forEach((order) => { if (order.status === "Paid") order.status = "Served"; });
    saveState();
    renderFrontDesk();
    showOrderToast("Payment voided and retained in the audit trail.", "success");
  } catch (error) { showOrderToast(`Payment was not voided: ${error.message}`, "warning"); }
}

function printSplitBill(id, orders, totalCents) {
  const bill = frontdeskSplitMode === "item" ? frontdeskItemBills.find((entry) => entry.id === id) : { name: `Bill ${Number(id.split("-")[1]) + 1}`, totalCents: splitEvenly(totalCents, frontdeskPeople)[Number(id.split("-")[1])] };
  const amount = bill.totalCents || itemBillCents(bill, checkoutLines(orders), totalCents);
  const profile = restaurant();
  setPrintContent(`<h2>${escapeHtml(profile.name)}</h2><p>${escapeHtml(profile.address || "")}</p><p>ABN: ${escapeHtml(profile.taxId || "N/A")}</p><hr><h3>${escapeHtml(bill.name)}</h3><p>Order ${orders.map((order) => `#${order.number}`).join(", ")}</p><p>Date: ${new Date().toLocaleString("en-AU")}</p><hr><p>Subtotal: ${moneyCents(Math.round(amount / (1 + (Number(profile.taxRate) || 10) / 100)))}</p><p>GST: ${moneyCents(amount - Math.round(amount / (1 + (Number(profile.taxRate) || 10) / 100)))}</p><h3>Total: ${moneyCents(amount)}</h3><p>Payment status: Unpaid</p>`); printPreparedContent();
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
            <img src="${escapeHtml(brandMarkFor(restaurant()))}" alt="${escapeHtml(restaurant().name)} logo">
            <span>${escapeHtml(restaurant().name)}</span>
          </div>
          <canvas class="qr-canvas" width="640" height="640" data-qr-table="${table.id}" aria-label="QR code for ${escapeHtml(table.name)}"></canvas>
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
          <span class="menu-status-info"><strong>${escapeHtml(item.name)}</strong><p class="muted">${escapeHtml(item.category)} · ${money(item.price)} · ${escapeHtml(optionTemplateLabel(item.optionTemplate))}</p></span>
          <span class="status-buttons menu-status-controls">
            <input class="photo-url-input" data-photo-url="${item.id}" type="url" placeholder="Photo URL" value="${escapeHtml(normalizePhotoUrl(item.photoData))}" />
            <input class="photo-file-input" data-photo-file="${item.id}" type="file" accept="image/jpeg,image/png,image/webp" />
            <span class="menu-photo-actions">
              <button class="ghost-button" data-upload-photo="${item.id}" type="button">Upload photo</button>
              <button class="ghost-button" data-sample-item-photo="${item.id}" type="button">Sample</button>
              <button class="ghost-button" data-save-photo="${item.id}" type="button">Save Photo</button>
              <button class="ghost-button" data-soldout="${item.id}">${itemSoldOut(item) ? "Available" : "Sold Out"}</button>
              ${item.id.startsWith("custom_") ? `<button class="ghost-button" data-delete-item="${item.id}">Delete</button>` : ""}
            </span>
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

  document.querySelectorAll("[data-upload-photo]").forEach((button) => {
    button.addEventListener("click", () => uploadMenuItemPhotoFile(button.dataset.uploadPhoto));
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
  const qrLogo = brandMarkFor(profile);
  return `
    <article class="print-qr-card">
      <img class="print-qr-logo" src="${escapeHtml(qrLogo)}" alt="${escapeHtml(profile.name)} logo">
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
  const brandLogo = isSakeStreetBrand(profile) ? SAKE_STREET_LOGOS.header : profile.logoData;
  if (brandLogo) {
    logo.innerHTML = `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(profile.name)} logo" onerror="this.onerror=null;this.src='/icons/aveniq.svg'">`;
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

function isSakeStreetBrand(profile) {
  // Sake Street has a purpose-made header asset. Always prefer it over an
  // uploaded legacy logo, which may include a large blank canvas.
  return profile.slug === "sake-street";
}

function brandMarkFor(profile) {
  return isSakeStreetBrand(profile) ? SAKE_STREET_LOGOS.mark : (profile.logoData || DEFAULT_LOGO_DATA);
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
  const orders = checkoutOrdersForTable(table.id);
  const lines = groupCheckoutLines(orders);
  const totalCents = orders.reduce((sum, order) => sum + orderTotalCents(order), 0);
  const taxCents = taxIncludedCents(totalCents);
  const subtotalCents = subtotalBeforeTaxCents(totalCents);
  const paidCents = activePaymentsForOrders(orders).reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const isPaid = paidCents >= totalCents;
  setPrintContent(`
    <h2>${table.name}</h2>
    <p>${escapeHtml(profile.name)}</p>
    <p>${escapeHtml(profile.address || "")}</p>
    <p>${escapeHtml(profile.phone || "")}</p>
    <hr>
    <p>${isPaid ? "Receipt" : "Bill"}</p>
    ${lines.map((item) => `<p>${item.quantity} x ${escapeHtml(item.name)}<br>${escapeHtml(item.optionsLabel)}${item.orderNumbers.length ? `<br>From orders ${item.orderNumbers.map((number) => `#${number}`).join(", ")}` : ""}<br>${moneyCents(item.totalCents)}</p>`).join("")}
    <hr>
    <p>Subtotal ex. GST: ${moneyCents(subtotalCents)}</p>
    <p>GST included: ${moneyCents(taxCents)}</p>
    <h3>Total: ${moneyCents(totalCents)}</h3>
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
      logoWatermarkData: profile.logoWatermarkData
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

function canManageAttendancePins() {
  return staffUser?.role === "owner";
}
let staffClockLink = null;
function staffClockUrl(token) { return `${window.location.origin}/staff-clock/${encodeURIComponent(token)}`; }
function staffClockStoredUrl() { try { return sessionStorage.getItem(`aveniq-staff-clock-link:${staffUser?.restaurantId}`) || ""; } catch { return ""; } }
function renderStaffClockLink() { const panel = document.getElementById("staffClockLinkPanel"); if (!panel) return; const allowed = staffUser?.role === "owner"; panel.classList.toggle("hidden", !allowed); if (!allowed) return; const active = Boolean(staffClockLink?.active), url = staffClockStoredUrl(); document.getElementById("staffClockLinkStatus").textContent = active ? "Active" : "Disabled"; document.getElementById("staffClockLinkLabel").value = staffClockLink?.device_label || ""; document.getElementById("staffClockLinkMeta").textContent = active ? `Created ${formatAttendancePinDate(staffClockLink?.created_at) || "today"}${staffClockLink?.last_used_at ? ` · Last used ${formatAttendancePinDate(staffClockLink.last_used_at)}` : ""}${url ? " · Link ready to copy or open" : " · Regenerate to issue a link in this browser"}` : "Enable a PIN-only Staff Clock link for a shared desktop or iPad."; ["openStaffClockLink","copyStaffClockLink","regenerateStaffClockLink","disableStaffClockLink"].forEach((id) => { document.getElementById(id).disabled = !active || ((id === "openStaffClockLink" || id === "copyStaffClockLink") && !url); }); document.getElementById("enableStaffClockLink").disabled = active; }
async function loadStaffClockLink() { if (staffUser?.role !== "owner") return; try { staffClockLink = await window.TableOrderCloud.getStaffClockLink(staffUser.restaurantId); } catch { staffClockLink = null; } renderStaffClockLink(); }
async function saveStaffClockLink(regenerate = false) { const label = document.getElementById("staffClockLinkLabel").value; try { const result = regenerate ? await window.TableOrderCloud.regenerateStaffClockLink(staffUser.restaurantId, label) : await window.TableOrderCloud.enableStaffClockLink(staffUser.restaurantId, label); staffClockLink = result; try { sessionStorage.setItem(`aveniq-staff-clock-link:${staffUser.restaurantId}`, staffClockUrl(result.link_token)); } catch {} renderStaffClockLink(); } catch { document.getElementById("staffClockLinkError").textContent = "Unable to update the Staff Clock link."; document.getElementById("staffClockLinkError").classList.remove("hidden"); } }

function formatAttendancePinDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function clearAttendancePinFields() {
  ["attendancePinValue", "attendancePinConfirm"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
  document.getElementById("attendancePinReveal")?.classList.add("hidden");
  document.getElementById("attendancePinForm")?.classList.remove("hidden");
  const revealValue = document.getElementById("attendancePinRevealValue");
  if (revealValue) revealValue.textContent = "";
  attendancePinManagement.revealed = "";
}

function setAttendancePinError(message = "") {
  const node = document.getElementById("attendancePinError");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function closeAttendancePinModal() {
  clearAttendancePinFields();
  attendancePinManagement.staff = null;
  document.getElementById("attendancePinModal")?.classList.add("hidden");
  setAttendancePinError("");
}

function openAttendancePinModal(userId) {
  if (!canManageAttendancePins()) {
    showOrderToast("You do not have permission to manage attendance PINs.", "warning");
    return;
  }
  const member = restaurantTeamData.staff.find((item) => item.user_id === userId);
  if (!member) return;
  attendancePinManagement.staff = member;
  setAttendancePinError("");
  clearAttendancePinFields();
  const configured = Boolean(member.attendance_pin_configured);
  document.getElementById("attendancePinTitle").textContent = configured ? "Reset Attendance PIN" : "Set Attendance PIN";
  document.getElementById("attendancePinStaff").textContent = member.email || "Staff member";
  document.getElementById("saveAttendancePin").textContent = configured ? "Reset PIN" : "Save PIN";
  document.getElementById("attendancePinModal").classList.remove("hidden");
  document.getElementById("attendancePinValue")?.focus();
}

function generateAttendancePin() {
  const bytes = new Uint32Array(1);
  window.crypto.getRandomValues(bytes);
  const pin = String(1000 + (bytes[0] % 9000));
  document.getElementById("attendancePinValue").value = pin;
  document.getElementById("attendancePinConfirm").value = pin;
  setAttendancePinError("");
}

async function saveAttendancePin(event) {
  event.preventDefault();
  const member = attendancePinManagement.staff;
  if (!member || !canManageAttendancePins()) {
    setAttendancePinError("You do not have permission to manage attendance PINs.");
    return;
  }
  const pin = document.getElementById("attendancePinValue").value;
  const confirmation = document.getElementById("attendancePinConfirm").value;
  if (!/^\d{4}$/.test(pin)) {
    setAttendancePinError("PIN must contain exactly four numbers.");
    return;
  }
  if (pin !== confirmation) {
    setAttendancePinError("PINs do not match.");
    return;
  }

  const saveButton = document.getElementById("saveAttendancePin");
  const wasConfigured = Boolean(member.attendance_pin_configured);
  saveButton.disabled = true;
  setAttendancePinError("");
  try {
    await window.TableOrderCloud.setStaffAttendancePin(staffUser.restaurantId, member.user_id, pin, true);
    member.attendance_pin_configured = true;
    member.attendance_pin_updated_at = new Date().toISOString();
    renderRestaurantTeam();
    document.getElementById("attendancePinValue").value = "";
    document.getElementById("attendancePinConfirm").value = "";
    attendancePinManagement.revealed = pin;
    document.getElementById("attendancePinForm").classList.add("hidden");
    document.getElementById("attendancePinRevealValue").textContent = pin;
    document.getElementById("attendancePinReveal").classList.remove("hidden");
    showOrderToast(wasConfigured ? "Attendance PIN reset" : "Attendance PIN created", "success");
  } catch (error) {
    const code = String(error.code || error.message || "").toUpperCase();
    if (code.includes("DUPLICATE_PIN")) setAttendancePinError("This PIN is already assigned to another staff member.");
    else if (code.includes("ACCESS_DENIED")) setAttendancePinError("You do not have permission to manage attendance PINs.");
    else if (code.includes("INVALID_PIN")) setAttendancePinError("PIN must contain exactly four numbers.");
    else setAttendancePinError("Unable to save the attendance PIN. Please try again.");
  } finally {
    saveButton.disabled = false;
  }
}

function renderRestaurantTeam() {
  const staffList = document.getElementById("restaurantTeamList");
  const inviteList = document.getElementById("restaurantInviteList");
  if (!staffList || !inviteList) return;

  staffList.innerHTML = restaurantTeamData.staff.length
    ? restaurantTeamData.staff.map((member) => {
      // Presence must come from the shared database heartbeat. Treating the
      // current browser as automatically online makes separate browsers show
      // contradictory status for the same team.
      const isOnline = Boolean(member.is_online);
      const pinConfigured = Boolean(member.attendance_pin_configured);
      const pinDate = formatAttendancePinDate(member.attendance_pin_updated_at);
      return `
      <article class="team-row role-${escapeHtml(member.role)}">
        <div><strong>${escapeHtml(member.email || "Account")}</strong><span>${escapeHtml(STAFF_ROLE_LABELS[member.role] || member.role)}${member.is_current ? " · You" : ""}</span></div>
        <div class="team-row-actions"><span class="presence-pill ${isOnline ? "online" : "offline"}"><i></i>${isOnline ? "Online" : "Offline"}</span><span class="attendance-pin-status ${pinConfigured ? "active" : "pending"}">${pinConfigured ? "Active" : "Not configured"}</span>${pinConfigured && pinDate ? `<span class="attendance-pin-updated">Last updated ${escapeHtml(pinDate)}</span>` : ""}${canManageAttendancePins() ? `<button class="ghost-button" type="button" data-manage-attendance-pin="${escapeHtml(member.user_id)}">${pinConfigured ? "Reset PIN" : "Set PIN"}</button>` : ""}${staffUser?.role === "owner" && member.role === "manager" ? `<button class="ghost-button" type="button" data-attendance-report-access="${escapeHtml(member.user_id)}">${member.attendance_report_access ? "Remove report access" : "Grant report access"}</button>` : ""}</div>
      </article>`;
    }).join("")
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
      photoData: item.image_url || item.photo_url || (cloud.restaurant.slug === "sake-street" ? sakeStreetMenuPhotoUrl(item.name) : ""),
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

  if (!name || !category || Number.isNaN(price) || price < 0) {
    showOrderToast("Enter a dish name, category, and a valid price before adding the dish.", "warning");
    return;
  }

  let photoData = photoUrl;
  try {
    if (!photoData) photoData = await readPhotoAsDataUrl(photoFile);
  } catch (error) {
    showOrderToast(`Photo could not be read: ${error.message}`, "warning");
    return;
  }

  const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Adding…";
  }

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
    showOrderToast(`Dish was added locally, but cloud save failed: ${error.message}`, "warning");
  } finally {
    if (submitButton?.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = "Add Dish";
    }
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
let platformTeamRestaurant = null;
let platformTeamData = { staff: [], invites: [] };
let inviteAuthMode = "signup";
let restaurantTeamData = { staff: [], invites: [] };
let attendancePinManagement = { staff: null, revealed: "" };

function setGatewayVisible(visible) {
  document.getElementById("accountGateway")?.classList.toggle("hidden", !visible);
  document.body.classList.toggle("account-flow-active", Boolean(visible));
  if (visible) document.body.dataset.layoutFamily = "setup";
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
  node.classList.remove("success-message");
}

async function uploadMenuItemPhotoFile(itemId) {
  const item = itemById(itemId);
  const input = document.querySelector(`[data-photo-file="${CSS.escape(itemId)}"]`);
  const file = input?.files?.[0];
  if (!item || !file) return showOrderToast("Choose a JPG, PNG, or WebP image first.", "warning");
  if (!item.cloudId || !staffUser || !window.TableOrderCloud?.uploadMenuItemPhoto) {
    return showOrderToast("Sign in as an Owner or Manager before uploading menu photos.", "warning");
  }

  const button = document.querySelector(`[data-upload-photo="${CSS.escape(itemId)}"]`);
  if (button) { button.disabled = true; button.textContent = "Uploading…"; }
  try {
    const photoUrl = await window.TableOrderCloud.uploadMenuItemPhoto(file, staffUser.restaurantId);
    await window.TableOrderCloud.updateMenuItemPhoto(item.cloudId, photoUrl, staffUser.restaurantId);
    item.photoData = photoUrl;
    saveState();
    await loadCloudDataIntoApp({ silent: true });
    showOrderToast("Menu photo uploaded and saved to cloud.", "success");
  } catch (error) {
    showOrderToast(`Photo upload failed: ${error.message}`, "warning");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Upload photo"; }
  }
}

function renderMobileCustomerControls(entries = cartEntries()) {
  const dock = document.getElementById("mobileCartDock");
  const nav = document.getElementById("mobileBottomNav");
  if (!dock || !nav) return;
  const isCustomer = !staffUser && activeView === "customer";
  const quantity = entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  // Keep the compact cart available while the customer is browsing the menu.
  // Once the full cart is substantially in view, leave only that panel visible
  // so tablet controls never overlap.
  const showFloatingCart = isCustomer && quantity > 0 && !customerCartPanelVisible;
  dock.classList.toggle("hidden", !showFloatingCart);
  dock.classList.remove("is-empty");
  dock.disabled = !showFloatingCart;
  dock.setAttribute("aria-label", `Open cart with ${quantity} item${quantity === 1 ? "" : "s"}`);
  nav.classList.toggle("hidden", !isCustomer);
  document.body.classList.toggle("has-floating-cart", showFloatingCart);
  document.getElementById("mobileCartCount").textContent = String(quantity);
  document.getElementById("mobileCartTotal").textContent = money(cartTotal());
  document.getElementById("mobileCartLabel").textContent = `item${quantity === 1 ? "" : "s"}`;
  document.getElementById("mobileCartAction").textContent = "View cart";

  if (showFloatingCart && mobileCartBumpRequested) {
    mobileCartBumpRequested = false;
    window.clearTimeout(mobileCartBumpTimer);
    dock.classList.remove("cart-bump");
    void dock.offsetWidth;
    dock.classList.add("cart-bump");
    mobileCartBumpTimer = window.setTimeout(() => dock.classList.remove("cart-bump"), 500);
  }
}

function observeCustomerCartPanel() {
  const panel = document.querySelector(".order-panel");
  if (!panel || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
      if (customerCartPanelVisible === visible) return;
      customerCartPanelVisible = visible;
      renderMobileCustomerControls();
    },
    { threshold: [0, 0.5] }
  );
  observer.observe(panel);
}

function updateSafariBottomInset() {
  const viewport = window.visualViewport;
  const inset = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  document.documentElement.style.setProperty("--safari-bottom-inset", `${inset}px`);
}

function setCustomerAppearance(isDark) {
  document.body.classList.toggle("customer-night", isDark);
  const button = document.getElementById("customerThemeToggle");
  if (button) button.setAttribute("aria-pressed", String(isDark));
  try { localStorage.setItem("aveniq-customer-appearance", isDark ? "dark" : "light"); } catch {}
}


function showOwnerAuth() {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.remove("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("signupPanel").classList.add("hidden");
  document.getElementById("verificationPanel").classList.add("hidden");
  document.getElementById("passwordRecoveryPanel").classList.add("hidden");
  document.getElementById("provisioningRecoveryPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  const staffLogin = (window.TableOrderCloud?.routeContext?.() || APP_ROUTE).area === "staff";
  document.getElementById("ownerAuthTitle").textContent = staffLogin ? "Staff Login" : "Sign in to Aveniq";
  document.querySelector("#ownerAuthPanel .eyebrow").textContent = staffLogin ? "Restaurant staff access" : "Secure platform access";
  setOwnerAuthMode();
}

function showSignup() {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  document.getElementById("verificationPanel").classList.add("hidden");
  document.getElementById("passwordRecoveryPanel").classList.add("hidden");
  document.getElementById("provisioningRecoveryPanel").classList.add("hidden");
  document.getElementById("signupPanel").classList.remove("hidden");
}

function showVerification({ title = "Check your email", description = "We sent a verification link to your email address. Verify it before signing in.", error = "", email = "" } = {}) {
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("signupPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.add("hidden");
  document.getElementById("verificationPanel").classList.remove("hidden");
  document.getElementById("passwordRecoveryPanel").classList.add("hidden");
  document.getElementById("provisioningRecoveryPanel").classList.add("hidden");
  document.getElementById("verificationTitle").textContent = title;
  document.getElementById("verificationDescription").textContent = description;
  document.getElementById("resendVerificationEmail").value = email;
  setOwnerFlowError(error, "verificationError");
}

function showProvisioningRecovery(error = "") {
  setGatewayVisible(true);
  ["ownerAuthPanel", "inviteAuthPanel", "signupPanel", "verificationPanel", "passwordRecoveryPanel", "onboardingWizard", "platformConsole"].forEach((id) => document.getElementById(id).classList.add("hidden"));
  document.getElementById("provisioningRecoveryPanel").classList.remove("hidden");
  setOwnerFlowError(error ? `${error} Reference: ${new Date().toISOString().slice(0, 10)}.` : "", "provisioningRecoveryError");
}

function validateSelfServiceSignup(values) {
  const clean = {
    fullName: String(values.fullName || "").trim().replace(/\s+/g, " "),
    businessName: String(values.businessName || "").trim().replace(/\s+/g, " "),
    email: String(values.email || "").trim().toLowerCase(),
    password: String(values.password || ""), confirmPassword: String(values.confirmPassword || ""),
    country: String(values.country || "").trim().replace(/\s+/g, " "),
    terms: Boolean(values.terms), privacy: Boolean(values.privacy)
  };
  if (!clean.fullName || !clean.businessName || !clean.email || !clean.password || !clean.confirmPassword || !clean.country) return { error: "Complete every required field." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean.email)) return { error: "Enter a valid email address." };
  if (clean.password.length < 12 || !/[a-z]/.test(clean.password) || !/[A-Z]/.test(clean.password) || !/\d/.test(clean.password) || !/[^A-Za-z0-9]/.test(clean.password)) return { error: "Choose a stronger password that meets the stated requirements." };
  if (clean.password !== clean.confirmPassword) return { error: "Your passwords do not match." };
  if (!clean.terms) return { error: "You must accept the Terms of Service." };
  if (!clean.privacy) return { error: "You must accept the Privacy Policy." };
  return { values: clean };
}

async function handleSelfServiceSignup(event) {
  event.preventDefault();
  const button = document.getElementById("signupSubmit");
  const values = {
    fullName: document.getElementById("signupFullName").value,
    businessName: document.getElementById("signupBusinessName").value,
    email: document.getElementById("signupEmail").value,
    password: document.getElementById("signupPassword").value,
    confirmPassword: document.getElementById("signupConfirmPassword").value,
    country: document.getElementById("signupCountry").value,
    terms: document.getElementById("signupTerms").checked,
    privacy: document.getElementById("signupPrivacy").checked
  };
  const checked = validateSelfServiceSignup(values);
  if (checked.error) { setOwnerFlowError(checked.error, "signupError"); return; }
  button.disabled = true;
  setOwnerFlowError("", "signupError");
  try {
    await window.TableOrderCloud.signUp(checked.values.email, checked.values.password, {
      registration_type: "self_service", full_name: checked.values.fullName,
      business_name: checked.values.businessName, country: checked.values.country,
      terms_accepted_at: new Date().toISOString(), privacy_accepted_at: new Date().toISOString()
    });
    window.history.replaceState({}, "", "/verify");
    showVerification({ email: checked.values.email });
  } catch (error) {
    const duplicate = /already registered|already been registered|user already/i.test(error.message);
    setOwnerFlowError(duplicate ? "An account already exists for this email. Try logging in instead." : "We could not create your account. Check your details and try again.", "signupError");
  } finally { button.disabled = false; }
}

async function handleResendVerification(event) {
  event.preventDefault();
  const email = document.getElementById("resendVerificationEmail").value.trim().toLowerCase();
  const button = document.getElementById("resendVerificationSubmit");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setOwnerFlowError("Enter a valid email address.", "verificationError"); return; }
  const key = `aveniq-verification-resend:${email}`;
  if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 60000) { setOwnerFlowError("Please wait a minute before requesting another email.", "verificationError"); return; }
  button.disabled = true;
  try {
    await window.TableOrderCloud.resendVerification(email);
    sessionStorage.setItem(key, String(Date.now()));
    setOwnerFlowError("If an account needs verification, a new email will arrive shortly.", "verificationError");
    document.getElementById("verificationError").classList.add("success-message");
  } catch { setOwnerFlowError("We could not resend the email just now. Please wait and try again.", "verificationError"); }
  finally { button.disabled = false; }
}

function showPasswordRecovery(reset = false, error = "") {
  setGatewayVisible(true);
  ["ownerAuthPanel", "inviteAuthPanel", "signupPanel", "verificationPanel", "provisioningRecoveryPanel", "onboardingWizard", "platformConsole"].forEach((id) => document.getElementById(id).classList.add("hidden"));
  document.getElementById("passwordRecoveryPanel").classList.remove("hidden");
  document.getElementById("passwordRecoveryTitle").textContent = reset ? "Choose a new password" : "Reset your password";
  document.getElementById("passwordRecoveryDescription").textContent = reset ? "Choose a new password for your Aveniq account." : "Enter your email address and we will send a password-reset link if an account is eligible.";
  document.getElementById("passwordRecoveryEmailField").classList.toggle("hidden", reset);
  document.getElementById("passwordRecoveryNewField").classList.toggle("hidden", !reset);
  document.getElementById("passwordRecoveryConfirmField").classList.toggle("hidden", !reset);
  document.getElementById("passwordRecoveryEmail").required = !reset;
  document.getElementById("passwordRecoveryNew").required = reset;
  document.getElementById("passwordRecoveryConfirm").required = reset;
  document.getElementById("passwordRecoverySubmit").textContent = reset ? "Update password" : "Send reset link";
  setOwnerFlowError(error, "passwordRecoveryError");
}

async function handlePasswordRecovery(event) {
  event.preventDefault();
  const reset = (window.TableOrderCloud.routeContext?.() || APP_ROUTE).area === "reset-password";
  const button = document.getElementById("passwordRecoverySubmit");
  button.disabled = true;
  setOwnerFlowError("", "passwordRecoveryError");
  try {
    if (!reset) {
      const email = document.getElementById("passwordRecoveryEmail").value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
      await window.TableOrderCloud.requestPasswordRecovery(email);
      setOwnerFlowError("If an account is eligible, a password-reset email will arrive shortly.", "passwordRecoveryError");
      document.getElementById("passwordRecoveryError").classList.add("success-message");
    } else {
      const password = document.getElementById("passwordRecoveryNew").value;
      const confirmation = document.getElementById("passwordRecoveryConfirm").value;
      const strength = validateSelfServiceSignup({ fullName: "x", businessName: "x", email: "x@example.com", password, confirmPassword: confirmation, country: "x", terms: true, privacy: true });
      if (strength.error) throw new Error(strength.error);
      await window.TableOrderCloud.updatePassword(password);
      await window.TableOrderCloud.signOut();
      window.history.replaceState({}, "", "/login");
      showOwnerAuth();
      setOwnerFlowError("Password updated. You can now log in.");
    }
  } catch (error) {
    setOwnerFlowError(error.message === "PASSWORD_RECOVERY_SESSION_MISSING" ? "This reset link is invalid or has expired. Request a new one." : error.message, "passwordRecoveryError");
  } finally { button.disabled = false; }
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
    const inviteToken = window.TableOrderCloud.routeContext().inviteToken;
    if (!inviteToken) throw new Error("This invitation link is incomplete.");
    const result = await window.TableOrderCloud.signUp(email, password, {}, `/join/${encodeURIComponent(inviteToken)}`);
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
    const restaurantArea = ["dashboard", "kitchen", "frontdesk", "reports", "attendance", "setup"].includes(route.area);

    if (restaurantArea && route.restaurantSlug) {
      const profile = await window.TableOrderCloud.getStaffProfile();
      staffUser = profile;
      onboardingRestaurant = { id: profile.restaurantId, slug: profile.restaurantSlug, name: profile.restaurantName };
      const requestedView = route.area === "dashboard" ? "setup" : route.area;
      if (!staffCanAccess(requestedView)) {
        const destination = staffDefaultDestination(profile.role);
        const destinationPath = `/dashboard/${encodeURIComponent(profile.restaurantSlug)}/${destination === "customer" ? "dashboard" : destination}`;
        window.location.replace(destinationPath);
        return;
      }
      if (profile.venueStatus === "setup_required") {
        const onboarding = await window.TableOrderCloud.getCurrentOnboarding();
        if (onboarding?.eligible && onboarding.status !== "completed") {
          window.location.href = "/onboarding";
          return;
        }
      }
      setGatewayVisible(false);
      await loadCloudDataIntoApp({ silent: true });
      renderStaffSession();
      startCloudOrderSync();
      setView(requestedView, { updateUrl: false });
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
    if (profile.venueStatus === "setup_required") {
      const onboarding = await window.TableOrderCloud.getCurrentOnboarding();
      if (onboarding?.eligible && onboarding.status !== "completed") {
        if (window.location.pathname !== "/onboarding") window.location.href = "/onboarding";
        else await showSelfServiceOnboarding(onboarding);
        return;
      }
      const dashboardUrl = `/dashboard/${encodeURIComponent(profile.restaurantSlug)}/dashboard`;
      if (window.location.pathname !== dashboardUrl) window.location.href = dashboardUrl;
      return;
    }
    if (profile.restaurantStatus === "onboarding") {
      await loadCloudDataIntoApp({ silent: true });
      onboardingMenuItems = allMenuItems().filter((item) => item.cloudId);
      const nextStep = !allTables().some((table) => table.cloudId) ? 2 : onboardingMenuItems.length ? 4 : 3;
      showOnboarding(nextStep);
      window.history.replaceState({}, "", `/onboarding?restaurant=${encodeURIComponent(profile.restaurantSlug)}`);
      return;
    }
    const destination = staffRequestedDestination(profile);
    const routeName = destination === "customer" ? "dashboard" : destination;
    const destinationUrl = `/dashboard/${encodeURIComponent(profile.restaurantSlug)}/${routeName}`;
    if (window.location.pathname !== destinationUrl) window.location.href = destinationUrl;
  } catch (error) {
    if (error.code === "ONBOARDING_REQUIRED" || error.message === "ONBOARDING_REQUIRED") {
      showOwnerAuth();
      const recovery = await window.TableOrderCloud.provisionSelfServiceAccount();
      if (recovery?.status === "provisioned") return continueOwnerSession();
      if (recovery?.status === "failed") { showProvisioningRecovery("We couldn’t finish preparing your restaurant."); return; }
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
        <button class="ghost-button" type="button" data-manage-platform-team="${escapeHtml(entry.id)}">Manage team</button>
        <a class="submit-button" href="/dashboard/${encodeURIComponent(entry.slug)}/dashboard" target="_blank" rel="noopener">Open dashboard</a>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-manage-platform-team]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = platformRestaurants.find((entry) => entry.id === button.dataset.managePlatformTeam);
      if (selected) openPlatformTeamManager(selected);
    });
  });
}

function canUseKitchenVoidActions() {
  return ["owner", "manager", "staff", "cashier"].includes(staffUser?.role);
}

function closeKitchenActionMenus() { document.querySelectorAll(".kitchen-action-menu").forEach((menu) => menu.remove()); }
function openKitchenActionMenu(trigger, actions) {
  closeKitchenActionMenus();
  const menu = document.createElement("div");
  menu.className = "kitchen-action-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = actions.map((action) => `<button type="button" role="menuitem" class="${action.danger ? "danger-action" : ""}" data-kitchen-menu-action="${action.id}">${escapeHtml(action.label)}</button>`).join("");
  trigger.parentElement.appendChild(menu);
  menu.querySelectorAll("[data-kitchen-menu-action]").forEach((button) => button.addEventListener("click", () => { closeKitchenActionMenus(); actions.find((action) => action.id === button.dataset.kitchenMenuAction)?.run(); }));
  window.setTimeout(() => {
    const close = (event) => { if (!menu.contains(event.target) && event.target !== trigger) { closeKitchenActionMenus(); document.removeEventListener("pointerdown", close, true); } };
    document.addEventListener("pointerdown", close, true);
  }, 0);
  menu.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeKitchenActionMenus(); trigger.focus(); } });
  menu.querySelector("button")?.focus();
}
function openKitchenOrderMenu(trigger) {
  const order = state.orders.find((entry) => entry.id === trigger.dataset.orderActions); if (!order || !canUseKitchenVoidActions()) return;
  const voidable = order.items.filter((item) => item.id && item.status !== "voided");
  openKitchenActionMenu(trigger, [
    ...(voidable.length ? [{ id: "void-items", label: "Void item", run: () => openVoidItemDialog(order.id) }] : []),
    { id: "void-order", label: "Void order", danger: true, run: () => openVoidOrderDialog(order.id) }
  ]);
}
function openKitchenItemMenu(trigger) {
  const [itemId, orderId] = trigger.dataset.itemActions.split(":");
  const order = state.orders.find((entry) => entry.id === orderId); const item = order?.items.find((entry) => entry.id === itemId);
  if (!item || !canUseKitchenVoidActions()) return;
  openKitchenActionMenu(trigger, [{ id: "void-item", label: "Void item", danger: true, run: () => openVoidItemDialog(orderId, [itemId], trigger) }]);
}
function enableKitchenItemLongPress(board) {
  board.querySelectorAll("[data-kitchen-item-row]").forEach((row) => {
    let timer; let start;
    row.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" || !canUseKitchenVoidActions() || event.target.closest("button")) return;
      start = { x: event.clientX, y: event.clientY }; row.classList.add("is-pressing");
      timer = window.setTimeout(() => { const button = row.querySelector("[data-item-actions]"); if (button) openKitchenItemMenu(button); row.classList.remove("is-pressing"); timer = null; }, 600);
    });
    const cancel = (event) => { if (event?.type === "pointermove" && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) return; window.clearTimeout(timer); timer = null; row.classList.remove("is-pressing"); };
    row.addEventListener("pointermove", cancel); row.addEventListener("pointerup", cancel); row.addEventListener("pointercancel", cancel);
  });
}

function canApplyKitchenStatus(currentStatus, action) {
  const current = String(currentStatus || "").toLowerCase();
  return (action === "Preparing" && ["new", "draft", "confirmed", "kitchen_accepted"].includes(current)) || (action === "Ready" && current === "preparing") || (action === "Served" && current === "ready");
}

async function retrySelfServiceProvisioning() {
  const button = document.getElementById("retryProvisioning");
  button.disabled = true;
  setOwnerFlowError("", "provisioningRecoveryError");
  try {
    const result = await window.TableOrderCloud.provisionSelfServiceAccount();
    if (result?.status !== "provisioned") throw new Error("We couldn’t finish preparing your restaurant.");
    await continueOwnerSession();
  } catch {
    showProvisioningRecovery("We couldn’t finish preparing your restaurant. Please try again shortly or contact support.");
  } finally { button.disabled = false; }
}

const ORDER_VOID_REASONS = ["Wrong table", "Duplicate order", "Customer cancelled", "Order entered by mistake", "Kitchen issue", "Other"];
const ITEM_VOID_REASONS = ["Wrong item entered", "Duplicate item", "Out of stock", "Kitchen mistake", "Other"];
function openKitchenDialog({ title, body, submitLabel, onSubmit, trigger }) {
  const returnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop kitchen-void-backdrop";
  modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "kitchenVoidDialogTitle");
  modal.innerHTML = `<section class="kitchen-void-dialog"><button class="icon-button kitchen-dialog-close" type="button" aria-label="Close dialog">×</button><h2 id="kitchenVoidDialogTitle">${escapeHtml(title)}</h2><form class="kitchen-void-form">${body}<p class="kitchen-dialog-error" role="alert"></p><div class="kitchen-void-actions"><button type="button" class="ghost-button" data-kitchen-cancel>Cancel</button><button type="submit" class="danger-action" data-kitchen-submit>${escapeHtml(submitLabel)}</button></div></form></section>`;
  const close = () => { modal.remove(); returnFocus?.focus(); };
  document.body.appendChild(modal);
  modal.querySelector(".kitchen-dialog-close").addEventListener("click", close); modal.querySelector("[data-kitchen-cancel]").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") { const focusable = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")]; const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
  const form = modal.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = form.querySelector("[data-kitchen-submit]"); const error = form.querySelector(".kitchen-dialog-error");
    submit.disabled = true; submit.textContent = "Voiding…"; error.textContent = "";
    try { await onSubmit(form); close(); }
    catch (failure) { error.textContent = failure.message || "The void could not be completed. Please try again."; submit.disabled = false; submit.textContent = submitLabel; }
  });
  window.setTimeout(() => modal.querySelector("select, input, button:not(.kitchen-dialog-close)")?.focus(), 0);
  return modal;
}
function voidReasonFields(reasons, needsApproval) {
  return `<label class="field"><span>Void reason</span><select name="reason" required>${reasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("")}</select></label><label class="field"><span>Note <small>(required for Other)</small></span><textarea name="note" maxlength="1000" rows="2"></textarea></label>${needsApproval ? `<label class="field"><span>Manager approval PIN</span><input name="managerPin" type="password" inputmode="numeric" autocomplete="one-time-code" required></label>` : ""}`;
}
function validateVoidForm(form) { const reason = form.elements.reason.value; const note = form.elements.note.value.trim(); if (reason === "Other" && !note) throw new Error("A short note is required when the reason is Other."); return { reason, note, managerPin: form.elements.managerPin?.value || null }; }
function openVoidItemDialog(orderId, selectedIds = [], trigger = null) {
  const order = state.orders.find((entry) => entry.id === orderId); if (!order || !canUseKitchenVoidActions()) return;
  const items = order.items.filter((item) => item.id && item.status !== "voided"); if (!items.length) return showOrderToast("There are no active items to void.", "warning");
  const needsApproval = ["Preparing", "Ready"].includes(order.status);
  const rows = items.map((item) => `<label class="void-item-choice"><input type="checkbox" name="itemId" value="${item.id}" ${selectedIds.includes(item.id) ? "checked" : ""}><span><strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${optionSummary(item.options) ? `<small>${escapeHtml(optionSummary(item.options))}</small>` : ""}${item.status ? `<small>${escapeHtml(item.status)}</small>` : ""}</span></label>`).join("");
  const modal = openKitchenDialog({ title: "Select item to void", trigger, submitLabel: "Void selected", body: `<p class="muted">Select the active items to remove from preparation. Original records are retained.</p><div class="void-item-list">${rows}</div>${voidReasonFields(ITEM_VOID_REASONS, needsApproval)}`, onSubmit: async (form) => {
    const itemIds = [...form.querySelectorAll("input[name=itemId]:checked")].map((input) => input.value); if (!itemIds.length) throw new Error("Select at least one item to void.");
    const { reason, note, managerPin } = validateVoidForm(form);
    await voidOrderItemsWithReason(itemIds, orderId, reason, note, managerPin);
    showOrderToast(`${itemIds.length} item${itemIds.length === 1 ? "" : "s"} voided. Kitchen ticket retained.`, "success");
  }});
  const submit = modal.querySelector("[data-kitchen-submit]"); const choices = modal.querySelectorAll("input[name=itemId]"); const sync = () => { submit.disabled = !modal.querySelector("input[name=itemId]:checked"); }; choices.forEach((choice) => choice.addEventListener("change", sync)); sync();
}
function openVoidOrderDialog(orderId, trigger = null) {
  const order = state.orders.find((entry) => entry.id === orderId); if (!order || !canUseKitchenVoidActions()) return;
  const table = allTables().find((entry) => entry.id === order.tableId); const count = order.items.filter((item) => item.status !== "voided").reduce((sum, item) => sum + item.quantity, 0);
  const needsApproval = ["Preparing", "Ready", "Served", "Paid"].includes(order.status);
  openKitchenDialog({ title: "Void entire order?", trigger, submitLabel: "Void order", body: `<p>This will void all active items in Order #${escapeHtml(order.number)}. The original order and audit history will be retained.</p><dl class="void-order-summary"><div><dt>Order</dt><dd>#${escapeHtml(order.number)}</dd></div><div><dt>Table</dt><dd>${escapeHtml(table?.name || "Table")}</dd></div><div><dt>Active items</dt><dd>${count}</dd></div></dl>${voidReasonFields(ORDER_VOID_REASONS, needsApproval)}`, onSubmit: async (form) => { const { reason, note, managerPin } = validateVoidForm(form); await voidOrderWithReason(orderId, reason, note, managerPin); showOrderToast("Order voided. The original record remains in history.", "success"); }});
}
async function voidOrderWithReason(orderId, reason, note = "", managerPin = null) {
  if (!reason) { openVoidOrderDialog(orderId); return; }
  const order = state.orders.find((entry) => entry.id === orderId); if (!order) throw new Error("Order is no longer available.");
  if (!ORDER_VOID_REASONS.includes(reason)) throw new Error("Choose a valid void reason.");
  if (reason === "Other" && !note.trim()) throw new Error("A note is required for Other.");
  if (!order.cloudId || !window.TableOrderCloud?.voidOrder) throw new Error("Void requires a synced order so it can be securely audited.");
  await window.TableOrderCloud.voidOrder(order.cloudId, reason, note, managerPin);
  order.status = "Voided"; saveState(); render();
}
async function voidOrderItemsWithReason(itemIds, orderId, reason, note = "", managerPin = null) {
  const order = state.orders.find((entry) => entry.id === orderId); const items = order?.items.filter((entry) => itemIds.includes(entry.id)); if (!order || items?.length !== itemIds.length || items.some((item) => item.status === "voided")) throw new Error("One or more selected items are no longer voidable.");
  if (!ITEM_VOID_REASONS.includes(reason)) throw new Error("Choose a valid void reason.");
  if (reason === "Other" && !note.trim()) throw new Error("A note is required for Other.");
  if (!order.cloudId || !window.TableOrderCloud?.voidOrderItems) throw new Error("Void requires a synced order so it can be securely audited.");
  await window.TableOrderCloud.voidOrderItems(itemIds, reason, note, managerPin);
  items.forEach((item) => { item.status = "voided"; }); saveState(); renderKitchen();
}
async function showOrderActivity(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order?.cloudId || !window.TableOrderCloud?.getOrderActivity) return showOrderToast("Activity is available for synced orders.", "warning");
  try { const events = await window.TableOrderCloud.getOrderActivity(order.cloudId); const timeline = events.map((event) => `${new Date(event.created_at).toLocaleString("en-AU")} — ${event.action.replaceAll("_", " ")} by ${event.actor_name || "System"}${event.reason ? `\nReason: ${event.reason}` : ""}`).join("\n\n") || "No recorded activity yet."; window.alert(`Order #${order.number} activity\n\n${timeline}`); }
  catch (error) { showOrderToast(`Activity could not be loaded: ${error.message}`, "warning"); }
}

function setPlatformTeamError(message = "") {
  const node = document.getElementById("platformTeamError");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function renderPlatformTeam() {
  const staffList = document.getElementById("platformTeamList");
  const inviteList = document.getElementById("platformInviteList");
  if (!staffList || !inviteList) return;

  staffList.innerHTML = platformTeamData.staff.length
    ? platformTeamData.staff.map((member) => `
      <article class="team-row role-${escapeHtml(member.role)}">
        <div><strong>${escapeHtml(member.email || "Account")}</strong><span>${escapeHtml(STAFF_ROLE_LABELS[member.role] || member.role)}${member.is_current ? " · You" : ""}</span></div>
        <span class="presence-pill ${member.is_online ? "online" : "offline"}"><i></i>${member.is_online ? "Online" : "Offline"}</span>
      </article>`).join("")
    : `<div class="empty-state">No team members found.</div>`;

  inviteList.innerHTML = platformTeamData.invites.length
    ? platformTeamData.invites.map((invite) => `
      <article class="team-row invite-row">
        <div><strong>${escapeHtml(invite.email)}</strong><span>${escapeHtml(STAFF_ROLE_LABELS[invite.role] || invite.role)} · expires ${escapeHtml(new Date(invite.expires_at).toLocaleDateString())}</span></div>
        <div class="team-row-actions">
          <button class="ghost-button" type="button" data-copy-platform-invite="${escapeHtml(invite.id)}">Copy link</button>
          <button class="ghost-button" type="button" data-revoke-platform-invite="${escapeHtml(invite.id)}">Revoke</button>
        </div>
      </article>`).join("")
    : `<div class="empty-state">No pending invites.</div>`;

  inviteList.querySelectorAll("[data-copy-platform-invite]").forEach((button) => {
    button.addEventListener("click", () => {
      const invite = platformTeamData.invites.find((entry) => entry.id === button.dataset.copyPlatformInvite);
      if (invite?.token) copyText(restaurantInviteLink(invite.token));
    });
  });
  inviteList.querySelectorAll("[data-revoke-platform-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await window.TableOrderCloud.revokeRestaurantInvite(button.dataset.revokePlatformInvite);
        await loadPlatformTeam();
      } catch (error) { setPlatformTeamError(error.message); }
      finally { button.disabled = false; }
    });
  });
}

async function loadPlatformTeam() {
  if (!platformTeamRestaurant?.id) return;
  setPlatformTeamError("");
  try {
    platformTeamData = await window.TableOrderCloud.listRestaurantTeam(platformTeamRestaurant.id);
    renderPlatformTeam();
  } catch (error) { setPlatformTeamError(error.message); }
}

async function openPlatformTeamManager(restaurantEntry) {
  platformTeamRestaurant = restaurantEntry;
  platformTeamData = { staff: [], invites: [] };
  document.getElementById("platformTeamRestaurantName").textContent = `${restaurantEntry.name} team`;
  document.getElementById("platformTeamRestaurantDescription").textContent = `Invite and manage staff for /${restaurantEntry.slug}.`;
  const panel = document.getElementById("platformTeamPanel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  await loadPlatformTeam();
}

async function createPlatformRestaurantTeamInvite(event) {
  event.preventDefault();
  if (!platformTeamRestaurant?.id) return;
  const button = document.getElementById("createPlatformRestaurantInvite");
  button.disabled = true;
  setPlatformTeamError("");
  try {
    const invite = await window.TableOrderCloud.createRestaurantInvite(
      platformTeamRestaurant.id,
      document.getElementById("platformRestaurantInviteEmail").value.trim(),
      document.getElementById("platformRestaurantInviteRole").value
    );
    platformTeamData.invites = [{ ...invite }, ...platformTeamData.invites.filter((entry) => entry.email !== invite.email)];
    renderPlatformTeam();
    await copyText(restaurantInviteLink(invite.token));
    document.getElementById("platformRestaurantInviteEmail").value = "";
    showOrderToast("Invite link created and copied.", "success");
  } catch (error) { setPlatformTeamError(error.message); }
  finally { button.disabled = false; }
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
  platformTeamRestaurant = null;
  platformTeamData = { staff: [], invites: [] };
  setGatewayVisible(true);
  document.getElementById("ownerAuthPanel").classList.add("hidden");
  document.getElementById("inviteAuthPanel").classList.add("hidden");
  document.getElementById("onboardingWizard").classList.add("hidden");
  document.getElementById("platformConsole").classList.remove("hidden");
  document.getElementById("platformTeamPanel").classList.add("hidden");
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
  platformTeamRestaurant = null;
  platformTeamData = { staff: [], invites: [] };
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
  grid.innerHTML = allTables().map((table) => `<article class="onboarding-qr-card"><canvas width="640" height="640" data-onboarding-qr="${escapeHtml(table.id)}"></canvas><strong>${escapeHtml(table.name)}</strong><span>Scan to order</span></article>`).join("");
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

const ONBOARDING_COMMON_TIME_ZONES = [
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth",
  "Pacific/Auckland", "Asia/Singapore", "Asia/Tokyo", "Asia/Hong_Kong", "Asia/Kolkata",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"
];

function onboardingTimezoneOptions(selected) {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const timezones = [...new Set([selected, ...ONBOARDING_COMMON_TIME_ZONES, ...supported].filter(Boolean))];
  return timezones.map((timezone) => `<option value="${escapeHtml(timezone)}" ${timezone === selected ? "selected" : ""}>${escapeHtml(timezone.replace(/_/g, " "))}</option>`).join("");
}

function parseAustralianAddress(address) {
  const parts = String(address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const statePostcode = parts.at(-1)?.match(/^(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})$/i);
  if (statePostcode && parts.length >= 3) {
    return { street_address: parts.slice(0, -2).join(", "), suburb: parts.at(-2), state: statePostcode[1].toUpperCase(), postcode: statePostcode[2] };
  }
  const combinedSuburbState = parts.at(-1)?.match(/^(.+?)\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})$/i);
  if (combinedSuburbState && parts.length >= 2) {
    return { street_address: parts.slice(0, -1).join(", "), suburb: combinedSuburbState[1], state: combinedSuburbState[2].toUpperCase(), postcode: combinedSuburbState[3] };
  }
  return { street_address: String(address || ""), suburb: "", state: "", postcode: "" };
}

function formatAustralianAddress({ street_address, suburb, state, postcode }) {
  return [street_address?.trim(), suburb?.trim(), [state?.trim().toUpperCase(), postcode?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

async function showSelfServiceOnboarding(data) {
  const shell = document.getElementById("onboardingWizard");
  // This route is only for an eligible signed-in Owner. Explicitly clear every
  // other gateway panel so a restored page or delayed auth response cannot
  // leave the login card visible behind the onboarding wizard.
  ["ownerAuthPanel", "inviteAuthPanel", "signupPanel", "verificationPanel", "passwordRecoveryPanel", "provisioningRecoveryPanel", "platformConsole"].forEach((id) => document.getElementById(id).classList.add("hidden"));
  const steps = ["business_details", "venue_details", "branding", "menu", "tables", "qr_code", "test_order", "completed"];
  const labels = { business_details:"Business details", venue_details:"Venue details", branding:"Branding", menu:"Menu", tables:"Tables", qr_code:"QR code", test_order:"Test order", completed:"Complete" };
  const first = steps.find((key) => !["completed","skipped"].includes(data.steps?.[key]?.status)) || "completed";
  shell.classList.remove("hidden"); setGatewayVisible(true);
  const render = async (step) => {
    const saved = data.steps?.[step]?.details || {};
    const optional = ["branding", "qr_code", "test_order"].includes(step);
    const stepIndex = steps.indexOf(step);
    const completed = (key) => ["completed", "skipped"].includes(data.steps?.[key]?.status);
    const selectedMenuChoice = saved.choice || "sample_menu";
    const menuChoices = `<fieldset class="onboarding-choice-group" aria-describedby="menuChoiceHelp"><legend>Choose your menu starting point</legend><p class="muted" id="menuChoiceHelp">Start with a ready-to-edit example, or build your own menu from the first item.</p><div class="onboarding-choice-cards"><label class="onboarding-choice-card ${selectedMenuChoice === "sample_menu" ? "is-selected" : ""}"><input type="radio" name="choice" value="sample_menu" ${selectedMenuChoice === "sample_menu" ? "checked" : ""}><span class="onboarding-choice-icon" aria-hidden="true">☷</span><span class="onboarding-choice-content"><span class="onboarding-choice-title">Use a sample menu <span class="onboarding-badge">Recommended</span></span><span class="onboarding-choice-description">Begin with a practical restaurant menu and a small set of tables.</span><span class="onboarding-choice-outcome">Outcome: saving adds a ready-to-customise setup for exploring Aveniq straight away.</span></span><span class="onboarding-choice-indicator" aria-hidden="true"></span></label><label class="onboarding-choice-card ${selectedMenuChoice === "start_from_scratch" ? "is-selected" : ""}"><input type="radio" name="choice" value="start_from_scratch" ${selectedMenuChoice === "start_from_scratch" ? "checked" : ""}><span class="onboarding-choice-icon" aria-hidden="true">＋</span><span class="onboarding-choice-content"><span class="onboarding-choice-title">Start from scratch</span><span class="onboarding-choice-description">Create your own menu, categories and tables when you are ready.</span><span class="onboarding-choice-outcome">Outcome: a clean workspace with no sample items.</span></span><span class="onboarding-choice-indicator" aria-hidden="true"></span></label></div></fieldset><aside class="onboarding-sample-summary ${selectedMenuChoice === "start_from_scratch" ? "hidden" : ""}" data-sample-summary><div><span class="onboarding-summary-icon" aria-hidden="true">✓</span><strong>Sample setup includes</strong></div><ul><li>Example menu categories and items</li><li>A small set of active tables</li><li>A safe starting point for QR ordering</li></ul><p>All sample menu and table data can be edited or removed later.</p><button class="ghost-button" data-generate-sample-setup type="button">Generate sample menu and tables</button></aside>`;
    const fields = step === "business_details" ? `<label class="field"><span>Business name</span><input name="business_name" required value="${escapeHtml(data.organization.name||"")}"></label><label class="field"><span>Country</span><input name="country" required value="${escapeHtml(data.organization.country||"")}"></label><label class="field"><span>Contact email</span><input name="contact_email" type="email" value="${escapeHtml(data.organization.contact_email||"")}"></label><label class="field"><span>Contact phone</span><input name="contact_phone" value="${escapeHtml(data.organization.contact_phone||"")}"></label>` : step === "venue_details" ? `<label class="field"><span>Venue name</span><input name="venue_name" required value="${escapeHtml(data.venue.name||"")}"></label><label class="field"><span>Address</span><input name="address" required value="${escapeHtml(data.venue.address||"")}"></label><label class="field"><span>Timezone</span><select name="timezone" required>${onboardingTimezoneOptions(data.venue.timezone||"UTC")}</select></label><label class="field"><span>Currency</span><input name="currency_code" required value="${escapeHtml(data.venue.currency_code||"")}"></label><label class="field"><span>Ordering type</span><select name="ordering_type"><option value="table">Table ordering</option><option value="counter">Counter ordering</option></select></label>` : step === "branding" ? `<label class="field"><span>Logo URL</span><input name="logo_url" value="${escapeHtml(data.venue.logo_url||"")}"></label><label class="field"><span>Primary colour</span><input name="primary_color" value="${escapeHtml(data.venue.theme_config?.primary_color||"")}"></label><label class="field full-field"><span>Description</span><input name="description" value="${escapeHtml(data.venue.subtitle||"")}"></label>` : step === "menu" ? menuChoices : step === "tables" ? `<p class="muted">Choose how you will create tables later. No tables will be generated in this task.</p><label class="field"><span><input type="radio" name="choice" value="sample_tables" ${saved.choice==="sample_tables"?"checked":""}> Create sample tables later</span></label><label class="field"><span><input type="radio" name="choice" value="create_manually" ${saved.choice==="create_manually"?"checked":""}> Create manually</span></label>` : step === "qr_code" ? `<p class="muted">QR setup will become available after menu and table requirements are met. No QR token or download is created here.</p>` : step === "test_order" ? `<p class="muted">A test order is required before live activation. Test orders are not created in this task.</p>` : `<p class="muted">Finish is available after Business details, Venue details, Menu choice and Tables choice are complete. Live ordering remains disabled.</p>`;
    const stepper = steps.map((key, index) => {
      const state = key === step ? "is-current" : completed(key) ? "is-complete" : "is-upcoming";
      const marker = completed(key) ? "✓" : index + 1;
      const content = `<span class="onboarding-stepper-marker" aria-hidden="true">${marker}</span><span class="onboarding-stepper-label">${labels[key]}</span>`;
      return completed(key) && key !== step ? `<button class="onboarding-stepper-item ${state}" data-step="${key}" type="button">${content}</button>` : `<span class="onboarding-stepper-item ${state}" ${key === step ? 'aria-current="step"' : ""}>${content}</span>`;
    }).join("");
    shell.innerHTML = `<header class="onboarding-header"><div><p class="eyebrow">Self-service setup</p><h1>Complete your setup</h1></div><span>Step ${stepIndex + 1} of ${steps.length}</span></header><nav class="onboarding-stepper" aria-label="Onboarding progress">${stepper}</nav><form class="onboarding-form" id="selfServiceOnboardingForm"><div class="onboarding-form-intro"><p class="eyebrow">Step ${stepIndex + 1}</p><h2>${labels[step]}</h2></div>${fields}<footer class="onboarding-footer"><div>${stepIndex > 0 ? `<button class="ghost-button" data-back type="button">Back</button>` : ""}</div><div class="onboarding-footer-actions">${optional ? `<button class="ghost-button" data-skip type="button">Skip for now</button>` : ""}${step === "completed" ? `<button class="submit-button" data-complete type="button">Mark setup complete</button>` : `<button class="submit-button" type="submit">Save and continue</button>`}</div></footer></form><p class="auth-error hidden" id="onboardingError" role="alert"></p>`;
    requestAnimationFrame(() => shell.querySelector(".onboarding-stepper .is-current")?.scrollIntoView({ block: "nearest", inline: "center" }));
    if (step === "venue_details") {
      const addressField = shell.querySelector('input[name="address"]')?.closest(".field");
      const parsedAddress = parseAustralianAddress(data.venue.address);
      const venueAddress = { ...parsedAddress, street_address: saved.street_address || parsedAddress.street_address, suburb: saved.suburb || parsedAddress.suburb, state: saved.state || parsedAddress.state, postcode: saved.postcode || parsedAddress.postcode };
      if (addressField) addressField.outerHTML = `<label class="field"><span>Street address</span><input name="street_address" autocomplete="street-address" required value="${escapeHtml(venueAddress.street_address)}"></label><label class="field"><span>Suburb</span><input name="suburb" autocomplete="address-level2" required value="${escapeHtml(venueAddress.suburb)}"></label><label class="field"><span>State</span><select name="state" autocomplete="address-level1" required><option value="">Select state</option>${["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"].map((state) => `<option value="${state}" ${venueAddress.state === state ? "selected" : ""}>${state}</option>`).join("")}</select></label><label class="field"><span>Postcode</span><input name="postcode" autocomplete="postal-code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" title="Enter a 4-digit Australian postcode" required value="${escapeHtml(venueAddress.postcode)}"></label>`;
    }
    if (step === "branding") {
      const logoUrlInput = shell.querySelector('input[name="logo_url"]');
      const currentLogoUrl = saved.logo_url || data.venue.logo_url || "";
      if (logoUrlInput) logoUrlInput.closest(".field").outerHTML = `<label class="field"><span>Logo</span><input id="onboardingLogoUpload" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted" id="onboardingLogoHint">JPG, PNG or WebP · up to 5 MB · Your logo will be shown publicly${currentLogoUrl ? " · Current logo will remain unless you choose a new file." : ""}</small><span class="auth-error hidden" id="onboardingLogoError"></span></label>`;
      const logoUpload = shell.querySelector("#onboardingLogoUpload");
      logoUpload?.addEventListener("change", async () => {
        const file = logoUpload.files?.[0]; if (!file) return;
        const submit = shell.querySelector('button[type="submit"]'); const hint = shell.querySelector("#onboardingLogoHint"); const error = shell.querySelector("#onboardingLogoError");
        logoUpload.disabled = true; if (submit) submit.disabled = true; hint.textContent = "Uploading logo…"; error.classList.add("hidden");
        try {
          const logoUrl = await window.TableOrderCloud.uploadBrandingLogo(file);
          let hiddenLogoUrl = shell.querySelector('input[name="logo_url"]'); if (!hiddenLogoUrl) { hiddenLogoUrl = document.createElement("input"); hiddenLogoUrl.type = "hidden"; hiddenLogoUrl.name = "logo_url"; shell.querySelector("form").append(hiddenLogoUrl); } hiddenLogoUrl.value = logoUrl;
          hint.innerHTML = `Logo uploaded · <a href="${escapeHtml(logoUrl)}" target="_blank" rel="noopener">Preview</a>`;
        } catch (uploadError) { error.textContent = uploadError.message || "Logo upload failed."; error.classList.remove("hidden"); hint.textContent = "Choose another image to try again."; }
        finally { logoUpload.disabled = false; if (submit) submit.disabled = false; }
      });
    }
    if (step === "tables") {
      const manualChoice = shell.querySelector('input[name="choice"][value="create_manually"]');
      const selectedChoice = shell.querySelector('input[name="choice"]:checked')?.value;
      manualChoice?.closest(".field")?.insertAdjacentHTML("afterend", `<label class="field ${selectedChoice === "create_manually" ? "" : "hidden"}" data-manual-table-count><span>How many tables?</span><input name="table_count" type="number" min="1" max="5" required value="${escapeHtml(saved.table_count || "1")}"><small class="muted">You can rename or add more tables later. Trial venues can have up to 5 tables.</small></label>`);
      const syncManualTableCount = () => { const panel = shell.querySelector("[data-manual-table-count]"); const input = panel?.querySelector('input[name="table_count"]'); const isManual = shell.querySelector('input[name="choice"]:checked')?.value === "create_manually"; panel?.classList.toggle("hidden", !isManual); if (input) input.disabled = !isManual; };
      shell.querySelectorAll('input[name="choice"]').forEach((choice) => choice.addEventListener("change", syncManualTableCount));
      syncManualTableCount();
    }
    shell.querySelectorAll("[data-step]").forEach((button) => { button.onclick = () => render(button.dataset.step); });
    shell.querySelector("[data-back]")?.addEventListener("click", () => render(steps[stepIndex - 1]));
    if (step === "menu") {
      const cards = [...shell.querySelectorAll(".onboarding-choice-card")];
      const summary = shell.querySelector("[data-sample-summary]");
      cards.forEach((card) => card.querySelector("input")?.addEventListener("change", () => {
        cards.forEach((choice) => choice.classList.toggle("is-selected", choice === card));
        summary?.classList.toggle("hidden", card.querySelector("input")?.value !== "sample_menu");
      }));
      shell.querySelector("[data-generate-sample-setup]")?.addEventListener("click", async (event) => {
        event.currentTarget.closest("form")?.requestSubmit();
      });
    }
    if (step==="qr_code") { const tables=await window.TableOrderCloud.getCurrentQrTables(); const panel=document.createElement("div"); panel.className="team-list"; panel.innerHTML=`<label class="field"><span>Table for this QR</span><select id="qrTable"><option value="">Select an active table</option>${tables.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}${t.qr_active?' (active QR)':''}</option>`).join('')}</select></label><div class="onboarding-actions"><button class="submit-button" id="qrGenerate" type="button">Generate QR</button><button class="ghost-button" id="qrRevoke" type="button">Revoke QR</button></div><p class="muted" id="qrHint">A raw URL is shown only immediately after generation; after refresh, regenerate to obtain a new URL.</p>`; shell.querySelector("form")?.prepend(panel); let rawUrl=""; panel.querySelector('#qrGenerate').onclick=async()=>{const id=panel.querySelector('#qrTable').value;if(!id)return setOwnerFlowError('Select a table first.','onboardingError');if(tables.find(t=>t.id===id)?.qr_active&&!confirm('Regenerate this QR? The previous link will stop working.'))return;try{const raw=await window.TableOrderCloud.generateCurrentQrToken(id);rawUrl=`${location.origin}/order/${encodeURIComponent(raw)}`;panel.querySelector('#qrHint').innerHTML=`Linked to selected table. <a href="${rawUrl}" target="_blank" rel="noopener">Preview</a> · <button id="qrCopy" type="button">Copy URL</button> · <button id="qrDownload" type="button">Download PNG</button>`;panel.querySelector('#qrCopy').onclick=()=>navigator.clipboard?.writeText(rawUrl);panel.querySelector('#qrDownload').onclick=()=>{const c=document.createElement('canvas');c.width=c.height=420;drawQrCanvas(c,rawUrl);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=`aveniq-${id}-qr.png`;a.click();};data=await window.TableOrderCloud.getCurrentOnboarding();}catch(e){setOwnerFlowError(e.message,'onboardingError');}}; panel.querySelector('#qrRevoke').onclick=async()=>{const id=panel.querySelector('#qrTable').value;if(!id)return setOwnerFlowError('Select a table first.','onboardingError');if(!confirm('Revoke this QR? Customers using it will no longer be able to order.'))return;await window.TableOrderCloud.revokeCurrentQrToken(id);render(step);}; }
    if (step==="test_order") { const current=await window.TableOrderCloud.loadOrders(staffUser.restaurantId); const test=current.find(o=>o.is_test_order&&o.status!=="completed"); const action=document.createElement("button"); action.className="submit-button"; action.type="button"; action.textContent=test?`Open Test order (${test.status})`:"Create trusted test order"; action.onclick=async()=>{try{const order=test||await window.TableOrderCloud.createOnboardingTestOrder(); window.location.href=`/dashboard/${encodeURIComponent(staffUser.restaurantSlug)}/kitchen`; }catch(e){setOwnerFlowError(e.message,"onboardingError");}}; shell.querySelector(".onboarding-actions")?.prepend(action); }
    if (step==="completed") { const readiness=await window.TableOrderCloud.getCurrentVenueReadiness(); const labels={DETAILS_INCOMPLETE:['Business and venue details','business_details'],ORDERABLE_MENU_REQUIRED:['Orderable menu item','menu'],ACTIVE_TABLE_REQUIRED:['Active table','tables'],ACTIVE_QR_REQUIRED:['Active QR token','qr_code'],COMPLETED_TEST_ORDER_REQUIRED:['Trusted test order completed','test_order'],ACTIVE_ENTITLEMENT_REQUIRED:['Active Trial or plan','completed']}; const missing=new Set(readiness.blocking_reasons||[]); const list=document.createElement('div');list.className='team-list';list.innerHTML=Object.entries(labels).map(([key,[label,target]])=>`<a class="team-row" href="#${target}"><span>${missing.has(key)?'□':'✓'} ${escapeHtml(label)}</span><strong>${missing.has(key)?'Missing':'Passed'}</strong></a>`).join('');shell.querySelector('form')?.prepend(list);const action=document.createElement('button');action.className='submit-button';action.type='button';action.textContent=readiness.ready?'Activate venue':'Activate venue (requirements missing)';action.disabled=!readiness.ready;action.onclick=async()=>{action.disabled=true;action.textContent='Activating…';try{const result=await window.TableOrderCloud.activateCurrentVenue();if(result.activated){action.textContent='Venue active';window.setTimeout(()=>window.location.href=`/dashboard/${encodeURIComponent(staffUser.restaurantSlug)}/dashboard`,600);}else{setOwnerFlowError(result.blocking_reasons.map(x=>labels[x]?.[0]||x).join(', '),'onboardingError');action.disabled=false;action.textContent='Activate venue';}}catch(e){setOwnerFlowError(e.message,'onboardingError');action.disabled=false;action.textContent='Activate venue';}};shell.querySelector('.onboarding-actions')?.prepend(action); }
    shell.querySelector("form")?.addEventListener("submit",(event)=>{ if (step !== "venue_details") return; const form = event.currentTarget; let address = form.querySelector('input[name="address"]'); if (!address) { address = document.createElement("input"); address.type = "hidden"; address.name = "address"; form.append(address); } address.value = formatAustralianAddress(Object.fromEntries(new FormData(form).entries())); }, { capture: true });
    shell.querySelector("[data-skip]")?.addEventListener("click",async()=>{ data=await window.TableOrderCloud.saveCurrentOnboardingStep(step,"skip",{}); render(step); });
    shell.querySelector("[data-complete]")?.addEventListener("click",async()=>{ try { data=await window.TableOrderCloud.completeCurrentOnboarding(); window.location.href=`/dashboard/${encodeURIComponent(staffUser.restaurantSlug)}/dashboard`; } catch(e){ setOwnerFlowError(e.message,"onboardingError"); } });
    shell.querySelector("form")?.addEventListener("submit",async e=>{ e.preventDefault(); const details=Object.fromEntries(new FormData(e.target)); if ((step==="menu"||step==="tables")&&!details.choice) return setOwnerFlowError("Choose an option to continue.","onboardingError"); const submitters = [...e.currentTarget.querySelectorAll('button[type="submit"], [data-generate-sample-setup]')]; submitters.forEach((button) => button.disabled = true); try { if ((step === "menu" && details.choice === "sample_menu") || (step === "tables" && details.choice === "sample_tables")) await window.TableOrderCloud.createSampleVenueData(); if (step === "tables" && details.choice === "create_manually") await window.TableOrderCloud.createCurrentOnboardingTables(Number(details.table_count)); data=await window.TableOrderCloud.saveCurrentOnboardingStep(step,"complete",details); render(steps[steps.indexOf(step)+1]||"completed"); } catch(err){setOwnerFlowError(err.message,"onboardingError"); submitters.forEach((button) => button.disabled = false);} });
  }; render(steps.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : first);
}

async function showPublicTokenOrder(token) {
  const customer = document.getElementById("customer");
  document.querySelector(".app-header")?.classList.add("hidden"); document.querySelector(".tabs")?.classList.add("hidden");
  customer.classList.add("active-view");
  customer.innerHTML = `<section class="setup-panel"><p class="muted">Loading secure ordering page…</p></section>`;
  try {
    const context = await window.TableOrderCloud.getPublicQrOrderContext(token);
    const cartStorageKey = `aveniq-public-order:${token}`;
    const newPublicOrderId = () => crypto.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
    let cart = [];
    let publicOrderReviewOpen = false;
    let publicOrderSubmissionInProgress = false;
    let publicOrderCustomerName = "";
    let publicOrderNote = "";
    let publicOrderIdempotencyKey = newPublicOrderId();
    const savePublicOrderDraft = () => {
      try {
        sessionStorage.setItem(cartStorageKey, JSON.stringify({ cart, customerName: publicOrderCustomerName, note: publicOrderNote, idempotencyKey: publicOrderIdempotencyKey }));
      } catch {}
    };
    const clearPublicOrderDraft = () => {
      try { sessionStorage.removeItem(cartStorageKey); } catch {}
    };
    try {
      const draft = JSON.parse(sessionStorage.getItem(cartStorageKey) || "null");
      const menuById = new Map((context.menu || []).map((item) => [item.id, item]));
      if (draft && Array.isArray(draft.cart)) {
        cart = draft.cart
          .map((line) => ({ ...menuById.get(line.id), quantity: Number(line.quantity) || 0 }))
          .filter((line) => line.id && line.quantity > 0);
        publicOrderCustomerName = String(draft.customerName || "");
        publicOrderNote = String(draft.note || "");
        publicOrderIdempotencyKey = typeof draft.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.idempotencyKey) ? draft.idempotencyKey : publicOrderIdempotencyKey;
      }
    } catch {}
    const render = () => {
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
      const menuCards = context.menu?.length ? context.menu.map((item) => {
        const imageUrl = item.image_url || item.photo_url || "";
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const photo = imageUrl
          ? `<div class="food-photo custom-photo" style="background-image:url('${escapeHtml(imageUrl)}')" role="img" aria-label="${escapeHtml(item.name)}"></div>`
          : `<div class="food-photo" role="img" aria-label="${escapeHtml(item.name)}"></div>`;
        return `<article class="menu-card">
          ${photo}
          <div class="menu-body">
            <div class="menu-meta"><h3>${escapeHtml(item.name)}</h3></div>
            <p class="menu-category">${escapeHtml(item.category || "Menu")}</p>
            <p class="menu-desc">${escapeHtml(item.description || "")}</p>
            ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </div>
          <div class="menu-buy"><strong>${money(item.price)}</strong><button type="button" aria-label="Add ${escapeHtml(item.name)}" data-add="${item.id}" ${publicOrderSubmissionInProgress ? "disabled" : ""}>+</button></div>
        </article>`;
      }).join("") : '<p class="empty-state">No items are available right now.</p>';
      customer.innerHTML = `<section class="public-order-shell">
        <section class="public-order-menu">
          <header class="public-order-heading"><p class="eyebrow">${escapeHtml(context.table_name)}</p><h1>${escapeHtml(context.restaurant_name)}</h1><p class="muted">Order from your table</p></header>
          <div class="menu-grid" aria-label="Menu items">${menuCards}</div>
        </section>
        <aside class="public-order-cart" id="publicOrderCart"><h2>${publicOrderReviewOpen ? "Review order" : "Your order"}</h2>${publicOrderReviewOpen ? '<p class="muted">Check your items before sending them to the kitchen.</p>' : ""}<div>${cart.length ? cart.map((item) => `<div class="team-row"><span>${escapeHtml(item.name)} × ${item.quantity}</span><button class="ghost-button" data-remove="${item.id}" ${publicOrderSubmissionInProgress ? "disabled" : ""}>Remove</button></div>`).join("") : '<p class="muted">Your cart is empty.</p>'}</div><div class="totals"><span>Current total</span><strong>${money(total)}</strong></div><input id="tokenCustomerName" placeholder="Your name (optional)" value="${escapeHtml(publicOrderCustomerName)}"><textarea id="tokenOrderNote" placeholder="Notes (optional)">${escapeHtml(publicOrderNote)}</textarea><button class="submit-button" id="tokenSubmit" ${cart.length && !publicOrderSubmissionInProgress ? "" : "disabled"}>${publicOrderSubmissionInProgress ? "Sending order…" : publicOrderReviewOpen ? `Send to kitchen · ${money(total)}` : `Review order (${itemCount})`}</button>${publicOrderReviewOpen ? '<button class="ghost-button" id="tokenContinueOrdering" type="button">Continue ordering</button>' : ""}<p class="auth-error hidden" id="tokenOrderError"></p></aside>
        ${itemCount ? `<button class="public-floating-cart" type="button" data-public-cart>${itemCount} item${itemCount === 1 ? "" : "s"} <strong>${money(total)}</strong><span>View cart</span></button>` : ""}
      </section>`;
      customer.querySelectorAll("[data-add]").forEach((button) => button.onclick = () => {
        const item = context.menu.find((entry) => entry.id === button.dataset.add);
        const line = cart.find((entry) => entry.id === item.id);
        if (line) line.quantity += 1; else cart.push({ ...item, quantity: 1 });
        savePublicOrderDraft();
        render();
      });
      customer.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => {
        const line = cart.find((entry) => entry.id === button.dataset.remove);
        if (line.quantity > 1) line.quantity -= 1; else cart = cart.filter((entry) => entry !== line);
        savePublicOrderDraft();
        render();
      });
      customer.querySelector("[data-public-cart]")?.addEventListener("click", () => customer.querySelector("#publicOrderCart")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      customer.querySelector("#tokenCustomerName")?.addEventListener("input", (event) => { publicOrderCustomerName = event.target.value; savePublicOrderDraft(); });
      customer.querySelector("#tokenOrderNote")?.addEventListener("input", (event) => { publicOrderNote = event.target.value; savePublicOrderDraft(); });
      customer.querySelector("#tokenContinueOrdering")?.addEventListener("click", () => { publicOrderReviewOpen = false; render(); });
      customer.querySelector("#tokenSubmit")?.addEventListener("click", async () => {
        if (!publicOrderReviewOpen) { publicOrderReviewOpen = true; render(); return; }
        if (publicOrderSubmissionInProgress || !cart.length) return;
        publicOrderSubmissionInProgress = true;
        const submittedCart = cart.map((item) => ({ menu_item_id: item.id, quantity: item.quantity }));
        const submittedCustomerName = publicOrderCustomerName;
        const submittedNote = publicOrderNote;
        render();
        try {
          const result = await window.TableOrderCloud.submitPublicQrOrder(token, submittedCart, submittedCustomerName, submittedNote, publicOrderIdempotencyKey);
          clearPublicOrderDraft();
          customer.innerHTML = `<section class="setup-panel"><h1>Order received</h1><p>Your order #${escapeHtml(result.order_number)} is with the venue.</p></section>`;
        } catch {
          publicOrderSubmissionInProgress = false;
          render();
          const notice = customer.querySelector("#tokenOrderError");
          notice.textContent = "This QR ordering link is unavailable or the order could not be placed.";
          notice.classList.remove("hidden");
        }
      });
    };
    render();
  } catch { customer.innerHTML = `<section class="setup-panel"><h1>QR ordering unavailable</h1><p class="muted">This QR code is invalid, revoked, expired, or ordering is not available.</p></section>`; }
}

async function initializeAccountFlow() {
  const route = window.TableOrderCloud?.routeContext?.() || APP_ROUTE;
  if (route.area === "token-order") { await showPublicTokenOrder(route.publicToken); return; }
  if (["order", "restaurant"].includes(route.area)) return;
  const params = new URLSearchParams(window.location.search);
  if (route.area === "verify" && params.get("error")) {
    showVerification({ title: "Verification link unavailable", description: "This verification link is invalid, expired, or has already been used.", error: "Request a new verification email below." });
    return;
  }
  window.TableOrderCloud.consumeAuthRedirect?.();
  if (route.area === "signup") { showSignup(); return; }
  if (route.area === "verify") {
    const session = await window.TableOrderCloud.getSession();
    const verified = session?.user?.email_confirmed_at;
    if (verified) {
      const isSelfServiceSignup = session?.user?.user_metadata?.registration_type === "self_service";
      showVerification({
        title: "Email verified",
        description: isSelfServiceSignup
          ? "Your account is verified. Your organization, first restaurant and 90-day free trial are being prepared."
          : "Your account is verified. Return to your restaurant invitation link to join the team."
      });
      document.getElementById("resendVerificationForm").classList.add("hidden");
    } else showVerification();
    return;
  }
  if (route.area === "forgot-password") { showPasswordRecovery(false); return; }
  if (route.area === "reset-password") {
    const session = await window.TableOrderCloud.getSession();
    showPasswordRecovery(true, session ? "" : "This reset link is invalid or has expired. Request a new one.");
    return;
  }
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
    if (["dashboard", "kitchen", "frontdesk", "reports", "attendance", "setup"].includes(route.area)) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(staffLoginUrl(route.restaurantSlug, next));
      return;
    }
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
  document.getElementById("retryProvisioning").addEventListener("click", retrySelfServiceProvisioning);
  document.getElementById("provisioningSignOut").addEventListener("click", async () => {
    await window.TableOrderCloud.signOut();
    window.history.replaceState({}, "", "/login");
    showOwnerAuth();
  });
  document.getElementById("inviteAuthForm").addEventListener("submit", handleInviteAuth);
  document.getElementById("signupForm").addEventListener("submit", handleSelfServiceSignup);
  document.getElementById("resendVerificationForm").addEventListener("submit", handleResendVerification);
  document.getElementById("passwordRecoveryForm").addEventListener("submit", handlePasswordRecovery);
  document.getElementById("toggleInviteAuthMode").addEventListener("click", () => updateInviteAuthMode(inviteAuthMode === "signup" ? "login" : "signup"));
  document.getElementById("platformRestaurantForm").addEventListener("submit", createPlatformRestaurant);
  document.getElementById("refreshPlatformRestaurants").addEventListener("click", loadPlatformRestaurants);
  document.getElementById("platformLogout").addEventListener("click", handlePlatformLogout);
  document.getElementById("platformRestaurantInviteForm").addEventListener("submit", createPlatformRestaurantTeamInvite);
  document.getElementById("refreshPlatformTeam").addEventListener("click", loadPlatformTeam);
  document.getElementById("closePlatformTeam").addEventListener("click", () => {
    platformTeamRestaurant = null;
    document.getElementById("platformTeamPanel").classList.add("hidden");
  });
  document.getElementById("onboardingRestaurantForm").addEventListener("submit", createOnboardingRestaurant);
  document.getElementById("onboardingTablesForm").addEventListener("submit", createOnboardingTables);
  document.getElementById("onboardingMenuForm").addEventListener("submit", addOnboardingMenuItem);
  document.getElementById("importSampleMenu").addEventListener("click", importOnboardingSampleMenu);
  document.getElementById("continueFromMenu").addEventListener("click", () => setOnboardingStep(4));
  document.getElementById("onboardingDownloadAllQr").addEventListener("click", downloadAllQrCodes);
  document.getElementById("onboardingPrintQr").addEventListener("click", printQrSheet);
  document.getElementById("finishOnboarding").addEventListener("click", finishOnboarding);
  document.getElementById("staffLogoutButton").addEventListener("click", handleStaffLogout);
  document.getElementById("staffLoginForm").addEventListener("submit", handleStaffLogin);
  document.getElementById("cancelStaffLogin").addEventListener("click", closeStaffLogin);
  document.getElementById("staffAuthModal").addEventListener("click", (event) => {
    if (event.target.id === "staffAuthModal") closeStaffLogin();
  });
  document.getElementById("attendancePinForm").addEventListener("submit", saveAttendancePin);
  document.getElementById("generateAttendancePin").addEventListener("click", generateAttendancePin);
  document.getElementById("closeAttendancePin").addEventListener("click", closeAttendancePinModal);
  document.getElementById("doneAttendancePin").addEventListener("click", closeAttendancePinModal);
  document.getElementById("attendancePinModal").addEventListener("click", (event) => {
    if (event.target.id === "attendancePinModal") closeAttendancePinModal();
  });
  document.getElementById("clearCart").addEventListener("click", () => {
    if (orderSubmissionInProgress) return;
    state.cart = [];
    lastConfirmedOrderId = "";
    saveState();
    renderCart();
  });

  document.getElementById("submitOrder").addEventListener("click", openReviewOrder);
  document.getElementById("printKitchen").addEventListener("click", printKitchen);
  document.getElementById("mobileCartDock").addEventListener("click", () => {
    document.querySelector(".order-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("customerThemeToggle").addEventListener("click", () => {
    setCustomerAppearance(!document.body.classList.contains("customer-night"));
  });
  document.getElementById("mobileBottomNav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-nav], [data-mobile-view]");
    if (!button) return;
    const action = button.dataset.mobileNav;
    if (action) {
      activeMobileCustomerNav = action;
      document.querySelectorAll("#mobileBottomNav [data-mobile-nav]").forEach((navButton) => {
        const isActive = navButton.dataset.mobileNav === action;
        navButton.classList.toggle("active", isActive);
        navButton.toggleAttribute("aria-current", isActive);
      });
    }
    if (action === "home") window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "menu") document.getElementById("categoryRow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (action === "orders") scrollToCustomerOrderStatus();
    if (action === "account") openStaffLogin();
    const merchantView = button.dataset.mobileView;
    if (merchantView) {
      setView(merchantView);
      document.querySelectorAll("#mobileBottomNav [data-mobile-view]").forEach((navButton) => {
        const isActive = navButton.dataset.mobileView === merchantView;
        navButton.classList.toggle("active", isActive);
        navButton.toggleAttribute("aria-current", isActive);
      });
    }
  });
  document.getElementById("clearLocalOrders").addEventListener("click", () => {
    clearKitchenNewOrderAlert();
    showOrderToast("Local display cleared. Orders were not deleted.");
  });
  document.getElementById("printReport").addEventListener("click", printDailyReport);
  document.getElementById("exportReportCsv").addEventListener("click", exportCurrentReportCsv);
  document.getElementById("openSharedClock").addEventListener("click", openSharedClock);
  document.getElementById("enableStaffClockLink").addEventListener("click", () => saveStaffClockLink());
  document.getElementById("regenerateStaffClockLink").addEventListener("click", () => saveStaffClockLink(true));
  document.getElementById("disableStaffClockLink").addEventListener("click", async () => { if (!window.confirm("Disable this external Staff Clock link?")) return; await window.TableOrderCloud.disableStaffClockLink(staffUser.restaurantId); staffClockLink = { ...(staffClockLink || {}), active: false }; try { sessionStorage.removeItem(`aveniq-staff-clock-link:${staffUser.restaurantId}`); } catch {} renderStaffClockLink(); });
  document.getElementById("copyStaffClockLink").addEventListener("click", async () => { const url = staffClockStoredUrl(); if (!url) return; try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this Staff Clock link", url); } });
  document.getElementById("openStaffClockLink").addEventListener("click", () => { const url = staffClockStoredUrl(); if (url) window.open(url, "_blank", "noopener"); });
  document.getElementById("closeAttendanceReports").addEventListener("click", () => { attendanceReport.open = false; document.getElementById("attendanceReportsPanel").classList.add("hidden"); });
  document.getElementById("attendanceReportApply").addEventListener("click", loadAttendanceReport);
  document.getElementById("attendanceReportPrevious").addEventListener("click", () => shiftAttendanceReportWeek(-1));
  document.getElementById("attendanceReportNext").addEventListener("click", () => shiftAttendanceReportWeek(1));
  document.getElementById("attendanceReportExportDetail").addEventListener("click", () => exportAttendanceReport("detail"));
  document.getElementById("attendanceReportExportSummary").addEventListener("click", () => exportAttendanceReport("summary"));
  document.getElementById("closeAttendanceReportDetail").addEventListener("click", () => document.getElementById("attendanceReportDetailModal").classList.add("hidden"));
  document.getElementById("attendanceReportDetailModal").addEventListener("click", (event) => { if (event.target.id === "attendanceReportDetailModal") event.currentTarget.classList.add("hidden"); });
  document.getElementById("saveAttendanceReportSettings").addEventListener("click", async () => { try { attendanceReport.settings = await window.TableOrderCloud.updateAttendanceReportSettings(staffUser.restaurantId, Number(document.getElementById("attendanceReportWeekStarts").value)); showOrderToast("Attendance report setting saved.", "success"); } catch (error) { setAttendanceReportStatus("You do not have permission to change report settings."); } });
  document.getElementById("closeSharedClock").addEventListener("click", closeSharedClock);
  document.getElementById("sharedClockModal").addEventListener("click", (event) => { if (event.target.id === "sharedClockModal") closeSharedClock(); });
  document.getElementById("exportAttendanceCsv").addEventListener("click", exportAttendanceCsv);
  document.getElementById("refreshAttendance").addEventListener("click", renderAttendance);
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
  document.getElementById("mobileHeaderMenu").addEventListener("click", () => {
    const header = document.querySelector(".app-header");
    const isOpen = header.classList.toggle("mobile-menu-open");
    document.getElementById("mobileHeaderMenu").setAttribute("aria-expanded", String(isOpen));
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
  renderAttendance();
  renderSetup();
}

async function initializePublicTenantMenu() {
  const route = window.TableOrderCloud?.routeContext?.() || APP_ROUTE;
  if (route.area !== "app" || window.location.pathname !== "/") return false;

  let tenant;
  try {
    tenant = await window.TableOrderCloud.getPublicTenantContext(window.location.hostname);
  } catch {
    return false;
  }
  const venues = tenant?.venues || [];
  if (!venues.length) return false;

  const customer = document.getElementById("customer");
  const headerLogin = document.getElementById("staffLoginButton");
  const publicMenu = async (venue) => {
    const data = await window.TableOrderCloud.request("rpc/get_public_restaurant", {
      method: "POST", body: JSON.stringify({ p_slug: venue.slug, p_table_ref: "" })
    });
    const restaurant = data.restaurant || venue;
    const items = data.menu_items || [];
    document.getElementById("restaurantTitle").textContent = restaurant.name || venue.name;
    document.getElementById("brandSubtitle").textContent = restaurant.subtitle || "Restaurant menu";
    headerLogin.href = staffLoginUrl(venue.slug);
    const publicMenuCards = items.map((item) => {
      const photoUrl = normalizePhotoUrl(item.image_url || item.photo_url || (restaurant.slug === "sake-street" ? sakeStreetMenuPhotoUrl(item.name) : ""));
      const photo = photoUrl
        ? `<div class="food-photo custom-photo" style="background-image: url('${escapeHtml(photoUrl)}')" role="img" aria-label="${escapeHtml(item.name)}"></div>`
        : "";
      return `<article class="menu-card">${photo}<div class="menu-body"><div class="menu-meta"><h3>${escapeHtml(item.name)}</h3></div><p class="menu-category">${escapeHtml(item.category || "Menu")}</p><p class="menu-desc">${escapeHtml(item.description || "")}</p></div><div class="menu-buy"><strong>${money(item.price)}</strong></div></article>`;
    }).join("");
    customer.innerHTML = `<section class="public-tenant-menu"><div class="public-tenant-menu-heading"><p class="eyebrow">Restaurant menu</p><h2>${escapeHtml(restaurant.name || venue.name)}</h2>${restaurant.address ? `<p class="muted">${escapeHtml(restaurant.address)}</p>` : ""}</div><div class="menu-grid" aria-label="Menu items">${items.length ? publicMenuCards : '<p class="muted">The menu is being updated. Please check back shortly.</p>'}</div><p class="public-menu-ordering-note">For table ordering, please scan the QR code at your table.</p></section>`;
  };

  document.body.classList.add("public-tenant-menu-active");
  document.querySelector(".tabs")?.classList.add("hidden");
  document.getElementById("mobileBottomNav")?.classList.add("hidden");
  headerLogin.classList.remove("hidden");
  if (venues.length === 1) {
    await publicMenu(venues[0]);
  } else {
    headerLogin.href = "/staff";
    customer.innerHTML = `<section class="public-tenant-menu public-location-selector"><p class="eyebrow">Choose a location</p><h2>${escapeHtml(tenant.name || "Our locations")}</h2><p class="muted">Select the venue whose menu you would like to view.</p><div class="team-list">${venues.map((venue) => `<button class="team-row" type="button" data-venue-slug="${escapeHtml(venue.slug)}"><span><strong>${escapeHtml(venue.name)}</strong><small>${escapeHtml(venue.address || "")}</small></span><strong>View menu</strong></button>`).join("")}</div></section>`;
    customer.querySelectorAll("[data-venue-slug]").forEach((button) => button.addEventListener("click", () => {
      const venue = venues.find((entry) => entry.slug === button.dataset.venueSlug);
      if (venue) publicMenu(venue).catch(() => { customer.innerHTML = '<section class="public-tenant-menu"><h2>Menu unavailable</h2><p class="muted">Please try again shortly.</p></section>'; });
    }));
  }
  return true;
}

renderTabs();
bindGlobalActions();
bindAdminSettingsNavigation();
try { setCustomerAppearance(localStorage.getItem("aveniq-customer-appearance") === "dark"); } catch {}
observeCustomerCartPanel();
updateSafariBottomInset();
window.visualViewport?.addEventListener("resize", updateSafariBottomInset);
window.visualViewport?.addEventListener("scroll", updateSafariBottomInset);
async function bootApplicationShell() {
  if (APP_ROUTE.area === "staff-clock") {
    document.body.classList.remove("app-starting");
    await initializeExternalStaffClock();
    return;
  }

  const isPublicTenant = await initializePublicTenantMenu();
  if (isPublicTenant) {
    document.body.classList.remove("app-starting");
    return;
  }

  // Do not render the locally stored Demo restaurant before the URL/session
  // route has chosen its public menu or account screen.
  document.body.dataset.activeView = "customer";
  document.body.dataset.layoutFamily = "operations";
  render();
  checkDatabaseConnection();
  loadCloudDataIntoApp({ silent: true });
  await initializeStaffAuth();
  await initializeAccountFlow();
  startCustomerOrderStatusSync();
  document.body.classList.remove("app-starting");
}

bootApplicationShell().catch((error) => {
  console.warn("Application shell could not be initialized:", error.message);
  document.body.classList.remove("app-starting");
});

function updateOfflineBanner() {
  const banner = document.getElementById("offlineBanner");
  banner?.classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("online", () => { updateOfflineBanner(); if (staffUser) { syncCloudOrders({ notify: false }); refreshStaffPresence(); } });
window.addEventListener("offline", updateOfflineBanner);
updateOfflineBanner();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && staffUser) { syncCloudOrders({ notify: false }); refreshStaffPresence(); }
  if (!document.hidden && !staffUser) syncCustomerOrderStatuses();
});
document.addEventListener("keydown", (event) => {
  if (document.getElementById("sharedClockModal")?.classList.contains("hidden")) return;
  if (event.key === "Tab") {
    const controls = [...document.querySelectorAll("#sharedClockModal button:not([disabled])")];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement);
    const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault(); controls[next].focus(); return;
  }
  if (/^\d$/.test(event.key)) { event.preventDefault(); clockKey(event.key); }
  if (event.key === "Backspace") { event.preventDefault(); clockKey("back"); }
  if (event.key === "Escape") closeSharedClock();
});
