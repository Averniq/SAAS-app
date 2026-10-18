(function createAveniqCloud() {
  const config = window.TABLEORDER_SUPABASE || {};
  const SESSION_KEY = "aveniq-owner-session";
  let authSession = readStoredSession();
  let recoverySession = null;
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
    if (parts[0] === "login") return { area: "login", restaurantSlug: "", tableRef: "" };
    if (["signup", "forgot-password", "reset-password", "onboarding", "platform"].includes(parts[0])) return { area: parts[0], restaurantSlug: params.get("restaurant") || "", tableRef: "" };
    return { area: "app", restaurantSlug: "", tableRef: params.get("table") || params.get("token") || "" };
  }

  function restaurantSlug() {
    const selected = routeContext().restaurantSlug || activeMembership?.restaurantSlug || activePlatformDashboard?.restaurantSlug;
    return selected || (activeAccessToken() ? "" : config.restaurantSlug || "demo");
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

  let recoveryClient = null;
  let recoveryBusy = false;
  let recoveryMemory = null;
  let recoveryRequestClient = null;
  let recoveryRequestMemory = null;

  const RECOVERY_LIFETIME = 3600000;
  const RECOVERY_COOLDOWN = 60000;

  function recoveryStorageKey() {
    if (!config.url || !config.publishableKey || !window.AveniqRecoveryAuth?.AuthClient) throw new Error("Recovery configuration is missing.");
    return "aveniq-password-recovery:" + new URL(config.url).host;
  }

  function readRecoveryVerifier() {
    const key = recoveryStorageKey() + "-code-verifier";
    try {
      const entry = JSON.parse(window.localStorage.getItem(key) || "null");
      const verifier = entry && JSON.parse(entry.value);
      if (!entry || !Number.isFinite(entry.createdAt) || Date.now() - entry.createdAt >= RECOVERY_LIFETIME
          || entry.createdAt > Date.now() || typeof verifier !== "string"
          || !/^[A-Za-z0-9._~-]{43,128}\/PASSWORD_RECOVERY$/.test(verifier)) {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(key + "-resend-after");
        return null;
      }
      return entry;
    } catch { window.localStorage.removeItem(key); window.localStorage.removeItem(key + "-resend-after"); return null; }
  }

  function getPasswordRecoveryCooldown() {
    readRecoveryVerifier();
    const key = recoveryStorageKey() + "-code-verifier-resend-after";
    const until = Number(window.localStorage.getItem(key));
    if (!Number.isFinite(until) || until <= Date.now() || until > Date.now() + RECOVERY_COOLDOWN) {
      window.localStorage.removeItem(key);
      return 0;
    }
    return Math.ceil((until - Date.now()) / 1000);
  }

  async function withRecoveryLock(action, ifAvailable = false) {
    // Web Locks coordinate requests, callback consumption and cleanup across tabs.
    // Without an exclusive lock, fail closed rather than risk mismatched PKCE state.
    if (!window.navigator?.locks?.request) return null;
    return window.navigator.locks.request(recoveryStorageKey(), {mode: "exclusive", ifAvailable}, lock => lock ? action() : null);
  }

  function getRecoveryClient() {
    if (recoveryClient) return recoveryClient;
    const storageKey = recoveryStorageKey();
    const verifierKey = storageKey + "-code-verifier";
    // Only the bounded verifier crosses page loads; Auth credentials stay in memory.
    const memory = new Map();
    recoveryMemory = memory;
    const storage = {
      getItem: key => key === verifierKey ? readRecoveryVerifier()?.value || null : memory.get(key) || null,
      setItem(key, value) { if (key !== verifierKey) memory.set(key, value); },
      removeItem(key) {
        // SDK one-time-code cleanup cannot erase the bounded resend verifier.
        // Explicit recovery completion/failure clears it in endPasswordRecovery.
        if (key !== verifierKey) memory.delete(key);
      }
    };
    recoveryClient = new window.AveniqRecoveryAuth.AuthClient({
      url: config.url + "/auth/v1", headers: {apikey: config.publishableKey, Authorization: "Bearer " + config.publishableKey},
      flowType: "pkce", storageKey, storage, persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, fetch: (...args) => fetch(...args)
    });
    return recoveryClient;
  }

  async function requestPasswordRecovery(email) {
    try {
      await withRecoveryLock(async () => {
        if (getPasswordRecoveryCooldown() || recoverySession || recoveryBusy) return;
        const storageKey = recoveryStorageKey() + ":request";
        const temporary = recoveryRequestMemory || (recoveryRequestMemory = new Map());
        const client = recoveryRequestClient || (recoveryRequestClient = new window.AveniqRecoveryAuth.AuthClient({
          url: config.url + "/auth/v1", headers: {apikey: config.publishableKey, Authorization: "Bearer " + config.publishableKey},
          flowType: "pkce", storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
          storage: {getItem: key => temporary.get(key) || null, setItem: (key, value) => temporary.set(key, value), removeItem: key => temporary.delete(key)},
          fetch: async (url, options) => {
            if (new URL(url).pathname !== "/auth/v1/recover" || options.method !== "POST") throw new Error("Unexpected recovery request.");
            let active = readRecoveryVerifier();
            if (active === null) {
              active = {value: temporary.get(storageKey + "-code-verifier"), createdAt: Date.now()};
              window.localStorage.setItem(recoveryStorageKey() + "-code-verifier", JSON.stringify(active));
              if (!readRecoveryVerifier()) throw new Error("Recovery verifier is unavailable.");
            }
            const verifier = JSON.parse(active.value).split("/")[0];
            const digest = await window.crypto.subtle.digest("SHA-256", Uint8Array.from(verifier, char => char.charCodeAt(0)));
            const challenge = window.btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            const body = JSON.parse(options.body);
            body.code_challenge = challenge;
            body.code_challenge_method = "s256";
            // Persist before dispatch: an ambiguous response may still have sent mail.
            // Every resend uses this same challenge, including server-side flow state
            // created before a rate-limit/provider failure. SDK cleanup is isolated.
            window.localStorage.setItem(recoveryStorageKey() + "-code-verifier-resend-after", String(Date.now() + RECOVERY_COOLDOWN));
            return fetch(url, {...options, body: JSON.stringify(body)});
          }
        }));
        try {
          await client.resetPasswordForEmail(String(email || "").trim().toLowerCase(), {redirectTo: "https://app.aveniq.com.au/reset-password"});
        } finally { temporary.clear(); }
      }, true);
    } catch {
      // Same neutral response for all addresses, provider failures and unavailable locks.
    }
    return {retryAfter: getPasswordRecoveryCooldown()};
  }

  async function endPasswordRecovery() {
    recoverySession = null;
    try {
      if (recoveryClient) await recoveryClient.signOut({scope: "local"}).catch(() => {});
    } finally {
      recoveryMemory?.clear();
      window.localStorage.removeItem(recoveryStorageKey() + "-code-verifier");
      window.localStorage.removeItem(recoveryStorageKey() + "-code-verifier-resend-after");
    }
  }

  async function consumePasswordRecovery() {
    if (recoveryBusy || recoverySession) return false;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const hasFragment = Boolean(window.location.hash);
    window.history.replaceState({}, "", window.location.pathname);
    // Implicit tokens and URL 'type' fields never establish recovery authority.
    if (routeContext().area !== "reset-password" || hasFragment || params.has("error") || params.has("error_code")
        || params.getAll("code").length !== 1 || !code) return false;
    recoveryBusy = true;
    try {
      return Boolean(await withRecoveryLock(async () => {
        try {
          const client = getRecoveryClient();
          const {data, error} = await client.exchangeCodeForSession(code);
          // This context comes from the SDK's recovery-only PKCE verifier, not the URL.
          if (error || data?.redirectType !== "PASSWORD_RECOVERY" || !data?.session?.access_token) {
            await endPasswordRecovery();
            return false;
          }
          const token = data.session.access_token;
          const {data: identity, error: identityError} = await client.getUser(token);
          if (identityError || !identity?.user?.id) { await endPasswordRecovery(); return false; }
          // GET user verifies the JWT with Auth. Its signed AMR, not its user identity,
          // establishes recovery provenance, including against relabelled normal codes.
          const claims = JSON.parse(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (!claims.amr?.some(entry => entry.method === "recovery") || !Number.isFinite(claims.exp)
              || claims.exp <= Date.now() / 1000 || claims.sub !== identity.user.id) {
            await endPasswordRecovery();
            return false;
          }
          recoverySession = {access_token: token, expires_at: claims.exp};
          return true;
        } catch {
          await endPasswordRecovery();
          return false;
        }
      }));
    } catch {
      return false;
    } finally { recoveryBusy = false; }
  }

  async function updatePassword(password, confirmation) {
    if (recoveryBusy || !recoverySession || recoverySession.expires_at <= Date.now() / 1000) throw new Error("PASSWORD_RECOVERY_SESSION_MISSING");
    if (typeof password !== "string" || password.length < 12) throw new Error("Use at least 12 characters for your new password.");
    if (password !== confirmation) throw new Error("The passwords do not match.");
    recoveryBusy = true;
    try {
      const updated = await withRecoveryLock(async () => {
        const {error} = await getRecoveryClient().updateUser({password});
        if (error) {
          if ([401, 403].includes(error.status)) { await endPasswordRecovery(); throw new Error("PASSWORD_RECOVERY_SESSION_MISSING"); }
          throw error;
        }
        await endPasswordRecovery();
        return true;
      });
      if (!updated) throw new Error("PASSWORD_RECOVERY_SESSION_MISSING");
    } finally { recoveryBusy = false; }
  }

  function consumeAuthRedirect() {
    const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
    if (recoveryParams.get("type") === "recovery") {
      window.location.pathname = "/reset-password";
      return null;
    }

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
    const rows = await request(
      `restaurant_staff?select=id,restaurant_id,role,is_active,display_name,version,restaurants(id,slug,name,status)&is_active=eq.true&user_id=eq.${encodeURIComponent(session.user.id)}`,
      { accessToken: session.access_token }
    );
    return rows.filter(row => row.is_active !== false);
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
      displayName: membership.display_name || "",
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

  function updateRestaurantStaff(restaurantId, membershipId, input) {
    const name = String(input.displayName || "").trim();
    if (!name || name.length > 100) throw new Error("Enter a staff name of up to 100 characters.");
    if (!["manager", "staff", "kitchen", "cashier"].includes(input.role)) throw new Error("Choose an available staff role.");
    if (typeof input.isActive !== "boolean" || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("Refresh the team list before saving.");
    return request("rpc/update_restaurant_staff", { method: "POST", body: JSON.stringify({
      p_restaurant_id: restaurantId, p_membership_id: membershipId, p_display_name: name,
      p_role: input.role, p_is_active: input.isActive, p_expected_version: input.expectedVersion
    }) });
  }

  async function sendStaffInvitation(restaurantId, input) {
    const session = await getSession();
    if (!session) throw new Error("Please sign in again.");
    const response = await fetch(`${config.url}/functions/v1/staff-invite`, {
      method: "POST", headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, email: String(input.email || "").trim().toLowerCase(), displayName: String(input.displayName || "").trim(), role: input.role, requestId: input.requestId })
    });
    return parseResponse(response);
  }

  async function verifyInvitationSession() {
    const session = await getSession();
    if (!session?.access_token) throw new Error("Please sign in to accept this invitation.");
    const user = await authRequest("user", { accessToken: session.access_token });
    if (!user?.id || (session.user?.id && user.id !== session.user.id)) throw new Error("Please sign in again.");
    return storeSession({ ...session, user });
  }

  async function setInvitationPassword(password) {
    if (typeof password !== "string" || password.length < 8) throw new Error("Use at least 8 characters.");
    const session = await verifyInvitationSession();
    const user = await authRequest("user", { method: "PUT", accessToken: session.access_token, body: JSON.stringify({ password }) });
    if (user?.id !== session.user.id) throw new Error("Password confirmation was not received. Please sign in again.");
    return true;
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
  function isExpectedPublicQrMetadataUnavailable(error) {
    const message = String(error?.message || "");
    return error?.code === "PGRST202"
      || error?.code === "RESTAURANT_ACCESS_DENIED"
      || (error?.status === 404 && /get_public_qr_table_token_metadata|schema cache|could not find the function/i.test(message))
      || /RESTAURANT_ACCESS_DENIED/i.test(message);
  }
  async function loadOptionalPublicQrTableTokenMetadata(restaurantId) {
    try {
      return { metadata: await getPublicQrTableTokenMetadata(restaurantId), availability: "available" };
    } catch (error) {
      if (!isExpectedPublicQrMetadataUnavailable(error)) console.warn("QR token metadata could not be loaded; the authenticated catalogue remains available.", error);
      return { metadata: [], availability: isExpectedPublicQrMetadataUnavailable(error) ? "unavailable" : "error" };
    }
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
    const [[restaurant, tables, menuItems], qrMetadata] = await Promise.all([
      Promise.all([
        request(`restaurants?select=*&id=eq.${encodeURIComponent(profile.restaurantId)}&limit=1`, { accessToken: session.access_token }),
        request(`tables?select=*&restaurant_id=eq.${encodeURIComponent(profile.restaurantId)}&order=sort_order.asc`, { accessToken: session.access_token }),
        request(`menu_items?select=*&restaurant_id=eq.${encodeURIComponent(profile.restaurantId)}&is_active=eq.true&is_available=eq.true&sold_out=eq.false&order=sort_order.asc`, { accessToken: session.access_token })
      ]),
      loadOptionalPublicQrTableTokenMetadata(profile.restaurantId)
    ]);
    return {
      restaurant: restaurant?.[0], tables: tables || [], menuItems: menuItems || [],
      publicQrTokenMetadata: qrMetadata.metadata || [], publicQrTokenMetadataAvailability: qrMetadata.availability
    };
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

  async function scopedPatch(table, rowId, restaurantId, fields, returning = "") {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!tenantId) throw new Error("Restaurant context is missing.");
    return request(`${table}?id=eq.${encodeURIComponent(rowId)}&restaurant_id=eq.${encodeURIComponent(tenantId)}${returning ? `&select=${returning}` : ""}`, {
      method: "PATCH", accessToken: session?.access_token, headers: { Prefer: returning ? "return=representation" : "return=minimal" }, body: JSON.stringify(fields)
    });
  }

  async function updateOrderStatus(orderId, status, restaurantId) {
    if (String(status).trim().toLowerCase() === "paid") throw new Error("Payments must be recorded through the authoritative payment service.");
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    return request("rpc/update_restaurant_order_status", {
      method: "POST", accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId, p_action: status })
    });
  }

  async function recordAuthoritativePayment(orderId, payment, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    if (!isUuid(payment?.idempotencyKey)) throw new Error("A valid payment idempotency key is required.");
    if (!Number.isSafeInteger(payment?.amountCents) || payment.amountCents <= 0) throw new Error("A valid payment amount is required.");
    if (!["Cash", "Card", "EFTPOS", "Other"].includes(payment.method)) throw new Error("A valid payment method is required.");
    const result = await request("rpc/record_authoritative_payment", {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify({
        p_restaurant_id: tenantId,
        p_order_id: orderId,
        p_amount_cents: payment.amountCents,
        p_method: payment.method,
        p_reference: payment.reference || "",
        p_note: payment.note || "",
        p_idempotency_key: payment.idempotencyKey
      })
    });
    if (!isUuid(result?.payment_id) || result.amount_cents !== payment.amountCents
        || ![result.amount_cents, result.paid_cents, result.remaining_cents].every(Number.isSafeInteger)
        || result.paid_cents < result.amount_cents || result.remaining_cents < 0
        || result.payment_status !== (result.remaining_cents === 0 ? "paid" : "partial")) {
      throw new Error("Payment response could not be verified. Retry the same payment attempt.");
    }
    return {
      paymentId: result.payment_id,
      amountCents: Number(result.amount_cents),
      paidCents: Number(result.paid_cents),
      remainingCents: Number(result.remaining_cents),
      paymentStatus: result.payment_status,
      idempotentReplay: result.idempotent_replay === true
    };
  }

  async function listAuthoritativePaymentOperations(orderId = null, restaurantId) {
    const session = await getSession();
    const tenantId = restaurantId || activeMembership?.restaurantId || activePlatformDashboard?.restaurantId;
    if (!session || !tenantId) throw new Error("Restaurant context is missing.");
    if (orderId !== null && !isUuid(orderId)) throw new Error("A valid order id is required.");
    const result = await request("rpc/list_authoritative_payment_operations", {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify({ p_restaurant_id: tenantId, p_order_id: orderId })
    });
    if (!Array.isArray(result) || result.some((entry) => !isUuid(entry?.id) || !isUuid(entry?.order_id)
        || !Number.isSafeInteger(entry?.amount_cents) || entry.amount_cents <= 0
        || !["Cash", "Card", "EFTPOS", "Other"].includes(entry?.payment_method)
        || typeof entry.payment_reference !== "string" || typeof entry.note !== "string"
        || typeof entry.recorded_at !== "string" || Number.isNaN(Date.parse(entry.recorded_at))
        || !isUuid(entry.recorded_by))) {
      throw new Error("Payment ledger response could not be verified. Payment is unavailable until it can be refreshed.");
    }
    return result.map((entry) => ({ id: entry.id, orderId: entry.order_id, amountCents: entry.amount_cents,
      paymentMethod: entry.payment_method, reference: entry.payment_reference, note: entry.note,
      recordedAt: entry.recorded_at, recordedBy: entry.recorded_by }));
  }

  function updateMenuItemPhoto(id, photoUrl, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { image_url: photoUrl || "", photo_url: photoUrl || "" }); }
  function updateMenuItemSoldOut(id, soldOut, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { sold_out: Boolean(soldOut), is_available: !soldOut }); }
  function deactivateMenuItem(id, restaurantId) { return scopedPatch("menu_items", id, restaurantId, { is_active: false, is_available: false }); }

  async function createRestaurantTable(restaurantId, table, sortOrder) {
    const session = await getSession();
    const number = Number(sortOrder) || 1;
    return request("tables", {
      method: "POST", accessToken: session?.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, local_id: table.id, table_number: number, table_name: table.name, name: table.name, table_token: `tk_${createUuid().replace(/-/g, "").toUpperCase()}`, sort_order: sortOrder || number })
    });
  }
  function updateRestaurantTable(id, fields, restaurantId, { returnRepresentation = false } = {}) {
    const mapped = { ...fields };
    if (typeof fields.name === "string") {
      mapped.name = fields.name.trim();
      if (!mapped.name) throw new Error("Enter a table name.");
      mapped.table_name = mapped.name;
    }
    return scopedPatch("tables", id, restaurantId, mapped,
      returnRepresentation ? "id,restaurant_id,local_id,name,table_name" : "");
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
    loadOrders, updateOrderStatus, recordAuthoritativePayment, listAuthoritativePaymentOperations, updateMenuItemPhoto, updateMenuItemSoldOut, createMenuItem, deactivateMenuItem,
    loadReportDashboard, loadSalesReport, loadMenuReport, loadTableReport, loadHourlyReport, loadOrderReport,
    createRestaurantTable, updateRestaurantTable, deactivateRestaurantTable, updateRestaurantProfile,
    requestPasswordRecovery, getPasswordRecoveryCooldown, consumePasswordRecovery, updatePassword, signUp, signInWithPassword, consumeAuthRedirect, getSession, getMemberships, getStaffProfile, getPlatformProfile, getPlatformDashboardProfile, signOut,
    loadPlatformRestaurants, platformCreateRestaurant,
    createRestaurant, createTables, importSampleMenu, completeOnboarding,
    updateRestaurantStaff, sendStaffInvitation, verifyInvitationSession, setInvitationPassword, acceptRestaurantInvite, listRestaurantTeam, revokeRestaurantInvite
  };
})();
