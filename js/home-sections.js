import { t, localized, formatPrice, escapeHtml, onChange } from "./i18n.js?v=20261113v";
import { loadProducts, safeImageUrl } from "./store.js?v=20261113v";
import { openProductDialog } from "./overlay.js?v=20261113v";

let mounted = false;
let products = [];

function ensureStyles() {
  if (document.querySelector('link[data-home-css], link[href^="css/home.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/home.css?v=20261113v";
  link.setAttribute("data-home-css", "");
  document.head.appendChild(link);
}

function productCard(p) {
  const name = localized(p.name);
  const img = safeImageUrl(p.images && p.images[0]);
  const priceHtml = p.promo
    ? '<del>' + escapeHtml(formatPrice(p.regularPrice || p.price)) + "</del> " + escapeHtml(formatPrice(p.price))
    : escapeHtml(formatPrice(p.price));
  return (
    '<li class="product-card" data-slug="' + escapeHtml(p.slug) + '">' +
      '<a class="product-card-media" href="product.html?slug=' + encodeURIComponent(p.slug) + '&amp;lang=' + document.documentElement.lang + '">' +
        (img ? '<img width="800" height="1000" src="' + escapeHtml(img) + '" alt="' + escapeHtml(t("product.imageAlt", { name, n: 1 })) + '" loading="lazy" decoding="async">' : "") +
        '<div class="img-fallback">' + escapeHtml(t("product.imageMissing")) + "</div>" +
      "</a>" +
      '<div class="product-card-body">' +
        '<h3 class="product-card-title">' + escapeHtml(name) + "</h3>" +
        '<p class="product-card-price">' + priceHtml + "</p>" +
        '<div class="product-card-actions">' +
          '<button type="button" class="btn btn-primary btn-small" data-open>' + escapeHtml(t("product.quickView")) + "</button>" +
        "</div>" +
      "</div>" +
    "</li>"
  );
}

function wireCard(li, p) {
  const img = li.querySelector("img");
  if (img) {
    img.addEventListener("error", () => {
      img.style.display = "none";
      const fb = li.querySelector(".img-fallback");
      if (fb) fb.style.display = "grid";
    });
  }
  const btn = li.querySelector("[data-open]");
  if (btn) btn.addEventListener("click", () => openProductDialog(p));
}

function renderFeatured() {
  const grid = document.getElementById("home-featured-grid");
  if (!grid) return;
  grid.innerHTML = products.map(productCard).join("");
  Array.from(grid.children).forEach((li) => {
    const slug = li.getAttribute("data-slug");
    const p = products.find((x) => x.slug === slug);
    if (p) wireCard(li, p);
  });
}

function renderNewArrivals() {
  const grid = document.getElementById("home-new-grid");
  if (!grid) return;
  const first2 = products.slice(0, 2);
  grid.innerHTML = first2.map(productCard).join("");
  Array.from(grid.children).forEach((li) => {
    const slug = li.getAttribute("data-slug");
    const p = products.find((x) => x.slug === slug);
    if (p) wireCard(li, p);
  });
}

function renderAtelierTeaser() {
  const el = document.getElementById("home-atelier-teaser");
  if (!el) return;
  el.innerHTML =
    '<div class="home-atelier-inner">' +
      '<h2>' + escapeHtml(t("atelier.title")) + "</h2>" +
      '<p>' + escapeHtml(t("atelier.lead")) + "</p>" +
      '<a class="btn btn-primary" href="atelier.html">' + escapeHtml(t("nav.atelier")) + "</a>" +
    "</div>";
}

function renderDelivery() {
  const el = document.getElementById("home-delivery");
  if (!el) return;
  el.innerHTML =
    '<div class="home-delivery-inner">' +
      '<h2>' + escapeHtml(t("home.deliveryTitle")) + "</h2>" +
      '<p>' + escapeHtml(t("home.deliveryBody")) + "</p>" +
      '<p class="home-contact">' +
        '<a href="tel:+213551210696" dir="ltr">' + escapeHtml(t("footer.phone")) + '</a> · ' +
        '<a href="mailto:azholingerie@gmail.com">' + escapeHtml(t("footer.email")) + '</a> · ' +
        escapeHtml(t("home.address")) +
      "</p>" +
    "</div>";
}

function renderAll() {
  renderFeatured();
  renderNewArrivals();
  renderAtelierTeaser();
  renderDelivery();
}

export async function initHomeSections() {
  if (mounted) return;
  mounted = true;
  ensureStyles();
  products = await loadProducts();
  renderAll();
  onChange(() => renderAll());
}
