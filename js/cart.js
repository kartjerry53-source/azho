import { t, formatPrice, escapeHtml, localized, getLang } from "./i18n.js?v=20261113v";
import { safeStorageGet, safeStorageSet, loadWilayas, loadProducts, getLoadedProducts, normalizeQty, productSizes, catalogPrice, isPublished, isPurchasable, safeImageUrl, hasLoadedCatalog } from "./store.js?v=20261113v";

const CART_KEY = "azho.cart";
const WISH_KEY = "azho.wishlist";
const ORDER_KEY = "azho.orders";

let cart = [];
let wishlist = [];
const listeners = new Set();

const MAX_TOTAL = 100000000; // Integer dinars; bound maliciously large catalogs/carts.
const INITIALS_RE = /^[\p{L}]{0,3}$/u;

function announceRemoval() {
  let live = document.getElementById("cart-integrity-notice");
  if (!live) {
    live = document.createElement("p");
    live.id = "cart-integrity-notice";
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }
  live.textContent = t("cart.removedUnavailable");
}

function validLine(l) {
  if (!l || typeof l !== "object") return null;
  const product = getLoadedProducts().find(p => p.slug === l.slug && isPublished(p));
  if (!product || !isPurchasable(product)) return null;
  const colour = typeof l.colour === "string" ? l.colour : "";
  const size = typeof l.size === "string" ? l.size : "";
  const colours = product.colours || [];
  const sizes = product.sizes?.length ? product.sizes : [];
  if ((colours.length ? !colours.includes(colour) : colour !== "") || (sizes.length ? !sizes.includes(size) : size !== "")) return null;
  const config = typeof l.config === "string" ? l.config : "";
  if (!INITIALS_RE.test(config) || (config && product.slug !== "ensemble-rouge")) return null;
  const price = product.slug === "ensemble-rouge" ? 3500 + (config ? 300 : 0) : catalogPrice(product);
  const qty = normalizeQty(l.qty);
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(price * qty) || price * qty > MAX_TOTAL) return null;
  return {
    key: [product.slug, colour, size, config].join("|"),
    id: typeof l.id === "string" && l.id ? l.id : uid(),
    slug: product.slug, colour, size, config, qty
  };
}

function resolveLine(l) {
  const identity = validLine(l);
  if (!identity) return null;
  const product = getLoadedProducts().find(p => p.slug === identity.slug);
  return { ...identity, name: product.name,
    price: identity.slug === "ensemble-rouge" ? 3500 + (identity.config ? 300 : 0) : catalogPrice(product),
    image: safeImageUrl(product.images?.[0]) };
}

function reconcile() {
  if (!hasLoadedCatalog()) return 0;
  const kept = [];
  let total = 0;
  let removed = false;
  for (const source of cart) {
    const line = validLine(source);
    const resolved = line && resolveLine(line);
    const next = resolved ? total + resolved.price * line.qty : Infinity;
    if (!line || !Number.isSafeInteger(next) || next > MAX_TOTAL) { removed = true; continue; }
    total = next;
    kept.push(line);
  }
  cart = kept;
  if (removed) announceRemoval();
  return total;
}

function load() {
  const rawCart = safeStorageGet(CART_KEY, []);
  cart = Array.isArray(rawCart) ? rawCart : [];
  reconcile();
  safeStorageSet(CART_KEY, cart);
  const rawWish = safeStorageGet(WISH_KEY, []);
  wishlist = Array.isArray(rawWish)
    ? rawWish.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
    : [];
}

function persist() {
  reconcile();
  safeStorageSet(CART_KEY, cart);
  safeStorageSet(WISH_KEY, wishlist);
  listeners.forEach((fn) => { try { fn(); } catch (_) {} });
}

