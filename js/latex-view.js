// ============================================================
// VINHMATH — BỘ HIỂN THỊ LATEX DÙNG CHUNG
// Biến LaTeX kiểu đề thi (ex_test) thành HTML xem được trên web:
//  - bỏ dòng chú thích %...
//  - bỏ \begin{center}, \immini...
//  - đổi bảng tabular -> bảng HTML
//  - phần công thức $...$ để nguyên cho KaTeX render
// Trang nào dùng: nạp file này SAU katex + auto-render.
// ============================================================

function getTheorySections(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      var parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

var vmLatexTikzSeq = 0;
var vmLatexTikzRegistry = window.vmLatexTikzRegistry || {};
window.vmLatexTikzRegistry = vmLatexTikzRegistry;
var vmLatexContentSeq = 0;
var vmLatexContentRegistry = window.vmLatexContentRegistry || {};
window.vmLatexContentRegistry = vmLatexContentRegistry;

(function vmGanKieuTikzDungChung() {
  if (document.getElementById('vmTikzSharedStyle')) return;
  var style = document.createElement('style');
  style.id = 'vmTikzSharedStyle';
  style.textContent = '.vm-tex-tikz{width:100%;min-height:96px;margin:16px auto;display:grid;place-items:center;overflow:auto;border:1px dashed var(--line-2,var(--line,#d7dce2));border-radius:14px;background:color-mix(in srgb,var(--surface-2,transparent) 72%,transparent)}.vm-tex-tikz[data-vm-tikz-ready="done"]{min-height:0;border-color:transparent;background:transparent}.vm-tex-tikz-state{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;padding:22px 14px;color:var(--ink-3,#667085);font-size:.82rem;text-align:center}.vm-tex-tikz-spinner{width:20px;height:20px;flex:none;border:2px solid var(--line-2,#d7dce2);border-top-color:var(--accent,#d99000);border-radius:50%;animation:vmTikzSpin .8s linear infinite}.vm-tex-tikz canvas{display:block;width:auto;max-width:100%;height:auto;margin:auto;background:transparent!important}[data-theme="dark"] .vm-tex-tikz canvas{filter:invert(1) hue-rotate(180deg)}.vm-tex-tikz-error{color:var(--err,#b42318)}.vm-tex-tikz-retry{border:1px solid var(--line-2,#d7dce2);border-radius:999px;background:var(--surface,#fff);color:var(--ink,#171717);padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}.vm-tex-tikz-error small{flex-basis:100%;color:var(--ink-3,#667085)}@keyframes vmTikzSpin{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(style);
})();

function vmEscapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function vmTikzGioiHan(name, fallback) {
  var overrides = window.vmTikzTimeoutOverrides;
  var value = overrides && Number(overrides[name]);
  return Number.isFinite(value) && value > 0 && value <= 300000 ? value : fallback;
}

function vmTikzVoiGioiHan(promise, timeoutMs, message, onTimeout) {
  var timer = 0;
  var timeoutPromise = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      try { if (typeof onTimeout === 'function') onTimeout(); } catch (_) {}
      var error = new Error(message || 'Quá thời gian kết xuất hình TikZ');
      error.code = 'VM_TIKZ_TIMEOUT';
      reject(error);
    }, Math.max(1, Number(timeoutMs) || 1));
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(function () { clearTimeout(timer); });
}

function vmDatDangChoTikz(figure) {
  if (!figure) return;
  figure.removeAttribute('data-vm-tikz-ready');
  figure.innerHTML = '<div class="vm-tex-tikz-state"><span class="vm-tex-tikz-spinner" aria-hidden="true"></span><span>Đang kết xuất hình TikZ...</span></div>';
}

function vmDatLoiTikz(figure, error) {
  if (!figure) return;
  figure.setAttribute('data-vm-tikz-ready', 'error');
  figure.innerHTML = '';
  var state = document.createElement('div');
  state.className = 'vm-tex-tikz-state vm-tex-tikz-error';
  var title = document.createElement('b');
  title.textContent = error && error.code === 'VM_TIKZ_TIMEOUT' ? 'Kết xuất TikZ quá thời gian.' : 'Chưa kết xuất được hình TikZ.';
  var retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'vm-tex-tikz-retry'; retry.textContent = 'Thử lại';
  retry.addEventListener('click', function () {
    vmDatDangChoTikz(figure);
    vmXepHangTikzTuDong(figure);
  });
  state.appendChild(title); state.appendChild(retry);
  if (error && error.message) {
    var detail = document.createElement('small');
    detail.textContent = String(error.message).slice(0, 180);
    state.appendChild(detail);
  }
  figure.appendChild(state);
}

function vmLayPreambleLatex(src) {
  var text = String(src || '');
  var at = text.indexOf('\\begin{document}');
  return at === -1 ? '' : text.slice(0, at);
}

// KaTeX does not support TikZ. Preserve each block so the lesson page can
// compile it separately and place the rendered canvas at the correct position.
function vmBaoVeKhoiTikz(src, fullSource) {
  var preamble = vmLayPreambleLatex(fullSource || src);
  return String(src || '').replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g, function (tikz) {
    var token = 'VMTIKZ' + (++vmLatexTikzSeq);
    vmLatexTikzRegistry[token] = { source: tikz, preamble: preamble };
    return '\n___' + token + '___\n';
  });
}

function vmKhoiTikzSangHtml(html) {
  return String(html || '').replace(/___(VMTIKZ\d+)___/g, function (_, token) {
    return '<figure class="vm-tex-tikz" data-vm-tikz="' + token + '">' +
      '<div class="vm-tex-tikz-state"><span class="vm-tex-tikz-spinner" aria-hidden="true"></span>' +
      '<span>Đang kết xuất hình TikZ...</span></div></figure>';
  });
}

var vmTikzPdfDangTai = window.vmTikzPdfDangTai || {};
var vmTikzPdfBoNho = window.vmTikzPdfBoNho || {};
var vmTikzPdfThuTu = window.vmTikzPdfThuTu || [];
window.vmTikzPdfDangTai = vmTikzPdfDangTai;
window.vmTikzPdfBoNho = vmTikzPdfBoNho;
window.vmTikzPdfThuTu = vmTikzPdfThuTu;

function vmNhoTikzPdf(key, blob) {
  var oldIndex = vmTikzPdfThuTu.indexOf(key);
  if (oldIndex !== -1) vmTikzPdfThuTu.splice(oldIndex, 1);
  vmTikzPdfThuTu.push(key);
  vmTikzPdfBoNho[key] = blob;
  // Kho Cache API van giu ban sao tren dia. Gioi han bo nho RAM de cac trang
  // ngan hang/de dai khong giu hang nghin Blob PDF sau khi nguoi dung cuon qua.
  while (vmTikzPdfThuTu.length > 72) {
    var expired = vmTikzPdfThuTu.shift();
    if (expired && expired !== key) delete vmTikzPdfBoNho[expired];
  }
}

(function vmDonCacheTikzCu() {
  if (!('caches' in window) || window.vmTikzCacheCleanupStarted) return;
  window.vmTikzCacheCleanupStarted = true;
  Promise.all(['vinhmath-tikz-v2', 'vinhmath-tikz-v3'].map(function (name) {
    return caches.delete(name).catch(function () { return false; });
  })).catch(function () {});
})();

async function vmTikzMaNoiDung(tex) {
  var text = String(tex || '');
  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(digest), function (byte) { return byte.toString(16).padStart(2,'0'); }).join('');
  }
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16) + '-' + text.length;
}

function vmTikzCacheRequestNhanh(key) {
  return new Request('/__vinhmath_tikz_cache__/v4/' + key + '.pdf');
}

function vmTikzDocLoi(data) {
  return Promise.resolve(typeof data === 'string' ? data : (data && data.text ? data.text() : '')).then(function (log) {
    var firstError = String(log || '').split('\n').filter(function (line) { return line.indexOf('!') === 0; }).slice(0, 2).join(' ');
    throw new Error(firstError || 'Không nhận được hình TikZ hợp lệ');
  });
}

// Một tài liệu TikZ chỉ được gửi lên máy chủ đúng một lần trong cùng phiên.
// Kết quả tiếp tục được lưu bằng Cache API để lần mở sau có thể dùng ngay.
async function vmLayTikzPdfNhanh(tex) {
  var key = await vmTikzMaNoiDung(tex);
  if (vmTikzPdfBoNho[key]) return vmTikzPdfBoNho[key];
  if (vmTikzPdfDangTai[key]) return vmTikzPdfDangTai[key];
  vmTikzPdfDangTai[key] = (async function () {
    var pdfBlob = null;
    if ('caches' in window) {
      try {
        var hit = await (await caches.open('vinhmath-tikz-v4')).match(vmTikzCacheRequestNhanh(key));
        if (hit) pdfBlob = await hit.blob();
      } catch (e) {}
    }
    if (!pdfBlob) {
      if (typeof sb === 'undefined' || !sb.functions) throw new Error('Chưa kết nối được trạm kết xuất TikZ');
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var invokeTimeout = vmTikzGioiHan('invoke', 50000);
      var invokeOptions = {
        body: { tex: tex, engine: 'pdflatex', purpose: 'tikz', cache_version: 4 },
        timeout: invokeTimeout
      };
      if (controller) invokeOptions.signal = controller.signal;
      var result = await vmTikzVoiGioiHan(
        sb.functions.invoke('latex', invokeOptions),
        invokeTimeout + vmTikzGioiHan('invokeGrace', 750),
        'Trạm kết xuất TikZ phản hồi quá lâu',
        function () { if (controller) controller.abort(); }
      );
      if (result.error) throw new Error(result.error.message || 'Trạm kết xuất TikZ đang bận');
      pdfBlob = result.data;
      if (!(pdfBlob instanceof Blob) || pdfBlob.type.indexOf('pdf') === -1) return vmTikzDocLoi(pdfBlob);
      if ('caches' in window) {
        try {
          await (await caches.open('vinhmath-tikz-v4')).put(vmTikzCacheRequestNhanh(key), new Response(pdfBlob, { headers:{ 'Content-Type':'application/pdf' } }));
        } catch (e) {}
      }
    }
    if (!(pdfBlob instanceof Blob) || pdfBlob.type.indexOf('pdf') === -1) return vmTikzDocLoi(pdfBlob);
    vmNhoTikzPdf(key, pdfBlob);
    return pdfBlob;
  })();
  try { return await vmTikzPdfDangTai[key]; }
  finally { delete vmTikzPdfDangTai[key]; }
}

