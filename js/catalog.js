import { t, formatPrice, escapeHtml, localized, onChange, getLang } from "./i18n.js?v=20261113v";
import { loadProducts, categoriesOf, catalogPrice } from "./store.js?v=20261113v";
import { openProductDialog } from "./overlay.js?v=20261113v";


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

function cardHtml(p) {
  const name = localized(p.name);
  const img = (p.images && p.images[0]) || "";
  const media = img
    ? '<img width="800" height="1000" src="' + escapeHtml(img) + '" alt="' + escapeHtml(t("product.imageAlt", { name, n: 1 })) + '" loading="lazy">'
    : '<div class="img-fallback">' + escapeHtml(t("product.imageMissing")) + "</div>";
  return (
    '<li class="product-card" data-slug="' + escapeHtml(p.slug) + '">' +
      '<a class="product-card-media" href="product.html?slug=' + encodeURIComponent(p.slug) + '&amp;lang=' + document.documentElement.lang + '">' + media + "</a>" +
      '<div class="product-card-body">' +
        '<h2 class="product-card-title">' + escapeHtml(name) + "</h2>" +
        '<p class="product-card-price">' + priceHtml(p) + "</p>" +
        '<div class="product-card-actions">' +
          '<button type="button" class="btn btn-small btn-primary" data-quickview>' + escapeHtml(t("product.quickView")) + "</button>" +
        "</div>" +
      "</div>" +
    "</li>"
  );
}

function fillCategories(select, products) {
  const cats = categoriesOf(products);
  const prev = select.value;
  select.innerHTML = '<option value="">' + escapeHtml(t("shop.all")) + "</option>" +
    cats.map((c) => '<option value="' + escapeHtml(c) + '">' + escapeHtml(t("category." + c)) + "</option>").join("");
  if (prev && cats.includes(prev)) select.value = prev;
}

function applyFilters(products, state) {
  let list = products.slice();
  if (state.category) list = list.filter((p) => p.category === state.category);
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((p) => localized(p.name).toLowerCase().includes(q));
  }
  if (state.sort === "price-asc") list.sort((a, b) => {
    const pa = catalogPrice(a), pb = catalogPrice(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
  else if (state.sort === "price-desc") list.sort((a, b) => {
    const pa = catalogPrice(a), pb = catalogPrice(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pb - pa;
  });
  else list.sort((a, b) => localized(a.name).localeCompare(localized(b.name), getLang()));
  return list;
}

export async function init() {
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("shop-empty");
  const form = document.getElementById("shop-filters");
  if (!grid || !form) return;

  const catSel = form.querySelector('[name="category"]');
  const sortSel = form.querySelector('[name="sort"]');
  const qInput = form.querySelector('[name="q"]');

  const products = await loadProducts();
  fillCategories(catSel, products);

  const state = { q: "", category: "", sort: sortSel ? sortSel.value : "name" };

  function render() {
    const list = applyFilters(products, state);
    grid.innerHTML = list.map(cardHtml).join("");
    grid.querySelectorAll("img").forEach(imgFallback);
    grid.querySelectorAll(".product-card").forEach((card) => {
      const slug = card.getAttribute("data-slug");
      const p = products.find((x) => x.slug === slug);
      const btn = card.querySelector("[data-quickview]");
      if (btn && p) btn.addEventListener("click", () => openProductDialog(p));
    });
    if (empty) empty.hidden = list.length > 0;
  }

  form.addEventListener("submit", (e) => e.preventDefault());
  if (qInput) qInput.addEventListener("input", () => { state.q = qInput.value.trim(); render(); });
  if (catSel) catSel.addEventListener("change", () => { state.category = catSel.value; render(); });
  if (sortSel) sortSel.addEventListener("change", () => { state.sort = sortSel.value; render(); });

  onChange(() => { fillCategories(catSel, products); render(); });
  render();
}
