import { t, onChange } from "./i18n.js?v=20261113v";
import { TONE_ORDER, getTone, setTone, buildToneSelector } from "./tones.js?v=20261113v";

const GSAP_SRC = "vendor/gsap.min.js?v=20261113v";
const ST_SRC = "vendor/ScrollTrigger.min.js?v=20261113v";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load " + src));
    document.head.appendChild(s);
  });
}

async function ensureGsap() {
  if (window.gsap && window.ScrollTrigger) return { gsap: window.gsap, ScrollTrigger: window.ScrollTrigger };
  if (!window.gsap) await loadScript(GSAP_SRC);
  if (!window.ScrollTrigger) await loadScript(ST_SRC);
  if (!window.gsap || !window.ScrollTrigger) throw new Error("gsap/ScrollTrigger unavailable");
  return { gsap: window.gsap, ScrollTrigger: window.ScrollTrigger };
}

function toneName(tone) {
  return t("tone." + tone);
}

export async function mountTonePreview(anchorEl, entry, { productName } = {}) {
  const noop = { destroy() {} };
  if (!anchorEl || !entry || !entry.tones || typeof entry.tones !== "object") return noop;

  const available = TONE_ORDER.filter((tone) => typeof entry.tones[tone] === "string");
  if (available.length < 2) {
    const missing = TONE_ORDER.filter((tone) => !available.includes(tone));
    console.info("[tone-preview] not enough tones; missing:", missing.join(", "));
    return noop;
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktopQuery = "(min-width: 900px) and (prefers-reduced-motion: no-preference)";

  // ---- DOM ----
  const section = document.createElement("section");
  section.className = "tone-preview";
  section.setAttribute("aria-labelledby", "tone-preview-title");

  const sticky = document.createElement("div");
  sticky.className = "tone-preview-sticky";
  section.appendChild(sticky);

  const title = document.createElement("h2");
  title.id = "tone-preview-title";
  title.textContent = t("tone.title");
  sticky.appendChild(title);

  const sub = document.createElement("p");
  sub.className = "tone-preview-sub";
  sub.textContent = t("tone.subtitle");
  sticky.appendChild(sub);

  const hint = document.createElement("p");
  hint.className = "tone-preview-hint";
  const hintKey = () => (matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)").matches ? "tone.scrollHint" : "tone.swipeHint");
  hint.textContent = t(hintKey());
  sticky.appendChild(hint);

  const stage = document.createElement("div");
  stage.className = "tone-preview-stage";
  sticky.appendChild(stage);

  const imgA = document.createElement("img");
  imgA.className = "tone-layer";
  imgA.decoding = "async";
  const imgB = document.createElement("img");
  imgB.className = "tone-layer";
  imgB.decoding = "async";
  stage.appendChild(imgA);
  stage.appendChild(imgB);

  let front = imgA;
  let back = imgB;

  const initialTone = available.includes(getTone()) ? getTone() : available[0];
  let currentTone = initialTone;

  function altFor(tone) {
    return t("tone.alt", { product: productName || "", tone: toneName(tone) });
  }

  front.src = entry.tones[initialTone];
  front.alt = altFor(initialTone);
  front.setAttribute("fetchpriority", "high");
  front.setAttribute("loading", "eager");
  front.classList.add("is-visible");

  const selector = buildToneSelector({
    tones: available,
    labelKey: "tone.group",
    onSelect: (tone) => select(tone, "manual")
  });
  sticky.appendChild(selector.root);
  selector.setChecked(initialTone);

  const status = document.createElement("p");
  status.className = "tone-preview-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = t("tone.current", { name: toneName(initialTone) });
  sticky.appendChild(status);

  let demoNote = null;
  if (entry.demo) {
    demoNote = document.createElement("p");
    demoNote.className = "demo-note";
    demoNote.textContent = t("tone.demo");
    sticky.appendChild(demoNote);
  }

  anchorEl.insertAdjacentElement("afterend", section);

  // ---- state ----
  let requestId = 0;
  let lockUntil = 0;
  let awaitingScrollEnd = false;
  let destroyed = false;
  let mm = null;
  let trigger = null;
  let scrollControlActive = false;

  function showTone(tone) {
    if (destroyed) return;
    const src = entry.tones[tone];
    if (!src) return;
    const id = ++requestId;
    const alt = altFor(tone);
    const pre = new Image();
    pre.decoding = "async";
    pre.src = src;
    const ready = pre.decode ? pre.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => {
      if (destroyed || id !== requestId) return;
      const incoming = back;
      const outgoing = front;
      incoming.src = src;
      incoming.alt = alt;
      incoming.classList.remove("is-visible");
      // Force style flush so the transition runs from opacity 0.
      void incoming.offsetWidth;
      incoming.classList.add("is-visible");
      outgoing.classList.remove("is-visible");
      front = incoming;
      back = outgoing;
    });
  }

  function select(tone, source) {
    if (destroyed) return;
    if (!available.includes(tone)) return;
    if (source === "manual") {
      lockUntil = performance.now() + 900;
      awaitingScrollEnd = true;
      if (scrollControlActive && trigger) {
        const idx = available.indexOf(tone);
        const n = available.length;
        const start = trigger.start;
        const end = trigger.end;
        const top = start + ((idx + 0.5) / n) * (end - start);
        try {
          window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
        } catch (_) {
          window.scrollTo(0, top);
        }
      }
    }
    const changed = tone !== currentTone;
    currentTone = tone;
    selector.setChecked(tone);
    status.textContent = t("tone.current", { name: toneName(tone) });
    if (changed) showTone(tone);
    setTone(tone, source);
  }

  // Swipe left/right on the image to change tone (phones); vertical scrolling stays native.
  let swipeX = 0, swipeY = 0, swiping = false;
  function onSwipeStart(e) { swiping = true; swipeX = e.clientX; swipeY = e.clientY; }
  function onSwipeEnd(e) {
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - swipeX, dy = e.clientY - swipeY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const rtl = document.documentElement.dir === "rtl";
    const step = (dx < 0) !== rtl ? 1 : -1;            // swipe left = next tone (mirrored in RTL)
    const idx = available.indexOf(currentTone) + step;
    if (idx >= 0 && idx < available.length) select(available[idx], "manual");
  }
  stage.addEventListener("pointerdown", onSwipeStart);
  stage.addEventListener("pointerup", onSwipeEnd);
  stage.addEventListener("pointercancel", () => { swiping = false; });

  function onExternalTone(e) {
    if (destroyed) return;
    const detail = e && e.detail;
    if (!detail || detail.source === "tone-preview") return;
    if (!available.includes(detail.tone)) return;
    if (detail.tone === currentTone) return;
    select(detail.tone, "external");
  }

  function onScrollEnd() {
    awaitingScrollEnd = false;
  }

  window.addEventListener("azho:tone", onExternalTone);
  const hasScrollEnd = "onscrollend" in window;
  if (hasScrollEnd) window.addEventListener("scrollend", onScrollEnd);

  // ---- scroll mode ----
  function isLocked() {
    if (performance.now() < lockUntil) return true;
    if (awaitingScrollEnd && hasScrollEnd) return true;
    return false;
  }

  try {
    const { gsap, ScrollTrigger } = await ensureGsap();
    if (destroyed) return noop;
    mm = gsap.matchMedia();
    mm.add(desktopQuery, () => {
      section.classList.add("is-scroll");
      section.style.setProperty("--steps", String(available.length));
      scrollControlActive = true;
      trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top+=72",
        end: "bottom bottom",
        onUpdate(self) {
          if (destroyed || isLocked()) return;
          const n = available.length;
          const idx = Math.min(n - 1, Math.floor(self.progress * n));
          const tone = available[idx];
          if (tone && tone !== currentTone) select(tone, "scroll");
        }
      });
      return () => {
        scrollControlActive = false;
        trigger = null;
        section.classList.remove("is-scroll");
        section.style.removeProperty("--steps");
      };
    });
  } catch (err) {
    console.warn("[tone-preview] scroll mode unavailable:", err);
  }

  // ---- i18n ----
  let unsubscribe = null;
  if (typeof onChange === "function") {
    unsubscribe = onChange(() => {
      if (destroyed) return;
      title.textContent = t("tone.title");
      sub.textContent = t("tone.subtitle");
      hint.textContent = t(hintKey());
      selector.root.setAttribute("aria-label", t("tone.group"));
      selector.root.querySelectorAll(".tone-option").forEach((btn) => {
        const tone = btn.getAttribute("data-tone");
        if (!tone) return;
        const name = toneName(tone);
        btn.setAttribute("title", name);
        const vh = btn.querySelector(".vh");
        if (vh) vh.textContent = name;
      });
      status.textContent = t("tone.current", { name: toneName(currentTone) });
      if (demoNote) demoNote.textContent = t("tone.demo");
      front.alt = altFor(currentTone);
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("azho:tone", onExternalTone);
    stage.removeEventListener("pointerdown", onSwipeStart);
    stage.removeEventListener("pointerup", onSwipeEnd);
    if (hasScrollEnd) window.removeEventListener("scrollend", onScrollEnd);
    if (typeof unsubscribe === "function") {
      try { unsubscribe(); } catch (_) {}
    }
    if (mm) {
      try { mm.revert(); } catch (_) {}
      mm = null;
    }
    trigger = null;
    if (section.parentNode) section.parentNode.removeChild(section);
  }

  return { destroy };
}