function vmKhaiBaoTikzPreview(preamble) {
  var lines = String(preamble || '').split(/\r?\n/), out = [];
  var collecting = false, depth = 0, current = [];
  var allowed = /^\s*\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|definecolor|colorlet|tikzset|pgfplotsset|tikzstyle|usetikzlibrary|usepgfplotslibrary|def)\b/;
  // Phòng thủ phía trình duyệt: một khai báo hợp lệ ở dòng đầu vẫn có thể
  // giấu primitive đọc/ghi tệp hoặc gọi shell trong thân nhiều dòng. Edge
  // Function tiếp tục là ranh giới bảo mật chính, nhưng nguồn nguy hiểm không
  // được gửi đi ngay từ bước xem trước.
  var blocked = /\\(?:@{0,2}input|includeonly|include|openin|openout|newread|newwrite|readline|read|write18|write|immediate|special|usepackage|RequirePackage|documentclass|filecontents\*?|verbatiminput|lstinputlisting|inputminted|endinput|catcode|csname|scantokens|directlua|pdfshellescape)(?![A-Za-z@])/i;
  function delta(line) {
    var clean = String(line || '').replace(/\\[{}]/g, '');
    return (clean.match(/\{/g) || []).length - (clean.match(/\}/g) || []).length;
  }
  function flush() {
    var block = current.join('\n');
    if (block && !blocked.test(block)) out.push(block);
    current = [];
  }
  lines.forEach(function (line) {
    if (!collecting && allowed.test(line)) {
      collecting = true; depth = delta(line); current = [line];
      if (depth <= 0) { collecting = false; flush(); }
    } else if (collecting) {
      current.push(line); depth += delta(line);
      if (depth <= 0) { collecting = false; flush(); }
    }
  });
  return out.join('\n');
}

function vmMauTikzPreview(source) {
  var text = String(source || '');
  var builtIn = { red:1,green:1,blue:1,cyan:1,magenta:1,yellow:1,black:1,gray:1,grey:1,white:1,brown:1,lime:1,olive:1,orange:1,pink:1,purple:1,teal:1,violet:1 };
  var declared = {}, used = {};
  text.replace(/\\(?:definecolor|providecolor|colorlet)\s*\{([^}]+)\}/g, function (_, name) { declared[name] = 1; return _; });
  text.replace(/(?:draw|fill|text|color)\s*=\s*([A-Za-z][\w-]*)/g, function (_, name) { used[name] = 1; return _; });
  text.replace(/\\color\s*\{([A-Za-z][\w-]*)\}/g, function (_, name) { used[name] = 1; return _; });
  text.replace(/\b([A-Za-z][\w-]*)!/g, function (_, name) { used[name] = 1; return _; });
  var palette = { brandNavy:'183B61',brandNavySoft:'EAF1F7',brandGold:'D99A16',brandGoldSoft:'FFF3D4',brandBlue:'2867A8',brandGreen:'23805B' };
  return Object.keys(used).filter(function (name) { return !builtIn[name.toLowerCase()] && !declared[name]; }).map(function (name) {
    return '\\providecolor{' + name + '}{HTML}{' + (palette[name] || '334155') + '}';
  }).join('\n') + '\n';
}

function vmChuanHoaTikzSource(source) {
  return String(source || '')
    .replace(/\\big\[/g, '\\lbrack').replace(/\\big\]/g, '\\rbrack')
    .replace(/\\big\(/g, '(').replace(/\\big\)/g, ')');
}

// Small, audited compatibility map for commands that occur in legacy author
// sources without their original package preamble. Keep this list explicit:
// unknown commands must stay visible instead of being silently rewritten.
var vmLegacyMacroCompatibility = Object.freeze({
  vv: Object.freeze({
    command: '\\vv',
    arguments: 1,
    katex: '\\overrightarrow{#1}',
    tex: '\\providecommand{\\vv}[1]{\\overrightarrow{#1}}',
    sourcePackage: 'esvect'
  }),
  indam: Object.freeze({
    command: '\\indam',
    arguments: 1,
    katex: '\\textbf{#1}',
    tex: '\\providecommand{\\indam}[1]{\\textbf{#1}}',
    sourcePackage: 'legacy-author-preamble'
  }),
  vect: Object.freeze({
    command: '\\vect',
    arguments: 1,
    katex: '\\overrightarrow{#1}',
    tex: '\\providecommand{\\vect}[1]{\\overrightarrow{#1}}',
    sourcePackage: 'legacy-author-preamble'
  }),
  heva: Object.freeze({
    command: '\\heva',
    arguments: 1,
    katex: '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
    tex: '\\providecommand{\\heva}[1]{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}',
    sourcePackage: 'legacy-author-preamble'
  }),
  hoac: Object.freeze({
    command: '\\hoac',
    arguments: 1,
    katex: '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
    tex: '\\providecommand{\\hoac}[1]{\\mathopen{\\lbrack}\\begin{array}{ll}#1\\end{array}}',
    sourcePackage: 'legacy-author-preamble'
  }),
  faCube: Object.freeze({
    command: '\\faCube',
    arguments: 0,
    katex: '\\blacksquare',
    tex: '\\providecommand{\\faCube}{\\ensuremath{\\blacksquare}}',
    sourcePackage: 'fontawesome'
  }),
  shortans: Object.freeze({
    command: '\\shortans',
    arguments: 2,
    katex: null,
    tex: '\\providecommand{\\shortans}[2][]{\\par\\noindent\\textbf{Đáp án: }\\fbox{\\strut #2}\\par}',
    sourcePackage: 'legacy-exam-preamble'
  })
});
window.vmLegacyMacroCompatibility = vmLegacyMacroCompatibility;

function vmLegacyKatexMacros() {
  var macros = {};
  Object.keys(vmLegacyMacroCompatibility).forEach(function (key) {
    var item = vmLegacyMacroCompatibility[key];
    if (typeof item.katex === 'string' && item.katex) macros[item.command] = item.katex;
  });
  return macros;
}
window.vmLegacyKatexMacros = vmLegacyKatexMacros;

function vmCoLenhLegacyTex(source, command) {
  var name = String(command || '').replace(/^\\+/, '');
  if (!name) return false;
  var text = String(source || '');
  // Follow TeX control-sequence/comment boundaries closely enough to avoid
  // treating a comment, \% or the second slash in \\ as a live command.
  for (var index = 0; index < text.length; index += 1) {
    var current = text.charAt(index);
    if (current === '%') {
      while (index < text.length && text.charAt(index) !== '\n') index += 1;
      continue;
    }
    if (current !== '\\' || index + 1 >= text.length) continue;
    index += 1;
    if (!/[A-Za-z@]/.test(text.charAt(index))) continue;
    var start = index;
    while (index < text.length && /[A-Za-z@]/.test(text.charAt(index))) index += 1;
    if (text.slice(start, index) === name) return true;
    index -= 1;
  }
  return false;
}

// PDF/TikZ callers can insert this immediately before \begin{document}. The
// fallback is conditional and uses \providecommand, so an author's esvect or
// custom \vv definition always wins. Never renew a source command globally.
function vmLegacyTexCompatPreamble(source) {
  var lines = [];
  Object.keys(vmLegacyMacroCompatibility).forEach(function (key) {
    var item = vmLegacyMacroCompatibility[key];
    if (vmCoLenhLegacyTex(source, item.command)) lines.push(item.tex);
  });
  if (!lines.length) return '';
  return '% VM_LEGACY_MACROS_BEGIN\n' + lines.join('\n') + '\n% VM_LEGACY_MACROS_END\n';
}
window.vmLegacyTexCompatPreamble = vmLegacyTexCompatPreamble;

function vmChenLegacyTexCompatPreamble(source) {
  var tex = String(source || '');
  if (tex.indexOf('% VM_LEGACY_MACROS_BEGIN') !== -1) return tex;
  var block = vmLegacyTexCompatPreamble(tex);
  if (!block) return tex;
  var at = tex.search(/\\begin\s*\{document\}/);
  return at >= 0 ? tex.slice(0, at) + block + tex.slice(at) : block + tex;
}
window.vmChenLegacyTexCompatPreamble = vmChenLegacyTexCompatPreamble;

// Mot so bo de ex_test dinh nghia cac lenh ve khoang trong file .sty thay vi
// trong tep .tex. Trinh doc dung standalone nen can lop tuong thich nho nay.
// Chi chen khi hinh thuc su dung ho lenh Interval, khong lam cham cac hinh TikZ khac.
function vmTikzCompatPreamble(source) {
  if (!/\\Interval(?:LR|G|GL|GR|GLF|GRF|L|R|LF|RF)?\b/.test(String(source || ''))) return '';
  var points = '\\coordinate (a) at (#2,0);\\node at (a) {$#1$};\\node[below=4pt] at (a) {$#2$};\\coordinate (b) at (#4,0);\\node at (b) {$#3$};\\node[below=4pt] at (b) {$#4$};';
  var storedPoints = '\\coordinate (a) at (\\pre,0);\\node at (a) {$#1$};\\node[below=4pt] at (a) {$#2$};\\coordinate (b) at (\\next,0);\\node at (b) {$#3$};\\node[below=4pt] at (b) {$#4$};';
  return [
    '\\providecolor{colorInterval}{named}{blue}',
    '\\providecommand{\\skipInterval}{0.5cm}',
    '\\providecommand{\\IntervalLR}[2]{\\def\\pre{#1}\\def\\next{#2}}',
    '\\providecommand{\\IntervalG}[4]{' + storedPoints + '\\draw[colorInterval,thick] (a)--(b);}',
    '\\providecommand{\\IntervalGL}[4]{' + storedPoints + '\\draw[colorInterval,thick] (a)--(b);}',
    '\\providecommand{\\IntervalGR}[4]{' + storedPoints + '\\draw[colorInterval,thick] (a)--(b);}',
    '\\providecommand{\\IntervalGLF}[4]{' + storedPoints + '\\fill[pattern=north west lines,pattern color=colorInterval] (\\pre,-3pt) rectangle (\\next,3pt);}',
    '\\providecommand{\\IntervalGRF}[4]{' + storedPoints + '\\fill[pattern=north east lines,pattern color=colorInterval] (\\pre,-3pt) rectangle (\\next,3pt);}',
    '\\providecommand{\\IntervalL}[4]{\\IntervalLR{#2}{#4}\\IntervalGL{#1}{#2}{#3}{#4}}',
    '\\providecommand{\\IntervalR}[4]{\\IntervalLR{#2}{#4}\\IntervalGR{#1}{#2}{#3}{#4}}',
    '\\providecommand{\\IntervalLF}[4]{\\IntervalLR{#2}{#4}\\IntervalGLF{#1}{#2}{#3}{#4}}',
    '\\providecommand{\\IntervalRF}[4]{\\IntervalLR{#2}{#4}\\IntervalGRF{#1}{#2}{#3}{#4}}',
    '\\providecommand{\\Interval}[4]{' + points + '\\draw[colorInterval,thick] (a)--(b);}'
  ].join('\n') + '\n';
}

