const fs = require('fs');
const vm = require('vm');

function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function expect(value, message) { if (!value) throw new Error(message); }
function compileInline(file) {
  const html = read(file);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((source) => source.trim())
    .forEach((source, index) => new vm.Script(source, { filename: `${file}#${index + 1}` }));
  return html;
}

const landing = compileInline('uyenmath.html');
const admin = compileInline('quan-tri-khong-gian.html');
const manifest = JSON.parse(read('manifest-uyenmath.webmanifest'));
const rootAdmin = read('quan-tri.html');
const portalAdmin = read('quan-tri-portal-thi.html');
const accountAdmin = read('quan-tri-tai-khoan.html');
const portalRuntime = read('js/exam-portal.js');
const examAdmin = read('js/exam-admin.js');
const practice = read('luyen-de.html');
const accountEdge = read('supabase/functions/tao-tai-khoan/index.ts');

expect(landing.includes('Không gian Toán học của Cô Uyên'), 'UYENMATH needs its own public home identity');
expect(landing.includes('vận hành trên nền tảng VinhMath'), 'The tenant home must explain that it reuses the VinhMath platform');
expect(landing.includes('dang-nhap?tenant=uyenmath'), 'Tenant home must open the branded shared login');
expect(landing.includes('await vmLoadTenantContext()'), 'Authenticated members must reuse the shared tenant runtime');
expect(!/<a[^>]+href=["'][^"']*(?:uyenmath-(?:lop|bai|de|vmtool)|\/uyenmath\/)/i.test(landing), 'UYENMATH must not create parallel feature pages');
expect(landing.includes("params.has('feature')"), 'An all-hidden feature policy must not loop between the tenant home and shared home');

expect(admin.includes(".eq('experience_mode','full_site')"), 'Admin must manage only full-site brand overlays here');
expect(admin.includes("stateSelect('teacher'") && admin.includes("stateSelect('student'"), 'Admin needs role-specific show/lock/hide controls');
expect(admin.includes("type:'full_site_tenant_migrate'"), 'Admin account migration must use the audited Edge action');
expect(admin.includes("me.role!=='admin'"), 'Tenant controls must be admin-only');
expect(admin.includes("activeSelect.disabled=currentTenant.is_active!==true"), 'A staged tenant must not be activated before the audited account migration');
expect(admin.includes(".eq('experience_mode','full_site').select().single()"), 'Identity edits must stay scoped to full-site overlays');
expect(rootAdmin.includes('href="quan-tri-khong-gian"'), 'The admin hub must link to tenant controls');

expect(portalAdmin.includes(".eq('experience_mode','exam_only')"), 'The legacy portal manager must exclude full-site brand overlays');
expect(accountAdmin.includes(".eq('experience_mode', 'exam_only')"), 'Portal-only account creation must not list full-site brand overlays');
expect(portalRuntime.includes("membership.portal.experience_mode==='full_site'") && portalRuntime.includes("membership.portal.experience_mode!=='exam_only'"), 'The legacy portal page must redirect full-site overlays to shared VinhMath');
expect(examAdmin.includes("data.portal.experience_mode !== 'exam_only'"), 'Portal-scoped authoring must reject a full-site brand overlay');
expect(practice.includes("membership.data.portal.experience_mode === 'full_site'") && practice.includes("membership.data.portal.experience_mode !== 'exam_only'"), 'Portal-scoped practice must reject a full-site brand overlay');
expect(accountEdge.includes('portal.experience_mode !== "exam_only"'), 'The server must reject portal-only account creation inside a full-site brand overlay');

expect(manifest.name.startsWith('UYENMATH'), 'Tenant install manifest must retain the UYENMATH name');
expect(manifest.start_url === '/uyenmath' && manifest.scope === '/', 'Tenant PWA must start at its own home while sharing all VinhMath routes');
expect(manifest.icons.some((icon) => icon.src.includes('/logo/uyenmath/')), 'Tenant PWA must use the UYENMATH icon');

console.log('PASS UYENMATH tenant UI: branded home, shared features, admin controls and install identity');
