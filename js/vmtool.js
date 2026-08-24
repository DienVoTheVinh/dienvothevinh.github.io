(function () {
  'use strict';

  var MAX_ROWS = 8;
  var EPS = 1e-9;
  var palette = ['#c27d00', '#1976d2', '#198754', '#8e44ad', '#d35400', '#00838f', '#b23a48', '#596275'];
  var state = { rows: [], centerX: 0, centerY: 0, scale: 48, polygon: [], bounds: null };
  var canvas, ctx, wrap, list, countEl, summaryEl, emptyEl, toastEl;
  var drag = { active: false, x: 0, y: 0 };
  var toastTimer = 0;

  function $(id) { return document.getElementById(id); }
  function numberValue(value, fallback) {
    var result = Number(String(value).replace(',', '.'));
    return Number.isFinite(result) ? result : fallback;
  }
  function cleanNumber(value) {
    var rounded = Math.abs(value) < 1e-10 ? 0 : Math.round(value * 100000) / 100000;
    return String(rounded).replace('.', ',');
  }
  function texNumber(value) {
    var rounded = Math.abs(value) < 1e-10 ? 0 : Math.round(value * 10000) / 10000;
    return String(rounded);
  }
  function operatorText(op) { return op === '<=' ? '≤' : op === '>=' ? '≥' : op; }
  function isLess(op) { return op === '<=' || op === '<'; }

  function normalizeRow(row) {
    return {
      a: numberValue(row.a, 0),
      b: numberValue(row.b, 0),
      op: ['<=', '<', '>=', '>'].indexOf(row.op) >= 0 ? row.op : '<=',
      c: numberValue(row.c, 0)
    };
  }

  function rowSentence(row) {
    row = normalizeRow(row);
    var parts = [];
    if (row.a !== 0) {
      var absA = Math.abs(row.a);
      parts.push((row.a < 0 ? '− ' : '') + (absA === 1 ? '' : cleanNumber(absA)) + 'x');
    }
    if (row.b !== 0) {
      var absB = Math.abs(row.b);
      var bText = (absB === 1 ? '' : cleanNumber(absB)) + 'y';
      if (!parts.length) parts.push((row.b < 0 ? '− ' : '') + bText);
      else parts.push((row.b > 0 ? '+ ' : '− ') + bText);
    }
    if (!parts.length) parts.push('0');
    return parts.join(' ') + ' ' + operatorText(row.op) + ' ' + cleanNumber(row.c);
  }

  function evaluate(row, point) { return row.a * point.x + row.b * point.y - row.c; }
  function inside(row, point) {
    var value = evaluate(row, point);
    return isLess(row.op) ? value <= EPS : value >= -EPS;
  }
  function zeroRowTruth(row) {
    if (Math.abs(row.a) > EPS || Math.abs(row.b) > EPS) return null;
    if (row.op === '<=') return 0 <= row.c;
    if (row.op === '<') return 0 < row.c;
    if (row.op === '>=') return 0 >= row.c;
    return 0 > row.c;
  }

  function segmentIntersection(row, start, end) {
    var fs = evaluate(row, start);
    var fe = evaluate(row, end);
    var denominator = fs - fe;
    if (Math.abs(denominator) < EPS) return { x: start.x, y: start.y };
    var t = fs / denominator;
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  }

  function clipPolygon(polygon, row) {
    row = normalizeRow(row);
    var zeroTruth = zeroRowTruth(row);
    if (zeroTruth === true) return polygon.slice();
    if (zeroTruth === false || !polygon.length) return [];
    var output = [];
    for (var i = 0; i < polygon.length; i++) {
      var start = polygon[i];
      var end = polygon[(i + 1) % polygon.length];
      var startIn = inside(row, start);
      var endIn = inside(row, end);
      if (startIn && endIn) output.push(end);
      else if (startIn && !endIn) output.push(segmentIntersection(row, start, end));
      else if (!startIn && endIn) {
        output.push(segmentIntersection(row, start, end));
        output.push(end);
      }
    }
    return output;
  }

  function solveRegion(rows, bounds) {
    var polygon = [
      { x: bounds.xMin, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMax },
      { x: bounds.xMin, y: bounds.yMax }
    ];
    rows.map(normalizeRow).forEach(function (row) { polygon = clipPolygon(polygon, row); });
    return polygon;
  }

  function boundaryPoints(row, bounds) {
    row = normalizeRow(row);
    if (Math.abs(row.a) < EPS && Math.abs(row.b) < EPS) return [];
    var candidates = [];
    function add(x, y) {
      if (x < bounds.xMin - EPS || x > bounds.xMax + EPS || y < bounds.yMin - EPS || y > bounds.yMax + EPS) return;
      if (!candidates.some(function (p) { return Math.hypot(p.x - x, p.y - y) < 1e-6; })) candidates.push({ x: x, y: y });
    }
    if (Math.abs(row.b) > EPS) {
      add(bounds.xMin, (row.c - row.a * bounds.xMin) / row.b);
      add(bounds.xMax, (row.c - row.a * bounds.xMax) / row.b);
    }
    if (Math.abs(row.a) > EPS) {
      add((row.c - row.b * bounds.yMin) / row.a, bounds.yMin);
      add((row.c - row.b * bounds.yMax) / row.a, bounds.yMax);
    }
    if (candidates.length <= 2) return candidates;
    var best = [candidates[0], candidates[1]], bestDistance = -1;
    candidates.forEach(function (p) { candidates.forEach(function (q) {
      var distance = Math.hypot(p.x - q.x, p.y - q.y);
      if (distance > bestDistance) { bestDistance = distance; best = [p, q]; }
    }); });
    return best;
  }

  function currentRows() {
    return state.rows.map(function (row) {
      return normalizeRow({ a: row.a.value, b: row.b.value, op: row.op.value, c: row.c.value });
    });
  }

  function makeInput(value, label) {
    var input = document.createElement('input');
    input.type = 'number'; input.step = 'any'; input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', update);
    return input;
  }

  function addRow(data) {
    if (state.rows.length >= MAX_ROWS) { showToast('Tối đa ' + MAX_ROWS + ' bất phương trình.'); return; }
    data = normalizeRow(data || { a: 1, b: 1, op: '<=', c: 4 });
    var container = document.createElement('div'); container.className = 'vmtool-equation';
    var a = makeInput(data.a, 'Hệ số a');
    var x = document.createElement('span'); x.className = 'vmtool-variable'; x.textContent = 'x +';
    var b = makeInput(data.b, 'Hệ số b');
    var y = document.createElement('span'); y.className = 'vmtool-variable'; y.textContent = 'y';
    var op = document.createElement('select'); op.setAttribute('aria-label', 'Dấu bất phương trình');
    ['<=', '<', '>=', '>'].forEach(function (value) { var option = document.createElement('option'); option.value = value; option.textContent = operatorText(value); op.appendChild(option); });
    op.value = data.op; op.addEventListener('change', update);
    var c = makeInput(data.c, 'Vế phải c');
    var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'vmtool-remove'; remove.setAttribute('aria-label', 'Xóa bất phương trình'); remove.textContent = '×';
    var error = document.createElement('div'); error.className = 'vmtool-equation-error'; error.textContent = 'a và b không thể đồng thời bằng 0.';
    container.append(a, x, b, y, op, c, remove, error);
    var record = { container: container, a: a, b: b, op: op, c: c };
    remove.addEventListener('click', function () {
      if (state.rows.length === 1) { a.value = 1; b.value = 1; op.value = '<='; c.value = 4; update(); return; }
      state.rows = state.rows.filter(function (item) { return item !== record; }); container.remove(); update();
    });
    state.rows.push(record); list.appendChild(container); update();
  }

  function setRows(rows) {
    state.rows = []; list.textContent = '';
    rows.forEach(addRow); update();
  }

  function applyPreset(name) {
    if (name === 'strip') setRows([{ a: 1, b: -1, op: '>=', c: -2 }, { a: 1, b: -1, op: '<=', c: 2 }]);
    else if (name === 'quadrant') setRows([{ a: 1, b: 0, op: '>=', c: 0 }, { a: 0, b: 1, op: '>=', c: 0 }, { a: 1, b: 1, op: '<=', c: 6 }]);
    else setRows([{ a: 1, b: 0, op: '>=', c: 0 }, { a: 0, b: 1, op: '>=', c: 0 }, { a: 1, b: 1, op: '<=', c: 6 }]);
    resetView();
  }

  function cssColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }
  function resizeCanvas() {
    if (!canvas || !wrap) return;
    var rect = wrap.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function dimensions() { var rect = canvas.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }
  function toScreen(point, size) { return { x: size.width / 2 + (point.x - state.centerX) * state.scale, y: size.height / 2 - (point.y - state.centerY) * state.scale }; }
  function toWorld(x, y, size) { return { x: state.centerX + (x - size.width / 2) / state.scale, y: state.centerY - (y - size.height / 2) / state.scale }; }
  function visibleBounds(size) {
    return { xMin: state.centerX - size.width / (2 * state.scale), xMax: state.centerX + size.width / (2 * state.scale), yMin: state.centerY - size.height / (2 * state.scale), yMax: state.centerY + size.height / (2 * state.scale) };
  }
  function niceStep() {
    var raw = 75 / state.scale, power = Math.pow(10, Math.floor(Math.log10(raw))), fraction = raw / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  }

  function drawGrid(size, bounds) {
    var line = cssColor('--line', 'rgba(20,20,20,.12)');
    var ink3 = cssColor('--ink-3', '#666');
    var step = niceStep();
    ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = ink3; ctx.font = '11px "Be Vietnam Pro", sans-serif';
    ctx.beginPath();
    var xStart = Math.ceil(bounds.xMin / step) * step;
    for (var x = xStart; x <= bounds.xMax + EPS; x += step) { var sx = toScreen({ x: x, y: 0 }, size).x; ctx.moveTo(sx, 0); ctx.lineTo(sx, size.height); }
    var yStart = Math.ceil(bounds.yMin / step) * step;
    for (var y = yStart; y <= bounds.yMax + EPS; y += step) { var sy = toScreen({ x: 0, y: y }, size).y; ctx.moveTo(0, sy); ctx.lineTo(size.width, sy); }
    ctx.stroke();
    var axis = cssColor('--ink-2', '#111'); ctx.strokeStyle = axis; ctx.lineWidth = 1.6; ctx.beginPath();
    var zero = toScreen({ x: 0, y: 0 }, size); ctx.moveTo(0, zero.y); ctx.lineTo(size.width, zero.y); ctx.moveTo(zero.x, 0); ctx.lineTo(zero.x, size.height); ctx.stroke();
    ctx.fillStyle = ink3;
    for (x = xStart; x <= bounds.xMax + EPS; x += step) if (Math.abs(x) > EPS && zero.y >= 0 && zero.y <= size.height) ctx.fillText(cleanNumber(x), toScreen({ x: x, y: 0 }, size).x + 3, Math.min(size.height - 5, Math.max(13, zero.y + 15)));
    for (y = yStart; y <= bounds.yMax + EPS; y += step) if (Math.abs(y) > EPS && zero.x >= 0 && zero.x <= size.width) ctx.fillText(cleanNumber(y), Math.min(size.width - 28, Math.max(4, zero.x + 5)), toScreen({ x: 0, y: y }, size).y - 4);
    ctx.fillStyle = axis; ctx.font = '700 12px "Be Vietnam Pro", sans-serif';
    if (zero.y >= 0 && zero.y <= size.height) ctx.fillText('x', size.width - 16, Math.min(size.height - 7, Math.max(14, zero.y - 7)));
    if (zero.x >= 0 && zero.x <= size.width) ctx.fillText('y', Math.min(size.width - 15, zero.x + 8), 16);
  }

  function drawRegion(size, rows, bounds) {
    state.polygon = solveRegion(rows, bounds); state.bounds = bounds;
    if (state.polygon.length) {
      ctx.save(); ctx.beginPath();
      state.polygon.forEach(function (point, index) { var s = toScreen(point, size); if (!index) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.closePath(); ctx.fillStyle = cssColor('--accent', '#c27d00'); ctx.globalAlpha = .2; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = cssColor('--accent', '#c27d00'); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    rows.forEach(function (row, index) {
      var points = boundaryPoints(row, bounds); if (points.length < 2) return;
      var p1 = toScreen(points[0], size), p2 = toScreen(points[1], size);
      ctx.save(); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle = palette[index % palette.length]; ctx.lineWidth = 2.4; ctx.setLineDash(row.op === '<' || row.op === '>' ? [8, 7] : []); ctx.stroke(); ctx.restore();
    });
    emptyEl.classList.toggle('show', !state.polygon.length);
  }

  function draw() {
    if (!ctx) return;
    var size = dimensions(); if (!size.width || !size.height) return;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = cssColor('--surface-solid', '#fff'); ctx.fillRect(0, 0, size.width, size.height);
    var bounds = visibleBounds(size); drawGrid(size, bounds); drawRegion(size, currentRows(), bounds);
  }

  function update() {
    if (!countEl) return;
    var rows = currentRows(); var valid = true;
    state.rows.forEach(function (record, index) {
      var row = rows[index]; var invalid = Math.abs(row.a) < EPS && Math.abs(row.b) < EPS;
      record.container.classList.toggle('invalid', invalid); valid = valid && !invalid;
    });
    countEl.textContent = rows.length + '/' + MAX_ROWS;
    $('addInequality').disabled = rows.length >= MAX_ROWS;
    summaryEl.textContent = '';
    var lead = document.createElement('strong'); lead.textContent = 'Hệ đang vẽ: ';
    summaryEl.appendChild(lead); summaryEl.appendChild(document.createTextNode(rows.map(rowSentence).join('  ·  ')));
    if (!valid) summaryEl.appendChild(document.createTextNode(' — Hãy sửa dòng không hợp lệ.'));
    draw();
  }

  function resetView() { state.centerX = 0; state.centerY = 0; state.scale = 48; draw(); }
  function zoom(factor, center) {
    var size = dimensions(); var point = center || { x: size.width / 2, y: size.height / 2 }; var before = toWorld(point.x, point.y, size);
    state.scale = Math.max(18, Math.min(190, state.scale * factor)); var after = toWorld(point.x, point.y, size); state.centerX += before.x - after.x; state.centerY += before.y - after.y; draw();
  }

  function generateTikz() {
    var size = dimensions(); var bounds = visibleBounds(size); var rows = currentRows(); var polygon = solveRegion(rows, bounds);
    var xMin = Math.floor(bounds.xMin), xMax = Math.ceil(bounds.xMax), yMin = Math.floor(bounds.yMin), yMax = Math.ceil(bounds.yMax);
    var lines = ['% Tạo bởi VMTool - VinhMath', '\\documentclass[tikz,border=5pt]{standalone}', '\\usepackage{xcolor}', '\\definecolor{vmGold}{HTML}{C27D00}', '\\begin{document}', '\\begin{tikzpicture}[x=.8cm,y=.8cm,>=stealth]', '  \\clip (' + xMin + ',' + yMin + ') rectangle (' + xMax + ',' + yMax + ');', '  \\draw[step=1,gray!18,very thin] (' + xMin + ',' + yMin + ') grid (' + xMax + ',' + yMax + ');'];
    if (polygon.length) lines.push('  \\fill[vmGold,opacity=.20] ' + polygon.map(function (p) { return '(' + texNumber(p.x) + ',' + texNumber(p.y) + ')'; }).join(' -- ') + ' -- cycle;');
    rows.forEach(function (row, index) {
      var points = boundaryPoints(row, bounds); if (points.length < 2) return;
      var style = (row.op === '<' || row.op === '>') ? 'dashed' : 'solid';
      lines.push('  \\draw[thick,' + style + '] (' + texNumber(points[0].x) + ',' + texNumber(points[0].y) + ') -- (' + texNumber(points[1].x) + ',' + texNumber(points[1].y) + ') node[pos=.78,fill=white,inner sep=1.5pt,font=\\scriptsize] {$' + rowSentence(row).replace(/≤/g, '\\le').replace(/≥/g, '\\ge').replace(/−/g, '-') + '$};');
    });
    lines.push('  \\draw[->,thick] (' + xMin + ',0) -- (' + xMax + ',0) node[right] {$x$};', '  \\draw[->,thick] (0,' + yMin + ') -- (0,' + yMax + ') node[above] {$y$};', '\\end{tikzpicture}', '\\end{document}');
    return lines.join('\n');
  }

  function downloadBlob(blob, name) { var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000); }
  function downloadPng() { canvas.toBlob(function (blob) { if (blob) { downloadBlob(blob, 'vmtool-mien-nghiem.png'); showToast('Đã tạo ảnh PNG.'); } }, 'image/png'); }
  function downloadTikz() { downloadBlob(new Blob([generateTikz()], { type: 'text/plain;charset=utf-8' }), 'vmtool-mien-nghiem.tex'); showToast('Đã tạo tệp TikZ.'); }
  function copyTikz() {
    var text = generateTikz();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { showToast('Đã sao chép mã TikZ.'); }).catch(function () { fallbackCopy(text); });
    else fallbackCopy(text);
  }
  function fallbackCopy(text) { var area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); showToast('Đã sao chép mã TikZ.'); }
  function showToast(message) { clearTimeout(toastTimer); toastEl.textContent = message; toastEl.classList.add('show'); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2300); }

  function bindCanvas() {
    canvas.addEventListener('wheel', function (event) { event.preventDefault(); var rect = canvas.getBoundingClientRect(); zoom(event.deltaY < 0 ? 1.13 : 1 / 1.13, { x: event.clientX - rect.left, y: event.clientY - rect.top }); }, { passive: false });
    canvas.addEventListener('pointerdown', function (event) { drag.active = true; drag.x = event.clientX; drag.y = event.clientY; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); });
    canvas.addEventListener('pointermove', function (event) { if (!drag.active) return; var dx = event.clientX - drag.x, dy = event.clientY - drag.y; drag.x = event.clientX; drag.y = event.clientY; state.centerX -= dx / state.scale; state.centerY += dy / state.scale; draw(); });
    function stop(event) { drag.active = false; canvas.classList.remove('dragging'); if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); }
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  }

  async function initAuth() {
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
    if (sessionStorage.getItem('vm-guest-mode') === 'true') return;
    if (typeof daKetNoi === 'function' && daKetNoi() && typeof yeuCauDangNhap === 'function') await yeuCauDangNhap();
  }

  async function init() {
    canvas = $('graphCanvas'); wrap = $('canvasWrap'); list = $('equationList'); countEl = $('inequalityCount'); summaryEl = $('formulaSummary'); emptyEl = $('emptyRegion'); toastEl = $('vmtoolToast'); ctx = canvas.getContext('2d');
    $('themeBtn').addEventListener('click', function () { if (typeof toggleTheme === 'function') toggleTheme(); setTimeout(draw, 30); });
    $('logoutBtn').addEventListener('click', function () { if (typeof dangXuat === 'function') dangXuat(); });
    $('addInequality').addEventListener('click', function () { addRow({ a: 1, b: 1, op: '<=', c: 4 }); });
    document.querySelectorAll('[data-preset]').forEach(function (button) { button.addEventListener('click', function () { applyPreset(button.dataset.preset); }); });
    $('zoomIn').addEventListener('click', function () { zoom(1.18); }); $('zoomOut').addEventListener('click', function () { zoom(1 / 1.18); }); $('resetView').addEventListener('click', resetView);
    $('downloadPng').addEventListener('click', downloadPng); $('copyTikz').addEventListener('click', copyTikz); $('downloadTikz').addEventListener('click', downloadTikz);
    bindCanvas(); applyPreset('triangle'); resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(wrap);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    try { await initAuth(); } catch (error) { console.warn('Không thể xác minh phiên VMTool:', error); }
  }

  window.VMToolMath = { normalizeRow: normalizeRow, inside: inside, clipPolygon: clipPolygon, solveRegion: solveRegion, boundaryPoints: boundaryPoints, rowSentence: rowSentence };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
