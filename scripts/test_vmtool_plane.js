const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'vmtool-plane.js'), 'utf8');
const sandbox = { window: {}, console, Math, Number, String };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'vmtool-plane.js' });
const m = sandbox.window.VMToolPlaneMath;
if (!m) throw new Error('Thiếu API toán học VMToolPlaneMath');

const l1 = m.lineFromPoints({x:0,y:0},{x:4,y:4});
const l2 = m.lineFromPoints({x:0,y:4},{x:4,y:0});
const hit = m.lineIntersection(l1,l2);
if (!hit || Math.abs(hit.x-2)>1e-8 || Math.abs(hit.y-2)>1e-8) throw new Error('Giao điểm hai đường sai');
const mid = m.midpoint({x:-2,y:1},{x:4,y:5});
if (mid.x!==1 || mid.y!==3) throw new Error('Trung điểm sai');
const lc = m.lineCircleIntersections(m.lineFromPoints({x:-3,y:0},{x:3,y:0}),{center:{x:0,y:0},radius:2});
if (lc.length!==2 || Math.abs(Math.abs(lc[0].x)-2)>1e-8) throw new Error('Giao đường tròn - đường thẳng sai');
const cc = m.circleCircleIntersections({center:{x:0,y:0},radius:5},{center:{x:6,y:0},radius:5});
if (cc.length!==2 || Math.abs(Math.abs(cc[0].y)-4)>1e-8) throw new Error('Giao hai đường tròn sai');
if (Math.abs(m.angleDegrees({x:1,y:0},{x:0,y:0},{x:0,y:1})-90)>1e-8) throw new Error('Số đo góc sai');
const center = m.circumcenter({x:0,y:0},{x:4,y:0},{x:0,y:4});
if (!center || Math.abs(center.x-2)>1e-8 || Math.abs(center.y-2)>1e-8) throw new Error('Tâm ngoại tiếp sai');

const html = fs.readFileSync(path.join(root, 'vmtool.html'), 'utf8');
for (const marker of ['Dựng hình phẳng','planeCanvas','data-plane-tool="intersection"','planeCompile','planeLatexDialog','vmtool-loader.js']) {
  if (!html.includes(marker)) throw new Error(`Giao diện hình phẳng thiếu ${marker}`);
}
if (html.includes('<script src="js/vmtool-plane.js') || html.includes('<script src="js/vmtool-3d.js')) throw new Error('Mô-đun hình học nặng vẫn bị tải ngay');
const loader = fs.readFileSync(path.join(root,'js','vmtool-loader.js'),'utf8');
if (!loader.includes("plane: { src: 'js/vmtool-plane.js") || !loader.includes("spatial: { src: 'js/vmtool-3d.js")) throw new Error('Bộ tải theo nhu cầu chưa đủ 2 mô-đun');
if (/requestAnimationFrame\s*\([^)]*\)[\s\S]{0,120}requestAnimationFrame/.test(source)) throw new Error('Hình phẳng có vòng lặp nền gây tốn tài nguyên');
for (const marker of ["sb.functions.invoke('latex'", "engine:'pdflatex'", 'getSession()', 'latexDocument', '\\usetikzlibrary']) {
  if (!source.includes(marker)) throw new Error(`Luồng LaTeX thiếu ${marker}`);
}
console.log('VMTool plane OK: geometry math, lazy loading, TikZ and authenticated PDF compile');
