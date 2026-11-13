import { t, escapeHtml, localized, formatPrice, onChange } from "./i18n.js?v=20261113n";
import {
  initCart, renderCart, renderWishlist,
  addLine, toggleWishlist, isWished, onCartChange, updateCounts
} from "./cart.js?v=20261113n";
import { loadProducts, normalizeQty, safeImageUrl, productSizes, catalogPrice, isPurchasable } from "./store.js?v=20261113n";

/* ---------- Shared image fallback (no inline onerror) ---------- */

function installImageFallback() {
  if (document.documentElement.dataset.imgFallbackBound === "1") return;
  document.documentElement.dataset.imgFallbackBound = "1";
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG") return;
      const parent = img.parentNode;
      if (parent && parent.classList) parent.classList.add("is-missing");
      img.style.visibility = "hidden";
    },
    true
  );
}

/* ---------- Dialog focus management ---------- */

const dialogState = new WeakMap(); // dialog -> { lastFocus, keyHandler }

function focusableIn(dialog) {
  return Array.from(
    dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function trapTab(dialog, e) {
  if (e.key !== "Tab") return;
  const list = focusableIn(dialog);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openDialog(dialog) {
  if (!dialog) return;
  const state = dialogState.get(dialog) || {};
  if(!dialog.open)state.lastFocus = document.activeElement;
  dialogState.set(dialog, state);

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
  }

  document.body.style.overflow = "hidden";

  if (!state.keyHandler) {
    state.keyHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(dialog);
        if(dialog.classList.contains('collections-focus'))document.dispatchEvent(new CustomEvent('azho:collections-exit'));
        return;
      }
      trapTab(dialog, e);
    };
    dialog.addEventListener("keydown", state.keyHandler);
  }

  const first = focusableIn(dialog)[0];
  if (first) first.focus();
}

function closeDialog(dialog) {
  dialog?.querySelector(".rail-toast")?.remove();
  if (!dialog) return;
  const state = dialogState.get(dialog) || {};
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");

  document.body.style.overflow = "";

  if(dialog.classList.contains('collections-focus'))state.lastFocus=document.querySelector('#collections-rail [aria-current="true"]')||state.lastFocus;
  if (state.lastFocus && typeof state.lastFocus.focus === "function") {
    try { state.lastFocus.focus(); } catch (_) {}
  }
  state.lastFocus = null;
}

/* ---------- Product dialog ---------- */

