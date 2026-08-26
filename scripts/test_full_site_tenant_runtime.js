const fs = require('fs');
const vm = require('vm');

function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function expect(value, message) { if (!value) throw new Error(message); }

const shared = read('js/vinhmath.js');
const menu = read('js/menu-v5.js');
const login = read('dang-nhap.html');
const uyenLanding = read('uyenmath.html');
const genericLanding = read('khong-gian.html');

new vm.Script(shared, { filename: 'js/vinhmath.js' });
new vm.Script(menu, { filename: 'js/menu-v5.js' });
[...login.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `dang-nhap.html#${index + 1}` }));
[...uyenLanding.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `uyenmath.html#${index + 1}` }));
[...genericLanding.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `khong-gian.html#${index + 1}` }));

expect(shared.includes("VM_TENANT_CONTEXT_RPC = 'vm_current_tenant_context'"), 'Current tenant RPC contract is missing');
expect((shared.match(/sb\.rpc\(VM_TENANT_CONTEXT_RPC\)/g) || []).length === 1, 'A page must issue at most one current-context RPC');
expect(shared.includes('if (vmTenantContextPromise) return vmTenantContextPromise'), 'Concurrent tenant loads are not deduplicated');
expect(shared.includes('if (!context) context = await vmLegacyPortalContext'), 'A null full-site RPC result must still preserve an exam-only portal membership');
expect(shared.includes("VM_PUBLIC_TENANT_CONTEXT_RPC = 'vm_public_tenant_context'"), 'Public login tenant RPC contract is missing');

for (const key of ['home','classes','grading','authoring','vmtool','schedule','profile','lessons','practice','results','leaderboard']) {
  expect(menu.includes(`featureKey: '${key}'`), `Stable menu feature key is missing: ${key}`);
}
expect(menu.includes("item.featureState !== 'hidden'"), 'Hidden tenant features are not removed');
expect(menu.includes("m.featureState === 'locked'") && menu.includes('aria-disabled="true"') && menu.includes('vm-feature-locked'), 'Locked tenant features must remain visible and disabled');
expect(menu.includes("role !== 'admin'"), 'Admin feature-policy bypass is missing');
expect(!/item\.featureKey === 'home'[\s\S]{0,180}vmTenantHomePath\(fullSiteTenant\)/.test(menu), 'The workspace Home menu must stay inside the shared role dashboard');
expect(menu.includes('tenantContext && tenantContext.portal_only && !tenantContext.full_site'), 'Exam-only portals must remain isolated from full-site tenants');
expect(menu.includes("allowed = ['thi', 'luyen-de', 'dang-nhap']"), 'Legacy exam-only portal allow-list regressed');
expect(menu.includes('apDungMenu(r.data.role, portalContext, tenantContext)'), 'Full-site context is not passed to the shared menu');

expect(shared.includes('function vmGuardTenantRoute') && shared.includes("sessionStorage.setItem('vm-tenant-feature-notice'"), 'Direct-route feature guard is missing');
expect(shared.includes("role === 'admin'") && shared.includes("if (state === 'shown') return false"), 'Direct-route guard does not preserve admin/shown access');
expect(shared.includes("'trang-chu':'home'") && !shared.includes("'uyenmath':'home'"), 'The public tenant landing must stay outside workspace feature guards');
expect(shared.includes('function vmTenantFirstShownPath') && shared.includes("['home', 'trang-chu']") && shared.includes("['lessons', 'lop-hoc']"), 'The route guard needs a role-appropriate workspace fallback');
expect(shared.includes("(!shownTarget && !alreadyExplained)"), 'The all-hidden fallback must add its notice once without a redirect loop');
expect(shared.includes('window.VM_TENANT_CONTEXT.full_site && window.VM_TENANT_CONTEXT.brand'), 'Tenant brand must take precedence over a later class brand');
expect(shared.includes("document.title = document.title.replace(/VinhMath/gi, brandName)"), 'Tenant page title is not branded');
expect(shared.includes("document.querySelectorAll('a.logo').forEach") && shared.includes("context.slug === 'uyenmath' ? 'uyenmath'"), 'Tenant home/logo routing is missing');
expect(shared.includes("returnUrl += '?tenant='") && shared.includes("localStorage.removeItem('vm-tenant-context')"), 'Logout must remember the tenant login destination before clearing tenant state');

expect(login.includes("get('tenant')") && login.includes('vmLoadPublicTenantContext(vmRequestedTenantSlug)'), 'Login does not load an explicitly requested public tenant');
expect(login.includes('if (tenantContext && tenantContext.full_site)') && login.includes('location.replace(vmTenantHomePath(tenantContext))'), 'Full-site members are not routed to their branded home');
expect(login.includes("vmRequestedTenantSlug === 'uyenmath' ? 'uyenmath' : 'trang-chu'"), 'A delayed UYENMATH session must still stop at the branded landing page');
expect(login.includes("location.replace('thi?portal='") && login.includes('tenantContext.portal_only'), 'Legacy exam portal login routing regressed');
expect(!/if\s*\(vmRequestedTenantSlug\)[\s\S]{0,160}location\.replace\(['"]thi/.test(login), 'A public tenant hint must never force an unrelated account into the exam portal');

expect(uyenLanding.includes("new URL('khong-gian', location.href)") && uyenLanding.includes("target.searchParams.set('tenant', 'uyenmath')"), 'UYENMATH must redirect to the generic shared renderer');
expect(genericLanding.includes('vmTenantFirstShownPath(signedContext, role.key)') && genericLanding.includes("url.searchParams.set('space', role.space)"), 'The shared landing must expose a policy-aware role workspace action');
expect(genericLanding.includes("label: 'giáo viên'") && genericLanding.includes("label: 'học sinh'"), 'The shared landing must label teacher and student spaces explicitly');
expect(genericLanding.includes("setAllActions('Mở không gian'") && genericLanding.includes('disableWorkspaceActions'), 'Shared signed-in calls to action must enter a visible workspace or disable safely');
expect(!genericLanding.includes("location.replace('trang-chu?tenant=uyenmath')"), 'The shared landing must not auto-skip itself after sign-in');

console.log('PASS full-site tenant runtime: one context load, brand precedence, role menu policy, route guard and login/logout routing');
