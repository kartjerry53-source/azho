import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js?v=20261113v";
import { OrbitControls } from "../vendor/three/examples/jsm/controls/OrbitControls.js?v=20261113v";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js?v=20261113v";
import { t } from "./i18n.js?v=20261113v";
import { TONE_ORDER, TONE_HEX, getTone, setTone, buildToneSelector } from "./tones.js?v=20261113v";

const MODELS_URL = "data/models3d.json";
const MANNEQUIN_URL = "assets/products/3d/mannequin.glb";
const MANNEQUIN_FULL_URL = "assets/products/3d/mannequin-full.glb";
let modelsPromise = null;

function isSafeModelPath(p) {
  return typeof p === "string" &&
    p.startsWith("assets/products/3d/") &&
    p.endsWith(".glb") &&
    !p.includes("..") &&
    !p.includes("\\");
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
  if (Array.isArray(raw.colours)) {
    const cols = raw.colours
      .filter((c) => c && /^[a-z-]{2,20}$/.test(c.id) && /^#[0-9a-fA-F]{6}$/.test(c.hex))
      .slice(0, 8)
      .map((c) => ({ id: c.id, hex: c.hex }));
    if (cols.length >= 2) entry.colours = cols;
  }
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

function disposeObject(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry && typeof o.geometry.dispose === "function") o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m) continue;
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture && typeof v.dispose === "function") v.dispose();
      }
      if (typeof m.dispose === "function") m.dispose();
    }
  });
}

function collectBodyMaterials(scene) {
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    const nameHit = /body/i.test(o.name || "");
    for (const m of mats) {
      if (!m) continue;
      if (nameHit || /body/i.test(m.name || "")) out.push(m);
    }
  });
  return out;
}

function collectMaterials(root) {
  const out = [];
  if (!root) return out;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.color && !out.includes(m)) out.push(m);
  });
  return out;
}

function applyColour(materials, hex) {
  for (const m of materials) {
    if (!m.userData.azhoBase) m.userData.azhoBase = m.color.getHex();
    if (hex) m.color.set(hex); else m.color.setHex(m.userData.azhoBase);
    m.needsUpdate = true;
  }
}

function applyTone(materials, tone) {
  const hex = TONE_HEX[tone] || TONE_HEX.medium;
  for (const m of materials) {
    if (!m.color) continue;
    m.color.set(hex);
    m.needsUpdate = true;
  }
}

function frameCamera(camera, controls, box, aspect) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.5;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitH = (size.y * 0.5) / Math.tan(fov / 2);
  const fitW = (size.x * 0.5) / (Math.tan(fov / 2) * Math.max(aspect, 0.0001));
  // the front of the model sits size.z/2 closer than its centre: add it, plus an 18% margin
  const dist = Math.max(fitH, fitW) * 1.18 + size.z * 0.5;
  const dir = new THREE.Vector3(0, 0.15, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = dist * 0.3;
  controls.maxDistance = dist * 1.8;
  controls.update();
  return { dist, radius, center };
}

