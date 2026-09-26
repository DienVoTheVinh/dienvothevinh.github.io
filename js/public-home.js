(function () {
  'use strict';
  // Cabinet-style oblique projection: x down-left, y right, z up.
  // Apply the same linear map to both the sphere and its coordinate axes.
  function project(x,y,z){return [y-.5*x,.5*x-z];}
  function spherePoint(lat,lon){return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];}
  function circlePoint(a){return [Math.cos(a),Math.sin(a)];}
  function tangent(t,x){return 2*t*x-t*t;}
  if(typeof module!=='undefined'&&module.exports){module.exports={project:project,spherePoint:spherePoint,circlePoint:circlePoint,tangent:tangent};return;}
  var canvas=document.getElementById('homeMathCanvas'),ambient=document.getElementById('homeAmbientCanvas');
  if(!canvas||!ambient)return;
  var ctx=canvas.getContext('2d'),bg=ambient.getContext('2d');if(!ctx||!bg)return;
  var reduced=matchMedia('(prefers-reduced-motion: reduce)'),visible=true,frame=0,last=0,time=.65;
  var width=0,height=0,aw=0,ah=0,pointer={x:.5,y:.5},smooth={x:.5,y:.5},gold,ink,muted,dark,ambientLast=0;
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
    [[1,0,0],[0,1,0],[0,0,1]].forEach(function(a){line([p(-a[0]*1.5,-a[1]*1.5,-a[2]*1.5),p(0,0,0)],muted+'65',1,[4,6]);});
    function ring(lat,meridian){var points=[];for(var i=0;i<=100;i++){var a=i/100*Math.PI*2,v=meridian?[Math.cos(a)*Math.cos(lat),Math.cos(a)*Math.sin(lat),Math.sin(a)]:spherePoint(lat,a);points.push(p(v[0],v[1],v[2]));}line(points,gold+'38',.8);}
    for(var j=0;j<6;j++)ring(j*Math.PI/6,true);for(var k=-2;k<=2;k++)ring(k*Math.PI/6,false);
    var rotation=t*.1+(smooth.x-.5)*.24;
    for(var i=0;i<520;i++){var z=1-2*(i+.5)/520,v=spherePoint(Math.asin(z),i*2.399963+rotation),depth=(v[0]+v[1]+v[2])/Math.sqrt(3),alpha=.36+.64*(depth+1)/2;ctx.globalAlpha*=alpha;dot(p(v[0],v[1],v[2]),.8+(depth+1)*.32);ctx.globalAlpha/=alpha;}
    // Paint all arrowheads and all three names last, so no surface hides them.
    arrow(p(0,0,0),p(2.5,0,0),'x');arrow(p(0,0,0),p(0,1.52,0),'y');arrow(p(0,0,0),p(0,0,1.25),'z');
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
    bg.clearRect(0,0,aw,ah);var n=aw<600?40:76,points=[];
    for(var i=0;i<n;i++){var x=((i*.61803398875)%1)*aw+Math.sin(time*.08+i)*18+(smooth.x-.5)*12,y=((i*.41421356237)%1)*ah+Math.cos(time*.06+i*2)*15+(smooth.y-.5)*12;points.push([x,y]);bg.fillStyle=dark?'#e69b0038':'#bb7b0024';bg.beginPath();bg.arc(x,y,i%6===0?1.7:1,0,Math.PI*2);bg.fill();}
    bg.lineWidth=.6;
    points.forEach(function(p,i){for(var j=i+1;j<points.length;j++){var q=points[j],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<115){bg.strokeStyle=dark?'rgba(170,185,210,'+(.075*(1-d/115))+')':'rgba(150,120,60,'+(.06*(1-d/115))+')';bg.beginPath();bg.moveTo(p[0],p[1]);bg.lineTo(q[0],q[1]);bg.stroke();}}});
    // A bounded set of peripheral mathematical objects, never a full-screen mesh.
    function ambientSphere(cx,cy,r){
      bg.save();bg.translate(cx+(smooth.x-.5)*22,cy+(smooth.y-.5)*22);bg.rotate(time*.018);
      bg.strokeStyle=dark?'#a5b3c12c':'#786b532b';bg.lineWidth=.7;
      for(var j=0;j<3;j++){bg.beginPath();bg.ellipse(0,0,r,r*(.22+j*.31),j*.65,0,Math.PI*2);bg.stroke();}
      for(var k=0;k<150;k++){var v=spherePoint(Math.asin(1-2*(k+.5)/150),k*2.399963+time*.07);bg.fillStyle=k%5===0?(dark?'#ffb30070':'#ad710055'):(dark?'#a5b3c147':'#786b533b');bg.beginPath();bg.arc(r*v[0],r*v[2],k%5===0?1.5:.9,0,Math.PI*2);bg.fill();}
      bg.restore();
    }
    ambientSphere(aw*.035,ah*.4,Math.min(aw*.15,145));
    if(aw>=700){
      ambientSphere(aw*.975,ah*.8,Math.min(aw*.12,175));
      bg.save();bg.translate(aw*.52,ah*.91);bg.rotate(Math.sin(time*.045)*.16);
      bg.strokeStyle=dark?'#b9974930':'#aa7b3026';bg.lineWidth=.8;bg.beginPath();
      bg.moveTo(-150,0);bg.lineTo(150,0);bg.moveTo(0,-70);bg.lineTo(0,65);
      bg.moveTo(-140,44);bg.lineTo(140,-44);
      for(var a=-140;a<=140;a+=4){var yy=-30*Math.sin(a/45+time*.12);if(a===-140)bg.moveTo(a,yy);else bg.lineTo(a,yy);}bg.stroke();bg.restore();
    }
  }
  function tick(now){frame=0;if(document.hidden||reduced.matches)return;var dt=last?Math.min((now-last)/1000,.05):0;time+=dt;last=now;var ease=1-Math.exp(-dt*8);smooth.x+=(pointer.x-smooth.x)*ease;smooth.y+=(pointer.y-smooth.y)*ease;if(visible)paint();if(now-ambientLast>=33){paintAmbient();ambientLast=now;}frame=requestAnimationFrame(tick);}
  function restart(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;palette();paint();paintAmbient();if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);}
  window.addEventListener('pointermove',function(e){if(e.pointerType==='touch')return;pointer.x=e.clientX/aw;pointer.y=e.clientY/ah;},{passive:true});
  window.addEventListener('resize',resize,{passive:true});new ResizeObserver(resize).observe(canvas.parentElement);
  new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;},{threshold:.01}).observe(canvas);
  new MutationObserver(restart).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',restart);
  window.addEventListener('pagehide',function(){if(frame)cancelAnimationFrame(frame);});window.addEventListener('pageshow',restart);
  var tryLink=document.getElementById('homeTry');if(tryLink)tryLink.addEventListener('click',function(){sessionStorage.setItem('vm-guest-mode','true');});
  if(!reduced.matches){document.body.classList.add('home-motion-enabled');var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('is-pending');io.unobserve(e.target);}});},{threshold:.08});document.querySelectorAll('.home-reveal').forEach(function(el){if(el.getBoundingClientRect().top>innerHeight){el.classList.add('is-pending');io.observe(el);}});}
  resize();restart();
})();
