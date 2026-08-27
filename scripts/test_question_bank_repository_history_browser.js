'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const html = fs.readFileSync('quan-tri-de.html','utf8');
  const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
  if (!bodyMatch) throw new Error('Could not isolate the exam-admin body');
  const css = ['css/tokens.css','css/vinhmath.css','css/exam-admin.css']
    .map((file) => fs.readFileSync(file,'utf8')).join('\n');
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyMatch[1]}</body></html>`;

  const browser = await chromium.launch({ executablePath, headless:true });
  try {
    const page = await browser.newPage({ viewport:{ width:1500, height:900 } });
    await page.route('http://vinhmath.test/**', (route) => route.fulfill({ status:200, contentType:'text/html', body:documentHtml }));
    await page.goto('http://vinhmath.test/quan-tri-de?tab=bank#bank-overview');
    await page.evaluate(() => { window.vmDisableGlobalTikzAuto = true; });
    await page.addScriptTag({ path:'js/latex-view.js' });
    await page.addScriptTag({ path:'js/question-bank.js' });
    await page.addScriptTag({ path:'js/exam-admin.js' });

    await page.evaluate(() => {
      window.confirm = () => true;
      window.fetch = async () => ({ ok:true, text:async () => '\\ProvidesPackage{ex_test}\\newenvironment{ex}{}{}\\newcommand{\\choice}[4]{}\\newcommand{\\loigiai}[1]{}' });
      window.__bankRpcCalls = [];
      const raw = String.raw`\begin{ex}%[2D1H3-1]