function uid() {
  return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function initCart() {
  await loadProducts();
  if (hasLoadedCatalog()) load();
  updateCounts();
  return { cart, wishlist };
}

export function getCart() { reconcile(); return cart.map(resolveLine); }
export function getWishlist() { return wishlist.slice(); }

export function cartCount() {
  return cart.reduce((n, l) => n + (Number(l.qty) || 0), 0);
}

export function cartTotal() { return reconcile(); }

export function addLine(source) {
  const currentTotal = reconcile();
  const line = validLine(source);
  if (!line) { announceRemoval(); return false; }
  const existing = cart.find(l => l.key === line.key);
  const qty = existing ? normalizeQty(existing.qty + line.qty) : line.qty;
  const price = resolveLine(line).price;
  const total = currentTotal + price * (qty - (existing?.qty || 0));
  if (!Number.isSafeInteger(total) || total > MAX_TOTAL) { announceRemoval(); return false; }
  if (existing) existing.qty = qty;
  else cart.push(line);
  persist();
  updateCounts();
  return true;
}

export function removeLine(id) {
  cart = cart.filter((l) => l.id !== id);
  persist();
  updateCounts();
}

export function setQty(id, qty) {
  const currentTotal = reconcile();
  const n = normalizeQty(qty);
  const line = cart.find((l) => l.id === id);
  if (line) {
    const resolved = resolveLine(line);
    const total = currentTotal + (n - line.qty) * (resolved?.price || 0);
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL) return;
    line.qty = n; persist(); updateCounts();
  }
}

export function clearCart() {
  cart = [];
  persist();
  updateCounts();
}

export function toggleWishlist(slug) {
  if (typeof slug !== "string" || !slug) return false;
  const i = wishlist.indexOf(slug);
  if (i >= 0) wishlist.splice(i, 1);
  else wishlist.push(slug);
  persist();
  updateCounts();
  return i < 0;
}

export function isWished(slug) { return wishlist.includes(slug); }

export function updateCounts() {
  const cc = document.getElementById("cart-count");
  const wc = document.getElementById("wishlist-count");
  if (cc) cc.textContent = String(cartCount());
  if (wc) wc.textContent = String(wishlist.length);
}

export function onCartChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function saveOrder(order) {
  const before = cart.length;
  const total = reconcile();
  if (!cart.length || cart.length !== before || !Number.isSafeInteger(total) || total > MAX_TOTAL) return false;
  const list = safeStorageGet(ORDER_KEY, []);
  const src = order && typeof order === "object" ? order : {};
  const meta = {
    number: typeof src.number === "string" ? src.number : demoOrderNumber(),
    at: new Date().toISOString(),
    delivery: src.delivery === "stopdesk" ? "stopdesk" : "home",
    payment: "cod", total, lines: cart.map(l => ({ ...l }))
  };
  return safeStorageSet(ORDER_KEY, [...(Array.isArray(list) ? list : []), meta].slice(-20));
}

export function demoOrderNumber() {
  return "AZHO-DEMO-" + Date.now().toString(36).toUpperCase();
}

/* ---------- Rendering ---------- */

function lineMeta(line) {
  const parts = [];
  if (line.colour) parts.push(t("product.colour") + ": " + t("colour." + line.colour));
  if (line.size) parts.push(t("product.size") + ": " + line.size);
  if (line.config) parts.push(t("cart.configLine") + ": " + line.config);
  return parts.join(" · ");
}

function servicesHtml() {
  return '<p class="checkout-note cart-delivery-note">' + escapeHtml(t("cart.feeNote")) + ' ' + escapeHtml(t("cart.services")) + '</p>';
}

function attachImageFallback(root) {
  root.querySelectorAll("img[data-fallback]").forEach((img) => {
    img.addEventListener("error", () => {
      img.style.display = "none";
      const ph = img.parentElement && img.parentElement.querySelector("[data-fallback-text]");
      if (ph) ph.hidden = false;
    });
  });
}

