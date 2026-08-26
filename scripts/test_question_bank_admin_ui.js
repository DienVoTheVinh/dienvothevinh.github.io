'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('quan-tri-de.html', 'utf8');
const js = fs.readFileSync('js/exam-admin.js', 'utf8');
const css = fs.readFileSync('css/exam-admin.css', 'utf8');

assert.ok(html.includes('id="bankTab"') && html.includes('id="panel-bank"'));
assert.ok(!html.includes('Về không gian Thầy Trường') && !html.includes('class="exam-admin-hero"') && !html.includes('class="exam-kpis"'), 'the authoring workspace must start at the primary tabs without the old back link, hero or KPI strip');
assert.ok(!/<h1[^>]*id="examWorkspaceTitle"/.test(html) && !/<div[^>]*class="sec-label"[^>]*id="examWorkspaceLabel"/.test(html), 'the hidden runtime compatibility state must not recreate the old visible SOẠN THẢO hero');
assert.ok(html.includes('class="exam-runtime-state" hidden aria-hidden="true"'), 'removed decorative counters must retain a non-visual compatibility target for existing data loaders');
for (const tab of ['compose','bank','library','analytics']) {
  assert.ok(html.includes(`data-tab="${tab}"`), `primary workspace tab ${tab} must remain available`);
}
assert.ok(html.includes('class="bank-usage-roles bank-admin-only-ui"') && html.includes('class="bank-usage-identifiers bank-admin-only-ui"') && html.includes('class="bank-usage-legacy bank-admin-only-ui"'), 'teacher workspace must mark admin guidance, IDs and TeX compatibility as admin-only');
assert.ok(html.includes('class="bank-usage-link bank-teacher-only-ui"') && html.includes('id="bankPreviewToEditor"') && html.includes('bank-admin-only-ui'), 'teacher workspace needs its own concise guide while editor handoff remains admin-only');
assert.ok(html.includes('id="bankPreviewReportButton"') && html.includes('Báo lỗi') && html.includes('id="bankIssueDialog"') && html.includes('id="bankIssueForm"'), 'teacher preview must offer an issue-report dialog');
for (const id of ['bankPreviewFullscreenButton','bankPreviewSidebar','bankPreviewSourcesToggle','bankPreviewSourceSearch','bankPreviewSourceList']) {
  assert.ok(html.includes(`id="${id}"`), `fullscreen preview is missing ${id}`);
}
assert.ok(html.includes('<details class="bank-usage-guide" id="bankUsageGuide">'), 'bank usage guide should stay compact by default');
assert.ok(html.includes('Tạo một đề mới') && html.includes('Dùng một đề cũ'), 'guide must explain both teacher workflows');
assert.ok(html.includes('Giáo viên</b> dùng kho') && html.includes('Admin</b> có thêm quyền'), 'guide must distinguish teacher and admin access');
assert.ok(html.includes('Nạp đề TeX và gắn ID') && html.includes('Xem HTML/PDF'), 'guide must cover TeX classification and preview');
assert.ok(html.includes('Liên kết với Soạn thảo') && html.includes('Tra ngân hàng đề'), 'guide must explain the two-way authoring link');
assert.ok(html.includes('Mã phân loại ngắn') && html.includes('2D1H3-HAM-SO') && html.includes('UID kỹ thuật QB'), 'guide must distinguish readable classification codes from immutable QB identifiers');
for (const macro of ['vv','vect','heva','hoac'].map((name) => '\\' + name)) assert.ok(html.includes(`<code>${macro}`), `guide is missing legacy TeX macro ${macro}`);
assert.ok(html.includes('lớp tương thích chỉ bổ sung lệnh còn thiếu') && html.includes('\\renewcommand'), 'guide must state the non-overriding legacy compatibility rule');
const questionBankScript = html.search(/js\/question-bank\.js\?v=[^"']+/);
const examAdminScript = html.search(/js\/exam-admin\.js\?v=[^"']+/);
assert.ok(questionBankScript >= 0 && examAdminScript > questionBankScript,
  'question-bank parser must load before the exam-admin UI regardless of cache-buster version');
for (const zone of ['Overview','Create','Import','Repository','Manage']) {
  assert.ok(html.includes(`id="bankZone${zone}"`), `bank workspace is missing ${zone.toLowerCase()} zone`);
}
assert.ok(html.includes('id="bankImportNav"') && html.includes('data-bank-zone-nav="import"'), 'admin import needs its own workspace navigation entry');
assert.ok(html.includes('id="bankRepositoryNav"') && html.includes('data-bank-zone-nav="repository"'), 'admin source repository needs its own workspace navigation entry');
assert.ok(html.includes('Nạp &amp; chuẩn hóa') && html.includes('Kho nguồn') && html.includes('Kho câu &amp; ma trận'), 'five-zone navigation must use clear workflow labels');
assert.ok(html.includes('id="bankWorkspaceNav" role="tablist"') && html.includes('id="bankWorkspaceViews"'), 'bank navigation and independent view container must be explicit');
for (const zone of ['Overview','Create','Import','Repository','Manage']) {
  assert.ok(new RegExp(`id="bankZone${zone}"[^>]*role="tabpanel"`).test(html), `bank ${zone.toLowerCase()} view must be an accessible tab panel`);
}
for (const zone of ['Create','Import','Repository','Manage']) assert.ok(new RegExp(`id="bankZone${zone}"[^>]*hidden`).test(html), `inactive ${zone.toLowerCase()} view must start hidden`);
assert.ok(html.includes('id="bankOverviewComplete"') && html.includes('id="bankOverviewTopic"') && html.includes('id="bankOverviewReviewCard"'), 'overview must separate inventory and review status');
assert.ok(html.includes('id="bankSearchChapter"') && html.includes('id="bankSearchTopic"'), 'search needs grade to chapter to topic hierarchy');
assert.ok(html.includes('id="bankGenChapter"') && html.includes('id="bankGenTopic"'), 'generation needs semantic chapter and topic filters');
for (const kind of ['practice_topic','semester_exam','thptqg_exam']) {
  assert.ok(html.includes(`name="bankGenerationKind" value="${kind}"`), `generation is missing output kind ${kind}`);
}
assert.ok(/id="bankSemesterPeriodFieldset"[^>]*hidden/.test(html), 'semester-period choices must stay hidden for non-semester output kinds');
for (const [value,label] of [['midterm_1','Giữa kỳ I'],['final_1','Cuối kỳ I'],['midterm_2','Giữa kỳ II'],['final_2','Cuối kỳ II']]) {
  assert.ok(html.includes(`name="bankSemesterPeriod" value="${value}"`) && html.includes(`data-semester-label="${label}"`), `semester generation is missing canonical period ${value}`);
}
for (const origin of ['province_exam','authored','topic_pack']) {
  assert.ok(html.includes(`name="bankGenerationSource" value="${origin}"`), `generation is missing selectable source ${origin}`);
}
for (const id of ['bankGenerationSourceProvinceCount','bankGenerationSourceAuthoredCount','bankGenerationSourceTopicCount']) {
  assert.ok(html.includes(`id="${id}"`), `generation source card is missing live availability ${id}`);
}
assert.ok(html.includes('id="bankMatrixBody"') && html.includes('id="bankMatrixTotalRow"'), 'admin and teacher need an exam matrix');
assert.ok(/id="bankZoneImport"[^>]*data-bank-zone="import"[^>]*hidden/.test(html) && html.includes('id="bankAdminWorkbench"'), 'the whole import zone must be admin-only by default');
assert.ok(/id="bankZoneRepository"[^>]*data-bank-zone="repository"[^>]*hidden/.test(html), 'the whole source repository must be admin-only by default');
for (const id of ['bankRepositoryQuery','bankRepositoryGroup','bankRepositoryStatus','bankRepositoryGrade','bankRepositoryResults','bankRepositoryPrev','bankRepositoryNext']) {
  assert.ok(html.includes(`id="${id}"`), `source repository is missing ${id}`);
}
assert.ok(html.includes('id="bankTexFiles"') && html.includes('multiple'));
assert.ok(html.includes('id="bankPackageFile"') && html.includes('id="bankPackageButton"'));
assert.ok(html.includes('id="bankImportSourceKind"') && html.includes('value="topic_pack"'), 'topic packs must be the safe default import mode');
assert.ok(html.includes('data-bank-import-mode="topic_pack"') && html.includes('data-bank-import-mode="complete_exam"'), 'admin upload station must separate topic packs from whole exams');
const importOriginMatch = html.match(/<select[^>]*id="bankImportOrigin"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(importOriginMatch && importOriginMatch[1].includes('value="province_exam"') && importOriginMatch[1].includes('value="authored"'), 'whole-exam import must distinguish province and author-created sources');
assert.ok(html.includes('id="bankImportTitle"') && html.includes('VMExamAdmin.bankUpdateImportOrigin(false)'), 'typing a legacy Dethamkhao title must be able to auto-detect the authored source group');
assert.ok(html.includes('id="bankImportTopicGrade"') && html.includes('id="bankImportTopicChapter"') && html.includes('id="bankImportTopicLesson"'), 'topic packs need grade to chapter to lesson classification');
assert.ok(html.includes('id="bankPasteTex"') && html.includes('bankParsePastedTex()'), 'admin must be able to paste a legacy TeX exam without IDs');
const importTypeMatch = html.match(/<select[^>]*id="bankImportExamType"[^>]*>([\s\S]*?)<\/select>/);
const sourceTypeMatch = html.match(/<select[^>]*id="bankSourceType"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(importTypeMatch && sourceTypeMatch, 'source and import exam-kind selectors must exist');
for (const kind of ['thpt_official','thpt_reference','thpt_mock','midterm','final','chapter','other']) {
  assert.ok(importTypeMatch[1].includes(`value="${kind}"`), `missing canonical import exam kind ${kind}`);
}
assert.ok(!importTypeMatch[1].includes('value="semester_1"') && !importTypeMatch[1].includes('value="semester_2"'),
  'semester must remain metadata, not a canonical import exam kind');
for (const kind of ['semester_1','semester_2']) {
  assert.ok(sourceTypeMatch[1].includes(`value="${kind}"`), `source catalogue lost semantic filter ${kind}`);
}
assert.ok(html.includes('id="bankImportUnit"') && html.includes('id="bankImportYear"') && html.includes('id="bankImportExamType"') && html.includes('id="bankImportExamGrade"'));
assert.ok(html.includes('id="bankSourceGrade"'), 'whole-source catalog needs a grade filter');
assert.ok(html.includes('id="bankSourceCatalogCard"') && html.includes('id="bankSourceAssign"'));
assert.ok(html.includes('data-bank-source-origin="province_exam"') && html.includes("bankSetSourceCategory('province_exam')"), 'source catalog needs a province-exam origin tab');
assert.ok(html.includes('data-bank-source-origin="authored"') && html.includes("bankSetSourceCategory('authored')"), 'source catalog needs an authored origin tab');
assert.ok(html.includes('id="bankSourceType" onchange="VMExamAdmin.bankSyncSourceCategory()"'), 'semantic exam type must synchronize the active source category');
assert.ok(html.includes('id="bankSourcePagination"') && html.includes('id="bankSourcePageStatus"') && html.includes('id="bankSourceLoadMoreButton"'), 'whole-source catalog needs a visible load-more status');
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
  'vm_bank_preview_exam_draft', 'vm_bank_save_exam_draft',
  'vm_bank_source_exam_catalog', 'vm_bank_assign_source_exam',
  'vm_bank_clone_source_structure',
  'vm_bank_admin_taxonomy_catalog', 'vm_bank_admin_import_taxonomy',
  'vm_bank_taxonomy_facets', 'vm_bank_inventory', 'vm_bank_matrix',
  'vm_bank_admin_finalize_document', 'vm_bank_admin_document',
  'vm_bank_admin_document_catalog', 'vm_bank_report_issue',
  'vm_bank_admin_issue_report', 'vm_bank_exam_catalog'
]) assert.ok(js.includes(`sb.rpc('${rpc}'`), `missing ${rpc}`);

assert.ok(js.includes("profile.role === 'admin'"));
assert.ok(js.includes("profile.role === 'teacher'"));
assert.ok(js.includes("/^#bank-(overview|create|import|repository|manage)$/") && js.includes("history.pushState(history.state,'',hash)"), 'bank views need shareable hash history');
assert.ok(js.includes("document.querySelectorAll('[data-bank-zone]')") && js.includes('zone.hidden=!visible'), 'switching bank views must hide every inactive panel without rebuilding forms');
assert.ok(js.includes("window.addEventListener('popstate',bankSyncWorkspaceFromLocation)") && js.includes("window.addEventListener('hashchange',bankSyncWorkspaceFromLocation)"), 'Back, Forward, preview closing and direct hash navigation must restore the selected workspace');
assert.ok(js.includes("url.searchParams.set('preview','bank')") && js.includes("history.pushState(Object.assign({},history.state||{},{vmBankPreview:true})"), 'opening the bank preview must create a Back-closeable history entry');
const previewCloseSource = js.slice(js.indexOf('function bankClosePreview'), js.indexOf('function bankSetupPreviewDialog'));
assert.ok(previewCloseSource.includes("url.searchParams.delete('preview')") && previewCloseSource.includes('history.replaceState'), 'explicit preview close must remove preview=bank without leaving a dead history entry');
const previewHandoffSource = js.slice(js.indexOf('function bankSendPreviewToEditor'), js.indexOf('function bankTypeLabel'));
assert.ok(previewHandoffSource.includes("bankWriteWorkspaceTab('compose','replace')") && previewHandoffSource.includes('bankClosePreview({fromHistory:true})'), 'preview handoff must replace the URL with the compose workspace and close the dialog');
for (const name of ['bankTogglePreviewFullscreen','bankTogglePreviewSidebar','bankFilterPreviewSources','bankSwitchPreviewSource']) {
  assert.ok(js.includes(`function ${name}`) && js.includes(`${name}:${name}`), `fullscreen preview handler ${name} must be implemented and exported`);
}
assert.ok(js.includes("if (kind === 'exam') bankOpenExamPreview(id)") && js.includes('else bankOpenSourcePreview(id)'), 'fullscreen sidebar must switch safely between generated and source exams');
assert.ok(js.includes('bank-preview-question-report') && js.includes('data-bank-preview-report-number'), 'each preview question needs a precise report target instead of only a document-level complaint');
for (const name of ['bankOpenIssueReport','bankSubmitIssueReport','bankOpenIssueFromLocation']) {
  assert.ok(js.includes(`function ${name}`) && js.includes(`${name}:${name}`), `issue-report handler ${name} must be implemented and exported`);
}
const issueDeepLinkSource = js.slice(js.indexOf('function bankOpenIssueFromLocation'), js.indexOf('function ',js.indexOf('function bankOpenIssueFromLocation')+10));
assert.ok(issueDeepLinkSource.includes('bank_report') && issueDeepLinkSource.includes('canAdmin') && issueDeepLinkSource.includes('repository'), 'admin issue deep link must validate role and open the repository context from bank_report');
assert.ok(!/profile\.role\s*===\s*['\"]assistant['\"]/.test(js.slice(js.indexOf('function bankAccessFor'), js.indexOf('function bankFillClassOptions'))));
assert.ok(js.includes("if(!bankAccess.canUse){location.href="));
assert.ok(js.includes("if(!bankAccess.canAdmin){"), 'teacher path must return before raw exam/admin loading');
assert.ok(js.includes('data-source-exam-id'), 'source catalog should bind sanitized data instead of interpolating inline JavaScript');
assert.ok(js.includes('data-source-mode="clone"') && js.includes('Tạo đề cùng cấu trúc'), 'source catalog must offer a fresh exam with the same pedagogical structure');
assert.ok(js.includes('function bankSyncSourceCategory') && js.includes('bankRenderSourceCategoryTabs()'), 'semantic filters and category tabs must stay synchronized');
assert.ok(js.includes("source_origin:state.bank.sourceOrigin||null"), 'source-origin tabs must reach the source catalog RPC filters');
assert.ok(js.includes('function bankLoadMoreSources') && js.includes('sourceCatalogOffset=offset+items.length') && js.includes('bankMergeSourceItems'), 'source catalog must paginate with server offsets and deduplicate rows');
assert.ok(js.includes("p_limit:pageSize,p_offset:offset") && js.includes("status.textContent='Đã hiển thị '+displayed+' / '+total+' đề'"), 'source pagination must report displayed and total rows');
assert.ok(js.includes('function bankSafeError'), 'teacher-facing RPC errors must be sanitized');
assert.ok(js.includes("if (state.bank.access.canAdmin) return bankLoadAdminDocumentPreview"), 'source preview must branch admin away from the teacher-safe RPC');
const adminDocumentPreviewSource = js.slice(js.indexOf('async function bankLoadAdminDocumentPreview'), js.indexOf('function bankOpenLocalPreview'));
assert.ok(adminDocumentPreviewSource.includes("sb.rpc('vm_bank_admin_document'"), 'admin source preview must fetch the private full document RPC');
assert.ok(adminDocumentPreviewSource.includes('showAnswers:true') && adminDocumentPreviewSource.includes('showSolutions:true') && adminDocumentPreviewSource.includes('editableSource:fullPreview.editableSource'), 'admin handoff must preserve answers, solutions and full TeX');
const sourcePreviewSource = js.slice(js.indexOf('function bankOpenSourcePreview'), js.indexOf('function bankOpenExamPreview'));
assert.ok(sourcePreviewSource.includes("bankLoadRemotePreview('vm_bank_source_exam_preview'"), 'teacher source preview must remain on the safe RPC');
const safeExamCatalogSource = js.slice(js.indexOf('async function bankLoadExamCatalog'), js.indexOf('function classOptions'));
assert.ok(safeExamCatalogSource.includes("sb.rpc('vm_bank_exam_catalog'") && !safeExamCatalogSource.includes("sb.from('exam_questions')"), 'teacher generated-exam switcher must use the metadata-only RPC, never direct composition rows');
for (const secret of ['question_id','item_id','raw_tex','canonical_tex','answer_key','solution_latex']) {
  assert.ok(!safeExamCatalogSource.includes(`item.${secret}`), `teacher exam catalogue maps private field ${secret}`);
}
assert.ok(js.includes('function bankGenerationFailureHtml') && js.includes('Không đủ câu phù hợp để tạo đề'), 'empty or insufficient bank generation must explain the cause');
assert.ok(js.includes('function bankSourceEmptyHtml') && js.includes('Chưa có đề hoàn chỉnh trong kho'), 'empty source catalog must distinguish whole exams from topic packs');
assert.ok(js.includes('bankFocusImport:bankFocusImport'), 'admins need a direct recovery action from empty-bank messages');
const repositoryLoadSource = js.slice(js.indexOf('async function bankLoadRepository'), js.indexOf('function bankRepositoryPage'));
assert.ok(repositoryLoadSource.includes("sb.rpc('vm_bank_admin_document_catalog'") && repositoryLoadSource.includes('if(!state.bank.access.canAdmin)return'), 'repository metadata must load only through its admin-only catalog RPC');
const repositoryOpenSource = js.slice(js.indexOf('function bankOpenRepositoryDocument'), js.indexOf('function bankChooseSourceExam'));
assert.ok(repositoryOpenSource.includes('bankLoadAdminDocumentPreview'), 'opening a repository file must reuse the full admin HTML/PDF preview pipeline');
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
assert.ok(js.includes('Mã phân loại · ') && js.includes('question.display_id') && js.includes('question.technical_id'), 'admin preview must show compact classification IDs and keep technical IDs separate');
assert.ok(js.includes('title="Mã hệ thống: ') && !js.includes("'>QB-"), 'QB technical IDs must remain tooltip-only instead of visible question labels');
assert.ok(js.includes("grade:parseInt(el('bankSourceGrade')") && js.includes('function bankOpenImportPreview'), 'source grade filtering and whole-import preview must be wired');
assert.ok(js.includes("state.bank.access.canAdmin&&el('bankGenPrefix')"), 'teacher generation must not submit internal taxonomy prefixes');
assert.ok(js.includes("output_kind:outputKind") && js.includes("source_origins:sourceOrigins"), 'generation must submit the chosen output type and one-to-three source shelves');
assert.ok(js.includes("midterm_1:'Giữa kỳ I'") && js.includes("final_1:'Cuối kỳ I'") && js.includes("midterm_2:'Giữa kỳ II'") && js.includes("final_2:'Cuối kỳ II'"), 'semester-period codes need a single canonical Vietnamese label map');
assert.ok(js.includes("outputKind==='semester_exam'&&!semesterPeriod") && js.includes("fieldset.setAttribute('aria-invalid','true')") || js.includes("semesterFieldset.setAttribute('aria-invalid','true')"), 'semester generation must fail before RPC when no period is selected');
assert.ok(js.includes('spec.semester_period=semesterPeriod.value') && js.includes('spec.semester_period_label=semesterPeriod.label') && js.includes('generationFilters.semester_period=semesterPeriod.value'), 'semester generation must submit the canonical period, human label and filter scope');
assert.ok(js.includes("bankSetGenerationSourceCount('bankGenerationSourceProvinceCount'") && js.includes("bankSetGenerationSourceCount('bankGenerationSourceTopicCount'"), 'generation source availability must refresh from the canonical inventory');
const refreshQuestionSource = js.slice(js.indexOf('function bankRefreshQuestion'), js.indexOf('function bankAnswerSummary'));
assert.ok(refreshQuestionSource.includes('parser.normalizeQuestionForDedupe'), 'admin hash must use the parser ID-independent identity source');
assert.ok(refreshQuestionSource.includes("question.uid = 'qb-'+question.canonical_hash"), 'admin UID must be derived only from the canonical hash');
assert.ok(!refreshQuestionSource.includes('var prefix = question.question_id'), 'editable legacy IDs must not be embedded in immutable UIDs');
assert.ok(refreshQuestionSource.includes('question.taxonomy_key = idInfo ? idInfo.taxonomy_key : null'));
assert.ok(js.includes('similarity_key:question.similarity_key||null'), 'admin import must keep the taxonomy-family recommendation key');

const pdfSourceBuilder = js.slice(js.indexOf('async function buildPdfSource'), js.indexOf('async function compilePdf'));
assert.ok(pdfSourceBuilder.includes('vmChenLegacyTexCompatPreamble(complete)'), 'full TeX documents must pass through the guarded legacy macro compatibility layer');
assert.ok(pdfSourceBuilder.includes('vmLegacyTexCompatPreamble(raw)'), 'TeX fragments must receive only the legacy macro fallbacks they actually use');
assert.ok(pdfSourceBuilder.includes('normalizeLegacyPdfFragment(raw)'), 'legacy answer-sidecar commands must be removed only from wrapped TeX fragments');
assert.ok(pdfSourceBuilder.includes('fontawesome5') && pdfSourceBuilder.includes('pgfplots') && pdfSourceBuilder.includes('\\\\shorthandoff{\"}'), 'wrapped legacy exams need conditional icon/plot packages and safe TikZ quote handling');
const legacyPdfFragmentNormalizer = js.slice(js.indexOf('function normalizeLegacyPdfFragment'), js.indexOf('async function buildPdfSource'));
assert.ok(legacyPdfFragmentNormalizer.includes('Opensolutionfile') && legacyPdfFragmentNormalizer.includes('Closesolutionfile'), 'fragment PDF normalization must neutralize both answer-sidecar lifecycle commands');

assert.ok(css.includes('.bank-teacher-mode'));
assert.ok(css.includes('body.bank-teacher-mode .bank-admin-only-ui') && css.includes('body.bank-teacher-mode .bank-teacher-only-ui'), 'teacher mode must hide admin guidance/editor controls and reveal only the teacher guide');
assert.ok(css.includes('.bank-preview-dialog.is-fullscreen') && css.includes('.bank-preview-sidebar') && css.includes('.sidebar-open'), 'fullscreen preview needs a real sidebar layout rather than an enlarged popup only');
assert.ok(css.includes('.bank-dropzone'));
assert.ok(css.includes('.bank-package-import'));
assert.ok(css.includes('.bank-import-mode-switch') && css.includes('.bank-paste-textarea') && css.includes('.bank-import-input-grid'), 'upload station needs its professional responsive layout');
assert.ok(html.includes('class="bank-zone bank-admin-import-zone"') && css.includes('.bank-local-toolbar') && css.includes('.bank-local-matrix'), 'dedicated import zone needs preview and matrix layout');
assert.ok(css.includes('.bank-workspace-views') && css.includes('.bank-zone[hidden]{display:none!important}') && css.includes('@keyframes bank-view-enter'), 'independent bank views need stable responsive layout and restrained transitions');
assert.ok(css.includes('.bank-semester-period[hidden]{display:none!important}') && css.includes('.bank-semester-period[aria-invalid="true"]') && css.includes('.bank-semester-period label.active'), 'semester-period choices need explicit hidden, selected and validation states');
assert.ok(/#panel-bank\.active\{display:grid;grid-template-columns:minmax\(190px,220px\) minmax\(0,1fr\)/.test(css), 'desktop bank workspace must reserve a compact left rail and give the remaining width to content');
assert.ok(/\.bank-workspace-nav\{[^}]*flex-direction:column[^}]*overflow-y:auto/.test(css) && /\.bank-workspace-views\{grid-column:2;min-width:0/.test(css), 'desktop bank navigation must be a sticky vertical rail beside a shrink-safe content pane');
assert.ok(/@media\(max-width:900px\)\{#panel-bank\.active\{display:block\}[\s\S]*?\.bank-workspace-nav\{[^}]*flex-direction:row[^}]*overflow-x:auto[^}]*overflow-y:hidden/.test(css), 'mobile and narrow tablet bank navigation must return to a compact horizontally scrollable bar');
assert.ok(css.includes('.bank-source-results'));
assert.ok(css.includes('.bank-source-pagination') && css.includes('.bank-source-pagination[hidden]{display:none!important}'));
assert.ok(css.includes('.bank-question-list'));
assert.ok(css.includes('.bank-taxonomy-manual-grid'));
assert.ok(css.includes('body.bank-teacher-mode .bank-admin-taxonomy-filter'));
assert.ok(css.includes('.bank-usage-guide') && css.includes('.bank-usage-grid'));
assert.ok(css.includes('.bank-server-notice[hidden]{display:none}'), 'hidden server notice must not be forced visible by its flex layout');

console.log('question-bank admin UI: static contract passed');