Cho hàm số $y=x^3$. Chọn đáp án đúng.
\choice{1}{\True 2}{3}{4}
\loigiai{Đáp án 2.}
\end{ex}`;
      window.sb = {
        rpc: async (name,args) => {
          window.__bankRpcCalls.push({name,args});
          if (name === 'vm_bank_admin_document_catalog') return { data:{ total:1, items:[{
            id:'doc-authored-9', title:'Dethamkhao9', original_filename:'Dethamkhao9.tex',
            relative_path:'NganHang/Dethamkhao9.tex', source_origin:'authored', source_kind:'mock_exam',
            repository_status:'ready', grade:12, total_count:1, active_count:1, raw_size:4096,
            updated_at:'2026-08-26T03:00:00.000Z'
          }] }, error:null };
          if (name === 'vm_bank_admin_document') return { data:{
            id:'doc-authored-9', title:'Dethamkhao9', original_filename:'Dethamkhao9.tex', raw_tex:raw,
            items:[{
              source_ordinal:1, stable_id:'QB-83BECE2FD068CA64A146EF73', legacy_code:'2D1H3-1',
              question_type:'multiple_choice', canonical_tex:raw,
              answer:{correct_indexes:[1]}, solution_latex:'Đáp án 2.'
            }]
          }, error:null };
          if (name === 'vm_bank_source_exam_catalog') return window.__bankTeacherUnassignable
            ? { data:{total:1,items:[{
              id:'doc-review-1',title:'Nguồn đang chuẩn hóa',source_origin:'authored',source_kind:'mock_exam',
              grade:12,question_count:18,total_question_count:20,assignable:false
            }]}, error:null }
            : { data:{total:0,items:[]}, error:null };
          if (name === 'vm_bank_source_exam_preview') return { data:{title:'Dethamkhao9',question_count:1,questions:[{
            sort:1,question_type:'multiple_choice',content_latex:'Cho hàm số $y=x^3$.',
            choices:[{key:'A',latex:'1'},{key:'B',latex:'2'},{key:'C',latex:'3'},{key:'D',latex:'4'}]
          }]}, error:null };
          if (name === 'vm_bank_exam_preview') return { data:{title:'Đề luyện tập đã tạo',question_count:1,questions:[{
            sort:0,question_type:'multiple_choice',content_latex:'Giá trị của $2+2$ là',
            choices:[{key:'A',latex:'3'},{key:'B',latex:'4'},{key:'C',latex:'5'},{key:'D',latex:'6'}]
          }]}, error:null };
          if (name === 'vm_bank_report_issue') return { data:{issue_id:'issue-teacher-1',status:'open'}, error:null };
          if (name === 'vm_bank_preview_exam_draft') return { data:{
            title:'Đề an toàn từ kho',question_count:1,requested_count:1,seed:'safe-seed',
            source_origins:['topic_pack'],selection_token:'abcdef0123456789abcdef0123456789',
            preview_draft_id:'11111111-2222-4333-8444-555555555555',warnings:[],questions:[{
              sort:0,question_type:'multiple_choice',content_latex:'Giá trị của $2+2$ là',
              choices:[{key:'A',latex:'3'},{key:'B',latex:'4'},{key:'C',latex:'5'},{key:'D',latex:'6'}]
            }]
          }, error:null };
          if (name === 'vm_bank_save_exam_draft') return { data:{
            exam_id:'exam-generated-safe-1',title:'Đề an toàn từ kho',question_count:1,seed:'safe-seed',source_origins:['topic_pack']
          }, error:null };
          if (name === 'vm_bank_exam_catalog') return { data:{items:[{
            id:'exam-generated-safe-1',title:'Đề an toàn từ kho',duration_minutes:45,published:false,
            class_id:'class-teacher-1',class_name:'Toán 12A1',de_type:'mc',bank_generated:true,
            source_bank_document_id:null,question_count:1
          }]}, error:null };
          if (name === 'vm_bank_inventory') return { data:{summary:{},items:[]}, error:null };
          if (name === 'vm_bank_category_summary') return { data:{items:[],origins:[]}, error:null };
          if (name === 'vm_bank_matrix') return { data:{question_count:0,items:[]}, error:null };
          if (name === 'vm_bank_taxonomy_facets') return { data:{items:[]}, error:null };
          return { data:null, error:{code:'PGRST202',message:'unexpected test RPC '+name} };
        }
      };
      const bank = window.VMExamAdmin._bankState;
      bank.statsLoaded = true;
      bank.sourceCatalogLoaded = true;
      window.VMExamAdmin._bankConfigureAccess({role:'admin'});
      window.VMExamAdmin.switchTab('bank');
      window.VMExamAdmin.bankSetView('repository',{history:'replace',scroll:false});
    });
    await page.waitForFunction(() => window.VMExamAdmin._bankState.repositoryLoaded === true);

    const repository = await page.evaluate(() => ({
      zones:document.querySelectorAll('[data-bank-zone-nav]').length,
      importVisible:!document.getElementById('bankImportNav').hidden,
      active:window.VMExamAdmin._bankState.activeView,
      manageMode:window.VMExamAdmin._bankState.manageMode,
      sourcesVisible:!document.getElementById('bankManageSourcesPane').hidden,
      visibleZones:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((node) => !node.hidden).map((node) => node.dataset.bankZone),
      url:location.pathname+location.search+location.hash,
      item:document.getElementById('bankRepositoryResults').textContent,
      catalogCall:window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_admin_document_catalog')
    }));
    if (repository.zones !== 4 || !repository.importVisible || repository.active !== 'manage' || repository.manageMode !== 'sources' || !repository.sourcesVisible || JSON.stringify(repository.visibleZones) !== JSON.stringify(['manage']) || !repository.url.includes('tab=bank') || !repository.url.endsWith('#bank-manage') || !repository.item.includes('Dethamkhao9') || !repository.item.includes('Tác giả / tự biên') || !repository.catalogCall || repository.catalogCall.args.p_limit !== 25 || repository.catalogCall.args.p_offset !== 0) {
      throw new Error(`Admin repository contract failed: ${JSON.stringify(repository)}`);
    }

    await page.click('[data-bank-repository-document="doc-authored-9"]');
    await page.waitForFunction(() => document.getElementById('bankPreviewDialog').open && new URLSearchParams(location.search).get('preview') === 'bank');
    const preview = await page.evaluate(() => {
      const label = document.querySelector('#bankPreviewHtml .bank-preview-question-id');
      return {
        url:location.pathname+location.search+location.hash,
        text:document.getElementById('bankPreviewHtml').textContent,
        label:label && label.textContent,
        tooltip:label && label.getAttribute('title'),
        adminDocumentCalls:window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_admin_document').length
      };
    });
    if (!preview.url.includes('preview=bank') || preview.label !== 'Mã phân loại · 2D1H3-1' || preview.text.includes('QB-83BECE2FD068CA64A146EF73') || preview.tooltip !== 'Mã hệ thống: QB-83BECE2FD068CA64A146EF73' || preview.adminDocumentCalls !== 1) {
      throw new Error(`Compact classification ID / technical tooltip failed: ${JSON.stringify(preview)}`);
    }

    await page.goBack();
    await page.waitForFunction(() => !document.getElementById('bankPreviewDialog').open && new URLSearchParams(location.search).get('preview') !== 'bank');
    const afterBack = await page.evaluate(() => ({
      url:location.pathname+location.search+location.hash,
      active:window.VMExamAdmin._bankState.activeView,
      historyActive:window.VMExamAdmin._bankState.preview.historyActive
    }));
    if (!afterBack.url.includes('tab=bank') || !afterBack.url.endsWith('#bank-manage') || afterBack.active !== 'manage' || afterBack.historyActive) {
      throw new Error(`Browser Back did not close only the preview: ${JSON.stringify(afterBack)}`);
    }

    await page.click('[data-bank-repository-document="doc-authored-9"]');
    await page.waitForFunction(() => document.getElementById('bankPreviewDialog').open);
    await page.click('#bankPreviewToEditor');
    await page.waitForFunction(() => document.getElementById('panel-compose').classList.contains('active'));
    const handoff = await page.evaluate(() => ({
      url:location.pathname+location.search+location.hash,
      dialog:document.getElementById('bankPreviewDialog').open,
      source:document.getElementById('exLatex').value,
      title:document.getElementById('exTitle').value
    }));
    if (!handoff.url.includes('tab=compose') || handoff.url.includes('preview=bank') || handoff.url.includes('#bank-') || handoff.dialog || !handoff.source.includes('2D1H3-1') || handoff.title !== 'Dethamkhao9') {
      throw new Error(`Repository-to-editor history handoff failed: ${JSON.stringify(handoff)}`);
    }

    const originBehavior = await page.evaluate(async () => {
      const bank = window.VMExamAdmin._bankState;
      window.VMExamAdmin._bankConfigureAccess({role:'admin'});
      bank.sourceCatalogLoading = false;
      window.VMExamAdmin.bankSetSourceCategory('authored');
      await new Promise((resolve) => setTimeout(resolve,0));
      const authored = {
        state:bank.sourceOrigin,
        active:document.querySelector('[data-bank-source-origin="authored"]').getAttribute('aria-pressed'),
        filter:(window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_source_exam_catalog').at(-1) || {}).args
      };
      bank.sourceCatalogLoading = false;
      window.VMExamAdmin.bankSetSourceCategory('province_exam');
      await new Promise((resolve) => setTimeout(resolve,0));
      const province = {
        state:bank.sourceOrigin,
        active:document.querySelector('[data-bank-source-origin="province_exam"]').getAttribute('aria-pressed'),
        filter:(window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_source_exam_catalog').at(-1) || {}).args
      };

      window.VMExamAdmin.bankSetImportMode('complete_exam');
      const select = document.getElementById('bankImportOrigin');
      delete select.dataset.userSelected;
      document.getElementById('bankImportTitle').value = 'Dethamkhao27';
      window.VMExamAdmin.bankUpdateImportOrigin(false);
      const auto = { value:select.value, label:document.getElementById('bankImportUnitLabel').textContent };
      select.value = 'province_exam';
      window.VMExamAdmin.bankUpdateImportOrigin(true);
      document.getElementById('bankImportTitle').value = 'Dethamkhao28';
      window.VMExamAdmin.bankUpdateImportOrigin(false);
      const manual = { value:select.value, selected:select.dataset.userSelected };
      return {authored,province,auto,manual};
    });
    if (originBehavior.authored.state !== 'authored' || originBehavior.authored.active !== 'true' || originBehavior.authored.filter.p_filters.source_origin !== 'authored' || originBehavior.province.state !== 'province_exam' || originBehavior.province.active !== 'true' || originBehavior.province.filter.p_filters.source_origin !== 'province_exam' || originBehavior.auto.value !== 'authored' || !originBehavior.auto.label.includes('Tác giả') || originBehavior.manual.value !== 'province_exam' || originBehavior.manual.selected !== 'true') {
      throw new Error(`Source/import origin behavior failed: ${JSON.stringify(originBehavior)}`);
    }

    await page.evaluate(async () => {
      window.VMExamAdmin._bankConfigureAccess({role:'admin'});
      const bank = window.VMExamAdmin._bankState;
      bank.sourceItems = [
        {id:'doc-authored-9',title:'Dethamkhao9',source_origin:'authored',grade:12,question_count:1},
        {id:'doc-authored-10',title:'Dethamkhao10',source_origin:'authored',grade:12,question_count:1}
      ];
      window.VMExamAdmin.bankOpenSourcePreview('doc-authored-9');
    });
    await page.waitForFunction(() => document.getElementById('bankPreviewDialog').open && document.getElementById('bankPreviewStatus').textContent.includes('1 câu'));
    const fullscreen = await page.evaluate(() => {
      window.VMExamAdmin.bankTogglePreviewFullscreen(true);
      const dialog = document.getElementById('bankPreviewDialog');
      const first = {
        fullscreen:window.VMExamAdmin._bankState.preview.fullscreen,
        dialogClass:dialog.classList.contains('is-fullscreen'),
        sidebarHidden:document.getElementById('bankPreviewSidebar').getAttribute('aria-hidden'),
        toggleHidden:document.getElementById('bankPreviewSourcesToggle').hidden,
        sources:document.querySelectorAll('#bankPreviewSourceList [data-bank-preview-switch-kind]').length,
        label:document.querySelector('[data-bank-fullscreen-label]').textContent
      };
      window.VMExamAdmin.bankTogglePreviewSidebar(true);
      dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      const afterSidebarEscape = {fullscreen:window.VMExamAdmin._bankState.preview.fullscreen,sidebar:window.VMExamAdmin._bankState.preview.sidebarOpen,open:dialog.open};
      dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      const afterFullscreenEscape = {fullscreen:window.VMExamAdmin._bankState.preview.fullscreen,open:dialog.open};
      dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      const afterDialogEscape = {open:dialog.open};
      return {first,afterSidebarEscape,afterFullscreenEscape,afterDialogEscape};
    });
    if (!fullscreen.first.fullscreen || !fullscreen.first.dialogClass || fullscreen.first.sidebarHidden !== 'false' || fullscreen.first.toggleHidden || fullscreen.first.sources !== 2 || fullscreen.first.label !== 'Thu gọn' || !fullscreen.afterSidebarEscape.fullscreen || fullscreen.afterSidebarEscape.sidebar || !fullscreen.afterSidebarEscape.open || fullscreen.afterFullscreenEscape.fullscreen || !fullscreen.afterFullscreenEscape.open || fullscreen.afterDialogEscape.open) {
      throw new Error(`Fullscreen preview/sidebar escape order failed: ${JSON.stringify(fullscreen)}`);
    }

    const teacher = await page.evaluate(async () => {
      const before = window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_admin_document_catalog').length;
      window.VMExamAdmin._bankConfigureAccess({role:'teacher'});
      const selected = window.VMExamAdmin.bankSetView('repository',{history:'replace',scroll:false});
      await window.VMExamAdmin.bankLoadRepository();
      window.VMExamAdmin._bankState.sourceItems = [{id:'doc-authored-9',title:'Dethamkhao9',source_origin:'authored',grade:12,question_count:1}];
      await window.VMExamAdmin.bankOpenSourcePreview('doc-authored-9');
      const forbiddenPreviewKeys = new Set([
        'item_id','stable_id','technical_id','legacy_code','question_id',
        'raw_tex','canonical_tex','content_tex','solution_latex','solution_tex',
        'answer','correct_indexes','display_id','_vmFullSource'
      ]);
      const hasForbiddenPreviewKey = (value) => {
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) return value.some(hasForbiddenPreviewKey);
        return Object.keys(value).some((key) => forbiddenPreviewKeys.has(key) || hasForbiddenPreviewKey(value[key]));
      };
      const questionReport = document.querySelector('[data-bank-preview-report-number="1"]');
      if (questionReport) questionReport.click();
      const sourceReportContext = document.getElementById('bankIssueContext').textContent;
      document.getElementById('bankIssueDescription').value = 'Công thức tại câu này chưa hiển thị đúng.';
      await window.VMExamAdmin.bankSubmitIssueReport({preventDefault(){}});
      const sourceReportCall = window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_report_issue').at(-1) || null;

      await window.VMExamAdmin.bankOpenExamPreview('exam-generated-1','Đề luyện tập đã tạo');
      const generatedQuestionReport = document.querySelector('[data-bank-preview-report-number="1"]');
      if (generatedQuestionReport) generatedQuestionReport.click();
      const examReportContext = document.getElementById('bankIssueContext').textContent;
      document.getElementById('bankIssueDescription').value = 'Hình ở câu đầu tiên chưa rõ.';
      await window.VMExamAdmin.bankSubmitIssueReport({preventDefault(){}});
      const examReportCall = window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_report_issue').at(-1) || null;

      window.__bankTeacherUnassignable = true;
      window.VMExamAdmin._bankState.sourceCatalogLoading = false;
      await window.VMExamAdmin.bankLoadSourceCatalog(null,{reset:true});
      const unavailableSource = {
        previewActions:document.querySelectorAll('#bankSourceResults [data-source-preview-id="doc-review-1"]').length,
        assignmentActions:document.querySelectorAll('#bankSourceResults [data-source-exam-id="doc-review-1"]').length,
        text:document.getElementById('bankSourceResults').textContent
      };
      document.getElementById('bankGenClass').innerHTML = '<option value="">Chọn lớp</option><option value="class-teacher-1">Toán 12A1</option>';
      document.getElementById('bankGenTitle').value = 'Đề an toàn từ kho';
      document.getElementById('bankGenCount').value = '1';
      await window.VMExamAdmin.bankPreviewExamDraft({preventDefault(){}});
      document.getElementById('bankGenClass').value = 'class-teacher-1';
      document.getElementById('bankGenClass').dispatchEvent(new Event('change',{bubbles:true}));
      await window.VMExamAdmin.bankSaveExamDraft({preventDefault(){}});
      await window.VMExamAdmin.bankOpenExamPreview('exam-generated-safe-1','Đề an toàn từ kho');
      const safeCatalogCalls = window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_exam_catalog');
      const fullscreenExamButton = Array.from(document.querySelectorAll('#bankPreviewSourceList [data-bank-preview-switch-kind="exam"]'))
        .find((button) => button.dataset.bankPreviewSwitchId === 'exam-generated-safe-1');
      return {
        selected,
        importNavHidden:document.getElementById('bankImportNav').hidden,
        sourceMode:window.VMExamAdmin._bankState.manageMode,
        sourcesPaneHidden:document.getElementById('bankManageSourcesPane').hidden,
        sourcesTabHidden:document.getElementById('bankManageSourcesTab').hidden,
        adminGuideHidden:getComputedStyle(document.querySelector('.bank-usage-identifiers')).display === 'none' && getComputedStyle(document.querySelector('.bank-usage-legacy')).display === 'none',
        teacherGuideVisible:getComputedStyle(document.querySelector('.bank-teacher-only-ui')).display !== 'none',
        editorHidden:getComputedStyle(document.getElementById('bankPreviewToEditor')).display === 'none',
        reportVisible:!document.getElementById('bankPreviewReportButton').hidden && getComputedStyle(document.getElementById('bankPreviewReportButton')).display !== 'none',
        safePreview:!document.getElementById('bankPreviewHtml').textContent.includes('QB-83BECE2FD068CA64A146EF73') && !document.getElementById('bankPreviewHtml').textContent.includes('Đáp án 2.'),
        safePayload:!hasForbiddenPreviewKey(window.VMExamAdmin._bankState.preview.questions),
        sourceReportCall,
        sourceReportContext,
        examReportCall,
        examReportContext,
        unavailableSource,
        safeCatalogCall:safeCatalogCalls.at(-1) || null,
        safeCatalogCallCount:safeCatalogCalls.length,
        fullscreenGeneratedExam:!!fullscreenExamButton,
        after:window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_admin_document_catalog').length,
        before
      };
    });
    const sourceReportArgs = teacher.sourceReportCall && teacher.sourceReportCall.args || {};
    const sourceReportTarget = sourceReportArgs.p_target || {};
    const examReportArgs = teacher.examReportCall && teacher.examReportCall.args || {};
    const examReportTarget = examReportArgs.p_target || {};
    const reportLeaksPrivateData = /(?:item_id|stable_id|technical_id|legacy_code|raw_tex|canonical_tex|solution_latex|correct_indexes)/i.test(JSON.stringify([sourceReportArgs,examReportArgs]));
    if (teacher.selected !== 'overview' || !teacher.importNavHidden || teacher.sourceMode !== 'questions' || !teacher.sourcesPaneHidden || !teacher.sourcesTabHidden || !teacher.adminGuideHidden || !teacher.teacherGuideVisible || !teacher.editorHidden || !teacher.reportVisible || !teacher.safePreview || !teacher.safePayload || teacher.after !== teacher.before || !teacher.sourceReportCall || sourceReportArgs.p_target_type !== 'question' || sourceReportTarget.document_id !== 'doc-authored-9' || sourceReportTarget.source_ordinal !== 1 || !teacher.sourceReportContext.includes('câu 1') || !teacher.examReportCall || examReportArgs.p_target_type !== 'question' || examReportTarget.exam_id !== 'exam-generated-1' || examReportTarget.exam_sort !== 0 || !teacher.examReportContext.includes('câu 1') || reportLeaksPrivateData || teacher.unavailableSource.previewActions !== 1 || teacher.unavailableSource.assignmentActions !== 0 || !teacher.safeCatalogCall || teacher.safeCatalogCall.args.p_limit !== 120 || !teacher.fullscreenGeneratedExam) {
      throw new Error(`Teacher repository boundary failed: ${JSON.stringify(teacher)}`);
    }

    console.log('PASS question-bank repository roles, source origins, compact IDs, teacher safety, fullscreen and preview history');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
