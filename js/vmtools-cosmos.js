(function(){
'use strict';
window.VMToolsCosmos={mount(host){
 const backdrop=host.querySelector('.vm-cosmos'),canvas=host.querySelector('.vm-orbit-canvas'),scene=host.querySelector('.vm-orbit-scene'),button=host.querySelector('.vm-motion'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
 const contexts=[backdrop.getContext('2d'),canvas.getContext('2d')];
 let active=!reduce.matches,visible=false,raf=0,last=0,phase=0,yaw=-.3,tilt=.48,zoom=1,scroll=0,pinch=null,dirty=true;
 const points=new Map(),listeners=[];const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const stars=Array.from({length:1000},(_,i)=>{const q=Math.abs(Math.sin(i*127.1+31.7)*43758.5453)%1;return {angle:i*2.399963,r:.18+Math.sqrt((i+.5)/1000)*.82,q,size:i%73===0?1.8:.35+q*.85};});
 const on=(target,name,fn,opts)=>{target.addEventListener(name,fn,opts);listeners.push(()=>target.removeEventListener(name,fn,opts));};
 function sync(){button.setAttribute('aria-pressed',String(active));button.textContent=active?'Ⅱ Tạm dừng':'▷ Phát hiệu ứng';scene.dataset.zoom=zoom.toFixed(3);scene.dataset.yaw=yaw.toFixed(3);scene.dataset.tilt=tilt.toFixed(3);}
 function wake(){dirty=true;if(!raf&&!document.hidden&&visible)raf=requestAnimationFrame(tick);}
 function stop(){cancelAnimationFrame(raf);raf=0;last=0;}
 function render(c,ctx,detail){
  if(!ctx)return;const width=c.clientWidth,height=c.clientHeight;if(!width||!height)return;
  const dpr=Math.min(devicePixelRatio||1,1.5);if(c.width!==Math.round(width*dpr)||c.height!==Math.round(height*dpr)){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const light=host.dataset.vmTheme==='light',cx=detail?width*.72:width*.55,cy=detail?height*.25:Math.min(height*.4,330),radius=(detail?Math.min(width*.46,height*.72):Math.min(width*.64,640))*zoom;
  const halo=ctx.createRadialGradient(cx,cy,radius*.02,cx,cy,radius*1.1);halo.addColorStop(0,light?'#6488bd66':'#8ab8ed55');halo.addColorStop(.4,light?'#a6c6f344':'#334e9466');halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(yaw+scroll*.15);
  for(let i=0;i<stars.length;i++){
   if(!detail&&i%2)continue;const s=stars[i],a=s.angle+s.r*5+phase*(.24+.35/(s.r+.2)),x=Math.cos(a)*s.r*radius,y=Math.sin(a)*s.r*radius*tilt;
   const alpha=(.2+s.q*.7)*(detail?1:.55),rgb=light?'38,83,142':s.q>.84?'255,214,168':'168,207,255';ctx.fillStyle=`rgba(${rgb},${alpha})`;ctx.beginPath();ctx.arc(x,y,s.size*(detail?1:.85),0,Math.PI*2);ctx.fill();
   if(s.size>1.7){ctx.shadowColor=light?'#417fc9':'#b6d8ff';ctx.shadowBlur=8;ctx.fillRect(x-3,y-.4,6,.8);ctx.fillRect(x-.4,y-3,.8,6);ctx.shadowBlur=0;}
  }
  if(detail){
   const hole=radius*.15;
   // A dark silhouette and a luminous accretion ring stay visible at every viewing angle.
   ctx.shadowColor='#93bbff';ctx.shadowBlur=14;ctx.strokeStyle=light?'#587fb7':'#b4d8ff';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(0,0,hole*1.9,hole*(.45+tilt*.65),0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
   const glow=ctx.createRadialGradient(0,0,hole*.86,0,0,hole*1.3);glow.addColorStop(0,'#050912');glow.addColorStop(.77,'#070c17');glow.addColorStop(.85,'#d4e6ff');glow.addColorStop(.92,'#799fd766');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,hole*1.3,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#edc49d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,hole*2.3,hole*(.32+tilt*.55),0,0,Math.PI);ctx.stroke();
  }
  ctx.restore();
 }
 function tick(time){raf=0;if(!visible||document.hidden)return;const dt=last?Math.min((time-last)/1000,.05):0;last=time;if(active){phase+=dt*.45;dirty=true;}if(dirty){render(backdrop,contexts[0],false);render(canvas,contexts[1],true);dirty=false;host.style.setProperty('--vm-scroll-y',active?`${scroll*-9}px`:'0px');}if(active)raf=requestAnimationFrame(tick);else last=0;}
 function changeZoom(factor){zoom=clamp(zoom*factor,.55,2.6);sync();wake();}
 function reset(){yaw=-.3;tilt=.48;zoom=1;sync();wake();}
 const pair=()=>{const a=[...points.values()];return a.length>=2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):null;};
 on(canvas,'pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=pair();canvas.classList.add('dragging');});
 on(canvas,'pointermove',e=>{const old=points.get(e.pointerId);if(!old)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size>=2){const distance=pair();if(pinch>5&&distance>5)changeZoom(distance/pinch);pinch=distance;}else{yaw+=(e.clientX-old.x)*.008;tilt=clamp(tilt+(e.clientY-old.y)*.004,.15,.92);sync();wake();}});
 const end=e=>{points.delete(e.pointerId);pinch=pair();if(!points.size)canvas.classList.remove('dragging');};on(canvas,'pointerup',end);on(canvas,'pointercancel',end);on(canvas,'lostpointercapture',end);
 on(canvas,'wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);changeZoom(Math.exp(-clamp(delta,-160,160)*.0025));},{passive:false});
 on(canvas,'keydown',e=>{let handled=true;if(e.key==='ArrowLeft')yaw-=.12;else if(e.key==='ArrowRight')yaw+=.12;else if(e.key==='ArrowUp')tilt=clamp(tilt-.06,.15,.92);else if(e.key==='ArrowDown')tilt=clamp(tilt+.06,.15,.92);else if(['+','='].includes(e.key))changeZoom(1.15);else if(e.key==='-')changeZoom(1/1.15);else if(e.key==='0')reset();else handled=false;if(handled){e.preventDefault();sync();wake();}});
 on(host.querySelector('[data-orbit-zoom="in"]'),'click',()=>changeZoom(1.2));on(host.querySelector('[data-orbit-zoom="out"]'),'click',()=>changeZoom(1/1.2));on(host.querySelector('[data-orbit-reset]'),'click',reset);
 on(button,'click',()=>{active=!active;sync();stop();wake();});on(reduce,'change',()=>{active=!reduce.matches;sync();stop();wake();});
 on(window,'scroll',()=>{if(visible){const r=host.getBoundingClientRect();scroll=clamp((innerHeight*.5-r.top)/innerHeight,-1,1);if(active)wake();}},{passive:true});
 on(document,'visibilitychange',()=>{stop();if(!document.hidden)wake();});
 const resize=new ResizeObserver(wake);resize.observe(host);resize.observe(scene);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else stop();});observer.observe(host);
 sync();return {draw:wake,destroy(){stop();resize.disconnect();observer.disconnect();listeners.forEach(off=>off());}};
}};
})();