export function renderCart(container) {
  if (!container) return;
  reconcile();
  if (hasLoadedCatalog()) safeStorageSet(CART_KEY, cart);
  if (!cart.length) {
    container.innerHTML = '<h3 class="cart-empty" tabindex="-1">' + escapeHtml(t("cart.empty")) + "</h3>" + servicesHtml();
    return;
  }
  const items = cart.map(resolveLine).map((l) => {
    const alt = escapeHtml(localized(l.name));
    const img = l.image
      ? '<img width="400" height="500" src="' + escapeHtml(l.image) + '" alt="' + alt + '" loading="lazy" data-fallback>' +
        '<span class="cart-item-ph" data-fallback-text hidden>' + escapeHtml(t("product.imageMissing")) + "</span>"
      : '<span class="cart-item-ph">' + escapeHtml(t("product.imageMissing")) + "</span>";
    return (
      '<li class="cart-item" data-id="' + escapeHtml(l.id) + '">' +
        '<div class="cart-item-media">' + img + "</div>" +
        "<div>" +
          '<p class="cart-item-title">' + escapeHtml(localized(l.name)) + "</p>" +
          '<p class="cart-item-meta">' + escapeHtml(lineMeta(l)) + "</p>" +
          '<p class="cart-item-meta">' + escapeHtml(formatPrice(l.price)) + " × " + l.qty + "</p>" +
        "</div>" +
        '<div class="cart-item-actions">' +
          '<button type="button" data-act="remove" data-id="' + escapeHtml(l.id) + '">' + escapeHtml(t("cart.remove")) + "</button>" +
          '<div class="qty-row">' +
            '<button type="button" data-act="dec" data-id="' + escapeHtml(l.id) + '" aria-label="' + escapeHtml(t("product.qtyDec")) + '">−</button>' +
            '<input type="number" min="1" max="99" value="' + l.qty + '" data-act="qty" data-id="' + escapeHtml(l.id) + '" aria-label="' + escapeHtml(t("cart.qty")) + '">' +
            '<button type="button" data-act="inc" data-id="' + escapeHtml(l.id) + '" aria-label="' + escapeHtml(t("product.qtyInc")) + '">+</button>' +
          "</div>" +
        "</div>" +
      "</li>"
    );
  }).join("");

  container.innerHTML =
    '<ul class="cart-list">' + items + "</ul>" +
    '<div class="cart-total"><span>' + escapeHtml(t("cart.total")) + "</span><span>" + escapeHtml(formatPrice(cartTotal())) + "</span></div>" +
    servicesHtml() +
    '<button type="button" class="btn btn-primary" id="cart-checkout">' + escapeHtml(t("cart.checkout")) + "</button>" +
    '<div id="checkout-slot"></div>';

  attachImageFallback(container);

  container.querySelectorAll("[data-act]").forEach((el) => {
    const act = el.getAttribute("data-act");
    const id = el.getAttribute("data-id");
    if (act === "remove") el.addEventListener("click", () => {
      const idx = cart.findIndex((l) => l.id === id);
      removeLine(id);
      renderCart(container);
      const next = container.querySelectorAll(".cart-item")[Math.min(idx, cart.length - 1)];
      const target = next ? next.querySelector('[data-act="remove"]') : container.querySelector(".cart-empty");
      if (target) target.focus();
    });
    if (act === "inc") el.addEventListener("click", () => {
      const line = cart.find((l) => l.id === id);
      if (line) { setQty(id, line.qty + 1); renderCart(container); refocus(container, id, "inc"); }
    });
    if (act === "dec") el.addEventListener("click", () => {
      const line = cart.find((l) => l.id === id);
      if (line) { setQty(id, line.qty - 1); renderCart(container); refocus(container, id, "dec"); }
    });
    if (act === "qty") el.addEventListener("change", () => {
      setQty(id, el.value);
      renderCart(container);
      refocus(container, id, "qty");
    });
  });

  const co = container.querySelector("#cart-checkout");
  if (co) co.addEventListener("click", () => renderCheckout(container.querySelector("#checkout-slot")));
}

function refocus(container, id, act) {
  const el = container.querySelector('[data-act="' + act + '"][data-id="' + id + '"]');
  if (el) el.focus();
}

