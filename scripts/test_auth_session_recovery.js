const fs = require('fs');
const vm = require('vm');

const core = fs.readFileSync('js/vinhmath.js', 'utf8');
const login = fs.readFileSync('dang-nhap.html', 'utf8');

function expect(value, message) {
  if (!value) throw new Error(message);
}

expect(core.includes("storageKey: VM_SHARED_KEY"), 'Supabase tabs are not using a coordinated storage key');
expect(!core.includes("storageKey: 'vmauth-' + vmTabId()"), 'Legacy per-tab token rotation race is still active');
expect(core.includes("autoRefreshToken: !/^\\/dang-nhap"), 'Login page must not run a background refresh loop');
expect(core.includes("code === 'refresh_token_not_found'") && core.includes("message.indexOf('invalid refresh token')"), 'Stale refresh-token fingerprints are incomplete');
expect(/async function vmLayPhienAnToan[\s\S]*?vmChoCoGioiHan\(sb\.auth\.getSession\(\)/.test(core), 'Session reads must have a timeout');
expect(/function vmXoaPhienHongCucBo[\s\S]*?removeItem\(VM_SHARED_KEY\)/.test(core), 'Broken local sessions are not cleared');
expect(/vmLayPhienAnToan\(6000\)[\s\S]*?Phiên đăng nhập cũ đã hết hạn/.test(login), 'Login page does not recover visibly from an expired session');
expect(/finally\s*\{[\s\S]*?nut\.disabled = false[\s\S]*?AUTH_SIGN_IN/.test(login), 'Login button can remain locked after a failed request');

function storage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const start = core.indexOf('var VM = window.VINHMATH_CONFIG || {};');
const end = core.indexOf('function daKetNoi()', start);
expect(start >= 0 && end > start, 'Auth bootstrap fixture is missing');
const localStorage = storage({ 'vm-auth-remember':'1', 'vmauth-shared':'expired-session' });
const sessionStorage = storage({ 'vmauth-old-tab':'expired-session-copy' });
let clientOptions = null;
const auth = {
  getSession() {
    return Promise.resolve({ data:{ session:null }, error:{ code:'refresh_token_not_found', message:'Invalid Refresh Token' } });
  },
};
const context = {
  window: {
    VINHMATH_CONFIG:{ SUPABASE_URL:'https://project.supabase.co', SUPABASE_ANON_KEY:'anon-placeholder' },
    localStorage,
    sessionStorage,
    location:{ pathname:'/dang-nhap' },
    supabase:{ createClient(url, key, options) { clientOptions = options; return { auth }; } },
  },
  URL,
  setTimeout,
  clearTimeout,
  Promise,
  console,
};
context.window.window = context.window;
context.window.supabase = context.window.supabase;
context.supabase = context.window.supabase;
vm.runInNewContext(core.slice(start, end), context, { filename:'auth-session-bootstrap.js' });

expect(clientOptions.auth.storageKey === 'vmauth-shared', 'Runtime client did not receive the stable key');
expect(clientOptions.auth.autoRefreshToken === false, 'Login runtime still enables background refresh');
context.vmLayPhienAnToan(100).then((result) => {
  expect(!result.data.session && result.error.code === 'refresh_token_not_found', 'Invalid session result was not preserved for UI messaging');
  expect(localStorage.getItem('vmauth-shared') === null, 'Invalid shared session was not removed');
  expect(sessionStorage.getItem('vmauth-old-tab') === null, 'Legacy per-tab session copy was not removed');
  console.log('PASS coordinated auth storage, stale-session recovery and bounded login UI');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
