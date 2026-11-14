const {gsap, ScrollTrigger} = window; // loaded by <script defer> tags in index.html

gsap.registerPlugin(ScrollTrigger);

const HEADER = 65;
const HINT_KEY = 'azho.tourHint';
const SETTLE_EPS = 0.12;
const NAME_VISIBLE_MS = 1600;
const SCROLLED_THRESHOLD = 40;

function readHintSeen() {
  try {
    return sessionStorage.getItem(HINT_KEY) === 'seen';
  } catch (e) {
    return false;
  }
}

function writeHintSeen() {
  try {
    sessionStorage.setItem(HINT_KEY, 'seen');
  } catch (e) {
    /* ignore */
  }
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function isDialogOpen() {
  return !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
}

function debounce(fn, ms) {
  let id = 0;
  return function debounced() {
    clearTimeout(id);
    id = setTimeout(fn, ms);
  };
}

export function createTour({ section, stage, stops, getLabel, t, rtl, reduced, onProgress, onSettle }) {
  const len = stops.length;
  const lastIndex = Math.max(0, len - 1);

  let currentIndex = 0;
  let settledIndex = -1;
  let nameTimer = 0;
  let destroyed = false;
  let hintSeen = readHintSeen();
  let scrolledOnce = false;

  // --- layout ---
  const prevHeight = section.style.height;
  const prevPosition = section.style.position;
  const prevTop = section.style.top;
  const prevHeightCss = section.style.height;

  section.style.height = `${len * 100}svh`;
  if (!CSS.supports('height', '100svh')) {
    section.style.height = `${len * 100}vh`;
  }

  stage.classList.add('tour-stage');

  // --- hint UI ---
  const hint = document.createElement('div');
  hint.className = 'tour-hint';
  hint.setAttribute('aria-hidden', 'false');

  const hintLabel = document.createElement('span');
  hintLabel.className = 'tour-hint-label';
  hintLabel.textContent = t('tour.hint');

  const hintLine = document.createElement('span');
  hintLine.className = 'tour-hint-line';
  const hintDot = document.createElement('i');
  hintLine.appendChild(hintDot);

  const dotsNav = document.createElement('nav');
  dotsNav.className = 'tour-dots';
  dotsNav.setAttribute('aria-label', t('tour.nav'));

  const dotButtons = [];
  for (let i = 0; i < len; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tour-dot';
    btn.setAttribute('aria-label', `${i + 1} — ${getLabel(i)}`);
    btn.addEventListener('click', () => scrollToStop(i));
    dotsNav.appendChild(btn);
    dotButtons.push(btn);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'tour-name';
  nameEl.setAttribute('aria-live', 'polite');

  hint.appendChild(hintLabel);
  hint.appendChild(hintLine);
  hint.appendChild(dotsNav);
  hint.appendChild(nameEl);
  stage.appendChild(hint);

  if (hintSeen) hint.classList.add('is-scrolled');

  function setActiveDot(i) {
    for (let k = 0; k < dotButtons.length; k++) {
      const btn = dotButtons[k];
      if (k === i) {
        btn.setAttribute('aria-current', 'step');
      } else {
        btn.removeAttribute('aria-current');
      }
    }
  }

  function showName(i) {
    clearTimeout(nameTimer);
    nameEl.textContent = getLabel(i);
    nameEl.classList.add('is-visible');
    nameTimer = setTimeout(() => {
      nameEl.classList.remove('is-visible');
    }, NAME_VISIBLE_MS);
  }

  function markScrolled() {
    if (scrolledOnce) return;
    scrolledOnce = true;
    hint.classList.add('is-scrolled');
    if (!hintSeen) {
      hintSeen = true;
      writeHintSeen();
    }
  }

  setActiveDot(0);

  // --- scroll trigger ---
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: `top top+=${HEADER}`,
    end: 'bottom bottom',
    scrub: reduced ? false : 0.8,
    snap: {
      snapTo: 1 / lastIndex,
      duration: { min: 0.5, max: 1 },
      ease: 'power2.inOut',
      delay: 0.15,
    },
    onUpdate: (self) => {
      const s = self.progress * lastIndex;
      const rounded = Math.round(s);

      if (typeof onProgress === 'function') {
        onProgress(reduced ? rounded : s);
      }

      if (Math.abs(s - rounded) < SETTLE_EPS) {
        if (rounded !== settledIndex) {
          settledIndex = rounded;
          currentIndex = rounded;
          setActiveDot(rounded);
          showName(rounded);
          if (typeof onSettle === 'function') onSettle(rounded);
        }
      }
    },
  });

  // --- scroll to stop ---
  function scrollToStop(index, opts) {
    const instant = opts && opts.instant;
    const clamped = Math.max(0, Math.min(lastIndex, index));
    const rect = section.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const trackHeight = section.offsetHeight - (window.innerHeight - HEADER);
    const ratio = lastIndex === 0 ? 0 : clamped / lastIndex;
    const targetY = sectionTop - HEADER + ratio * trackHeight;

    window.scrollTo({
      top: targetY,
      behavior: instant || reduced ? 'auto' : 'smooth',
    });
  }

  // --- keyboard ---
  function isSectionOnScreen() {
    const rect = section.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function onKeyDown(e) {
    if (destroyed) return;
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditable(document.activeElement)) return;
    if (isDialogOpen()) return;
    if (!isSectionOnScreen()) return;

    const key = e.key;
    let handled = true;
    let target = null;

    switch (key) {
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
      case 'Spacebar':
        target = currentIndex + 1;
        break;
      case 'ArrowUp':
      case 'PageUp':
        target = currentIndex - 1;
        break;
      case 'ArrowRight':
        target = rtl ? currentIndex - 1 : currentIndex + 1;
        break;
      case 'ArrowLeft':
        target = rtl ? currentIndex + 1 : currentIndex - 1;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = lastIndex;
        break;
      default:
        handled = false;
    }

    if (!handled) return;

    e.preventDefault();
    const clamped = Math.max(0, Math.min(lastIndex, target));
    scrollToStop(clamped);
  }

  document.addEventListener('keydown', onKeyDown);

  // --- scroll hint dismissal ---
  function onScroll() {
    if (scrolledOnce) return;
    if (window.scrollY > SCROLLED_THRESHOLD) markScrolled();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- resize ---
  const onResize = debounce(() => {
    if (!destroyed) ScrollTrigger.refresh();
  }, 150);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // --- public API ---
  function refresh() {
    ScrollTrigger.refresh();
  }

  function index() {
    return currentIndex;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    trigger.kill();
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    clearTimeout(nameTimer);

    if (hint.parentNode) hint.parentNode.removeChild(hint);
    stage.classList.remove('tour-stage');

    section.style.height = prevHeightCss;
    section.style.position = prevPosition;
    section.style.top = prevTop;
    if (prevHeight) section.style.height = prevHeight;
  }

  return { scrollToStop, refresh, destroy, index };
}