export function renderWishlist(container, products) {
  if (!container) return;
  const list = Array.isArray(products) ? products : [];
  const items = wishlist
    .map((slug) => list.find((p) => p && p.slug === slug))
    .filter(Boolean);
  if (!items.length) {
    container.innerHTML = '<p class="cart-empty">' + escapeHtml(t("wishlist.empty")) + "</p>";
    return;
  }
  container.innerHTML = '<ul class="cart-list">' + items.map((p) => {
    const alt = escapeHtml(localized(p.name));
    const src = safeImageUrl(p.images && p.images[0]);
    const img = src
      ? '<img width="400" height="500" src="' + escapeHtml(src) + '" alt="' + alt + '" loading="lazy" data-fallback>' +
        '<span class="cart-item-ph" data-fallback-text hidden>' + escapeHtml(t("product.imageMissing")) + "</span>"
      : '<span class="cart-item-ph">' + escapeHtml(t("product.imageMissing")) + "</span>";
    return (
      '<li class="cart-item">' +
        '<div class="cart-item-media">' + img + "</div>" +
        "<div>" +
          '<p class="cart-item-title">' + escapeHtml(localized(p.name)) + "</p>" +
          '<p class="cart-item-meta">' + escapeHtml(formatPrice(p.price)) + "</p>" +
          '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '">' + escapeHtml(t("product.view")) + "</a>" +
        "</div>" +
        '<div class="cart-item-actions">' +
          '<button type="button" data-wish-remove="' + escapeHtml(p.slug) + '">' + escapeHtml(t("wishlist.remove")) + "</button>" +
        "</div>" +
      "</li>"
    );
  }).join("") + "</ul>";
  attachImageFallback(container);
  container.querySelectorAll("[data-wish-remove]").forEach((b) => {
    b.addEventListener("click", () => {
      toggleWishlist(b.getAttribute("data-wish-remove"));
      renderWishlist(container, products);
    });
  });
}

/* ---------- Checkout ---------- */

const PHONE_RE = /^(?:\+213|00213|0)([567]\d{8}|[234]\d{7})$/;

export function validatePhone(raw) {
  const s = String(raw || "").replace(/[\s\-().]/g, "");
  return PHONE_RE.test(s);
}