function vmTexTikzPreview(items, batch) {
  var list = Array.isArray(items) ? items : [items];
  var preamble = list.map(function (item) { return String(item && item.preamble || ''); }).filter(function (value,index,all) { return value && all.indexOf(value) === index; }).join('\n');
  var sources = list.map(function (item) { return vmChuanHoaTikzSource(item && item.source || ''); }).join('\n');
  var optional = '';
  if (/\\tkzTab/.test(sources)) optional += '\\usepackage{tkz-tab}\n';
  if (/\\begin\{forest\}/.test(sources)) optional += '\\usepackage{forest}\n';
  if (/\\begin\{circuitikz\}/.test(sources)) optional += '\\usepackage{circuitikz}\n';
  return '\\documentclass[' + (batch ? 'multi=tikzpicture,' : 'tikz,') + 'border=6pt]{standalone}\n' +
    '\\usepackage[T5]{fontenc}\n\\usepackage[utf8]{inputenc}\n\\usepackage{xcolor}\n' +
    '\\usepackage{amsmath,amssymb,mathtools}\n\\usepackage{tikz,tkz-euclide,pgfplots}\n' + optional +
    vmMauTikzPreview(preamble + '\n' + sources) + vmTikzCompatPreamble(sources) + '\\pgfplotsset{compat=1.18}\n' +
    '\\usetikzlibrary{calc,intersections,angles,quotes,arrows,arrows.meta,patterns,patterns.meta,positioning,shapes,shapes.geometric,decorations.pathmorphing,decorations.markings,decorations.text,backgrounds,fit,matrix,snakes,shadows,lindenmayersystems,shadings,fadings}\n' +
    '\\usepgfplotslibrary{fillbetween}\n' +
    vmKhaiBaoTikzPreview(preamble) + '\n' + vmLegacyTexCompatPreamble(preamble + '\n' + sources) +
    '\\begin{document}\n' + sources + '\n\\end{document}';
}

function vmTaiPdfJsTikz() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window._vmTikzPdfJsPromise) return window._vmTikzPdfJsPromise;
  var script = null;
  var loading = new Promise(function (resolve, reject) {
    script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = function () {
      if (!window.pdfjsLib) {
        var missing = new Error('pdf.js đã tải nhưng chưa khởi tạo');
        missing.code = 'VM_TIKZ_PDFJS'; reject(missing); return;
      }
      var worker = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
      resolve(window.pdfjsLib);
    };
    script.onerror = function () {
      var loadError = new Error('Không tải được bộ đọc PDF cho hình TikZ');
      loadError.code = 'VM_TIKZ_PDFJS'; reject(loadError);
    };
    document.head.appendChild(script);
  });
  window._vmTikzPdfJsPromise = vmTikzVoiGioiHan(
    loading,
    vmTikzGioiHan('pdfjs', 12000),
    'Bộ đọc PDF cho TikZ tải quá lâu',
    function () { if (script && script.parentNode) script.parentNode.removeChild(script); }
  ).catch(function (error) {
    window._vmTikzPdfJsPromise = null;
    if (script && script.parentNode) script.parentNode.removeChild(script);
    throw error;
  });
  return window._vmTikzPdfJsPromise;
}

async function vmVeTrangTikz(pdf, pageNumber, figure) {
  var page = await vmTikzVoiGioiHan(
    pdf.getPage(pageNumber),
    vmTikzGioiHan('pdfPage', 15000),
    'Đọc trang TikZ quá thời gian'
  );
  var scale = Math.min(2.25, Math.max(1.5, window.devicePixelRatio || 1));
  var viewport = vmTikzViewportAnToan(page, scale);
  var canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Hình minh họa TikZ');
  var renderTask = page.render({ canvasContext: canvas.getContext('2d', { alpha:true }), viewport:viewport, background:'rgba(0,0,0,0)' });
  await vmTikzVoiGioiHan(
    renderTask.promise,
    vmTikzGioiHan('pdfRender', 20000),
    'Vẽ hình TikZ quá thời gian',
    function () { if (renderTask && typeof renderTask.cancel === 'function') renderTask.cancel(); }
  );
  // PDF.js có thể tô nền trang gần-trắng dù canvas dùng alpha. Loại đúng
  // các pixel nền trắng thuần để hình hòa vào theme; nét và vùng tô vẫn giữ.
  try {
    var context = canvas.getContext('2d', { alpha:true });
    var pixels = context.getImageData(0,0,canvas.width,canvas.height);
    for (var p=0;p<pixels.data.length;p+=4) {
      if (pixels.data[p] > 249 && pixels.data[p+1] > 249 && pixels.data[p+2] > 249) pixels.data[p+3] = 0;
    }
    context.putImageData(pixels,0,0);
  } catch (_) {}
  figure.innerHTML = ''; figure.appendChild(canvas);
  figure.setAttribute('data-vm-tikz-ready', 'done');
}

async function vmMoPdfTikz(blob) {
  var lib = await vmTaiPdfJsTikz();
  var loadingTask = lib.getDocument({ data:await blob.arrayBuffer() });
  return vmTikzVoiGioiHan(
    loadingTask.promise,
    vmTikzGioiHan('pdfOpen', 20000),
    'Mở bản PDF TikZ quá thời gian',
    function () { if (loadingTask && typeof loadingTask.destroy === 'function') loadingTask.destroy(); }
  );
}

function vmTikzViewportAnToan(page, preferredScale) {
  var base = page.getViewport({ scale:1 });
  var scale = Math.max(.1, Number(preferredScale) || 1);
  var width = base.width * scale, height = base.height * scale;
  var bySide = Math.min(1, 4096 / Math.max(width, height, 1));
  var byArea = Math.min(1, Math.sqrt(12000000 / Math.max(width * height, 1)));
  return page.getViewport({ scale:scale * Math.min(bySide, byArea) });
}

async function vmRenderTikzEntriesNhanh(entries) {
  if (!entries.length) return;
  try {
    // standalone multi=tikzpicture tạo một trang cho mỗi hình: một lần gọi
    // máy chủ có thể dựng toàn bộ bảng hình thay vì N lần gọi liên tiếp.
    var batchBlob = await vmLayTikzPdfNhanh(vmTexTikzPreview(entries.map(function (entry) { return entry.item; }), true));
    var pdf = await vmMoPdfTikz(batchBlob);
    if (pdf.numPages < entries.length) throw new Error('Bản TikZ theo lô thiếu trang');
    await Promise.all(entries.map(function (entry, index) { return vmVeTrangTikz(pdf, index + 1, entry.figure); }));
  } catch (batchError) {
    if (batchError && (batchError.code === 'VM_TIKZ_TIMEOUT' || batchError.code === 'VM_TIKZ_PDFJS')) {
      entries.forEach(function (entry) { vmDatLoiTikz(entry.figure, batchError); });
      return;
    }
    var next = 0;
    async function worker() {
      while (next < entries.length) {
        var entry = entries[next++];
        try {
          var blob = await vmLayTikzPdfNhanh(vmTexTikzPreview(entry.item, false));
          var pdf = await vmMoPdfTikz(blob);
          await vmVeTrangTikz(pdf, 1, entry.figure);
        } catch (error) {
          vmDatLoiTikz(entry.figure, error);
        }
      }
    }
    await Promise.all([worker(), worker()]);
  }
}

async function vmRenderTikzPreviewNhanh(root) {
  if (!root || !window.vmLatexTikzRegistry) return;
  var figures = Array.prototype.slice.call(root.querySelectorAll('.vm-tex-tikz')).filter(function (figure) {
    var state = figure.getAttribute('data-vm-tikz-ready');
    return state !== 'done' && state !== 'queued';
  });
  if (window.vmTikzAutoObserver) figures.forEach(function (figure) { try { window.vmTikzAutoObserver.unobserve(figure); } catch (e) {} });
  var entries = figures.map(function (figure) {
    return { figure:figure, item:window.vmLatexTikzRegistry[figure.getAttribute('data-vm-tikz')] };
  });
  entries.filter(function (entry) { return !entry.item; }).forEach(function (entry) {
    vmDatLoiTikz(entry.figure, new Error('Không còn dữ liệu nguồn để kết xuất hình này'));
  });
  entries = entries.filter(function (entry) { return !!entry.item; });
  if (!entries.length) return;
  entries.forEach(function (entry) { entry.figure.setAttribute('data-vm-tikz-ready', 'queued'); });
  await vmRenderTikzEntriesNhanh(entries);
}

// Tự quan sát mọi bộ đọc dùng latexRaHTML. Hình chỉ được dựng khi sắp đi vào
// vùng nhìn; những hình gần nhau được gom thành một lần biên dịch.
var vmTikzAutoQueue = [];
var vmTikzAutoActive = false;
var vmTikzAutoTimer = 0;

function vmXepHangTikzTuDong(figure) {
  if (!figure || figure.getAttribute('data-vm-tikz-ready') === 'done' || figure.getAttribute('data-vm-tikz-ready') === 'queued') return;
  figure.setAttribute('data-vm-tikz-ready', 'queued');
  if (vmTikzAutoQueue.indexOf(figure) === -1) vmTikzAutoQueue.push(figure);
  clearTimeout(vmTikzAutoTimer);
  vmTikzAutoTimer = setTimeout(vmChayHangTikzTuDong, 70);
}

async function vmChayHangTikzTuDong() {
  if (vmTikzAutoActive || !vmTikzAutoQueue.length) return;
  vmTikzAutoActive = true;
  var figures = vmTikzAutoQueue.splice(0, 12);
  var entries = figures.map(function (figure) {
    return { figure:figure, item:window.vmLatexTikzRegistry && window.vmLatexTikzRegistry[figure.getAttribute('data-vm-tikz')] };
  });
  entries.filter(function (entry) { return !entry.item; }).forEach(function (entry) {
    vmDatLoiTikz(entry.figure, new Error('Không còn dữ liệu nguồn để kết xuất hình này'));
  });
  entries = entries.filter(function (entry) { return !!entry.item; });
  try { await vmRenderTikzEntriesNhanh(entries); }
  finally {
    vmTikzAutoActive = false;
    if (vmTikzAutoQueue.length) vmTikzAutoTimer = setTimeout(vmChayHangTikzTuDong, 30);
  }
}

function vmQuanSatTikzTuDong(root) {
  if (!root || !root.querySelectorAll) return;
  var figures = Array.prototype.slice.call(root.matches && root.matches('.vm-tex-tikz') ? [root] : root.querySelectorAll('.vm-tex-tikz'));
  figures.forEach(function (figure) {
    if (figure.hasAttribute('data-vm-tikz-ready')) return;
    if (window.vmTikzAutoObserver) {
      figure.setAttribute('data-vm-tikz-ready', 'observed');
      window.vmTikzAutoObserver.observe(figure);
    } else vmXepHangTikzTuDong(figure);
  });
}

