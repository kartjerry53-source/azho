import {createTour} from './tour.js?v=20261113v';
import {createCollections} from './collections.js?v=20261113v';
import {t,localized,formatPrice,onChange} from './i18n.js?v=20261113v';
import {loadProducts,loadHotspots,safeStorageGet,safeImageUrl,catalogPrice} from './store.js?v=20261113v';
import {openProductDialog,openCart,openServiceDialog} from './overlay.js?v=20261113v';

// Runtime contract bridges old assets without rewriting CGI-owned data.
const contract={ // generated from data/hotspots.json (cgi/scene_contract.py); regenerate when hotspots change
  'a-enter':{"stop": "A", "action": "stop", "target": "B"},
  'a-bust-rouge':{"stop": "A", "action": "product", "product": "deshabille-rouge"},
  'a-bust-blanc':{"stop": "A", "action": "product", "product": "nuisette-string"},
  'b-kimono':{"stop": "B", "action": "product", "product": "kimono-dentelle"},
  'b-deshabille-noir':{"stop": "B", "action": "product", "product": "deshabille-noir"},
  'b-ensemble-jaguar':{"stop": "B", "action": "product", "product": "ensemble-nuisette-kimono-jaguar"},
  'c-jaguar':{"stop": "C", "action": "product", "product": "ensemble-nuisette-kimono-jaguar"},
  'c-leopard':{"stop": "C", "action": "product", "product": "ensemble-leopard"},
  'c-deshabille':{"stop": "C", "action": "product", "product": "deshabille-elegance"},
  'c-case':{"stop": "C", "action": "product", "product": "strings-dentelle"},
  'f-ensembles':{"stop": "F", "action": "product", "product": "ensembles-dentelle-weyes"},
  'f-body':{"stop": "F", "action": "product", "product": "body-dentelle"},
  'f-trois-pieces':{"stop": "F", "action": "product", "product": "ensemble-trois-pieces-dentelle"},
  'f-strings':{"stop": "F", "action": "product", "product": "strings-dentelle"},
  'd-table':{"stop": "D", "action": "atelier"},
  'd-swatches':{"stop": "D", "action": "atelier"},
  'e-tress':{"stop": "E", "action": "product", "product": "pyjama-tress"},
  'e-satin-tress':{"stop": "E", "action": "product", "product": "pyjama-satin-tress"},
  'e-leopard':{"stop": "E", "action": "product", "product": "pyjama-satin-leopard"},
  'e-coton':{"stop": "E", "action": "product", "product": "pyjama-coton-boutonne"},
  'e-primark':{"stop": "E", "action": "product", "product": "pyjama-primark"},
  'e-cadeaux':{"stop": "E", "action": "product", "product": "coffrets-cadeaux"},
  'g-counter':{"stop": "G", "action": "cart"},
  'g-delivery':{"stop": "G", "action": "delivery"},
  'g-contact':{"stop": "G", "action": "contact"},
  'g-brume':{"stop": "G", "action": "product", "product": "brume-intime-maison-serai"},
  'g-corset':{"stop": "G", "action": "product", "product": "corset-demo-3d"}
};
const legacy={A:['a-enter'],B:['b-rail-1','b-rail-2','b-rail-3'],C:['c-island-1','c-rail-1'],D:['d-atelier'],E:['e-counter']};
const groups='ABCFEDG'.split('').map(stop=>[stop,...Object.keys(contract).filter(id=>contract[id].stop===stop)]);
const arrived=new Set();let labelTimer=0;
function revealLabels(){if(!matchMedia('(pointer: coarse)').matches||arrived.has(current()?.id))return;arrived.add(current().id);els.hotspots.classList.add('show-labels');clearTimeout(labelTimer);labelTimer=setTimeout(()=>els.hotspots.classList.remove('show-labels'),2000);}

