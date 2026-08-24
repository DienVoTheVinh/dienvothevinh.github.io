(function (global) {
  'use strict';

  var EPS = 1e-8;

  function v(x, y, z) { return { x: x, y: y, z: z }; }
  function add(a, b) { return v(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
  function mul(a, k) { return v(a.x * k, a.y * k, a.z * k); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  function length(a) { return Math.hypot(a.x, a.y, a.z); }
  function normalize(a) { var len = length(a); return len < EPS ? v(0, 0, 0) : mul(a, 1 / len); }
  function distance(a, b) { return length(sub(a, b)); }

  function planeFromPoints(a, b, c) {
    var normal = cross(sub(b, a), sub(c, a));
    var len = length(normal);
    if (len < EPS) return null;
    normal = mul(normal, 1 / len);
    return { normal: normal, constant: dot(normal, a), points: [a, b, c] };
  }

  function pointOnPlane(plane, point) { return dot(plane.normal, point) - plane.constant; }

  function solveTwoPlanesWithFixedCoordinate(p1, p2, fixedAxis) {
    var axes = ['x', 'y', 'z'].filter(function (axis) { return axis !== fixedAxis; });
    var a = axes[0], b = axes[1];
    var det = p1.normal[a] * p2.normal[b] - p1.normal[b] * p2.normal[a];
    if (Math.abs(det) < EPS) return null;
    var result = v(0, 0, 0);
    result[fixedAxis] = 0;
    result[a] = (p1.constant * p2.normal[b] - p1.normal[b] * p2.constant) / det;
    result[b] = (p1.normal[a] * p2.constant - p1.constant * p2.normal[a]) / det;
    return result;
  }

  function planeIntersection(p1, p2) {
    if (!p1 || !p2) return null;
    var direction = cross(p1.normal, p2.normal);
    if (length(direction) < EPS) return null;
    direction = normalize(direction);
    var components = [
      { axis: 'x', value: Math.abs(direction.x) },
      { axis: 'y', value: Math.abs(direction.y) },
      { axis: 'z', value: Math.abs(direction.z) }
    ].sort(function (a, b) { return b.value - a.value; });
    var point = null;
    for (var i = 0; i < components.length && !point; i++) point = solveTwoPlanesWithFixedCoordinate(p1, p2, components[i].axis);
    return point ? { point: point, direction: direction } : null;
  }

  function distancePointToLine(point, line) {
    return length(cross(sub(point, line.point), normalize(line.direction)));
  }

  function modelBounds(points, padding) {
    var values = Object.keys(points).map(function (key) { return points[key]; });
    var min = v(Infinity, Infinity, Infinity), max = v(-Infinity, -Infinity, -Infinity);
    values.forEach(function (p) {
      min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
    });
    padding = padding == null ? 1.1 : padding;
    return { min: sub(min, v(padding, padding, padding)), max: add(max, v(padding, padding, padding)) };
  }

  function planeBoxPolygon(plane, bounds) {
    if (!plane) return [];
    var min = bounds.min, max = bounds.max;
    var corners = [
      v(min.x, min.y, min.z), v(max.x, min.y, min.z), v(max.x, max.y, min.z), v(min.x, max.y, min.z),
      v(min.x, min.y, max.z), v(max.x, min.y, max.z), v(max.x, max.y, max.z), v(min.x, max.y, max.z)
    ];
    var edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    var hits = [];
    function pushUnique(point) {
      if (!hits.some(function (item) { return distance(item, point) < 1e-6; })) hits.push(point);
    }
    edges.forEach(function (edge) {
      var a = corners[edge[0]], b = corners[edge[1]];
      var fa = pointOnPlane(plane, a), fb = pointOnPlane(plane, b);
      if (Math.abs(fa) < EPS) pushUnique(a);
      if (Math.abs(fb) < EPS) pushUnique(b);
      if (fa * fb < -EPS) pushUnique(add(a, mul(sub(b, a), fa / (fa - fb))));
    });
    if (hits.length < 3) return [];
    var center = mul(hits.reduce(function (sum, point) { return add(sum, point); }, v(0, 0, 0)), 1 / hits.length);
    var helper = Math.abs(plane.normal.y) < .88 ? v(0, 1, 0) : v(1, 0, 0);
    var axisA = normalize(cross(plane.normal, helper));
    var axisB = normalize(cross(plane.normal, axisA));
    return hits.sort(function (p, q) {
      var pa = sub(p, center), qa = sub(q, center);
      return Math.atan2(dot(pa, axisB), dot(pa, axisA)) - Math.atan2(dot(qa, axisB), dot(qa, axisA));
    });
  }

  function rotatePoint(point, yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var x1 = point.x * cy + point.z * sy;
    var z1 = -point.x * sy + point.z * cy;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    return v(x1, point.y * cp - z1 * sp, point.y * sp + z1 * cp);
  }

  function projectPoint(point, options) {
    options = options || {};
    var rotated = rotatePoint(sub(point, options.center || v(0, 0, 0)), options.yaw || 0, options.pitch || 0);
    var perspective = options.perspective !== false;
    var distanceToCamera = options.cameraDistance || 14;
    var factor = perspective ? distanceToCamera / Math.max(2, distanceToCamera - rotated.z) : 1;
    var scale = (options.scale || 70) * factor;
    return {
      x: (options.width || 800) / 2 + rotated.x * scale,
      y: (options.height || 600) * .54 - rotated.y * scale,
      depth: rotated.z,
      factor: factor
    };
  }

  function createModel(type, dimensions) {
    dimensions = dimensions || {};
    var width = Number(dimensions.width) || 6;
    var depth = Number(dimensions.depth) || 4;
    var height = Number(dimensions.height) || 6;
    var offset = Number(dimensions.offset) || 0;
    var w = width / 2, d = depth / 2;
    if (type === 'tetrahedron') {
      return {
        type: type, name: 'Tứ diện S.ABC',
        points: { A:v(-w,0,-d), B:v(w,0,-d), C:v(0,0,d), S:v(offset,height,0) },
        faces: [['A','B','C'],['S','A','B'],['S','B','C'],['S','C','A']],
        edges: [['A','B'],['B','C'],['C','A'],['S','A'],['S','B'],['S','C']]
      };
    }
    if (type === 'box') {
      return {
        type: type, name: 'Hình hộp ABCD.A′B′C′D′',
        points: { A:v(-w,0,-d), B:v(w,0,-d), C:v(w,0,d), D:v(-w,0,d), "A′":v(-w,height,-d), "B′":v(w,height,-d), "C′":v(w,height,d), "D′":v(-w,height,d) },
        faces: [['A','B','C','D'],['A′','D′','C′','B′'],['A','A′','B′','B'],['B','B′','C′','C'],['C','C′','D′','D'],['D','D′','A′','A']],
        edges: [['A','B'],['B','C'],['C','D'],['D','A'],['A′','B′'],['B′','C′'],['C′','D′'],['D′','A′'],['A','A′'],['B','B′'],['C','C′'],['D','D′']]
      };
    }
    return {
      type: 'pyramid', name: 'Hình chóp S.ABCD',
      points: { A:v(-w,0,-d), B:v(w,0,-d), C:v(w,0,d), D:v(-w,0,d), S:v(offset,height,0) },
      faces: [['A','B','C','D'],['S','A','B'],['S','B','C'],['S','C','D'],['S','D','A']],
      edges: [['A','B'],['B','C'],['C','D'],['D','A'],['S','A'],['S','B'],['S','C'],['S','D']]
    };
  }

  var api = {
    vector: v, add: add, sub: sub, dot: dot, cross: cross, normalize: normalize, distance: distance,
    planeFromPoints: planeFromPoints, pointOnPlane: pointOnPlane, planeIntersection: planeIntersection,
    distancePointToLine: distancePointToLine, modelBounds: modelBounds, planeBoxPolygon: planeBoxPolygon,
    rotatePoint: rotatePoint, projectPoint: projectPoint, createModel: createModel
  };
  global.VMTool3DMath = api;

  if (typeof document === 'undefined') return;

  var state = {
    type: 'pyramid', width: 6, depth: 4, height: 6, offset: .5,
    yaw: -.62, pitch: -.32, zoom: 1, perspective: true,
    showFaces: true, showHidden: true, showGrid: true,
    model: null, planes: null, intersection: null, demoStep: 0,
    drag: { active:false, x:0, y:0, moved:false }
  };
  var canvas, ctx, wrap, card, resizeObserver;
  var activePointers = {}, pinchDistance = 0, pinchZoom = 1;

  function $(id) { return document.getElementById(id); }
  function format(value) { return Number(value).toFixed(1).replace('.', ','); }
  function names() { return Object.keys(state.model.points); }
  function centerOfModel() {
    var points = names().map(function (name) { return state.model.points[name]; });
    return mul(points.reduce(function (sum, point) { return add(sum, point); }, v(0,0,0)), 1 / points.length);
  }
  function modelRadius() {
    var center = centerOfModel();
    return Math.max.apply(null, names().map(function (name) { return distance(state.model.points[name], center); }));
  }
  function pointProjection(point) {
    var rect = canvas.getBoundingClientRect();
    var radius = Math.max(2.2, modelRadius());
    return projectPoint(point, {
      center: centerOfModel(), yaw: state.yaw, pitch: state.pitch,
      scale: Math.min(rect.width, rect.height) * .34 / radius * state.zoom,
      width: rect.width, height: rect.height, cameraDistance: radius * 3.5 + 5,
      perspective: state.perspective
    });
  }
  function projectedNames() {
    var result = {};
    names().forEach(function (name) { result[name] = pointProjection(state.model.points[name]); });
    return result;
  }

  function resizeCanvas() {
    if (!canvas || !wrap || wrap.offsetParent === null) return;
    var rect = wrap.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function polygonPath(projected) {
    if (!projected.length) return;
    ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y);
    for (var i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
    ctx.closePath();
  }
  function drawGround() {
    if (!state.showGrid) return;
    var radius = modelRadius() * 1.4;
    ctx.save(); ctx.lineWidth = 1;
    for (var i = -5; i <= 5; i++) {
      var alpha = i === 0 ? .19 : .08;
      ctx.strokeStyle = 'rgba(55,85,112,' + alpha + ')';
      var a = pointProjection(v(-radius,0,i*radius/5)), b = pointProjection(v(radius,0,i*radius/5));
      var c = pointProjection(v(i*radius/5,0,-radius)), d = pointProjection(v(i*radius/5,0,radius));
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.moveTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.stroke();
    }
    ctx.restore();
  }
  function faceDepth(face, projected) { return face.reduce(function (sum, name) { return sum + projected[name].depth; }, 0) / face.length; }
  function faceArea(face, projected) {
    var area = 0;
    for (var i = 0; i < face.length; i++) { var p=projected[face[i]], q=projected[face[(i+1)%face.length]]; area += p.x*q.y-q.x*p.y; }
    return area / 2;
  }
  function drawSolid(projected) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (state.showHidden) {
      ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle = dark ? 'rgba(204,220,234,.3)' : 'rgba(35,58,80,.25)'; ctx.lineWidth = 1.4;
      state.model.edges.forEach(function (edge) { var a=projected[edge[0]], b=projected[edge[1]]; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }); ctx.restore();
    }
    var faces = state.model.faces.slice().sort(function (a,b) { return faceDepth(a,projected)-faceDepth(b,projected); });
    if (state.showFaces) faces.forEach(function (face, index) {
      var pts = face.map(function (name) { return projected[name]; });
      polygonPath(pts);
      var front = faceArea(face, projected) < 0;
      ctx.fillStyle = dark ? (front ? 'rgba(60,132,185,.20)' : 'rgba(90,119,142,.10)') : (front ? 'rgba(101,174,222,.18)' : 'rgba(148,174,194,.10)');
      if (index % 3 === 1) ctx.fillStyle = dark ? 'rgba(231,168,67,.13)' : 'rgba(240,181,74,.13)';
      ctx.fill();
    });
    ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = dark ? '#d5e4f0' : '#24445f'; ctx.lineWidth = 2.1; ctx.lineJoin = 'round';
    state.model.edges.forEach(function (edge) { var a=projected[edge[0]], b=projected[edge[1]]; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }); ctx.restore();
  }
  function drawPlane(plane, color) {
    if (!plane) return;
    var polygon = planeBoxPolygon(plane, modelBounds(state.model.points, .55));
    if (polygon.length < 3) return;
    var projected = polygon.map(pointProjection);
    ctx.save(); polygonPath(projected); ctx.fillStyle = color.fill; ctx.fill(); ctx.setLineDash([8,5]); ctx.lineWidth=1.8; ctx.strokeStyle=color.stroke; ctx.stroke(); ctx.restore();
  }
  function drawIntersection() {
    if (!state.intersection || state.demoStep && state.demoStep < 3) return;
    var radius = modelRadius() * 1.55;
    var a = pointProjection(add(state.intersection.point,mul(state.intersection.direction,-radius)));
    var b = pointProjection(add(state.intersection.point,mul(state.intersection.direction,radius)));
    ctx.save(); ctx.strokeStyle='rgba(242,92,42,.22)'; ctx.lineWidth=11; ctx.lineCap='round'; ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.strokeStyle='#ef5527';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    var mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};ctx.font='900 15px "Be Vietnam Pro",sans-serif';ctx.fillStyle='#ef5527';ctx.fillText('d = α ∩ β',mid.x+10,mid.y-10);ctx.restore();
  }
  function drawDemoHighlights(projected) {
    if (state.demoStep < 1 || state.type !== 'pyramid') return;
    ctx.save();
    if (state.demoStep >= 1) {
      var s=projected.S; ctx.fillStyle='rgba(255,142,24,.2)';ctx.beginPath();ctx.arc(s.x,s.y,18,0,Math.PI*2);ctx.fill();
    }
    if (state.demoStep >= 2) {
      [['A','B'],['C','D']].forEach(function(edge){var a=projected[edge[0]],b=projected[edge[1]];ctx.strokeStyle='#18a06a';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});
    }
    ctx.restore();
  }
  function drawPoints(projected) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    Object.keys(projected).sort(function(a,b){return projected[a].depth-projected[b].depth;}).forEach(function (name) {
      var p=projected[name], highlight=state.demoStep>=1&&name==='S';
      ctx.save();ctx.shadowColor=highlight?'rgba(239,85,39,.65)':'rgba(20,47,70,.22)';ctx.shadowBlur=highlight?15:6;
      ctx.fillStyle=highlight?'#ef5527':'#fff';ctx.strokeStyle=highlight?'#fff':(dark?'#d7e7f2':'#24445f');ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,5.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      ctx.font='900 14px "Be Vietnam Pro",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      var labelWidth=Math.max(25,ctx.measureText(name).width+13), lx=p.x+15,ly=p.y-15;
      ctx.fillStyle=dark?'rgba(13,23,32,.9)':'rgba(255,255,255,.92)';ctx.beginPath();ctx.roundRect(lx-labelWidth/2,ly-12,labelWidth,24,8);ctx.fill();ctx.strokeStyle=dark?'rgba(190,211,225,.4)':'rgba(60,87,111,.25)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=dark?'#f0f6fa':'#173047';ctx.fillText(name,lx,ly);
    });
  }
  function draw() {
    if (!ctx || !canvas || canvas.width < 2) return;
    var rect=canvas.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);
    drawGround();var projected=projectedNames();
    if (state.planes) { drawPlane(state.planes[0],{fill:'rgba(25,118,210,.18)',stroke:'rgba(25,118,210,.82)'}); drawPlane(state.planes[1],{fill:'rgba(190,65,154,.16)',stroke:'rgba(190,65,154,.82)'}); }
    drawSolid(projected);drawDemoHighlights(projected);drawIntersection();drawPoints(projected);
  }

  function planeNames(containerId) { return Array.prototype.map.call($(containerId).querySelectorAll('select'),function(select){return select.value;}); }
  function selectedPlane(containerId) { var selected=planeNames(containerId);return planeFromPoints(state.model.points[selected[0]],state.model.points[selected[1]],state.model.points[selected[2]]); }
  function fillPlaneSelects(containerId, values) {
    var container=$(containerId);container.textContent='';
    for(var i=0;i<3;i++){var select=document.createElement('select');select.setAttribute('aria-label',(containerId==='planeASelects'?'Mặt alpha':'Mặt beta')+', điểm '+(i+1));names().forEach(function(name){var option=document.createElement('option');option.value=name;option.textContent=name;select.appendChild(option);});select.value=names().indexOf(values[i])>=0?values[i]:names()[i];select.addEventListener('change',function(){state.demoStep=0;clearResult(false);});container.appendChild(select);}
  }
  function defaultPlanes() {
    var defaults=state.type==='pyramid'?[['S','A','B'],['S','C','D']]:state.type==='tetrahedron'?[['S','A','B'],['S','B','C']]:[['A','B','B′'],['D','C','C′']];
    fillPlaneSelects('planeASelects',defaults[0]);fillPlaneSelects('planeBSelects',defaults[1]);
  }
  function setResult(title, text, success) { var box=$('intersectionResult');box.classList.toggle('success',!!success);box.querySelector('b').textContent=title;box.querySelector('p').textContent=text; }
  function findIntersection() {
    var a=selectedPlane('planeASelects'),b=selectedPlane('planeBSelects');
    if(!a||!b){state.planes=null;state.intersection=null;setResult('Ba điểm đang thẳng hàng','Hãy chọn ba điểm không thẳng hàng cho mỗi mặt phẳng.',false);draw();return null;}
    var line=planeIntersection(a,b);state.planes=[a,b];state.intersection=line;state.demoStep=0;
    if(!line){setResult('Hai mặt phẳng song song','Hai mặt không có giao tuyến duy nhất trong không gian.',false);draw();return null;}
    setResult('Đã dựng giao tuyến d','Đường màu cam là giao tuyến duy nhất của hai mặt phẳng α và β.',true);draw();return line;
  }
  function clearResult(redraw) { state.planes=null;state.intersection=null;setResult('Chọn hai mặt phẳng','Giao tuyến và giải thích sẽ hiện tại đây.',false);if(redraw!==false)draw(); }
  function updateModel(keepPlanes) {
    state.model=createModel(state.type,state);$('solidName').textContent=state.model.name;$('solidPointCount').textContent=names().length+' điểm';
    if(!keepPlanes){defaultPlanes();clearResult(false);}else if(state.planes){var a=selectedPlane('planeASelects'),b=selectedPlane('planeBSelects');state.planes=a&&b?[a,b]:null;state.intersection=state.planes?planeIntersection(a,b):null;}
    draw();
  }
  function showTab(name) {
    document.querySelectorAll('[data-vmtool-panel]').forEach(function(panel){panel.hidden=panel.getAttribute('data-vmtool-panel')!==name;});
    document.querySelectorAll('[data-vmtool-tab]').forEach(function(tab){var active=tab.getAttribute('data-vmtool-tab')===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
    if($('vmtoolModeName')){$('vmtoolModeName').textContent=name==='spatial'?'Hình không gian 3D':'Miền nghiệm 2D';$('vmtoolModeMeta').textContent=name==='spatial'?'Dựng hình · Giao tuyến · PNG':'Đồ thị · PNG · TikZ';}
    if(name==='spatial')setTimeout(resizeCanvas,0);else global.dispatchEvent(new Event('resize'));
  }
  function setView(yaw,pitch,label){state.yaw=yaw;state.pitch=pitch;$('cameraHint').textContent=label;draw();}
  function downloadPng(){var link=document.createElement('a');link.download='vinhmath-'+state.model.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-')+'.png';link.href=canvas.toDataURL('image/png');link.click();}
  function fullscreen(){var request=card.requestFullscreen||card.webkitRequestFullscreen;if(request)request.call(card);}
  function runDemo(step) {
    if(state.type!=='pyramid'){state.type='pyramid';document.querySelectorAll('[data-solid-preset]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-solid-preset')==='pyramid');});updateModel(false);}
    fillPlaneSelects('planeASelects',['S','A','B']);fillPlaneSelects('planeBSelects',['S','C','D']);
    var a=selectedPlane('planeASelects'),b=selectedPlane('planeBSelects');state.planes=[a,b];state.intersection=planeIntersection(a,b);state.demoStep=step||1;
    document.querySelectorAll('[data-demo-step]').forEach(function(item){item.classList.toggle('active',Number(item.getAttribute('data-demo-step'))<=state.demoStep);});
    if(state.demoStep===1)setResult('Bước 1 · Điểm chung S','S cùng thuộc (SAB) và (SCD), nên giao tuyến phải đi qua S.',true);
    else if(state.demoStep===2)setResult('Bước 2 · Phương của giao tuyến','AB song song CD vì ABCD là hình bình hành.',true);
    else setResult('Kết luận · d qua S và d ∥ AB ∥ CD','VMTool đã kiểm chứng bằng giao tuyến tính trực tiếp từ hai mặt phẳng.',true);
    draw();
  }

  function init() {
    canvas=$('spatialCanvas');wrap=$('spatialCanvasWrap');card=$('spatialCanvasCard');if(!canvas||!wrap)return;ctx=canvas.getContext('2d');
    document.querySelectorAll('[data-vmtool-tab]').forEach(function(tab){tab.addEventListener('click',function(){showTab(tab.getAttribute('data-vmtool-tab'));});});
    document.querySelectorAll('[data-solid-preset]').forEach(function(button){button.addEventListener('click',function(){state.type=button.getAttribute('data-solid-preset');state.demoStep=0;document.querySelectorAll('[data-solid-preset]').forEach(function(item){item.classList.toggle('active',item===button);});updateModel(false);});});
    [['solidWidth','width','solidWidthValue'],['solidDepth','depth','solidDepthValue'],['solidHeight','height','solidHeightValue'],['apexOffset','offset','apexOffsetValue']].forEach(function(entry){$(entry[0]).addEventListener('input',function(){state[entry[1]]=Number(this.value);$(entry[2]).textContent=format(this.value);updateModel(true);});});
    $('showFaces').addEventListener('change',function(){state.showFaces=this.checked;draw();});$('showHiddenEdges').addEventListener('change',function(){state.showHidden=this.checked;draw();});$('showGrid3d').addEventListener('change',function(){state.showGrid=this.checked;draw();});$('usePerspective').addEventListener('change',function(){state.perspective=this.checked;draw();});
    $('findIntersection').addEventListener('click',findIntersection);$('clearIntersection').addEventListener('click',function(){state.demoStep=0;document.querySelectorAll('[data-demo-step]').forEach(function(item){item.classList.remove('active');});clearResult();});
    $('runPyramidDemo').addEventListener('click',function(){runDemo(1);});document.querySelectorAll('[data-demo-step]').forEach(function(item){item.querySelector('button').addEventListener('click',function(){runDemo(Number(item.getAttribute('data-demo-step')));});});
    $('viewIso').addEventListener('click',function(){setView(-.62,-.32,'Đang ở góc nhìn phối cảnh');});$('viewFront').addEventListener('click',function(){setView(0,0,'Đang nhìn chính diện');});$('viewTop').addEventListener('click',function(){setView(0,-Math.PI/2+.02,'Đang nhìn từ trên');});$('reset3dView').addEventListener('click',function(){state.zoom=1;setView(-.62,-.32,'Đang ở góc nhìn phối cảnh');});$('fullscreen3d').addEventListener('click',fullscreen);$('download3dPng').addEventListener('click',downloadPng);
    canvas.addEventListener('pointerdown',function(event){
      activePointers[event.pointerId]={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
      var ids=Object.keys(activePointers);if(ids.length===2){var p=activePointers[ids[0]],q=activePointers[ids[1]];pinchDistance=Math.hypot(p.x-q.x,p.y-q.y);pinchZoom=state.zoom;state.drag.active=false;}
      else state.drag={active:true,x:event.clientX,y:event.clientY,moved:false};
    });
    canvas.addEventListener('pointermove',function(event){
      if(!activePointers[event.pointerId])return;activePointers[event.pointerId]={x:event.clientX,y:event.clientY};var ids=Object.keys(activePointers);
      if(ids.length>=2){var p=activePointers[ids[0]],q=activePointers[ids[1]],next=Math.hypot(p.x-q.x,p.y-q.y);if(pinchDistance>5)state.zoom=Math.max(.55,Math.min(2.4,pinchZoom*next/pinchDistance));draw();return;}
      if(!state.drag.active)return;var dx=event.clientX-state.drag.x,dy=event.clientY-state.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)state.drag.moved=true;state.yaw+=dx*.008;state.pitch=Math.max(-1.45,Math.min(1.2,state.pitch+dy*.008));state.drag.x=event.clientX;state.drag.y=event.clientY;$('cameraHint').textContent='Góc nhìn tùy chỉnh';draw();
    });
    function endDrag(event){delete activePointers[event.pointerId];if(Object.keys(activePointers).length<2)pinchDistance=0;if(!Object.keys(activePointers).length){state.drag.active=false;canvas.classList.remove('dragging');}}
    canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('wheel',function(event){event.preventDefault();state.zoom=Math.max(.55,Math.min(2.4,state.zoom*(event.deltaY > 0 ? .9 : 1.1)));draw();},{passive:false});
    document.addEventListener('fullscreenchange',resizeCanvas);global.addEventListener('resize',resizeCanvas);if(global.ResizeObserver){resizeObserver=new ResizeObserver(resizeCanvas);resizeObserver.observe(wrap);}
    state.model=createModel(state.type,state);defaultPlanes();clearResult(false);setTimeout(resizeCanvas,0);
    global.VMTool3DState=state;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window !== 'undefined' ? window : this);
