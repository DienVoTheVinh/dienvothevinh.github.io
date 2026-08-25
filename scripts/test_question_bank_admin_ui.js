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
assert.ok(html.indexOf('js/question-bank.js?v=1.1') < html.indexOf('js/exam-admin.js?v=3.0'));
for (const zone of ['Overview','Create','Import','Manage']) {
  assert.ok(html.includes(`id="bankZone${zone}"`), `bank workspace is missing ${zone.toLowerCase()} zone`);
}
assert.ok(html.includes('id="bankImportNav"') && html.includes('data-bank-zone-nav="import"'), 'admin import needs its own workspace navigation entry');
assert.ok(html.includes('Nạp &amp; chuẩn hóa') && html.includes('Kho câu &amp; ma trận'), 'four-zone navigation must use clear workflow labels');
assert.ok(html.includes('id="bankOverviewComplete"') && html.includes('id="bankOverviewTopic"') && html.includes('id="bankOverviewReviewCard"'), 'overview must separate inventory and review status');
assert.ok(html.includes('id="bankSearchChapter"') && html.includes('id="bankSearchTopic"'), 'search needs grade to chapter to topic hierarchy');
assert.ok(html.includes('id="bankGenChapter"') && html.includes('id="bankGenTopic"'), 'generation needs semantic chapter and topic filters');
assert.ok(html.includes('id="bankMatrixBody"') && html.includes('id="bankMatrixTotalRow"'), 'admin and teacher need an exam matrix');
assert.ok(html.includes('id="bankZoneImport" data-bank-zone="import" hidden') && html.includes('id="bankAdminWorkbench"'), 'the whole import zone must be admin-only by default');
assert.ok(html.includes('id="bankTexFiles"') && html.includes('multiple'));
assert.ok(html.includes('id="bankPackageFile"') && html.includes('id="bankPackageButton"'));
assert.ok(html.includes('id="bankImportSourceKind"') && html.includes('value="topic_pack"'), 'topic packs must be the safe default import mode');
assert.ok(html.includes('data-bank-import-mode="topic_pack"') && html.includes('data-bank-import-mode="complete_exam"'), 'admin upload station must separate topic packs from whole exams');
assert.ok(html.includes('id="bankImportTopicGrade"') && html.includes('id="bankImportTopicChapter"') && html.includes('id="bankImportTopicLesson"'), 'topic packs need grade to chapter to lesson classification');
assert.ok(html.includes('id="bankPasteTex"') && html.includes('bankParsePastedTex()'), 'admin must be able to paste a legacy TeX exam without IDs');
for (const kind of ['thpt_official','thpt_reference','thpt_mock','midterm','final','chapter','other']) assert.ok(html.includes(`value="${kind}"`), `missing source exam kind ${kind}`);
assert.ok(!html.includes('value="semester_1"') && !html.includes('value="semester_2"'), 'semester must be stored separately from the canonical exam kind');
assert.ok(html.includes('id="bankImportUnit"') && html.includes('id="bankImportYear"') && html.includes('id="bankImportExamType"') && html.includes('id="bankImportExamGrade"'));
assert.ok(html.includes('id="bankSourceGrade"'), 'whole-source catalog needs a grade filter');
assert.ok(html.includes('id="bankSourceCatalogCard"') && html.includes('id="bankSourceAssign"'));
assert.ok(html.includes('id="bankImportCard"') && html.includes('Đang tải danh mục đề hoàn chỉnh'));
assert.ok(html.includes('id="bankImportPreviewButton"') && html.includes('bankOpenImportPreview()'), 'pending imports need a whole-document HTML/PDF preview');
assert.ok(html.includes('id="bankLocalMatrix"'), 'pending imports need a local matrix before publishing');
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
  'vm_bank_admin_taxonomy_catalog', 'vm_bank_admin_import_taxonomy',
  'vm_bank_taxonomy_facets', 'vm_bank_inventory', 'vm_bank_matrix',
  'vm_bank_admin_finalize_document', 'vm_bank_admin_document'
]) assert.ok(js.includes(`sb.rpc('${rpc}'`), `missing ${rpc}`);

