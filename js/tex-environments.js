/* VinhMath — shared TeX environment registry.
 * One published Supabase configuration drives both the HTML reader and the
 * optional preamble injected before PDF compilation. No executable JavaScript
 * is stored in the database.
 */
(function () {
  'use strict';

  var CACHE_KEY = 'vm-tex-environments-v1';
  var configs = {};
  var loading = null;

  var FALLBACKS = [
    { environment_name:'boxdn', display_name:'Định nghĩa', aliases:['mydn','dn'], icon:'📗', tone:'definition', web_config:{ accent:'#158466', background:'#f0fbf6', border:'#b9e6d4', title_background:'#e2f4ec', dark_background:'#0d2922', dark_border:'#285c4d', dark_title_background:'#13372e', radius:'14px', border_width:'2px' } },
    { environment_name:'boxdl', display_name:'Định lý', aliases:['mydl','dl'], icon:'📐', tone:'theorem', web_config:{ accent:'#3156a6', background:'#f2f6ff', border:'#c8d5f4', title_background:'#e7eefc', dark_background:'#151f38', dark_border:'#354c7f', dark_title_background:'#1b2949', radius:'14px', border_width:'2px' } },
    { environment_name:'boxvidu', display_name:'Ví dụ', aliases:['myvidu','vidu','vd'], icon:'🧩', tone:'example', is_numbered:true, web_config:{ accent:'#8b5b00', background:'#fff9ed', border:'#ecd7a7', title_background:'#fff1cc', dark_background:'#2b2211', dark_border:'#735a24', dark_title_background:'#3a2b10', radius:'14px', border_width:'2px' } },
    { environment_name:'luuy', display_name:'Lưu ý', aliases:['note','makerr'], icon:'💡', tone:'note', web_config:{ accent:'#d78a00', background:'#fffaf0', border:'#f0d49d', title_background:'#fff0ca', dark_background:'#2b220f', dark_border:'#735421', dark_title_background:'#3b2c10', radius:'14px', border_width:'2px' } },
    { environment_name:'nx', display_name:'Nhận xét', aliases:['remark','boxtb'], icon:'💬', tone:'remark', web_config:{ accent:'#7254a8', background:'#f8f5ff', border:'#d9cef0', title_background:'#eee8fa', dark_background:'#241b36', dark_border:'#5b467d', dark_title_background:'#302344', radius:'14px', border_width:'2px' } },
    { environment_name:'bt', display_name:'Bài tập', aliases:['ex'], icon:'✍️', tone:'practice', is_numbered:true, web_config:{ accent:'#c46f00', background:'#fffaf2', border:'#efd1a3', title_background:'#ffefd2', dark_background:'#2d2112', dark_border:'#765226', dark_title_background:'#3b2a13', radius:'16px', border_width:'2px' } },
    { environment_name:'dang', display_name:'Dạng toán', aliases:['dangg','khung4','noidung'], icon:'🧭', tone:'form', is_numbered:true, web_config:{ accent:'#b45525', background:'#fff6f1', border:'#ebc5b0', title_background:'#fde8dd', dark_background:'#301d16', dark_border:'#704432', dark_title_background:'#3d251b', radius:'16px', border_width:'2px' } },
    { environment_name:'tomtat', display_name:'Tóm tắt', aliases:['tttt'], icon:'📝', tone:'summary', web_config:{ accent:'#54616f', background:'#f6f8fa', border:'#d5dce3', title_background:'#edf1f5', dark_background:'#1d2329', dark_border:'#46515c', dark_title_background:'#252d35', radius:'14px', border_width:'1px' } }
  ];

  function safeName(value) {
    value = String(value || '').trim();
    return /^[A-Za-z][A-Za-z0-9@_-]{0,63}$/.test(value) ? value.toLowerCase() : '';
  }

  function safeColor(value, fallback) {
    value = String(value || '').trim();
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|var\(--[\w-]+\))$/i.test(value) ? value : fallback;
  }

  function safeSize(value, fallback) {
    value = String(value || '').trim();
    return /^(?:0|\d+(?:\.\d+)?(?:px|rem|em))$/.test(value) ? value : fallback;
  }

  function normalize(row) {
    var name = safeName(row && row.environment_name);
    if (!name) return null;
    var aliases = Array.isArray(row.aliases) ? row.aliases.map(safeName).filter(Boolean) : [];
    var allowedTones = ['definition','theorem','example','note','remark','practice','form','summary'];
    return {
      environment_name: name,
      display_name: String(row.display_name || name).slice(0, 80),
      aliases: aliases.filter(function (x, i, a) { return x !== name && a.indexOf(x) === i; }),
      icon: String(row.icon || '📘').slice(0, 16),
      tone: allowedTones.indexOf(row.tone) !== -1 ? row.tone : 'definition',
      is_numbered: !!row.is_numbered,
      counter_group: safeName(row.counter_group),
      web_config: row.web_config && typeof row.web_config === 'object' ? row.web_config : {},
      latex_definition: String(row.latex_definition || ''),
      sample_latex: String(row.sample_latex || ''),
      version: Number(row.version || row.base_version || 0)
    };
  }

  function replaceAll(rows) {
    configs = {};
    (rows || []).forEach(function (row) {
      var c = normalize(row);
      if (!c) return;
      configs[c.environment_name] = c;
      c.aliases.forEach(function (alias) { configs[alias] = c; });
    });
    injectStyles();
    window.dispatchEvent(new CustomEvent('vm:tex-environments-ready', { detail: { count: Object.keys(configs).length } }));
  }

  function uniqueConfigs() {
    var seen = {};
    return Object.keys(configs).map(function (key) { return configs[key]; }).filter(function (c) {
      if (!c || seen[c.environment_name]) return false;
      seen[c.environment_name] = true;
      return true;
    });
  }

  function cssRule(c) {
    var w = c.web_config || {};
    var selector = '.vm-tex-callout[data-vm-env="' + c.environment_name + '"],.vm-tex-block[data-vm-env="' + c.environment_name + '"]';
    var light = selector + '{--vm-env-accent:' + safeColor(w.accent, '#9e6100') +
      ';--vm-env-bg:' + safeColor(w.background, '#fffaf0') +
      ';--vm-env-border:' + safeColor(w.border, '#ead8b5') +
      ';--vm-env-title-bg:' + safeColor(w.title_background, '#fff1d6') +
      ';--vm-env-title-color:' + safeColor(w.title_color, safeColor(w.accent, '#9e6100')) +
      ';--vm-env-body-color:' + safeColor(w.body_color, 'var(--ink)') +
      ';--vm-env-radius:' + safeSize(w.radius, '14px') +
      ';--vm-env-border-width:' + safeSize(w.border_width, '2px') + '}';
    var dark = '[data-theme="dark"] ' + selector.split(',').join(',[data-theme="dark"] ') +
      '{--vm-env-bg:' + safeColor(w.dark_background, '#201c17') +
      ';--vm-env-border:' + safeColor(w.dark_border, '#645033') +
      ';--vm-env-title-bg:' + safeColor(w.dark_title_background, '#2d251b') +
      ';--vm-env-title-color:' + safeColor(w.dark_title_color, safeColor(w.accent, '#e5a936')) +
      ';--vm-env-body-color:' + safeColor(w.dark_body_color, 'var(--ink)') + '}';
    return light + dark;
  }

  function injectStyles() {
    var style = document.getElementById('vmTexEnvironmentStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'vmTexEnvironmentStyles';
      document.head.appendChild(style);
    }
    style.textContent = uniqueConfigs().map(cssRule).join('\n') +
      '\n.vm-tex-callout[data-vm-env],.vm-tex-block[data-vm-env]{background:var(--vm-env-bg)!important;border-color:var(--vm-env-border)!important;border-width:var(--vm-env-border-width)!important;border-radius:var(--vm-env-radius)!important;color:var(--vm-env-body-color)!important;}' +
      '\n.vm-tex-callout[data-vm-env]{border-left-color:var(--vm-env-accent)!important;}' +
      '\n.vm-tex-callout[data-vm-env] .vm-tex-callout-title,.vm-tex-block[data-vm-env] .vm-tex-block-title{background:var(--vm-env-title-bg)!important;color:var(--vm-env-title-color)!important;}';
  }

  function loadCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached.rows)) replaceAll(cached.rows);
      return cached;
    } catch (_) { return null; }
  }

  async function load(force) {
    if (loading && !force) return loading;
    var cached = loadCache();
    if (!Object.keys(configs).length) replaceAll(FALLBACKS);
    // Cache chỉ giúp mở nhanh/offline. Khi có mạng vẫn đọc bảng rất nhỏ này để
    // học sinh nhận cấu hình vừa xuất bản ngay lần tải trang kế tiếp.
    if (!window.sb || typeof window.sb.from !== 'function') return uniqueConfigs();
    loading = window.sb.from('tex_environment_configs').select('*').order('environment_name').then(function (result) {
      if (result.error) throw result.error;
      if (result.data && result.data.length) {
        replaceAll(result.data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows: result.data })); } catch (_) {}
      }
      return uniqueConfigs();
    }).catch(function (error) {
      console.warn('Không tải được cấu hình môi trường TeX, dùng cấu hình dự phòng:', error && error.message);
      return uniqueConfigs();
    }).finally(function () { loading = null; });
    return loading;
  }

  function get(name) { return configs[safeName(name)] || null; }
  function names() { return Object.keys(configs).filter(function (key) { return configs[key] && configs[key].environment_name === key; }); }
  function aliases() { return Object.keys(configs); }
  function preamble() {
    return uniqueConfigs().map(function (c) { return String(c.latex_definition || '').trim(); }).filter(Boolean).join('\n\n');
  }
  function injectPreamble(tex) {
    tex = String(tex || '');
    var extra = preamble();
    if (!extra || tex.indexOf('% VM_TEX_ENVIRONMENTS_BEGIN') !== -1) return tex;
    var block = '\n% VM_TEX_ENVIRONMENTS_BEGIN\n' + extra + '\n% VM_TEX_ENVIRONMENTS_END\n';
    var at = tex.search(/\\begin\s*\{document\}/);
    return at >= 0 ? tex.slice(0, at) + block + tex.slice(at) : tex + block;
  }
  function preview(row) {
    var c = normalize(row);
    if (!c) return;
    configs[c.environment_name] = c;
    c.aliases.forEach(function (alias) { configs[alias] = c; });
    injectStyles();
  }
  function invalidate() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  replaceAll(FALLBACKS);
  window.vmTaiMoiTruongTex = load;
  window.vmLayMoiTruongTex = get;
  window.vmDanhSachTenMoiTruongTex = aliases;
  window.vmDanhSachMoiTruongTex = uniqueConfigs;
  window.vmPreambleMoiTruongTex = preamble;
  window.vmChenPreambleMoiTruongTex = injectPreamble;
  window.vmXemTruocMoiTruongTex = preview;
  window.vmXoaCacheMoiTruongTex = invalidate;
})();
