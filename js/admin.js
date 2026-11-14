import { t, formatPrice, escapeHtml, localized, onChange } from "./i18n.js?v=20261113v";
import { loadProducts, loadHotspots, safeStorageGet, safeStorageSet, safeImageUrl } from "./store.js?v=20261113v";

const PRODUCTS_KEY = "azho.admin.products.demo.v2";
const HOTSPOTS_KEY = "azho.hotspots";

const SECTIONS = ["products", "orders", "showroom", "customization", "delivery", "content"];
const HOTSPOT_IDS = [
  "a-enter",
  "b-rail-1",
  "b-rail-2",
  "b-rail-3",
  "c-island-1",
  "c-rail-1",
  "d-atelier",
  "e-counter"
];

function loadAdminProducts(base) {
  const stored = safeStorageGet(PRODUCTS_KEY, null);
  if (Array.isArray(stored) && stored.length) {
    return stored.filter(p => p && base.some(b => b.slug === p.slug)).map(p => {
      const original = base.find(b => b.slug === p.slug);
      return { ...p, name: p.name && typeof p.name === 'object' ? p.name : original.name,
        image: safeImageUrl(p.image, original.images?.[0]) };
    });
  }
  return base.map((p, i) => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    regularPrice: p.regularPrice || p.price,
    promo: !!p.promo,
    sizes: (p.sizes && p.sizes.length) ? p.sizes : ["XS", "S", "M", "L", "XL", "XXL"],
    colours: p.colours || [],
    stock: [12, 2, 8, 1, 6][i % 5],
    image: (p.images && p.images[0]) || "",
    published: true
  }));
}

function saveAdminProducts(list) {
  safeStorageSet(PRODUCTS_KEY, list);
}

function loadHotspotMap(products) {
  const m = safeStorageGet(HOTSPOTS_KEY, null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  return Object.fromEntries(Object.entries(m).filter(([id, slug]) =>
    HOTSPOT_IDS.includes(id) && typeof slug === 'string' && products.some(p => p.slug === slug)));

}

function saveHotspotMap(m) {
  safeStorageSet(HOTSPOTS_KEY, m);
}

function renderProducts(container, state) {
  const rows = state.products.map((p) => {
    const name = localized(p.name);
    return (
      "<tr>" +
        "<td>" + escapeHtml(name) + "</td>" +
        "<td>" + escapeHtml(formatPrice(p.price)) + "</td>" +
        "<td>" + escapeHtml(String(p.stock)) + (p.stock < 3 ? '<span class="low-stock">' + escapeHtml(t("admin.lowStock")) + "</span>" : "") + "</td>" +
        "<td>" + escapeHtml(p.published ? t("admin.published") : t("admin.publish")) + "</td>" +
        '<td><button type="button" data-edit="' + escapeHtml(p.slug) + '">' + escapeHtml(t("admin.edit")) + "</button></td>" +
      "</tr>"
    );
  }).join("");
  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
      "<th>" + escapeHtml(t("admin.products")) + "</th>" +
      "<th>" + escapeHtml(t("admin.price")) + "</th>" +
      "<th>" + escapeHtml(t("admin.stockDemo")) + "</th>" +
      "<th>" + escapeHtml(t("admin.publish")) + "</th>" +
      "<th></th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table>";
  container.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => openEdit(b.getAttribute("data-edit"), state, b));
  });
}

