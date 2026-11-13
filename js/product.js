import { openProductDialog } from "./overlay.js?v=20261113n";
import { t, formatPrice, escapeHtml, localized, onChange } from "./i18n.js?v=20261113n";
import { getProduct, getRelated, normalizeQty, safeImageUrl, productSizes, catalogPrice, isPurchasable } from "./store.js?v=20261113n";
import { addLine, isWished, toggleWishlist } from "./cart.js?v=20261113n";


function imgFallback(img) {
  img.addEventListener("error", () => {
    img.style.visibility = "hidden";
    const p = img.parentNode;
    if (p && !p.querySelector(".img-fallback")) {
      const d = document.createElement("div");
      d.className = "img-fallback";
      d.textContent = t("product.imageMissing");
      p.appendChild(d);
    }
  }, { once: true });
}

function priceHtml(p) {
  const price = catalogPrice(p);
  if (price == null) return escapeHtml(t("product.priceOnRequest"));
  if (p.promo && Number.isSafeInteger(p.regularPrice)) {
    return '<del>' + escapeHtml(formatPrice(p.regularPrice)) + "</del> " + escapeHtml(formatPrice(price));
  }
  return escapeHtml(formatPrice(price));
}

function askPriceHtml() {
  return (
    '<div class="product-ask-price">' +
      '<a class="btn btn-primary" href="tel:+213551210696" dir="ltr">' + escapeHtml(t("product.askPrice")) + "</a>" +
      '<a class="btn btn-ghost" href="https://www.instagram.com/azholingerie/" target="_blank" rel="noopener">Instagram</a>' +
      '<p class="demo-note">' + escapeHtml(t("product.priceNote")) + "</p>" +
    "</div>"
  );
}

function relatedCard(p) {
  const name = localized(p.name);
  const img = safeImageUrl(p.images && p.images[0]);
  return (
    '<li class="product-card">' +
      '<a class="product-card-media" href="product.html?slug=' + encodeURIComponent(p.slug) + '&amp;lang=' + document.documentElement.lang + '">' +
        (img ? '<img width="800" height="1000" src="' + escapeHtml(img) + '" alt="' + escapeHtml(t("product.imageAlt", { name, n: 1 })) + '" loading="lazy">' : "") +
      "</a>" +
      '<div class="product-card-body">' +
        '<h3 class="product-card-title">' + escapeHtml(name) + "</h3>" +
        '<p class="product-card-price">' + priceHtml(p) + "</p>" +
        '<button type="button" class="card-quickview" data-related-quick="' + escapeHtml(p.slug) + '">' + escapeHtml(t("product.quickView")) + "</button>" +
      "</div>" +
    "</li>"
  );
}

function jsonLd(p) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: localized(p.name),
    description: localized(p.description),
    image: (p.images || []).map(i => safeImageUrl(i)).filter(Boolean).map(i => new URL(i, location.href).href),
    sku: p.slug,
    offers: {
      "@type": "Offer",
      priceCurrency: "DZD",
      price: String(p.price)
    }
  };
  if (catalogPrice(p) == null) delete data.offers.price;
  const knownAvailability = ["InStock", "OutOfStock", "PreOrder", "BackOrder", "LimitedAvailability", "Discontinued", "SoldOut"];
  const availability = typeof p.availability === "string" ? p.availability.replace("https://schema.org/", "") : "";
  if (knownAvailability.includes(availability)) data.offers.availability = "https://schema.org/" + availability;
  else if (Number.isSafeInteger(p.stock) && p.stock >= 0) data.offers.availability = "https://schema.org/" + (p.stock > 0 ? "InStock" : "OutOfStock");
  document.querySelectorAll('script[type="application/ld+json"][data-product]').forEach((s) => s.remove());
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.setAttribute("data-product", "1");
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}

function updateMeta(p) {
  const name = localized(p.name);
  const desc = localized(p.description);
  document.title = name + " — AZHO MAISON";
  let m = document.querySelector('meta[name="description"]');
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", "description");
    document.head.appendChild(m);
  }
  m.setAttribute("content", desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', name + ' — AZHO MAISON');
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
  document.querySelector('meta[property="og:image"]')?.setAttribute('content', safeImageUrl(p.images?.[0]));
}

