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
    root.style.backgroundColor = dark ? '#000000' : '#faf8f5';
    root.classList.add('vm-theme-prepaint');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#faf8f5');
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
    apply: function (value) {
      this.theme = applyTheme(value);
      return this.theme;
    }
  };
})(document, window);
