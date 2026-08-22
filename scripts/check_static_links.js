const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
const missing = [];

function existsFrom(page, raw) {
  const value = String(raw || '').trim();
  if (!value || /^(?:#|https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(value)) return true;
  // Bỏ qua template/replacement nằm trong mã JavaScript nội tuyến (vd. "$2").
  if (/[<{$]/.test(value)) return true;
  const clean = decodeURIComponent(value.split('#')[0].split('?')[0]);
  if (!clean || clean === '/') return true;
  const base = clean.startsWith('/') ? root : path.dirname(path.join(root, page));
  const target = path.resolve(base, clean.replace(/^\/+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) return false;
  return fs.existsSync(target) || fs.existsSync(target + '.html') || fs.existsSync(path.join(target, 'index.html'));
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi)) {
    if (!existsFrom(file, match[1])) missing.push(`${file}: ${match[1]}`);
  }
}

if (missing.length) {
  console.error(missing.join('\n'));
  throw new Error(`Có ${missing.length} liên kết tài nguyên nội bộ không tồn tại`);
}
console.log(`Static links OK (${htmlFiles.length} root HTML pages)`);
