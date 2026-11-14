const PRODUCTS_URL = "data/products.json?v=20261113v";
const WILAYAS_URL = "data/wilayas.json?v=20261113v";
const HOTSPOTS_URL = "data/hotspots.json?v=20261113v";

let productsPromise = null;
let loadedProducts = [];
let catalogLoaded = false;
let wilayasPromise = null;
let hotspotsPromise = null;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

export function loadProducts() {
  if (!productsPromise) {
    productsPromise = fetchJson(PRODUCTS_URL).then((data) => {
      const list = Array.isArray(data) ? data : (data && data.products) || [];
      loadedProducts = list.filter(p => p && typeof p.slug === "string").map(p => ({
        ...p, images: Array.isArray(p.images) ? p.images.map(src => safeImageUrl(src)).filter(Boolean) : []
      }));
      catalogLoaded = true;
      return loadedProducts;
    }).catch((err) => {
      console.warn("[store] products failed", err);
      productsPromise = null;
      return [];
    });
  }
  return productsPromise;
}

export function loadWilayas() {
  if (!wilayasPromise) {
    wilayasPromise = fetchJson(WILAYAS_URL).catch((err) => {
      console.warn("[store] wilayas failed", err);
      wilayasPromise = null;
      return [];
    });
  }
  return wilayasPromise;
}

export function loadHotspots() {
  if (!hotspotsPromise) {
    hotspotsPromise = fetchJson(HOTSPOTS_URL).catch((err) => {
      console.warn("[store] hotspots failed", err);
      hotspotsPromise = null;
      return {};
    });
  }
  return hotspotsPromise;
}

export async function getProduct(slug) {
  const list = await loadProducts();
  return list.find((p) => p.slug === slug && isPublished(p)) || null;
}

export async function getRelated(slug, limit = 3) {
  const list = await loadProducts();
  return list.filter((p) => p.slug !== slug && isPublished(p)).slice(0, limit);
}

export function categoriesOf(products) {
  const set = new Set();
  products.forEach((p) => { if (p.category) set.add(p.category); });
  return Array.from(set);
}

export function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

// Data and localStorage are untrusted; image URLs never escape this asset subtree.
export function safeImageUrl(value, fallback = "") {
  const allowed = v => typeof v === "string" && /^assets\/[A-Za-z0-9._\/-]+\.(?:jpe?g|png|webp|avif)$/i.test(v)
    && !v.split("/").some(part => part === "." || part === "..");
  return allowed(value) ? value : allowed(fallback) ? fallback : "";
}

export function normalizeQty(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1;
}

export function productSizes(product) {
  return product.sizes?.length ? product.sizes : ["XS", "S", "M", "L", "XL", "XXL"];
}

export function isPublished(product) {
  return !!product && product.published !== false && !["draft", "private", "unpublished", "trash"].includes(product.status);
}

export function isPurchasable(product) {
  if (!product || product.purchasable === false || product.priceOnRequest === true) return false;
  return catalogPrice(product) != null;
}

export function catalogPrice(product) {
  if (!product || product.purchasable === false || product.priceOnRequest === true) return null;
  const price = product.salePrice != null ? product.salePrice : product.price;
  return Number.isSafeInteger(price) && price >= 0 ? price : null;
}

export function getLoadedProducts() { return loadedProducts; }


export function hasLoadedCatalog() { return catalogLoaded; }
