// Light entry point: no three.js here. The 3D engine loads only when a visitor opens the viewer.
const MODELS_URL = "data/models3d.json";
let modelsPromise = null;

function isSafeModelPath(p) {
  return typeof p === "string" &&
    p.startsWith("assets/products/3d/") &&
    p.endsWith(".glb") &&
    !p.includes("..") &&
    !p.includes("\\");
}

function isSafeTonePath(p) {
  return typeof p === "string" &&
    p.startsWith("assets/products/3d/") &&
    (p.endsWith(".jpg") || p.endsWith(".webp")) &&
    !p.includes("..") &&
    !p.includes("\\");
}

const TONE_KEYS = ["fair", "light", "medium", "tan", "deep"];

function sanitizeTones(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let any = false;
  for (const key of TONE_KEYS) {
    if (isSafeTonePath(raw[key])) {
      out[key] = raw[key];
      any = true;
    }
  }
  return any ? out : null;
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!isSafeModelPath(raw.model1k)) return null;
  const entry = {
    model1k: raw.model1k,
    model2k: isSafeModelPath(raw.model2k) ? raw.model2k : null,
    poster: typeof raw.poster === "string" && raw.poster.startsWith("assets/") ? raw.poster : null,
    mannequin: raw.mannequin === true,
    mannequinType: raw.mannequinType === "full" ? "full" : "bust",
    demo: raw.demo === true
  };
  const tones = sanitizeTones(raw.tones);
  if (tones) entry.tones = tones;
  return entry;
}

export function getModel3d(productId) {
  if (!modelsPromise) {
    modelsPromise = fetch(MODELS_URL, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return modelsPromise.then((json) => {
    if (!json || typeof json !== "object") return null;
    return sanitizeEntry(json[String(productId)]);
  });
}

export async function mountViewer(container, entry, opts = {}) {
  const core = await import("./viewer3d-core.js?v=20261113v");
  return core.mountViewer(container, entry, opts);
}
