(() => {
  'use strict';
  let definition;
  const getDefinition=()=>definition||(definition=fetch('assets/vmgame/scene-layers.json?v=2').then(r=>{if(!r.ok)throw Error('Scene manifest unavailable');return r.json()}));
  async function mount(host){
    const fallback=host.querySelector('.vm-landscape');let moving=true,enabled=true,ready=false,targetX=0,targetY=0,x=0,y=0,raf=0,last=0,layers=[],nativeWidth=1672,nativeHeight=941,overscan=1;
    function apply(){host.style.setProperty('--view-x',x+'px');host.style.setProperty('--view-y',y+'px');}
    function frame(now){raf=0;if(!moving||!enabled||document.hidden||!ready)return;const dt=last?Math.min((now-last)/1000,.1):0;last=now;x+=(targetX-x)*Math.min(1,dt*4);y+=(targetY-y)*Math.min(1,dt*4);apply();if(Math.abs(targetX-x)+Math.abs(targetY-y)>.02)raf=requestAnimationFrame(frame);}
    function request(){if(!raf&&moving&&enabled&&ready&&!document.hidden){last=0;raf=requestAnimationFrame(frame)}}
    function reset(){targetX=targetY=x=y=0;if(raf)cancelAnimationFrame(raf);raf=0;apply()}
    const pointer=e=>{if(e.pointerType!=='mouse'||!moving||!enabled)return;const r=host.getBoundingClientRect(),fit=Math.max(r.width/nativeWidth,r.height/nativeHeight)*overscan;targetX=Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1))*12*fit;targetY=Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1))*4*fit;request()};
    // No device-orientation permissions or continuous fake camera panning.
    document.addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});
    const api={set({motion,enabled:active}={}){if(motion!==undefined)moving=motion;if(active!==undefined)enabled=active;host.classList.toggle('vm-layer-pause',!moving);for(const layer of layers)layer.hidden=!enabled;if(ready)fallback.hidden=enabled;if(!moving||!enabled)reset()}};
    try{const config=await getDefinition();if(!config.layers)return api;const {width,height}=config.canvas||{};if(!(width>0&&height>0))throw Error('Invalid registration');
      const images=await Promise.all(['background','architecture','foreground'].map(async name=>{const src=config.layers[name];if(typeof src!=='string'||!/^assets\/vmgame\/art\/[\w./-]+\.(?:webp|png)$/.test(src)||src.includes('..'))throw Error('Invalid local layer');const img=new Image();img.src=src;img.alt='';img.decoding='async';await img.decode();if(img.naturalWidth!==width||img.naturalHeight!==height)throw Error('Layer registration mismatch');img.className='vm-layer vm-layer-'+name;img.setAttribute('aria-hidden','true');return img}));
      layers=images;api.background=images[0];nativeWidth=width;nativeHeight=height;overscan=Math.max(1,Math.min(1.05,config.overscan||1));host.style.setProperty('--vm-overscan',overscan);for(const img of images)host.append(img);host.dataset.layers='registered';host.dataset.sourceSize=width+'x'+height;ready=true;fallback.hidden=enabled;api.set({motion:moving,enabled});
    }catch(error){host.dataset.layers='fallback';console.warn('VMGame keeps the approved fallback landscape:',error.message)}
    return api;
  }
  window.VMSceneLayers={mount};
})();