function productDialogHtml(p) {
  const name = localized(p.name);
  const desc = localized(p.description);
  const img = safeImageUrl(p.images && p.images[0]);
  const media = img
    ? '<img width="800" height="1000" src="' + escapeHtml(img) + '" alt="' +
      escapeHtml(t("product.imageAlt", { name, n: 1 })) + '">'
    : "";
  const price = catalogPrice(p);
  const hasPromo = price != null && Number.isSafeInteger(p.regularPrice) && p.regularPrice > price;
  const priceHtml = price == null
    ? escapeHtml(t("product.priceOnRequest"))
    : hasPromo
      ? '<del>' + escapeHtml(formatPrice(p.regularPrice)) + "</del> " +
        escapeHtml(formatPrice(price))
      : escapeHtml(formatPrice(price));
  const purchasable = isPurchasable(p);

  const colours = (p.colours || []).map((c, i) =>
    '<button type="button" class="option-chip" aria-describedby="pd-colour-error" data-colour="' + escapeHtml(c) +
    '" aria-pressed="' + (p.colours.length === 1 ? "true" : "false") + '">' +
    escapeHtml(t("colour." + c)) + "</button>"
  ).join("");

  const sizeList = p.sizes?.length ? p.sizes : [];
  const sizes = sizeList.map((s) =>
    '<button type="button" class="option-chip" aria-describedby="pd-size-error" data-size="' + escapeHtml(s) +
    '" aria-pressed="false">' + escapeHtml(t("size." + s)) + "</button>"
  ).join("");

  return (
    '<div class="product-layout">' +
      '<div class="product-gallery">' +
        '<div class="product-gallery-main">' + media +
          '<div class="img-fallback">' + escapeHtml(t("product.imageMissing")) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="product-info">' +
        "<h3>" + escapeHtml(name) + "</h3>" +
        '<p class="product-price">' + priceHtml + "</p>" +
        (colours
          ? '<div class="option-group"><span>' + escapeHtml(t("product.colour")) +
            '</span><div class="option-row" role="group" aria-label="' + escapeHtml(t('product.colour')) + '">' + colours + '</div><p id="pd-colour-error" class="field-error" aria-live="polite"></p></div>'
          : "") +
        (sizes
          ? '<div class="option-group"><span id="pd-size-label">' +
            escapeHtml(t("product.size")) + '</span><div class="option-row" role="group" aria-labelledby="pd-size-label">' +
            sizes + "</div>" +
            '<p class="field-error" id="pd-size-error" aria-live="polite"></p>' +
          "</div>"
          : "") +
        '<div class="option-group"><span>' + escapeHtml(t("product.qty")) +
          '</span><div class="qty-row">' +
          '<button type="button" data-qty-dec aria-label="' +
            escapeHtml(t("product.qtyDec")) + '">−</button>' +
          '<input type="number" min="1" max="99" step="1" value="1" data-qty aria-label="' +
            escapeHtml(t("product.qty")) + '">' +
          '<button type="button" data-qty-inc aria-label="' +
            escapeHtml(t("product.qtyInc")) + '">+</button>' +
        "</div></div>" +
        '<div class="product-card-actions">' +
          (purchasable
            ? '<button type="button" class="btn btn-primary" data-add>' + escapeHtml(t("product.add")) + "</button>"
            : '<button type="button" class="btn btn-primary" data-add disabled aria-disabled="true">' + escapeHtml(t("product.add")) + "</button>") +
          '<button type="button" class="btn btn-ghost" data-wish>' +
            escapeHtml(isWished(p.slug) ? t("product.wishlistRemove") : t("product.wishlist")) +
          "</button>" +
        "</div>" +
        (purchasable
          ? ""
          : '<div class="product-ask-price">' +
              '<a class="btn btn-primary" href="tel:+213551210696" dir="ltr">' + escapeHtml(t("product.askPrice")) + "</a>" +
              '<a class="btn btn-ghost" href="https://www.instagram.com/azholingerie/" target="_blank" rel="noopener">Instagram</a>' +
              '<p class="demo-note">' + escapeHtml(t("product.priceNote")) + "</p>" +
            "</div>") +
        '<p class="product-description">' + escapeHtml(desc) + '</p>' +
        '<a class="btn btn-ghost" href="product.html?slug=' +
          encodeURIComponent(p.slug) + '">' + escapeHtml(t("product.fullPage")) + "</a>" +
        '<p class="demo-note">' + escapeHtml(t("product.demoNote")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("product.demoSizes")) + "</p>" +
        '<p class="demo-note">' + escapeHtml(t("product.delivery")) + "</p>" +
      "</div>" +
    "</div>"
  );
}

function wireProductDialog(body, p) {
  let colour = p.colours?.length === 1 ? p.colours[0] : "";
  let size = "";
  const gallery=body.querySelector('.product-gallery');
  const thumbs=document.createElement('div');thumbs.className='product-gallery-thumbs';
  (p.images||[]).forEach((src,i)=>{
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',t('product.imageAlt',{name:localized(p.name),n:i+1}));b.setAttribute('aria-pressed',String(i===0));
    const img=document.createElement('img');img.width=64;img.height=80;img.src=safeImageUrl(src);img.alt='';img.loading='lazy';b.append(img);
    b.addEventListener('click',()=>{const main=gallery.querySelector('.product-gallery-main img');main.src=safeImageUrl(src);main.alt=t('product.imageAlt',{name:localized(p.name),n:i+1});thumbs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});thumbs.append(b);
  });gallery.append(thumbs);
  const qtyInput = body.querySelector("[data-qty]");
  const sizeError = body.querySelector("#pd-size-error");

  body.querySelectorAll("[data-colour]").forEach((b) => {
    b.addEventListener("click", () => {
      colour = b.getAttribute("data-colour");
      body.querySelector("#pd-colour-error").textContent="";
      body.querySelectorAll("[data-colour]").forEach(x=>x.removeAttribute("aria-invalid"));
      body.querySelectorAll("[data-colour]").forEach((x) =>
        x.setAttribute("aria-pressed", x === b ? "true" : "false")
      );
    });
  });

  body.querySelectorAll("[data-size]").forEach((b) => {
    b.addEventListener("click", () => {
      size = b.getAttribute("data-size");
      body.querySelectorAll("[data-size]").forEach((x) =>
        x.setAttribute("aria-pressed", x === b ? "true" : "false")
      );
      if (sizeError) sizeError.textContent = "";
      body.querySelectorAll("[data-size]").forEach((x) => x.removeAttribute("aria-invalid"));
    });
  });

  const dec = body.querySelector("[data-qty-dec]");
  const inc = body.querySelector("[data-qty-inc]");
  if (dec) dec.addEventListener("click", () => {
    qtyInput.value = String(normalizeQty(Number(qtyInput.value) - 1));
  });
  if (inc) inc.addEventListener("click", () => {
    qtyInput.value = String(normalizeQty(Number(qtyInput.value) + 1));
  });
  if (qtyInput) qtyInput.addEventListener("change", () => {
    qtyInput.value = String(normalizeQty(qtyInput.value));
  });

  const add = body.querySelector("[data-add]");
  if (add && isPurchasable(p)) add.addEventListener("click", () => {
    if (p.sizes?.length && !size) {
      if (sizeError) sizeError.textContent = t("product.sizeRequired");
      const first = body.querySelector("[data-size]");
      if (first) {
        first.setAttribute("aria-invalid", "true");
        first.focus();
      }
      return;
    }
    if(p.colours?.length>1 && !colour){
      body.querySelector("#pd-colour-error").textContent=t("rail.colourRequired");
      const first=body.querySelector("[data-colour]");first.setAttribute("aria-invalid","true");first.focus();return;
    }
    if(!addLine({
      slug: p.slug,
      qty: normalizeQty(qtyInput ? qtyInput.value : 1),
      colour,
      size
    }))return;
    add.textContent = '✓ '+t("rail.added");add.classList.add('is-added');add.disabled=true;
    add.setAttribute('aria-live','polite');
    const count=document.getElementById('cart-count');
    count?.classList.remove('cart-pulse');requestAnimationFrame(()=>count?.classList.add('cart-pulse'));
    setTimeout(()=>count?.classList.remove('cart-pulse'),600);
    showAddedToast(body);
    setTimeout(() => { add.textContent = t("product.add");add.classList.remove('is-added');add.disabled=false; }, 1600);
  });

  const wish = body.querySelector("[data-wish]");
  if (wish) wish.addEventListener("click", () => {
    const added = toggleWishlist(p.slug);
    wish.textContent = added ? t("product.wishlistRemove") : t("product.wishlist");
  });
}

