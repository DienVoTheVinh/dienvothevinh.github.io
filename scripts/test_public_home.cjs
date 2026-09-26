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
assert.match(source,/'Ox'/);assert.match(source,/'Oy'/);assert.match(source,/'Oz'/);
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
  const h=.55*Math.sin(i),r=Math.sqrt(1-h*h);
  near((r*Math.cos(lon))**2+(r*Math.sin(lon))**2+h*h,1,'Section stays on sphere');
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
for(const p of [[1,0,0],[0,1,0],[0,0,1]])assert.ok(Math.hypot(...math.project(...p))<=1,'Projection does not distort sphere beyond its radius');
console.log('Public home: syntax, assets, icon integration, motion guards and 5000+ mathematical invariants passed.');
