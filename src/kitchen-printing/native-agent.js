import { mountKitchenPrinters } from "./printer-settings.js";
let plugin = null;
if (
  window.Capacitor?.isNativePlatform?.() &&
  window.Capacitor.getPlatform() === "android"
)
  plugin = window.Capacitor.registerPlugin("KitchenPrint");
let dispose = null,
  key = "",
  lastAuth = 0,
  running = false,
  busy = false;
const root = document.getElementById("kitchenPrintersSettings");
const banner = document.getElementById("kitchenPrintStatus");
let modal = null,
  modalDispose = null;
function message(text) {
  if (banner) banner.querySelector("[data-print-message]").textContent = text;
}
async function open() {
  const ctx = window.getKitchenPrintContext?.();
  if (!ctx?.staff) return;
  if (modal) {
    modal.showModal();
    return;
  }
  modal = document.createElement("dialog");
  modal.className = "kp-dialog";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close printer tools";
  close.addEventListener("click", () => modal.close());
  const content = document.createElement("div");
  modal.append(close, content);
  document.body.append(modal);
  modalDispose = mountKitchenPrinters({
    root: content,
    cloud: window.TableOrderCloud,
    nativeAgent: plugin,
    staff: ctx.staff,
  });
  modal.showModal();
}
banner
  ?.querySelector("button")
  .addEventListener("click", () =>
    open().catch(() =>
      message("Printer tools unavailable. Kitchen orders remain available."),
    ),
  );
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const ctx = window.getKitchenPrintContext?.(),
      staff = ctx?.staff;
    const allowed =
      staff && ["owner", "manager", "staff", "kitchen"].includes(staff.role);
    const next = allowed
      ? staff.restaurantId + ":" + staff.id + ":" + staff.role
      : "";
    if (next !== key) {
      dispose?.();
      dispose = null;
      modalDispose?.();
      modalDispose = null;
      modal?.remove();
      modal = null;
      key = next;
      lastAuth = 0;
      if (running && plugin) {
        await plugin.stop();
        running = false;
      }
      if (allowed && root)
        dispose = mountKitchenPrinters({
          root,
          cloud: window.TableOrderCloud,
          nativeAgent: plugin,
          staff,
        });
    }
    if (banner) banner.hidden = !(allowed && ctx.activeView === "kitchen");
    if (!allowed || !plugin) {
      if (allowed)
        message("Automatic LAN printing requires the Android Kitchen App.");
      return;
    }
    if (document.hidden) return;
    if (Date.now() - lastAuth > 15000) {
      const s = await window.TableOrderCloud.getSession();
      if (!s) {
        await plugin.stop();
        running = false;
        message("Sign in again to resume automatic printing.");
        return;
      }
      await plugin.setSession({
        accessToken: s.access_token,
        expiresAt: Number(s.expires_at),
        restaurantId: staff.restaurantId,
        operatorId: s.user?.id || staff.userId || staff.id,
      });
      lastAuth = Date.now();
    }
    if (!running) {
      await plugin.start();
      running = true;
    }
    const status = await plugin.getStatus();
    message(status.message || status.state);
  } catch (e) {
    message(
      "Printing needs attention: " +
        e.message +
        ". Kitchen orders remain available.",
    );
  } finally {
    busy = false;
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
});
setInterval(tick, 4000);
tick();