assert.ok(js.includes("profile.role === 'admin'"));
assert.ok(js.includes("profile.role === 'teacher'"));
assert.ok(!/profile\.role\s*===\s*['\"]assistant['\"]/.test(js.slice(js.indexOf('function bankAccessFor'), js.indexOf('function bankFillClassOptions'))));
assert.ok(js.includes("if(!bankAccess.canUse){location.href="));
assert.ok(js.includes("if(!bankAccess.canAdmin){"), 'teacher path must return before raw exam/admin loading');
assert.ok(js.includes('data-source-exam-id'), 'source catalog should bind sanitized data instead of interpolating inline JavaScript');
assert.ok(js.includes('data-source-mode="clone"') && js.includes('Tạo đề cùng cấu trúc'), 'source catalog must offer a fresh exam with the same pedagogical structure');
assert.ok(js.includes('function bankSafeError'), 'teacher-facing RPC errors must be sanitized');
assert.ok(js.includes("if (state.bank.access.canAdmin) return bankLoadAdminDocumentPreview"), 'source preview must branch admin away from the teacher-safe RPC');
const adminDocumentPreviewSource = js.slice(js.indexOf('async function bankLoadAdminDocumentPreview'), js.indexOf('function bankOpenLocalPreview'));
assert.ok(adminDocumentPreviewSource.includes("sb.rpc('vm_bank_admin_document'"), 'admin source preview must fetch the private full document RPC');
assert.ok(adminDocumentPreviewSource.includes('showAnswers:true') && adminDocumentPreviewSource.includes('showSolutions:true') && adminDocumentPreviewSource.includes('editableSource:fullPreview.editableSource'), 'admin handoff must preserve answers, solutions and full TeX');
const sourcePreviewSource = js.slice(js.indexOf('function bankOpenSourcePreview'), js.indexOf('function bankOpenExamPreview'));
assert.ok(sourcePreviewSource.includes("bankLoadRemotePreview('vm_bank_source_exam_preview'"), 'teacher source preview must remain on the safe RPC');
assert.ok(js.includes('function bankGenerationFailureHtml') && js.includes('Không đủ câu phù hợp để tạo đề'), 'empty or insufficient bank generation must explain the cause');
assert.ok(js.includes('function bankSourceEmptyHtml') && js.includes('Chưa có đề hoàn chỉnh trong kho'), 'empty source catalog must distinguish whole exams from topic packs');
assert.ok(js.includes('bankFocusImport:bankFocusImport'), 'admins need a direct recovery action from empty-bank messages');
assert.ok(js.includes("if (document._serverId) return {id:document._serverId,raw_tex:'',metadata:{import_state:importState,expected_count:expectedCount}}"), 'later chunks must reuse the private source document without resending raw TeX');
assert.ok(js.includes("record.schema_version!=='vinhmath.question-bank.admin-package.v1'"));
assert.ok(js.includes("required=['document_total_items','document_chunk','document_chunks']") && js.includes('Không có dữ liệu nào được nhập; hãy xuất lại gói bằng phiên bản mới.'), 'legacy JSONL chunks without finalization metadata must be rejected clearly');
const packageImportSource = js.slice(js.indexOf('async function bankImportAdminPackage'), js.indexOf('function bankRefreshQuestion'));
assert.ok((packageImportSource.match(/await bankReadJsonl\(file/g)||[]).length>=2, 'admin packages need a full preflight pass before any RPC import');
assert.ok(packageImportSource.indexOf('var preflightRecords=0') < packageImportSource.indexOf("sb.rpc('vm_bank_admin_import_taxonomy'"), 'package preflight must finish before taxonomy or question import begins');
assert.ok(js.includes("documentPayload={id:documentIds[key],raw_tex:'',metadata:importMetadata}"), 'large-package continuation chunks must reuse server document IDs and staged metadata');
assert.ok(js.includes("file.size>600*1024*1024"), 'large local packages need a browser memory safety limit');
assert.ok(js.includes('source_kind:sourceKind'), 'admin must choose between a whole source exam and a topic pack');
assert.ok(js.includes("source_kind:'topic_pack'") && js.includes("source_kind:'mock_exam'"), 'source catalog contract must keep canonical source kinds');
assert.ok(js.includes('function bankParsePastedTex') && js.includes("inputMethod:'paste'"), 'pasted TeX must use the same review/import pipeline with provenance');
assert.ok(js.includes('function bankValidateImportMetadata') && js.includes('function bankImportValidationIssues') && js.includes("question._bankStatus!=='active'"), 'raw pasted exams must be valid and classified before import');
assert.ok(js.includes('content_mode:importMeta.mode') && js.includes('grade:importMeta.grade') && js.includes('chapter:importMeta.chapter') && js.includes('topic:importMeta.skill'), 'document metadata must preserve pedagogical scope');
assert.ok(js.includes('import_state:importState') && js.includes('expected_count:expectedCount'), 'multi-chunk imports must remain staged until the final chunk');
assert.ok(js.includes("sb.rpc('vm_bank_admin_finalize_document'") && js.includes('p_expected_count:items.length'), 'every imported document must be explicitly finalized after all chunks');
const importSource = js.slice(js.indexOf('async function bankImport()'), js.indexOf('async function bankLoadStats'));
assert.ok(importSource.indexOf("sb.rpc('vm_bank_admin_import'") < importSource.indexOf("sb.rpc('vm_bank_admin_finalize_document'"), 'finalization must happen only after item chunks are imported');
assert.ok(importSource.includes('finalize.data.ready!==true'), 'frontend must reject a document that fails server finalization');
assert.ok(importSource.includes('bankLoadInventory(true)') && importSource.includes('bankLoadSourceCatalog()') && importSource.includes("bankLoadMatrix({status:'active'},true)"), 'successful import must refresh inventory, source catalog and matrix');
assert.ok(js.includes('function bankApplyClassification'));
assert.ok(js.includes('function bankSelectMissingIds'));
assert.ok(js.includes("question.question_id = code"), 'one shared taxonomy classification should be applied to selected rows');
const classificationSource = js.slice(js.indexOf('function bankApplyClassification'), js.indexOf('function bankRenderLocal'));
assert.ok(!/next\+\+|question_id\s*=\s*prefix\s*\+/.test(classificationSource), 'variant must be a problem subtype, never a sequence');
assert.ok(js.includes("state.bank.access.canAdmin && el('bankSearchPrefix')"), 'teacher search must not submit internal taxonomy prefixes');
assert.ok(js.includes('area:chapter.area') && js.includes('chapter:chapter.chapter') && js.includes('skill:skill'), 'search must submit safe semantic hierarchy filters');
assert.ok(js.includes("row.querySelector('.bank-blueprint-chapter')") && js.includes("row.querySelector('.bank-blueprint-topic')"), 'every blueprint group needs semantic chapter and topic filters');
assert.ok(!js.includes('bankFallbackChapters'), 'chapter selectors must never invent curriculum routes while facets are loading');
assert.ok(js.includes('Đang tải danh mục chương…') && js.includes('Chưa có chương trong khối này'), 'missing facets must keep chapter selection safely disabled');
assert.ok(js.includes('ID · ') && js.includes('state.bank.access.canAdmin?'), 'internal question IDs must be explicitly admin-only');
assert.ok(js.includes("grade:parseInt(el('bankSourceGrade')") && js.includes('function bankOpenImportPreview'), 'source grade filtering and whole-import preview must be wired');
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
assert.ok(css.includes('.bank-import-mode-switch') && css.includes('.bank-paste-textarea') && css.includes('.bank-import-input-grid'), 'upload station needs its professional responsive layout');
assert.ok(css.includes('.bank-admin-import-zone') && css.includes('.bank-local-toolbar') && css.includes('.bank-local-matrix'), 'dedicated import zone needs preview and matrix layout');
assert.ok(css.includes('.bank-source-results'));
assert.ok(css.includes('.bank-question-list'));
assert.ok(css.includes('.bank-taxonomy-manual-grid'));
assert.ok(css.includes('body.bank-teacher-mode .bank-admin-taxonomy-filter'));
assert.ok(css.includes('.bank-usage-guide') && css.includes('.bank-usage-grid'));
assert.ok(css.includes('.bank-server-notice[hidden]{display:none}'), 'hidden server notice must not be forced visible by its flex layout');

console.log('question-bank admin UI: static contract passed');
