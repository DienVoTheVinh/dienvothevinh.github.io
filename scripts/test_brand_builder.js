const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const compileInline = (file) => {
  const html = read(file);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim())
    .forEach((source, index) => new vm.Script(source, { filename: `${file}#inline-${index + 1}` }));
  return html;
};

new vm.Script(read('js/vinhmath.js'), { filename: 'js/vinhmath.js' });
new vm.Script(read('js/menu-v5.js'), { filename: 'js/menu-v5.js' });
new vm.Script(read('sw.js'), { filename: 'sw.js' });

const manager = compileInline('quan-tri-thuong-hieu.html');
const classroom = compileInline('quan-tri-lop.html');
const studentClass = compileInline('lop-hoc.html');
const lesson = compileInline('bai-hoc.html');
const classNews = compileInline('bang-tin-lop.html');
const migration = read('supabase/migrations/20260820160031_brand_template_builder.sql');
const goldMigration = read('supabase/migrations/20260822065653_restore_vinhmath_signature_gold.sql');
const wordmarkMigration = read('supabase/migrations/20260824161736_add_brand_wordmark_colors.sql');
const menu = read('js/menu-v5.js');
const shared = read('js/vinhmath.js');

expect(menu.includes("path: 'quan-tri', label: 'Quản trị'") && read('quan-tri.html').includes('href="quan-tri-thuong-hieu"'), 'Admin hub shortcut is missing');
expect(manager.includes('id="logoDrop"') && manager.includes("addEventListener('paste'"), 'Logo drop/paste workflow is missing');
expect(manager.includes('id="previewLogoBox"') && manager.includes("addEventListener('pointermove'"), 'Logo drag positioning is missing');
expect(manager.includes("PRESETS={") && manager.includes('vinhmath:') && manager.includes('map:') && manager.includes('duyminh:'), 'Brand presets are incomplete');
expect(manager.includes("primary_color:'#FFD21A'") && manager.includes("secondary_color:'#DD9400'") && manager.includes("accent_color:'#DD9400'") && manager.includes("accent_soft_color:'#FCF4E6'"), 'VinhMath signature gold preset has regressed');
expect(manager.includes("map:{label:'M.A.P'") && manager.includes("primary_color:'#1B2644'") && manager.includes("duyminh:{label:'Duy Minh'") && manager.includes("primary_color:'#C81E27'"), 'M.A.P or Duy Minh preset was changed unexpectedly');
expect(manager.includes('id="brandWordmarkPrimary"') && manager.includes('id="brandWordmarkSecondary"'), 'Independent wordmark text fields are missing');
expect(manager.includes("['wordmark_primary_color','Chữ thương hiệu — vế đầu']") && manager.includes("['wordmark_secondary_color','Chữ thương hiệu — vế sau']"), 'Independent wordmark color controls are missing');
expect(manager.includes('wordmark.replaceChildren(first,second)'), 'Wordmark preview must render both parts safely');
expect(manager.includes("file.size>2097152") && manager.includes("image/webp"), 'Client logo validation is incomplete');
expect(manager.includes("profile.role!=='admin'"), 'Brand manager must be admin-only');
expect(manager.includes("location.hostname==='127.0.0.1'") && manager.includes("get('preview')==='1'"), 'Local visual preview must be host-restricted');
expect(manager.includes("sb.storage.from('brand-assets').upload") && manager.includes('upsert:false'), 'Logo uploads must use the dedicated bucket without overwrite');
expect(!manager.includes('service_role') && !manager.includes('SUPABASE_SERVICE'), 'Privileged keys must not appear in the manager');

expect(classroom.includes("brand_id: brandId") && classroom.includes('VM_BRAND_RELATION'), 'Class create/edit is not connected to brand templates');
for (const [name, source] of [['lop-hoc.html', studentClass], ['bai-hoc.html', lesson], ['bang-tin-lop.html', classNews]]) {
  expect(source.includes('VM_BRAND_RELATION'), `${name} does not fetch the selected brand`);
  expect(source.includes('vmThuongHieuTuLop'), `${name} does not apply the selected brand`);
}
expect(shared.includes('function vmApDungBienThuongHieu') && shared.includes('function vmUrlLogoThuongHieu'), 'Shared dynamic brand runtime is incomplete');
expect(shared.includes('function vmVeWordmarkThuongHieu') && shared.includes('function vmTachWordmarkThuongHieu'), 'Shared two-part wordmark runtime is missing');
expect(shared.includes('wordmark_primary_text,wordmark_secondary_text,wordmark_primary_color,wordmark_secondary_color'), 'Brand queries do not include the wordmark columns');
expect(shared.includes('container.replaceChildren(first, second)'), 'Custom wordmarks must use safe DOM rendering');
expect(shared.includes("document.documentElement.getAttribute('data-theme') === 'dark'"), 'Dynamic brands must distinguish light and dark mode');
expect(shared.includes('function vmBangMauToiThuongHieu') && shared.includes('function vmMauDuSangTrenNenToi'), 'Dark brand palette adaptation is missing');
expect(shared.includes("window.addEventListener('theme-change'") && shared.includes('window.VM_ACTIVE_BRAND'), 'Active brand must be reapplied after a theme switch');

expect(migration.includes('alter table public.brand_templates enable row level security'), 'Brand templates need RLS');
expect(migration.includes('brand_templates_insert_admin') && migration.includes('brand_templates_update_admin'), 'Admin-only write policies are missing');
expect(!/grant\s+delete\s+on\s+table\s+public\.brand_templates/i.test(migration), 'Frontend must archive rather than delete brand templates');
expect(migration.includes("'brand-assets'") && migration.includes('2097152'), 'Dedicated constrained logo bucket is missing');
expect(migration.includes('allowed_mime_types') && migration.includes("'image/png'") && migration.includes("'image/jpeg'") && migration.includes("'image/webp'"), 'Logo MIME restrictions are missing');
expect(migration.includes('classes_brand_id_fkey') && migration.includes('classes_brand_id_idx'), 'Class brand foreign key/index is missing');
expect(migration.includes('grant select on table public.brand_templates to anon, authenticated'), 'Data API grants for brand reads are missing');
expect(goldMigration.includes("where slug = 'vinhmath'") && goldMigration.includes("and preset = 'vinhmath'"), 'Gold repair migration must target only the canonical VinhMath template');
expect(!/where\s+slug\s+in/i.test(goldMigration) && !/slug\s*=\s*'(?:map|duyminh)'/i.test(goldMigration), 'Gold repair migration must not modify M.A.P or Duy Minh');
expect(wordmarkMigration.includes('add column wordmark_primary_text text') && wordmarkMigration.includes('add column wordmark_secondary_color text'), 'Wordmark schema columns are incomplete');
expect(wordmarkMigration.includes('brand_templates_wordmark_primary_color_hex') && wordmarkMigration.includes("~ '^#[0-9A-Fa-f]{6}$'"), 'Wordmark colors need database hex constraints');
expect(wordmarkMigration.includes("where slug = 'vinhmath'") && wordmarkMigration.includes("wordmark_primary_text = 'Vinh'"), 'Canonical VinhMath wordmark backfill is missing');

for (const logo of ['uyenmath-apple-um-final.png']) {
  const stat = fs.statSync(path.join(root, 'logo', 'uyenmath', logo));
  expect(stat.size > 0 && stat.size <= 2097152, `${logo} must be ready for the 2 MB upload limit`);
}

console.log('PASS brand builder: schema/RLS, admin editor, logo workflow, class selection and student branding');
