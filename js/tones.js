import { t } from "./i18n.js?v=20261113v";

export const TONE_ORDER = ["fair", "light", "medium", "tan", "deep"];

export const TONE_HEX = {
  fair: "#FAD1BC",
  light: "#F0B999",
  medium: "#D59466",
  tan: "#B66C47",
  deep: "#683C2C"
};

export const toneIcon = (tone) => "assets/brand/tones/" + tone + ".png";

const STORAGE_KEY = "azho.tone";
const DEFAULT_TONE = "medium";

function isKnownTone(tone) {
  return typeof tone === "string" && TONE_ORDER.includes(tone);
}

function readStoredTone() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isKnownTone(v)) return v;
  } catch (_) {}
  return null;
}

let currentTone = readStoredTone() || DEFAULT_TONE;

export function getTone() {
  return currentTone;
}

export function setTone(tone, source) {
  if (!isKnownTone(tone)) return;
  if (tone === currentTone) return;
  currentTone = tone;
  try { localStorage.setItem(STORAGE_KEY, tone); } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent("azho:tone", { detail: { tone, source } }));
  } catch (_) {}
}

export function buildToneSelector({ tones, labelKey, onSelect }) {
  const available = TONE_ORDER.filter((tone) => Array.isArray(tones) && tones.includes(tone));

  const root = document.createElement("div");
  root.className = "tone-selector";
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-label", t(labelKey));

  const buttons = new Map();

  available.forEach((tone) => {
    const name = t("tone." + tone);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tone-option";
    btn.setAttribute("role", "radio");
    btn.setAttribute("data-tone", tone);
    btn.setAttribute("aria-checked", "false");
    btn.setAttribute("tabindex", "-1");
    btn.setAttribute("title", name);

    const img = document.createElement("img");
    img.src = toneIcon(tone);
    img.alt = "";
    img.width = 40;
    img.height = 40;
    img.decoding = "async";
    btn.appendChild(img);

    const label = document.createElement("span");
    label.className = "vh";
    label.textContent = name;
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      if (typeof onSelect === "function") onSelect(tone);
    });

    buttons.set(tone, btn);
    root.appendChild(btn);
  });

  function focusButton(tone) {
    const btn = buttons.get(tone);
    if (btn) btn.focus();
  }

  function move(delta) {
    const checked = available.find((tone) => buttons.get(tone)?.getAttribute("aria-checked") === "true") || available[0];
    const idx = available.indexOf(checked);
    if (idx < 0) return;
    const next = available[(idx + delta + available.length) % available.length];
    focusButton(next);
    // Radio-group pattern: arrows move focus AND select.
    if (typeof onSelect === "function") onSelect(next);
  }

  root.addEventListener("keydown", (e) => {
    if (!available.length) return;
    const rtl = document.documentElement.dir === "rtl";
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        move(rtl ? -1 : 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(rtl ? 1 : -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        focusButton(available[0]);
        if (typeof onSelect === "function") onSelect(available[0]);
        break;
      case "End":
        e.preventDefault();
        focusButton(available[available.length - 1]);
        if (typeof onSelect === "function") onSelect(available[available.length - 1]);
        break;
      case "Enter":
      case " ":
      case "Spacebar": {
        const target = e.target && e.target.closest && e.target.closest(".tone-option");
        if (!target) return;
        const tone = target.getAttribute("data-tone");
        if (!tone) return;
        e.preventDefault();
        if (typeof onSelect === "function") onSelect(tone);
        break;
      }
      default:
        break;
    }
  });

  function setChecked(tone) {
    buttons.forEach((btn, key) => {
      const checked = key === tone;
      btn.setAttribute("aria-checked", checked ? "true" : "false");
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    });
  }

  return { root, setChecked };
}
