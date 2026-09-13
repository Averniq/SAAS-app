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
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if (isStandalone) {
    document.documentElement.classList.add("pwa-standalone");
    document.documentElement.dataset.platform = "pwa";
  }

  if (isNative || !("serviceWorker" in navigator)) {
    return;
  }

  async function retireLocalPreviewServiceWorker() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const scope = new URL(registration.scope);
          const worker = registration.active || registration.waiting || registration.installing;
          const workerPath = worker ? new URL(worker.scriptURL).pathname : "";
          return scope.origin === window.location.origin && scope.pathname === "/" && workerPath === "/service-worker.js";
        })
        .map((registration) => registration.unregister())
    );
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => /^aveniq-(shell|runtime)-/.test(name))
        .map((name) => caches.delete(name))
    );
  }

  if (isNative || isLocalhost) {
    if (isLocalhost) {
      window.addEventListener("load", () => {
        retireLocalPreviewServiceWorker().catch(() => {
          // A failed cleanup must not block the local preview itself.
        });
      });
    }
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The ordering app remains usable online when service workers are unavailable.
    });
  });
})();