function vmBatDauTikzTuDong() {
  if (!document.body || window.vmTikzAutoStarted || window.vmDisableGlobalTikzAuto) return;
  window.vmTikzAutoStarted = true;
  if ('IntersectionObserver' in window) {
    window.vmTikzAutoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        window.vmTikzAutoObserver.unobserve(entry.target);
        vmXepHangTikzTuDong(entry.target);
      });
    }, { rootMargin:'700px 0px' });
  }
  vmQuanSatTikzTuDong(document.body);
  new MutationObserver(function (records) {
    records.forEach(function (record) { Array.prototype.forEach.call(record.addedNodes || [], vmQuanSatTikzTuDong); });
  }).observe(document.body, { childList:true, subtree:true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vmBatDauTikzTuDong);
else setTimeout(vmBatDauTikzTuDong, 0);

// LaTeX cho phep chen $...$ ben trong \text{...} cua align, nhung KaTeX
// dang o math mode se coi dau $ do la loi. Tach phan toan ra khoi \text.
function vmChuanHoaTextTrongToan(src) {
  var text = String(src || '');
  var out = '', from = 0;
  while (from < text.length) {
    var at = text.indexOf('\\text{', from);
    if (at === -1) { out += text.slice(from); break; }
    out += text.slice(from, at);
    var brace = at + '\\text'.length;
    var depth = 1, i = brace + 1;
    while (i < text.length && depth > 0) {
      if (text.charAt(i) === '{' && text.charAt(i - 1) !== '\\') depth++;
      else if (text.charAt(i) === '}' && text.charAt(i - 1) !== '\\') depth--;
      i++;
    }
    if (depth !== 0) { out += text.slice(at); break; }
    var content = text.slice(brace + 1, i - 1);
    content = content.replace(/(^|[^\\])\$([^$]+)\$/g, function (_, prefix, math) {
      return prefix + '}' + math + '\\text{';
    });
    out += '\\text{' + content + '}';
    from = i;
  }
  return out;
}

// Bỏ chú thích % (giữ \% là ký hiệu phần trăm thật)
function lamSachLatex(src) {
  if (!src) return '';
  var out = src.replace(/(^|[^\\])%[^\n]*/g, '$1');
  out = out.replace(/\\begin\{center\}|\\end\{center\}/g, ' ');
  out = out.replace(/\\(hetcot|vspace\{[^}]*\}|hspace\{[^}]*\})/g, ' ');
  return out;
}

