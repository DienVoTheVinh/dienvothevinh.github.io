const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'vmtool.js'), 'utf8');
const listeners = {};
const sandbox = {
  window: {},
  document: {
    readyState: 'loading',
    addEventListener(name, callback) { listeners[name] = callback; }
  },
  console,
  Number,
  Math,
  String,
  setTimeout,
  clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'vmtool.js' });

const math = sandbox.window.VMToolMath;
if (!math) throw new Error('VMToolMath chưa được công khai để kiểm thử');

const bounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
const triangle = math.solveRegion([
  { a: 1, b: 0, op: '>=', c: 0 },
  { a: 0, b: 1, op: '>=', c: 0 },
  { a: 1, b: 1, op: '<=', c: 6 }
], bounds);

if (triangle.length !== 3) throw new Error(`Miền tam giác có ${triangle.length} đỉnh thay vì 3`);
for (const point of triangle) {
  if (point.x < -1e-7 || point.y < -1e-7 || point.x + point.y > 6 + 1e-7) {
    throw new Error(`Đỉnh không thuộc miền nghiệm: ${JSON.stringify(point)}`);
  }
}

const impossible = math.solveRegion([
  { a: 1, b: 0, op: '<=', c: 0 },
  { a: 1, b: 0, op: '>=', c: 2 }
], bounds);
if (impossible.length !== 0) throw new Error('Hệ vô nghiệm vẫn tạo ra miền tô');

const strip = math.solveRegion([
  { a: 1, b: -1, op: '>=', c: -2 },
  { a: 1, b: -1, op: '<=', c: 2 }
], bounds);
if (strip.length < 4) throw new Error('Dải nghiệm không được cắt đúng');

const boundary = math.boundaryPoints({ a: 1, b: 1, op: '<=', c: 6 }, bounds);
if (boundary.length !== 2) throw new Error('Không tìm được đoạn biên trong khung nhìn');
if (math.rowSentence({ a: 2, b: -1, op: '<=', c: 6 }) !== '2x − y ≤ 6') throw new Error('Nhãn bất phương trình sai');

const rejectedBySum = math.rejectedRegion({ a: 1, b: 1, op: '<=', c: 6 }, bounds);
if (!rejectedBySum.length) throw new Error('Nửa mặt phẳng bị loại chưa được tạo');
if (rejectedBySum.some((point) => point.x + point.y < 6 - 1e-7)) throw new Error('Gạch sọc tràn vào miền nghiệm');
if (math.oppositeRow({ a: 1, b: 0, op: '>=', c: 0 }).op !== '<') throw new Error('Đảo nửa mặt phẳng sai');

const html = fs.readFileSync(path.join(root, 'vmtool.html'), 'utf8');
for (const marker of ['VMTool', 'Miền nghiệm 2D', 'graphCanvas', 'downloadTikz']) {
  if (!html.includes(marker)) throw new Error(`Trang VMTool thiếu mốc ${marker}`);
}
if (!html.includes('Phần bị loại · miền nghiệm là vùng trắng')) throw new Error('Chú giải miền gạch sọc chưa rõ');
if (!source.includes('createHatchPattern') || !source.includes('pattern=north east lines')) throw new Error('Canvas và TikZ chưa cùng dùng quy ước gạch sọc');

const menu = fs.readFileSync(path.join(root, 'js', 'menu-v5.js'), 'utf8');
const menuCount = (menu.match(/path: 'vmtool', label: 'VMTool'/g) || []).length;
if (menuCount !== 5) throw new Error(`VMTool phải có trong 5 menu vai trò, hiện có ${menuCount}`);
if (/portalContext\.portal_only[\s\S]{0,550}path: 'vmtool'/.test(menu)) throw new Error('VMTool không được chen vào cổng thi biệt lập');

console.log('VMTool inequality OK: rejected hatching, white solution, clipping, labels and role menus');
