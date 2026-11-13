# AZHO MAISON — clickable preview

From the project folder:

```sh
cd preview
python3 -m http.server 4173
```

Open <http://localhost:4173/>. No installation, build step or backend is needed. Stop the server with Control-C.

Pages: `index.html`, `shop.html`, `product.html?slug=ensemble-rouge`, `atelier.html`, and the unlinked owner mock `admin.html`.

Use `?lang=fr`, `?lang=ar` or `?lang=en`; the language also persists locally. Arabic sets the document to RTL. `?stop=A` through `?stop=E` opens the requested zone directly. Legacy `?mode=` parameters are silently ignored; no mode preference is stored. The showroom always attempts the real-time Three.js scene. Enter or skip the introduction to load the showroom. Arrow keys, number keys 1–5, swipe and the stepper navigate its zones. There is no image/list or 3D mode selector.

## Real source information

- Five product identities, French names, sale and regular prices, ten owner-supplied photos, and the three colour options on Ensemble Rouge come from `../tools/preview-dev/source-woocommerce-products.json`.
- Prices in `data/products.json` are converted from centimes to dinars by dividing by 100. No sizes were supplied.
- Contact: +213 551 21 06 96, azholingerie@gmail.com, Alger.
- The preview follows the requested delivery coverage of 58 wilayas and cash on delivery. No carrier or tariff is asserted. The 58-code selector uses the requested historical 01–58 reference; coverage should be reconfirmed before production. Reference: [ONS geographic code, 2021](https://www.ons.dz/IMG/pdf/code_geo_2021.pdf).

## Demonstration behaviour

- XS–XXL sizes, stock/status in the dashboard, initials embroidery (+300 DA), and all orders are demonstrations. Product copy adds no unverified fabric, sizing or performance claims.
- Atelier colour choices show a swatch over the original photo: the export does not establish which image corresponds to each colour. Save stores a configuration locally; adding it preserves its colour, size and initials in the cart; prices are recomputed from the catalog and atelier rules.
- Cart, wishlist, atelier configuration, dashboard edits and hotspot assignments use this browser’s `localStorage` under `azho.*` keys. Dashboard product edits remain in the mock dashboard; hotspot assignments also affect the showroom.
- Checkout validates locally and shows an `AZHO-DEMO-…` number. **No order is sent.** Customer name, phone and address are not saved in localStorage. The delivery fee is calculated at confirmation, not invented here.
- Admin has no authentication, backend, real inventory, image processing or fulfilment. Its image upload area is a placeholder; the secondary sections are informational mock screens.

## Independent showroom assets

The web preview never writes `assets/boutique.glb`, `assets/stops.json` or `assets/stops/`. They are produced by a separate job and must follow `../docs/STOPS-CONTRACT.md`.

If these assets are missing, the site uses an ivory stop placeholder and accessible actions for the current stop. It creates no substitute stills. Reload after the assets arrive. Missing optional assets can produce expected HTTP 404s; they do not prevent shopping or checkout. The baked-light GLB renderer uses unlit materials and sRGB textures. During loading, the current stop’s desktop/portrait still is a poster with a small translated glass loading indicator. Hotspots stay hidden until the first successful 3D render, then the poster cross-fades to the canvas. Navigation during loading selects the camera for that first frame.

WebGL/context creation errors, GLB failures and render errors automatically retain the current stop’s poster and show a translated “3D view unavailable on this device” notice. Still hotspots retain the existing cover-crop projection; when a poster or hotspot coordinates are missing, the current zone’s action list keeps shopping usable. Context loss returns to the poster while restoration is attempted; after four seconds without restoration the renderer is disposed and fallback remains. There is no manual fallback control.

Rendering is on demand at rest, pauses when the document is hidden or the stage is outside the viewport, and caps device pixel ratio at 1.75 (below 2). Eight repeatedly expensive draws or camera-animation frame intervals over 32 ms lower the cap by .25, down to 1; render submission timing does not measure GPU completion. Reduced motion keeps 3D, disables pointer motion/pulse and cuts the camera under a 200 ms fade.

## Vendored dependencies

No runtime CDN links:

- Three.js 0.160.0: `vendor/three/build/three.module.min.js`, GLTFLoader and its used BufferGeometryUtils dependency with their original relative layout. MIT licence.
- GSAP 3.12.5: `vendor/gsap.min.js`; see its bundled licence notice and upstream licensing before production use.
- Fontsource WOFF2 files: Cormorant Garamond 400/500/500 italic, Inter 400/500 (Latin), IBM Plex Sans Arabic 400/500 (Arabic). Fonts use `font-display: optional` and their upstream open font licences.

Downloads came from `cdn.jsdelivr.net/npm/three@0.160.0/`, `gsap@3.12.5/`, and `@fontsource/…/files/`. The product photos came from the URLs in the supplied export. `../tools/preview-dev/download-report.json` records every download. All ten photos downloaded successfully.

## Verification tools

Run from the project root while the server is running:

```sh
python3 tools/preview-dev/check-static.py
node tools/preview-dev/check-i18n.mjs
node tools/preview-dev/check-references.mjs
node --experimental-vm-modules tools/preview-dev/three-check.mjs
```

`../tools/preview-dev/dom-check.mjs` runs page and checkout interactions in LinkeDOM, not a rendering browser. It cannot validate pixel layout, touch behaviour, native focus trapping or WebGL. `../tools/preview-dev/dom-results.json` records the actual completed cases. The DOM helper is vendored under `../tools/preview-dev/` for verification only and is never imported by the website.

Browser screenshot attempts with installed Playwright Chromium and WebKit failed under the session sandbox; the connected browser host was unavailable. No screenshots or visual-browser pass is claimed. The 3D asset, rendered stills and camera framing still require verification once the independent asset job finishes.

Implementation roles and verification limits are recorded in `../tools/preview-dev/generation-log.md`.

Completed checks: 64 files returned HTTP 200; all 22 JavaScript/module files passed `node --check`; 215 translation keys matched across all three locales; 17 DOM interaction cases passed; standard/reduced camera unit checks passed with a mocked renderer. No required local references were missing. Only the independent CGI assets were absent. The test server was stopped afterwards. See `../tools/preview-dev/verification-summary.json`.

Current 3D-only changes were checked statically and with mocked renderer/DOM tests. No browser can be run in this session; actual WebGL, cross-fades, mobile GPU performance and visual RTL layout remain unverified. Earlier verification counts above describe the prior preview.

For server-free DOM checks use `PREVIEW_CHECK_FILES=1 node tools/preview-dev/dom-check.mjs index fr stills` (poster fixture) or `index ar` (missing-poster fallback). These mock WebGL failure; the legacy `mode=stills` in the fixture URL is deliberately ignored. The current renderer mock also checks first-frame readiness, viewport pauses, restoration and restoration timeout. Local HTTP serving was denied by the sandbox during this change.

## Cache version and showroom gestures

Every local HTML CSS/JS reference, page-module URL, static import in `js/`, and stops/GLB/i18n/data request uses `?v=20261113h`. Bump this value consistently on **each change** before sharing the preview, so returning browsers request the current modules, styles and data. Keep the Three.js import map version aligned with the loader URL.

At Entrée, the anchored Enter capsule or a scene tap advances to B. The entry hint appears only on the first showroom visit in a session (`sessionStorage`, `azho.entryHint`). Wheel/trackpad gestures navigate with a 900 ms quiet-period debounce; outward scrolling at A/E remains ordinary page scrolling. Horizontal touch swipes navigate (mirrored in RTL), vertical swipes scroll the page, and mouse/pen drags look around within ±25° yaw / ±10° pitch. Movement beyond 6 px suppresses entry clicks. Stop changes restore the authored view. Endpoint Prev/Next buttons retain keyboard focus with `aria-disabled`.

This interaction/cache update was reviewed without a browser; native gestures, framing, visual layout and actual WebGL fallback still need browser verification.

Checks for this update: `node tools/preview-dev/gesture-check.mjs`, `node --experimental-vm-modules tools/preview-dev/three-check.mjs`, translation/reference checks and app-module syntax checks passed. Gesture checks use synthetic events, not a browser.

## Colour theme

The HTML head sets `data-theme` before styles load, following the OS preference
unless `localStorage['azho.theme']` holds `light` or `dark`. The glass sun/moon
button beside languages stores an explicit choice. OS changes apply until an
explicit choice exists; storage events synchronize tabs. FR/AR/EN labels describe
the next action; `aria-pressed` indicates whether dark mode is active.

Dark UI uses espresso, ivory, travertine and champagne brass. Only the decorative
fixed boutique backdrop is veiled; product photos, posters and WebGL remain bright.
Showroom overlays use .90 smoked plates independently of the .38 page tint.
Reduced transparency, increased contrast and missing backdrop-filter use dense
espresso plates. Brass is reserved for boundaries/accents, not body copy.

Analytical WCAG sRGB contrast, compositing over pure white (no blur credit),
including the maximum .025 white specular wash: page glass with .72 espresso
veil gives ivory **7.36:1**, travertine **5.17:1**, brass boundary **3.79:1**;
.90 scene plates give **8.60:1**, **6.04:1**, **4.43:1** respectively.
Dense #292520 gives **12.65:1**, **8.89:1**, **6.52:1**. Inverted primary
capsules give **12.65:1**. These are calculated bounds, not sampled screenshots.

Static reference checks, 221-key locale parity, all application module syntax,
pre-paint/system/persistence/storage theme mocks and existing gesture/renderer
mocks passed. HTTP checks could not connect without a running server (the report
records that failure). No browser was used: actual 390px FR/AR/EN header fit,
native keyboard/focus, cross-tab delivery, OS chrome, translucent rendering and
visual light-theme equivalence remain unverified.


## QA patches 1–7 (offline verification)

Cart storage now contains identity/choices only (`slug`, `colour`, `size`, `config`,
`qty`, `key`, `id`). Existing metadata is ignored and migrated. Catalog identity,
publication, choices and integer prices are revalidated; atelier initials add
300 DA to its 3500 DA base. Invalid lines produce a translated live notice.
Order history is limited to 20 demonstration orders. If order storage fails,
checkout keeps the cart and focuses an accessible retry error.

Headers reserve a fixed height independently of measured `--header-h`. Static
button labels, optional font display, image ratios and initial card/gallery
placeholders reserve layout before asynchronous data arrives. Navigation
collapses into the menu on narrower screens. CLS <0.1 and the 320–2560px/RTL
visual layout require browser measurements; no browser was run for these patches.

Every page has a hashed inline-script CSP and a referrer policy. Inline styles
remain allowed because runtime positioning, transitions, GSAP and dynamic
style properties use them. Image data/storage paths are restricted to local
`assets/` raster files. The CSP meta cannot enforce `frame-ancestors`.
`preview/_headers` (this folder's `_headers`) is ready for Cloudflare Pages;
serve frame-ancestors, HSTS and X-Content-Type-Options/nosniff as real HTTP
headers. The file has **not** been deployed. HTTPS is required for HSTS.

`robots.txt` excludes the owner mock and links the sitemap. **TODO: replace
https://azho.example in both robots.txt and sitemap.xml with the final domain
before publishing.** Product structured data omits availability unless supplied
by the catalog. No real inventory is inferred.

Development scripts, their vendored DOM helper, reports and the WooCommerce
source export live in `../tools/preview-dev/`, outside the publishable tree.
CSS backups live in `../backups/css-history/`. Run scripts from the project root:

```sh
python3 tools/preview-dev/check-patches.py
python3 tools/preview-dev/check-static.py
node tools/preview-dev/check-i18n.mjs
node tools/preview-dev/check-references.mjs
node --experimental-vm-modules tools/preview-dev/three-check.mjs
node tools/preview-dev/gesture-check.mjs
```

Three.js/GLTFLoader/GLB loading remains deferred until Enter/Skip dismisses the
intro; only the home page adds modulepreload links at that point. The glass
loader reports GLTFLoader loaded/total bytes. r160 GLTFLoader natively handles
`EXT_texture_webp`. BufferGeometryUtils remains because GLTFLoader calls
`toTrianglesDrawMode`. The unminified Three build stays on disk, unreferenced.

The reviewer can create a separate optimized GLB with the installed `cwebp`:

```sh
python3 tools/preview-dev/glb_webp.py preview/assets/boutique.glb tools/preview-dev/boutique-webp.glb
```

The converter uses Python's standard library and `cwebp`, quality 82, embeds
WebP without a fallback and requires `EXT_texture_webp`. It reports per-image
sizes, preserves dimensions and aligns GLB data to four bytes. The production
GLB has deliberately **not** been converted. Verify output visually and with a
GLB validator before replacing the asset. No network, installs, browser, git,
CGI changes or deployment were used for this QA patch work.

QA patch verification: 223 translation keys, local references, exact CSP hashes,
cache/image/sitemap checks, cart tampering/quota/history/quantity regressions,
synthetic GLB repacking, gesture and standard/reduced renderer mocks passed.
Six server-free page/checkout cases passed (shop, product, atelier, admin,
French home poster fixture and Arabic home missing-poster fallback). Their
expected Node Three import failure tests fallback, not browser WebGL.

Additional offline regression commands:

```sh
node --experimental-vm-modules tools/preview-dev/cart-check.mjs
python3 tools/preview-dev/check-glb-webp.py
PREVIEW_CHECK_FILES=1 node tools/preview-dev/dom-check.mjs shop fr
```

CSP hashes (exact script contents):

- Theme bootstrap, all pages: `sha256-Rm4HPBn3u7Oqj2rcqxjp0mptV1jX1u1FNY1wJ0DwYTs=`
- Home import map: `sha256-NiUUpnUS4ndWDFHdoxzy4vv+bsoBODCi6bz50We0Ts4=`

`check-static.py` requires a running local HTTP server and was not run for this
patch set under the no-network constraint. The retired
`showroom-followup-check.mjs` prints its replacement commands. No actual cwebp
compression, GLB savings, browser CLS, CSP enforcement or host headers were
verified. Replace the placeholder sitemap origin before deployment.

## Collections rail — stop B

Stop B now mounts `js/collections.js` over the stage. Its own themed veil leaves
the boutique sensed behind arched catalog portraits. Entering B reveals the layer;
leaving resumes 3D before camera navigation and fades the layer out. After the B
camera settles, rendering pauses without resizing/clearing its retained frame.
The renderer still uses demand rendering at all other stops. Header and stepper
remain outside the rail. `?stop=B` retains the existing direct-entry behaviour.

Left/Right, Home/End, arrows, horizontal wheel and horizontal swipes browse the
published catalog (mirrored in Arabic). Vertical wheel stays native inside the
rail; outward motion at its endpoints changes zones. Enter opens the centred
product. Escape from quick view or the rail leaves B for C; the close button
returns quick view to the rail.
Quick view uses the shared dialog trap/restore mechanism, catalog galleries,
explicit size/colour validation, demo size notice, catalog pricing and cart API.
Success lasts 1.6 seconds with a toast. Bag and existing demo checkout share one
inline-end desktop drawer / mobile sheet with a swipeable close handle.

Reviewer browser suite (written and syntax-checked, **not run**):

```sh
PREVIEW_URL=http://127.0.0.1:4173 node tools/preview-dev/zone-b-check.cjs
```

It uses the reviewer-provided Playwright path, Chromium/WebKit, desktop/mobile
and FR/AR; saves rail, quick-view, success, cart and confirmation screenshots
under `docs/screenshots/zone-b/`. No browser screenshots are claimed here.
Offline locale/reference/CSP, cart, renderer, gesture and DOM fixtures passed;
native focus, RTL geometry, actual WebGL pause, transitions, touch and visual
theme quality remain for browser review. The DOM fixture exercises automatic
Three import failure in Node, not actual WebGL. Cache generation is `20261113h`.


## Redesigned store displays
The web accepts the new hotspot contract and retains old authored bead ids while older assets remain installed. CGI-owned hotspot data, stops and GLB are never rewritten by the web. Product actions from scene displays show the translated approximate-garment notice; catalog rail/page actions do not. HIT meshes are invisible but raycastable at the current stop; GLASS meshes use cheap transparent unlit materials. Collections occupies the bottom 40% (45% mobile), leaving the upper scene interactive. Delivery/contact use the shared dialog focus handling.

Current cache generation: `20261113k`. Reviewer-only `tools/preview-dev/store-check.cjs` captures all stops and checks the new scene actions, including a direct canvas hit. It requires regenerated assets and is deliberately not run here.


## Official AZHO identity
The header and footer use the supplied wordmark as a same-origin CSS mask; the
intro uses the supplied full lockup. Artwork follows espresso/ivory theme ink.
The mark-only SVG favicon uses champagne brass on transparent, with a centred
square viewBox. No Apple touch PNG was produced under the no-tools condition.
Existing Open Graph photography is retained; no dedicated social image exists.
Current cache generation: `20261113q`. All inline-script CSP hashes were refreshed.
Logo size, masking, responsive/RTL layout and browser CSP enforcement need visual
verification; no browser was used for this identity update.
