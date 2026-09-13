(function createAveniqCloud() {
  const config = window.TABLEORDER_SUPABASE || {};
  const SESSION_KEY = "aveniq-owner-session";
  let authSession = readStoredSession();
  let activeMembership = null;
  let activePlatformDashboard = null;

  function routeContext() {
    const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(window.location.search);
    if (parts[0] === "order" && parts[1] && !parts[2]) return { area: "order", token: parts[1], restaurantSlug: "", tableRef: "" };
    if (parts[0] === "order") return { area: "legacy-order", token: "", restaurantSlug: "", tableRef: "" };
    if (parts[0] === "dashboard" && parts[1]) return { area: parts[2] || "dashboard", restaurantSlug: parts[1], tableRef: "" };
    if (parts[0] === "r" && parts[1]) return { area: "restaurant", restaurantSlug: parts[1], tableRef: params.get("table") || "" };
    if (parts[0] === "join" && parts[1]) return { area: "join", restaurantSlug: "", tableRef: "", inviteToken: parts[1] };
    if (["signup", "login", "onboarding", "platform"].includes(parts[0])) return { area: parts[0], restaurantSlug: params.get("restaurant") || "", tableRef: "" };
    return { area: "app", restaurantSlug: params.get("restaurant") || config.restaurantSlug || "demo", tableRef: params.get("table") || params.get("token") || "" };
  }

  function restaurantSlug() {
    return routeContext().restaurantSlug || activeMembership?.restaurantSlug || config.restaurantSlug || "demo";
  }

  function readStoredSession() {
    try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  }

  function storeSession(session) {
    authSession = session ? { ...session, expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600) } : null;
    if (authSession) window.localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
    else window.localStorage.removeItem(SESSION_KEY);
    return authSession;
  }

  function activeAccessToken() {
    if (!authSession?.access_token || Number(authSession.expires_at || 0) <= Math.floor(Date.now() / 1000) + 15) return "";
    return authSession.access_token;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const error = new Error(data?.msg || data?.message || data?.error_description || data?.hint || `Supabase request failed (${response.status}).`);
      error.status = response.status;
      error.code = data?.code || data?.error || "";
      throw error;
    }
    return data;
  }

  async function request(path, options = {}) {
    if (!config.url || !config.publishableKey) throw new Error("Supabase configuration is missing.");
    const { accessToken, ...fetchOptions } = options;
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...fetchOptions,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken || activeAccessToken() || config.publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    return parseResponse(response);
  }

  async function authRequest(path, options = {}) {
    if (!config.url || !config.publishableKey) throw new Error("Supabase configuration is missing.");
    const response = await fetch(`${config.url}/auth/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${options.accessToken || activeAccessToken() || config.publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    return parseResponse(response);
  }

  async function signUp(email, password) {
    const redirectTo = window.location.href.split("#")[0];
    const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: JSON.stringify({ email: String(email || "").trim().toLowerCase(), password }) });
    if (result?.access_token) storeSession(result);
    return result;
  }

  function consumeAuthRedirect() {
    if (!window.location.hash.includes("access_token=")) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    const session = storeSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(params.get("expires_in")) || 3600,
      token_type: params.get("token_type") || "bearer",
      user: null
    });
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
    return session;
  }

  async function signInWithPassword(emailOrUsername, password) {
    const value = String(emailOrUsername || "").trim().toLowerCase();
    const email = value.includes("@") ? value : (value === String(config.staffUsername || "staff").toLowerCase() ? config.staffEmail : value);
    const session = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    return storeSession(session);
  }

  async function refreshSession() {
    if (!authSession?.refresh_token) return storeSession(null);
    try {
      return storeSession(await authRequest("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: authSession.refresh_token }) }));
    } catch (error) {
      storeSession(null);
      // A refresh token can be revoked, rotated in another tab, or simply expire.
      // That is a normal signed-out state, not an application error to surface on load.
      if ([400, 401].includes(error.status)) return null;
      throw error;
    }
  }

  async function getSession() {
    if (activeAccessToken()) {
      if (!authSession?.user?.id) {
        const user = await authRequest("user", { accessToken: authSession.access_token });
        storeSession({ ...authSession, user });
      }
      return authSession;
    }
    if (!authSession?.refresh_token) return null;
    return refreshSession();
  }

  async function getMemberships() {
    const session = await getSession();
    if (!session?.user?.id) return [];
    return request(
      `restaurant_staff?select=id,restaurant_id,role,restaurants(id,slug,name,status)&user_id=eq.${encodeURIComponent(session.user.id)}`,
      { accessToken: session.access_token }
    );
  }

  async function getStaffProfile() {
    const session = await getSession();
    if (!session?.user?.id) return null;
    const memberships = await getMemberships();
    if (!memberships.length) {
      const error = new Error("ONBOARDING_REQUIRED");
      error.code = "ONBOARDING_REQUIRED";
      throw error;
    }
    const slug = routeContext().restaurantSlug;
    if (!slug) {
      const error = new Error("TENANT_SELECTION_REQUIRED");
      error.code = "TENANT_SELECTION_REQUIRED";
      throw error;
    }
    const membership = memberships.find((entry) => entry.restaurants?.slug === slug);
    if (!membership) throw new Error("This account does not have access to this restaurant.");
    const related = Array.isArray(membership.restaurants) ? membership.restaurants[0] : membership.restaurants;
    activeMembership = { restaurantId: membership.restaurant_id, restaurantSlug: related?.slug, role: membership.role };
    return {
      id: session.user.id,
      email: session.user.email || "Staff",
      restaurantId: membership.restaurant_id,
      restaurantSlug: related?.slug || slug,
      restaurantName: related?.name || "Restaurant",
      restaurantStatus: related?.status || "active",
      role: membership.role
    };
  }

  async function getPlatformProfile() {
    const session = await getSession();
    if (!session?.user?.id) return null;
    const rows = await request(
      `platform_admins?select=user_id,created_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
      { accessToken: session.access_token }
    );
    if (!rows?.[0]) return null;
    return { id: session.user.id, email: session.user.email || "Master", role: "platform_admin" };
  }

  async function getPlatformDashboardProfile(slug) {
    const session = await getSession();
    const platform = await getPlatformProfile();
    if (!session?.user?.id || !platform || !slug) {
      const error = new Error("PLATFORM_RESTAURANT_NOT_FOUND");
      error.code = "PLATFORM_RESTAURANT_NOT_FOUND";
      throw error;
    }
    const rows = await request(`restaurants?select=id,slug,name,status&slug=eq.${encodeURIComponent(slug)}&limit=2`, { accessToken: session.access_token });
    if (!Array.isArray(rows) || rows.length !== 1) {
      const error = new Error("PLATFORM_RESTAURANT_NOT_FOUND");
      error.code = "PLATFORM_RESTAURANT_NOT_FOUND";
      throw error;
    }
    const restaurant = rows[0];
    activePlatformDashboard = { userId: platform.id, restaurantId: restaurant.id, restaurantSlug: restaurant.slug, restaurantName: restaurant.name, restaurantStatus: restaurant.status };
    return { id: platform.id, email: platform.email, ...activePlatformDashboard, role: "platform_admin" };
  }

  async function loadPlatformRestaurants() {
    const session = await getSession();
    if (!session) throw new Error("Master login is required.");
    return request(
      "restaurants?select=id,name,slug,restaurant_type,phone,address,status,is_open,created_at&order=created_at.desc",
      { accessToken: session.access_token }
    );
  }

  async function platformCreateRestaurant(profile) {
    const session = await getSession();
    if (!session) throw new Error("Master login is required.");
    return request("rpc/platform_create_restaurant", {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify({
        p_name: profile.name,
        p_restaurant_type: profile.restaurantType || "",
        p_phone: profile.phone || "",
        p_address: profile.address || "",
        p_table_count: Number(profile.tableCount) || 1
      })
    });
  }

  async function createRestaurantInvite(restaurantId, email, role) {
    const session = await getSession();
    return request("rpc/create_restaurant_invite", {
      method: "POST", accessToken: session?.access_token,
      body: JSON.stringify({ p_restaurant_id: restaurantId, p_email: email, p_role: role })
    });
  }

  async function acceptRestaurantInvite(token) {
    const session = await getSession();
    if (!session) throw new Error("Please sign in to accept this invitation.");
    return request("rpc/accept_restaurant_invite", {
      method: "POST", accessToken: session.access_token,
      body: JSON.stringify({ p_token: token })
    });
  }

  async function listRestaurantTeam(restaurantId) {
    const session = await getSession();
    return request("rpc/list_restaurant_team", {
      method: "POST", accessToken: session?.access_token,
      body: JSON.stringify({ p_restaurant_id: restaurantId })
    });
  }

  async function revokeRestaurantInvite(inviteId) {
    const session = await getSession();
    return request("rpc/revoke_restaurant_invite", {
      method: "POST", accessToken: session?.access_token,
      body: JSON.stringify({ p_invite_id: inviteId })
    });
  }

  async function signOut() {
    const token = activeAccessToken();
    try { if (token) await authRequest("logout", { method: "POST", accessToken: token }); }
    finally { activeMembership = null; activePlatformDashboard = null; storeSession(null); }
  }

  async function issuePublicQrTableToken(restaurantId, tableId, expiresAt = null) {
    const session = await getSession();
    if (!session) throw new Error("Staff login is required.");
    return request("rpc/issue_public_qr_table_token", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: restaurantId, p_table_id: tableId, p_expires_at: expiresAt }) });
  }
  async function getPublicQrTableTokenMetadata(restaurantId) {
    const session = await getSession();
    if (!session) throw new Error("Staff login is required.");
    return request("rpc/get_public_qr_table_token_metadata", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: restaurantId }) });
  }
  function getPublicQrOrderContext(token) { return request("rpc/get_public_qr_order_context", { method: "POST", body: JSON.stringify({ p_token: token }) }); }
  function submitPublicQrOrder(token, items, note, customerName, idempotencyKey) { return request("rpc/submit_public_qr_order", { method: "POST", body: JSON.stringify({ p_token: token, p_items: items, p_note: note || "", p_customer_name: customerName || "", p_idempotency_key: idempotencyKey }) }); }
  function getPublicQrOrderStatus(token, orderId) { return request("rpc/get_public_qr_order_status", { method: "POST", body: JSON.stringify({ p_token: token, p_order_id: orderId }) }); }

  async function checkConnection() {
    const context = routeContext();
    if (context.area !== "order") return null;
    try { return (await getPublicQrOrderContext(context.token))?.restaurant || null; }
    catch (error) { if (error.status === 404 || /PUBLIC_TOKEN_NOT_FOUND|PUBLIC_ORDERING_UNAVAILABLE|ENTITLEMENT_NOT_ACTIVE/.test(error.message)) return null; throw error; }
  }

  async function loadRestaurantData() {
    const context = routeContext();
    if (context.area === "order") {
      const data = await getPublicQrOrderContext(context.token);
      return { restaurant: data.restaurant, tables: data.table ? [{ id: data.table.id, local_id: data.table.id, table_name: data.table.name, table_number: data.table.number }] : [], menuItems: data.menu_items || [], categories: data.categories || [], publicToken: context.token };
    }
    const session = await getSession();
    const profile = activePlatformDashboard?.userId === session?.user?.id && activePlatformDashboard?.restaurantSlug === context.restaurantSlug
      ? { id: session?.user?.id, email: session?.user?.email || "Master", ...activePlatformDashboard, role: "platform_admin" }
      : await getStaffProfile();
    const [restaurant, tables, menuItems, publicQrTokenMetadata] = await Promise.all([
      request(`restaurants?select=*&id=eq.${encodeURIComponent(profile.restaurantId)}&limit=1`, { accessToken: session.access_token }),
      request(`tables?select=*&restaurant_id=eq.${encodeURIComponent(profile.restaurantId)}&order=sort_order.asc`, { accessToken: session.access_token }),
      request(`menu_items?select=*&restaurant_id=eq.${encodeURIComponent(profile.restaurantId)}&is_active=eq.true&is_available=eq.true&sold_out=eq.false&order=sort_order.asc`, { accessToken: session.access_token }),
      getPublicQrTableTokenMetadata(profile.restaurantId)
    ]);
    return { restaurant: restaurant?.[0], tables: tables || [], menuItems: menuItems || [], publicQrTokenMetadata: publicQrTokenMetadata || [] };
  }

  async function createRestaurant(profile) {
    const session = await getSession();
    if (!session) throw new Error("Please sign in before creating your restaurant.");
    const restaurant = await request("rpc/create_restaurant_for_owner", {
      method: "POST", accessToken: session.access_token,
      body: JSON.stringify({
        p_name: profile.name, p_restaurant_type: profile.restaurantType || "", p_phone: profile.phone || "",
        p_address: profile.address || "", p_logo_url: profile.logoUrl || "", p_timezone: profile.timezone || "Australia/Sydney"
      })
    });
    activeMembership = { restaurantId: restaurant.id, restaurantSlug: restaurant.slug, role: "owner" };
    return restaurant;
  }

  async function createTables(restaurantId, count) {
    const session = await getSession();
    return request("rpc/create_restaurant_tables", { method: "POST", accessToken: session?.access_token, body: JSON.stringify({ p_restaurant_id: restaurantId, p_count: Number(count) }) });
  }

  async function ensureCategory(restaurantId, name, sortOrder = 0) {
    const session = await getSession();
    const encodedName = encodeURIComponent(String(name || "Menu").trim());
    const existing = await request(`categories?select=id,name&restaurant_id=eq.${encodeURIComponent(restaurantId)}&name=eq.${encodedName}&limit=1`, { accessToken: session?.access_token });
    if (existing?.[0]) return existing[0];
    const created = await request("categories", {
      method: "POST", accessToken: session?.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, name: String(name || "Menu").trim(), sort_order: sortOrder })
    });
    return created?.[0];
  }

  async function createMenuItem(restaurantId, item, sortOrder = 0) {
    if (!restaurantId) throw new Error("Restaurant ID is missing.");
    const session = await getSession();
    const category = await ensureCategory(restaurantId, item.category || "Menu", sortOrder);
    return request("menu_items", {
      method: "POST", accessToken: session?.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        restaurant_id: restaurantId, category_id: category?.id || null, local_id: item.id || createUuid(), category: item.category || "Menu",
        name: item.name, description: item.description || "", price: Number(item.price), image_url: item.photoData || item.imageUrl || "",
        photo_url: item.photoData || item.imageUrl || "", tags: item.tags || [], option_template: item.optionTemplate || "none",
        option_config: Array.isArray(item.optionConfig) ? item.optionConfig : [],
        sold_out: Boolean(item.soldOut), is_available: !item.soldOut, sort_order: sortOrder
      })
    });
  }

  async function importSampleMenu(restaurantId, items) {
    let count = 0;
    for (const item of items) { await createMenuItem(restaurantId, item, count + 1); count += 1; }
    return count;
  }

  async function completeOnboarding(restaurantId) {
    const session = await getSession();
    await request(`restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
      method: "PATCH", accessToken: session?.access_token, headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "active", is_active: true, is_open: true })
    });
  }

  async function bootstrapMenu(items) {
    const profile = await getStaffProfile();
    return importSampleMenu(profile.restaurantId, items);
  }

  function createUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
      (Number(char) ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))).toString(16));
  }

  function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  async function submitOrder(order) {
    const token = routeContext().token;
    if (!token) throw new Error("A valid customer token is required.");
    if (!isUuid(order.idempotencyKey)) throw new Error("A valid public order idempotency key is required.");
    const items = order.items.map((item) => ({ menu_item_id: item.menuItemCloudId, quantity: item.quantity, options: (item.options || []).map((option) => ({ groupId: option.groupId, choiceId: option.choiceId })) }));
    const result = await submitPublicQrOrder(token, items, order.note, order.customerName, order.idempotencyKey);
    return { id: result.id, number: Number(result.order_number) };
  }

  async function loadCustomerOrderStatus(orderId) { return getPublicQrOrderStatus(routeContext().token, orderId); }

  async function loadOrders(restaurantId) {
    const session = await getSession();
    if (!session) throw new Error("Staff login is required.");
    return request(
      `orders?select=id,local_id,order_number,restaurant_id,table_id,customer_name,status,note,subtotal,tax,total,payment_method,paid_at,created_at,served_at,closed_at,tables(local_id,table_name),order_items(id,menu_item_id,item_name,price,quantity,notes,options)&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=500`,
      { accessToken: session.access_token }
    );
  }

  async function loadReportRpc(name, restaurantId, range = null) {
    const session = await getSession();
    if (!session || !restaurantId) throw new Error("Report access requires a restaurant login.");
    const body = { p_restaurant_id: restaurantId };
    if (range) {
      body.p_from = range.from;
      body.p_to = range.to;
    }
    return request(`rpc/${name}`, {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify(body)
    });
  }

  function loadReportDashboard(restaurantId) { return loadReportRpc("get_report_dashboard", restaurantId); }
  function loadSalesReport(restaurantId, range) { return loadReportRpc("get_sales_report", restaurantId, range); }
  function loadMenuReport(restaurantId, range) { return loadReportRpc("get_menu_report", restaurantId, range); }
  function loadTableReport(restaurantId, range) { return loadReportRpc("get_table_report", restaurantId, range); }
  function loadHourlyReport(restaurantId, range) { return loadReportRpc("get_hourly_report", restaurantId, range); }
  function loadOrderReport(restaurantId, range) { return loadReportRpc("get_order_report", restaurantId, range); }

  async function scopedPatch(table, rowId, restaurantId, fields) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!tenantId) throw new Error("Restaurant context is missing.");
    return request(`${table}?id=eq.${encodeURIComponent(rowId)}&restaurant_id=eq.${encodeURIComponent(tenantId)}`, {
      method: "PATCH", accessToken: session?.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify(fields)
    });
  }

  async function updateOrderStatus(orderId, status, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    try {
      return await request("rpc/update_restaurant_order_status", {
        method: "POST",
        accessToken: session.access_token,
        body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId, p_action: status })
      });
    } catch (error) {
      const migrationMissing = error.status === 404 || /update_restaurant_order_status|schema cache|could not find/i.test(error.message);
      if (!migrationMissing) throw error;
      const statusToDatabase = { Preparing: "preparing", Ready: "ready", Served: "completed", Paid: "completed", Cancelled: "cancelled" };
      const body = { status: statusToDatabase[status] || String(status).toLowerCase() };
      const timestamp = new Date().toISOString();
      if (status === "Served") body.served_at = timestamp;
      if (["Paid", "Cancelled"].includes(status)) body.closed_at = timestamp;
      return scopedPatch("orders", orderId, tenantId, body);
    }
  }

  async function recordOrderPayment(orderId, payment, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/record_restaurant_order_payment", {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify({
        p_restaurant_id: tenantId,
        p_order_id: orderId,
        p_method: payment.method || "Other"
      })
    });
  }

  function updateMenuItemPhoto(id, photoUrl, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { image_url: photoUrl || "", photo_url: photoUrl || "" }); }
  function updateMenuItemSoldOut(id, soldOut, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { sold_out: Boolean(soldOut), is_available: !soldOut }); }
  function deactivateMenuItem(id, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { is_active: false, is_available: false }); }

  async function createRestaurantTable(restaurantId, table, sortOrder) {
    const session = await getSession();
    const number = Number(String(table.id || "").replace(/\D/g, "")) || sortOrder || 1;
    return request("tables", {
      method: "POST", accessToken: session?.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, local_id: table.id, table_number: number, table_name: table.name, name: table.name, sort_order: sortOrder || number })
    });
  }
  function updateRestaurantTable(id, fields, restaurantId) {
    const mapped = { ...fields };
    if (fields.name) mapped.table_name = fields.name;
    return scopedPatch("tables", id, restaurantId, mapped);
  }
  function deactivateRestaurantTable(id, restaurantId) { return updateRestaurantTable(id, { is_active: false }, restaurantId); }

  async function updateRestaurantProfile(restaurantId, profile) {
    const session = await getSession();
    return request(`restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
      method: "PATCH", accessToken: session?.access_token, headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name: profile.name, subtitle: profile.subtitle, address: profile.address, phone: profile.phone,
        tax_id: profile.taxId, tax_rate: profile.taxRate, is_open: profile.isOpen, logo_url: profile.logoUrl || "", theme_config: profile.themeConfig || {} })
    });
  }

  window.TableOrderCloud = {
    config, routeContext, request, checkConnection, loadRestaurantData, bootstrapMenu, submitOrder, loadCustomerOrderStatus,
    issuePublicQrTableToken, getPublicQrTableTokenMetadata, getPublicQrOrderContext, submitPublicQrOrder, getPublicQrOrderStatus,
    loadOrders, updateOrderStatus, recordOrderPayment, updateMenuItemPhoto, updateMenuItemSoldOut, createMenuItem, deactivateMenuItem,
    loadReportDashboard, loadSalesReport, loadMenuReport, loadTableReport, loadHourlyReport, loadOrderReport,
    createRestaurantTable, updateRestaurantTable, deactivateRestaurantTable, updateRestaurantProfile,
    signUp, signInWithPassword, consumeAuthRedirect, getSession, getMemberships, getStaffProfile, getPlatformProfile, getPlatformDashboardProfile, signOut,
    loadPlatformRestaurants, platformCreateRestaurant,
    createRestaurant, createTables, importSampleMenu, completeOnboarding,
    createRestaurantInvite, acceptRestaurantInvite, listRestaurantTeam, revokeRestaurantInvite
  };
})();