function vmDocKhoiNgoac(src, start) {
  var text = String(src || '');
  var at = start;
  while (/\s/.test(text.charAt(at))) at++;
  if (text.charAt(at) !== '{') return null;
  var depth = 1, i = at + 1;
  while (i < text.length && depth > 0) {
    if (text.charAt(i) === '{' && text.charAt(i - 1) !== '\\') depth++;
    else if (text.charAt(i) === '}' && text.charAt(i - 1) !== '\\') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { content: text.slice(at + 1, i - 1), end: i };
}

function vmDocNhomCanBang(src, start, open, close) {
  var text = String(src || '');
  var at = start;
  while (/\s/.test(text.charAt(at))) at++;
  if (text.charAt(at) !== open) return null;
  var depth = 1, i = at + 1;
  while (i < text.length && depth > 0) {
    if (text.charAt(i) === open && text.charAt(i - 1) !== '\\') depth++;
    else if (text.charAt(i) === close && text.charAt(i - 1) !== '\\') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { content:text.slice(at + 1, i - 1), start:at, end:i };
}

// Cac bo DGNL dung \immini{noi dung}{hinh}. Tren web ta giu du ca hai
// khoi theo thu tu doc thay vi xoa ten lenh va de lo cap ngoac nhon.
function vmThayLenhHaiKhoi(src, command, replacer) {
  var text = String(src || '');
  var token = '\\' + command;
  var from = 0;
  while (from < text.length) {
    var at = text.indexOf(token, from);
    if (at === -1) break;
    var after = at + token.length;
    if (/[A-Za-z@]/.test(text.charAt(after))) { from = after; continue; }
    while (/\s/.test(text.charAt(after))) after++;
    var optional = vmDocNhomCanBang(text, after, '[', ']');
    if (optional) after = optional.end;
    var first = vmDocKhoiNgoac(text, after);
    var second = first ? vmDocKhoiNgoac(text, first.end) : null;
    if (!first || !second) { from = after; continue; }
    var replacement = replacer(first.content, second.content);
    text = text.slice(0, at) + replacement + text.slice(second.end);
    from = at + replacement.length;
  }
  return text;
}

function vmTachTieuDeMoiTruong(content) {
  var block = vmDocKhoiNgoac(content, 0);
  if (!block) return { title: '', content: String(content || '') };
  return { title: block.content, content: String(content || '').slice(block.end) };
}

// Bao ve cac moi truong rieng trong bo de DGNL truoc khi chuoi duoc escape.
// Chay tu khoi trong ra ngoai de xu ly duoc cac callout long nhau.
function vmBaoVeKhoiNoiDung(src) {
  var text = String(src || '');
  var environments = [
    'boxdn', 'boxdl', 'boxkn', 'boxtb', 'boxvidu', 'boxvdlt', 'kttrongtam',
    'mydn', 'mydl', 'myvidu', 'vidu', 'vdlt', 'ap', 'bttuongtu', 'makerr',
    'luuy', 'tomtat', 'dang', 'dangg', 'khung4', 'noidung', 'hd', 'trithuc',
    'luyentap', 'vandung', 'phantich', 'tttt', 'tc', 'nx', 'note'
  ];
  if (typeof window !== 'undefined' && typeof window.vmDanhSachTenMoiTruongTex === 'function') {
    environments = environments.concat(window.vmDanhSachTenMoiTruongTex());
  }
  environments = environments.map(function (name) { return String(name || '').toLowerCase(); })
    .filter(function (name, index, all) { return /^[a-z][a-z0-9@_-]*$/.test(name) && all.indexOf(name) === index; });
  var limit = 200, searchEnds = {};
  while (limit-- > 0) {
    var hit = null;
    environments.forEach(function (env) {
      var token = '\\begin{' + env + '}';
      var endAt = Object.prototype.hasOwnProperty.call(searchEnds, env) ? searchEnds[env] : text.length;
      var at = text.lastIndexOf(token, endAt);
      if (at !== -1 && (!hit || at > hit.at)) hit = { env:env, token:token, at:at };
    });
    if (!hit) break;
    var bodyAt = hit.at + hit.token.length;
    var close = vmTimDongMoiTruong(text, hit.env, bodyAt);
    if (!close) {
      searchEnds[hit.env] = hit.at - 1;
      continue;
    }
    var info = { env:hit.env, content:text.slice(bodyAt, close.start), title:'' };
    if (/^(dang|dangg|khung4|noidung)$/.test(info.env)) {
      var titled = vmTachTieuDeMoiTruong(info.content);
      info.title = titled.title;
      info.content = titled.content;
    }
    var token = 'VMCONTENT' + (++vmLatexContentSeq);
    vmLatexContentRegistry[token] = info;
    text = text.slice(0, hit.at) + '\n___' + token + '___\n' + text.slice(close.end);
    searchEnds = {};
  }
  return text;
}

function vmKhoiNoiDungSangHtml(html) {
  var labels = {
    boxdn: 'Định nghĩa', mydn: 'Định nghĩa', boxkn: 'Khái niệm', kttrongtam: 'Kiến thức trọng tâm', trithuc: 'Tri thức',
    boxdl: 'Định lý', mydl: 'Định lý', hd: 'Hướng dẫn', luuy: 'Lưu ý', note: 'Lưu ý', makerr: 'Chú ý', nx: 'Nhận xét',
    boxvidu: 'Ví dụ', myvidu: 'Ví dụ', vidu: 'Ví dụ', boxvdlt: 'Ví dụ lý thuyết', vdlt: 'Ví dụ lý thuyết',
    ap: 'Áp dụng', bttuongtu: 'Bài tập tương tự', luyentap: 'Luyện tập', vandung: 'Vận dụng',
    phantich: 'Phân tích', tttt: 'Tóm tắt', tc: 'Tính chất', boxtb: 'Thông báo', dang: 'Dạng toán', dangg: 'Dạng toán'
  };
  var classMap = {
    boxdn: 'definition', mydn: 'definition', boxkn: 'definition', kttrongtam: 'definition', trithuc: 'definition', tc: 'definition',
    boxdl: 'theorem', mydl: 'theorem', hd: 'theorem', boxvidu: 'example', myvidu: 'example', vidu: 'example', boxvdlt: 'example', vdlt: 'example',
    luuy: 'note', note: 'note', makerr: 'note', nx: 'remark', boxtb: 'remark',
    dang: 'form', dangg: 'form', khung4: 'form', noidung: 'form',
    ap: 'practice', bttuongtu: 'practice', luyentap: 'practice', vandung: 'practice', phantich: 'remark', tttt: 'summary'
  };
  var out = String(html || '');
  var configuredCounters = {};
  var limit = 50;
  while (/___VMCONTENT\d+___/.test(out) && limit-- > 0) {
    out = out.replace(/___(VMCONTENT\d+)___/g, function (match, token) {
      var info = vmLatexContentRegistry[token];
      if (!info) return '';
      var body = dinhDangVanBanTaiLieuLatex(info.content || '');
      if (info.env === 'tomtat') return '<section class="vm-tex-summary">' + body + '</section>';
      var configured = typeof window !== 'undefined' && typeof window.vmLayMoiTruongTex === 'function'
        ? window.vmLayMoiTruongTex(info.env) : null;
      var title = info.title ? dinhDangVanBanTaiLieuLatex(info.title) :
        (configured && configured.display_name ? configured.display_name : (labels[info.env] || 'Ghi chú'));
      var tone = configured && configured.tone ? configured.tone : (classMap[info.env] || 'remark');
      var canonical = configured && configured.environment_name ? configured.environment_name : info.env;
      var numberLabel = '';
      if (configured && configured.is_numbered) {
        var counterKey = configured.counter_group || canonical;
        configuredCounters[counterKey] = (configuredCounters[counterKey] || 0) + 1;
        numberLabel = ' ' + configuredCounters[counterKey];
      }
      var icon = configured && configured.icon ? '<span class="vm-tex-env-icon" aria-hidden="true">' + configured.icon + '</span>' : '';
      return '<aside class="vm-tex-callout vm-tex-callout-' + tone + '" data-vm-env="' + canonical + '">' +
        '<div class="vm-tex-callout-title">' + icon + title + numberLabel + '</div>' +
        '<div class="vm-tex-callout-body">' + body + '</div></aside>';
    });
  }
  return out;
}

function vmThayLenhNhieuKhoi(src, command, count, replacer) {
  var text = String(src || '');
  var token = '\\' + command;
  var from = 0;
  while (from < text.length) {
    var at = text.indexOf(token, from);
    if (at === -1) break;
    var after = at + token.length;
    if (/[A-Za-z@]/.test(text.charAt(after))) { from = after; continue; }
    var blocks = [], cursor = after, ok = true;
    for (var i = 0; i < count; i++) {
      var block = vmDocKhoiNgoac(text, cursor);
      if (!block) { ok = false; break; }
      blocks.push(block.content); cursor = block.end;
    }
    if (!ok) { from = after; continue; }
    var replacement = replacer.apply(null, blocks);
    text = text.slice(0, at) + replacement + text.slice(cursor);
    from = at + replacement.length;
  }
  return text;
}

function vmTimDongMoiTruong(src, env, from) {
  var beginToken = '\\begin{' + env + '}';
  var endToken = '\\end{' + env + '}';
  var depth = 1, cursor = from;
  while (cursor < src.length) {
    var nextBegin = src.indexOf(beginToken, cursor);
    var nextEnd = src.indexOf(endToken, cursor);
    if (nextEnd === -1) return null;
    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth++; cursor = nextBegin + beginToken.length;
    } else {
      depth--;
      if (depth === 0) return { start: nextEnd, end: nextEnd + endToken.length };
      cursor = nextEnd + endToken.length;
    }
  }
  return null;
}

function vmThayMoiTruongCanBang(src, environment, replacer, bodyStart) {
  var text = String(src || '');
  var token = '\\begin{' + environment + '}';
  var limit = 200, searchEnd = text.length;
  while (limit-- > 0) {
    var at = text.lastIndexOf(token, searchEnd);
    if (at === -1) break;
    var after = at + token.length;
    var contentAt = typeof bodyStart === 'function' ? bodyStart(text, after, environment) : after;
    if (contentAt == null) { searchEnd = at - 1; continue; }
    var close = vmTimDongMoiTruong(text, environment, contentAt);
    if (!close) { searchEnd = at - 1; continue; }
    var content = text.slice(contentAt, close.start);
    var replacement = typeof replacer === 'function'
      ? replacer(content, { environment:environment, begin:at, contentStart:contentAt, end:close.end })
      : String(replacer || '');
    text = text.slice(0, at) + replacement + text.slice(close.end);
    searchEnd = text.length;
  }
  return text;
}

function vmSauDoiSoMoiTruong(text, at, environment) {
  var cursor = at;
  function skip() { while (/\s/.test(text.charAt(cursor))) cursor++; }
  function optional(open, close) {
    skip();
    var group = vmDocNhomCanBang(text, cursor, open, close);
    if (!group) return false;
    cursor = group.end;
    return true;
  }
  if (environment === 'minipage') {
    optional('[', ']');
    skip();
    var width = vmDocNhomCanBang(text, cursor, '{', '}');
    if (!width) return null;
    return width.end;
  }
  if (environment === 'figure' || environment === 'tcolorbox' || environment === 'description') {
    optional('[', ']');
    return cursor;
  }
  if (environment === 'tasks' || environment === 'taskEX') {
    var count = 0;
    while (count++ < 4) {
      if (optional('[', ']') || optional('(', ')')) continue;
      break;
    }
    return cursor;
  }
  if (environment === 'dinglist') {
    skip();
    var symbol = vmDocNhomCanBang(text, cursor, '{', '}');
    if (!symbol) return null;
    return symbol.end;
  }
  return cursor;
}

function vmTaskSangItem(src) {
  var text = String(src || ''), token = '\\task', from = 0;
  while (from < text.length) {
    var at = text.indexOf(token, from);
    if (at === -1) break;
    var after = at + token.length;
    if (/[A-Za-z@]/.test(text.charAt(after))) { from = after; continue; }
    var label = vmDocNhomCanBang(text, after, '[', ']');
    var replacement = '\\item' + (label ? '[' + label.content + ']' : ' ');
    text = text.slice(0, at) + replacement + text.slice(label ? label.end : after);
    from = at + replacement.length;
  }
  return text;
}

// Chỉ bóc các khung trình bày an toàn. Không đụng scope/axis vì đó là cấu
// trúc ngữ nghĩa của TikZ/PGFPlots và phải được giữ nguyên để biên dịch hình.
function vmChuanHoaMoiTruongVanBan(src, options) {
  options = options || {};
  var text = String(src || '');
  ['minipage', 'flushleft', 'flushright', 'figure', 'tcolorbox', 'scriptsize'].forEach(function (environment) {
    text = vmThayMoiTruongCanBang(text, environment, function (content) { return '\n' + content + '\n'; }, vmSauDoiSoMoiTruong);
  });
  ['tasks', 'taskEX'].forEach(function (environment) {
    text = vmThayMoiTruongCanBang(text, environment, function (content) {
      return '\n\\begin{enumerate}[a)]\n' + vmTaskSangItem(content) + '\n\\end{enumerate}\n';
    }, vmSauDoiSoMoiTruong);
  });
  text = vmThayMoiTruongCanBang(text, 'description', function (content) {
    return '\n\\begin{itemize}\n' + content + '\n\\end{itemize}\n';
  }, vmSauDoiSoMoiTruong);
  text = vmThayMoiTruongCanBang(text, 'dinglist', function (content) {
    return '\n\\begin{itemize}\n' + content + '\n\\end{itemize}\n';
  }, vmSauDoiSoMoiTruong);
  text = vmThayMoiTruongCanBang(text, 'onlysolution', function (content) {
    return options.showSolutions === false ? '' : '\n\\begin{solution}\n' + content + '\n\\end{solution}\n';
  }, vmSauDoiSoMoiTruong);
  return text;
}

function vmNoiDungBangSangHtml(body) {
  var text = String(body || '')
    .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, '')
    .replace(/\\(?:cline|cmidrule)(?:\([^)]*\))?\{[^}]*\}/g, '')
    .replace(/\\(?:rowcolor|cellcolor)\{[^}]*\}/g, '')
    .replace(/\\addlinespace(?:\[[^\]]*\])?/g, '');
  ['tabular','tabularx','tabular*','array'].forEach(function (env) {
    var limit = 40;
    while (limit-- > 0) {
      var token = '\\begin{' + env + '}', at = text.lastIndexOf(token);
      if (at === -1) break;
      var argsAt = at + token.length, first = vmDocKhoiNgoac(text, argsAt);
      if (!first) break;
      var bodyAt = first.end;
      if (env === 'tabularx' || env === 'tabular*') {
        var second = vmDocKhoiNgoac(text, bodyAt); if (!second) break; bodyAt = second.end;
      }
      var close = vmTimDongMoiTruong(text, env, bodyAt); if (!close) break;
      var flat = text.slice(bodyAt, close.start).replace(/&amp;/g,' · ').replace(/\\\\(?:\[[^\]]*\])?|\\tabularnewline/g,'<br>');
      text = text.slice(0,at) + flat + text.slice(close.end);
    }
  });
  text = vmThayLenhNhieuKhoi(text, 'multicolumn', 3, function (_, __, content) { return content; });
  text = vmThayLenhNhieuKhoi(text, 'multirow', 3, function (_, __, content) { return content; });
  text = vmThayLenhNhieuKhoi(text, 'makecell', 1, function (content) { return content; });
  text = text.replace(/\\&amp;/g, '___VM_ESCAPED_AMP___');
  var rows = text.split(/\\\\(?:\[[^\]]*\])?|\\tabularnewline/g)
    .map(function (row) { return row.trim(); })
    .filter(function (row) { return row.length; });
  var html = rows.map(function (row) {
    var cells = row.split('&amp;').map(function (cell) {
      var clean = cell.replace(/___VM_ESCAPED_AMP___/g, '&amp;').trim();
      return '<td>' + clean + '</td>';
    }).join('');
    return '<tr>' + cells + '</tr>';
  }).join('');
  return '</p><div class="vm-tex-table-wrap"><table class="vm-tex-table"><tbody>' + html + '</tbody></table></div><p>';
}

// Đọc khai báo cột bằng bộ đếm ngoặc thay vì regex. Nhờ vậy các cột kiểu
// m{5cm}, p{.3\\linewidth}, tabularx... không còn rơi ra thành chữ thô.
function tabularSangBangHTML(src) {
  var text = String(src || '');
  var environments = ['tabularx', 'tabular*', 'longtable', 'tabular', 'tblr', 'array'];
  var cursor = 0;
  while (cursor < text.length) {
    var hit = null;
    environments.forEach(function (env) {
      var token = '\\begin{' + env + '}';
      var at = text.indexOf(token, cursor);
      if (at !== -1 && (!hit || at < hit.at)) hit = { env: env, token: token, at: at };
    });
    if (!hit) break;
    var argsAt = hit.at + hit.token.length;
    while (/\s/.test(text.charAt(argsAt))) argsAt++;
    var optional = vmDocNhomCanBang(text, argsAt, '[', ']');
    if (optional) argsAt = optional.end;
    var first = vmDocKhoiNgoac(text, argsAt);
    if (!first) { cursor = argsAt; continue; }
    var bodyAt = first.end;
    if (hit.env === 'tabularx' || hit.env === 'tabular*') {
      var second = vmDocKhoiNgoac(text, bodyAt);
      if (!second) { cursor = bodyAt; continue; }
      bodyAt = second.end;
    }
    var close = vmTimDongMoiTruong(text, hit.env, bodyAt);
    if (!close) { cursor = bodyAt; continue; }
    var replacement = vmNoiDungBangSangHtml(text.slice(bodyAt, close.start));
    text = text.slice(0, hit.at) + replacement + text.slice(close.end);
    cursor = hit.at + replacement.length;
  }
  return text;
}