const state={stops:[],products:[],map:{},index:0,entered:false,failed:false,scene:null,ready:false,rest:true,still:null,token:0};
const params=new URLSearchParams(location.search);
let sceneGeneration=0, collections=null;
function syncCollections(){collections?.setActive(false);} // owner 2026-11-13: no rail band under Collections; the full 3D view stays and displays open the product view when tapped

let firstVisit=true;
try {firstVisit=sessionStorage.getItem('azho.entryHint')!=='seen';} catch {}
const requestedStop=params.get('stop')?.toUpperCase();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let els={},layers=[],timer=0;
const portrait=()=>innerHeight>innerWidth;
const current=()=>state.stops[state.index];
const product=slug=>state.products.find(p=>p.slug===slug);
function mapping(id) {
  if(!groups.some(([, ...ids])=>ids.includes(id))&&!Object.values(legacy).some(ids=>ids.includes(id)))return undefined;
  const original=contract[id]||state.map[id];
  const override=safeStorageGet('azho.hotspots',{})?.[id];
  if(typeof override==='string' && product(override))return {...original,action:'product',product:override};
  return original;
}
function label(id) {
  const entry=mapping(id), p=entry?.action==='product'?product(entry.product):null;
  return p?localized(p.name):t('hotspot.'+id);
}
function action(id) {
  if(id==='a-enter'){goTo(1);return;}
  const m=mapping(id);if(!m)return;
  if(m.action==='product'){const p=product(m.product);if(p)openProductDialog(p,{placeholder:true});}
  if(m.action==='cart')openCart();
  if(m.action==='delivery'||m.action==='contact')openServiceDialog(m.action);
  if(m.action==='atelier')location.href='atelier.html?lang='+document.documentElement.lang;
  if(m.action==='stop')goTo(state.stops.findIndex(s=>s.id===m.target));
}
function fallbackStops() {
  return groups.map(([id,...ids])=>({id,camera:null,target:null,fov:45,still:'assets/stops/'+id+'.jpg',stillMobile:'assets/stops/'+id+'-mobile.jpg',hotspots:ids,hotspotPositions:{}}));
}
async function fetchStops() {
  try{
    const res=await fetch('assets/stops.json?v=20261113v',{cache:'no-cache'});
    if(!res.ok)return fallbackStops();
    const data=await res.json();
    return groups.map(([id,...ids])=>{
      const s=data.stops?.find(s=>s.id===id);if(!s)return fallbackStops().find(s=>s.id===id);
      const authored=(s.hotspots||[]).map(h=>h.id);
      const shown=authored.some(id=>ids.includes(id)&&id!=='a-enter'&&id!=='e-counter')?ids:[...new Set([...ids,...(legacy[id]||[]).filter(key=>authored.includes(key))])];
      return {...s,hotspots:shown,hotspotPositions:Object.fromEntries((s.hotspots||[]).map(h=>[h.id,h]))};
    });
  }catch{return fallbackStops();}
}
function stepper() {
  const oldFocus=els.steps.contains(document.activeElement)?document.activeElement?.dataset.step:null;
  els.steps.replaceChildren(...state.stops.map((s,i)=>{
    const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.dataset.step=String(i);
    b.setAttribute('aria-label',(state.stops.indexOf(s)+1)+' — '+t('stop.'+s.id));
    const letter=document.createElement('span'),name=document.createElement('span');letter.textContent=String(state.stops.indexOf(s)+1);name.className='step-name';name.textContent=t('stop.'+s.id);b.append(letter,name);if(i===state.index)b.setAttribute('aria-current','step');
    b.addEventListener('click',()=>goTo(i));li.append(b);return li;
  }));
  if(oldFocus!==undefined && oldFocus!==null)els.steps.querySelector(`[data-step="${oldFocus}"]`)?.focus();
  els.prev.setAttribute('aria-disabled',String(state.index===0));els.next.setAttribute('aria-disabled',String(state.index===state.stops.length-1));
  els.hint.hidden=!firstVisit || state.index!==0;
  document.getElementById('stage-name').textContent=t('stop.'+current().id);
  els.live.textContent=t('stepper.step',{n:state.index+1,total:state.stops.length})+' — '+t('stop.'+current().id);
}
function renderList() {
  // Keep the button nodes stable so closing an overlay restores the actual trigger.
  els.list.replaceChildren(...state.stops.map(s=>{
    const li=document.createElement('li'),heading=document.createElement('h3'),actions=document.createElement('ul');
    heading.textContent=(state.stops.indexOf(s)+1)+' / '+t('stop.'+s.id);li.className='fallback-stop';li.append(heading,actions);
    for(const id of s.hotspots){
      const item=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='list-action';b.textContent=label(id);
      b.addEventListener('click',()=>action(id));item.append(b);actions.append(item);
    }
    return li;
  }));
}
function makeHotspots() {
  els.hotspots.replaceChildren(...current().hotspots.map(id=>{
    const b=document.createElement('button');b.type='button';b.className='hotspot';b.dataset.hotspotId=id;b.id=id;
    b.setAttribute('aria-label',label(id));b.title=label(id);b.hidden=true;
    const ring=document.createElement('span');ring.className='hotspot-ring';ring.setAttribute('aria-hidden','true');b.append(ring);
    if(id==='a-enter'){b.classList.add('hotspot-enter');const text=document.createElement('span'),arrow=document.createElement('span');text.textContent=label(id);arrow.className='enter-arrow';arrow.textContent='→';arrow.setAttribute('aria-hidden','true');b.append(text,arrow);}
    const tag=document.createElement('span');tag.className='hotspot-label';const m=mapping(id),p=m?.action==='product'?product(m.product):null;const price=catalogPrice(p);tag.textContent=label(id)+(p&&!p.source?.demo?' · '+(price==null?t('product.priceOnRequest'):formatPrice(price)):'');b.append(tag);
    b.addEventListener('click',()=>action(id));return b;
  }));
  els.hotspots.removeAttribute('aria-hidden');els.hotspots.classList.remove('show-labels');
}
function projectStill() {
  const r=els.stage.getBoundingClientRect(),img=state.still;if(!r.width || !r.height)return;
  for(const b of els.hotspots.children){
    const h=current().hotspotPositions[b.dataset.hotspotId];
    const xy=portrait()?(h?.screenMobile||h?.screen):(h?.screen||h?.screenMobile);
    if(!state.failed || !img || !xy || !state.rest){b.hidden=true;continue;}
    const scale=Math.max(r.width/img.width,r.height/img.height);
    const x=(xy[0]*img.width*scale-(img.width*scale-r.width)/2)/r.width;
    const y=(xy[1]*img.height*scale-(img.height*scale-r.height)/2)/r.height;
    b.style.left=(x*100)+'%';b.style.top=(y*100)+'%';b.hidden=x<0||x>1||y<0||y>1;
  }
}
function showStill() {
  const stop=current();if(!stop)return;
  const token=++state.token;clearTimeout(timer);state.rest=false;state.still=null;
  // Remove the previous stop immediately, even when its replacement image is slow.
  for(const layer of layers){layer.style.opacity='0';layer.classList.remove('is-active');}
  layers[0].style.backgroundImage='';layers[0].textContent=t('stop.'+stop.id);
  layers[0].classList.add('is-placeholder','is-active');layers[0].style.opacity='1';
  for(const b of els.hotspots.children)b.hidden=true;
  const active=layers.find(l=>l.classList.contains('is-active'));
  const next=layers.find(l=>l!==active)||layers[0];
  const duration=reduced?200:900;
  function display(img) {
    if(token!==state.token)return;
    next.style.backgroundImage=img?`url(${JSON.stringify(img.src)})`:'';
    next.classList.toggle('is-placeholder',!img);next.textContent=img?'':t('stop.'+stop.id);
    next.style.transition='none';next.classList.remove('is-active');
    next.style.transform=reduced?'none':'scale(1.04)';next.style.opacity='0';
    void next.offsetWidth;
    next.style.transition=`opacity ${duration}ms ease, transform ${duration}ms ease`;
    next.style.transform=reduced?'none':'scale(1)';next.style.opacity='1';next.classList.add('is-active');
    if(active){active.style.transition=`opacity ${duration}ms ease, transform ${duration}ms ease`;active.style.opacity='0';active.style.transform=reduced?'none':'scale(1.04)';active.classList.remove('is-active');}
    state.still=img?{width:img.naturalWidth,height:img.naturalHeight}:null;
    timer=setTimeout(()=>{if(token!==state.token)return;state.rest=true;projectStill();revealLabels();if(state.failed)updateFallback();},duration);
  }
  const img=new Image();img.onload=()=>display(img);img.onerror=()=>display(null);
  const src=safeImageUrl(portrait()?(stop.stillMobile||stop.still):stop.still);
  if(src)img.src=src;else display(null);
}
function goTo(index) {
  if(index<0 || index>=state.stops.length)return;
  if(state.tour){state.tour.scrollToStop(index);return;}
  if(index===state.index)return;
  state.index=index;state.scene?.setActive(true);stepper();makeHotspots();syncCollections();
  if(state.ready){state.rest=false;state.scene.setStop(current());}
  else {showStill();if(state.scene?.ready)state.scene.setStop(current(),{instant:true});}
  if(state.failed) updateFallback();
}
// Tour: the scroll position drives the camera; the stop index follows the nearest stop.
function setIndex(index) {
  if(index<0 || index>=state.stops.length || index===state.index)return;
  state.index=index;stepper();makeHotspots();syncCollections();
  if(!state.ready){showStill();if(state.failed)updateFallback();}
}
function startTour(startIndex) {
  state.tour?.destroy();
  state.tour=createTour({section:els.showroom,stage:els.stage,stops:state.stops,
    getLabel:i=>t('stop.'+state.stops[i].id),t,rtl:document.documentElement.dir==='rtl',reduced,
    onProgress:s=>{
      const near=Math.round(s),moving=Math.abs(s-near)>=0.12;
      els.stage.classList.toggle('is-moving',moving);
      if(near!==state.index)setIndex(near);
      if(state.ready)state.scene.setTourProgress(state.stops,s);
    },
    onSettle:i=>setIndex(i)});
  if(startIndex>0)requestAnimationFrame(()=>state.tour.scrollToStop(startIndex,{instant:true}));
}
function updateFallback() {
  // Use the action list only if this stop has no usable poster coordinates.
  const missing=!state.still || !current().hotspots.some(id=>{
    const h=current().hotspotPositions[id];return !!(portrait()?(h?.screenMobile||h?.screen):(h?.screen||h?.screenMobile));
  });
  els.fallback.hidden=!state.failed || !missing;
  els.hotspots.hidden=state.failed && missing;
  [...els.list.children].forEach((li,i)=>{li.hidden=i!==state.index;});
}
function status() {
  els.status.hidden=state.ready;
  els.status.classList.toggle('is-loading',!state.failed);
  els.statusText.textContent=t(state.failed?'showroom.unavailable':'showroom.loading');
  if(!state.failed && state.progress)els.statusText.textContent+=' · '+state.progress;
  els.stage.setAttribute('aria-busy',String(!state.ready&&!state.failed));
}
function useFallback() {
  ++sceneGeneration;state.failed=true;state.ready=false;
  try {state.scene?.dispose();} catch {}
  state.scene=null;els.stage.classList.remove('is-3d');
  status();makeHotspots();showStill();updateFallback();
}
async function loadScene() {
  const generation=++sceneGeneration;
  let scene;
  const fail=(error)=>{
    if(generation!==sceneGeneration)return;
    console.error('[showroom] 3D unavailable',error || new Error('Invalid stop camera data'));
    useFallback();
  };
  if(!state.stops.every(s=>Array.isArray(s.camera)&&Array.isArray(s.target))){fail();return;}
  try{
    const {createScene}=await import('./three-scene.js?v=20261113v');
    if(generation!==sceneGeneration)return;
    scene=createScene({canvas:els.canvas,onProgress:({loaded,total})=>{
      if(generation!==sceneGeneration || !Number.isFinite(loaded) || loaded<0)return;
      state.progress=Math.floor(loaded)+' / '+(Number.isFinite(total)&&total>0?Math.floor(total):'—')+' B';status();
    },onSuspend:()=>{
      if(generation!==sceneGeneration)return;
      state.ready=false;els.stage.classList.remove('is-3d');status();makeHotspots();showStill();
    },onFirstFrame:()=>{
      if(generation!==sceneGeneration)return;
      clearTimeout(timer);++state.token;state.ready=true;state.rest=true;
      els.stage.classList.add('is-3d');status();
    },onProject:points=>{
      if(generation!==sceneGeneration || !state.ready || !state.rest)return;
      revealLabels();
      for(const b of els.hotspots.children){const p=points.find(p=>p.id===b.dataset.hotspotId);b.hidden=!p?.visible;
        if(p){b.style.left=p.x*100+'%';b.style.top=p.y*100+'%';}}
    },onRest:rest=>{if(generation!==sceneGeneration)return;state.rest=rest;if(!rest)for(const b of els.hotspots.children)b.hidden=true;},onError:fail});
    state.scene=scene;
    await scene.load('assets/boutique.glb?v=20261113v');
    if(generation!==sceneGeneration){scene.dispose();return;}
    scene.setStop(current(),{instant:true});scene.setActive(true);
  }catch(error){fail(error);}
}