function openEdit(slug, state, trigger) {
  const p = state.products.find((x) => x.slug === slug);
  if (!p) return;
  const d = document.getElementById("admin-edit-dialog");
  const body = document.getElementById("admin-edit-body");
  if (!d || !body) return;

  body.innerHTML =
    '<form class="admin-form" id="admin-edit-form">' +
      '<label>' + escapeHtml(t("admin.nameFr")) + '<input name="nameFr" value="' + escapeHtml(p.name.fr || "") + '"></label>' +
      '<label>' + escapeHtml(t("admin.nameAr")) + '<input name="nameAr" value="' + escapeHtml(p.name.ar || "") + '"></label>' +
      '<label>' + escapeHtml(t("admin.nameEn")) + '<input name="nameEn" value="' + escapeHtml(p.name.en || "") + '"></label>' +
      '<div class="row">' +
        '<label>' + escapeHtml(t("admin.price")) + '<input name="regularPrice" type="number" min="0" value="' + escapeHtml(String(p.regularPrice || p.price)) + '"></label>' +
        '<label>' + escapeHtml(t("admin.promo")) + '<input name="price" type="number" min="0" value="' + escapeHtml(String(p.price)) + '"></label>' +
      "</div>" +
      '<label>' + escapeHtml(t("admin.sizes")) + '<input name="sizes" value="' + escapeHtml((p.sizes || []).join(", ")) + '"></label>' +
      '<label>' + escapeHtml(t("admin.colours")) + '<input name="colours" value="' + escapeHtml((p.colours || []).join(", ")) + '"></label>' +
      '<div class="row">' +
        '<label>' + escapeHtml(t("admin.stock")) + '<input name="stock" type="number" min="0" value="' + escapeHtml(String(p.stock)) + '"></label>' +
        '<label>' + escapeHtml(t("admin.publish")) + '<input name="published" type="checkbox"' + (p.published ? " checked" : "") + '></label>' +
      "</div>" +
      '<label>' + escapeHtml(t("admin.mannequin")) +
        '<select name="mannequin3d">' +
          '<option value="bust"' + (p.mannequin3d === "full" ? "" : " selected") + '>' + escapeHtml(t("admin.mannequinBust")) + "</option>" +
          '<option value="full"' + (p.mannequin3d === "full" ? " selected" : "") + '>' + escapeHtml(t("admin.mannequinFull")) + "</option>" +
        "</select></label>" +
      '<p class="demo-note">' + escapeHtml(t("admin.mannequinNote")) + "</p>" +
      '<div class="admin-upload">' + escapeHtml(t("admin.upload")) + "</div>" +
      '<button type="submit" class="btn btn-primary">' + escapeHtml(t("admin.save")) + "</button>" +
    "</form>";

  const form = body.querySelector("#admin-edit-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const regular = Math.max(0, Number(fd.get("regularPrice")) || 0);
    const saleRaw = String(fd.get("price") || "").trim();
    const sale = saleRaw === "" ? regular : Math.max(0, Number(saleRaw) || 0);
    const finalSale = Math.min(sale, regular);
    p.name = {
      fr: String(fd.get("nameFr") || "").trim(),
      ar: String(fd.get("nameAr") || "").trim(),
      en: String(fd.get("nameEn") || "").trim()
    };
    p.regularPrice = regular;
    p.price = finalSale;
    p.promo = finalSale < regular;
    p.sizes = String(fd.get("sizes") || "").split(",").map((s) => s.trim()).filter(Boolean);
    p.colours = String(fd.get("colours") || "").split(",").map((s) => s.trim()).filter(Boolean);
    p.stock = Math.max(0, Number(fd.get("stock")) || 0);
    p.published = !!fd.get("published");
    p.mannequin3d = fd.get("mannequin3d") === "full" ? "full" : "bust";
    saveAdminProducts(state.products);
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
    renderProducts(document.getElementById("admin-content"), state);
    document.querySelector(`[data-edit="${slug}"]`)?.focus();
  });

  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");
}

function renderShowroom(container, state) {
  const map = loadHotspotMap(state.catalog);
  const base = state.hotspots;
  const opts = state.catalog.map((p) =>
    '<option value="' + escapeHtml(p.slug) + '">' + escapeHtml(localized(p.name)) + "</option>"
  ).join("");
  const rows = HOTSPOT_IDS.map((id) => {
    const current = map[id] || (base && base[id] && base[id].product) || "";
    return (
      "<tr>" +
        "<td>" + escapeHtml(id) + "</td>" +
        "<td>" +
          '<select data-hotspot="' + escapeHtml(id) + '" aria-label="' + escapeHtml(t("admin.hotspot") + " " + id) + '" style="min-height:44px;min-width:44px">' +
            '<option value="">' + escapeHtml(t("admin.hotspotNone")) + "</option>" +
            opts +
          "</select>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
  container.innerHTML =
    '<p class="demo-note">' + escapeHtml(t("admin.showroomMock")) + "</p>" +
    '<table class="admin-table"><thead><tr><th>' + escapeHtml(t("admin.hotspot")) + '</th><th>' + escapeHtml(t("admin.hotspot")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>";

  container.querySelectorAll("[data-hotspot]").forEach((sel) => {
    const id = sel.getAttribute("data-hotspot");
    const current = map[id] || (base && base[id] && base[id].product) || "";
    if (current) sel.value = current;
    sel.addEventListener("change", () => {
      const m = loadHotspotMap(state.catalog);
      if (HOTSPOT_IDS.includes(id) && state.catalog.some(p => p.slug === sel.value)) m[id] = sel.value;
      else delete m[id];
      saveHotspotMap(m);
    });
  });
}

function renderMock(container, key) {
  container.innerHTML = '<p class="demo-note">' + escapeHtml(t(key)) + "</p>";
}

export async function init() {
  const nav = document.getElementById("admin-nav");
  const content = document.getElementById("admin-content");
  if (!nav || !content) return;

  const base = await loadProducts();
  const state = { catalog: base, products: loadAdminProducts(base), hotspots: await loadHotspots(), section: "products" };

  nav.innerHTML = SECTIONS.map((s) =>
    '<li><button type="button" data-section="' + s + '" aria-current="' + (s === state.section ? "true" : "false") + '">' + escapeHtml(t("admin." + s)) + "</button></li>"
  ).join("");

  function render() {
    nav.querySelectorAll("[data-section]").forEach((b) => {
      b.setAttribute("aria-current", b.getAttribute("data-section") === state.section ? "true" : "false");
    });
    if (state.section === "products") renderProducts(content, state);
    else if (state.section === "showroom") renderShowroom(content, state);
    else if (state.section === "orders") renderMock(content, "admin.ordersMock");
    else if (state.section === "customization") renderMock(content, "admin.customizationMock");
    else if (state.section === "delivery") renderMock(content, "admin.deliveryMock");
    else if (state.section === "content") renderMock(content, "admin.contentMock");
  }

  nav.querySelectorAll("[data-section]").forEach((b) => {
    b.addEventListener("click", () => {
      state.section = b.getAttribute("data-section");
      render();
    });
  });

  onChange(() => {
    nav.querySelectorAll("[data-section]").forEach((b) => {
      b.textContent = t("admin." + b.getAttribute("data-section"));
    });
    render();
  });

  render();
}