// LaTeX -> chuỗi HTML an toàn (công thức $...$ giữ nguyên chờ KaTeX)
function latexRaHTML(src) {
  var prepared = vmThayLenhHaiKhoi(String(src || ''), 'immini', function (left, right) { return left + '\n\n' + right; });
  var shortAnswerTokens = [];
  prepared = thayLenhKhoiLatex(prepared, 'shortans', function () {
    var token = '___VMSHORTANSWER_' + shortAnswerTokens.length + '___';
    shortAnswerTokens.push('<span class="vm-tex-short-answer">Ô trả lời ngắn</span>');
    return token;
  });
  var s = vmBaoVeKhoiTikz(lamSachLatex(prepared), src || '');
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Bảo vệ các khối công thức toán học tránh bị biên dịch sai ký tự (như \\ thành <br>)
  var mathBlocks = [];
  
  // 1. Bao ve delimiter display truoc de mot moi truong cases/align nam trong
  // \[...\] chi tao dung mot placeholder. Cach cu tao placeholder long nhau;
  // khi trinh duyet con giu mot ban JS cu hoac khoi co dau so sanh, KaTeX co
  // the nhan lai nguyen \[\begin{cases}... va hien ma mau do.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('$$' + vmChuanHoaTextTrongToan(math) + '$$');
    return placeholder;
  });
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('\\[' + vmChuanHoaTextTrongToan(math) + '\\]');
    return placeholder;
  });

  // Protect inline delimiters before bare display environments. Otherwise
  // $\begin{cases}...\end{cases}$ becomes an invalid nested $\[...\]$.
  s = s.replace(/(^|[^\\])\$([\s\S]*?)\$/g, function (match, prefix, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    var normalized = vmChuanHoaTextTrongToan(math);
    var isDisplayEnvironment = /\\begin\{(?:equation\*?|align\*?|alignat\*?|aligned|split|gather\*?|multline\*?|eqnarray\*?|cases)\}/.test(normalized);
    mathBlocks.push(isDisplayEnvironment ? '\\[' + normalized + '\\]' : '$' + normalized + '$');
    return prefix + placeholder;
  });
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('\\(' + vmChuanHoaTextTrongToan(math) + '\\)');
    return placeholder;
  });

  // 2. Cac moi truong display khong co delimiter van duoc boc cho KaTeX.
  s = s.replace(/\\begin\{(equation\*?|align\*?|alignat\*?|aligned|split|gather\*?|multline\*?|eqnarray\*?|cases)\}([\s\S]*?)\\end\{\1\}/g, function (match, env, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    var katexBody = vmChuanHoaTextTrongToan(math);
    if (/^(align|alignat|eqnarray)/.test(env)) katexBody = '\\begin{aligned}' + katexBody + '\\end{aligned}';
    else if (/^gather/.test(env)) katexBody = '\\begin{gathered}' + katexBody + '\\end{gathered}';
    else if (/^multline/.test(env)) katexBody = '\\begin{aligned}' + katexBody + '\\end{aligned}';
    else if (env === 'cases' || env === 'aligned' || env === 'split') katexBody = '\\begin{' + (env === 'split' ? 'aligned' : env) + '}' + katexBody + '\\end{' + (env === 'split' ? 'aligned' : env) + '}';
    mathBlocks.push('\\[' + katexBody + '\\]');
    return placeholder;
  });

  // Dau ngoac kep/don cua bo go lenh Viet (\lq, \rq) chi la van ban,
  // nen chuyen sau khi da bao ve cong thuc de khong cham vao math mode.
  s = s.replace(/\\lq\s*\\lq\s*/g, '&ldquo;').replace(/\s*\\rq\s*\\rq/g, '&rdquo;');
  s = s.replace(/\\lq\b/g, '&lsquo;').replace(/\\rq\b/g, '&rsquo;');
  s = s.replace(/\\(?:enspace|quad|qquad|space|thinspace|medspace|thickspace|negthinspace|negmedspace|negthickspace)\b|\\[,;!:]/g, ' ');
  s = s.replace(/\\(?:hskip|vskip|kern|mkern)\s*-?[\d.]+\s*(?:pt|em|ex|mu|cm|mm|in)\b/g, ' ');

  // 4. Biên dịch các môi trường định dạng LaTeX sang HTML
  s = tabularSangBangHTML(s);
  
  // Bold & Italic
  s = s.replace(/\\textbf\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<b>$1</b>');
  s = s.replace(/\\textit\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<i>$1</i>');
  s = s.replace(/\\text\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  
  // Môi trường listEX (gói ex_test) -> hiển thị như danh sách trên web.
  // Tham số [n] của listEX là SỐ CỘT khi in PDF, web bỏ qua và xếp dọc cho dễ đọc.
  s = s.replace(/\\begin\{listEX\}\s*(?:\[[^\]]*\])?/g, '\\begin{enumerate}[a)]');
  s = s.replace(/\\end\{listEX\}/g, '\\end{enumerate}');
  s = s.replace(/\\begin\{itemchoice\}\s*(?:\[[^\]]*\])?/g, '\\begin{enumerate}[a)]');
  s = s.replace(/\\end\{itemchoice\}/g, '\\end{enumerate}');
  s = s.replace(/\\itemch\b/g, '\\item');
  s = s.replace(/\\begin\{enumEX\}\s*(?:\[([^\]]*)\])?\s*\{[^}]*\}/g, function (_, style) {
    return '\\begin{enumerate}[' + (style || 'a)') + ']';
  });
  s = s.replace(/\\end\{enumEX\}/g, '\\end{enumerate}');
  s = s.replace(/\\begin\{multicols\}\{[^}]*\}|\\end\{multicols\}|\\columnbreak/g, ' ');

  // Đệ quy xử lý danh sách lồng nhau (enumerate, itemize)
  s = dichMoiTruongDanhSach(s);
  
  // Khối tiêu đề \boxde và xuống trang \newpage
  s = s.replace(/\\boxde\{([^{}]+)\}/g, '<div class="part-header" style="margin-top:24px;text-align:center;font-size:1.1rem;background:var(--accent-soft);color:var(--accent);padding:8px 16px;border-radius:var(--r-sm)">$1</div>');
  s = s.replace(/\\newpage/g, '<hr style="border-top:1px dashed var(--line-2);margin:24px 0;clear:both">');
  s = s.replace(/\\(?:par|noindent)\b/g, '<br>');
  
  // \hfill và xuống dòng \\
  s = s.replace(/\\hfill\s*(\([^\n]*\))/g, '<span style="float:right; color:var(--ink-2); font-weight:600; font-size:0.85rem">$1</span>');
  s = s.replace(/\\hfill/g, '<span style="float:right"></span>');
  s = s.replace(/\\\\/g, '<br>');
  
  // Phục hồi các khối công thức toán học (Dùng split-join thay thế replace để tránh lỗi mất ký tự $)
  for (var i = mathBlocks.length - 1; i >= 0; i--) {
    s = s.split('___MATHBLOCK_' + i + '___').join(mathBlocks[i]);
  }
  shortAnswerTokens.forEach(function (html, index) {
    s = s.split('___VMSHORTANSWER_' + index + '___').join(html);
  });
  
  return vmKhoiTikzSangHtml(s);
}

// Lấy phần nội dung có thể đọc từ một tệp .tex hoàn chỉnh. Giáo viên có thể
// tải nguyên tệp có \documentclass/\begin{document}; phần preamble vẫn được
// giữ ở CSDL để biên dịch PDF, nhưng không đưa lên màn hình học sinh.
function tachNoiDungTaiLieuLatex(src) {
  var s = lamSachLatex(src || '');
  var begin = s.indexOf('\\begin{document}');
  var end = s.lastIndexOf('\\end{document}');
  if (begin !== -1) s = s.slice(begin + '\\begin{document}'.length, end > begin ? end : undefined);
  // Cac bo tai lieu thuong khai bao macro (\\def, \\newcommand...) ngay ben
  // trong tikzpicture. Bao ve nguyen khoi truoc khi don preamble; neu khong,
  // cac macro nhu \\IntervalLR, \\firstellipse se bi xoa khoi tung hinh.
  var tikzBlocks = [];
  s = s.replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g, function (tikz) {
    var token = '___VMTIKZSOURCE_' + tikzBlocks.length + '___';
    tikzBlocks.push(tikz);
    return token;
  });
  s = s.replace(/^\s*\\(?:documentclass|usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^\n]*\}\s*$/gm, '');
  s = s.replace(/^\s*\\(?:input|include)\{[^}]+\}\s*$/gm, '');
  s = s.replace(/^\s*\\(?:newcommand|renewcommand|providecommand|def)\b[^\n]*$/gm, '');
  s = s.replace(/\\(?:maketitle|tableofcontents|frontmatter|mainmatter|backmatter|clearpage|pagebreak)\b/g, '');
  s = s.replace(/\\(?:thispagestyle|pagestyle|setcounter|addtocounter|label)\s*\{[^}]*\}(?:\s*\{[^}]*\})?/g, '');
  tikzBlocks.forEach(function (tikz, index) {
    s = s.split('___VMTIKZSOURCE_' + index + '___').join(tikz);
  });
  return s.trim();
}

// Xóa một lệnh có đối số {...} bằng bộ đếm ngoặc, để không lộ lời giải/đáp án
// khi nguồn LaTeX có các khối lồng nhau.
function xoaLenhKhoiLatex(src, command) {
  return thayLenhKhoiLatex(src, command, function () { return ''; });
}

function thayLenhKhoiLatex(src, command, replacer) {
  var token = '\\' + command;
  var out = String(src || '');
  var from = 0;
  while (from < out.length) {
    var at = out.indexOf(token, from);
    if (at === -1) break;
    var brace = at + token.length;
    // Khong nhan nham \answerbox... la lenh \answer.
    if (/[A-Za-z@]/.test(out.charAt(brace))) { from = brace; continue; }
    if (out.charAt(brace) === '*') brace++;
    while (/\s/.test(out.charAt(brace))) brace++;
    // Mot so goi LaTeX cho phep \loigiai[tuy-chon]{...}.
    if (out.charAt(brace) === '[') {
      var bracketDepth = 1;
      brace++;
      while (brace < out.length && bracketDepth > 0) {
        if (out.charAt(brace) === '[' && out.charAt(brace - 1) !== '\\') bracketDepth++;
        else if (out.charAt(brace) === ']' && out.charAt(brace - 1) !== '\\') bracketDepth--;
        brace++;
      }
      while (/\s/.test(out.charAt(brace))) brace++;
    }
    if (out.charAt(brace) !== '{') { from = brace; continue; }
    var depth = 1, i = brace + 1;
    while (i < out.length && depth > 0) {
      if (out.charAt(i) === '{' && out.charAt(i - 1) !== '\\') depth++;
      else if (out.charAt(i) === '}' && out.charAt(i - 1) !== '\\') depth--;
      i++;
    }
    if (depth !== 0) {
      from = brace + 1;
      continue;
    }
    var content = out.slice(brace + 1, i - 1);
    var replacement = typeof replacer === 'function' ? replacer(content) : String(replacer || '');
    out = out.slice(0, at) + replacement + out.slice(i);
    from = at + replacement.length;
  }
  return out;
}

function thayMoiTruongKhoiLatex(src, environment, replacer) {
  return vmThayMoiTruongCanBang(src, environment, function (content) {
    return typeof replacer === 'function' ? replacer(content) : String(replacer || '');
  });
}

