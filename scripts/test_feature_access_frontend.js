const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'quan-tri-quyen-tinh-nang.html'), 'utf8');
const bankHtml = fs.readFileSync(path.join(root, 'quan-tri-de.html'), 'utf8');
const bankJs = fs.readFileSync(path.join(root, 'js', 'exam-admin.js'), 'utf8');
const bankCss = fs.readFileSync(path.join(root, 'css', 'exam-admin.css'), 'utf8');
const idGuide = fs.readFileSync(path.join(root, 'js', 'question-bank-id-guide.js'), 'utf8');

for (const rpc of [
  'vm_admin_feature_matrix',
  'vm_admin_save_role_feature_rules',
  'vm_admin_save_user_feature_rules'
]) {
  assert.ok(page.includes(rpc), `feature access page must call ${rpc}`);
}
assert.ok(page.includes("get('embed')==='1'") && page.includes('embed-mode'), 'feature access page must support embedded admin mode');
assert.ok(page.includes('Theo vai trò') && page.includes('Ngoại lệ tài khoản'), 'role defaults and per-user overrides must be separate workflows');
assert.ok(page.includes('Kế thừa') && page.includes('Hiện') && page.includes('Khóa') && page.includes('Ẩn'), 'override state selector must expose every supported state');
assert.ok(page.includes('question_bank.import_tex') && page.includes('question_bank.download_tex') && page.includes('question_bank.manage'), 'question-bank presets must use the canonical tiered capability keys');
assert.ok(page.includes('feature.is_delegable') && page.includes('filter(function(feature){return feature.is_delegable;})'), 'save payloads must exclude server-managed non-delegable features');
assert.ok(page.includes("profile.role!=='admin'"), 'feature access page must fail closed for non-admin profiles');

const inlineScripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);
assert.ok(inlineScripts.length, 'feature access page must contain its controller');
for (const source of inlineScripts) new Function(source);

assert.ok(bankJs.includes("sb.rpc('vm_my_bank_capabilities')"), 'question bank must load server-authoritative capabilities');
assert.ok(bankJs.includes('raw.can_manage_id_schema') && bankJs.includes("classList.toggle('bank-id-schema-manage-mode'"), 'ID schema controls must use the server capability instead of a client role check');
assert.ok(bankJs.includes("sb.rpc('vm_bank_delegate_upload_tex'"), 'delegated TeX upload must use the quarantined wrapper');
assert.ok(bankJs.includes("sb.rpc('vm_bank_download_tex'"), 'TeX download must use the audited wrapper');
assert.ok(bankJs.includes('if (!state.bank.access.canAdmin) return bankDelegateImport();'), 'delegated upload must branch before every admin import RPC');
const adminImport = bankJs.slice(bankJs.indexOf('async function bankImport()'), bankJs.indexOf('async function bankLoadStats'));
assert.ok(adminImport.indexOf('return bankDelegateImport()') < adminImport.indexOf("vm_bank_admin_import"), 'teacher path must not reach vm_bank_admin_import');
assert.ok(bankHtml.includes('id="bankDelegatedImportPanel"') && bankHtml.includes('id="bankDelegatedImportButton"'), 'delegated users need a dedicated pending-review action');
assert.ok(bankHtml.includes('id="bankPreviewDownloadTex"') && bankHtml.includes('bankDownloadPreviewTex()'), 'preview must expose Tex download only through runtime capability toggling');
assert.ok(bankHtml.includes('bank-admin-only-ui') && bankJs.includes("document.body.classList.toggle('bank-delegated-import-mode'"), 'admin controls must be physically hidden for delegated teachers');
assert.ok(bankHtml.includes('bank-id-schema-only-ui') && bankCss.includes('body:not(.bank-id-schema-manage-mode) .bank-id-schema-only-ui'), 'ID schema UI must remain hidden until the capability RPC grants it');
assert.ok(!/Chỉ\s+(?:admin|quản trị viên)/i.test(bankHtml), 'hidden admin-only controls must not leak unfriendly permission notes');

assert.ok(bankHtml.includes('<span>Danh mục ID</span>') && !bankHtml.includes('Danh mục ID của tác giả gốc'), 'ID explorer label must be neutral');
const taxonomyTabs = bankHtml.match(/<div class="bank-taxonomy-grade-tabs" id="bankTaxonomyGradeTabs"[^>]*>([\s\S]*?)<\/div>/);
assert.ok(taxonomyTabs && taxonomyTabs[1].trim() === '', 'taxonomy grade cards must be generated from catalog data');
const referenceTabs = bankHtml.match(/<div class="bank-id-grade-tabs" id="bankIdReferenceGradeTabs"[^>]*>([\s\S]*?)<\/div>/);
assert.ok(referenceTabs && referenceTabs[1].trim() === '', 'legacy reference grade cards must be generated from loaded data');
assert.ok(bankJs.includes('grade < 1 || grade > 12'), 'catalog normalization must support grades 6-9 as well as 10-12');
assert.ok(bankCss.includes('repeat(auto-fit,minmax(170px,1fr))') && bankCss.includes('repeat(2,minmax(0,1fr))'), 'grade cards must use a uniform responsive grid');
assert.ok(idGuide.includes('function renderGradeTabs()') && idGuide.includes("new Set(state.rows.map"), 'ID guide must derive grade tabs from its catalog');
assert.ok(!idGuide.includes("grade:'10'"), 'ID guide must not pin the first grade to 10');
assert.ok(!/tác giả gốc/i.test(bankHtml + bankJs + idGuide), 'updated ID UI must not retain the old attribution label');

console.log('Feature access frontend contract: OK');
