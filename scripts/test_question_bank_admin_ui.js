'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('quan-tri-de.html', 'utf8');
const js = fs.readFileSync('js/exam-admin.js', 'utf8');
const css = fs.readFileSync('css/exam-admin.css', 'utf8');

assert.ok(html.includes('id="bankTab"') && html.includes('id="panel-bank"'));
assert.ok(html.includes('<details class="bank-usage-guide" id="bankUsageGuide">'), 'bank usage guide should stay compact by default');
assert.ok(html.includes('Tạo một đề mới') && html.includes('Dùng một đề cũ'), 'guide must explain both teacher workflows');
assert.ok(html.includes('Giáo viên</b> dùng kho') && html.includes('Admin</b> có thêm quyền'), 'guide must distinguish teacher and admin access');
assert.ok(html.includes('Nạp đề TeX và gắn ID') && html.includes('Xem HTML/PDF'), 'guide must cover TeX classification and preview');
assert.ok(html.includes('Liên kết với Soạn thảo') && html.includes('Tra ngân hàng đề'), 'guide must explain the two-way authoring link');
assert.ok(html.indexOf('js/question-bank.js?v=1.1') < html.indexOf('js/exam-admin.js?v=2.7'));
assert.ok(html.includes('id="bankAdminWorkbench" hidden'));
assert.ok(html.includes('id="bankTexFiles"') && html.includes('multiple'));
assert.ok(html.includes('id="bankPackageFile"') && html.includes('id="bankPackageButton"'));
assert.ok(html.includes('id="bankImportSourceKind"') && html.includes('value="mock_exam" selected'));
assert.ok(html.includes('id="bankImportUnit"') && html.includes('id="bankImportYear"') && html.includes('id="bankImportExamType"'));
assert.ok(html.includes('id="bankSourceCatalogCard"') && html.includes('id="bankSourceAssign"'));
assert.ok(html.includes('id="bankImportCard"') && html.includes('Đang tải danh mục đề hoàn chỉnh'));
assert.ok(html.includes('id="bankTaxonomyCatalogSelect"') && html.includes('id="bankTaxonomyPreview"'));
assert.ok(html.includes('id="bankTaxGrade"') && html.includes('id="bankTaxArea"') && html.includes('id="bankTaxChapter"'));
assert.ok(html.includes('id="bankTaxDifficulty"') && html.includes('id="bankTaxSkill"') && html.includes('id="bankTaxVariant"'));
assert.ok(html.includes('Chọn tất cả câu thiếu mã') && html.includes('Mã phân loại'));
assert.ok(html.includes('Biến thể là dạng bài, không phải số thứ tự'));
assert.ok(html.includes('Hệ thống đối chiếu UID/hash'), 'import resume/idempotency guidance must be visible');
assert.ok(!html.includes('id="bankBulkStart"'), 'taxonomy variants must not be generated as sequential numbers');

for (const rpc of [
  'vm_bank_admin_import', 'vm_bank_admin_stats', 'vm_bank_search',
  'vm_bank_generate_exam', 'vm_bank_source_exam_catalog', 'vm_bank_assign_source_exam',
  'vm_bank_clone_source_structure',
  'vm_bank_admin_taxonomy_catalog', 'vm_bank_admin_import_taxonomy'
]) assert.ok(js.includes(`sb.rpc('${rpc}'`), `missing ${rpc}`);

