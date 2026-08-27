/* VinhMath seasonal decoration runtime.
   Decorative layers never receive pointer events and never participate in page layout. */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    mode: 'auto',
    festival: 'mid_autumn',
    intensity: 'balanced',
    start_date: '',
    end_date: ''
  };
  var FESTIVALS = {
    mid_autumn: {
      label: 'Tết Trung thu',
      icon: '☾',
      description: 'Lồng đèn, sao và trăng rằm theo phong cách VinhMath.',
      auto_label: '8–17/8 ÂL',
      auto_help: 'Tự bật từ mùng 8 đến 17 tháng 8 âm lịch.'
    },
    national_day: {
      label: 'Lễ Quốc Khánh 2/9',
      icon: '★',
      description: 'Sắc đỏ, cờ Việt Nam và ánh vàng chào mừng ngày Quốc Khánh.',
      auto_label: '30/8–3/9',
      auto_help: 'Tự bật từ ngày 30/8 đến hết ngày 3/9 theo giờ Việt Nam.'
    }
  };
  var activeConfig = null;
  var realtimeChannel = null;

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalizeConfig(input) {
    var raw = input;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = {}; }
    }
    raw = raw && typeof raw === 'object' ? raw : {};
    var mode = ['auto', 'scheduled', 'on', 'off'].indexOf(raw.mode) >= 0 ? raw.mode : DEFAULT_CONFIG.mode;
    var intensity = ['subtle', 'balanced', 'festive'].indexOf(raw.intensity) >= 0 ? raw.intensity : DEFAULT_CONFIG.intensity;
    return {
      mode: mode,
      festival: Object.prototype.hasOwnProperty.call(FESTIVALS, raw.festival) ? raw.festival : DEFAULT_CONFIG.festival,
      intensity: intensity,
      start_date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.start_date || '')) ? raw.start_date : '',
      end_date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.end_date || '')) ? raw.end_date : ''
    };
  }

  function jdFromDate(dd, mm, yy) {
    var a = Math.floor((14 - mm) / 12);
    var y = yy + 4800 - a;
    var m = mm + 12 * a - 3;
    var jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    return jd;
  }

  function newMoon(k) {
    var t = k / 1236.85;
    var t2 = t * t;
    var t3 = t2 * t;
    var dr = Math.PI / 180;
    var jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
    jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
    var m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
    var mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
    var f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
    var c1 = (0.1734 - 0.000393 * t) * Math.sin(m * dr) + 0.0021 * Math.sin(2 * m * dr);
    c1 -= 0.4068 * Math.sin(mpr * dr) + 0.0161 * Math.sin(2 * mpr * dr);
    c1 -= 0.0004 * Math.sin(3 * mpr * dr);
    c1 += 0.0104 * Math.sin(2 * f * dr) - 0.0051 * Math.sin((m + mpr) * dr);
    c1 -= 0.0074 * Math.sin((m - mpr) * dr) + 0.0004 * Math.sin((2 * f + m) * dr);
    c1 -= 0.0004 * Math.sin((2 * f - m) * dr) - 0.0006 * Math.sin((2 * f + mpr) * dr);
    c1 += 0.0010 * Math.sin((2 * f - mpr) * dr) + 0.0005 * Math.sin((2 * mpr + m) * dr);
    var deltaT = t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;
    return jd1 + c1 - deltaT;
  }

  function sunLongitude(jdn) {
    var t = (jdn - 2451545.0) / 36525;
    var t2 = t * t;
    var dr = Math.PI / 180;
    var m = 357.52910 + 35999.05030 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
    var l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
    var dl = (1.914600 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m);
    dl += (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) + 0.000290 * Math.sin(3 * dr * m);
    var l = (l0 + dl) * dr;
    l -= Math.PI * 2 * Math.floor(l / (Math.PI * 2));
    return l;
  }

  function newMoonDay(k, timeZone) {
    return Math.floor(newMoon(k) + 0.5 + timeZone / 24);
  }

  function sunLongitudeSector(dayNumber, timeZone) {
    return Math.floor(sunLongitude(dayNumber - 0.5 - timeZone / 24) / Math.PI * 6);
  }

  function lunarMonth11(yy, timeZone) {
    var off = jdFromDate(31, 12, yy) - 2415021;
    var k = Math.floor(off / 29.530588853);
    var nm = newMoonDay(k, timeZone);
    if (sunLongitudeSector(nm, timeZone) >= 9) nm = newMoonDay(k - 1, timeZone);
    return nm;
  }

  function leapMonthOffset(a11, timeZone) {
    var k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    var last = 0;
    var i = 1;
    var arc = sunLongitudeSector(newMoonDay(k + i, timeZone), timeZone);
    do {
      last = arc;
      i += 1;
      arc = sunLongitudeSector(newMoonDay(k + i, timeZone), timeZone);
    } while (arc !== last && i < 14);
    return i - 1;
  }

  function solarToLunar(day, month, year, timeZone) {
    var tz = Number.isFinite(Number(timeZone)) ? Number(timeZone) : 7;
    var dayNumber = jdFromDate(day, month, year);
    var k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    var monthStart = newMoonDay(k + 1, tz);
    if (monthStart > dayNumber) monthStart = newMoonDay(k, tz);
    var a11 = lunarMonth11(year, tz);
    var b11 = a11;
    var lunarYear;
    if (a11 >= monthStart) {
      lunarYear = year;
      a11 = lunarMonth11(year - 1, tz);
    } else {
      lunarYear = year + 1;
      b11 = lunarMonth11(year + 1, tz);
    }
    var lunarDay = dayNumber - monthStart + 1;
    var diff = Math.floor((monthStart - a11) / 29);
    var lunarLeap = 0;
    var lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
      var leapDiff = leapMonthOffset(a11, tz);
      if (diff >= leapDiff) {
        lunarMonth = diff + 10;
        if (diff === leapDiff) lunarLeap = 1;
      }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
  }

  function vietnamDateParts(date) {
    var d = date instanceof Date ? date : new Date(date || Date.now());
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d);
      var values = {};
      parts.forEach(function (part) { if (part.type !== 'literal') values[part.type] = part.value; });
      return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
    } catch (_) {
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    }
  }

  function isoVietnamDate(date) {
    var p = vietnamDateParts(date);
    return String(p.year).padStart(4, '0') + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
  }

  function isAutoMidAutumn(date) {
    var p = vietnamDateParts(date);
    var lunar = solarToLunar(p.day, p.month, p.year, 7);
    return lunar.month === 8 && lunar.leap === 0 && lunar.day >= 8 && lunar.day <= 17;
  }

  function isAutoNationalDay(date) {
    var p = vietnamDateParts(date);
    return (p.month === 8 && p.day >= 30) || (p.month === 9 && p.day <= 3);
  }

  function isActive(config, date) {
    var cfg = normalizeConfig(config);
    if (cfg.mode === 'off') return false;
    if (cfg.mode === 'on') return true;
    if (cfg.mode === 'scheduled') {
      var today = isoVietnamDate(date);
      return !!cfg.start_date && !!cfg.end_date && today >= cfg.start_date && today <= cfg.end_date;
    }
    return cfg.festival === 'national_day' ? isAutoNationalDay(date) : isAutoMidAutumn(date);
  }

  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById('vmFestivalStyles')) return;
    var link = document.createElement('link');
    link.id = 'vmFestivalStyles';
    link.rel = 'stylesheet';
    link.href = '/css/festival-theme.css?v=1.2';
    document.head.appendChild(link);
  }

  function lantern(side, variant) {
    return '<div class="vm-festival-lantern is-' + side + ' is-' + variant + '">' +
      '<span class="vm-lantern-cord"></span><span class="vm-lantern-cap"></span>' +
      '<span class="vm-lantern-body"><i></i><i></i><i></i></span>' +
      '<span class="vm-lantern-tail"><i></i><i></i><i></i></span></div>';
  }

  function stars(count) {
    var html = '';
    for (var i = 0; i < count; i += 1) {
      var left = (7 + (i * 37) % 88);
      var top = (7 + (i * 29) % 74);
      var size = 4 + (i % 4) * 2;
      var delay = (i % 7) * -0.47;
      html += '<i style="--vm-star-x:' + left + '%;--vm-star-y:' + top + '%;--vm-star-size:' + size + 'px;--vm-star-delay:' + delay + 's"></i>';
    }
    return html;
  }

  function midAutumnMarkup(count, mobile) {
    return '<div class="vm-festival-sky"><span class="vm-festival-stars">' + stars(count) + '</span></div>' +
      '<div class="vm-festival-moon"><span class="vm-moon-crater one"></span><span class="vm-moon-crater two"></span><span class="vm-moon-crater three"></span><i class="vm-moon-cloud"></i></div>' +
      lantern('left', 'red') + (mobile ? '' : lantern('right', 'gold') +
      '<div class="vm-festival-cloud is-left"></div><div class="vm-festival-cloud is-right"></div>' +
      '<div class="vm-festival-wish"><span>☾</span><b>Trung thu đoàn viên</b><small>Trăng sáng · lòng vui · học tốt</small></div>');
  }

  function nationalDayFlag(side) {
    return '<div class="vm-national-day-flag is-' + side + '"><span aria-hidden="true">★</span></div>';
  }

  function nationalDayMarkup(count, mobile) {
    return '<div class="vm-national-day-glow"></div>' +
      '<div class="vm-national-day-stars"><span class="vm-festival-stars">' + stars(Math.max(5, Math.floor(count * .72))) + '</span></div>' +
      '<div class="vm-national-day-ribbon is-top"></div><div class="vm-national-day-ribbon is-bottom"></div>' +
      nationalDayFlag('left') + (mobile ? '' : nationalDayFlag('right') +
      '<div class="vm-national-day-wish"><span>★</span><b>Mừng Quốc Khánh 2·9</b><small>Độc lập · Tự do · Hạnh phúc</small></div>');
  }

  function previewMarkup(cfg) {
    if (cfg.festival === 'national_day') {
      return '<div class="vm-national-preview-rays"></div>' +
        '<div class="vm-national-preview-stars">' + stars(cfg.intensity === 'festive' ? 13 : 8) + '</div>' +
        '<div class="vm-national-preview-flag"><span>★</span></div>' +
        '<div class="vm-national-preview-wave"></div>' +
        '<div class="vm-preview-copy"><small>LỄ HỘI VIỆT NAM</small><strong>Quốc Khánh 2·9</strong><span>Tự hào Việt Nam · rạng rỡ cờ sao</span></div>';
    }
    return '<div class="vm-preview-stars">' + stars(cfg.intensity === 'festive' ? 16 : 10) + '</div>' +
      '<div class="vm-preview-moon"><i></i><i></i></div>' +
      '<div class="vm-preview-lantern left"><i></i><b></b><span></span></div>' +
      '<div class="vm-preview-lantern right"><i></i><b></b><span></span></div>' +
      '<div class="vm-preview-hills"></div>' +
      '<div class="vm-preview-copy"><small>LỄ HỘI VIỆT NAM</small><strong>Tết Trung thu</strong><span>Lồng đèn thắp sáng · trăng rằm dịu êm</span></div>';
  }

  function removeLayer() {
    if (typeof document === 'undefined') return;
    var old = document.getElementById('vmFestivalLayer');
    if (old) old.remove();
    document.documentElement.removeAttribute('data-vm-festival');
    if (document.body) document.body.classList.remove('vm-festival-active');
  }

  function render(config, options) {
    if (typeof document === 'undefined') return false;
    var cfg = normalizeConfig(config);
    activeConfig = cfg;
    removeLayer();
    if (!(options && options.force) && !isActive(cfg, new Date())) return false;
    ensureStyles();
    var mobile = !!(global.matchMedia && global.matchMedia('(max-width: 760px)').matches);
    var count = mobile ? 4 : (cfg.intensity === 'subtle' ? 9 : (cfg.intensity === 'festive' ? 24 : 16));
    var layer = document.createElement('div');
    layer.id = 'vmFestivalLayer';
    layer.className = 'vm-festival-layer festival-' + cfg.festival + ' intensity-' + cfg.intensity;
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-vm-passive-overlay', 'true');
    layer.setAttribute('inert', '');
    layer.innerHTML = cfg.festival === 'national_day'
      ? nationalDayMarkup(count, mobile)
      : midAutumnMarkup(count, mobile);
    document.body.appendChild(layer);
    document.documentElement.setAttribute('data-vm-festival', cfg.festival);
    document.body.classList.add('vm-festival-active');
    return true;
  }

  function renderPreview(target, config) {
    if (!target) return;
    var cfg = normalizeConfig(config);
    target.className = 'vm-festival-preview festival-' + cfg.festival + ' intensity-' + cfg.intensity;
    target.innerHTML = previewMarkup(cfg);
  }

  async function loadConfig() {
    if (!global.sb || !global.sb.from) return normalizeConfig(DEFAULT_CONFIG);
    try {
      var result = await global.sb.from('app_settings').select('value').eq('key', 'festival_config').maybeSingle();
      if (result.error) throw result.error;
      return normalizeConfig(result.data && result.data.value);
    } catch (error) {
      console.warn('Không tải được cấu hình lễ hội, dùng lịch tự động:', error && error.message);
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }

  async function refresh() {
    var cfg = await loadConfig();
    render(cfg);
    global.dispatchEvent(new CustomEvent('vm:festival-config', { detail: cfg }));
    return cfg;
  }

  function subscribe() {
    if (!global.sb || !global.sb.channel || realtimeChannel) return;
    try {
      realtimeChannel = global.sb.channel('festival-theme-settings')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.festival_config'
        }, function (payload) {
          var row = payload.new || {};
          var cfg = normalizeConfig(row.value);
          render(cfg);
          global.dispatchEvent(new CustomEvent('vm:festival-config', { detail: cfg }));
        })
        .subscribe();
    } catch (_) {}
  }

  async function boot() {
    ensureStyles();
    await refresh();
    subscribe();
    global.dispatchEvent(new CustomEvent('vm:festival-ready', { detail: activeConfig }));
  }

  global.VMFestival = {
    defaults: normalizeConfig(DEFAULT_CONFIG),
    catalog: FESTIVALS,
    normalizeConfig: normalizeConfig,
    solarToLunar: solarToLunar,
    vietnamDateParts: vietnamDateParts,
    isoVietnamDate: isoVietnamDate,
    isAutoMidAutumn: isAutoMidAutumn,
    isAutoNationalDay: isAutoNationalDay,
    isActive: isActive,
    loadConfig: loadConfig,
    refresh: refresh,
    render: render,
    remove: removeLayer,
    renderPreview: renderPreview,
    current: function () { return activeConfig ? normalizeConfig(activeConfig) : normalizeConfig(DEFAULT_CONFIG); }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
