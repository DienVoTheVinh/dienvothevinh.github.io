const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'vmtool-3d.js'), 'utf8');
const sandbox = { window: {}, console, Math, Number, String };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'vmtool-3d.js' });
const math = sandbox.window.VMTool3DMath;
if (!math) throw new Error('VMTool3DMath chưa được công khai để kiểm thử');

const model = math.createModel('pyramid', { width: 6, depth: 4, height: 6, offset: .5 });
for (const name of ['S', 'A', 'B', 'C', 'D']) {
  if (!model.points[name]) throw new Error(`Hình chóp thiếu điểm ${name}`);
}
const p1 = math.planeFromPoints(model.points.S, model.points.A, model.points.B);
const p2 = math.planeFromPoints(model.points.S, model.points.C, model.points.D);
const line = math.planeIntersection(p1, p2);
if (!line) throw new Error('Không tìm được giao tuyến (SAB) và (SCD)');
if (Math.abs(math.pointOnPlane(p1, line.point)) > 1e-7 || Math.abs(math.pointOnPlane(p2, line.point)) > 1e-7) {
  throw new Error('Điểm giao tuyến không nằm trên cả hai mặt');
}
if (math.distancePointToLine(model.points.S, line) > 1e-7) throw new Error('Giao tuyến không đi qua S');
const ab = math.normalize(math.sub(model.points.B, model.points.A));
if (Math.abs(Math.abs(math.dot(ab, line.direction)) - 1) > 1e-7) throw new Error('Giao tuyến không song song AB và CD');

const planePatch = math.planeBoxPolygon(p1, math.modelBounds(model.points, .5));
if (planePatch.length < 3) throw new Error('Mặt phẳng alpha không tạo được mảng hiển thị');
for (const point of planePatch) {
  if (Math.abs(math.pointOnPlane(p1, point)) > 1e-7) throw new Error('Đa giác mặt phẳng lệch khỏi mặt alpha');
}

for (const kind of ['tetrahedron', 'box']) {
  const solid = math.createModel(kind, { width: 5, depth: 3, height: 4 });
  if (Object.keys(solid.points).length < 4 || solid.faces.length < 4 || solid.edges.length < 6) throw new Error(`Mẫu ${kind} chưa đủ cấu trúc`);
}
const projection = math.projectPoint({ x: 1, y: 2, z: 3 }, { width: 800, height: 600, scale: 60, yaw: -.6, pitch: -.3, cameraDistance: 15 });
if (![projection.x, projection.y, projection.depth].every(Number.isFinite)) throw new Error('Phép chiếu 3D sinh tọa độ không hợp lệ');

const bounds = math.modelBounds(model.points, .55);
const clipped = math.clipLineToBounds(line, bounds);
if (!clipped) throw new Error('Giao tuyến không được cắt theo vùng mô hình');
for (const endpoint of [clipped.a, clipped.b]) {
  if (Math.abs(math.pointOnPlane(p1, endpoint)) > 1e-7 || Math.abs(math.pointOnPlane(p2, endpoint)) > 1e-7) {
    throw new Error('Đầu mút giao tuyến cắt không còn nằm trên hai mặt phẳng');
  }
  for (const axis of ['x', 'y', 'z']) {
    if (endpoint[axis] < bounds.min[axis] - 1e-7 || endpoint[axis] > bounds.max[axis] + 1e-7) throw new Error('Giao tuyến vượt khỏi vùng quan sát');
  }
}

function hiddenAt(yaw, pitch) {
  const projected = {};
  for (const [name, point] of Object.entries(model.points)) {
    projected[name] = math.projectPoint(point, { center: { x: .1, y: 1.2, z: 0 }, width: 1000, height: 700, scale: 70, yaw, pitch, cameraDistance: 20 });
  }
  return math.hiddenEdges(model, projected).map(edge => edge.join('-'));
}

// Góc hồi quy từ phản hồi thực tế: C nằm phía trước, A nằm sau khối.
// SC, BC, CD phải là nét liền; SA, AB, DA bị các mặt trước che và phải là nét đứt.
const frontC = hiddenAt(-.62, .32);
for (const edge of ['S-A', 'A-B', 'D-A']) {
  if (!frontC.includes(edge)) throw new Error(`Thiếu cạnh khuất ${edge} ở góc nhìn phía C: ${frontC.join(', ')}`);
}
for (const edge of ['S-C', 'B-C', 'C-D']) {
  if (frontC.includes(edge)) throw new Error(`Cạnh trực diện ${edge} bị vẽ nét đứt sai: ${frontC.join(', ')}`);
}

// Khi xoay sang phía đối diện, tập cạnh khuất phải đổi theo độ sâu chứ không phụ thuộc
// thứ tự khai báo đỉnh của từng mặt.
const opposite = hiddenAt(2.2, -.32);
if (!opposite.includes('S-C') || opposite.includes('S-A')) {
  throw new Error(`Cạnh khuất không đổi đúng theo góc camera đối diện: ${opposite.join(', ')}`);
}

const html = fs.readFileSync(path.join(root, 'vmtool.html'), 'utf8');
for (const marker of ['Hình không gian 3D', 'spatialCanvas', 'runPyramidDemo', 'planeASelects', 'planeBSelects', 'fullscreen3d', 'download3dPng']) {
  if (!html.includes(marker)) throw new Error(`Giao diện 3D thiếu mốc ${marker}`);
}
if (!html.includes('Tìm giao tuyến của (SAB) và (SCD)')) throw new Error('Thiếu bài demo giao tuyến hình chóp');
if (!source.includes("requestAnimationFrame")) {
  // Chủ ý: công cụ chỉ vẽ khi tương tác, không có vòng lặp animation gây lag.
} else if (/function\s+animate[\s\S]{0,400}requestAnimationFrame\s*\(\s*animate/.test(source)) {
  throw new Error('Công cụ 3D có vòng lặp animation nền không cần thiết');
}
const css = fs.readFileSync(path.join(root, 'css', 'vmtool.css'), 'utf8');
for (const marker of ['.vmtool-spatial-workspace', '.vmtool-3d-canvas-wrap', '.vmtool-demo-steps', '.vmtool-3d-card:fullscreen']) {
  if (!css.includes(marker)) throw new Error(`CSS 3D thiếu ${marker}`);
}

console.log('VMTool 3D OK: solids, stable projection, dynamic hidden edges, clipped intersection and pyramid demo');
