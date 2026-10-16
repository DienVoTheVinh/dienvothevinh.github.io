const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

function runPreflight(savedTheme, options = {}) {
  const attrs = {};
  const classes = new Set();
  const styles = {};
  const meta = { content: '#9e6100', setAttribute(name, value) { this[name] = value; } };
  const document = {
    documentElement: {
      style: {
        setProperty(key, value) { styles[key] = String(value); },
        removeProperty(key) { delete styles[key]; },
        set colorScheme(value) { styles.colorScheme = value; },
        set backgroundColor(value) { styles.backgroundColor = value; }
      },
      setAttribute(name, value) { attrs[name] = value; },
      classList: { add(value) { classes.add(value); } }
    },
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? meta : null; }
  };
  const window = {
    localStorage: {
      getItem(key) {
        if (key === 'vm-theme') return savedTheme;
        if (key === 'vm-theme-schedule') return options.schedule ? JSON.stringify(options.schedule) : null;
        if (options.settings && key in options.settings) return options.settings[key];
        return null;
      }
    },
    sessionStorage: {
      getItem(key) {
        if (key === 'vm-theme-choice') return options.manual ? 'manual' : null;
        if (key === 'vm-theme-session') return options.override || null;
        if (options.sessionSettings && key in options.sessionSettings) return options.sessionSettings[key];
        return null;
      }
    }
  };
  vm.runInNewContext(read('js/theme-preflight.js'), { document, window });
  return { attrs, classes, styles, meta, api: window.VMThemePreflight };
}

const dark = runPreflight('dark');
expect(dark.attrs['data-theme'] === 'dark', 'Dark preference must be applied before CSS');
expect(dark.styles.backgroundColor === '#000000' && dark.styles.colorScheme === 'dark', 'Dark first paint must use a dark canvas and native controls');
expect(dark.meta.content === '#000000', 'Browser chrome colour must match dark mode');
expect(dark.classes.has('vm-theme-prepaint'), 'Preflight marker must be present');

const light = runPreflight('light');
expect(light.attrs['data-theme'] === 'light', 'Light preference must be applied before CSS');
expect(light.styles.backgroundColor === '#faf8f5' && light.styles.colorScheme === 'light', 'Light first paint must use the paper canvas');
light.api.apply('dark');
expect(light.attrs['data-theme'] === 'dark' && light.styles.backgroundColor === '#000000', 'Theme toggles must reuse the same paint-safe path');

const resolver = runPreflight('dark').api;
const schedule = { mode: 'schedule', theme: 'dark', lightStart: '06:00', darkStart: '19:00' };
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T00:00:00Z')) === 'light', '07:00 in Vietnam must use the scheduled light theme');
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T13:00:00Z')) === 'dark', '20:00 in Vietnam must use the scheduled dark theme');
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T11:59:00Z')) === 'light', '18:59 in Vietnam must still use the scheduled light theme');
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T12:00:00Z')) === 'dark', '19:00 in Vietnam must switch to the scheduled dark theme');
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T22:59:00Z')) === 'dark', '05:59 in Vietnam must still use the scheduled dark theme');
expect(resolver.resolveSystemTheme(schedule, new Date('2026-08-28T23:00:00Z')) === 'light', '06:00 in Vietnam must switch to the scheduled light theme');
const temporary = runPreflight('dark', { schedule, manual: true, override: 'dark' });
expect(temporary.attrs['data-theme'] === 'dark', 'Manual sun-button choice must override the system only inside the current session');

