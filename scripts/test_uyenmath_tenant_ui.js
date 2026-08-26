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
const genericLanding = compileInline('khong-gian.html');
const admin = compileInline('quan-tri-khong-gian.html');
const manifest = JSON.parse(read('manifest-uyenmath.webmanifest'));
const rootAdmin = read('quan-tri.html');
const portalAdmin = read('quan-tri-portal-thi.html');
const accountAdmin = read('quan-tri-tai-khoan.html');
const portalRuntime = read('js/exam-portal.js');
const examAdmin = read('js/exam-admin.js');
const practice = read('luyen-de.html');
const accountEdge = read('supabase/functions/tao-tai-khoan/index.ts');

expect(landing.includes("target.searchParams.set('tenant', 'uyenmath')"), 'The historic UYENMATH route must preserve identity while redirecting to the shared shell');
expect(landing.includes("new URL('khong-gian', location.href)"), 'UYENMATH must use the generic full-site renderer');
expect(genericLanding.includes('vmLoadPublicTenantContext(tenantSlug)'), 'The shared tenant home must load its brand through the public context RPC');
expect(genericLanding.includes('vmTenantFirstShownPath(signedContext, role.key)'), 'The workspace action must honor admin show/lock/hide rules');
expect(genericLanding.includes('vmTenantLandingCopy(context)'), 'Every tenant must receive central landing defaults plus sparse copy overrides');
expect(!/<a[^>]+href=["'][^"']*(?:uyenmath-(?:lop|bai|de|vmtool)|\/uyenmath\/)/i.test(genericLanding), 'UYENMATH must not create parallel feature pages');
expect(!genericLanding.includes("location.replace('trang-chu?tenant=uyenmath')"), 'Signed-in members must remain on the shared landing until they choose to enter');

expect(admin.includes(".eq('experience_mode','full_site')"), 'Admin must manage only full-site brand overlays here');
expect(admin.includes("['teacher','student'].forEach") && admin.includes('stateSelect(role,f.key,item.state)'), 'Admin needs role-specific show/lock/hide controls');
expect(admin.includes("type:'full_site_tenant_migrate'"), 'Admin account migration must use the audited Edge action');
expect(admin.includes("me.role!=='admin'"), 'Tenant controls must be admin-only');
expect(admin.includes("active.disabled=currentTenant.is_active!==true"), 'A staged tenant must not be activated before the audited account migration');
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
