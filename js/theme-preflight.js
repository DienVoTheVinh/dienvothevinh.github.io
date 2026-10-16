/* VinhMath theme preflight
   Runs as a parser-blocking head script before shared CSS so the browser paints
   the saved colour scheme on the very first frame of every navigation. */
(function (document, window) {
  'use strict';

  var DARK = 'dark';
  var LIGHT = 'light';
  var SCHEDULE_KEY = 'vm-theme-schedule';
  var CHOICE_KEY = 'vm-theme-choice';
  var OVERRIDE_KEY = 'vm-theme-session';
  var root = document.documentElement;
  // One palette for the head prepaint and all later settings/theme updates.
  var palettes = {
    light: {
      blue: ['#2563eb', 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', 'rgba(37, 99, 235, 0.08)'],
      violet: ['#8b5cf6', 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', 'rgba(139, 92, 246, 0.08)'],
      coral: ['#ff5e62', 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', 'rgba(255, 94, 98, 0.08)'],
      green: ['#10b981', 'linear-gradient(135deg, #34d399 0%, #059669 100%)', 'rgba(16, 185, 129, 0.08)'],
      amber: ['#DD9400', 'linear-gradient(135deg, #FFD21A 0%, #F7A80C 50%, #DD9400 100%)', 'rgba(221, 148, 0, 0.10)']
    },
    dark: {
      blue: ['#2563eb', 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)', 'rgba(37, 99, 235, 0.15)'],
      violet: ['#c084fc', 'linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)', 'rgba(192, 132, 252, 0.12)'],
      coral: ['#ff5e62', 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)', 'rgba(255, 94, 98, 0.12)'],
      green: ['#34d399', 'linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)', 'rgba(52, 211, 153, 0.12)'],
      amber: ['#d97706', 'linear-gradient(135deg, #b45309 0%, #fbbf24 100%)', 'rgba(217, 119, 6, 0.15)']
    }
  };
  function saved(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
  function numberSetting(key, fallback, min, max) {
    var value = saved(key);
    return value !== null && value !== '' && isFinite(Number(value))
      ? Math.max(min, Math.min(max, Number(value))) : fallback;
  }
  function applyAccent(el, color, dark) {
    var target = palettes[dark ? DARK : LIGHT][color] || palettes[dark ? DARK : LIGHT].amber;
    if (!Array.isArray(target)) target = palettes[dark ? DARK : LIGHT].amber;
    ['--accent-2', '--accent-strong', '--gold'].forEach(function (key) { el.style.removeProperty(key); });
    el.style.setProperty('--accent', target[0]);
    el.style.setProperty('--accent-gradient', target[1]);
    el.style.setProperty('--accent-soft', target[2]);
    applyPersonalColor(saved('vm-theme-color'), el);
  }
  function applyPersonalColor(color, el) {
    el = el || root;
    if (!/^#[\da-f]{6}$/i.test(color || '')) return;
    var n = parseInt(color.slice(1), 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    function shade(f) { return '#' + rgb.map(function (v) { return ('0' + Math.round(v * f).toString(16)).slice(-2); }).join(''); }
    el.style.setProperty('--accent', color);
    el.style.setProperty('--accent-2', shade(.78));
    el.style.setProperty('--accent-strong', shade(.6));
    el.style.setProperty('--gold', color);
    el.style.setProperty('--accent-gradient', 'linear-gradient(135deg,' + color + ',' + shade(.6) + ')');
    el.style.setProperty('--accent-soft', 'rgba(' + rgb.join(',') + ',.12)');
  }
  var publicHome = /^\/(?:index(?:\.html)?)?\/?$/.test(window.location && window.location.pathname || '');
  if (publicHome) root.classList.add('vm-public-shell');

  function normaliseTheme(value) {
    return value === LIGHT ? LIGHT : DARK;
  }

  function parseSchedule() {
    try {
      var raw = window.localStorage.getItem(SCHEDULE_KEY);
      var value = raw ? JSON.parse(raw) : null;
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function minutesAtVietnam(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(date || new Date());
      var hour = Number(parts.filter(function (item) { return item.type === 'hour'; })[0].value);
      var minute = Number(parts.filter(function (item) { return item.type === 'minute'; })[0].value);
      return (hour % 24) * 60 + minute;
    } catch (_) {
      var fallback = date || new Date();
      return fallback.getHours() * 60 + fallback.getMinutes();
    }
  }

  function parseClock(value, fallback) {
    var match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return fallback;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : fallback;
  }

  function resolveSystemTheme(schedule, date) {
    if (!schedule || schedule.mode !== 'schedule') return normaliseTheme(schedule && schedule.theme);
    var now = minutesAtVietnam(date);
    var light = parseClock(schedule.lightStart, 6 * 60);
    var dark = parseClock(schedule.darkStart, 19 * 60);
    if (light === dark) return normaliseTheme(schedule.theme);
    var isLight = light < dark ? now >= light && now < dark : now >= light || now < dark;
    return isLight ? LIGHT : DARK;
  }

  function readSavedTheme() {
    try {
      // Lựa chọn bằng nút mặt trời chỉ có hiệu lực trong phiên đăng nhập hiện
      // tại. Khi đăng xuất/đăng nhập lại, hệ thống trở về lịch của quản trị.
      if (window.sessionStorage && window.sessionStorage.getItem(CHOICE_KEY) === 'manual') {
        return normaliseTheme(window.sessionStorage.getItem(OVERRIDE_KEY));
      }
      var schedule = parseSchedule();
      if (schedule) return resolveSystemTheme(schedule);
      return normaliseTheme(window.localStorage.getItem('vm-theme'));
    } catch (_) {
      return DARK;
    }
  }

  function applyTheme(value) {
    var theme = normaliseTheme(value);
    var dark = theme === DARK;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var background = dark ? (publicHome ? '#090909' : '#000000') : '#faf8f5';
    root.style.backgroundColor = background;
    root.style.setProperty('--vm-startup-bg', background);
    root.style.setProperty('--glass-opacity', numberSetting('vm-transparency', dark ? .3 : .2, 0, 1));
    root.style.setProperty('--glass-blur-radius', numberSetting('vm-blur', 20, 0, 60) + 'px');
    root.style.setProperty('--canvas-opacity', numberSetting('vm-canvas-opacity', .25, 0, 1));
    applyAccent(root, saved('vm-accent') || 'amber', dark);
    root.classList.add('vm-theme-prepaint');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', background);
    return theme;
  }

  var theme = applyTheme(readSavedTheme());
  window.VMThemePreflight = {
    theme: theme,
    scheduleKey: SCHEDULE_KEY,
    choiceKey: CHOICE_KEY,
    overrideKey: OVERRIDE_KEY,
    resolveSystemTheme: resolveSystemTheme,
    readSavedTheme: readSavedTheme,
    applyAccent: applyAccent,
    applyPersonalColor: applyPersonalColor,
    apply: function (value) {
      this.theme = applyTheme(value);
      return this.theme;
    }
  };
})(document, window);
