import { getCart, cartCount, onCartChange } from "./cart.js?v=20261113v";
import { openCart } from "./overlay.js?v=20261113v";
import { t, onChange, localized } from "./i18n.js?v=20261113v";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js?v=20261113v";

// Blender (x,y,z) -> three (x, z, -y)
const PLACEMENT = {
  robot: [-3.30, 1.08, -8.13],
  parcel: [-3.30, 1.08, -7.65]
};
const H = 0.10;
const L1 = 0.26, L2 = 0.23, GRIP = 0.10;
const LID_OPEN = -1.9;
const FOLDED = { shoulder: -0.15, elbow: 2.3, wrist: 0.6 };
const FINGER_REST = 0.022, FINGER_OPEN = 0.05;
const AMBER = 0xe39a3b, GREEN = 0x3fbf6b;

// Elbow-up 2-link IK. forward = metres toward parcel (+Z), height = metres
// relative to the shoulder pivot. Returns shoulder/elbow/wrist pitches.
function ik(forward, height) {
  const dx = forward, dy = height;
  let d = Math.hypot(dx, dy);
  const reach = L1 + L2;
  if (d > reach - 1e-4) d = reach - 1e-4;
  if (d < Math.abs(L1 - L2) + 1e-4) d = Math.abs(L1 - L2) + 1e-4;
  // Angle of the target from straight-up (+Y), positive toward +Z.
  const base = Math.atan2(dx, dy);
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const shoulder = base - a; // elbow-up
  const cosB = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const elbow = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosB)));
  const wrist = Math.PI - shoulder - elbow;
  return { shoulder, elbow, wrist };
}