/* ---------- Public API ---------- */

let currentProduct = null, currentOptions={};
function showAddedToast(body){
  body.querySelector('.rail-toast')?.remove();
  const toast=document.createElement('div');toast.className='rail-toast';
  const text=document.createElement('p');text.setAttribute('role','status');text.textContent=t('rail.success');
  const view=document.createElement('button'),cont=document.createElement('button');
  for(const b of [view,cont]){b.type='button';b.className='btn btn-ghost';}
  view.textContent=t('rail.viewBag');cont.textContent=t('rail.continue');
  view.addEventListener('click',openCart);
  cont.addEventListener('click',()=>{closeDialog(document.getElementById('product-dialog'));});
  toast.append(text,view,cont);body.insertBefore(toast,body.querySelector(".product-dialog-footer"));
}

export async function initOverlay() {
  installImageFallback();
  await initCart();

  const cartDialog = document.getElementById("cart-dialog");
  const wishDialog = document.getElementById("wishlist-dialog");
  const productDialog = document.getElementById("product-dialog");

  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d) closeDialog(d);
    });
    d.querySelectorAll("[data-close]").forEach((b) => {
      b.addEventListener("click", () => closeDialog(d));
    });
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDialog(d);
      if(d.classList.contains('collections-focus'))document.dispatchEvent(new CustomEvent('azho:collections-exit'));
    });
  });

  const cartBtn = document.getElementById("cart-btn");
  if (cartBtn) cartBtn.addEventListener("click", () => openCart());

  const wishBtn = document.getElementById("wishlist-btn");
  if (wishBtn) wishBtn.addEventListener("click", () => openWishlist());

  onCartChange(() => {
    updateCounts();
    if (cartDialog && cartDialog.open) {
      renderCart(document.getElementById("cart-body"));
    }
  });

  // Re-render open dialogs on language change.
  onChange(() => {
    if (cartDialog && cartDialog.open) {
      renderCart(document.getElementById("cart-body"));
    }
    if (wishDialog && wishDialog.open) {
      loadProducts().then((list) => {
        renderWishlist(document.getElementById("wishlist-body"), list);
      });
    }
    if (productDialog && productDialog.open && currentProduct) {
      const body = document.getElementById("product-dialog-body");
      if (body) {
        openProductDialog(currentProduct,currentOptions);
      }
    }
  });

  if(cartDialog){
    const handle=document.createElement('button');handle.type='button';handle.className='sheet-handle';handle.setAttribute('aria-label',t('rail.closeBag'));handle.addEventListener('click',()=>closeDialog(cartDialog));cartDialog.prepend(handle);
    let start=null;
    handle.addEventListener('pointerdown',e=>{start={id:e.pointerId,x:e.clientX,y:e.clientY};handle.setPointerCapture?.(e.pointerId);});
    handle.addEventListener('pointerup',e=>{if(start&&start.id===e.pointerId&&e.clientY-start.y>55&&Math.abs(e.clientX-start.x)<80&&innerWidth<768)closeDialog(cartDialog);start=null;});
    handle.addEventListener('pointercancel',()=>{start=null;});
    onChange(()=>handle.setAttribute('aria-label',t('rail.closeBag')));
  }
  cartDialog?.addEventListener('click',e=>{
    if(e.target.closest('[data-continue-shopping]'))closeDialog(cartDialog);
  });
  updateCounts();
  return { openDialog, closeDialog, openCart, openWishlist, openProductDialog };
}