const shared = read('js/vinhmath.js');
const css = read('css/vinhmath.css');
expect(!shared.includes('vmPageTransition') && !shared.includes('vm-leaving'), 'Navigation must not fade the whole body or delay links with JavaScript');
expect(shared.includes('window.VMThemePreflight.apply(newTheme)'), 'Runtime theme toggle must synchronize the root canvas through preflight');
expect(shared.includes("sessionStorage.setItem(VM_THEME_CHOICE_KEY, 'manual')"), 'User theme overrides must be scoped to the current sign-in session');
expect(!/toggleTheme\(\)[\s\S]{0,3000}luuCaiDatHeThong\('theme_mode'/.test(shared), 'The topbar sun button must never overwrite the global admin schedule');
expect(/vmXoaThemeTamTheoPhien\(\);[\s\S]{0,500}return \{ ok: true \};/.test(shared), 'A successful new login must reset the previous session theme override');
expect(/vmXoaThemeTamTheoPhien\(\);[\s\S]{0,500}vmChoCoGioiHan\(taiCaiDatHeThongGlobal\(\),\s*6000\)[\s\S]{0,300}return \{ ok: true \};/.test(shared), 'A successful login must refresh the global schedule before redirecting without blocking indefinitely');
expect(!/addEventListener\('change',\s*capNhatTrangThaiDieuKhienLichTheme\)/.test(shared), 'Schedule mode changes must not pass the DOM Event as schedule data');
expect(/khoiTaoControlCenter\(\);[\s\S]{0,300}vmKhoiDongDongHoTheme\(\);/.test(shared), 'Cached schedules must keep ticking even when the settings request is offline');
expect(/upsert\(\[[\s\S]*theme_mode[\s\S]*theme_theme[\s\S]*theme_light_start[\s\S]*theme_dark_start[\s\S]*\],\s*\{ onConflict: 'key' \}\)/.test(shared), 'Admin schedule persistence must atomically save mode, fallback theme and both time boundaries');
expect(css.includes('@view-transition { navigation: none; }'), 'Cross-document snapshot transitions must stay disabled');
expect(!css.includes('::view-transition-old(root)') && !css.includes('::view-transition-new(root)'), 'Shared CSS must not retain old/new page snapshots');
expect(/\.topbar,[\s\S]*\.portal-topbar\s*\{[\s\S]*view-transition-name:\s*none/.test(css), 'Shared topbars must not create independent snapshot layers');

const menu = read('js/menu-v5.js');
expect(menu.includes("VM_MENU_SHELL_CACHE_KEY = 'vm-menu-shell-v4-identity'"), 'Shared navigation must use the identity-scoped shell version');
expect(menu.includes('if (!userId || !role) return false') && menu.includes('cached.userId !== userId') && menu.includes('cached.role !== role'), 'Unverified or other-account shells must never paint');
expect(!/^vmMenuHydrateShell\(\);/m.test(menu), 'Do not hydrate a previous account before checking the current identity');
expect(menu.includes('vmMenuSaveShell(role)') && menu.includes('vmMenuClearShell()'), 'Navigation shell cache needs both refresh and cleanup paths');
expect(shared.includes('vmXoaVoGiaoDienTaiKhoan();') && shared.includes("key.indexOf('vm-menu-shell-') === 0"), 'Account changes must clear every historical menu-shell version');

const canonical = fs.readdirSync(root)
  .filter((file) => file.endsWith('.html') && file !== 'quan-tri-de.html')
  .filter((file) => read(file).includes('css/tokens.css'));
expect(canonical.length >= 40, 'Expected the canonical themed HTML surface');
for (const file of canonical) {
  const html = read(file);
  const preflightAt = html.indexOf('js/theme-preflight.js?v=3');
  const tokensAt = html.indexOf('css/tokens.css');
  expect(preflightAt !== -1 && preflightAt < tokensAt, `${file}: preflight must be parser-blocking before tokens.css`);
  expect(html.includes('css/vinhmath.css?v=8.12-account-theme'), `${file}: shared motion CSS cache key is stale`);
  if (html.includes('js/vinhmath.js')) expect(html.includes('js/vinhmath.js?v=9.9-account-theme'), `${file}: shared runtime cache key is stale`);
  if (html.includes('js/menu-v5.js')) expect(html.includes('js/menu-v5.js?v=20261016-startup'), `${file}: shared menu cache key is stale`);
}

const worker = read('sw.js');
expect(worker.includes("vinhmath-shell-v98"), 'Offline shell must advance for saved account themes');
expect(worker.includes("'/js/theme-preflight.js'"), 'Offline shell must cache the preflight script');

for (const theme of ['light', 'dark']) {
  const state = runPreflight(theme, { settings: { 'vm-accent': 'violet', 'vm-transparency': '.45', 'vm-blur': '24', 'vm-canvas-opacity': '.3' } });
  expect(state.styles['--accent'] === (theme === 'dark' ? '#c084fc' : '#8b5cf6'), 'Saved accent must paint before the runtime');
  expect(state.styles['--glass-opacity'] === '.45' || state.styles['--glass-opacity'] === '0.45', 'Glass opacity must paint before CSS');
  expect(state.styles['--glass-blur-radius'] === '24px', 'Blur must not change when runtime starts');
  const initial = JSON.stringify(state.styles);
  state.api.apply(theme);
  expect(JSON.stringify(state.styles) === initial, 'Reapplying the same theme must not change its appearance');
}
const personal = runPreflight('dark', {settings:{'vm-theme-color':'#12abcd'}});
expect(personal.styles['--accent'] === '#12abcd', 'Personal accent must not flash a global gold palette');
const corrupt = runPreflight('dark', {settings:{'vm-theme-color':'url(bad)', 'vm-blur':'bad', 'vm-canvas-opacity':'999'}});
expect(corrupt.styles['--accent'] === '#d97706' && corrupt.styles['--glass-blur-radius'] === '20px' && corrupt.styles['--canvas-opacity'] === '1', 'Invalid saved settings must have safe bounded defaults');
console.log(`PASS theme prepaint, identity-safe navigation and ${canonical.length} canonical HTML pages`);

const pref = mode => ({version:1,mode,lightStart:'06:00',darkStart:'19:00'});
const session = value => JSON.stringify({user:{id:'account-a',user_metadata:{vm_theme_preferences:value}}});
expect(runPreflight('dark',{settings:{'vmauth-shared':session(pref('light'))}}).attrs['data-theme'] === 'light', 'Personal fixed light must win over global dark before CSS');
expect(runPreflight('light',{settings:{'vmauth-shared':session(pref('dark'))}}).attrs['data-theme'] === 'dark', 'Personal fixed dark must win over global light');
expect(runPreflight('light',{settings:{'vmauth-shared':session(pref('system'))}}).attrs['data-theme'] === 'light', 'Explicit system choice must follow global theme');
expect(runPreflight('dark',{settings:{'vm-auth-remember':'0'},sessionSettings:{'vmauth-shared':session(pref('light'))}}).attrs['data-theme'] === 'light', 'Remember-me off must use only the tab session');
expect(runPreflight('dark',{settings:{'vm-auth-remember':'0','vmauth-shared':session(pref('light'))}}).attrs['data-theme'] === 'dark', 'Do not resurrect another persisted account when remember-me is off');
expect(runPreflight('dark',{manual:true,override:'dark',settings:{'vmauth-shared':session(pref('light'))},sessionSettings:{'vm-theme-override-user':'other-account'}}).attrs['data-theme'] === 'light', 'Temporary overrides must not leak across accounts');
expect(runPreflight('light',{settings:{'vm-account-theme:other-account':JSON.stringify({version:1,userId:'other-account',preference:pref('dark')})}}).attrs['data-theme'] === 'light', 'Signed-out pages must never use the last account preference');
const freshCache = {'vmauth-shared':session(pref('light')),'vm-account-theme:account-a':JSON.stringify({version:1,userId:'account-a',preference:pref('dark')})};
expect(runPreflight('light',{settings:freshCache}).attrs['data-theme'] === 'dark', 'Fresh server-confirmed cosmetic cache wins over stale session metadata for the same account');
const schedulePref = {...pref('schedule'),lightStart:'07:00',darkStart:'20:30'};
expect(resolver.resolvePreference(schedulePref,new Date('2026-10-17T13:29:00Z')) === 'light', 'Personal schedule: 20:29 Vietnam remains light');
expect(resolver.resolvePreference(schedulePref,new Date('2026-10-17T13:30:00Z')) === 'dark', 'Personal schedule: 20:30 Vietnam becomes dark');
expect(resolver.resolvePreference({...schedulePref,lightStart:'21:00',darkStart:'05:00'},new Date('2026-10-17T17:00:00Z')) === 'light', 'Schedules spanning midnight must work');
for (const invalid of [{...schedulePref,lightStart:'25:00'},{...schedulePref,darkStart:'07:00'},{...pref('dark'),version:999},{...pref('admin')},null]) expect(resolver.normalisePreference(invalid) === null, 'Invalid cosmetic metadata must be ignored');
console.log('PASS personal first paint, account isolation, session-only storage, fresh cache, schedule boundaries and invalid metadata');
