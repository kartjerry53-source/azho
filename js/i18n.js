const LANGS = ["fr", "ar", "en"];
const RTL = new Set(["ar"]);
const STORAGE_KEY = "azho.lang";
const DICT_URL = (lang) => new URL(`../i18n/${lang}.json?v=20261113n`, import.meta.url).href;

let current = "fr";
let dicts = { fr: {}, ar: {}, en: {} };
let readyPromise = null;
const listeners = new Set();

function readUrlLang() {
  try {
    const p = new URLSearchParams(location.search);
    const l = p.get("lang");
    if (l && LANGS.includes(l)) return l;
  } catch (_) {}
  return null;
}

function readStored() {
  try {
    const l = localStorage.getItem(STORAGE_KEY);
    if (l && LANGS.includes(l)) return l;
  } catch (_) {}
  return null;
}

export function detectLang() {
  return readUrlLang() || readStored() || "fr";
}

export function getLang() { return current; }
export function isRtl() { return RTL.has(current); }

export function t(key, vars) {
  const dict = dicts[current] || dicts.fr || {};
  let s = dict[key];
  if (s == null) s = (dicts.fr || {})[key];
  if (s == null) return key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split("{" + k + "}").join(String(vars[k]));
    }
  }
  return s;
}

export function formatPrice(amount) {
  const n = Math.round(Number(amount) || 0);
  const grouped = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const cur = current === "ar" ? t("common.currencyAr") : t("common.currency");
  return grouped + " " + cur;
}

function applyLangToLinks(root) {
  const lang = current;
  root.querySelectorAll("a[href]").forEach((a) => {
    const raw = a.getAttribute("href");
    if (!raw) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) return;
    let url;
    try {
      url = new URL(raw, location.href);
    } catch (_) {
      return;
    }
    if (url.origin !== location.origin) return;
    url.searchParams.set("lang", lang);
    // Preserve slug/hash and any other query params.
    const rel = url.pathname.split("/").pop() || "";
    const search = url.searchParams.toString();
    const hash = url.hash || "";
    a.setAttribute("href", rel + (search ? "?" + search : "") + hash);
  });
}

export function apply(root = document) {
  const html = document.documentElement;
  html.lang = current;
  html.dir = isRtl() ? "rtl" : "ltr";

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr");
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });

  // <title> and meta description are handled via data-i18n-attr on
  // <title> (textContent) and <meta> (content). Ensure <title> works:
  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl) titleEl.textContent = t(titleEl.getAttribute("data-i18n"));

  document.querySelectorAll(".lang-switch button").forEach((b) => {
    b.setAttribute("aria-pressed", b.getAttribute("data-lang") === current ? "true" : "false");
  });

  applyLangToLinks(root);
}

export function setLang(lang, opts = {}) {
  if (!LANGS.includes(lang)) lang = "fr";
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  if (opts.updateUrl !== false) {
    try {
      const url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.toString());
    } catch (_) {}
  }
  apply();
  listeners.forEach((fn) => { try { fn(lang); } catch (_) {} });
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function loadDict(lang) {
  const res = await fetch(DICT_URL(lang), { cache: "no-cache" });
  if (!res.ok) throw new Error(`i18n: failed to load ${lang}.json (${res.status})`);
  const data = await res.json();
  if (!data || typeof data !== "object") throw new Error(`i18n: ${lang}.json is not an object`);
  return data;
}

export function initI18n() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    current = detectLang();
    const results = await Promise.allSettled(LANGS.map((l) => loadDict(l)));
    LANGS.forEach((l, i) => {
      const r = results[i];
      if (r.status === "fulfilled") dicts[l] = r.value;
      else console.error("[i18n]", r.reason);
    });
    // Ensure identical key sets: fill missing from fr, then en, then ar.
    const allKeys = new Set();
    LANGS.forEach((l) => Object.keys(dicts[l] || {}).forEach((k) => allKeys.add(k)));
    LANGS.forEach((l) => {
      const d = dicts[l] || (dicts[l] = {});
      allKeys.forEach((k) => {
        if (d[k] == null) d[k] = dicts.fr[k] ?? dicts.en[k] ?? dicts.ar[k] ?? k;
      });
    });

    setLang(current);
    document.querySelectorAll(".lang-switch button").forEach((b) => {
      if (b.dataset.i18nBound === "1") return;
      b.dataset.i18nBound = "1";
      b.addEventListener("click", () => setLang(b.getAttribute("data-lang")));
    });

    // Delegated click: keep ?lang on internal navigation even for links
    // injected after apply().
    if (!document.documentElement.dataset.i18nLinksBound) {
      document.documentElement.dataset.i18nLinksBound = "1";
      document.addEventListener("click", (e) => {
        const a = e.target && e.target.closest && e.target.closest("a[href]");
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
        const raw = a.getAttribute("href");
        if (!raw || /^(mailto:|tel:|javascript:|#)/i.test(raw)) return;
        let url;
        try { url = new URL(raw, location.href); } catch (_) { return; }
        if (url.origin !== location.origin) return;
        url.searchParams.set("lang", current);
        e.preventDefault();
        location.assign(url.toString());
      });
    }

    return current;
  })();
  return readyPromise;
}


export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function localized(obj) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  return obj[current] || obj.fr || obj.en || obj.ar || "";
}
