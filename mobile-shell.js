(function setupNativeShell() {
  const capacitor = window.Capacitor;
  const isNative = Boolean(
    capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()
  );
  const isPreview = new URLSearchParams(window.location.search).get("native-preview") === "1";

  if (!isNative && !isPreview) {
    return;
  }

  const platform = isNative && typeof capacitor.getPlatform === "function" ? capacitor.getPlatform() : "preview";
  document.documentElement.classList.add("native-app", `native-${platform}`);
  document.documentElement.dataset.platform = platform;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("native-app-body");
  });
})();

(function setupInstallableWebApp() {
  const capacitor = window.Capacitor;
  const isNative = Boolean(
    capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()
  );
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if (isStandalone) {
    document.documentElement.classList.add("pwa-standalone");
    document.documentElement.dataset.platform = "pwa";
  }

  if (isNative || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The ordering app remains usable online when service workers are unavailable.
    });
  });
})();