function notFoundHtml() {
  return (
    '<div class="product-not-found">' +
      "<h1>" + escapeHtml(t("product.notFound")) + "</h1>" +
      '<a class="btn btn-ghost" href="shop.html">' + escapeHtml(t("product.backToShop")) + "</a>" +
    "</div>"
  );
}

function renderProduct(root, p, related) {
  const name = localized(p.name);
  const desc = localized(p.description);
  const images = p.images?.length ? p.images.map(src => safeImageUrl(src)) : [""];
  const colours = p.colours || [];
  const sizes = p.sizes?.length ? p.sizes : [];
  const purchasable = isPurchasable(p);

  const thumbs = images.map((src, i) =>
    '<button type="button" data-thumb="' + i + '" aria-pressed="' + (i === 0 ? "true" : "false") + '" aria-label="' + escapeHtml(t("product.imageAlt", { name, n: i + 1 })) + '">' +
      (src ? '<img width="64" height="64" src="' + escapeHtml(src) + '" alt="">' : "") +
    "</button>"
  ).join("");

  const colourHtml = colours.length
    ? '<div class="option-group" role="group" aria-label="' + escapeHtml(t("product.colour")) + '"><span>' + escapeHtml(t("product.colour")) + '</span><div class="option-row">' +
        colours.map((c, i) => '<button type="button" class="option-chip" data-colour="' + escapeHtml(c) + '" aria-pressed="' + (i === 0 ? "true" : "false") + '">' + escapeHtml(t("colour." + c)) + "</button>").join("") +
      "</div></div>"
    : "";

  const sizeHtml = sizes.length
    ? '<div class="option-group" role="group" aria-label="' + escapeHtml(t("product.size")) + '"><span>' + escapeHtml(t("product.size")) + '</span><div class="option-row">' +
        sizes.map((s) => '<button type="button" class="option-chip" data-size="' + escapeHtml(s) + '" aria-pressed="false">' + escapeHtml(t("size." + s)) + "</button>").join("") +
      "</div></div>"
    : "";

  root.innerHTML =
    '<div class="product-layout">' +
      '<div class="product-gallery">' +
        '<div class="product-gallery-main">' +
          (images[0] ? '<img width="800" height="1000" src="' + escapeHtml(images[0]) + '" alt="' + escapeHtml(t("product.imageAlt", { name, n: 1 })) + '" data-main>' : "") +
        "</div>" +
        '<div class="product-gallery-thumbs" role="group" aria-label="' + escapeHtml(t("product.gallery")) + '">' + thumbs + "</div>" +
      "</div>" +
      '<div class="product-info">' +
        "<h1>" + escapeHtml(name) + "</h1>" +
        '<p class="product-price">' + priceHtml(p) + "</p>" +
        "<p>" + escapeHtml(desc) + "</p>" +
        colourHtml +
        sizeHtml +
        '<div class="option-group"><span>' + escapeHtml(t("product.qty")) + '</span><div class="qty-row">' +
          '<button type="button" data-qty-dec aria-label="' + escapeHtml(t("product.qtyDec")) + '">−</button>' +
          '<input type="number" min="1" max="99" step="1" value="1" data-qty aria-label="' + escapeHtml(t("product.qty")) + '">' +
          '<button type="button" data-qty-inc aria-label="' + escapeHtml(t("product.qtyInc")) + '">+</button>' +
        "</div></div>" +
        '<div class="product-card-actions">' +
          (purchasable
            ? '<button type="button" class="btn btn-primary" data-add>' + escapeHtml(t("product.add")) + "</button>"
            : '<button type="button" class="btn btn-primary" data-add disabled aria-disabled="true">' + escapeHtml(t("product.add")) + "</button>") +
          '<button type="button" class="btn btn-ghost" data-wish>' + escapeHtml(isWished(p.slug) ? t("product.wishlistRemove") : t("product.wishlist")) + "</button>" +
        "</div>" +
        (purchasable ? "" : askPriceHtml()) +
        '<p class="field-error" role="status" aria-live="polite" data-err></p>' +
        '<p class="demo-note">' + escapeHtml(t("product.demoNote")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("product.sizeDemo")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("product.delivery")) + "</p>" +
      "</div>" +
    "</div>" +
    (related.length
      ? '<section class="related"><h2>' + escapeHtml(t("product.related")) + '</h2><ul class="product-grid">' + related.map(relatedCard).join("") + "</ul></section>"
      : "");

  root.querySelectorAll("img").forEach(imgFallback);
  root.querySelectorAll("[data-related-quick]").forEach(button => button.addEventListener("click", () => {
    const item = related.find(p => p.slug === button.dataset.relatedQuick);
    if (item) openProductDialog(item);
  }));

  let colour = colours[0] || "";
  let size = "";
  const qtyInput = root.querySelector("[data-qty]");
  const mainImg = root.querySelector("[data-main]");
  const errEl = root.querySelector("[data-err]");

  function clampQty() {
    const n = normalizeQty(qtyInput.value);
    qtyInput.value = String(n);
    return n;
  }

  root.querySelectorAll("[data-thumb]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-thumb"));
      root.querySelectorAll("[data-thumb]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      if (mainImg && images[i]) {
        mainImg.style.visibility = "";
        const fb = mainImg.parentNode && mainImg.parentNode.querySelector(".img-fallback");
        if (fb) fb.remove();
        mainImg.src = images[i];
        mainImg.alt = t("product.imageAlt", { name, n: i + 1 });
      }
    });
  });

  root.querySelectorAll("[data-colour]").forEach((b) => {
    b.addEventListener("click", () => {
      colour = b.getAttribute("data-colour");
      root.querySelectorAll("[data-colour]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    });
  });
  root.querySelectorAll("[data-size]").forEach((b) => {
    b.addEventListener("click", () => {
      size = b.getAttribute("data-size");
      root.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      if (errEl) errEl.textContent = "";
    });
  });

  const dec = root.querySelector("[data-qty-dec]");
  const inc = root.querySelector("[data-qty-inc]");
  if (dec) dec.addEventListener("click", () => { qtyInput.value = String(Math.max(1, clampQty() - 1)); });
  if (inc) inc.addEventListener("click", () => { qtyInput.value = String(Math.min(99, clampQty() + 1)); });
  if (qtyInput) qtyInput.addEventListener("change", clampQty);

  const add = root.querySelector("[data-add]");
  if (add && purchasable) add.addEventListener("click", () => {
    if (colours.length && !colour) { const f = root.querySelector("[data-colour]"); if (f) f.focus(); return; }
    if (sizes.length && !size) {
      if (errEl) errEl.textContent = t("product.selectOptions");
      const f = root.querySelector("[data-size]");
      if (f) f.focus();
      return;
    }
    if (errEl) errEl.textContent = "";
    addLine({
      slug: p.slug,
      qty: clampQty(),
      colour,
      size
    });
    add.textContent = t("product.added");
    setTimeout(() => { add.textContent = t("product.add"); }, 1500);
  });

  const wish = root.querySelector("[data-wish]");
  if (wish) wish.addEventListener("click", () => {
    const added = toggleWishlist(p.slug);
    wish.textContent = added ? t("product.wishlistRemove") : t("product.wishlist");
  });
}

export async function init() {
  const root = document.getElementById("product-page");
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) { root.innerHTML = notFoundHtml(); onChange(() => {root.innerHTML = notFoundHtml();}); return; }

  const p = await getProduct(slug);
  if (!p) { root.innerHTML = notFoundHtml(); onChange(() => {root.innerHTML = notFoundHtml();}); return; }

  const related = await getRelated(slug, 3);
  renderProduct(root, p, related);
  jsonLd(p);
  updateMeta(p);

  onChange(() => {
    renderProduct(root, p, related);
    jsonLd(p);
    updateMeta(p);
  });
}
