(function () {
  'use strict';
  // Orthonormal camera rows preserve the circular silhouette of a sphere.
  function project(x,y,z){return [(y-x)/Math.sqrt(2),(x+y-2*z)/Math.sqrt(6)];}
  // Textbook coordinate-arrow layout is a schematic overlay, not the camera basis.
  function axisLayout(x,y,z){return [y-.5*x,.5*x-z];}
  function spherePoint(lat,lon){return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];}
  function circlePoint(a){return [Math.cos(a),Math.sin(a)];}
  function tangent(t,x){return 2*t*x-t*t;}
  function assemblyProgress(current,delta,viewport){return Math.max(0,Math.min(1,current+delta/Math.max(1,viewport*.95)));}
  var phi=(1+Math.sqrt(5))/2,polyVertices=[];
  [-1,1].forEach(function(a){[-1,1].forEach(function(b){polyVertices.push([0,a,b*phi],[a,b*phi,0],[b*phi,0,a]);});});
  var polyEdges=[];polyVertices.forEach(function(a,i){polyVertices.forEach(function(b,j){if(j>i&&Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])-2)<1e-8)polyEdges.push([i,j]);});});
  function rotate3D(v,ry,rx){var x=v[0]*Math.cos(ry)-v[2]*Math.sin(ry),z=v[0]*Math.sin(ry)+v[2]*Math.cos(ry);return [x,v[1]*Math.cos(rx)-z*Math.sin(rx),v[1]*Math.sin(rx)+z*Math.cos(rx)];}
  function surfacePoint(kind,u,v){
    if(kind==='torus'){var r=.95+.34*Math.cos(v);return [r*Math.cos(u),r*Math.sin(u),.34*Math.sin(v)];}
    var a=1+v*.34*Math.cos(u/2);return [a*Math.cos(u),a*Math.sin(u),v*.34*Math.sin(u/2)];
  }
  var surfaceMeshes={torus:[],mobius:[],polyhedron:[]};
  ['torus','mobius'].forEach(function(kind){var rows=kind==='torus'?10:6;for(var i=0;i<32;i++)for(var j=0;j<rows;j++){var u=i/32*Math.PI*2,u1=(i+1)/32*Math.PI*2,v=kind==='torus'?j/rows*Math.PI*2:-1+2*j/rows,v1=kind==='torus'?(j+1)/rows*Math.PI*2:-1+2*(j+1)/rows;surfaceMeshes[kind].push([surfacePoint(kind,u,v),surfacePoint(kind,u1,v),surfacePoint(kind,u1,v1),surfacePoint(kind,u,v1)]);}});
  function adjacent(a,b){return Math.abs(Math.hypot(...polyVertices[a].map(function(v,k){return v-polyVertices[b][k];}))-2)<1e-8;}
  for(var i=0;i<12;i++)for(var j=i+1;j<12;j++)for(var k=j+1;k<12;k++)if(adjacent(i,j)&&adjacent(j,k)&&adjacent(i,k))surfaceMeshes.polyhedron.push([i,j,k].map(function(n){return polyVertices[n].map(function(v){return v*.68;});}));
  function surfaceFace(kind,index,progress,t){
    var face=surfaceMeshes[kind][index],center=[0,0,0];face.forEach(function(p){p.forEach(function(v,k){center[k]+=v/face.length;});});
    var f=Math.max(0,Math.min(1,progress)),spread=1-f*f*(3-2*f),length=Math.hypot(...center)||1;
    return face.map(function(p){var local=rotate3D(p.map(function(v,k){return v-center[k];}),spread*Math.sin(index*1.7)*.65,spread*Math.cos(index*.7)*.5);return rotate3D(local.map(function(v,k){return v+center[k]+spread*center[k]/length*(.45+.2*Math.sin(index*2.3));}),.4+Math.sin(t*.09)*.2,-.55+Math.cos(t*.075)*.1);});
  }
  function repel(state,x,y,mx,my,dt,active){
    var step=Math.min(dt,.05)*60,damp=Math.pow(.86,step);state.x*=damp;state.y*=damp;
    if(active){var dx=x+state.x-mx,dy=y+state.y-my,d=Math.hypot(dx,dy),reach=145;if(d<reach){var force=Math.pow(1-d/reach,2)*17*step;state.x+=(d?dx/d:1)*force;state.y+=(d?dy/d:0)*force;}}
    return [x+state.x,y+state.y];
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={project:project,axisLayout:axisLayout,spherePoint:spherePoint,circlePoint:circlePoint,tangent:tangent,assemblyProgress:assemblyProgress,polyVertices:polyVertices,polyEdges:polyEdges,surfacePoint:surfacePoint,surfaceMeshes:surfaceMeshes,surfaceFace:surfaceFace,repel:repel};return;}
  var canvas=document.getElementById('homeMathCanvas'),ambient=document.getElementById('homeAmbientCanvas');
  if(!canvas||!ambient)return;
  var ctx=canvas.getContext('2d'),bg=ambient.getContext('2d');if(!ctx||!bg)return;
  var reduced=matchMedia('(prefers-reduced-motion: reduce)'),visible=true,frame=0,last=0,time=.65;
  var width=0,height=0,aw=0,ah=0,pointer={x:.5,y:.5},smooth={x:.5,y:.5},gold,ink,muted,dark,ambientLast=0;
  var scrollTarget=0,scrollBlend=0,assemblyTarget=0,previousScroll=window.scrollY||0,rail=document.querySelector('.home-section-rail');
  var storyKind='torus',storyFrom='torus',storyChanged=-1;
  var mouseActive=false,offsets=[],particleIndex=0,ambientDt=1/30,interactionEnergy=0;
  function reactivePoint(x,y){var state=offsets[particleIndex]||(offsets[particleIndex]={x:0,y:0});particleIndex++;var p=repel(state,x,y,pointer.x*aw,pointer.y*ah,ambientDt,mouseActive&&!reduced.matches);interactionEnergy+=Math.hypot(state.x,state.y);return p;}
  var railLinks=rail?Array.from(rail.querySelectorAll('a')):[],sections=railLinks.map(function(a){return document.querySelector(a.getAttribute('href'));});
  function trackScroll(){
    var range=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    var scrollY=Math.max(0,window.scrollY||0);assemblyTarget=assemblyProgress(assemblyTarget,scrollY-previousScroll,innerHeight);previousScroll=scrollY;
    scrollTarget=Math.max(0,Math.min(1,(window.scrollY||0)/range));
    if(rail){var active=0;sections.forEach(function(el,i){if(el&&el.getBoundingClientRect().top<=innerHeight*.38)active=i;});var nextKind=['torus','torus','mobius','polyhedron','torus','mobius','polyhedron'][active];if(nextKind!==storyKind){storyFrom=storyKind;storyKind=nextKind;storyChanged=time;}rail.style.setProperty('--rail-progress',String(scrollTarget));railLinks.forEach(function(a,i){if(i===active){var changed=!a.hasAttribute('aria-current');a.setAttribute('aria-current','location');if(changed&&innerWidth<=760)rail.scrollTo({left:Math.max(0,a.offsetLeft-rail.clientWidth/2+a.offsetWidth/2),behavior:reduced.matches?'instant':'smooth'});}else a.removeAttribute('aria-current');});}
  }
  function palette(){dark=document.documentElement.dataset.theme==='dark';gold=dark?'#ffb300':'#c47800';ink=dark?'#d9dfe8':'#303947';muted=dark?'#8592a4':'#7b8490';}
  function fit(c,w,h){var dpr=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
  function resize(){var box=canvas.getBoundingClientRect();width=box.width;height=box.height;aw=innerWidth;ah=innerHeight;fit(canvas,width,height);fit(ambient,aw,ah);palette();paint();paintAmbient();}
  function line(points,color,thickness,dash){ctx.strokeStyle=color||gold;ctx.lineWidth=thickness||1;ctx.setLineDash(dash||[]);ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.stroke();ctx.setLineDash([]);}
  function dot(p,r,color){ctx.fillStyle=color||gold;ctx.beginPath();ctx.arc(p[0],p[1],r||3,0,Math.PI*2);ctx.fill();}
  function label(text,x,y,color,size){ctx.fillStyle=color||ink;ctx.font='italic '+(size||18)+'px Georgia';ctx.textAlign='left';ctx.fillText(text,x,y);}
  function arrow(from,to,name){
    line([from,to],muted,1.25);var a=Math.atan2(to[1]-from[1],to[0]-from[0]);
    line([[to[0]-9*Math.cos(a-.4),to[1]-9*Math.sin(a-.4)],to,[to[0]-9*Math.cos(a+.4),to[1]-9*Math.sin(a+.4)]],muted,1.25);
    label(name,to[0]+(to[0]<300?-30:10),to[1]-9,ink,18);
  }
  function sphere(t){
    var radius=160,cx=300,cy=230;
    function p(x,y,z){var v=project(x,y,z);return [cx+radius*v[0],cy+radius*v[1]];}
    function axis(x,y,z){var v=axisLayout(x,y,z);return [cx+radius*v[0],cy+radius*v[1]];}
    [[1,0,0],[0,1,0],[0,0,1]].forEach(function(a){line([axis(-a[0]*1.5,-a[1]*1.5,-a[2]*1.5),axis(0,0,0)],muted+'65',1,[4,6]);});
    function ring(lat,meridian){var points=[];for(var i=0;i<=100;i++){var a=i/100*Math.PI*2,v=meridian?[Math.cos(a)*Math.cos(lat),Math.cos(a)*Math.sin(lat),Math.sin(a)]:spherePoint(lat,a);points.push(p(v[0],v[1],v[2]));}line(points,gold+'38',.8);}
    for(var j=0;j<6;j++)ring(j*Math.PI/6,true);for(var k=-2;k<=2;k++)ring(k*Math.PI/6,false);
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle=gold+'60';ctx.lineWidth=.8;ctx.stroke();
    var rotation=t*.1+(smooth.x-.5)*.24;
    for(var i=0;i<520;i++){var z=1-2*(i+.5)/520,v=spherePoint(Math.asin(z),i*2.399963+rotation),depth=(v[0]+v[1]+v[2])/Math.sqrt(3),alpha=.36+.64*(depth+1)/2;ctx.globalAlpha*=alpha;dot(p(v[0],v[1],v[2]),.8+(depth+1)*.32);ctx.globalAlpha/=alpha;}
    // Paint all arrowheads and all three names last, so no surface hides them.
    arrow(axis(0,0,0),axis(2.5,0,0),'x');arrow(axis(0,0,0),axis(0,1.52,0),'y');arrow(axis(0,0,0),axis(0,0,1.25),'z');
    dot(p(0,0,0),2,ink);label('O',cx-20,cy-9);
  }
  function parabola(t){
    function p(x,y){return [300+x*84,367-y*59];}
    for(var x=-2;x<=2;x++)line([p(x,-.4),p(x,5.3)],muted+'20',.6);
    for(var y=0;y<=5;y++)line([p(-2.7,y),p(2.7,y)],muted+'20',.6);
    arrow(p(-2.8,0),p(2.85,0),'x');arrow(p(0,-.5),p(0,5.4),'y');label('O',280,388);
    var curve=[];for(var u=-2.25;u<=2.251;u+=.025)curve.push(p(u,u*u));line(curve,gold,2.2);
    var a=1.45*Math.sin(t*.3),point=p(a,a*a);
    // Clip a continuous analytical segment, not quantized sampled endpoints.
    ctx.save();ctx.beginPath();ctx.rect(300-2.6*84,367-5.15*59,5.2*84,5.6*59);ctx.clip();
    line([p(-2.6,tangent(a,-2.6)),p(2.6,tangent(a,2.6))],ink,1.5);ctx.restore();
    line([p(a,0),point,p(0,a*a)],muted,1,[4,5]);dot(point,5);label('M',point[0]+12,point[1]-14,gold);
  }
  function geometry(t){
    function p(a){var v=circlePoint(a);return [300+169*v[0],230-169*v[1]];}
    var B=p(7*Math.PI/6),C=p(11*Math.PI/6),A=p(2.12+.22*Math.sin(t*.29)),D=p(.78+.2*Math.sin(t*.24));
    ctx.strokeStyle=gold+'90';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(300,230,169,0,Math.PI*2);ctx.stroke();
    line([B,A,C,B],gold,1.6);line([B,D,C],ink,1.35);line([B,[300,230],C],muted+'80',1,[4,5]);
    function arc(P){var a=Math.atan2(B[1]-P[1],B[0]-P[0]),b=Math.atan2(C[1]-P[1],C[0]-P[0]);ctx.beginPath();ctx.strokeStyle=gold;ctx.arc(P[0],P[1],24,Math.min(a,b),Math.max(a,b));ctx.stroke();}
    arc(A);arc(D);[[A,'A',-20,-14],[B,'B',-23,20],[C,'C',12,20],[D,'D',10,-15]].forEach(function(v){dot(v[0],4);label(v[1],v[0][0]+v[2],v[0][1]+v[3]);});dot([300,230],2,ink);label('O',310,225);
  }
  var scenes=[sphere,parabola,geometry];
  function paint(){
    if(!width||!height)return;ctx.clearRect(0,0,width,height);ctx.save();var scale=Math.min(width/600,height/460);
    ctx.translate((width-600*scale)/2,(height-460*scale)/2);ctx.scale(scale,scale);
    var cycle=reduced.matches?0:time%42,index=Math.floor(cycle/14),phase=cycle%14;
    // Only the illustration fades: the navigation and text never fade.
    ctx.globalAlpha=reduced.matches||time===0?1:Math.min(1,phase/.65,(14-phase)/.65);
    scenes[index](time);canvas.dataset.scene=String(index);ctx.restore();
  }
  function paintAmbient(){
    bg.clearRect(0,0,aw,ah);particleIndex=0;interactionEnergy=0;var n=aw<600?30:60,points=[],space=[],edgeCount=0;
    // Restore the old 3D proximity network: real depth, straight edges and mouse tilt/repulsion.
    for(var i=0;i<n;i++){var v=rotate3D([Math.sin(i*127.1+time*.014),Math.sin(i*311.7+time*.011),Math.sin(i*74.7+time*.017)],time*.035+(smooth.x-.5)*.45,(smooth.y-.5)*.35),persp=2.7/(2.7-v[2]);space.push(v);points.push(reactivePoint(aw*.5+v[0]*persp*aw*.55,ah*.5+v[1]*persp*ah*.55));}
    bg.lineWidth=.85;
    points.forEach(function(p,i){for(var j=i+1;j<points.length;j++){var a=space[i],b=space[j],d=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);if(d<.68){var alpha=(.025+.13*(1-d/.68));bg.strokeStyle=(dark?'rgba(164,181,209,':'rgba(65,88,120,')+alpha+')';bg.beginPath();bg.moveTo(p[0],p[1]);bg.lineTo(points[j][0],points[j][1]);bg.stroke();edgeCount++;}}bg.fillStyle=i%5===0?(dark?'#ffb30088':'#a66b0070'):(dark?'#c3cede60':'#36527350');bg.beginPath();bg.arc(p[0],p[1],i%5===0?1.8:1.2,0,Math.PI*2);bg.fill();});
    var assembly=reduced.matches?1:scrollBlend;
    function drawSurface(kind,opacity){
      if(opacity<.001)return;var size=Math.min(aw*.29,ah*.31),cx=aw*(aw<700?.57:.76),cy=ah*.55;
      var faces=surfaceMeshes[kind].map(function(_,i){var p=surfaceFace(kind,i,assembly,time);return {p:p,z:p.reduce(function(s,v){return s+v[2]/p.length;},0)};}).sort(function(a,b){return a.z-b.z;});
      bg.save();bg.globalAlpha=opacity*.5*Math.min(1,previousScroll/(ah*.65));bg.lineWidth=.65;
      faces.forEach(function(face){var p=face.p,depth=Math.max(0,Math.min(1,(face.z+2)/4)),a=p[1].map(function(v,k){return v-p[0][k];}),b=p[2].map(function(v,k){return v-p[0][k];}),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],light=Math.min(1,Math.abs(normal[0]*.35-normal[1]*.5+normal[2]*.79)/(Math.hypot(...normal)||1)),shade=Math.round(90+light*130);bg.fillStyle=dark?'rgba('+shade+','+Math.round(shade*.65)+',12,'+(.07+light*.21)+')':'rgba(160,102,12,'+(.035+light*.09)+')';bg.strokeStyle=dark?'rgba(255,187,68,'+(.12+depth*.2)+')':'rgba(158,104,19,'+(.1+depth*.14)+')';bg.beginPath();p.forEach(function(v,i){var x=cx+v[0]*size,y=cy+v[1]*size;if(i)bg.lineTo(x,y);else bg.moveTo(x,y);});bg.closePath();bg.fill();bg.stroke();});bg.restore();
    }
    var transition=reduced.matches?1:Math.max(0,Math.min(1,(time-storyChanged)/.75));drawSurface(storyFrom,1-transition);drawSurface(storyKind,transition);
    ambient.dataset.assembly=assembly.toFixed(3);ambient.dataset.shape=storyKind;ambient.dataset.networkEdges=String(edgeCount);
    // A bounded set of peripheral mathematical objects, never a full-screen mesh.
    function ambientSphere(cx,cy,r){
      var count=aw<700?100:200;
      for(var k=0;k<count;k++){var v=spherePoint(Math.asin(1-2*(k+.5)/count),k*2.399963+time*.12),depth=(v[1]+1)/2,p=reactivePoint(cx+r*v[0]+(smooth.x-.5)*14,cy+r*v[2]+(smooth.y-.5)*14);bg.fillStyle=k%4===0?(dark?'#ffb300':'#ad7100'):(dark?'#a5b3c1':'#786b53');bg.globalAlpha=.12+depth*.32;bg.beginPath();bg.arc(p[0],p[1],k%4===0?1.3+depth:.8+depth*.5,0,Math.PI*2);bg.fill();}bg.globalAlpha=1;
    }
    ambientSphere(aw*.11,ah*.4,Math.min(aw*.15,145));
    if(aw>=700)ambientSphere(aw*.91,ah*.8,Math.min(aw*.12,175));
    ambient.dataset.interaction=interactionEnergy.toFixed(1);
  }
  function tick(now){frame=0;if(document.hidden||reduced.matches)return;var dt=last?Math.min((now-last)/1000,.05):0;time+=dt;last=now;var ease=1-Math.exp(-dt*8);smooth.x+=(pointer.x-smooth.x)*ease;smooth.y+=(pointer.y-smooth.y)*ease;scrollBlend+=(assemblyTarget-scrollBlend)*(1-Math.exp(-dt*8));if(visible)paint();if(now-ambientLast>=33){ambientDt=ambientLast?Math.min((now-ambientLast)/1000,.05):1/30;paintAmbient();ambientLast=now;}frame=requestAnimationFrame(tick);}
  function restart(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;palette();paint();paintAmbient();if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);}
  window.addEventListener('pointermove',function(e){mouseActive=true;pointer.x=e.clientX/aw;pointer.y=e.clientY/ah;},{passive:true});
  window.addEventListener('pointerdown',function(e){mouseActive=true;pointer.x=e.clientX/aw;pointer.y=e.clientY/ah;},{passive:true});
  window.addEventListener('pointerout',function(e){if(!e.relatedTarget)mouseActive=false;},{passive:true});
  window.addEventListener('pointerup',function(e){if(e.pointerType==='touch')mouseActive=false;},{passive:true});window.addEventListener('pointercancel',function(){mouseActive=false;},{passive:true});
  window.addEventListener('resize',resize,{passive:true});new ResizeObserver(resize).observe(canvas.parentElement);
  window.addEventListener('scroll',trackScroll,{passive:true});window.addEventListener('resize',trackScroll,{passive:true});new ResizeObserver(trackScroll).observe(document.body);trackScroll();
  new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;},{threshold:.01}).observe(canvas);
  new MutationObserver(restart).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',restart);
  window.addEventListener('pagehide',function(){if(frame)cancelAnimationFrame(frame);});window.addEventListener('pageshow',restart);
  var tryLink=document.getElementById('homeTry');if(tryLink)tryLink.addEventListener('click',function(){sessionStorage.setItem('vm-guest-mode','true');});
  if(!reduced.matches){document.body.classList.add('home-motion-enabled');var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('is-pending');io.unobserve(e.target);}});},{threshold:.08});document.querySelectorAll('.home-reveal').forEach(function(el){if(el.getBoundingClientRect().top>innerHeight){el.classList.add('is-pending');io.observe(el);}});}
  resize();restart();
})();
