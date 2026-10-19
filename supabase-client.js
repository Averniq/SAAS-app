(function createAveniqCloud() {
  const config = window.TABLEORDER_SUPABASE || {};
  // Explicit development build only; never grants access or enables writes.
  const localKitchenCompatibility = config.kitchenLocalReadOnlyCompatibility === true && /^http:[/][/](127\.0\.0\.1|10\.0\.2\.2):[0-9]+$/.test(config.url || "");
  const SESSION_KEY = "aveniq-owner-session";
  let authSession = readStoredSession();
  let activeMembership = null;

  function routeContext() {
    const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(window.location.search);
    if (parts[0] === "order" && parts[1] && !parts[2]) return { area: "token-order", publicToken: parts[1], restaurantSlug: "", tableRef: "" };
    if (parts[0] === "staff-clock" && parts[1] && !parts[2]) return { area: "staff-clock", publicClockToken: parts[1], restaurantSlug: "", tableRef: "" };
    if (parts[0] === "order" && parts[1]) return { area: "order", restaurantSlug: parts[1], tableRef: parts[2] || params.get("table") || "" };
    if (parts[0] === "dashboard" && parts[1]) return { area: parts[2] || "dashboard", restaurantSlug: parts[1], tableRef: "" };
    if (parts[0] === "r" && parts[1]) return { area: "restaurant", restaurantSlug: parts[1], tableRef: params.get("table") || "" };
    if (parts[0] === "join" && parts[1]) return { area: "join", restaurantSlug: "", tableRef: "", inviteToken: parts[1] };
    if (parts[0] === "staff") return { area: "staff", restaurantSlug: params.get("restaurant") || "", tableRef: "" };
    if (["admin", "frontdesk", "kitchen", "reports", "attendance"].includes(parts[0])) return { area: parts[0] === "admin" ? "dashboard" : parts[0], restaurantSlug: params.get("restaurant") || "", tableRef: "", protectedAlias: true };
    if (["signup", "login", "verify", "forgot-password", "reset-password", "onboarding", "platform"].includes(parts[0])) return { area: parts[0], restaurantSlug: params.get("restaurant") || "", tableRef: "" };
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
    window.dispatchEvent(new CustomEvent("kitchen-printing-session-changed"));
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
      error.details = data?.details || data?.detail || "";
      if (error.message === "TRIAL_LIMIT_REACHED") {
        error.message = "You’ve reached your 90-day free trial limit. Upgrade your plan to add more.";
      }
      if (error.message === "INVALID_TIMEZONE") {
        error.message = "Choose a valid timezone and try again.";
      }
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

  async function signUp(email, password, metadata = {}, redirectPath = "/verify") {
    const redirectTo = new URL(redirectPath, window.location.origin).toString();
    const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: JSON.stringify({ email: String(email || "").trim().toLowerCase(), password, data: metadata })
    });
    if (result?.access_token) storeSession(result);
    return result;
  }

  async function resendVerification(email) {
    const redirectTo = new URL("/verify", window.location.origin).toString();
    return authRequest("resend", {
      method: "POST",
      body: JSON.stringify({ type: "signup", email: String(email || "").trim().toLowerCase(), email_redirect_to: redirectTo })
    });
  }

  async function requestPasswordRecovery(email) {
    const redirectTo = new URL("/reset-password", window.location.origin).toString();
    return authRequest("recover", {
      method: "POST",
      body: JSON.stringify({ email: String(email || "").trim().toLowerCase(), redirect_to: redirectTo })
    });
  }

  async function updatePassword(password) {
    const session = await getSession();
    if (!session?.access_token) throw new Error("PASSWORD_RECOVERY_SESSION_MISSING");
    return authRequest("user", { method: "PUT", accessToken: session.access_token, body: JSON.stringify({ password }) });
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
    const scope = '&user_id=eq.' + encodeURIComponent(session.user.id);
    try {
      return await request('restaurant_staff?select=id,restaurant_id,role,restaurants(id,slug,name,status,is_active,venue_status)' + scope, { accessToken: session.access_token });
    } catch (error) {
      if (!localKitchenCompatibility || error.code !== '42703' || !/^column restaurants(?:_[0-9]+)?\.venue_status does not exist$/.test(error.message)) throw error;
      const rows = await request('restaurant_staff?select=id,restaurant_id,role,restaurants(id,slug,name,status,is_active)' + scope, { accessToken: session.access_token });
      return rows.map(row => ({...row, kitchen_read_only: true}));
    }
  }

  async function provisionSelfServiceAccount(session = null) {
    const activeSession = session || await getSession();
    if (!activeSession?.access_token) return null;
    return request("rpc/provision_self_service_account", {
      method: "POST", accessToken: activeSession.access_token, body: JSON.stringify({})
    });
  }

  async function getRestaurantEntitlement(restaurantId) {
    const session = await getSession();
    if (!session?.access_token || !restaurantId) throw new Error("Entitlement access requires a restaurant session.");
    return request("rpc/get_restaurant_entitlement", {
      method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: restaurantId })
    });
  }
  async function getCurrentOnboarding() {
    const session = await getSession();
    return request("rpc/get_current_onboarding", { method: "POST", accessToken: session?.access_token, body: "{}" });
  }
  async function saveCurrentOnboardingStep(step, action, details = {}) {
    const session = await getSession();
    return request("rpc/save_current_onboarding_step", { method: "POST", accessToken: session?.access_token, body: JSON.stringify({ p_step: step, p_action: action, p_details: details }) });
  }
  async function completeCurrentOnboarding() {
    const session = await getSession();
    return request("rpc/complete_current_onboarding", { method: "POST", accessToken: session?.access_token, body: "{}" });
  }
  async function onboardingRpc(name, body = {}) { const session = await getSession(); return request(`rpc/${name}`, { method: "POST", accessToken: session?.access_token, body: JSON.stringify(body) }); }
  function createSampleVenueData() { return onboardingRpc("create_sample_venue_data"); }
  function removeSampleVenueData() { return onboardingRpc("remove_sample_venue_data"); }
  function generateCurrentQrToken(tableId) { return onboardingRpc("generate_current_qr_token", { p_table_id: tableId }); }
  function createOnboardingTestOrder() { return onboardingRpc("create_onboarding_test_order"); }
  function completeOnboardingTestOrder(orderId) { return onboardingRpc("complete_onboarding_test_order", { p_order_id: orderId }); }
  function activateCurrentVenue() { return onboardingRpc("activate_current_venue"); }
  function getCurrentVenueReadiness() { return onboardingRpc("get_current_venue_readiness"); }
  function getCurrentQrTables() { return onboardingRpc("get_current_qr_tables"); }
  function revokeCurrentQrToken(tableId) { return onboardingRpc("revoke_current_qr_token", { p_table_id: tableId }); }
  function publicTokenRpc(name, body) { return request(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }); }
  function getPublicTenantContext(hostname = window.location.hostname) {
    return publicTokenRpc("get_public_tenant_context", { p_hostname: String(hostname || "").toLowerCase().replace(/\.$/, "") });
  }
  function attendanceRpc(name, body) { return request(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }); }
  function identifyAttendancePin(restaurantId, pin, deviceId) { return attendanceRpc("identify_attendance_pin", { p_restaurant_id: restaurantId, p_pin: pin, p_device_id: deviceId }); }
  function sharedAttendanceAction(token, action) { return attendanceRpc("shared_attendance_action", { p_action_token: token, p_action: action }); }
  function setStaffAttendancePin(restaurantId, staffUserId, pin, enabled = true) { return attendanceRpc("set_staff_attendance_pin", { p_restaurant_id: restaurantId, p_staff_user_id: staffUserId, p_pin: pin, p_enabled: enabled }); }
  function getWeeklyAttendanceReport(restaurantId, filters) { return attendanceRpc("get_weekly_attendance_report", { p_restaurant_id: restaurantId, p_from: filters.from, p_to: filters.to, p_staff_user_id: filters.staffUserId || null, p_location: filters.location || null, p_shift_status: filters.shiftStatus || "all" }); }
  function getAttendanceReportSettings(restaurantId) { return attendanceRpc("get_attendance_report_settings", { p_restaurant_id: restaurantId }); }
  function updateAttendanceReportSettings(restaurantId, weekStartsOn) { return attendanceRpc("update_attendance_report_settings", { p_restaurant_id: restaurantId, p_week_starts_on: weekStartsOn }); }
  function setAttendanceReportAccess(restaurantId, staffUserId, allowed) { return attendanceRpc("set_attendance_report_access", { p_restaurant_id: restaurantId, p_staff_user_id: staffUserId, p_allowed: allowed }); }
  function getStaffClockLink(restaurantId) { return attendanceRpc("get_staff_clock_link", { p_restaurant_id: restaurantId }); }
  function enableStaffClockLink(restaurantId, deviceLabel) { return attendanceRpc("enable_staff_clock_link", { p_restaurant_id: restaurantId, p_device_label: deviceLabel || "" }); }
  function regenerateStaffClockLink(restaurantId, deviceLabel) { return attendanceRpc("regenerate_staff_clock_link", { p_restaurant_id: restaurantId, p_device_label: deviceLabel || "" }); }
  function disableStaffClockLink(restaurantId) { return attendanceRpc("disable_staff_clock_link", { p_restaurant_id: restaurantId }); }
  function getPublicStaffClockContext(publicToken) { return publicTokenRpc("get_public_staff_clock_context", { p_public_token: publicToken }); }
  function identifyPublicStaffClockPin(publicToken, pin) { return publicTokenRpc("identify_public_staff_clock_pin", { p_public_token: publicToken, p_pin: pin }); }
  function publicStaffClockAction(actionToken, action) { return publicTokenRpc("public_staff_clock_action", { p_action_token: actionToken, p_action: action }); }
  function getPublicQrOrderContext(token) { return publicTokenRpc("get_public_qr_order_context", { p_token: token }); }
  function submitPublicQrOrder(token, items, customerName, note, idempotencyKey) {
    return publicTokenRpc("submit_public_qr_order", {
      p_token: token,
      p_items: items,
      p_customer_name: customerName || "",
      p_note: note || "",
      p_idempotency_key: idempotencyKey
    });
  }
  function getPublicQrOrderStatus(token, orderId) { return publicTokenRpc("get_public_qr_order_status", { p_token: token, p_order_id: orderId }); }

  async function getStaffProfile({ preferActiveRestaurant = false } = {}) {
    const session = await getSession();
    if (!session?.user?.id) return null;
    try { await provisionSelfServiceAccount(session); }
    catch (error) {
      if (!localKitchenCompatibility || error.code !== 'PGRST202' || !error.message.includes('public.provision_self_service_account')) throw error;
    }
    const memberships = await getMemberships();
    if (!memberships.length) {
      const error = new Error("ONBOARDING_REQUIRED");
      error.code = "ONBOARDING_REQUIRED";
      throw error;
    }
    const route = routeContext();
    // The root sign-in page has no restaurant context. Do not treat its
    // configured demo/default slug as an access requirement; choose one of
    // the account's actual memberships and let the app redirect there.
    const slug = ["dashboard", "kitchen", "frontdesk", "reports", "attendance", "setup", "order", "restaurant", "staff"].includes(route.area)
      ? route.restaurantSlug
      : "";
    const membershipRestaurant = (entry) => Array.isArray(entry.restaurants) ? entry.restaurants[0] : entry.restaurants;
    const membership = (!preferActiveRestaurant && memberships.find((entry) => membershipRestaurant(entry)?.slug === slug)) || ((!slug || preferActiveRestaurant)
      ? memberships.find((entry) => {
        const restaurant = membershipRestaurant(entry);
        return restaurant?.status === "active" || restaurant?.is_active === true;
      }) || memberships[0]
      : null);
    if (!membership) throw new Error("This account does not have access to this restaurant.");
    const related = membershipRestaurant(membership);
    activeMembership = { restaurantId: membership.restaurant_id, restaurantSlug: related?.slug, role: membership.role, kitchenReadOnly: membership.kitchen_read_only === true };
    return {
      id: session.user.id,
      email: session.user.email || "Staff",
      restaurantId: membership.restaurant_id,
      restaurantSlug: related?.slug || slug,
      restaurantName: related?.name || "Restaurant",
      restaurantStatus: related?.status || "active",
      venueStatus: related?.venue_status || "",
      kitchenReadOnly: membership.kitchen_read_only === true,
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
    window.dispatchEvent(new CustomEvent("kitchen-printing-stop"));
    const token = activeAccessToken();
    try { if (token) await authRequest("logout", { method: "POST", accessToken: token }); }
    finally { activeMembership = null; storeSession(null); }
  }

  async function checkConnection() {
    try {
      const data = await request("rpc/get_public_restaurant", { method: "POST", body: JSON.stringify({ p_slug: restaurantSlug(), p_table_ref: routeContext().tableRef || "" }) });
      return data?.restaurant || null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function loadRestaurantData() {
    const context = routeContext();
    const session = ["order", "restaurant"].includes(context.area) ? null : await getSession();
    if (localKitchenCompatibility && activeMembership?.kitchenReadOnly && session?.access_token && ["owner","manager","staff","kitchen"].includes(activeMembership.role)) {
      const tenant = encodeURIComponent(activeMembership.restaurantId);
      const options = {accessToken:session.access_token};
      const [restaurants,tables,menuItems] = await Promise.all([
        request('restaurants?select=id,slug,name,subtitle,address,phone,tax_id,tax_rate,timezone,is_open,logo_url,theme_config&id=eq.'+tenant+'&limit=1',options),
        request('tables?select=id,local_id,table_name,name,table_number,table_token&restaurant_id=eq.'+tenant+'&is_active=eq.true&order=sort_order,id&limit=500',options),
        request('menu_items?select=id,local_id,category_id,category,name,description,price,tags,image_url,photo_url,option_template,is_available,sold_out&restaurant_id=eq.'+tenant+'&is_active=eq.true&order=sort_order,id&limit=500',options)
      ]);
      if (!restaurants?.[0]) throw new Error("Authorized local restaurant is unavailable.");
      if (tables.length === 500 || menuItems.length === 500) throw new Error("Local read-only setup exceeds the bounded preview; narrow the fixture.");
      return {restaurant:restaurants[0],tables,menuItems};
    }
    const data = await request("rpc/get_public_restaurant", {
      method: "POST",
      accessToken: session?.access_token,
      body: JSON.stringify({ p_slug: restaurantSlug(), p_table_ref: context.area === "order" ? context.tableRef : "" })
    });
    return { restaurant: data.restaurant, tables: data.tables || [], menuItems: data.menu_items || [] };
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
  function createCurrentOnboardingTables(count) {
    const tenantId = activeMembership?.restaurantId;
    if (!tenantId) throw new Error("Restaurant context is missing.");
    return createTables(tenantId, count);
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

  async function submitOrder(order, restaurantId, tableId) {
    if (!restaurantId || !tableId) throw new Error("Restaurant or table is missing.");
    const items = order.items.map((item) => ({
      menu_item_id: item.menuItemCloudId,
      quantity: item.quantity,
      notes: item.notes || "",
      options: (item.options || []).map((option) => ({ groupId: option.groupId, choiceId: option.choiceId }))
    }));
    const result = await request("rpc/submit_order", {
      method: "POST",
      body: JSON.stringify({ p_restaurant_id: restaurantId, p_table_id: tableId, p_local_id: order.id, p_note: order.note || "", p_items: items, p_customer_name: order.customerName || "" })
    });
    return { id: result.id, number: Number(result.order_number) };
  }

  async function loadCustomerOrderStatus(orderId, localId, tableToken) {
    return request("rpc/get_customer_order_status", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_local_id: localId, p_table_token: tableToken }) });
  }

  async function loadOrders(restaurantId, { kitchenReadOnlyFallback = false } = {}) {
    const session = await getSession();
    if (!session) throw new Error("Staff login is required.");
    try { return await request(`orders?select=id,local_id,order_number,restaurant_id,table_id,customer_name,status,payment_status,note,subtotal,tax,total,payment_method,paid_at,created_at,served_at,closed_at,voided_at,void_reason,tables(local_id,table_name),order_items(id,menu_item_id,item_name,price,quantity,notes,options,status,voided_at,void_reason)&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=500`, {accessToken:session.access_token}); }
    catch (error) {
      if (!localKitchenCompatibility || !kitchenReadOnlyFallback || error.code !== '42703' || !/^column (?:orders(?:_[0-9]+)?\.(?:payment_status|voided_at|void_reason)|order_items(?:_[0-9]+)?\.(?:status|voided_at|void_reason)) does not exist$/.test(error.message)) throw error;
      const projection = 'orders?select=id,local_id,order_number,restaurant_id,table_id,customer_name,status,note,subtotal,tax,total,payment_method,paid_at,created_at,served_at,closed_at,tables(local_id,table_name),order_items(id,menu_item_id,item_name,price,quantity,notes,options)&restaurant_id=eq.' + encodeURIComponent(restaurantId) + '&order=created_at.desc&limit=500';
      const rows = await request(projection, {accessToken:session.access_token});
      return rows.map(row => ({...row,kitchen_read_only:true,payment_status:'unknown',order_items:(row.order_items||[]).map(item=>({...item,status:'unknown'}))}));
    }
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
    const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!tenantId) throw new Error("Restaurant context is missing.");
    return request(`${table}?id=eq.${encodeURIComponent(rowId)}&restaurant_id=eq.${encodeURIComponent(tenantId)}`, {
      method: "PATCH", accessToken: session?.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify(fields)
    });
  }

  async function updateOrderStatus(orderId, status, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/update_restaurant_order_status", {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId, p_action: status })
    });
  }

  async function touchStaffPresence(restaurantId) {
    const session = await getSession();
    if (!session?.access_token || !restaurantId) return;
    return request("rpc/touch_staff_presence", {
      method: "POST", accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: restaurantId })
    });
  }

  async function recordFrontdeskPayment(orderId, payment, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/record_authoritative_payment", {
      method: "POST", accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId, p_amount_cents: payment.amountCents, p_method: payment.method, p_reference: payment.reference || "", p_note: payment.note || "", p_idempotency_key: payment.idempotencyKey })
    });
  }

  async function loadFrontdeskPayments(restaurantId) {
    const session = await getSession();
    if (!session || !restaurantId) return [];
    return request("rpc/list_authoritative_payment_operations", { method: "POST", accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: restaurantId }) });
  }

  async function voidOrder(orderId, reason, note = "", managerPin = null, restaurantId) {
    const session = await getSession(); const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/void_restaurant_order", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId, p_reason: reason, p_note: note, p_manager_pin: managerPin }) });
  }
  async function voidOrderItem(orderItemId, reason, note = "", managerPin = null, restaurantId) {
    const session = await getSession(); const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/void_restaurant_order_item", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: tenantId, p_order_item_id: orderItemId, p_reason: reason, p_note: note, p_manager_pin: managerPin }) });
  }
  async function voidOrderItems(orderItemIds, reason, note = "", managerPin = null, restaurantId) {
    const session = await getSession(); const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/void_restaurant_order_items", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: tenantId, p_order_item_ids: orderItemIds, p_reason: reason, p_note: note, p_manager_pin: managerPin }) });
  }
  async function getOrderActivity(orderId, restaurantId) {
    const session = await getSession(); const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/get_order_activity", { method: "POST", accessToken: session.access_token, body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId }) });
  }

  function updateMenuItemPhoto(id, photoUrl, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { image_url: photoUrl || "", photo_url: photoUrl || "" }); }
  async function uploadMenuItemPhoto(file, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session?.access_token || !tenantId) throw new Error("Restaurant context is missing.");
    if (!(file instanceof File)) throw new Error("Choose an image file first.");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const filename = `${tenantId}/${crypto.randomUUID()}.${extension}`;
    const response = await fetch(`${config.url}/storage/v1/object/menu-images/${filename}`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': file.type,
        'x-upsert': 'false'
      },
      body: file
    });
    await parseResponse(response);
    return `${config.url}/storage/v1/object/public/menu-images/${filename}`;
  }
  async function uploadBrandingLogo(file, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId;
    if (!session?.access_token || !tenantId) throw new Error("Restaurant context is missing.");
    if (!(file instanceof File)) throw new Error("Choose a logo image first.");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("Use a JPG, PNG, or WebP logo.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Logo must be 5 MB or smaller.");

    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const filename = `${tenantId}/branding/${crypto.randomUUID()}.${extension}`;
    const response = await fetch(`${config.url}/storage/v1/object/menu-images/${filename}`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': file.type,
        'x-upsert': 'false'
      },
      body: file
    });
    await parseResponse(response);
    return `${config.url}/storage/v1/object/public/menu-images/${filename}`;
  }
  function updateMenuItemSoldOut(id, soldOut, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { sold_out: Boolean(soldOut), is_available: !soldOut }); }
  function deactivateMenuItem(id, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { is_active: false, is_available: false }); }

  async function createRestaurantTable(restaurantId, table, sortOrder) {
    const session = await getSession();
    const number = Number(String(table.id || "").replace(/\D/g, "")) || sortOrder || 1;
    return request("tables", {
      method: "POST", accessToken: session?.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, local_id: table.id, table_number: number, table_name: table.name, name: table.name, table_token: table.token, sort_order: sortOrder || number })
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

  async function getKitchenPrintSession(restaurantId) {
    const session = await getSession();
    if (!session?.access_token || activeMembership?.restaurantId !== restaurantId || !['owner','manager','staff','kitchen'].includes(activeMembership?.role)) throw new Error('PRINT_PERMISSION_DENIED');
    return {accessToken:session.access_token,expiresAt:session.expires_at,restaurantId,operatorId:session.user.id};
  }
  async function kitchenPrintRpc(name,args) {
    const session=await getSession();if(!session?.access_token)throw new Error('SIGN_IN_REQUIRED');
    return request('rpc/'+name,{method:'POST',accessToken:session.access_token,body:JSON.stringify(args)});
  }
  const listKitchenPrinters=restaurantId=>kitchenPrintRpc('list_kitchen_printers',{p_restaurant_id:restaurantId});
  const saveKitchenPrinter=(restaurantId,id,config)=>kitchenPrintRpc('save_kitchen_printer',{p_restaurant_id:restaurantId,p_printer_id:id,p_config:config});
  const disableKitchenPrinter=(id,reason)=>kitchenPrintRpc('disable_kitchen_printer',{p_printer_id:id,p_reason:reason});
  const setKitchenPrintControl=(restaurantId,enabled,allowTestOrders=false)=>kitchenPrintRpc('set_kitchen_print_control',{p_restaurant_id:restaurantId,p_enabled:enabled,p_allow_test_orders:allowTestOrders});
  const approveKitchenPrintPairing=(id,printers)=>kitchenPrintRpc('approve_kitchen_print_pairing',{p_pairing_id:id,p_printer_ids:printers});
  const revokeKitchenPrintDevice=(id,reason)=>kitchenPrintRpc('revoke_kitchen_print_device',{p_device_id:id,p_reason:reason});
  const requestKitchenTestPrint=(id,key)=>kitchenPrintRpc('request_kitchen_test_print',{p_printer_id:id,p_request_key:key});
  const listKitchenPrintHistory=(restaurantId,before=null,beforeId=null,limit=25)=>kitchenPrintRpc('list_kitchen_print_history',{p_restaurant_id:restaurantId,p_before:before,p_before_id:beforeId,p_limit:limit});
  const requestKitchenReprint=(id,reason,key,confirmed)=>kitchenPrintRpc('request_kitchen_reprint',{p_job_id:id,p_reason:reason,p_request_key:key,p_duplicate_paper_confirmed:confirmed===true});
  const resolveKitchenPrintUncertainty=(id,resolution,reason,confirmed)=>kitchenPrintRpc('resolve_kitchen_print_uncertainty',{p_job_id:id,p_resolution:resolution,p_reason:reason,p_agent_stopped_confirmed:confirmed===true});

  window.TableOrderCloud = {
    getKitchenPrintSession,listKitchenPrinters,saveKitchenPrinter,disableKitchenPrinter,setKitchenPrintControl,approveKitchenPrintPairing,revokeKitchenPrintDevice,requestKitchenTestPrint,listKitchenPrintHistory,requestKitchenReprint,resolveKitchenPrintUncertainty,
    config, routeContext, request, checkConnection, loadRestaurantData, getPublicTenantContext, bootstrapMenu, submitOrder, loadCustomerOrderStatus,
    loadOrders, loadFrontdeskPayments, updateOrderStatus, recordFrontdeskPayment, voidOrder, voidOrderItem, voidOrderItems, getOrderActivity, updateMenuItemPhoto, uploadMenuItemPhoto, uploadBrandingLogo, updateMenuItemSoldOut, createMenuItem, deactivateMenuItem,
    loadReportDashboard, loadSalesReport, loadMenuReport, loadTableReport, loadHourlyReport, loadOrderReport,
    createRestaurantTable, updateRestaurantTable, deactivateRestaurantTable, updateRestaurantProfile,
    signUp, resendVerification, requestPasswordRecovery, updatePassword, signInWithPassword, consumeAuthRedirect, getSession, getMemberships, getStaffProfile, getPlatformProfile, provisionSelfServiceAccount, getRestaurantEntitlement, getCurrentOnboarding, saveCurrentOnboardingStep, completeCurrentOnboarding, createSampleVenueData, removeSampleVenueData, generateCurrentQrToken, getCurrentQrTables, revokeCurrentQrToken, createOnboardingTestOrder, completeOnboardingTestOrder, activateCurrentVenue, getCurrentVenueReadiness, getPublicQrOrderContext, submitPublicQrOrder, getPublicQrOrderStatus, signOut,
    loadPlatformRestaurants, platformCreateRestaurant,
    createRestaurant, createTables, createCurrentOnboardingTables, importSampleMenu, completeOnboarding,
    createRestaurantInvite, acceptRestaurantInvite, listRestaurantTeam, touchStaffPresence, revokeRestaurantInvite,
    identifyAttendancePin, sharedAttendanceAction, setStaffAttendancePin, getStaffClockLink, enableStaffClockLink, regenerateStaffClockLink, disableStaffClockLink, getPublicStaffClockContext, identifyPublicStaffClockPin, publicStaffClockAction,
    getWeeklyAttendanceReport, getAttendanceReportSettings, updateAttendanceReportSettings, setAttendanceReportAccess
  };
})();
