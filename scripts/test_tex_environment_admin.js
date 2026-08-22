const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(value, message) { if (!value) throw new Error(message); }

const runtime = read('js/tex-environments.js');
const reader = read('js/latex-view.js');
const lesson = read('bai-hoc.html');
const admin = read('quan-tri-tex.html');
const migration = read('web/supabase/tex_environment_admin.sql');
const menu = read('js/menu-v5.js');

new Function(runtime);
const inlineScripts = Array.from(admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((match) => match[1]).filter((code) => code.trim());
inlineScripts.forEach((code) => new Function(code));

ok(runtime.includes('vmTaiMoiTruongTex'), 'runtime must expose its loader');
ok(runtime.includes('vmChenPreambleMoiTruongTex'), 'runtime must expose PDF preamble injection');
ok(runtime.includes('safeColor') && runtime.includes('safeSize'), 'database styles must be sanitized before CSS injection');
ok(reader.includes('vmDanhSachTenMoiTruongTex'), 'reader must discover configured environments');
ok(reader.includes('data-vm-env'), 'reader output must carry the environment style hook');
ok(lesson.includes('await vmTaiMoiTruongTex()'), 'lesson must load published environment definitions');
ok(lesson.includes('vmChenPreambleMoiTruongTex(trimmed)'), 'complete TeX documents must receive the published PDF preamble');
ok(menu.includes("path: 'quan-tri', label: 'Quản trị'") && read('quan-tri.html').includes('href="quan-tri-tex"'), 'admin hub must link to the TeX manager');
ok(admin.includes("profile.role!=='admin'"), 'admin page must reject non-admin profiles');
ok(admin.includes("sb.rpc('publish_tex_environment'"), 'publishing must use the atomic RPC');
ok(admin.includes('restore_tex_environment_version'), 'version restore must be available');
ok(migration.includes('enable row level security'), 'all exposed tables must enable RLS');
ok(migration.includes('revoke all on function public.publish_tex_environment'), 'publish RPC must not be public');
ok(migration.includes('not public.is_admin()'), 'security-definer RPC must check the current admin profile');
ok(migration.includes('tex_environment_versions'), 'published versions must be retained');

console.log('TeX environment admin checks passed.');