export function openCart() {
  const pd=document.getElementById('product-dialog');
  if(pd?.open)closeDialog(pd);
  const d = document.getElementById("cart-dialog");
  renderCart(document.getElementById("cart-body"));
  openDialog(d);
}

export function openWishlist() {
  const d = document.getElementById("wishlist-dialog");
  loadProducts().then((list) => {
    renderWishlist(document.getElementById("wishlist-body"), list);
    openDialog(d);
  });
}

export function openProductDialog(product,options={}) {
  const d = document.getElementById("product-dialog");
  const body = document.getElementById("product-dialog-body");
  if (!d || !body || !product) return;
  d.classList.toggle("collections-focus",!!options.collections);
  currentOptions=options;
  currentProduct = product;
  body.innerHTML = productDialogHtml(product);
  if(options.placeholder){const note=document.createElement('p');note.className='placeholder-note';note.textContent=t('product.placeholder3d');body.prepend(note);}
  wireProductDialog(body, product);
  if(options.collections && options.products){
    const list=options.products, i=list.findIndex(p=>p.slug===product.slug);
    for(const [offset,cls] of [[-1,'before'],[1,'after']]){
      const p=list[i+offset];if(!p)continue;
      const img=document.createElement('img');img.className='focus-neighbour '+cls;img.width=400;img.height=500;img.src=safeImageUrl(p.images[0]);img.alt='';img.setAttribute('aria-hidden','true');
      const b=document.createElement('button');b.type='button';b.className='focus-nav '+cls;b.setAttribute('aria-label',t(offset<0?'rail.prev':'rail.next'));b.textContent=(offset<0)!==(document.documentElement.dir==='rtl')?'←':'→';
      b.addEventListener('click',()=>openProductDialog(p,options));body.prepend(img,b);
    }
  }
  const scroll=document.createElement('div');scroll.className='product-dialog-scroll';
  while(body.firstChild)scroll.append(body.firstChild);
  const footer=document.createElement('div');footer.className='product-dialog-footer';
  const quantity=scroll.querySelector('[data-qty]').closest('.option-group');
  const actions=scroll.querySelector('.product-card-actions');
  footer.append(quantity,actions);body.append(scroll,footer);
  openDialog(d);
}

// Service dialogs use the same focus trap, dismissal and focus restoration.
export function openServiceDialog(kind){
  if(!['delivery','contact'].includes(kind))return;
  let d=document.getElementById('service-dialog');
  if(!d){d=document.createElement('dialog');d.id='service-dialog';d.className='drawer';d.setAttribute('aria-labelledby','service-title');document.body.append(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))closeDialog(d);});
    d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
    onChange(()=>{if(d.open)openServiceDialog(d.dataset.kind);});
  }
  d.dataset.kind=kind;
  d.innerHTML='<div class="drawer-head"><h2 id="service-title">'+escapeHtml(t('service.'+kind))+'</h2><button type="button" data-close>'+escapeHtml(t('common.close'))+'</button></div><div class="drawer-body service-body"></div>';
  const body=d.querySelector('.service-body');
  if(kind==='delivery'){
    const p=document.createElement('p');p.textContent=t('service.deliveryBody');const b=document.createElement('button');b.type='button';b.className='btn btn-primary';b.textContent=t('rail.viewBag');b.addEventListener('click',()=>{closeDialog(d);openCart();});body.append(p,b);
  }else{
    for(const [href,key] of [['tel:+213551210696','footer.phone'],['mailto:azholingerie@gmail.com','footer.email']]){const a=document.createElement('a');a.href=href;a.dir='ltr';a.textContent=t(key);body.append(a);}
    for(const key of ['footer.address','service.noWhatsapp']){const p=document.createElement('p');p.textContent=t(key);body.append(p);}
  }
  openDialog(d);
}