async function enter() {
  if(state.entered)return;state.entered=true;
  if(els.intro)els.intro.hidden=true;
  if(els.showroom)els.showroom.hidden=false;
  // Warm the 3D module graph on the landing showroom.
  if(document.body.dataset.page==='home' || /(?:^|\/)index\.html$/.test(location.pathname || '') || document.getElementById('intro')){
    for(const href of ['vendor/three/build/three.module.min.js?v=20261113v','vendor/three/examples/jsm/loaders/GLTFLoader.js?v=20261113v']){
      const link=document.createElement('link');link.rel='modulepreload';link.href=href;document.head.append(link);
    }
  }
  try {sessionStorage.setItem('azho.entryHint','seen');} catch {}
  if(els.title){els.title.tabIndex=-1;els.title.focus({preventScroll:true});}
  els.showroom?.scrollIntoView({block:'start',behavior:'auto'});
  state.stops=await fetchStops();
  const startIndex=state.stops.findIndex(s=>s.id===requestedStop);if(startIndex>=0)state.index=startIndex;
  stepper();renderList();makeHotspots();showStill();syncCollections();
  startTour(Math.max(0,startIndex));
  await loadScene();
  state.tour?.refresh();
  // The model finished loading after the tour position was set: apply it now so beads are placed.
  if(state.ready)state.scene.setTourProgress(state.stops,state.index);
}
function keyboard(e) {
  if(!state.entered || document.querySelector('dialog[open]') || e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  const r=els.showroom.getBoundingClientRect();if(r.bottom<0 || r.top>innerHeight)return;
  if(collections?.key(e))return;
  const rtl=document.documentElement.dir==='rtl';
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
    e.preventDefault();const forward=(e.key==='ArrowRight')!==rtl;goTo(state.index+(forward?1:-1));
  }else if(/^[1-5]$/.test(e.key)){e.preventDefault();goTo(Number(e.key)-1);}
}

