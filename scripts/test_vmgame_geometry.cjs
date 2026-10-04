const assert=require('node:assert/strict'),m=require('../assets/vmgame/proof-engine');
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,message+': '+a+' / '+b);
for(let i=5;i<=95;i++){
 const p=m.construct(i/100),{A,B,C,E,K,G,F,H}=p;
 near(m.distance(A,B),m.distance(A,C),'ABC isosceles');near(m.distance(C,E),m.distance(B,C),'CE=BC');near(m.distance(B,K),m.distance(B,C),'BK=BC');near(K.y,E.y,'KE parallel BC');
 near(m.distance(A,K)/p.AB,m.distance(A,E)/p.AC,'Thales construction');assert(K.x<B.x&&E.x>C.x,'K and E beyond B and C');
 near(m.cross(m.sub(F,G),m.sub(E,G)),0,'G,F,E collinear');near(F.y,B.y,'F on BC');near(m.cross(m.sub(H,G),m.sub(C,G)),0,'G,H,C collinear');
 near(m.distance(G,F)+m.distance(F,E),m.distance(G,E),'F inside GE');near(m.distance(G,H)+m.distance(H,C),m.distance(G,C),'H inside GC');
 near(p.ratios.GH_HC,p.ratios.GB_BC,'angle bisector ratio');near(p.ratios.GF_FE,p.ratios.GB_BK,'Thales portion ratio');near(p.ratios.GH_HC,p.ratios.GF_FE,'equal ratios');near(m.cross(m.sub(H,F),m.sub(A,C)),0,'HF parallel AC');
 assert(Math.abs(p.ratios.GF_FE-m.distance(G,B)/m.distance(G,K))>.001,'whole-side distractor is wrong');
}
const p=m.construct(.6);near(p.factor,1+3.2/Math.sqrt(1.6**2+2**2),'unrounded exact factor');near(p.H.x,.08672607231677454,'H numeric reference');near(p.F.x,.7352720413238714,'F numeric reference');near(p.ratios.GH_HC,.48023431780746345,'ratio reference');
for(const t of [0,1,-1,2,NaN,Infinity])assert.throws(()=>m.construct(t),RangeError);
for(const step of m.steps){assert(m.check(step.id,step.statement,step.theorem).correct);assert(!m.check(step.id,'wrong-side','pythagoras').correct);}
assert(m.steps.find(s=>s.id==='length').depends.includes('construction'));
assert(m.check('goal','ratio-whole','converse').correct,'Equivalent whole-side ratios are accepted');
console.log('PASS geometry: 91 interior G positions, exact construction, K/E ray order, intersections, angle-bisector and Thales ratios, parallelism, distractor, endpoints and proof rules.');
