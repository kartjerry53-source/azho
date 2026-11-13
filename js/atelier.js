import { t, formatPrice, escapeHtml, localized, onChange } from "./i18n.js?v=20261113q";
import { loadProducts, safeStorageGet, safeStorageSet, safeImageUrl, productSizes, isPublished } from "./store.js?v=20261113q";
import { addLine } from "./cart.js?v=20261113q";

const CONFIG_KEY = "azho.configuration";
const EMBROIDERY_FEE = 300;
const LETTERS_RE = /^[\p{L}]{0,3}$/u;
const SWATCH = { noir: "#292520", rose: "#d7a6ac", rouge: "#9b2532" };

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

function loadConfig() {
  const c = safeStorageGet(CONFIG_KEY, null);
  if (!c || typeof c !== "object") return { colour: "", size: "", initials: "" };
  return {
    colour: typeof c.colour === "string" ? c.colour : "",
    size: typeof c.size === "string" ? c.size : "",
    initials: typeof c.initials === "string" ? c.initials.slice(0, 3) : ""
  };
}

function saveConfig(c) {
  safeStorageSet(CONFIG_KEY, { colour: c.colour, size: c.size, initials: c.initials });
}

export async function init() {
  const grid = document.getElementById("atelier-grid");
  if (!grid) return;

  const products = await loadProducts();
  const product = products.find((p) => p.slug === "ensemble-rouge" && isPublished(p));
  if (!product) {
    grid.innerHTML = '<p class="empty">' + escapeHtml(t("product.notFound")) + "</p>";
    return;
  }

  const colours = product.colours || [];
  const sizes = productSizes(product);
  const state = loadConfig();
  if (!colours.includes(state.colour)) state.colour = colours[0] || "";
  if (!sizes.includes(state.size)) state.size = "";
  if (!LETTERS_RE.test(state.initials)) state.initials = "";

  const img = safeImageUrl(product.images && product.images[0]);

  function render() {
    const swatchStyle = state.colour && SWATCH[state.colour] ? ' style="--swatch-color:' + SWATCH[state.colour] + '"' : "";
    grid.innerHTML =
      '<div class="atelier-media">' +
        (img ? '<img width="800" height="1000" src="' + escapeHtml(img) + '" alt="' + escapeHtml(localized(product.name)) + '">' : "") +
        (state.colour
          ? '<span class="atelier-chip"' + swatchStyle + '>' + escapeHtml(t("colour." + state.colour)) + "</span>"
          : "") +
        '<div class="atelier-swatches" role="group" aria-label="' + escapeHtml(t("atelier.colour")) + '">' +
          colours.map((c) =>
            '<button type="button" class="swatch" data-colour="' + escapeHtml(c) + '" aria-pressed="' + (c === state.colour ? "true" : "false") + '" aria-label="' + escapeHtml(t("colour." + c)) + '"' +
              (SWATCH[c] ? ' style="--swatch-color:' + SWATCH[c] + '"' : "") + ">" +
              '<span class="swatch-label">' + escapeHtml(t("colour." + c)) + "</span>" +
            "</button>"
          ).join("") +
        "</div>" +
      "</div>" +
      '<form class="atelier-form" id="atelier-form" novalidate>' +
        "<h2>" + escapeHtml(localized(product.name)) + "</h2>" +
        '<div class="option-group" role="group" aria-label="' + escapeHtml(t("product.size")) + '"><span>' + escapeHtml(t("product.size")) + '</span><div class="option-row" data-sizes>' +
          sizes.map((s) => '<button type="button" class="option-chip" data-size="' + escapeHtml(s) + '" aria-pressed="' + (s === state.size ? "true" : "false") + '">' + escapeHtml(t("size." + s)) + "</button>").join("") +
        "</div></div>" +
        '<label class="option-group"><span>' + escapeHtml(t("atelier.embroidery")) + " (" + escapeHtml(t("common.optional")) + ")</span>" +
          '<input type="text" name="initials" maxlength="3" value="' + escapeHtml(state.initials) + '" aria-describedby="atelier-hint atelier-err" autocomplete="off">' +
          '<span class="demo-note" id="atelier-hint">' + escapeHtml(t("atelier.embroideryHint")) + "</span>" +
          '<span class="field-error" id="atelier-err" aria-live="polite"></span>' +
        "</label>" +
        '<div class="atelier-summary" aria-live="polite">' +
          "<h2>" + escapeHtml(t("atelier.summary")) + "</h2>" +
          "<dl>" +
            "<dt>" + escapeHtml(t("atelier.base")) + "</dt><dd data-sum-base></dd>" +
            "<dt>" + escapeHtml(t("atelier.embroideryFee")) + "</dt><dd data-sum-fee></dd>" +
            "<dt>" + escapeHtml(t("atelier.total")) + "</dt><dd data-sum-total></dd>" +
            "<dt>" + escapeHtml(t("atelier.colour")) + "</dt><dd data-sum-colour></dd>" +
            "<dt>" + escapeHtml(t("product.size")) + "</dt><dd data-sum-size></dd>" +
            "<dt>" + escapeHtml(t("atelier.letters")) + "</dt><dd data-sum-initials></dd>" +
          "</dl>" +
        "</div>" +
        '<button type="button" class="btn btn-ghost" data-save>' + escapeHtml(t("admin.save")) + "</button>" +
        '<button type="submit" class="btn btn-primary">' + escapeHtml(t("atelier.add")) + "</button>" +
        '<p class="field-error" role="status" aria-live="polite" data-saved></p>' +
        '<p class="demo-note">' + escapeHtml(t("atelier.embroidery")) + " — " + escapeHtml(t("product.demoNote")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("product.sizeDemo")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("atelier.imageNote")) + "</p>" +
      "</form>";

    grid.querySelectorAll("img").forEach(imgFallback);

    const form = grid.querySelector("#atelier-form");
    const initialsInput = form.querySelector('[name="initials"]');
    const errEl = form.querySelector("#atelier-err");
    const savedEl = form.querySelector("[data-saved]");
    const sumBase = form.querySelector("[data-sum-base]");
    const sumFee = form.querySelector("[data-sum-fee]");
    const sumTotal = form.querySelector("[data-sum-total]");
    const sumColour = form.querySelector("[data-sum-colour]");
    const sumSize = form.querySelector("[data-sum-size]");
    const sumInitials = form.querySelector("[data-sum-initials]");

    function updateSummary() {
      const fee = state.initials ? EMBROIDERY_FEE : 0;
      sumBase.textContent = formatPrice(3500);
      sumFee.textContent = fee ? formatPrice(fee) : "—";
      sumTotal.textContent = formatPrice(3500 + fee);
      sumColour.textContent = state.colour ? t("colour." + state.colour) : "—";
      sumSize.textContent = state.size || "—";
      sumInitials.textContent = state.initials || t("atelier.none");
    }

    grid.querySelectorAll("[data-colour]").forEach((b) => {
      b.addEventListener("click", () => {
        state.colour = b.getAttribute("data-colour");
        render();
        grid.querySelector(`[data-colour="${state.colour}"]`)?.focus();
      });
    });
    grid.querySelectorAll("[data-size]").forEach((b) => {
      b.addEventListener("click", () => {
        state.size = b.getAttribute("data-size");
        render();
        grid.querySelector(`[data-size="${state.size}"]`)?.focus();
      });
    });

    initialsInput.addEventListener("input", () => {
      const v = initialsInput.value;
      if (!LETTERS_RE.test(v)) {
        errEl.textContent = t("atelier.embroideryTooLong");
        initialsInput.setAttribute("aria-invalid", "true");
        // Retain invalid input so validation can explain it before saving.
      } else {
        errEl.textContent = "";
        initialsInput.removeAttribute("aria-invalid");
      }
      state.initials = initialsInput.value;
      updateSummary();
    });

    const saveBtn = form.querySelector("[data-save]");
    saveBtn.addEventListener("click", () => {
      if (!state.size) {
        savedEl.textContent = t("product.sizeRequired");
        grid.querySelector("[data-size]")?.focus();
        return;
      }
      if (!LETTERS_RE.test(state.initials)) {
        errEl.textContent = t("atelier.embroideryTooLong");
        initialsInput.setAttribute("aria-invalid", "true");
        initialsInput.focus();
        return;
      }
      saveConfig(state);
      savedEl.textContent = t("atelier.saved");
      setTimeout(() => { if (savedEl.isConnected) savedEl.textContent = ""; }, 2000);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!LETTERS_RE.test(state.initials)) {
        errEl.textContent = t("atelier.embroideryTooLong");
        initialsInput.setAttribute("aria-invalid", "true");
        initialsInput.focus();
        return;
      }
      if (!state.size) {
        savedEl.textContent = t("product.sizeRequired");
        const f = grid.querySelector("[data-size]");
        if (f) f.focus();
        return;
      }
      addLine({
        slug: product.slug,
        qty: 1,
        colour: state.colour,
        size: state.size,
        config: state.initials || ""
      });
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.textContent = t("product.added");
        setTimeout(() => { if (btn.isConnected) btn.textContent = t("atelier.add"); }, 1500);
      }
    });

    updateSummary();
  }

  render();
  onChange(render);
}