function wireGestures() {
  const control=target=>target.closest('button,a,input,select,textarea,[role="button"],.stage-fallback');
  let gesture=null,suppressClick=false,clickTimer=0;
  const suppress=()=>{suppressClick=true;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{suppressClick=false;},120);};
  els.stage.addEventListener('pointerdown',e=>{
    if(control(e.target)||!e.isPrimary||e.button!==0)return;
    gesture={id:e.pointerId,type:e.pointerType,x:e.clientX,y:e.clientY,moved:false,
      look:state.scene?.getLook() || {x:0,y:0}};
    if(e.pointerType!=='touch')els.canvas.setPointerCapture?.(e.pointerId);
  });
  els.stage.addEventListener('pointermove',e=>{
    if(!gesture){if(e.pointerType!=='touch'&&state.ready)state.scene?.hover?.(e.clientX,e.clientY);return;}
    if(e.pointerId!==gesture.id)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.hypot(dx,dy)>6){gesture.moved=true;suppress();}
    if(gesture.moved && gesture.type!=='touch' && state.ready){
      const r=els.stage.getBoundingClientRect();
      state.scene.setPointer(gesture.look.x-dx/r.width*2,gesture.look.y-dy/r.height*2);
    }
  });
  els.stage.addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    const g=gesture;gesture=null;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(g.moved || Math.hypot(dx,dy)>6)suppress();
    if(els.canvas.hasPointerCapture?.(e.pointerId))els.canvas.releasePointerCapture(e.pointerId);
  });
  els.stage.addEventListener('pointercancel',()=>{if(gesture)suppress();gesture=null;});
  els.stage.addEventListener('click',e=>{
    if(suppressClick){e.preventDefault();e.stopPropagation();return;}
    if(!control(e.target) && state.ready){const id=state.scene?.hitTest?.(e.clientX,e.clientY);if(id&&current().hotspots.includes(id)){action(id);return;}}
  },true);
}

