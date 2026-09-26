'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html'),source=read('js/public-home.js'),css=read('css/public-home.css');
const math=require('../js/public-home.js');
assert.match(html,/Hệ thống dạy và học toán thông minh/);
for(const id of ['homeTry','homeMathCanvas','homeAmbientCanvas','blogCongKhai','bangLichCongKhai'])assert.equal(html.split('id="'+id+'"').length-1,1,id);
assert.doesNotMatch(html,/id="vmInstallHero"|class="math-lab"|id="mathMotion"|id="graphA"|data-scene=/);
assert.match(css,/\.vm-public-home #vmInstallBtn/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(source,/document.hidden\|\|reduced.matches/);
assert.match(source,/Math.min\(devicePixelRatio\|\|1,1.5\)/);
assert.doesNotMatch(source,/'Ox'|'Oy'|'Oz'|function equation|line\(section|tangentPoints|now-last>30/);
assert.match(source,/ctx.clip\(\)/);
assert.match(source,/ambientSphere/);
assert.equal((html.match(/class="system-icon"/g)||[]).length,4);
for(const value of ['Vision','Inquiry','Nurture','Humanity'])assert.ok(html.includes(value),value);
new vm.Script(source);
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"\s]*)?"/g)){
  if(/^(?:https?:|#)/.test(match[1]))continue;
  const file=path.join(root,match[1].replace(/^\//,''));
  assert.ok(fs.existsSync(file)||fs.existsSync(file+'.html'),'Missing asset/route: '+match[1]);
}
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-10,msg+': '+a+' != '+b);
for(let i=0;i<1000;i++){
  const lat=-Math.PI/2+Math.PI*i/999,lon=i*.618,p=math.spherePoint(lat,lon);
  near(p.reduce((s,v)=>s+v*v,0),1,'Point stays on sphere');
  const t=-1.45+2.9*i/999;near(math.tangent(t,t),t*t,'Tangent contains point');
  const epsilon=.001;
  near(((t+epsilon)**2-(t-epsilon)**2)/(2*epsilon),2*t,'Derivative is 2t');
  const B=math.circlePoint(7*Math.PI/6),C=math.circlePoint(11*Math.PI/6);
  for(const angle of [2.12+.22*Math.sin(i*.29),.78+.2*Math.sin(i*.24)]){
    const A=math.circlePoint(angle),u=B.map((v,k)=>v-A[k]),v=C.map((n,k)=>n-A[k]);
    near(Math.acos((u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v))),Math.PI/3,'Inscribed angle is 60 degrees');
  }
}
const z=math.project(0,0,1);near(z[0],0,'Oz is vertical');assert.ok(z[1]<0,'Oz points up');
const x=math.axisLayout(1,0,0),y=math.axisLayout(0,1,0);
assert.ok(x[0]<0&&x[1]>0,'x points down-left');near(y[1],0,'y is horizontal');assert.ok(y[0]>0,'y points right');
// Every point on the camera-facing great circle projects to the same radius.
for(let i=0;i<360;i++){const a=i*Math.PI/180,c=Math.cos(a),s=Math.sin(a),p=[-c/Math.sqrt(2)+s/Math.sqrt(6),c/Math.sqrt(2)+s/Math.sqrt(6),-2*s/Math.sqrt(6)];near(Math.hypot(...math.project(...p)),1,'Sphere silhouette is circular');}
const pushed={x:0,y:0};for(let i=0;i<10;i++)math.repel(pushed,100,100,95,100,1/30,true);assert.ok(pushed.x>10,'Mouse repels particles');const displaced=pushed.x;for(let i=0;i<90;i++)math.repel(pushed,100,100,95,100,1/30,false);assert.ok(pushed.x<displaced*.001,'Particles return after pointer leaves');
// Run the actual animation loop against deterministic display timestamps.
let queued,draws=0;
const noop=()=>{},context=new Proxy({globalAlpha:1,clearRect:()=>draws++},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
const ambientContext=new Proxy({},{get:()=>noop,set:()=>true});
const canvas={getContext:()=>context,getBoundingClientRect:()=>({width:600,height:460}),parentElement:{},dataset:{}};
const ambient={getContext:()=>ambientContext,dataset:{}};
const reduced={matches:false,addEventListener:noop};
const doc={hidden:false,documentElement:{dataset:{theme:'dark'},scrollHeight:1000},body:{classList:{add:noop}},getElementById:id=>id==='homeMathCanvas'?canvas:id==='homeAmbientCanvas'?ambient:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop};
const observer=function(){this.observe=noop;this.unobserve=noop;};
vm.runInNewContext(source,{document:doc,window:{addEventListener:noop},matchMedia:()=>reduced,devicePixelRatio:2,innerWidth:1440,innerHeight:1000,ResizeObserver:observer,IntersectionObserver:observer,MutationObserver:observer,requestAnimationFrame:fn=>(queued=fn,1),cancelAnimationFrame:noop});
const initial=draws;
for(let i=1;i<=120;i++){const fn=queued;queued=null;fn(i*1000/60);assert.ok(queued,'Loop schedules next frame');}
assert.equal(draws-initial,120,'Hero draws every display frame, not every other frame');
doc.hidden=true;queued(3000);assert.equal(draws-initial,120,'Hidden page does not render');
doc.hidden=false;reduced.matches=true;queued(4000);assert.equal(draws-initial,120,'Reduced-motion mode does not animate');
for(let i=0;i<160;i++){const p=math.assemblyPoint(i,1,1400,900,0),q=math.assemblyPoint(i,1,1400,900,100);near(p[0],q[0],'Assembled graph does not drift');near(p[1],900*(.52-.23*Math.sin((i/159)*2*Math.PI)),'Assembles into sine curve');const a=math.assemblyPoint(i,.4,1400,900,2),b=math.assemblyPoint(i,.4,1400,900,2);assert.deepEqual(a,b,'Scroll assembly is reversible, not direction-triggered');}
assert.match(html,/class="home-section-rail"/);assert.match(source,/aria-current/);
const showcase=read('js/vmtools-showcase.js');new vm.Script(showcase);
assert.match(showcase,/next.decode\(\).then\(commit\)/);assert.match(showcase,/6500/);assert.match(showcase,/!document.hidden/);assert.match(showcase,/reduced.matches/);
const timetable=require('../js/public-timetable.js');
const sample=(weekday,start,name='Toán 9')=>({weekday,start_time:start,end_time:'14:30',mode:'online',recurrence:'weekly',classes:{name,grade:9,is_specialized:true}});
const rows=[sample(7,'13:00'),sample(7,'09:00'),sample(2,'17:00','<img src=x onerror=alert(1)>'),{...sample(1,'08:00'),end_date:'2026-09-01'},{...sample(1,'08:00'),start_date:'2026-10-01'},{...sample(1,'08:00'),recurrence:'once',date:'2026-09-28'}];
const rendered=timetable.render(rows,'2026-09-27');
assert.equal((rendered.match(/<article /g)||[]).length,4);
assert.ok(rendered.indexOf('09:00')<rendered.indexOf('13:00'),'Two Sunday sessions sorted, not merged');
assert.ok(rendered.includes('&lt;img')&&!rendered.includes('<img src=x'),'Untrusted class names escaped');
assert.ok(rendered.includes('28/09/2026'),'One-off dates are Vietnamese');
const filtered=timetable.render(rows,'2026-09-27','Toán 9|9');assert.equal((filtered.match(/<article /g)||[]).length,3);
assert.match(html,/class="home-zalo-contact"[^>]+https:\/\/zaloapp.com\/qr\/p\/ka7whkhn35yy/);
assert.match(read('js/rank-system.js'),/if\(!document.body.classList.contains\('vm-public-home'\)\)/);
assert.match(read('js/vinhmath.js'),/function taoChatbotWidget\(\) \{\s+if \(document.body.classList.contains\('vm-public-home'\)\) return;/);
console.log('Public home: assets, geometry, motion, rail, slideshow, timetable filtering/escaping and homepage contact isolation passed.');