export function mountViewer(container, entry, opts = {}) {
  const reduced = !!opts.reduced;
  return new Promise((resolve) => {
    if (!container || !entry || !isSafeModelPath(entry.model1k)) {
      resolve({ destroy() {} });
      return;
    }

    const root = document.createElement("div");
    root.className = "viewer3d";

    const canvas = document.createElement("canvas");
    canvas.setAttribute("touch-action", "none");
    canvas.setAttribute("aria-label", t("viewer.hint"));
    root.append(canvas);

    const status = document.createElement("p");
    status.className = "viewer3d-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = t("viewer.loading");
    root.append(status);

    let toneGroup = null;
    let currentTone = getTone();
    function chooseTone(tone, fromOutside) {
      if (!TONE_HEX[tone]) return;
      currentTone = tone;
      if (!fromOutside) setTone(tone, "viewer3d");
      if (toneGroup) toneGroup.setChecked(tone);
      applyTone(bodyMaterials, tone);
      scheduleRender();
    }
    const onExternalTone = (e) => {
      const d = e.detail || {};
      if (d.source !== "viewer3d" && d.tone && d.tone !== currentTone) chooseTone(d.tone, true);
    };
    if (entry.mannequin) {
      toneGroup = buildToneSelector({ tones: TONE_ORDER, labelKey: "tone.group", onSelect: (tone) => chooseTone(tone, false) });
      toneGroup.root.classList.add("viewer3d-tones");
      toneGroup.setChecked(currentTone);
      root.append(toneGroup.root);
      window.addEventListener("azho:tone", onExternalTone);
    }

    // Garment colours: a swatch row inside the viewer (first swatch = the model's own colour).
    let currentColour = null;
    function garmentMaterials() { return [...collectMaterials(model1kScene), ...collectMaterials(model2kScene)]; }
    if (entry.colours) {
      const row = document.createElement("div");
      row.className = "viewer3d-colours";
      row.setAttribute("role", "radiogroup");
      row.setAttribute("aria-label", t("viewer.colour"));
      const btns = entry.colours.map((c, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "viewer3d-colour";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", i === 0 ? "true" : "false");
        b.tabIndex = i === 0 ? 0 : -1;
        const name = t("colour." + c.id);
        b.setAttribute("aria-label", name);
        b.title = name;
        b.style.setProperty("--swatch", c.hex);
        b.addEventListener("click", () => pick(i));
        b.addEventListener("keydown", (e) => {
          const rtl = document.documentElement.dir === "rtl";
          const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
          if (step) { e.preventDefault(); pick((i + step + btns.length) % btns.length, true); }
        });
        row.append(b);
        return b;
      });
      function pick(i, focus) {
        btns.forEach((b, k) => { b.setAttribute("aria-checked", k === i ? "true" : "false"); b.tabIndex = k === i ? 0 : -1; });
        if (focus) btns[i].focus();
        currentColour = i === 0 ? null : entry.colours[i].hex;
        applyColour(garmentMaterials(), currentColour);
        scheduleRender();
      }
      root.append(row);
    }

    if (entry.demo) {
      const note = document.createElement("p");
      note.className = "viewer3d-demo";
      note.textContent = t("viewer.demo");
      root.append(note);
    }

    container.append(root);

    let renderer = null;
    let scene = null;
    let camera = null;
    let controls = null;
    let pmrem = null;
    let envRT = null;
    let raf = 0;
    let destroyed = false;
    let visible = true;
    let needsRender = true;
    let initialDist = 0;
    let model1kScene = null;
    let model2kScene = null;
    let mannequinScene = null;
    let bodyMaterials = [];
    let model2kRequested = false;
    let resizeObs = null;
    let interObs = null;
    let loader = null;

    function scheduleRender() {
      needsRender = true;
      if (!raf && !destroyed && visible) raf = requestAnimationFrame(tick);
    }

    function tick() {
      raf = 0;
      if (destroyed) return;
      if (!container.isConnected) { destroy(); return; }
      if (!visible) return;
      // update() returns true while the camera still moves (auto-rotate or damping);
      // once settled we stop the loop and only redraw on demand.
      const moved = controls ? controls.update() : false;
      if (moved || needsRender) {
        needsRender = false;
        renderer.render(scene, camera);
      }
      if (moved || (controls && controls.autoRotate)) raf = requestAnimationFrame(tick);
      maybeUpgrade();
    }

    function maybeUpgrade() {
      if (model2kRequested || !entry.model2k || !controls || !camera) return;
      const d = camera.position.distanceTo(controls.target);
      if (initialDist > 0 && d < initialDist * 0.7) {
        model2kRequested = true;
        loader.load(entry.model2k, (gltf) => {
          if (destroyed) { disposeObject(gltf.scene); return; }
          const old = model1kScene;
          model2kScene = gltf.scene;
          scene.add(model2kScene);
          if (currentColour) applyColour(collectMaterials(model2kScene), currentColour);
          if (old) {
            scene.remove(old);
            disposeObject(old);
          }
          model1kScene = null;
          scheduleRender();
        }, undefined, () => { /* keep 1k on failure */ });
      }
    }

    function resize() {
      if (destroyed || !renderer || !camera) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scheduleRender();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      try { resizeObs && resizeObs.disconnect(); } catch (_) {}
      try { interObs && interObs.disconnect(); } catch (_) {}
      window.removeEventListener("azho:tone", onExternalTone);
      try { controls && controls.dispose(); } catch (_) {}
      if (scene) {
        scene.traverse((o) => {
          if (o.isMesh || o.isPoints || o.isLine) disposeObject(o);
        });
        if (model1kScene) disposeObject(model1kScene);
        if (model2kScene) disposeObject(model2kScene);
        if (mannequinScene) disposeObject(mannequinScene);
      }
      try { envRT && envRT.dispose(); } catch (_) {}
      try { pmrem && pmrem.dispose(); } catch (_) {}
      try {
        renderer && renderer.dispose();
        renderer && renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (_) {}
      try { root.remove(); } catch (_) {}
    }

    function fail() {
      status.textContent = t("viewer.error");
      status.classList.add("is-error");
    }

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    } catch (_) {
      fail();
      resolve({ destroy });
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.set(0, 0.1, 2);

    pmrem = new THREE.PMREMGenerator(renderer);
    try {
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
    } catch (_) {}
    pmrem.dispose();
    pmrem = null;

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 4, 3);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 1.0;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.75;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      canvas.style.cursor = "grabbing";
    });
    controls.addEventListener("end", () => {
      canvas.style.cursor = "";
      scheduleRender();
    });
    controls.addEventListener("change", scheduleRender);
    canvas.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { passive: true });

    resizeObs = new ResizeObserver(() => resize());
    resizeObs.observe(container);

    interObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (visible) scheduleRender();
      }
    }, { threshold: 0.01 });
    interObs.observe(container);

    resize();

    loader = new GLTFLoader();
    const loadOne = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

    const tasks = [loadOne(entry.model1k)];
    if (entry.mannequin) tasks.push(loadOne(entry.mannequinType === "full" ? MANNEQUIN_FULL_URL : MANNEQUIN_URL));

    Promise.all(tasks).then((results) => {
      if (destroyed) {
        for (const r of results) disposeObject(r.scene);
        return;
      }
      model1kScene = results[0].scene;
      scene.add(model1kScene);
      if (entry.mannequin && results[1]) {
        mannequinScene = results[1].scene;
        scene.add(mannequinScene);
        bodyMaterials = collectBodyMaterials(mannequinScene);
        applyTone(bodyMaterials, currentTone);
      }
      const box = new THREE.Box3();
      box.expandByObject(model1kScene);
      if (mannequinScene) box.expandByObject(mannequinScene);
      if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(1, 1.8, 1));
      const framed = frameCamera(camera, controls, box, camera.aspect);
      initialDist = framed.dist;
      status.textContent = t("viewer.hint");
      status.classList.remove("is-error");
      scheduleRender();
    }).catch(() => {
      if (!destroyed) fail();
    });

    resolve({ destroy });
  });
}
