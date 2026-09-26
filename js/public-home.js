(function(){
  'use strict';
  var reduced=matchMedia('(prefers-reduced-motion: reduce)'),paused=reduced.matches,visible=true,scene='space',frame=0,last=0,angle=0;
  var canvas=document.getElementById('homeMathCanvas'),ctx=canvas.getContext('2d'),stage=canvas.parentElement,width=0,height=0,pointer={x:0,y:0},smooth={x:0,y:0};
  var titles={space:'Nhìn toán học từ một góc khác.',graph:'Một hệ số đổi. Một hình dạng mới.',geometry:'Khác góc nhìn. Cùng một bản chất.'};
  var motion=document.getElementById('mathMotion');
  function syncMotion(){motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Bật chuyển động':'Tạm dừng chuyển động');motion.textContent=paused?'▷':'Ⅱ';}
  motion.addEventListener('click',function(){paused=!paused;syncMotion();restart();});syncMotion();
  document.querySelectorAll('[data-scene]').forEach(function(button){button.addEventListener('click',function(){scene=button.dataset.scene;document.querySelectorAll('[data-scene]').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});['space','graph','geometry'].forEach(function(s){document.getElementById('scene-'+s).hidden=s!==scene;});document.getElementById('mathSceneTitle').textContent=titles[scene];document.getElementById('mathSceneIndex').textContent='0'+(['space','graph','geometry'].indexOf(scene)+1)+' / 03';resize();restart();});});
  document.getElementById('homeTry').addEventListener('click',function(){sessionStorage.setItem('vm-guest-mode','true');});
  var aInput=document.getElementById('graphA');
  function graph(){var a=Number(aInput.value),d='';for(var x=-2.5;x<=2.501;x+=.025){var px=260+x*80,py=310-a*x*x*64;if(py<20)continue;d+=(d?'L':'M')+px.toFixed(2)+' '+py.toFixed(2)+' ';}document.getElementById('parabolaPath').setAttribute('d',d);document.getElementById('graphAValue').textContent=a.toLocaleString('vi-VN');document.querySelector('.math-tracer').setAttribute('cy',310-a*64);}
  aInput.addEventListener('input',graph);graph();
  function resize(){var r=stage.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;var dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint();}
  function project(x,y,z,r){var c=Math.cos(angle+smooth.x),s=Math.sin(angle+smooth.x),xx=x*c+z*s,zz=z*c-x*s,tilt=-.23+smooth.y,yy=y*Math.cos(tilt)-zz*Math.sin(tilt),depth=y*Math.sin(tilt)+zz*Math.cos(tilt);return [width*.5+xx*r,height*.46+yy*r,depth];}
  function paint(){if(!width||!height)return;ctx.clearRect(0,0,width,height);var r=Math.min(width*.37,height*.37);
    ctx.lineWidth=.7;ctx.strokeStyle='#87957725';
    for(var g=-3;g<=3;g++){ctx.beginPath();ctx.moveTo(width/2+g*42,22);ctx.lineTo(width/2+g*42,height-40);ctx.stroke();}
    for(var h=0;h<7;h++){ctx.beginPath();ctx.moveTo(15,35+h*42);ctx.lineTo(width-15,35+h*42);ctx.stroke();}
    var axes=[[1.3,0,0,'x'],[0,-1.3,0,'z'],[0,0,1.3,'y']];ctx.font='italic 15px Georgia';
    axes.forEach(function(a){var p=project(a[0],a[1],a[2],r);ctx.strokeStyle='#a6b19775';ctx.beginPath();ctx.moveTo(width*.5,height*.46);ctx.lineTo(p[0],p[1]);ctx.stroke();ctx.fillStyle='#c6d0b2';ctx.fillText(a[3],p[0]+7,p[1]-6);});
    function ring(lat,meridian){ctx.beginPath();for(var i=0;i<=96;i++){var t=i/96*Math.PI*2,p=meridian?project(Math.cos(t)*Math.cos(lat),Math.sin(t),Math.cos(t)*Math.sin(lat),r):project(Math.cos(t)*Math.cos(lat),Math.sin(lat),Math.sin(t)*Math.cos(lat),r);if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}ctx.stroke();}
    ctx.strokeStyle='#d4b76730';for(var j=0;j<6;j++)ring(j*Math.PI/6,true);for(var k=-2;k<=2;k++)ring(k*Math.PI/6,false);
    var n=width<400?380:620;for(var i=0;i<n;i++){var y=1-2*(i+.5)/n,phi=i*2.399963,rr=Math.sqrt(1-y*y),p=project(Math.cos(phi)*rr,y,Math.sin(phi)*rr,r);var depth=(p[2]+1)/2;ctx.fillStyle='rgba(237,199,114,'+(.15+.8*depth)+')';ctx.beginPath();ctx.arc(p[0],p[1],.65+depth*.85,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#d9dfcc';ctx.beginPath();ctx.arc(width/2,height*.46,2,0,Math.PI*2);ctx.fill();ctx.font='italic 15px Georgia';ctx.fillText('O',width/2+7,height*.46+17);
  }
  // Reduced motion starts paused; an explicit play click may opt in for this visit.
  function running(){return !paused&&visible&&!document.hidden&&scene==='space';}
  function tick(now){frame=0;if(!running())return;if(now-last>28){var dt=last?Math.min((now-last)/1000,.06):0;last=now;angle+=dt*.11;smooth.x+=(pointer.x-smooth.x)*.06;smooth.y+=(pointer.y-smooth.y)*.06;paint();}frame=requestAnimationFrame(tick);}
  function restart(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;paint();if(running())frame=requestAnimationFrame(tick);}
  canvas.addEventListener('pointermove',function(e){if(e.pointerType==='touch'||paused||reduced.matches)return;var r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left-r.width/2)/r.width*.7;pointer.y=(e.clientY-r.top-r.height/2)/r.height*.35;});canvas.addEventListener('pointerleave',function(){pointer.x=pointer.y=0;});
  new ResizeObserver(resize).observe(stage);new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;restart();},{threshold:.05}).observe(canvas);
  document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',function(){paused=reduced.matches;syncMotion();restart();});
  if(!reduced.matches&&'IntersectionObserver'in window){document.body.classList.add('home-motion-enabled');var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('is-pending');io.unobserve(e.target);}});},{threshold:.08});document.querySelectorAll('.home-reveal').forEach(function(el){if(el.getBoundingClientRect().top>innerHeight){el.classList.add('is-pending');io.observe(el);}});}
  window.addEventListener('pagehide',function(){if(frame)cancelAnimationFrame(frame);});window.addEventListener('pageshow',restart);resize();restart();
})();
