import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js?v=20261113n';

// No light rig: the independent CGI asset contains baked lighting.
export function createScene({canvas, onProject, onRest, onError, onFirstFrame, onSuspend, onProgress}) {
  const stage = canvas.parentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'low-power'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--ivory').trim());
  const camera = new THREE.PerspectiveCamera(45, 1, .05, 250);
  const look = new THREE.Vector3();
  const position = new THREE.Vector3();
  const frame = {px: 0, py: 1.55, pz: 7, tx: 0, ty: 1.5, tz: 0, fov: 45};
  const hitVolumes=[];let hoverAt=0;
  let model = null, stop = null, active = false, intersecting = true, disposed = false;
  let raf = 0, tween = null, fade = null, lookTween = null, moving = false, cutToken = 0;
  let firstFrame = false, contextUnavailable = false, restoreTimer = 0, pixelCap = 1.75, slowFrames = 0, lastMovingDraw = 0;
  let pointer = {x: 0, y: 0};
  const canRender = () => active && intersecting && !document.hidden && !disposed && !contextUnavailable;

  function paintCamera() {
    camera.position.set(frame.px, frame.py, frame.pz);
    look.set(frame.tx, frame.ty, frame.tz);
    camera.fov = frame.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    if (!moving) {
      // A bounded angular offset, with no continuous animation at rest.
      const yaw = THREE.MathUtils.degToRad(25), pitch = THREE.MathUtils.degToRad(10);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pointer.y * pitch, pointer.x * yaw, 0, 'YXZ'));
      camera.quaternion.multiply(q);
    }
    camera.updateMatrixWorld();
  }
  function project() {
    const results = Object.entries(stop?.hotspotPositions || {}).filter(([,h]) => Array.isArray(h.position)).map(([id,h]) => {
      const v = position.fromArray(h.position).clone().project(camera);
      return {id, x:(v.x+1)/2, y:(1-v.y)/2, visible: !moving && v.z>=-1 && v.z<=1 && Math.abs(v.x)<1 && Math.abs(v.y)<1};
    });
    onProject?.(results);
  }
  function draw() {
    try {drawFrame();} catch(error) {onError?.(error);}
  }
  function drawFrame() {
    raf = 0;
    if (!canRender()) return;
    paintCamera();
    const started=globalThis.performance?.now() || 0;
    try {renderer.render(scene,camera);} catch(error) {onError?.(error);return;}
    if (disposed || contextUnavailable || renderer.getContext?.().isContextLost()) return;
    const elapsed=(globalThis.performance?.now() || 0)-started;
    // Adapt only after repeated expensive draws; idle frames never form a loop.
    const now=globalThis.performance?.now() || 0;
    const interval=moving && lastMovingDraw ? now-lastMovingDraw : 0;
    lastMovingDraw=moving?now:0;
    slowFrames=Math.max(elapsed,interval)>32?slowFrames+1:Math.max(0,slowFrames-1);
    if(slowFrames>=8 && pixelCap>1){pixelCap=Math.max(1,pixelCap-.25);slowFrames=0;resize();return;}
    if(!firstFrame && model && stop){firstFrame=true;onFirstFrame?.();}
    project();
  }
  function requestRender() {
    if (canRender() && !raf) raf = requestAnimationFrame(draw);
  }
  function syncPause() {
    if (canRender()) {tween?.resume(); fade?.resume(); lookTween?.resume(); requestRender();}
    else {lastMovingDraw=0;tween?.pause(); fade?.pause(); lookTween?.pause(); cancelAnimationFrame(raf); raf=0;}
  }
  function resize() {
    const r=stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,pixelCap));
    renderer.setSize(r.width,r.height,false);
    camera.aspect=r.width/r.height;
    if (stop) frame.fov = innerHeight>innerWidth ? (stop.fovMobile || stop.fov) : stop.fov;
    requestRender();
  }
  function onWindowResize() { resize(); if (stop && moving) setStop(stop, {instant:true}); }
  function contextLost(e) {
    e.preventDefault();contextUnavailable=true;firstFrame=false;syncPause();onSuspend?.();
    restoreTimer=setTimeout(()=>{if(!disposed&&contextUnavailable)onError?.(new Error('context-restore-timeout'));},4000);
  }
  function contextRestored() {
    if(disposed)return;
    clearTimeout(restoreTimer);contextUnavailable=false;
    if(stop)setStop(stop,{instant:true});
    resize();syncPause();
  }
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  document.addEventListener('visibilitychange',syncPause);
  window.addEventListener('resize',onWindowResize);
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    intersecting=entries[0].isIntersecting; syncPause();
  },{threshold:.01}) : null;
  observer?.observe(stage);

  async function load(url) {
    const gltf = await new GLTFLoader().loadAsync(url, event => onProgress?.({loaded: event.loaded, total: event.lengthComputable ? event.total : 0}));
    if (disposed) throw new Error('disposed');
    model=gltf.scene;
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      if(mesh.userData.azho_hotspot || mesh.name.startsWith('HIT_')){
        mesh.userData.azho_hotspot ||= mesh.name.slice(4);
        mesh.material=new THREE.MeshBasicMaterial({visible:false});hitVolumes.push(mesh);return;
      }
      if(mesh.userData.azho_glass || mesh.name.startsWith('GLASS_')){
        mesh.material=new THREE.MeshBasicMaterial({color:0xdce9e5,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});
        mesh.renderOrder=10;return;
      }
      const replace = old => {
        const map=old.map || old.emissiveMap || null;
        if (map) map.colorSpace=THREE.SRGBColorSpace;
        const material=new THREE.MeshBasicMaterial({map,
          color:map?0xffffff:(old.color || 0xffffff), transparent:old.transparent,
          opacity:old.opacity, alphaTest:old.alphaTest, side:old.side,
          depthWrite:old.depthWrite, vertexColors:old.vertexColors});
        old.dispose(); return material;
      };
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(replace):replace(mesh.material);
    });
    scene.add(model); resize(); requestRender(); return true;
  }
  function setStop(next,{instant=false}={}) {
    if (!next?.camera || !next?.target) return;
    canvas.style.cursor='';stop=next; lookTween?.kill(); pointer={x:0,y:0}; tween?.kill(); fade?.kill(); cutToken++;
    const target={px:next.camera[0],py:next.camera[1],pz:next.camera[2],
      tx:next.target[0],ty:next.target[1],tz:next.target[2],
      fov:innerHeight>innerWidth?(next.fovMobile||next.fov):next.fov};
    const finish=()=>{moving=false; onRest?.(true); requestRender();};
    moving=true; onRest?.(false);
    if (instant) {canvas.style.opacity='';Object.assign(frame,target); finish();}
    else if (reduced) {
      const token=cutToken;
      canvas.style.opacity='0'; Object.assign(frame,target); requestRender();
      // Cut under a short fade instead of moving the camera.
      fade=window.gsap.to(canvas,{opacity:1,duration:.2,ease:'none',onComplete:()=>{if(token===cutToken)finish();}});
      syncPause();
    } else {
      tween=window.gsap.to(frame,{...target,duration:1.6,ease:'power2.inOut',onUpdate:requestRender,onComplete:finish});
      syncPause();
    }
  }
  function setPointer(x,y) {
    if(moving) return;
    lookTween?.kill();
    const target={x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))};
    if(reduced){Object.assign(pointer,target);requestRender();return;}
    lookTween=window.gsap.to(pointer,{...target,duration:.18,ease:'power2.out',onUpdate:requestRender});
    syncPause();
  }

  let raycaster=null;
  function hitTest(x,y){
    if(!firstFrame||moving||lookTween?.isActive?.()||disposed||contextUnavailable||document.hidden||!intersecting||!hitVolumes.length)return null;
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
    raycaster ||= new THREE.Raycaster();
    raycaster.setFromCamera({x:(x-r.left)/r.width*2-1,y:1-(y-r.top)/r.height*2},camera);
    const candidates=hitVolumes.filter(m=>Object.hasOwn(stop?.hotspotPositions||{},m.userData.azho_hotspot));
    return raycaster.intersectObjects(candidates,false)[0]?.object.userData.azho_hotspot||null;
  }
  function hover(x,y){const now=performance.now();if(now-hoverAt<80)return;hoverAt=now;canvas.style.cursor=hitTest(x,y)?'pointer':'';}
  function clearHover(){canvas.style.cursor='';}
  canvas.addEventListener('pointerleave',clearHover);
  function setActive(value) {active=value; if(active)resize(); syncPause();}
  function dispose() {
    if(disposed)return;disposed=true;clearTimeout(restoreTimer);lookTween?.kill();tween?.kill();fade?.kill();cancelAnimationFrame(raf);observer?.disconnect();
    document.removeEventListener('visibilitychange',syncPause);window.removeEventListener('resize',onWindowResize);
    canvas.removeEventListener('pointerleave',clearHover);
    canvas.removeEventListener('webglcontextlost',contextLost);
    canvas.removeEventListener('webglcontextrestored',contextRestored);
    const textures=new Set();
    model?.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const mat of(Array.isArray(mesh.material)?mesh.material:[mesh.material])){if(mat.map)textures.add(mat.map);mat.dispose();}}});
    textures.forEach(texture=>texture.dispose());renderer.dispose();
  }
  resize();
  return {hitTest,hover,load,setStop,setPointer,getLook:()=>({...pointer}),setActive,dispose,get ready(){return !!model;}};
}