function tachLoiGiaiKhoiNoiDung(src) {
  var text = String(src || '');
  var solutions = [];
  ['loigiai', 'giaibai', 'solution', 'answer', 'sol'].forEach(function (command) {
    text = thayLenhKhoiLatex(text, command, function (content) {
      solutions.push(content);
      return '';
    });
  });
  ['loigiai', 'giaibai', 'solution', 'answer', 'sol', 'onlysolution'].forEach(function (environment) {
    text = thayMoiTruongKhoiLatex(text, environment, function (content) {
      solutions.push(content);
      return '';
    });
  });
  return { content: text, solution: solutions.join('\n\n').trim() };
}

function dinhDangVanBanTaiLieuLatex(src) {
  var solutionBlocks = [];
  var text = vmChuanHoaMoiTruongVanBan(String(src || ''), { showSolutions:true });
  ['loigiai', 'giaibai', 'solution', 'answer', 'sol'].forEach(function (command) {
    text = thayLenhKhoiLatex(text, command, function (content) {
      var token = '___VMSOLUTION_' + solutionBlocks.length + '___';
      solutionBlocks.push(content);
      return token;
    });
  });
  ['loigiai', 'giaibai', 'solution', 'answer', 'sol', 'onlysolution'].forEach(function (environment) {
    text = thayMoiTruongKhoiLatex(text, environment, function (content) {
      var token = '___VMSOLUTION_' + solutionBlocks.length + '___';
      solutionBlocks.push(content);
      return token;
    });
  });
  text = vmThayLenhHaiKhoi(text, 'immini', function (left, right) { return left + '\n\n' + right; });
  text = thayLenhKhoiLatex(text, 'centerline', function (content) { return content; });
  text = vmBaoVeKhoiNoiDung(text);
  var html = latexRaHTML(text);
  html = html.replace(/\\part\*?\{([^{}]*)\}/g, '<h1 class="vm-tex-h1">$1</h1>');
  html = html.replace(/\\chapter\*?\{([^{}]*)\}/g, '<h1 class="vm-tex-h1">$1</h1>');
  html = html.replace(/\\section\*?\{([^{}]*)\}/g, '<h2 class="vm-tex-h2">$1</h2>');
  html = html.replace(/\\subsection\*?\{([^{}]*)\}/g, '<h3 class="vm-tex-h3">$1</h3>');
  html = html.replace(/\\subsubsection\*?\{([^{}]*)\}/g, '<h4 class="vm-tex-h4">$1</h4>');
  html = html.replace(/\\(?:emph)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<em>$1</em>');
  html = html.replace(/\\underline\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<u>$1</u>');
  html = html.replace(/\\textcolor\{[^}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  html = html.replace(/\\(?:mbox|textrm|textsf|texttt)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  html = html.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '<div class="vm-tex-media-note">Hình minh họa có trong bản PDF tải về</div>');
  html = html.replace(/\\(?:noindent|centering|raggedright|raggedleft|small|normalsize|large|Large|LARGE|bfseries|itshape)\b/g, '');
  html = html.replace(/\\(?:vfill|medskip|bigskip|smallskip)\b/g, '<div class="vm-tex-gap"></div>');
  html = html.replace(/\n\s*\n+/g, '<div class="vm-tex-gap"></div>');
  html = html.replace(/\n/g, ' ');
  solutionBlocks.forEach(function (content, index) {
    var box = '<aside class="vm-tex-solution"><div class="vm-tex-solution-title">Lời giải</div><div>' +
      dinhDangVanBanTaiLieuLatex(content) + '</div></aside>';
    html = html.split('___VMSOLUTION_' + index + '___').join(box);
  });
  return vmKhoiNoiDungSangHtml(html).trim();
}

// Bộ dựng mảnh dùng chung cho trình soạn và ngân hàng đề. fullSource giữ lại
// preamble của tệp gốc để TikZ dùng được macro/thư viện riêng, còn chính sách
// lời giải vẫn do nơi gọi quyết định.
function vmLatexFragmentRaHTML(src, options) {
  options = options || {};
  var showSolutions = options.showSolutions !== false;
  var text = vmChuanHoaMoiTruongVanBan(String(src || ''), { showSolutions:showSolutions });
  if (!showSolutions) {
    ['loigiai', 'giaibai', 'solution', 'answer', 'sol'].forEach(function (command) {
      text = xoaLenhKhoiLatex(text, command);
    });
    ['loigiai', 'giaibai', 'solution', 'answer', 'sol', 'onlysolution'].forEach(function (environment) {
      text = thayMoiTruongKhoiLatex(text, environment, '');
    });
  }
  text = vmBaoVeKhoiTikz(text, String(options.fullSource || src || ''));
  return dinhDangVanBanTaiLieuLatex(text);
}
window.vmLatexFragmentRaHTML = vmLatexFragmentRaHTML;

// Bộ đọc tài liệu dùng chung cho lý thuyết thường, đề kiểm tra, BTVN và bài
// thưởng. Mặc định không hiển thị \loigiai/\solution để tránh lộ đáp án.
function latexTaiLieuRaHTML(src, options) {
  options = options || {};
  var kind = options.kind || 'document';
  var title = options.title || 'Tài liệu học tập';
  var body = vmChuanHoaMoiTruongVanBan(tachNoiDungTaiLieuLatex(src || ''), { showSolutions:!!options.showSolutions });
  if (!options.showSolutions) {
    body = xoaLenhKhoiLatex(body, 'loigiai');
    body = xoaLenhKhoiLatex(body, 'giaibai');
    body = xoaLenhKhoiLatex(body, 'solution');
    body = xoaLenhKhoiLatex(body, 'answer');
    body = xoaLenhKhoiLatex(body, 'sol');
    ['loigiai', 'giaibai', 'solution', 'answer', 'sol', 'onlysolution'].forEach(function (environment) {
      body = thayMoiTruongKhoiLatex(body, environment, '');
    });
  }
  // tomtat trong bo DGNL la moi truong gom nhom trong suot, thuong boc ca
  // nx/note. Bo cap marker truoc khi tach cac khoi de tranh cat doi wrapper.
  body = body.replace(/\\begin\{tomtat\}|\\end\{tomtat\}/g, ' ');
  body = vmBaoVeKhoiTikz(body, src || '');

  var labels = {
    document: 'Nội dung tài liệu', theory: 'Lý thuyết', test: 'Câu',
    homework: 'Bài', homework_bonus: 'Bài thưởng', example: 'Ví dụ',
    definition: 'Định nghĩa', theorem: 'Định lý', note: 'Lưu ý'
  };
  var envLabels = { ex: kind === 'test' ? labels.test : labels.homework, bt: labels.homework, vd: labels.example, dl: labels.theorem, dn: labels.definition, hq: 'Hệ quả', nx: 'Nhận xét', note: labels.note, remark: 'Nhận xét' };
  var envRe = /\\begin\{(ex|bt|vd|dl|dn|hq|nx|note|remark)\}([\s\S]*?)\\end\{\1\}/g;
  var html = '', last = 0, match, blockCounters = {};

  function renderQuestion(env, content) {
    var parsed = (env === 'ex' || env === 'bt') && typeof parseSingleQuestionLatex === 'function'
      ? parseSingleQuestionLatex('\\begin{' + env + '}' + content + '\\end{' + env + '}') : null;
    var questionBody = parsed ? parsed.content_latex : content;
    var inner = dinhDangVanBanTaiLieuLatex(questionBody);
    var choices = '';
    if (parsed && parsed.choices && parsed.choices.length > 1) {
      choices = '<div class="vm-tex-choices">' + parsed.choices.map(function (choice) {
        return '<div class="vm-tex-choice"><span class="vm-tex-choice-key">' + choice.key + '</span><div>' + dinhDangVanBanTaiLieuLatex(choice.latex || '') + '</div></div>';
      }).join('') + '</div>';
    }
    var solution = '';
    if (options.showSolutions && parsed && parsed.solution_latex) {
      solution = '<aside class="vm-tex-solution"><div class="vm-tex-solution-title">Lời giải</div><div>' +
        dinhDangVanBanTaiLieuLatex(parsed.solution_latex) + '</div></aside>';
    }
    var configured = typeof window !== 'undefined' && typeof window.vmLayMoiTruongTex === 'function'
      ? window.vmLayMoiTruongTex(env) : null;
    var numbered = configured ? !!configured.is_numbered : ['ex', 'bt', 'vd'].indexOf(env) !== -1;
    var blockLabel = configured && configured.display_name ? configured.display_name : (envLabels[env] || labels.document);
    var canonical = configured && configured.environment_name ? configured.environment_name : env;
    var numberLabel = '';
    if (numbered) {
      var counterKey = configured && configured.counter_group ? configured.counter_group : canonical;
      blockCounters[counterKey] = (blockCounters[counterKey] || 0) + 1;
      numberLabel = ' ' + blockCounters[counterKey];
    }
    var icon = configured && configured.icon ? '<span class="vm-tex-env-icon" aria-hidden="true">' + configured.icon + '</span>' : '';
    return '<section class="vm-tex-block vm-tex-block-' + env + '" data-vm-env="' + canonical + '">' +
      '<div class="vm-tex-block-title"><span>' + icon + blockLabel + numberLabel + '</span></div>' +
      '<div class="vm-tex-block-body">' + inner + choices + solution + '</div></section>';
  }

  while ((match = envRe.exec(body)) !== null) {
    var prose = dinhDangVanBanTaiLieuLatex(body.slice(last, match.index));
    if (prose) html += '<div class="vm-tex-prose">' + prose + '</div>';
    html += renderQuestion(match[1], match[2]);
    last = envRe.lastIndex;
  }
  var tail = dinhDangVanBanTaiLieuLatex(body.slice(last));
  if (tail) html += '<div class="vm-tex-prose">' + tail + '</div>';
  if (!html.trim()) html = '<div class="vm-tex-empty">Tệp LaTeX chưa có nội dung có thể hiển thị.</div>';
  html = vmKhoiTikzSangHtml(html);

  return '<article class="vm-tex-reader" data-document-kind="' + kind + '">' +
    '<header class="vm-tex-reader-head"><span class="vm-tex-reader-kicker">ĐỌC TRỰC TIẾP TRÊN VINHMATH</span><h2>' +
    String(title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h2></header>' + html + '</article>';
}

async function napFileTexVaoO(input, textareaId, statusId) {
  var file = input && input.files ? input.files[0] : null;
  var textarea = document.getElementById(textareaId);
  var status = statusId ? document.getElementById(statusId) : null;
  if (!file || !textarea) return;
  if (!/\.tex$/i.test(file.name)) {
    if (status) status.textContent = 'Vui lòng chọn đúng tệp .tex';
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (status) status.textContent = 'Tệp .tex vượt quá 5 MB';
    input.value = '';
    return;
  }
  try {
    var content = typeof file.text === 'function' ? await file.text() : await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
    textarea.value = String(content || '').replace(/^\uFEFF/, '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    if (status) status.textContent = '✓ Đã nạp ' + file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
  } catch (e) {
    if (status) status.textContent = 'Không đọc được tệp .tex';
  }
}

function parseItems(text) {
  var parts = text.split(/\\item(?:\s*\[[^\]]*\])?\s*/);
  var first = parts.shift().trim();
  var html = parts.map(function (p) {
    return '<li style="margin-bottom:6px; line-height:1.6">' + p.trim() + '</li>';
  }).join('');
  return (first ? '<p style="margin-bottom:6px">' + first + '</p>' : '') + html;
}

// Xử lý các môi trường danh sách lồng nhau từ trong ra ngoài (innermost first)
function dichMoiTruongDanhSach(s) {
  var regexEnumerate = /\\begin\{enumerate\}\s*(?:\[([^\]]*)\])?((?:(?!\\begin\{enumerate\}|\\begin\{itemize\})[\s\S])*?)\\end\{enumerate\}/g;
  var regexItemize = /\\begin\{itemize\}\s*(?:\[[^\]]*\])?((?:(?!\\begin\{enumerate\}|\\begin\{itemize\})[\s\S])*?)\\end\{itemize\}/g;

  var changed = true;
  var limit = 10;
  while (changed && limit > 0) {
    changed = false;
    limit--;

    // Thay thế enumerate ở cấp trong cùng trước
    var nextS = s.replace(regexEnumerate, function(match, opt, body) {
      changed = true;
      var listStyle = 'decimal';
      if (opt) {
        if (opt.includes('a')) listStyle = 'lower-alpha';
        else if (opt.includes('A')) listStyle = 'upper-alpha';
        else if (opt.includes('i')) listStyle = 'lower-roman';
        else if (opt.includes('I')) listStyle = 'upper-roman';
      }
      var items = parseItems(body);
      return '<ol style="list-style-type:' + listStyle + '; padding-left:20px; margin: 10px 0">' + items + '</ol>';
    });

    if (nextS !== s) {
      s = nextS;
      continue;
    }

    // Thay thế itemize ở cấp trong cùng trước
    nextS = s.replace(regexItemize, function(match, body) {
      changed = true;
      var items = parseItems(body);
      return '<ul style="list-style-type:disc; padding-left:20px; margin: 10px 0">' + items + '</ul>';
    });

    if (nextS !== s) {
      s = nextS;
      continue;
    }
  }
  return s;
}

function vmTuyChonRenderToan() {
  var macros = {
    "\\hoac": "\\left[\\begin{aligned}#1\\end{aligned}\\right.",
    "\\heva": "\\left\\{\\begin{aligned}#1\\end{aligned}\\right.",
    "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}", "\\Q": "\\mathbb{Q}",
    "\\R": "\\mathbb{R}", "\\C": "\\mathbb{C}",
    "\\vect": "\\overrightarrow{#1}"
  };
  var legacy = vmLegacyKatexMacros();
  Object.keys(legacy).forEach(function (command) { macros[command] = legacy[command]; });
  return {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false }
    ],
    macros: macros,
    throwOnError: false,
    strict: 'ignore',
    trust: false
  };
}
window.vmTuyChonRenderToan = vmTuyChonRenderToan;

// Render mọi công thức toán bên trong phần tử
function renderToanTrong(el) {
  if (window.renderMathInElement && el) renderMathInElement(el, vmTuyChonRenderToan());
}

// Trình biên dịch LaTeX Parser (bóc tách \begin{ex}...\end{ex} hoặc \begin{bt}...\end{bt})
function parseLatexQuestions(latexText) {
  latexText = lamSachLatex(latexText || '');
  function parseBraces(text, count) {
    var blocks = [];
    var index = 0;
    for (var b = 0; b < count; b++) {
      var start = text.indexOf('{', index);
      if (start === -1) break;
      var braceCount = 1;
      var i = start + 1;
      while (i < text.length && braceCount > 0) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') braceCount--;
        i++;
      }
      blocks.push(text.substring(start + 1, i - 1));
      index = i;
    }
    return blocks;
  }

  function parseCommandArgumentAt(text, commandIndex, commandLength) {
    var index = commandIndex + commandLength;
    while (index < text.length && /\s/.test(text[index])) index++;
    if (text[index] === '[') {
      var bracketDepth = 1;
      index++;
      while (index < text.length && bracketDepth > 0) {
        if (text[index] === '[' && text[index - 1] !== '\\') bracketDepth++;
        else if (text[index] === ']' && text[index - 1] !== '\\') bracketDepth--;
        index++;
      }
      while (index < text.length && /\s/.test(text[index])) index++;
    }
    if (text[index] !== '{') return null;
    var start = index;
    var braceDepth = 1;
    index++;
    while (index < text.length && braceDepth > 0) {
      if (text[index] === '{' && text[index - 1] !== '\\') braceDepth++;
      else if (text[index] === '}' && text[index - 1] !== '\\') braceDepth--;
      index++;
    }
    if (braceDepth !== 0) return null;
    return { value: text.substring(start + 1, index - 1), end: index };
  }

  var regexEx = /\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}/g;
  var match;
  var questions = [];
  
  while ((match = regexEx.exec(latexText)) !== null) {
    var envType = match[1];
    var content = match[2];
    
    var extractedSolution = tachLoiGiaiKhoiNoiDung(content);
    var solution = extractedSolution.solution;
    content = extractedSolution.content;
    
    var choices = [];
    var choiceTFIndex = content.indexOf('\\choiceTF');
    var choiceIndex = content.indexOf('\\choice');
    var shortAnswerIndex = content.indexOf('\\shortans');
    var questionBody = content;
    
    if (envType === 'bt') {
      var ansMatch = solution.match(/\\textbf\{(Câu trả lời|Đáp số|Kết quả|Đáp án):?\}\s*([^\n}]+)/i);
      if (ansMatch) {
        var ansText = ansMatch[2].replace(/\.$/, '').trim();
        choices.push({
          key: 'short',
          latex: ansText,
          correct: true
        });
      }
    } else {
      if (choiceTFIndex !== -1) {
        questionBody = content.substring(0, choiceTFIndex).trim();
        var remaining = content.substring(choiceTFIndex + 9);
        var blocks = parseBraces(remaining, 4);
        var keys = ['a', 'b', 'c', 'd'];
        blocks.forEach(function (block, idx) {
          var isCorrect = false;
          var cleaned = block.trim();
          if (cleaned.includes('\\True') || cleaned.includes('\\true')) {
            isCorrect = true;
            cleaned = cleaned.replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
          }
          cleaned = cleaned.replace(/^[a-d][\.\)]\s*/i, '');
          choices.push({
            key: keys[idx],
            latex: cleaned,
            correct: isCorrect
          });
        });
      } else if (choiceIndex !== -1) {
        questionBody = content.substring(0, choiceIndex).trim();
        var remaining = content.substring(choiceIndex + 7);
        var blocks = parseBraces(remaining, 4);
        var keys = ['A', 'B', 'C', 'D'];
        blocks.forEach(function (block, idx) {
          var isCorrect = false;
          var cleaned = block.trim();
          if (cleaned.includes('\\True') || cleaned.includes('\\true')) {
            isCorrect = true;
            cleaned = cleaned.replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
          }
          cleaned = cleaned.replace(/^[A-D][\.\)]\s*/i, '');
          choices.push({
            key: keys[idx],
            latex: cleaned,
            correct: isCorrect
          });
        });
      } else if (shortAnswerIndex !== -1) {
        var shortAnswerData = parseCommandArgumentAt(content, shortAnswerIndex, 9);
        if (shortAnswerData) {
          choices.push({
            key: 'short',
            latex: shortAnswerData.value.trim(),
            correct: true
          });
          questionBody = (content.substring(0, shortAnswerIndex) + content.substring(shortAnswerData.end)).trim();
        }
      } else {
        var ansMatch = solution.match(/\\textbf\{(Câu trả lời|Đáp số|Kết quả|Đáp án):?\}\s*([^\n}]+)/i);
        if (ansMatch) {
          var ansText = ansMatch[2].replace(/\.$/, '').trim();
          choices.push({
            key: 'short',
            latex: ansText,
            correct: true
          });
        }
      }
    }
    
    questions.push({
      question_type: choiceTFIndex !== -1 ? 'true_false' :
        choiceIndex !== -1 ? 'multiple_choice' :
        (choices.length === 1 && choices[0].key === 'short' ? 'short_answer' : ''),
      content_latex: questionBody.trim(),
      choices: choices,
      solution_latex: solution.trim()
    });
  }
  return questions;
}

