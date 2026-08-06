const fs = require('fs');
const vm = require('vm');

const login = fs.readFileSync('dang-nhap.html', 'utf8');
const core = fs.readFileSync('js/vinhmath.js', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/id="rememberLogin"\s+checked/.test(login), 'Remember-login option must be visible and enabled by default');
expect(/name="username"[^>]+autocomplete="username"/.test(login), 'Username field must support browser credential managers');
expect(/name="password"[^>]+autocomplete="current-password"/.test(login), 'Password field must support browser credential managers');
expect(/aria-label="Hiện mật khẩu"[^>]+aria-pressed="false"/.test(login), 'Hidden-password state must announce the show action');
expect(/capNhatNutMat\(seHien\)/.test(login), 'Password icon and accessible label must track visibility');
expect(/<svg[\s\S]*?<circle cx="12" cy="12" r="3"/.test(login), 'A clean open-eye SVG icon is required');
expect(/M3 3l18 18/.test(login), 'A crossed-eye SVG icon is required for the hide action');
expect(/vmDatNhoDangNhap\(remember\)[\s\S]*?dangNhap\(username, \$\('pass'\)\.value\)/.test(login), 'Remember preference must be applied before Supabase creates the session');

expect(/var VM_REMEMBER_KEY = 'vm-auth-remember'/.test(core), 'Shared auth storage needs a persistent remember preference');
expect(/if \(LS && vmCoNhoDangNhap\(\)\) LS\.setItem\(VM_SHARED_KEY, val\)/.test(core), 'Persistent session may only be mirrored when remember-login is enabled');
expect(/else if \(LS\) \{ LS\.removeItem\(VM_SHARED_KEY\); LS\.removeItem\(VM_OLD_KEY\); \}/.test(core), 'Disabling remember-login must clear persistent session copies');

expect(!/localStorage\.setItem\([^\n]*(pass|password)/i.test(login), 'The page must never save a password in localStorage');
expect(!/VM_SAVED_PASSWORD|remembered-password/i.test(login + core), 'No application-managed password storage is allowed');

for (const file of ['dang-nhap.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  scripts.forEach((code, index) => new vm.Script(code, { filename: `${file}#inline-${index + 1}` }));
}

console.log('PASS remember login, secure session storage and password visibility controls');