export async function renderCheckout(container) {
  if (!container) return;
  reconcile();
  if (!cart.length) return;
  const wilayas = await loadWilayas();
  const list = Array.isArray(wilayas) ? wilayas : [];
  const opts = list.map((w) => {
    const label = getLang() === "ar" ? w.ar : w.fr;
    return '<option value="' + escapeHtml(String(w.code)) + '">' + escapeHtml(String(w.code).padStart(2, "0") + " — " + label) + "</option>";
  }).join("");

  container.innerHTML =
    '<h3>' + escapeHtml(t("cart.checkoutTitle")) + "</h3>" +
    '<form class="checkout-form" id="checkout-form" novalidate>' +
      '<p id="checkout-save-error" role="alert" tabindex="-1" hidden></p>' +
      '<label>' + escapeHtml(t("cart.fullName")) +
        '<input name="fullName" type="text" autocomplete="name" required aria-describedby="err-fullName">' +
        '<span class="field-error" id="err-fullName" aria-live="polite"></span>' +
      "</label>" +
      '<label>' + escapeHtml(t("cart.phone")) +
        '<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required aria-describedby="err-phone">' +
        '<span class="field-error" id="err-phone" aria-live="polite"></span>' +
      "</label>" +
      '<label>' + escapeHtml(t("cart.wilaya")) +
        '<select name="wilaya" required aria-describedby="err-wilaya"><option value="">—</option>' + opts + "</select>" +
        '<span class="field-error" id="err-wilaya" aria-live="polite"></span>' +
      "</label>" +
      '<label>' + escapeHtml(t("cart.commune")) +
        '<input name="commune" type="text" autocomplete="address-level2" required aria-describedby="err-commune">' +
        '<span class="field-error" id="err-commune" aria-live="polite"></span>' +
      "</label>" +
      '<label>' + escapeHtml(t("cart.address")) +
        '<textarea name="address" autocomplete="street-address" required aria-describedby="err-address"></textarea>' +
        '<span class="field-error" id="err-address" aria-live="polite"></span>' +
      "</label>" +
      '<label>' + escapeHtml(t("cart.delivery")) +
        '<select name="delivery">' +
          '<option value="home">' + escapeHtml(t("cart.home")) + "</option>" +
          '<option value="stopdesk">' + escapeHtml(t("cart.stopdesk")) + "</option>" +
        "</select>" +
      "</label>" +
      '<label>' + escapeHtml(t("cart.paymentLabel")) +
        '<select name="payment" aria-describedby="payment-note">' +
          '<option value="cod">' + escapeHtml(t("cart.paymentCod")) + "</option>" +
        "</select>" +
      "</label>" +
      '<p class="checkout-note" id="payment-note">' + escapeHtml(t("cart.feeNote")) + "</p>" +
      '<p class="checkout-note">' + escapeHtml(t("cart.services")) + "</p>" +
      '<button type="submit" class="btn btn-primary">' + escapeHtml(t("cart.submit")) + "</button>" +
      '<p class="checkout-note">' + escapeHtml(t("cart.noNetwork")) + "</p>" +
    "</form>";

  const form = container.querySelector("#checkout-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const errors = {};
    const fullName = String(data.get("fullName") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const wilaya = String(data.get("wilaya") || "").trim();
    const commune = String(data.get("commune") || "").trim();
    const address = String(data.get("address") || "").trim();
    if (fullName.length < 2) errors.fullName = t("cart.errName");
    if (!validatePhone(phone)) errors.phone = t("cart.errPhone");
    if (!list.some(w => String(w.code) === wilaya)) errors.wilaya = t("cart.errWilaya");
    if (!commune) errors.commune = t("cart.errCommune");
    if (!address) errors.address = t("cart.errAddress");

    ["fullName", "phone", "wilaya", "commune", "address"].forEach((k) => {
      const el = form.querySelector('[name="' + k + '"]');
      const err = form.querySelector("#err-" + k);
      if (!el || !err) return;
      if (errors[k]) {
        el.setAttribute("aria-invalid", "true");
        err.textContent = errors[k];
      } else {
        el.removeAttribute("aria-invalid");
        err.textContent = "";
      }
    });

    const firstKey = Object.keys(errors)[0];
    if (firstKey) {
      const el = form.querySelector('[name="' + firstKey + '"]');
      if (el) el.focus();
      return;
    }

    const number = demoOrderNumber();
    const saved = saveOrder({
      number,
      at: new Date().toISOString(),
      delivery: String(data.get("delivery") || "home"),
      payment: String(data.get("payment") || "cod"),
      lines: cart.slice(),
      total: cartTotal()
    });

    if (!saved) {
      const error = form.querySelector("#checkout-save-error");
      error.hidden = false;
      error.textContent = t("cart.saveFailed");
      error.focus();
      return;
    }

    const live = document.getElementById("cart-body");
    clearCart();
    const target = live || container;
    target.innerHTML =
      '<div class="checkout-success" role="status" tabindex="-1" id="checkout-success">' +
        "<strong>" + escapeHtml(t("cart.successFocus")) + "</strong>" +
        '<p class="demo-order-label">' + escapeHtml(t("cart.demoNumber")) + '</p><p class="demo-order-number" dir="ltr">' + escapeHtml(number) + '</p>' +
        "<p>" + escapeHtml(t("cart.noNetwork")) + "</p>" +
        '<button type="button" class="btn btn-primary" data-continue-shopping>' + escapeHtml(t("cart.continueShopping")) + '</button>' +
      "</div>";
    const box = target.querySelector("#checkout-success");
    if (box) box.focus();
  });
}