export async function createRobot({ THREE, GLTFLoader, scene, camera, renderer, requestRender, stage, reduced }) {
  const gsap = window.gsap;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("assets/models/robot.glb");
  const robotRoot = gltf.scene.getObjectByName("AZHO_Robot");
  const parcelRoot = gltf.scene.getObjectByName("AZHO_Parcel");
  if (!robotRoot || !parcelRoot) throw new Error("robot.glb: missing AZHO_Robot/AZHO_Parcel");

  const nodes = {};
  for (const name of ["Base", "StatusLight", "J_Turret", "J_Shoulder", "J_Elbow", "J_Wrist", "J_FingerL", "J_FingerR", "P_Grip", "J_Lid", "ParcelBox", "Tissue", "ParcelBand"]) {
    nodes[name] = robotRoot.getObjectByName(name) || parcelRoot.getObjectByName(name) || null;
  }

  // Detach parcel from the robot hierarchy so it can be placed independently.
  if (parcelRoot.parent) parcelRoot.parent.remove(parcelRoot);
  robotRoot.position.fromArray(PLACEMENT.robot);
  robotRoot.rotation.set(0, 0, 0);
  parcelRoot.position.fromArray(PLACEMENT.parcel);
  parcelRoot.rotation.set(0, 0, 0);
  scene.add(robotRoot);
  scene.add(parcelRoot);

  // Lighting group: only affects MeshStandardMaterial (robot/parcel).
  const lightGroup = new THREE.Group();
  const dir = new THREE.DirectionalLight(0xfff2e0, 1.1);
  dir.position.set(1.2, 2.4, 1.6);
  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  lightGroup.add(dir, amb);
  scene.add(lightGroup);

  // PMREM env for standard materials only (do NOT set scene.environment).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  const envTex = envRT.texture;
  pmrem.dispose();

  const standardMats = [];
  const allMats = new Set();
  const allGeoms = new Set();
  const allTextures = new Set();
  const collect = (root) => root.traverse((o) => {
    if (!o.isMesh) return;
    allGeoms.add(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      allMats.add(m);
      if (m.map) allTextures.add(m.map);
      if (m.emissiveMap) allTextures.add(m.emissiveMap);
      if (m.isMeshStandardMaterial) {
        m.envMap = envTex;
        m.envMapIntensity = 0.9;
        m.needsUpdate = true;
        standardMats.push(m);
      }
    }
  });
  collect(robotRoot);
  collect(parcelRoot);

  // Parcel materials for opacity fade.
  const parcelMats = new Set();
  parcelRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) parcelMats.add(m);
  });
  const parcelBaseOpacity = new Map();
  parcelMats.forEach((m) => parcelBaseOpacity.set(m, m.opacity ?? 1));

  // Shoulder pivot height in world space at load.
  robotRoot.updateMatrixWorld(true);
  const shoulderWorld = new THREE.Vector3();
  nodes.J_Shoulder.getWorldPosition(shoulderWorld);
  const shoulderY = shoulderWorld.y;
  const parcelTopY = PLACEMENT.parcel[1] + H;

  // Pose helpers -----------------------------------------------------------
  function applyPose(p) {
    nodes.J_Shoulder.rotation.x = p.shoulder;
    nodes.J_Elbow.rotation.x = p.elbow;
    nodes.J_Wrist.rotation.x = p.wrist;
  }
  function setFingers(open) {
    const x = open ? FINGER_OPEN : FINGER_REST;
    nodes.J_FingerL.position.x = -x;
    nodes.J_FingerR.position.x = x;
  }
  function setLid(angle) {
    if (nodes.J_Lid) nodes.J_Lid.rotation.x = angle;
  }
  function setLight(color) {
    const m = nodes.StatusLight?.material;
    if (!m) return;
    if (m.emissive) m.emissive.setHex(color);
    if (m.color) m.color.setHex(color);
  }

  // Named poses. Wrist target heights are relative to the shoulder pivot.
  // READY: box bottom clears counter by 8 cm -> box top at counter+8cm+H.
  const READY = ik(0.16, (parcelTopY + 0.08) - shoulderY);
  // OVER: box bottom 6 cm above counter.
  const OVER = ik(0.48, (parcelTopY + 0.06) - shoulderY);
  // PLACE: box resting on counter.
  const PLACE = ik(0.48, parcelTopY - shoulderY);
  // LIFT: OVER + 10 cm.
  const LIFT = ik(0.48, (parcelTopY + 0.16) - shoulderY);
  // PRESS_LID: gripper at lid front edge height + 2 cm.
  const PRESS_LID = ik(0.40, (parcelTopY + 0.02) - shoulderY);

  // Carry: parcel follows P_Grip.
  const gripWorld = new THREE.Vector3();
  function syncCarry() {
    if (!carrying) return;
    robotRoot.updateMatrixWorld(true);
    nodes.P_Grip.getWorldPosition(gripWorld);
    parcelRoot.position.set(gripWorld.x, gripWorld.y - H, gripWorld.z);
    parcelRoot.rotation.set(0, 0, 0);
  }
  function resetParcel() {
    parcelRoot.position.fromArray(PLACEMENT.parcel);
    parcelRoot.rotation.set(0, 0, 0);
    parcelRoot.scale.set(1, 1, 1);
  }

  // State ------------------------------------------------------------------
  let carrying = false;
  let state = "EMPTY";
  let timeline = null;
  let tweening = false;
  let disposed = false;
  let lastCount = cartCount();

  // Card -------------------------------------------------------------------
  const card = document.createElement("aside");
  card.className = "robot-card";
  card.setAttribute("aria-live", "polite");
  const title = document.createElement("p");
  title.className = "robot-card-title";
  const lines = document.createElement("ul");
  lines.className = "robot-card-lines";
  const more = document.createElement("p");
  more.className = "robot-card-more";
  const review = document.createElement("button");
  review.type = "button";
  review.className = "btn btn-primary robot-review";
  review.addEventListener("click", () => openCart());
  card.append(title, lines, more, review);
  stage.appendChild(card);

  function renderCard() {
    title.textContent = t("robot.title");
    review.textContent = t("robot.review");
    while (lines.firstChild) lines.removeChild(lines.firstChild);
    const cart = getCart();
    const shown = cart.slice(0, 3);
    for (const line of shown) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "robot-card-name";
      name.textContent = localized(line.name);
      const qty = document.createElement("span");
      qty.className = "robot-card-qty";
      qty.textContent = t("robot.qty", { n: line.qty });
      li.append(name, qty);
      const meta = [];
      if (line.colour) meta.push(t("colour." + line.colour));
      if (line.size) meta.push(line.size);
      if (meta.length) {
        const sub = document.createElement("span");
        sub.className = "robot-card-meta";
        sub.textContent = meta.join(" · ");
        li.append(sub);
      }
      lines.appendChild(li);
    }
    const extra = cart.length - shown.length;
    more.textContent = extra > 0 ? t("robot.more", { n: extra }) : "";
    more.hidden = extra <= 0;
  }

  const projected = new THREE.Vector3();
  const parcelTop = new THREE.Vector3();
  function positionCard() {
    if (state !== "PACKED" || tweening) { card.classList.remove("is-visible"); return; }
    // Hang the card on the plain front of the counter, just under the parcel (keeps the wall logo clear).
    parcelTop.set(PLACEMENT.parcel[0] + 0.42, PLACEMENT.parcel[1] - 0.03, PLACEMENT.parcel[2]);
    const dist = camera.position.distanceTo(parcelTop);
    if (dist > 5.0) { card.classList.remove("is-visible"); return; }
    projected.copy(parcelTop).project(camera);
    if (projected.z < -1 || projected.z > 1) { card.classList.remove("is-visible"); return; }
    const r = stage.getBoundingClientRect();
    const x = (projected.x + 1) / 2 * r.width;
    const y = (1 - projected.y) / 2 * r.height;
    if (x < 16 || x > r.width - 16 || y < 16 || y > r.height - 120) { card.classList.remove("is-visible"); return; }
    card.style.transform = `translate(${x}px, ${y}px) translate(-50%, 6px)`;
    card.classList.add("is-visible");
  }

  // Animation helpers ------------------------------------------------------
  function killTimeline() {
    if (timeline) { timeline.kill(); timeline = null; }
    tweening = false;
  }
  function poseTween(from, to, duration, ease, onDone) {
    const proxy = { ...from };
    return gsap.to(proxy, {
      ...to, duration, ease,
      onUpdate: () => { applyPose(proxy); syncCarry(); requestRender(); },
      onComplete: onDone
    });
  }
  function fadeParcel(from, to, duration, onDone) {
    parcelMats.forEach((m) => { m.transparent = true; m.opacity = from; });
    const proxy = { o: from };
    return gsap.to(proxy, {
      o: to, duration, ease: "none",
      onUpdate: () => { parcelMats.forEach((m) => { m.opacity = proxy.o; }); requestRender(); },
      onComplete: () => {
        parcelMats.forEach((m) => { m.transparent = false; m.opacity = parcelBaseOpacity.get(m); });
        onDone?.();
      }
    });
  }

  function jumpToPacked() {
    killTimeline();
    state = "PACKED";
    carrying = false;
    applyPose(FOLDED);
    setFingers(false);
    resetParcel();
    parcelRoot.visible = true;
    parcelMats.forEach((m) => { m.transparent = false; m.opacity = parcelBaseOpacity.get(m); });
    setLid(0);
    setLight(GREEN);
    renderCard();
    requestRender();
  }
  function jumpToEmpty() {
    killTimeline();
    state = "EMPTY";
    carrying = false;
    applyPose(FOLDED);
    setFingers(false);
    resetParcel();
    parcelRoot.visible = false;
    setLid(LID_OPEN);
    setLight(AMBER);
    card.classList.remove("is-visible");
    requestRender();
  }

  function runPacking() {
    killTimeline();
    state = "PACKING";
    tweening = true;
    card.classList.remove("is-visible");
    card.setAttribute("aria-live", "polite");
    // Announce via aria-live: replace text content of title temporarily.
    title.textContent = t("robot.packing");
    setLight(AMBER);
    setLid(LID_OPEN);
    setFingers(true);
    resetParcel();
    parcelRoot.visible = true;
    parcelMats.forEach((m) => { m.transparent = true; m.opacity = 0; });

    const tl = gsap.timeline({
      onComplete: () => {
        tweening = false;
        state = "PACKED";
        setLight(GREEN);
        renderCard();
        title.textContent = t("robot.ready");
        requestRender();
      }
    });
    timeline = tl;

    // (1) FOLDED -> READY, parcel appears, fingers close.
    tl.add(poseTween(FOLDED, READY, 0.5, "power2.inOut"));
    tl.add(fadeParcel(0, 1, 0.5), 0);
    tl.call(() => { carrying = true; syncCarry(); requestRender(); }, null, 0.5);
    tl.call(() => { setFingers(false); requestRender(); }, null, 0.5);

    // (2) READY -> OVER -> PLACE.
    tl.add(poseTween(READY, OVER, 0.45, "power2.inOut"), 0.5);
    tl.add(poseTween(OVER, PLACE, 0.45, "power2.inOut"), 0.95);

    // (3) Release.
    tl.call(() => {
      setFingers(true);
      carrying = false;
      resetParcel();
      requestRender();
    }, null, 1.4);

    // (4) PLACE -> LIFT.
    tl.add(poseTween(PLACE, LIFT, 0.35, "power2.inOut"), 1.4);

    // (5) LIFT -> PRESS_LID while lid closes.
    tl.add(poseTween(LIFT, PRESS_LID, 0.45, "power2.inOut"), 1.75);
    const lidProxy = { a: LID_OPEN };
    tl.to(lidProxy, {
      a: 0, duration: 0.45, ease: "power2.in",
      onUpdate: () => { setLid(lidProxy.a); requestRender(); }
    }, 1.75);
    tl.to({}, { duration: 0.15 }, 2.2);

    // (6) Back to FOLDED.
    tl.add(poseTween(PRESS_LID, FOLDED, 0.6, "power2.inOut"), 2.35);
  }

  function runBounce() {
    if (reduced) { setLid(0); renderCard(); requestRender(); return; }
    killTimeline();
    tweening = true;
    const proxy = { a: 0 };
    timeline = gsap.timeline({
      onComplete: () => { tweening = false; setLid(0); renderCard(); requestRender(); }
    });
    timeline.to(proxy, {
      a: 0.15, duration: 0.15, ease: "power2.out",
      onUpdate: () => { setLid(proxy.a); requestRender(); }
    });
    timeline.to(proxy, {
      a: 0, duration: 0.15, ease: "power2.in",
      onUpdate: () => { setLid(proxy.a); requestRender(); }
    });
  }

  function runClearing() {
    killTimeline();
    state = "CLEARING";
    tweening = true;
    carrying = false;
    card.classList.remove("is-visible");
    if (reduced) { jumpToEmpty(); return; }
    const proxy = { o: 1, s: 1 };
    timeline = gsap.timeline({
      onComplete: () => {
        parcelRoot.visible = false;
        resetParcel();
        setLid(LID_OPEN);
        tweening = false;
        state = "EMPTY";
        requestRender();
      }
    });
    timeline.to(proxy, {
      o: 0, s: 0.9, duration: 0.45, ease: "power2.in",
      onUpdate: () => {
        parcelMats.forEach((m) => { m.transparent = true; m.opacity = proxy.o; });
        parcelRoot.scale.setScalar(proxy.s);
        requestRender();
      }
    });
    timeline.add(poseTween(applyPoseCurrent(), FOLDED, 0.6, "power2.inOut"), 0);
    timeline.call(() => { setLight(AMBER); requestRender(); }, null, 0);
  }
  function applyPoseCurrent() {
    return {
      shoulder: nodes.J_Shoulder.rotation.x,
      elbow: nodes.J_Elbow.rotation.x,
      wrist: nodes.J_Wrist.rotation.x
    };
  }

  // Cart sync --------------------------------------------------------------
  function syncCart() {
    if (disposed) return;
    const count = cartCount();
    if (count === 0) {
      if (state !== "EMPTY") runClearing();
      lastCount = 0;
      return;
    }
    if (lastCount === 0) {
      if (reduced) jumpToPacked();
      else runPacking();
    } else if (state === "PACKED") {
      runBounce();
    }
    lastCount = count;
  }

  const unsubCart = onCartChange(syncCart);
  const unsubI18n = onChange(() => { renderCard(); requestRender(); });

  // Initial state.
  if (cartCount() > 0) {
    jumpToPacked();
  } else {
    jumpToEmpty();
  }
  lastCount = cartCount();

  function update() {
    if (disposed) return;
    syncCarry();
    positionCard();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    killTimeline();
    unsubCart();
    unsubI18n();
    card.remove();
    scene.remove(robotRoot);
    scene.remove(parcelRoot);
    scene.remove(lightGroup);
    allGeoms.forEach((g) => g.dispose());
    allMats.forEach((m) => m.dispose());
    allTextures.forEach((tx) => tx.dispose());
    envTex.dispose();
    envRT.dispose();
  }

  return { update, dispose };
}