assert.ok(js.includes("profile.role === 'admin'"));
assert.ok(js.includes("profile.role === 'teacher'"));
assert.ok(!/profile\.role\s*===\s*['\"]assistant['\"]/.test(js.slice(js.indexOf('function bankAccessFor'), js.indexOf('function bankFillClassOptions'))));
assert.ok(js.includes("if(!bankAccess.canUse){location.href="));
assert.ok(js.includes("if(!bankAccess.canAdmin){"), 'teacher path must return before raw exam/admin loading');
assert.ok(js.includes('data-source-exam-id'), 'source catalog should bind sanitized data instead of interpolating inline JavaScript');
assert.ok(js.includes('data-source-mode="clone"') && js.includes('Tạo đề cùng cấu trúc'), 'source catalog must offer a fresh exam with the same pedagogical structure');
assert.ok(js.includes('function bankSafeError'), 'teacher-facing RPC errors must be sanitized');
assert.ok(js.includes('function bankGenerationFailureHtml') && js.includes('Không đủ câu phù hợp để tạo đề'), 'empty or insufficient bank generation must explain the cause');
assert.ok(js.includes('function bankSourceEmptyHtml') && js.includes('Chưa có đề hoàn chỉnh trong kho'), 'empty source catalog must distinguish whole exams from topic packs');
assert.ok(js.includes('bankFocusImport:bankFocusImport'), 'admins need a direct recovery action from empty-bank messages');
assert.ok(js.includes("if (document._serverId) return {id:document._serverId,raw_tex:''}"), 'later chunks must reuse the private source document without resending raw TeX');
assert.ok(js.includes("record.schema_version!=='vinhmath.question-bank.admin-package.v1'"));
assert.ok(js.includes("documentPayload={id:documentIds[key],raw_tex:''}"), 'large-package continuation chunks must reuse server document IDs');
assert.ok(js.includes("file.size>600*1024*1024"), 'large local packages need a browser memory safety limit');
assert.ok(js.includes('source_kind:sourceKind'), 'admin must choose between a whole source exam and a topic pack');
assert.ok(js.includes('function bankApplyClassification'));
assert.ok(js.includes('function bankSelectMissingIds'));
assert.ok(js.includes("question.question_id = code"), 'one shared taxonomy classification should be applied to selected rows');
const classificationSource = js.slice(js.indexOf('function bankApplyClassification'), js.indexOf('function bankRenderLocal'));
assert.ok(!/next\+\+|question_id\s*=\s*prefix\s*\+/.test(classificationSource), 'variant must be a problem subtype, never a sequence');
assert.ok(js.includes("state.bank.access.canAdmin && el('bankSearchPrefix')"), 'teacher search must not submit internal taxonomy prefixes');
assert.ok(js.includes("state.bank.access.canAdmin&&el('bankGenPrefix')"), 'teacher generation must not submit internal taxonomy prefixes');
const refreshQuestionSource = js.slice(js.indexOf('function bankRefreshQuestion'), js.indexOf('function bankAnswerSummary'));
assert.ok(refreshQuestionSource.includes('parser.normalizeQuestionForDedupe'), 'admin hash must use the parser ID-independent identity source');
assert.ok(refreshQuestionSource.includes("question.uid = 'qb-'+question.canonical_hash"), 'admin UID must be derived only from the canonical hash');
assert.ok(!refreshQuestionSource.includes('var prefix = question.question_id'), 'editable legacy IDs must not be embedded in immutable UIDs');
assert.ok(refreshQuestionSource.includes('question.taxonomy_key = idInfo ? idInfo.taxonomy_key : null'));
assert.ok(js.includes('similarity_key:question.similarity_key||null'), 'admin import must keep the taxonomy-family recommendation key');

assert.ok(css.includes('.bank-teacher-mode'));
assert.ok(css.includes('.bank-dropzone'));
assert.ok(css.includes('.bank-package-import'));
assert.ok(css.includes('.bank-source-results'));
assert.ok(css.includes('.bank-question-list'));
assert.ok(css.includes('.bank-taxonomy-manual-grid'));
assert.ok(css.includes('body.bank-teacher-mode .bank-admin-taxonomy-filter'));
assert.ok(css.includes('.bank-usage-guide') && css.includes('.bank-usage-grid'));
assert.ok(css.includes('.bank-server-notice[hidden]{display:none}'), 'hidden server notice must not be forced visible by its flex layout');

console.log('question-bank admin UI: static contract passed');
