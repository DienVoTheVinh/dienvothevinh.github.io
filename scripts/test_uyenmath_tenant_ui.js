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
const unifiedMigration = read('supabase/migrations/20260828143000_unify_admin_brand_theme_feature_access.sql');

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
expect(admin.includes('active.disabled=true'), 'Identity edits must not expose a second direct activation path');
expect(admin.includes("sb.rpc('vm_admin_deploy_tenant'") && admin.includes("sb.rpc('vm_admin_update_tenant_lifecycle'"), 'Tenant activation, update and pause must use audited lifecycle RPCs');
expect(admin.includes('if(!await saveIdentity(true))return') && admin.includes('if(!await saveFeatures(true))return'), 'Deploy must persist the complete draft before publishing it');
expect(admin.includes('id="tenantExamFocus"') && admin.includes('exam_focus_mode,deployed_at'), 'Exam-focus state and deploy metadata must be explicit in the unified manager');
expect(admin.includes(".eq('experience_mode','full_site').select().single()"), 'Identity edits must stay scoped to full-site overlays');
expect((rootAdmin.match(/href="quan-tri-khong-gian"/g) || []).length === 1, 'The admin hub must expose exactly one unified tenant entry');
expect(!rootAdmin.includes('href="quan-tri-thuong-hieu"') && !rootAdmin.includes('href="quan-tri-portal-thi"'), 'Legacy brand and portal shortcuts must not bypass the unified manager');
expect(admin.includes('quan-tri-thuong-hieu?embed=1') && admin.includes('quan-tri-portal-thi?embed=1'), 'The unified manager must retain both legacy workflows as embedded panels');
expect(unifiedMigration.includes('exam_focus_mode boolean not null default false'), 'Exam focus must be independent from experience_mode');
expect(unifiedMigration.includes("if v_portal.experience_mode<>'full_site'") && unifiedMigration.includes("where id=p_portal_id and experience_mode='full_site'"), 'Lifecycle RPCs must never activate an exam-only portal as a full-site tenant');
expect(unifiedMigration.includes('deployed_at=now()') && unifiedMigration.includes('deployed_by=v_actor'), 'Publishing must record audited deploy metadata');

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