// Phân tích 1 câu hỏi chặn bằng LaTeX (hỗ trợ \begin{ex}, \choice, \choiceTF hoặc dạng text A., B., C., D.)
function parseSingleQuestionLatex(latexText) {
  if (!latexText || !latexText.trim()) return null;
  var text = latexText.trim();
  
  if (text.includes('\\begin{ex}') || text.includes('\\begin{bt}')) {
    var qs = parseLatexQuestions(text);
    if (qs && qs.length > 0) return qs[0];
  }
  
  var wrapped = '\\begin{ex}\n' + text + '\n\\end{ex}';
  var qsWrapped = parseLatexQuestions(wrapped);
  if (qsWrapped && qsWrapped.length > 0 && qsWrapped[0].choices && qsWrapped[0].choices.length > 0) {
    return qsWrapped[0];
  }
  
  var choices = [];
  var body = text;
  
  var optionRegex = /(?:^|\n|\s*)([A-Da-d])[\.\)]\s*([\s\S]*?)(?=(?:[A-Da-d][\.\)]|$))/g;
  var matches = [];
  var m;
  while ((m = optionRegex.exec(text)) !== null) {
    matches.push(m);
  }
  
  if (matches.length === 4) {
    var firstOptIndex = text.indexOf(matches[0][0]);
    if (firstOptIndex > 0) body = text.substring(0, firstOptIndex).trim();
    
    matches.forEach(function(match) {
      var key = match[1].toUpperCase();
      var optText = match[2].trim();
      var isCorrect = false;
      if (optText.includes('*') || optText.includes('\\True') || optText.includes('\\true')) {
        isCorrect = true;
        optText = optText.replace(/\*/g, '').replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
      }
      choices.push({ key: key, latex: optText.trim(), correct: isCorrect });
    });
  }
  
  return {
    content_latex: body.trim(),
    choices: choices,
    solution_latex: ''
  };
}