export async function init() {
  const byId=id=>document.getElementById(id);
  els={intro:byId('intro'),showroom:byId('showroom'),title:byId('showroom-title'),stage:byId('stage'),canvas:byId('stage-canvas'),
    hotspots:byId('hotspots'),fallback:byId('stage-fallback'),list:byId('fallback-list'),steps:byId('stepper-list'),
    live:byId('stepper-live'),prev:byId('stepper-prev'),next:byId('stepper-next'),status:byId('stage-status'),statusText:byId('stage-status-text'),hint:byId('stage-hint')};
  const still=byId('stage-still');still.style.opacity='1';byId('stage-placeholder').hidden=true;
  layers=[0,1].map(()=>{const layer=document.createElement('div');layer.className='stage-still-layer';still.append(layer);return layer;});
  [state.products,state.map]=await Promise.all([loadProducts(),loadHotspots()]);state.stops=fallbackStops();
  collections=createCollections(els.stage,state.products,direction=>goTo(state.index+direction));
  stepper();renderList();status();
  const introEnter=byId('intro-enter'),introSkip=byId('intro-skip');
  if(introEnter)introEnter.addEventListener('click',enter);
  if(introSkip)introSkip.addEventListener('click',enter);
  const introImage=byId('intro-img');
  if(introImage){const hide=()=>{introImage.hidden=true;};introImage.addEventListener('error',hide);if(introImage.complete&&!introImage.naturalWidth)hide();}
  els.prev.addEventListener('click',()=>goTo(state.index-1));els.next.addEventListener('click',()=>goTo(state.index+1));
  document.addEventListener('azho:collections-exit',()=>{if(collections?.active){goTo(state.index+1);els.steps.querySelector('[aria-current]')?.focus();}});
  wireGestures();
  window.addEventListener('resize',()=>{if(collections?.active&&state.ready){state.scene.setActive(true);state.scene.setStop(current(),{instant:true});}else if(state.entered&&!state.ready)showStill();});
  onChange(()=>{status();stepper();renderList();makeHotspots();if(!state.ready&&state.entered){showStill();if(state.failed)updateFallback();}else if(state.ready){state.scene.setActive(true);state.scene.setStop(current(),{instant:true});}});
  const ribbon=document.querySelector('.demo-ribbon');
  const measureRibbon=()=>document.documentElement.style.setProperty('--demo-ribbon-height',`${ribbon.getBoundingClientRect().height}px`);
  measureRibbon();if('ResizeObserver' in window)new ResizeObserver(measureRibbon).observe(ribbon);
  // Landing page opens directly into the showroom at stop A (or ?stop=).
  await enter();
}
