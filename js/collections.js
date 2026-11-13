import {t,localized,formatPrice,onChange} from './i18n.js?v=20261113n';
import {isPublished,catalogPrice} from './store.js?v=20261113n';
import {openProductDialog} from './overlay.js?v=20261113n';

// Stable buttons preserve dialog return focus and a single roving Tab stop.
export function createCollections(stage,products,leave) {
  const list=products.filter(isPublished);
  let index=Math.floor(list.length/2),active=false,hideTimer=0,wheelAt=0,start=null,suppressUntil=0;
  const root=document.createElement('section');root.id='collections-rail';root.className='collections-rail';root.hidden=true;root.inert=true;
  const title=document.createElement('h2'),rod=document.createElement('div'),track=document.createElement('div'),caption=document.createElement('div'),live=document.createElement('p');
  title.className='rail-title';rod.className='rail-rod';rod.setAttribute('aria-hidden','true');track.className='rail-track';track.setAttribute('role','group');
  caption.className='rail-caption';live.className='visually-hidden';live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
  const buttons=list.map((p,i)=>{
    const b=document.createElement('button');b.type='button';b.className='rail-item';b.dataset.slug=p.slug;
    const hook=document.createElement('span');hook.className='rail-hook';hook.setAttribute('aria-hidden','true');
    const frame=document.createElement('span');frame.className='rail-portrait';
    const img=document.createElement('img');img.width=800;img.height=1000;img.alt='';img.decoding='async';img.dataset.src=p.images[0]||'';
    frame.append(img);b.append(hook,frame);
    b.addEventListener('click',()=>{if(performance.now()<suppressUntil)return;if(i===index)open();else select(i);});
    b.addEventListener('mouseenter',()=>captionFor(i));b.addEventListener('mouseleave',()=>captionFor(index));
    track.append(b);return b;
  });
  const prev=document.createElement('button'),next=document.createElement('button');
  for(const b of [prev,next]){b.type='button';b.className='rail-arrow';}
  prev.classList.add('rail-prev');next.classList.add('rail-next');
  prev.addEventListener('click',()=>select(index-1,true));next.addEventListener('click',()=>select(index+1,true));
  root.append(title,rod,track,prev,next,caption,live);stage.append(root);
  const rtl=()=>document.documentElement.dir==='rtl';
  function captionFor(i){const p=list[i];caption.replaceChildren();if(!p)return;
    const name=document.createElement('h3'),price=document.createElement('p');name.textContent=localized(p.name);
    if(p.regularPrice>catalogPrice(p)){const del=document.createElement('del');del.textContent=formatPrice(p.regularPrice);price.append(del,' ');}
    price.append(formatPrice(catalogPrice(p)));caption.append(name,price);
  }
  function select(n,focus=false){index=Math.max(0,Math.min(list.length-1,n));
    buttons.forEach((b,i)=>{const d=i-index;b.style.setProperty('--rail-offset',String(d*(rtl()?-1:1)));b.style.setProperty('--rail-depth',String(Math.min(Math.abs(d),3)));b.style.zIndex=String(10-Math.abs(d));b.tabIndex=i===index?0:-1;
      b.setAttribute('aria-current',String(i===index));b.setAttribute('aria-label',localized(list[i].name)+', '+formatPrice(catalogPrice(list[i])));
      const img=b.querySelector('img');if(Math.abs(d)<=2&&!img.getAttribute('src')){img.loading=Math.abs(d)<=1?'eager':'lazy';if(img.dataset.src)img.src=img.dataset.src;}
    });
    prev.disabled=index<=0;next.disabled=index>=list.length-1;captionFor(index);
    live.textContent=list[index]?t('rail.announcement',{name:localized(list[index].name),price:formatPrice(catalogPrice(list[index])),n:index+1,total:list.length}):t('cart.empty');
    if(focus)buttons[index]?.focus({preventScroll:true});
  }
  function open(){if(list[index])openProductDialog(list[index],{collections:true,products:list});}
  function key(e){if(!active||document.querySelector('dialog[open]')||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea')||e.target.closest('.site-header,.stepper,.hotspot'))return false;
    if(['ArrowLeft','ArrowRight','Home','End','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();
      if(e.key==='Enter')open();else if(e.key==='Escape')leave(1);else select(e.key==='Home'?0:e.key==='End'?list.length-1:index+((e.key==='ArrowRight')!==rtl()?1:-1),true);return true;}return false;
  }
  root.addEventListener('wheel',e=>{if(!active||e.ctrlKey)return;e.stopPropagation();const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY),delta=horizontal?e.deltaX:e.deltaY;
    if(Math.abs(delta)<2)return;
    const dir=horizontal?Math.sign(delta)*(rtl()?-1:1):Math.sign(delta);
    // Interior vertical scroll stays native; only outward endpoint motion changes zones.
    if(!horizontal&&!((index===0&&dir<0)||(index===list.length-1&&dir>0)))return;
    e.preventDefault();if(performance.now()-wheelAt<700)return;wheelAt=performance.now();if(horizontal)select(index+dir);else leave(dir);
  },{passive:false});
  root.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.isPrimary&&e.button===0)start={id:e.pointerId,x:e.clientX,y:e.clientY};});
  root.addEventListener('pointermove',e=>{e.stopPropagation();if(start&&Math.abs(e.clientX-start.x)>8)suppressUntil=performance.now()+350;});
  root.addEventListener('pointerup',e=>{e.stopPropagation();if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.25){suppressUntil=performance.now()+350;select(index+((dx<0)!==rtl()?1:-1),true);}});
  root.addEventListener('pointercancel',()=>{start=null;});
  function translate(){title.textContent=t('rail.label');track.setAttribute('aria-label',t('rail.label'));prev.setAttribute('aria-label',t('rail.prev'));next.setAttribute('aria-label',t('rail.next'));prev.textContent=rtl()?'→':'←';next.textContent=rtl()?'←':'→';select(index);}
  onChange(translate);translate();
  return {key,setActive(value){active=value;clearTimeout(hideTimer);root.inert=!value;stage.classList.toggle('has-collections',value);
    if(value){root.hidden=false;requestAnimationFrame(()=>root.classList.add('is-visible'));}
    else {root.classList.remove('is-visible');hideTimer=setTimeout(()=>{root.hidden=true;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:500);}
  },get active(){return active;}};
}
