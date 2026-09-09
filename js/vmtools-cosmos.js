(function(){
'use strict';
window.VMToolsCosmos={mount(host){
 const canvas=host.querySelector('.vm-cosmos'),ctx=canvas.getContext('2d');
 if(!ctx)return {draw(){},pulse(){},destroy(){}};
 const reduced=matchMedia('(prefers-reduced-motion:reduce)'),listeners=[],pointers=new Map(),waves=[];
 let visible=false,raf=0,last=0,phase=0,scroll=0,width=0,height=0,rect=null;
 const random=n=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v);};
 const stars=Array.from({length:860},(_,i)=>({angle:random(i+2)*Math.PI*2,r:random(i+1042),q:random(i+2789),size:.45+random(i+519)*1.2,ox:0,oy:0,vx:0,vy:0,field:i<260}));
 const on=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
 function stop(){cancelAnimationFrame(raf);raf=0;last=0;}
 function wake(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
 function measure(){rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);wake();}
 function pointer(e){if(reduced.matches)return;rect=canvas.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-rect.left,y:e.clientY-rect.top});wake();}
 function release(e){pointers.delete(e.pointerId);}
 // Listen above links/images as well as empty space; never capture pointers or prevent page scrolling.
 on(host,'pointermove',pointer,{passive:true});on(host,'pointerdown',pointer,{passive:true});
 on(host,'pointerleave',release,{passive:true});on(host,'pointercancel',release,{passive:true});
 on(host,'pointerup',e=>{if(e.pointerType!=='mouse')release(e);},{passive:true});
 function pulse(target){if(reduced.matches)return;const r=canvas.getBoundingClientRect(),b=target.getBoundingClientRect();waves.push({x:b.left+b.width/2-r.left,y:b.top+b.height/2-r.top,age:0});if(waves.length>4)waves.shift();wake();}
 function blackHole(cx,cy,hole,light){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.2+scroll*.025);
  const halo=ctx.createRadialGradient(0,0,hole*.8,0,0,hole*5.6);
  halo.addColorStop(0,light?'#8da7d170':'#aac8ff77');halo.addColorStop(.26,light?'#94b1d840':'#4374c550');halo.addColorStop(1,'transparent');
  ctx.fillStyle=halo;ctx.fillRect(-hole*6,-hole*6,hole*12,hole*12);
  // Thin accretion layers and the lensed arc create a light-warping void rather than a planet outline.
  for(let i=50;i>=0;i--){const r=hole*(1.25+i*.074);ctx.strokeStyle=light?`rgba(59,102,165,${.028+(50-i)*.0018})`:`rgba(${i<15?'226,233,255':'126,176,248'},${.02+(50-i)*.002})`;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(0,0,r,r*.22,0,0,Math.PI*2);ctx.stroke();}
  ctx.shadowColor=light?'#658bbc':'#9abfff';ctx.shadowBlur=16;ctx.strokeStyle=light?'#6989b7':'#d2e5ff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-hole*.02,hole*1.27,hole*1.15,0,Math.PI,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
  const edge=ctx.createRadialGradient(0,0,hole*.84,0,0,hole*1.12);edge.addColorStop(0,'#03060c');edge.addColorStop(.65,'#03060c');edge.addColorStop(.86,light?'#617b9d':'#7d9dca');edge.addColorStop(1,'transparent');ctx.fillStyle=edge;ctx.beginPath();ctx.arc(0,0,hole*1.12,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.scale(1,.14);const disk=ctx.createRadialGradient(0,0,hole*.08,0,0,hole*4.8);disk.addColorStop(0,'#fff4e5bd');disk.addColorStop(.19,'#dbe8ff8c');disk.addColorStop(.42,'#a6c9f547');disk.addColorStop(1,'transparent');ctx.fillStyle=disk;ctx.beginPath();ctx.arc(0,0,hole*4.8,0,Math.PI*2);ctx.fill();ctx.restore();
  for(let i=0;i<110;i++){const r=hole*(1.3+random(i+663)*3.3),a=i*2.39996+phase*(.3+hole/r),x=Math.cos(a)*r,y=Math.sin(a)*r*.19;if(y<0&&Math.abs(x)<hole)continue;ctx.fillStyle=light?'#7796c082':'#d6e9ff9c';ctx.beginPath();ctx.arc(x,y,.4+random(i+900)*.7,0,Math.PI*2);ctx.fill();}

  ctx.restore();
 }
 function render(dt){
  ctx.clearRect(0,0,width,height);const light=host.dataset.vmTheme==='light',mobile=width<760;
  const cx=width*(mobile?.64:.32),cy=100,hole=mobile?30:44,outer=mobile?width*.85:width*.62;
  blackHole(cx,cy,hole,light);
  const step=dt*60,damping=Math.pow(.87,step),strength=reduced.matches?0:1;
  for(const s of stars){
   const angle=s.angle+phase*(.08+.14/(s.r+.3));
   const radius=hole*1.8+Math.sqrt(s.r)*outer;
   let bx,by;
   if(s.field){bx=s.r*width+Math.sin(phase*.14+s.angle)*8;by=s.q*height+Math.cos(phase*.1+s.angle)*8;}
   else{const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*(.25+s.q*.22);bx=cx+x*.98+y*.2;by=cy-x*.2+y*.98;}
   if(strength){
    s.vx+=-s.ox*.022*step;s.vy+=-s.oy*.022*step;
    for(const p of pointers.values()){const dx=bx+s.ox-p.x,dy=by+s.oy-p.y,d=Math.hypot(dx,dy),reach=mobile?100:145;if(d<reach){const force=(1-d/reach)**2*2.8*step;s.vx+=dx/(d||1)*force;s.vy+=dy/(d||1)*force;}}
    for(const w of waves){const dx=bx-w.x,dy=by-w.y,d=Math.hypot(dx,dy),front=w.age*530;if(Math.abs(d-front)<90){const f=(1-Math.abs(d-front)/90)*2.5*step*(1-w.age/2.8);s.vx+=dx/(d||1)*f;s.vy+=dy/(d||1)*f;}}
    s.vx*=damping;s.vy*=damping;s.ox+=s.vx*step;s.oy+=s.vy*step;
   }
   const x=bx+s.ox,y=by+s.oy;if(x<0||x>width||y<0||y>height)continue;
   // Keep the central shadow intact even when nearby stars respond to a pointer.
   if(Math.hypot(x-cx,y-cy)<hole*1.03)continue;
   const energy=Math.min(1,Math.hypot(s.vx,s.vy)*.3),alpha=(s.field?.14:.26)+s.q*.3+energy*.3;
   const rgb=light?'54,94,152':s.q>.87?'244,211,179':'157,192,242';ctx.fillStyle=`rgba(${rgb},${alpha})`;ctx.beginPath();ctx.arc(x,y,s.size+energy*.5,0,Math.PI*2);ctx.fill();
   if(energy>.15){ctx.strokeStyle=`rgba(${rgb},${energy*.36})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-s.vx*3,y-s.vy*3);ctx.stroke();}
  }
 }
 function tick(time){raf=0;if(!visible||document.hidden)return;const dt=last?Math.min((time-last)/1000,.04):1/60;last=time;
  if(!reduced.matches){phase+=dt;for(let i=waves.length-1;i>=0;i--){waves[i].age+=dt;if(waves[i].age>2.8)waves.splice(i,1);}}
  render(dt);host.style.setProperty('--vm-scroll-y',reduced.matches?'0px':`${scroll*-7}px`);
  if(!reduced.matches)raf=requestAnimationFrame(tick);else last=0;
 }
 on(window,'scroll',()=>{pointers.clear();if(visible){const r=host.getBoundingClientRect();scroll=Math.max(-1,Math.min(1,(innerHeight*.5-r.top)/innerHeight));wake();}},{passive:true});
 on(document,'visibilitychange',()=>{pointers.clear();stop();if(!document.hidden)wake();});
 on(reduced,'change',()=>{stop();pointers.clear();waves.length=0;for(const s of stars){s.ox=s.oy=s.vx=s.vy=0;}wake();});
 const resize=new ResizeObserver(measure);resize.observe(canvas);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else{pointers.clear();stop();}});observer.observe(host);
 measure();return {draw:wake,pulse,destroy(){stop();resize.disconnect();observer.disconnect();listeners.forEach(off=>off());}};
}};
})();
