import { initI18n } from "./i18n.js?v=20261113q";
import { initTheme } from "./theme.js?v=20261113q";
import { initOverlay } from "./overlay.js?v=20261113q";

const PAGE_MODULES = {
  showroom: "./showroom.js?v=20261113q",
  shop: "./catalog.js?v=20261113q",
  product: "./product.js?v=20261113q",
  atelier: "./atelier.js?v=20261113q",
  admin: "./admin.js?v=20261113q"
};

async function boot() {
  // i18n must be ready before anything renders text.
  const refreshTheme = initTheme();
  await initI18n();
  refreshTheme();
  await initOverlay();
  initHeader();

  const page = document.body.getAttribute("data-page") || "showroom";
  const modPath = PAGE_MODULES[page];
  if (!modPath) return;

  try {
    const mod = await import(modPath);
    if (mod && typeof mod.init === "function") {
      await mod.init();
    }
  } catch (err) {
    console.error("[app] page module failed", err);
  }

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

// A disclosure uses ordinary links and normal Tab order, not menu roles.
function initHeader() {
  const header = document.getElementById("site-header");
  const nav = document.getElementById("primary-nav");
  const toggle = document.getElementById("menu-toggle");
  if (!header || !nav || !toggle) return;
  const mobile = matchMedia("(max-width: 1199px)");
  function close(restore = false) {
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
    if (restore) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    if (toggle.getAttribute("aria-expanded") === "true") close(true);
    else {
      toggle.setAttribute("aria-expanded", "true");
      nav.classList.add("is-open");
      nav.querySelector("a")?.focus();
    }
  });
  header.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault(); close(true);
    }
  });
  header.addEventListener("focusout", event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) close();
  });
  document.addEventListener("click", event => {
    if (!header.contains(event.target)) close(nav.contains(document.activeElement));
  });
  nav.addEventListener("click", event => { if (event.target.closest("a")) close(); });
  mobile.addEventListener("change", () => close(nav.contains(document.activeElement) && mobile.matches));
  const measure = () => document.documentElement.style.setProperty("--header-h", `${header.getBoundingClientRect().height}px`);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(measure).observe(header);
  measure();
}
