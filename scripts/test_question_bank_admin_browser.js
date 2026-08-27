'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const previewDraftId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html', 'utf8');
  const body = html.match(/<body>([\s\S]*?)<script/)[1];
  const css = ['css/tokens.css', 'css/vinhmath.css', 'css/exam-admin.css']
    .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.route('http://vinhmath.test/**', (route) => route.fulfill({
      status:200,
      contentType:'text/html',
      body:`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
    }));
    await page.goto('http://vinhmath.test/quan-tri-de?tab=bank#bank-overview');
    await page.addScriptTag({ path: 'js/latex-view.js' });
    await page.addScriptTag({ path: 'js/question-bank.js' });
    await page.addScriptTag({ path: 'js/exam-admin.js' });

    await page.evaluate(async () => {
      window.sb = {
        rpc: async (name) => name === 'vm_bank_admin_taxonomy_catalog'
          ? { data: { items: [{ key: '1D1?2-1', vi: 'Lũy thừa cơ bản' }] }, error: null }
          : { data: null, error: { code: 'PGRST202', message: 'missing test RPC' } }
      };
      window.VMExamAdmin._bankConfigureAccess({ role: 'admin' });
      window.VMExamAdmin.switchTab('bank');
      await window.VMExamAdmin.bankLoadTaxonomyCatalog(false);
    });
    const tex = String.raw`\begin{ex}%[1D1N1-1]
Giá trị của $2^3$ bằng
\choice{$4$}{$6$}{\True $8$}{$9$}
\loigiai{$2^3=8$.}
\end{ex}
\begin{cauhoi}
Tính $15+27$.
\shortans{42}
\solution{$15+27=42$.}
\end{cauhoi}`;
    await page.evaluate(async (source) => {
      const file = new File([source], 'de-thu.tex', { type: 'text/x-tex' });
      await window.VMExamAdmin.bankSelectFiles([file]);
    }, tex);
    const admin = await page.evaluate(() => ({
      bankVisible: !document.getElementById('bankTab').hidden,
      workbenchVisible: !document.getElementById('bankAdminWorkbench').hidden,
      importNavVisible: !document.getElementById('bankImportNav').hidden,
      importZoneVisible: !document.getElementById('bankZoneImport').hidden,
      sourcesPaneVisible: !document.getElementById('bankManageSourcesPane').hidden,
      activeView: window.VMExamAdmin._bankState.activeView,
      visibleZones: Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
      workspaceZones: document.querySelectorAll('[data-bank-zone-nav]').length,
      parsed: window.VMExamAdmin._bankState.items.length,
      quarantined: window.VMExamAdmin._bankState.items.filter((item) => item._bankStatus === 'quarantined').length,
      answerPreview: document.getElementById('bankQuestionList').textContent.includes('Đáp án'),
      catalogOptions: document.querySelectorAll('#bankTaxonomyCatalogSelect option').length,
      identities: window.VMExamAdmin._bankState.items.map((item) => ({ id: item.question_id, hash: item.canonical_hash, uid: item.uid })),
    }));
    if (!admin.bankVisible || !admin.workbenchVisible || !admin.importNavVisible || admin.importZoneVisible || admin.sourcesPaneVisible || admin.activeView !== 'overview' || JSON.stringify(admin.visibleZones) !== JSON.stringify(['overview']) || admin.workspaceZones !== 4 || admin.parsed !== 2 || admin.quarantined !== 1 || !admin.answerPreview || admin.catalogOptions !== 2) {
      throw new Error(`Admin workbench failed: ${JSON.stringify(admin)}`);
    }

    await page.evaluate(() => {
      window.__bankScrollCalls = [];
      window.__bankOriginalScrollTo = window.scrollTo;
      window.scrollTo = (options) => { window.__bankScrollCalls.push(options); };
    });
    await page.click('[data-bank-zone-nav="create"]');
    await page.fill('#bankGenTitle', 'Bản nháp giữ nguyên khi đổi view');
    await page.click('[data-bank-zone-nav="manage"]');
    const managedView = await page.evaluate(() => ({
      hash:location.hash,
      active:window.VMExamAdmin._bankState.activeView,
      visible:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
      selected:document.querySelector('[data-bank-zone-nav][aria-selected="true"]').dataset.bankZoneNav,
    }));
    if (managedView.hash !== '#bank-manage' || managedView.active !== 'manage' || managedView.selected !== 'manage' || JSON.stringify(managedView.visible) !== JSON.stringify(['manage'])) throw new Error(`Independent manage view failed: ${JSON.stringify(managedView)}`);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.hash === '#bank-create' && window.VMExamAdmin._bankState.activeView === 'create');
    const backView = await page.evaluate(() => ({
      value:document.getElementById('bankGenTitle').value,
      visible:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
    }));
    if (backView.value !== 'Bản nháp giữ nguyên khi đổi view' || JSON.stringify(backView.visible) !== JSON.stringify(['create'])) throw new Error(`Back navigation lost bank view state: ${JSON.stringify(backView)}`);
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => location.hash === '#bank-manage' && window.VMExamAdmin._bankState.activeView === 'manage');
    await page.click('[data-bank-zone-nav="import"]');
    await page.waitForTimeout(50);
    const importView = await page.evaluate(() => ({
      hash:location.hash,
      active:window.VMExamAdmin._bankState.activeView,
      visible:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
      value:document.getElementById('bankGenTitle').value,
      scrollCalls:window.__bankScrollCalls.slice(),
    }));
    await page.evaluate(() => { window.scrollTo = window.__bankOriginalScrollTo; });
    if (importView.hash !== '#bank-import' || importView.active !== 'import' || importView.value !== 'Bản nháp giữ nguyên khi đổi view' || JSON.stringify(importView.visible) !== JSON.stringify(['import']) || !importView.scrollCalls.length || importView.scrollCalls.some((call) => !Number.isFinite(call.top))) throw new Error(`Independent import view failed: ${JSON.stringify(importView)}`);
    const editorHandoff = await page.evaluate(() => {
      window.VMExamAdmin.bankSetManageMode('sources',{ load:false });
      const editor=document.getElementById('exLatex');
      editor.value='Tìm câu về hàm số bậc ba';
      editor.selectionStart=0;
      editor.selectionEnd=editor.value.length;
      window.VMExamAdmin.openBankFromEditor();
      return {
        hash:location.hash,
        active:window.VMExamAdmin._bankState.activeView,
        query:document.getElementById('bankSearchQuery').value,
        manageMode:window.VMExamAdmin._bankState.manageMode,
        questionsVisible:!document.getElementById('bankManageQuestionsPane').hidden,
        sourcesVisible:!document.getElementById('bankManageSourcesPane').hidden,
        visible:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
      };
    });
    if (editorHandoff.hash !== '#bank-manage' || editorHandoff.active !== 'manage' || editorHandoff.manageMode !== 'questions' || !editorHandoff.questionsVisible || editorHandoff.sourcesVisible || editorHandoff.query !== 'Tìm câu về hàm số bậc ba' || JSON.stringify(editorHandoff.visible) !== JSON.stringify(['manage'])) throw new Error(`Editor-to-bank handoff did not open question search: ${JSON.stringify(editorHandoff)}`);
    await page.evaluate(() => {
      window.VMExamAdmin.bankSelectMissingIds();
      document.getElementById('bankTaxDifficulty').value = 'N';
      window.VMExamAdmin.bankChooseTaxonomy('1D1?2-1');
      window.VMExamAdmin.bankApplyClassification();
    });
    const afterBulk = await page.evaluate(() => ({
      ids: window.VMExamAdmin._bankState.items.map((item) => item.question_id),
      quarantined: window.VMExamAdmin._bankState.items.filter((item) => item._bankStatus === 'quarantined').length,
      selected: window.VMExamAdmin._bankState.items.filter((item) => item._bankSelected).length,
      preview: document.getElementById('bankTaxonomyPreview').textContent,
      identities: window.VMExamAdmin._bankState.items.map((item) => ({ id: item.question_id, hash: item.canonical_hash, uid: item.uid })),
    }));
    if (afterBulk.quarantined !== 0 || afterBulk.ids[1] !== '1D1N2-1' || afterBulk.ids[0] !== '1D1N1-1' || afterBulk.selected !== 0 || afterBulk.preview !== '1D1N2-1') throw new Error(`Taxonomy classification failed: ${JSON.stringify(afterBulk)}`);
    for (let index = 0; index < admin.identities.length; index += 1) {
      if (afterBulk.identities[index].hash !== admin.identities[index].hash || afterBulk.identities[index].uid !== admin.identities[index].uid) {
        throw new Error(`Editable taxonomy ID changed immutable identity: ${JSON.stringify({ before: admin.identities[index], after: afterBulk.identities[index] })}`);
      }
    }

    const adminSourceRaw = String.raw`\begin{ex}
Giá trị của $1+1$ bằng
\choice{$1$}{\True $2$}{$3$}{$4$}
\loigiai{Lời giải quản trị đầy đủ.}
\end{ex}`;
    const adminSourceCanonical = String.raw`\begin{ex}%[2D1H1-ADMIN]
Giá trị của $1+1$ bằng
\choice{$1$}{\True $2$}{$3$}{$4$}
\loigiai{Lời giải quản trị đầy đủ.}
\end{ex}`;
    const adminSourcePreview = await page.evaluate(async ({ rawSource, canonicalSource }) => {
      window.__adminSourcePreviewCalls = [];
      window.VMExamAdmin._bankState.sourceItems = [{ id:'source-admin-1', title:'Đề quản trị đầy đủ' }];
      document.getElementById('exLatex').value = '';
      window.sb = { rpc: async (name, args) => {
        window.__adminSourcePreviewCalls.push({ name, args });
        if (name === 'vm_bank_admin_document') return { data:{
          id:'source-admin-1', title:'Đề quản trị đầy đủ', raw_tex:rawSource,
          items:[{
            source_ordinal:1, stable_id:'QBI-ADMIN-FULL-1', legacy_code:'2D1H1-ADMIN',
            question_type:'multiple_choice', canonical_tex:canonicalSource,
            answer:{ correct_indexes:[1] }, solution_latex:'Lời giải quản trị đầy đủ.'
          }]
        }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      await window.VMExamAdmin.bankOpenSourcePreview('source-admin-1');
      const beforeHandoff = {
        calls:window.__adminSourcePreviewCalls.map((entry) => entry.name),
        showAnswers:window.VMExamAdmin._bankState.preview.showAnswers,
        showSolutions:window.VMExamAdmin._bankState.preview.showSolutions,
        fullSource:window.VMExamAdmin._bankState.preview.editableSource === canonicalSource.trim(),
        assignedIdInSource:window.VMExamAdmin._bankState.preview.editableSource.includes('%[2D1H1-ADMIN]'),
        editorHandoff:!document.getElementById('bankPreviewToEditor').hidden,
        technicalIdVisible:document.getElementById('bankPreviewHtml').textContent.includes('QBI-ADMIN-FULL-1'),
        classificationVisible:document.getElementById('bankPreviewHtml').textContent.includes('Mã phân loại · 2D1H1-ADMIN'),
        technicalTooltip:document.querySelector('#bankPreviewHtml .bank-preview-question-id')?.getAttribute('title'),
        correctChoices:document.querySelectorAll('#bankPreviewHtml .exam-choice.correct').length,
        solution:document.getElementById('bankPreviewHtml').textContent.includes('Lời giải quản trị đầy đủ.'),
      };
      window.VMExamAdmin.bankSendPreviewToEditor();
      return {
        ...beforeHandoff,
        editorExact:document.getElementById('exLatex').value === canonicalSource.trim(),
        composeActive:document.getElementById('panel-compose').classList.contains('active'),
      };
    }, { rawSource:adminSourceRaw, canonicalSource:adminSourceCanonical });
    if (JSON.stringify(adminSourcePreview.calls) !== JSON.stringify(['vm_bank_admin_document']) || !adminSourcePreview.showAnswers || !adminSourcePreview.showSolutions || !adminSourcePreview.fullSource || !adminSourcePreview.assignedIdInSource || !adminSourcePreview.editorHandoff || adminSourcePreview.technicalIdVisible || !adminSourcePreview.classificationVisible || adminSourcePreview.technicalTooltip !== 'Mã hệ thống: QBI-ADMIN-FULL-1' || adminSourcePreview.correctChoices !== 1 || !adminSourcePreview.solution || !adminSourcePreview.editorExact || !adminSourcePreview.composeActive) {
      throw new Error(`Admin full-source preview/handoff failed: ${JSON.stringify(adminSourcePreview)}`);
    }

    const fallback = await page.evaluate(async () => {
      window.sb = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'catalog not deployed' } }) };
      await window.VMExamAdmin.bankLoadTaxonomyCatalog(false);
      return {
        status: document.getElementById('bankTaxonomyCatalogStatus').textContent,
        manualFields: ['bankTaxGrade','bankTaxArea','bankTaxChapter','bankTaxDifficulty','bankTaxSkill','bankTaxVariant'].every((id) => !!document.getElementById(id)),
      };
    });
    if (!fallback.manualFields || !fallback.status.includes('phân loại thủ công')) throw new Error(`Taxonomy fallback failed: ${JSON.stringify(fallback)}`);

    const legacyPackage = await page.evaluate(async () => {
      window.__packageCalls = [];
      window.sb = { rpc: async (name, args) => {
        window.__packageCalls.push({ name, args });
        if (name === 'vm_bank_admin_import_taxonomy') return { data: { upserted: args.p_entries.length, failed: [] }, error: null };
        if (name === 'vm_bank_admin_import') return { data: { document_id: 'server-doc-1', inserted: args.p_items.length, updated: 0, quarantined: 0, linked: args.p_items.length }, error: null };
        if (name === 'vm_bank_admin_finalize_document') return { data: { document_id: args.p_document_id, expected_count: args.p_expected_count, ready:true }, error:null };
        if (name === 'vm_bank_admin_stats') return { data: { documents: 1, items: 2, active: 2, quarantined: 0 }, error: null };
        if (name === 'vm_bank_admin_taxonomy_catalog') return { data: { items: [] }, error: null };
        return { data: null, error: { code: 'PGRST202', message: 'unexpected RPC '+name } };
      }};
      const legacyLines = [
        { schema_version:'vinhmath.question-bank.admin-package.v1', package_record:1, package_records:2, package_total_items:1, record_type:'taxonomy', entries:[{ key:'1D1?1-1', vi:{ type_name:'Mũ' }, slug:{ type_name:'power' } }] },
        { schema_version:'vinhmath.question-bank.admin-package.v1', package_record:2, package_records:2, package_total_items:1, record_type:'document_chunk', client_document_key:'legacy-doc', document:{ client_document_key:'legacy-doc', title:'Gói cũ', raw_tex:'\\begin{ex}A\\end{ex}' }, items:[{ source_ordinal:1, question_type:'multiple_choice', content_latex:'A', choices:[{latex:'1'},{latex:'2'},{latex:'3'},{latex:'4'}], answer:{correct_indexes:[0]}, canonical_tex:'A', legacy_code:'1D1N1-1', status:'active' }] }
      ];
      const legacyFile = new File([legacyLines.map((line) => JSON.stringify(line)).join('\n')+'\n'], 'legacy-bank.jsonl', { type:'application/x-ndjson' });
      await window.VMExamAdmin.bankImportAdminPackage([legacyFile]);
      return {
        calls:window.__packageCalls.map((call) => call.name),
        progress:document.getElementById('bankImportProgress').textContent,
        toast:document.getElementById('examToast').textContent,
      };
    });
    if (legacyPackage.calls.length !== 0 || !legacyPackage.progress.includes('document_total_items') || !legacyPackage.progress.includes('document_chunk') || !legacyPackage.progress.includes('document_chunks') || !legacyPackage.toast.includes('Chưa nhập xong gói')) {
      throw new Error(`Legacy package was not rejected before import: ${JSON.stringify(legacyPackage)}`);
    }

    const packageImport = await page.evaluate(async () => {
      window.__packageCalls = [];
      const common = { schema_version:'vinhmath.question-bank.admin-package.v1', package_records:3, package_total_items:2 };
      const lines = [
        { ...common, package_record:1, record_type:'taxonomy', entries:[{ key:'1D1?1-1', vi:{ type_name:'Mũ' }, slug:{ type_name:'power' } }] },
        { ...common, package_record:2, record_type:'document_chunk', client_document_key:'client-doc-1', document_total_items:2, document_chunk:1, document_chunks:2, document:{ client_document_key:'client-doc-1', title:'Đề thử', source_kind:'mock_exam', raw_tex:'\\begin{ex}A\\end{ex}' }, items:[{ source_ordinal:1, question_type:'multiple_choice', content_latex:'A', choices:[{latex:'1'},{latex:'2'},{latex:'3'},{latex:'4'}], answer:{correct_indexes:[0]}, canonical_tex:'A', legacy_code:'1D1N1-1', status:'active' }] },
        { ...common, package_record:3, record_type:'document_chunk', client_document_key:'client-doc-1', document_total_items:2, document_chunk:2, document_chunks:2, document:{ client_document_key:'client-doc-1', raw_tex:'' }, items:[{ source_ordinal:2, question_type:'short_answer', content_latex:'B', answer:{value:'2'}, canonical_tex:'B', legacy_code:'1D1N1-1', status:'active' }] }
      ];
      const file = new File([lines.map((line) => JSON.stringify(line)).join('\n')+'\n'], 'bank.jsonl', { type:'application/x-ndjson' });
      await window.VMExamAdmin.bankImportAdminPackage([file]);
      const imports = window.__packageCalls.filter((call) => call.name === 'vm_bank_admin_import');
      const finalize = window.__packageCalls.find((call) => call.name === 'vm_bank_admin_finalize_document');
      return {
        taxonomyCalls: window.__packageCalls.filter((call) => call.name === 'vm_bank_admin_import_taxonomy').length,
        imports: imports.length,
        firstHasRaw: Boolean(imports[0] && imports[0].args.p_document.raw_tex),
        secondServerId: imports[1] && imports[1].args.p_document.id,
        secondRaw: imports[1] && imports[1].args.p_document.raw_tex,
        secondState: imports[1] && imports[1].args.p_document.metadata && imports[1].args.p_document.metadata.import_state,
        finalize: finalize && finalize.args,
        order: window.__packageCalls.map((call) => call.name),
        progress: document.getElementById('bankImportProgress').textContent
      };
    });
    if (packageImport.taxonomyCalls !== 1 || packageImport.imports !== 2 || !packageImport.firstHasRaw || packageImport.secondServerId !== 'server-doc-1' || packageImport.secondRaw !== '' || packageImport.secondState !== 'complete' || !packageImport.finalize || packageImport.finalize.p_document_id !== 'server-doc-1' || packageImport.finalize.p_expected_count !== 2 || packageImport.order.indexOf('vm_bank_admin_finalize_document') <= packageImport.order.lastIndexOf('vm_bank_admin_import') || !packageImport.progress.includes('Hoàn tất')) {
      throw new Error(`Admin streaming package import failed: ${JSON.stringify(packageImport)}`);
    }

    const inventoryOverview = await page.evaluate(async () => {
      window.sb = { rpc: async (name) => {
        if (name === 'vm_bank_inventory') return { data:{
          summary:{ full_exams:7, active:264, quarantined:8 },
          items:[
            { key:'topic_pack', status:'active', documents:209, active_questions:21863, question_occurrences:23454 },
            { key:'topic_pack', status:'quarantined', documents:6, active_questions:0, question_occurrences:2823 },
            { key:'thptqg', status:'active', documents:50, active_questions:980, question_occurrences:980 },
            { key:'semester', status:'active', documents:5, active_questions:583, question_occurrences:583 },
            { key:'other_exam', status:'quarantined', documents:2, active_questions:0, question_occurrences:31 }
          ]
        }, error:null };
        if (name === 'vm_bank_category_summary') return { data:{
          items:[
            { key:'topic_pack', active_documents:209, active_questions:21563 },
            { key:'thptqg', active_documents:50, active_questions:980 },
            { key:'semester', active_documents:5, active_questions:583 }
          ]
        }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      await window.VMExamAdmin._bankLoadInventory(false);
      return {
        complete:document.getElementById('bankOverviewComplete').textContent,
        topic:document.getElementById('bankOverviewTopic').textContent,
        thpt:document.getElementById('bankOverviewThpt').textContent,
        semester:document.getElementById('bankOverviewSemester').textContent,
        other:document.getElementById('bankOverviewOther').textContent,
        active:document.getElementById('bankOverviewActive').textContent,
        review:document.getElementById('bankOverviewReview').textContent,
      };
    });
    if (inventoryOverview.complete !== '7' || inventoryOverview.topic !== '21.563' || inventoryOverview.topic === '26.277' || inventoryOverview.thpt !== '50' || inventoryOverview.semester !== '5' || inventoryOverview.other !== '0' || inventoryOverview.active !== '264' || inventoryOverview.review !== '8') {
      throw new Error(`Active-only inventory overview failed: ${JSON.stringify(inventoryOverview)}`);
    }

    const canonicalFailure = await page.evaluate(async () => {
      window.VMExamAdmin._bankState.stats.topic_pack_questions = null;
      window.sb = { rpc: async (name) => {
        if (name === 'vm_bank_inventory') return { data:{
          summary:{ full_exams:7, active:264, quarantined:8 },
          items:[{ key:'topic_pack', status:'active', documents:209, active_questions:26277, question_occurrences:26277 }]
        }, error:null };
        if (name === 'vm_bank_category_summary') return { data:null, error:{ code:'PGRST202', message:'not installed yet' } };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      } };
      await window.VMExamAdmin._bankLoadInventory(false);
      return document.getElementById('bankOverviewTopic').textContent;
    });
    if (canonicalFailure !== '—' || canonicalFailure === '26.277') throw new Error(`Canonical RPC failure exposed inflated occurrence count: ${canonicalFailure}`);

    await page.evaluate(() => {
      window.VMExamAdmin.bankSetView('import',{history:'replace',scroll:false});
      window.VMExamAdmin._bankConfigureAccess({ role: 'teacher' });
    });
    const teacher = await page.evaluate(() => ({
      activeBank: document.getElementById('panel-bank').classList.contains('active'),
      workbenchHidden: document.getElementById('bankAdminWorkbench').hidden,
      importNavHidden: document.getElementById('bankImportNav').hidden,
      importZoneHidden: document.getElementById('bankZoneImport').hidden,
      composeHidden: document.querySelector('[data-tab="compose"]').hidden,
      libraryHidden: document.querySelector('[data-tab="library"]').hidden,
      analyticsHidden: document.querySelector('[data-tab="analytics"]').hidden,
      taxonomyFilterHidden: getComputedStyle(document.querySelector('.bank-admin-taxonomy-filter')).display === 'none',
      overviewOnly: JSON.stringify(Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone)) === JSON.stringify(['overview']),
      overviewState: window.VMExamAdmin._bankState.activeView === 'overview',
      safeHash: location.hash === '#bank-overview',
    }));
    if (!Object.values(teacher).every(Boolean)) throw new Error(`Teacher boundary failed: ${JSON.stringify(teacher)}`);

    const teacherSourcePreview = await page.evaluate(async () => {
      window.__teacherSourcePreviewCalls = [];
      window.VMExamAdmin._bankState.sourceItems = [{ id:'source-safe-1', title:'Đề xem an toàn' }];
      window.sb = { rpc: async (name, args) => {
        window.__teacherSourcePreviewCalls.push({ name, args });
        if (name === 'vm_bank_source_exam_preview') return { data:{
          title:'Đề xem an toàn',
          questions:[{
            sort:1, question_type:'multiple_choice', content_latex:'Câu dành cho giáo viên',
            choices:[{ latex:'1' },{ latex:'2' },{ latex:'3' },{ latex:'4' }],
            solution_latex:'MUST_NOT_RENDER_SAFE_SOLUTION'
          }]
        }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      await window.VMExamAdmin.bankOpenSourcePreview('source-safe-1');
      const text = document.getElementById('bankPreviewHtml').textContent;
      const result = {
        calls:window.__teacherSourcePreviewCalls.map((entry) => entry.name),
        showAnswers:window.VMExamAdmin._bankState.preview.showAnswers,
        showSolutions:window.VMExamAdmin._bankState.preview.showSolutions,
        editableSource:window.VMExamAdmin._bankState.preview.editableSource,
        editorHandoff:!document.getElementById('bankPreviewToEditor').hidden,
        leakedSolution:text.includes('MUST_NOT_RENDER_SAFE_SOLUTION'),
      };
      window.VMExamAdmin.bankClosePreview();
      return result;
    });
    if (JSON.stringify(teacherSourcePreview.calls) !== JSON.stringify(['vm_bank_source_exam_preview']) || teacherSourcePreview.showAnswers || teacherSourcePreview.showSolutions || teacherSourcePreview.editableSource || teacherSourcePreview.editorHandoff || teacherSourcePreview.leakedSolution) {
      throw new Error(`Teacher safe-source preview regressed: ${JSON.stringify(teacherSourcePreview)}`);
    }

    await page.evaluate((previewDraftId) => {
      window.__bankRpcCalls = [];
      window.sb = {
        rpc: async (name, args) => {
          window.__bankRpcCalls.push({ name, args });
          if (name === 'vm_bank_preview_exam_draft') return { data: {
            preview_draft_id: previewDraftId,
            selection_token: 'abcdef0123456789abcdef0123456789',
            title: args.p_spec.title,
            question_count: 9,
            requested_count: (args.p_spec.blueprint || []).reduce((sum, segment) => sum + Number(segment.count || 0), 0),
            seed: args.p_spec.seed,
            source_origins: args.p_spec.source_origins,
            warnings: [{ requested:12, selected:9 }],
            questions: Array.from({ length:9 }, (_, index) => ({
              sort:index + 1,
              question_type:'multiple_choice',
              content_latex:`Câu xem trước ${index + 1}`,
              choices:[{latex:'1'},{latex:'2'},{latex:'3'},{latex:'4'}]
            }))
          }, error: null };
          if (name === 'vm_bank_save_exam_draft') return { data: {
            exam_id: 'exam-generated', title: args.p_spec.title, question_count: 9,
            seed: args.p_spec.seed, source_origins: args.p_spec.source_origins,
            preview_draft_id: args.p_spec.preview_draft_id, warnings: [{ requested:12, selected:9 }]
          }, error: null };
          if (name === 'vm_bank_source_exam_catalog') return { data: { total: 6, items: [
            { id: 'source-exam-1', title: 'Đề tham khảo Đồng Nai 2025', province: 'Đồng Nai', grade: 12, exam_year: 2025, bank_category: 'thptqg', bank_variant: 'reference', exam_kind: 'mock', question_count: 22, raw_tex: 'MUST_NOT_RENDER', answer: 'MUST_NOT_RENDER' },
            { id: 'source-exam-mock', title: 'Đề thi thử Đồng Nai 2025', province: 'Đồng Nai', grade: 12, exam_year: 2025, bank_category: 'thptqg', bank_variant: 'mock', exam_kind: 'mock', question_count: 22 },
            { id: 'source-exam-ghk2', title: 'DeThi GHK2 L12', province: 'Đồng Nai', grade: 12, bank_category: 'semester', bank_variant: 'midterm', exam_kind: 'mock', question_count: 20 },
            { id: 'source-exam-hk1', title: 'HK1 Lan2', province: 'Đồng Nai', grade: 12, bank_category: 'semester', bank_variant: 'semester_1', exam_kind: 'mock', question_count: 20 },
            { id: 'source-exam-hk2', title: 'HK2 Lan2', province: 'Đồng Nai', grade: 12, bank_category: 'semester', bank_variant: 'semester_2', exam_kind: 'mock', question_count: 20 },
            { id: 'source-exam-generic', title: 'Đề luyện tập riêng', province: 'Đồng Nai', grade: 12, bank_category: 'other_exam', bank_variant: 'mock', exam_kind: 'mock', question_count: 20 }
          ] }, error: null };
          if (name === 'vm_bank_assign_source_exam') return { data: { exam_id: 'exam-assigned', title: args.p_spec.title, question_count: 22, skipped: 0, source_document_id: args.p_document_id }, error: null };
          if (name === 'vm_bank_clone_source_structure') return { data: { exam_id: 'exam-cloned', title: args.p_spec.title, question_count: 20, source_question_count: 22, seed: args.p_spec.seed, warnings: [{ position: 3, code: 'no_compatible_question' }] }, error: null };
          return { data: null, error: { code: 'PGRST202', message: 'missing test RPC' } };
        }
      };
      window.VMExamAdmin._bankState.taxonomyFacets = [
        {grade:12,area:'D',chapter:1,skill:1,area_label:'Đại số và Giải tích',chapter_label:'Ứng dụng đạo hàm để khảo sát hàm số',skill_label:'Sự đồng biến và nghịch biến'},
        {grade:12,area:'D',chapter:1,skill:2,area_label:'Đại số và Giải tích',chapter_label:'Ứng dụng đạo hàm để khảo sát hàm số',skill_label:'Cực trị của hàm số'},
        {grade:12,area:'H',chapter:2,skill:1,area_label:'Hình học',chapter_label:'Tọa độ véc-tơ trong không gian',skill_label:'Tọa độ véc-tơ'},
        {grade:11,area:'H',chapter:2,skill:1,area_label:'Hình học',chapter_label:'Đường thẳng và mặt phẳng',skill_label:'Quan hệ song song'}
      ];
      window.VMExamAdmin._bankState.taxonomyFacetsLoaded = true;
      window.VMExamAdmin.bankUpdateGeneratorHierarchy('catalog');
      for (const id of ['bankGenClass', 'bankSourceAssignClass']) {
        document.getElementById(id).innerHTML = '<option value="class-1">Toán 12A1</option>';
      }
    }, previewDraftId);
    await page.click('[data-bank-zone-nav="create"]');
    const initialSemesterPeriod = await page.evaluate(() => ({
      hidden:document.getElementById('bankSemesterPeriodFieldset').hidden,
      disabled:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).every((input) => input.disabled),
      required:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).some((input) => input.required),
    }));
    if (!initialSemesterPeriod.hidden || !initialSemesterPeriod.disabled || initialSemesterPeriod.required) {
      throw new Error(`Semester-period choices leaked into practice generation: ${JSON.stringify(initialSemesterPeriod)}`);
    }
    await page.check('input[name="bankGenerationKind"][value="semester_exam"]');
    const semesterPeriodShown = await page.evaluate(() => ({
      hidden:document.getElementById('bankSemesterPeriodFieldset').hidden,
      disabled:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).some((input) => input.disabled),
      required:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).every((input) => input.required),
      values:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).map((input) => input.value),
      selected:document.querySelector('input[name="bankSemesterPeriod"]:checked')?.value || null,
    }));
    if (semesterPeriodShown.hidden || semesterPeriodShown.disabled || !semesterPeriodShown.required || semesterPeriodShown.selected || JSON.stringify(semesterPeriodShown.values) !== JSON.stringify(['midterm_1','final_1','midterm_2','final_2'])) {
      throw new Error(`Semester-period selector is not explicit and required: ${JSON.stringify(semesterPeriodShown)}`);
    }
    await page.fill('#bankGenTitle', 'Đề học kỳ chưa chọn đợt');
    await page.evaluate(() => { window.__bankRpcCalls = []; });
    await page.evaluate(async () => window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} }));
    const missingSemesterPeriod = await page.evaluate(() => ({
      invalid:document.getElementById('bankSemesterPeriodFieldset').getAttribute('aria-invalid'),
      generationCalls:window.__bankRpcCalls.filter((entry) => entry.name === 'vm_bank_preview_exam_draft').length,
      focused:document.activeElement && document.activeElement.value,
    }));
    if (missingSemesterPeriod.invalid !== 'true' || missingSemesterPeriod.generationCalls !== 0 || missingSemesterPeriod.focused !== 'midterm_1') {
      throw new Error(`Semester generation did not stop before RPC without a required period: ${JSON.stringify(missingSemesterPeriod)}`);
    }
    await page.check('input[name="bankSemesterPeriod"][value="midterm_2"]');
    await page.fill('#bankGenTitle', 'Đề Giữa kỳ II · Toán 12');
    await page.evaluate(async () => window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} }));
    const semesterGenerated = await page.evaluate(() => {
      const call=window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_preview_exam_draft');
      return {
        call,
        invalid:document.getElementById('bankSemesterPeriodFieldset').getAttribute('aria-invalid'),
        result:document.getElementById('bankGenerateResult').textContent,
        active:document.querySelector('input[name="bankSemesterPeriod"]:checked')?.closest('label')?.classList.contains('active') || false,
      };
    });
    if (!semesterGenerated.call || semesterGenerated.invalid !== 'false' || !semesterGenerated.active || semesterGenerated.call.args.p_spec.output_kind !== 'semester_exam' || semesterGenerated.call.args.p_spec.semester_period !== 'midterm_2' || semesterGenerated.call.args.p_spec.filters.semester_period !== 'midterm_2' || !semesterGenerated.result.includes('Giữa kỳ II')) {
      throw new Error(`Semester-period generation payload is incomplete: ${JSON.stringify(semesterGenerated)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.bankClosePreview());
    await page.check('input[name="bankGenerationKind"][value="practice_topic"]');
    const semesterPeriodHiddenAgain = await page.evaluate(() => ({
      hidden:document.getElementById('bankSemesterPeriodFieldset').hidden,
      disabled:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).every((input) => input.disabled),
      required:Array.from(document.querySelectorAll('input[name="bankSemesterPeriod"]')).some((input) => input.required),
    }));
    if (!semesterPeriodHiddenAgain.hidden || !semesterPeriodHiddenAgain.disabled || semesterPeriodHiddenAgain.required) {
      throw new Error(`Semester-period controls remained active for practice generation: ${JSON.stringify(semesterPeriodHiddenAgain)}`);
    }
    await page.evaluate(() => { window.__bankRpcCalls = []; });
    await page.click('[data-bank-zone-nav="create"]');
    await page.fill('#bankGenTitle', 'Đề tự sinh tuần 3');
    await page.selectOption('#bankGenGrade', '12');
    const grade12Chapters = await page.$$eval('#bankGenChapter option', (options) => options.map((option) => option.value));
    if (JSON.stringify(grade12Chapters) !== JSON.stringify(['','D:1','H:2'])) {
      throw new Error(`Grade 12 chapter cascade invented or omitted chapters: ${JSON.stringify(grade12Chapters)}`);
    }
    await page.selectOption('#bankGenChapter', 'D:1');
    const chapter1Topics = await page.$$eval('#bankGenTopic option', (options) => options.map((option) => option.value));
    if (JSON.stringify(chapter1Topics) !== JSON.stringify(['','2','1'])) {
      throw new Error(`Chapter 1 topic cascade crossed scope: ${JSON.stringify(chapter1Topics)}`);
    }
    await page.selectOption('#bankGenTopic', '1');
    const blueprintBuilder = await page.evaluate(() => {
      window.VMExamAdmin.bankAddBlueprintRow({ count:7, grade:11, area:'H', chapter:2, question_type:'short_answer', difficulty:'VD' });
      const segments = window.VMExamAdmin._bankCollectBlueprint();
      const total = document.getElementById('bankBlueprintTotal').textContent;
      const rowScope = {
        grade:document.querySelector('.bank-blueprint-grade').value,
        chapter:document.querySelector('.bank-blueprint-chapter').value,
        topic:document.querySelector('.bank-blueprint-topic').value
      };
      document.querySelector('#bankBlueprintRows .bank-blueprint-remove').click();
      return { segments, total, rowScope, remaining:document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row').length };
    });
    if (blueprintBuilder.segments.length !== 2 || blueprintBuilder.segments[0].skill !== 1 || blueprintBuilder.segments[1].count !== 7 || blueprintBuilder.segments[1].area !== 'H' || blueprintBuilder.segments[1].chapter !== 2 || blueprintBuilder.segments[1].question_type !== 'short_answer' || blueprintBuilder.rowScope.grade !== '11' || blueprintBuilder.rowScope.chapter !== 'H:2' || blueprintBuilder.rowScope.topic !== '' || !blueprintBuilder.total.includes('27 câu') || blueprintBuilder.remaining !== 0) {
      throw new Error(`Multi-segment blueprint builder failed: ${JSON.stringify(blueprintBuilder)}`);
    }
    await page.selectOption('#bankGenTopic', '');
    await page.selectOption('#bankGenType', 'multiple_choice');
    await page.selectOption('#bankGenDifficulty', 'TH');
    await page.evaluate(() => { document.getElementById('bankGenPrefix').value = '2D1'; });
    await page.fill('#bankGenCount', '12');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.evaluate(async () => window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} }));
    const generated = await page.evaluate(() => {
      const call = window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_preview_exam_draft');
      return {
        call,
        visible: !document.getElementById('bankGenerateResult').hidden,
        text: document.getElementById('bankGenerateResult').textContent,
        draftId:window.VMExamAdmin._bankState.generationDraft && window.VMExamAdmin._bankState.generationDraft.previewDraftId,
      };
    });
    if (!generated.call || !generated.visible || !generated.text.includes('9 / 12 câu') || !generated.text.includes('Yêu cầu 12 câu, tìm được 9 trong phạm vi đã chọn') || generated.text.includes('[object Object]')) throw new Error(`Generated-exam flow failed: ${JSON.stringify(generated)}`);
    const generatedSpec = generated.call.args.p_spec;
    if ('class_id' in generatedSpec || generatedSpec.blueprint[0].count !== 12 || generatedSpec.blueprint[0].grade !== 12 || generatedSpec.blueprint[0].area !== 'D' || generatedSpec.blueprint[0].chapter !== 1 || generatedSpec.blueprint[0].skill !== null || generatedSpec.blueprint[0].question_type !== 'multiple_choice' || generatedSpec.blueprint[0].difficulty !== 'TH') {
      throw new Error(`Generated-exam filters changed: ${JSON.stringify(generatedSpec)}`);
    }
    if (generatedSpec.filters.legacy_prefix !== null || generatedSpec.filters.taxonomy_codes.length || 'taxonomy_prefix' in generatedSpec.blueprint[0]) throw new Error('Teacher generation submitted hidden taxonomy controls');
    if (/(raw_tex|answer|solution|source_path)/i.test(JSON.stringify(generatedSpec))) throw new Error('Teacher generation leaked protected bank fields');
    const saveTransition = await page.evaluate(async () => {
      const beforeClose = window.VMExamAdmin._bankState.generationDraft && window.VMExamAdmin._bankState.generationDraft.previewDraftId;
      window.VMExamAdmin.bankClosePreview();
      const afterClose = window.VMExamAdmin._bankState.generationDraft && window.VMExamAdmin._bankState.generationDraft.previewDraftId;
      await window.VMExamAdmin.bankSaveExamDraft({ preventDefault() {} });
      return { beforeClose, afterClose };
    });
    const savedGenerated = await page.evaluate(() => {
      const call = window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_save_exam_draft');
      return { call, status:document.getElementById('bankGenerateStatus').textContent };
    });
    if (saveTransition.beforeClose !== previewDraftId || saveTransition.afterClose !== previewDraftId || !savedGenerated.call || savedGenerated.call.args.p_spec.class_id !== 'class-1' || savedGenerated.call.args.p_spec.preview_draft_id !== previewDraftId || savedGenerated.call.args.p_spec.expected_selection_token !== 'abcdef0123456789abcdef0123456789' || savedGenerated.status !== 'Đã lưu') {
      throw new Error(`Explicit generated-exam save failed: ${JSON.stringify({saveTransition,savedGenerated})}`);
    }

    await page.selectOption('#bankSourceGrade', '12');
    await page.selectOption('#bankSourceType', 'thpt_reference');
    await page.evaluate(async () => window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} }));
    const sourceCatalog = await page.evaluate(() => ({
      text: document.getElementById('bankSourceResults').textContent,
      buttons: document.querySelectorAll('[data-source-exam-id]').length,
      activeCategory: document.querySelector('[data-bank-source-category].active')?.dataset.bankSourceCategory,
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_source_exam_catalog'),
    }));
    if (!sourceCatalog.call || sourceCatalog.call.args.p_filters.grade !== 12 || sourceCatalog.call.args.p_filters.exam_kind !== null || sourceCatalog.call.args.p_filters.bank_category !== 'thptqg' || sourceCatalog.call.args.p_filters.bank_variant !== 'reference' || sourceCatalog.activeCategory !== 'thptqg' || sourceCatalog.buttons !== 12 || !sourceCatalog.text.includes('Đồng Nai') || !sourceCatalog.text.includes('THPTQG · tham khảo') || !sourceCatalog.text.includes('THPTQG · thi thử') || !sourceCatalog.text.includes('Giữa kỳ') || !sourceCatalog.text.includes('Học kỳ I') || !sourceCatalog.text.includes('Học kỳ II') || !sourceCatalog.text.includes('Thi thử') || /\bmock\b/i.test(sourceCatalog.text) || sourceCatalog.text.includes('MUST_NOT_RENDER')) {
      throw new Error(`Source catalog sanitization failed: ${JSON.stringify(sourceCatalog)}`);
    }
    const semanticFilterMatrix = await page.evaluate(async () => {
      const values = ['thpt_official','thpt_reference','thpt_mock','midterm','final','semester_1','semester_2','chapter','other'];
      const result = {};
      for (const value of values) {
        document.getElementById('bankSourceType').value = value;
        document.getElementById('bankSourceType').dispatchEvent(new Event('change', { bubbles:true }));
        const before = window.__bankRpcCalls.length;
        await window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} });
        const call = window.__bankRpcCalls.slice(before).find((entry) => entry.name === 'vm_bank_source_exam_catalog');
        result[value] = {
          filters:call && call.args.p_filters,
          activeCategory:document.querySelector('[data-bank-source-category].active')?.dataset.bankSourceCategory,
        };
      }
      return result;
    });
    const expectedSemanticFilters = {
      thpt_official:['thptqg','official'], thpt_reference:['thptqg','reference'], thpt_mock:['thptqg','mock'],
      midterm:['semester','midterm'], final:['semester','final'], semester_1:['semester','semester_1'], semester_2:['semester','semester_2'],
      chapter:['other_exam','chapter'], other:['other_exam',null]
    };
    for (const [kind, route] of Object.entries(expectedSemanticFilters)) {
      const entry = semanticFilterMatrix[kind];
      const filter = entry && entry.filters;
      if (!filter || filter.exam_kind !== null || filter.bank_category !== route[0] || filter.bank_variant !== route[1] || entry.activeCategory !== route[0]) {
        throw new Error(`Semantic source filter ${kind} failed: ${JSON.stringify(entry)}`);
      }
    }
    const assignSourceButton = page.locator('[data-source-exam-id="source-exam-1"][data-source-mode="assign"]');
    await assignSourceButton.scrollIntoViewIfNeeded();
    const sourceScrollBefore = await page.evaluate(() => scrollY);
    await assignSourceButton.click();
    await page.waitForFunction(() => document.activeElement?.id === 'bankSourceAssignClass');
    const assignDialogOpened = await page.evaluate((scrollBefore) => {
      const dialog=document.getElementById('bankSourceAssignDialog'),rect=dialog.getBoundingClientRect();
      return {
        open:dialog.open,
        scrollBefore,
        scrollAfter:scrollY,
        activeElement:document.activeElement && document.activeElement.id,
        heading:document.getElementById('bankSourceAssignHeading').textContent,
        sourceTitle:document.getElementById('bankSourceSelectedTitle').textContent,
        status:document.getElementById('bankSourceAssignStatus').textContent,
        insideViewport:rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      };
    }, sourceScrollBefore);
    if (!assignDialogOpened.open || Math.abs(assignDialogOpened.scrollAfter - assignDialogOpened.scrollBefore) > 1 || assignDialogOpened.activeElement !== 'bankSourceAssignClass' || assignDialogOpened.heading !== 'Giao nguyên đề' || !assignDialogOpened.sourceTitle.includes('Đề tham khảo Đồng Nai 2025') || !assignDialogOpened.status.includes('22 câu') || !assignDialogOpened.insideViewport) {
      throw new Error(`Whole-source assignment dialog did not stay at the trigger viewport: ${JSON.stringify(assignDialogOpened)}`);
    }
    await page.fill('#bankSourceAssignTitle', 'Giao nguyên đề Đồng Nai');
    await page.evaluate(async () => window.VMExamAdmin.bankAssignSourceExam({ preventDefault() {} }));
    const assigned = await page.evaluate(() => ({
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_assign_source_exam'),
      status: document.getElementById('bankSourceAssignStatus').textContent,
      dialogOpen:document.getElementById('bankSourceAssignDialog').open,
      dialogBusy:document.getElementById('bankSourceAssignDialog').hasAttribute('aria-busy'),
      closeDisabled:Array.from(document.querySelectorAll('[data-bank-source-assign-close]')).some((button) => button.disabled),
    }));
    if (!assigned.call || assigned.call.args.p_document_id !== 'source-exam-1' || assigned.call.args.p_spec.class_id !== 'class-1' || assigned.call.args.p_spec.shuffle !== false || !assigned.status.includes('22 câu') || !assigned.dialogOpen || assigned.dialogBusy || assigned.closeDisabled) {
      throw new Error(`Whole-source assignment flow failed: ${JSON.stringify(assigned)}`);
    }
    if (/(raw_tex|answer|solution|source_path)/i.test(JSON.stringify(assigned.call.args))) throw new Error('Source-exam assignment leaked protected bank fields');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('bankSourceAssignDialog').open && document.activeElement?.dataset.sourceMode === 'assign');
    await page.click('[data-source-exam-id="source-exam-1"][data-source-mode="clone"]');
    await page.waitForFunction(() => document.activeElement?.id === 'bankSourceAssignClass');
    await page.fill('#bankSourceAssignTitle', 'Đề tương tự Đồng Nai');
    await page.evaluate(async () => window.VMExamAdmin.bankAssignSourceExam({ preventDefault() {} }));
    const cloned = await page.evaluate(() => ({
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_clone_source_structure'),
      status: document.getElementById('bankSourceAssignStatus').textContent,
      button: document.getElementById('bankSourceAssignButton').textContent,
      heading:document.getElementById('bankSourceAssignHeading').textContent,
      dialogOpen:document.getElementById('bankSourceAssignDialog').open,
    }));
    if (!cloned.call || cloned.call.args.p_document_id !== 'source-exam-1' || cloned.call.args.p_spec.class_id !== 'class-1' || cloned.call.args.p_spec.shuffle !== true || !cloned.status.includes('20 câu') || !cloned.status.includes('1 vị trí') || !cloned.button.includes('Tạo đề mới') || cloned.heading !== 'Tạo đề cùng cấu trúc' || !cloned.dialogOpen) {
      throw new Error(`Clone-source structure flow failed: ${JSON.stringify(cloned)}`);
    }
    if (/(raw_tex|answer|solution|source_path|taxonomy)/i.test(JSON.stringify(cloned.call.args))) throw new Error('Clone-source flow leaked protected bank fields');

    await page.evaluate(() => window.VMExamAdmin.bankCloseSourceAssign());
    await page.waitForFunction(() => !document.getElementById('bankSourceAssignDialog').open);
    await page.setViewportSize({ width:390, height:844 });
    await page.evaluate(() => window.VMExamAdmin.bankChooseSourceExam('source-exam-1','assign'));
    await page.waitForFunction(() => document.activeElement?.id === 'bankSourceAssignClass');
    const mobileAssignDialog = await page.evaluate(() => {
      const dialog=document.getElementById('bankSourceAssignDialog'),rect=dialog.getBoundingClientRect();
      return {
        open:dialog.open,
        left:rect.left,
        top:rect.top,
        right:rect.right,
        bottom:rect.bottom,
        viewportWidth:innerWidth,
        viewportHeight:innerHeight,
        pageOverflow:document.documentElement.scrollWidth > innerWidth + 1,
        fieldColumns:getComputedStyle(document.querySelector('.bank-source-assign-fields')).gridTemplateColumns,
      };
    });
    if (!mobileAssignDialog.open || mobileAssignDialog.left < -1 || mobileAssignDialog.top < -1 || mobileAssignDialog.right > mobileAssignDialog.viewportWidth + 1 || mobileAssignDialog.bottom > mobileAssignDialog.viewportHeight + 1 || mobileAssignDialog.pageOverflow || mobileAssignDialog.fieldColumns.trim().split(/\s+/).length !== 1) {
      throw new Error(`Whole-source assignment dialog is not mobile-safe: ${JSON.stringify(mobileAssignDialog)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.bankCloseSourceAssign());
    await page.setViewportSize({ width:1600, height:900 });

    const sourcePagination = await page.evaluate(async () => {
      const rows = Array.from({ length:53 }, (_, index) => ({
        id:`paged-source-${index + 1}`,
        title:`Đề nguồn phân trang ${index + 1}`,
        province:'Đồng Nai',
        grade:12,
        exam_year:2026,
        bank_category:'thptqg',
        bank_variant:'mock',
        exam_kind:'mock',
        question_count:22,
      }));
      window.__sourcePaginationCalls = [];
      window.sb = { rpc: async (name, args) => {
        if (name !== 'vm_bank_source_exam_catalog') return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
        window.__sourcePaginationCalls.push(args);
        const offset = Number(args.p_offset || 0);
        const items = offset === 0 ? rows.slice(0, 50) : (offset === 50 ? [rows[49], ...rows.slice(50)] : []);
        return { data:{ total:53, items }, error:null };
      }};
      const type = document.getElementById('bankSourceType');
      type.value = '';
      type.dispatchEvent(new Event('change', { bubbles:true }));
      window.VMExamAdmin._bankState.sourceCatalogLoading = false;
      await window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} });
      const initial = {
        cards:document.querySelectorAll('#bankSourceResults .bank-source-item').length,
        status:document.getElementById('bankSourcePageStatus').textContent,
        loadMoreHidden:document.getElementById('bankSourceLoadMoreButton').hidden,
        offset:window.VMExamAdmin._bankState.sourceCatalogOffset,
      };
      await window.VMExamAdmin.bankLoadMoreSources({ preventDefault() {} });
      const ids = window.VMExamAdmin._bankState.sourceItems.map((item) => item.id);
      return {
        initial,
        offsets:window.__sourcePaginationCalls.map((args) => args.p_offset),
        limits:window.__sourcePaginationCalls.map((args) => args.p_limit),
        cards:document.querySelectorAll('#bankSourceResults .bank-source-item').length,
        uniqueIds:new Set(ids).size,
        duplicateCount:ids.filter((id) => id === 'paged-source-50').length,
        status:document.getElementById('bankSourcePageStatus').textContent,
        loadMoreHidden:document.getElementById('bankSourceLoadMoreButton').hidden,
        offset:window.VMExamAdmin._bankState.sourceCatalogOffset,
        total:window.VMExamAdmin._bankState.sourceCatalogResultTotal,
      };
    });
    if (sourcePagination.initial.cards !== 50 || !sourcePagination.initial.status.includes('50 / 53') || sourcePagination.initial.loadMoreHidden || sourcePagination.initial.offset !== 50 || JSON.stringify(sourcePagination.offsets) !== JSON.stringify([0,50]) || JSON.stringify(sourcePagination.limits) !== JSON.stringify([50,50]) || sourcePagination.cards !== 53 || sourcePagination.uniqueIds !== 53 || sourcePagination.duplicateCount !== 1 || !sourcePagination.status.includes('53 / 53') || !sourcePagination.loadMoreHidden || sourcePagination.offset !== 54 || sourcePagination.total !== 53) {
      throw new Error(`Whole-source pagination failed: ${JSON.stringify(sourcePagination)}`);
    }

    const teacherEmptyBank = await page.evaluate(async () => {
      window.sb = { rpc: async (name) => {
        if (name === 'vm_bank_preview_exam_draft') return { data:null, error:{ code:'P0002', message:'bank_no_matching_questions' } };
        if (name === 'vm_bank_source_exam_catalog') return { data:{ total:0, items:[] }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      document.getElementById('bankGenTitle').value = 'Đề khi kho trống';
      await window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} });
      await window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} });
      return {
        generation:document.getElementById('bankGenerateResult').textContent,
        generationVisible:!document.getElementById('bankGenerateResult').hidden,
        source:document.getElementById('bankSourceResults').textContent,
        leakedTechnicalCode:document.getElementById('bankGenerateResult').textContent.includes('bank_no_matching_questions')
      };
    });
    if (!teacherEmptyBank.generationVisible || !teacherEmptyBank.generation.includes('Không đủ câu phù hợp') || teacherEmptyBank.generation.includes('quản trị viên') || !teacherEmptyBank.generation.includes('bộ lọc rộng hơn') || !teacherEmptyBank.generation.includes('chọn thêm nguồn') || !teacherEmptyBank.source.includes('Chưa có đề hoàn chỉnh trong kho') || teacherEmptyBank.leakedTechnicalCode) {
      throw new Error(`Teacher empty-bank guidance failed: ${JSON.stringify(teacherEmptyBank)}`);
    }

    const adminEmptyBank = await page.evaluate(async () => {
      window.__emptyBankCalls = [];
      window.sb = { rpc: async (name) => {
        window.__emptyBankCalls.push(name);
        if (name === 'vm_bank_admin_stats') return { data:{ documents:0, items:0, active:0, quarantined:0 }, error:null };
        if (name === 'vm_bank_admin_taxonomy_catalog') return { data:{ items:[] }, error:null };
        if (name === 'vm_bank_source_exam_catalog') return { data:{ total:0, items:[] }, error:null };
        if (name === 'vm_bank_preview_exam_draft') return { data:null, error:{ code:'P0002', message:'bank_no_matching_questions' } };
        if (name === 'vm_bank_save_exam_draft') return { data:{ exam_id:'SHOULD_NOT_RUN' }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      window.VMExamAdmin._bankState.statsLoaded = false;
      window.VMExamAdmin._bankConfigureAccess({ role:'admin' });
      document.getElementById('bankGenClass').innerHTML = '<option value="class-1">Toán 12A1</option>';
      document.getElementById('bankGenTitle').value = 'Đề quản trị khi kho trống';
      await window.VMExamAdmin.bankLoadStats(true);
      await window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} });
      window.VMExamAdmin.bankFocusImport();
      return {
        generation:document.getElementById('bankGenerateResult').textContent,
        importAction:!!document.querySelector('#bankGenerateResult button'),
        activeElement:document.activeElement && document.activeElement.id,
        previewCalled:window.__emptyBankCalls.includes('vm_bank_preview_exam_draft'),
        saveCalled:window.__emptyBankCalls.includes('vm_bank_save_exam_draft')
      };
    });
    if (!adminEmptyBank.generation.includes('0 câu') || !adminEmptyBank.generation.includes('Nhập câu / đề TeX') || !adminEmptyBank.importAction || adminEmptyBank.activeElement !== 'bankImportTopicMode' || !adminEmptyBank.previewCalled || adminEmptyBank.saveCalled) {
      throw new Error(`Admin empty-bank recovery failed: ${JSON.stringify(adminEmptyBank)}`);
    }

    const pasteStation = await page.evaluate(() => {
      const bank = window.VMExamAdmin._bankState;
      bank.documents = []; bank.items = []; bank.parseErrors = [];
      window.VMExamAdmin.bankSetImportMode('complete_exam');
      document.getElementById('bankImportTitle').value = 'Đề nguồn chưa gắn ID';
      document.getElementById('bankPasteTex').value = String.raw`\begin{ex}
      Cho hình sau \includegraphics{hinh-1.pdf}. Chọn đáp án đúng.
      \choice{1}{\True 2}{3}{4}
      \loigiai{Đáp án 2.}
      \end{ex}
      \begin{bt}Tính $1+1$.\loigiai{\textbf{Câu trả lời:} 2}\end{bt}`;
      window.VMExamAdmin.bankParsePastedTex();
      window.VMExamAdmin.bankOpenImportPreview();
      const wholePreview = {
        open: document.getElementById('bankPreviewDialog').open || document.getElementById('bankPreviewDialog').hasAttribute('open'),
        questions: bank.preview.questions.length,
        title: document.getElementById('bankPreviewTitle').textContent,
        editorHandoff: !document.getElementById('bankPreviewToEditor').hidden,
        editableLength: bank.preview.editableSource.length,
        toast: document.getElementById('examToast').textContent,
        canAdmin: bank.access.canAdmin,
      };
      document.getElementById('bankImportExamType').value = 'midterm';
      window.VMExamAdmin.bankUpdateImportExamKind();
      return {
        mode: bank.importMode,
        sourceKind: document.getElementById('bankImportSourceKind').value,
        parsed: bank.items.length,
        selected: bank.items.filter((item) => item._bankSelected).length,
        nextLabel: document.getElementById('bankSelectMissingButton').textContent,
        assetWarning: !document.getElementById('bankPasteAssetWarning').hidden,
        schoolContext: !document.getElementById('bankImportSchoolContext').hidden,
        schoolYear: document.getElementById('bankImportSchoolYear').value,
        previewButton: !document.getElementById('bankImportPreviewButton').hidden,
        matrixVisible: !document.getElementById('bankLocalMatrix').hidden,
        wholePreview,
      };
    });
    if (pasteStation.mode !== 'complete_exam' || pasteStation.sourceKind !== 'mock_exam' || pasteStation.parsed !== 2 || pasteStation.selected !== 1 || !pasteStation.nextLabel.includes('tiếp theo') || !pasteStation.assetWarning || !pasteStation.schoolContext || !pasteStation.schoolYear || !pasteStation.previewButton || !pasteStation.matrixVisible || !pasteStation.wholePreview.open || pasteStation.wholePreview.questions !== 2 || pasteStation.wholePreview.title !== 'Đề nguồn chưa gắn ID' || !pasteStation.wholePreview.editorHandoff) {
      throw new Error(`Paste import station failed: ${JSON.stringify(pasteStation)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.bankClosePreview());

    const largeImport = await page.evaluate(async () => {
      const source = Array.from({ length: 41 }, (_, index) => String.raw`\begin{ex}%[1D1N2-1]
Câu kiểm thử số ${index + 1}: Giá trị của $2^3+${index}$ bằng
\choice{\True $${8 + index}$}{$${9 + index}$}{$${10 + index}$}{$${11 + index}$}
\loigiai{$2^3+${index}=${8 + index}$.}
\end{ex}`).join('\n');
      const bank = window.VMExamAdmin._bankState;
      window.VMExamAdmin.bankSetImportMode('complete_exam');
      document.getElementById('bankImportTitle').value = 'Đề nguồn 41 câu';
      document.getElementById('bankImportExamType').value = 'thpt_mock';
      document.getElementById('bankImportExamGrade').value = '11';
      document.getElementById('bankImportYear').value = '2026';
      bank.taxonomyCatalog = [{ catalog_key:'1D1?2-1' }];
      bank.taxonomyCatalogLoaded = true;
      const file = new File([source], 'de-41-cau.tex', { type:'text/x-tex' });
      await window.VMExamAdmin.bankSelectFiles([file]);
      const parsed = { count:bank.items.length, active:bank.items.filter((item) => item._bankStatus === 'active').length };
      window.VMExamAdmin.bankOpenImportPreview();
      const preview = {
        count:bank.preview.questions.length,
        status:document.getElementById('bankPreviewStatus').textContent,
        editorHandoff:!document.getElementById('bankPreviewToEditor').hidden,
      };
      window.__largeImportCalls = [];
      bank.sourceCatalogLoading = false;
      window.sb = { rpc: async (name, args) => {
        window.__largeImportCalls.push({ name, args });
        if (name === 'vm_bank_admin_import') return { data:{ document_id:'server-doc-41', inserted:args.p_items.length, updated:0, quarantined:0, linked:args.p_items.length }, error:null };
        if (name === 'vm_bank_admin_finalize_document') return { data:{ document_id:args.p_document_id, expected_count:args.p_expected_count, ready:true }, error:null };
        if (name === 'vm_bank_admin_stats') return { data:{ documents:1, items:41, active:41, quarantined:0 }, error:null };
        if (name === 'vm_bank_inventory') return { data:{ summary:{ documents:1, questions:41, active:41, quarantined:0 }, categories:[] }, error:null };
        if (name === 'vm_bank_category_summary') return { data:{ items:[{ key:'topic_pack', active_documents:1, active_questions:41 }] }, error:null };
        if (name === 'vm_bank_source_exam_catalog') return { data:{ total:1, items:[] }, error:null };
        if (name === 'vm_bank_matrix') return { data:{ question_count:41, items:[{ question_type:'multiple_choice', difficulty:'NB', count:41 }] }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      await window.VMExamAdmin.bankImport();
      const imports = window.__largeImportCalls.filter((call) => call.name === 'vm_bank_admin_import');
      const finalize = window.__largeImportCalls.find((call) => call.name === 'vm_bank_admin_finalize_document');
      return {
        parsed,
        preview,
        imports:imports.map((call) => ({
          size:call.args.p_items.length,
          id:call.args.p_document.id || null,
          raw:Boolean(call.args.p_document.raw_tex),
          state:call.args.p_document.metadata && call.args.p_document.metadata.import_state,
          expected:call.args.p_document.metadata && call.args.p_document.metadata.expected_count,
          grade:call.args.p_document.metadata && call.args.p_document.metadata.grade,
        })),
        finalize:finalize && finalize.args,
        order:window.__largeImportCalls.map((call) => call.name),
        progress:document.getElementById('bankImportProgress').textContent,
      };
    });
    const lastImportIndex = largeImport.order.lastIndexOf('vm_bank_admin_import');
    const finalizeIndex = largeImport.order.indexOf('vm_bank_admin_finalize_document');
    if (largeImport.parsed.count !== 41 || largeImport.parsed.active !== 41 || largeImport.preview.count !== 41 || !largeImport.preview.status.includes('41 câu') || !largeImport.preview.editorHandoff || largeImport.imports.length !== 2 || largeImport.imports[0].size !== 40 || largeImport.imports[1].size !== 1 || !largeImport.imports[0].raw || largeImport.imports[0].state !== 'staged' || largeImport.imports[0].expected !== 41 || largeImport.imports[0].grade !== 11 || largeImport.imports[1].id !== 'server-doc-41' || largeImport.imports[1].raw || largeImport.imports[1].state !== 'complete' || largeImport.imports[1].expected !== 41 || !largeImport.finalize || largeImport.finalize.p_document_id !== 'server-doc-41' || largeImport.finalize.p_expected_count !== 41 || finalizeIndex <= lastImportIndex || !largeImport.progress.includes('Hoàn tất')) {
      throw new Error(`Chunked whole-exam finalization failed: ${JSON.stringify(largeImport)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.bankClosePreview());

    await page.evaluate(() => window.VMExamAdmin._bankConfigureAccess({ role: 'assistant' }));
    const assistant = await page.evaluate(() => ({
      canUse: window.VMExamAdmin._bankState.access.canUse,
      tabHidden: document.getElementById('bankTab').hidden,
      workbenchHidden: document.getElementById('bankAdminWorkbench').hidden,
    }));
    if (assistant.canUse || !assistant.tabHidden || !assistant.workbenchHidden) throw new Error(`Assistant boundary failed: ${JSON.stringify(assistant)}`);

    await page.evaluate(() => {
      window.VMExamAdmin._bankConfigureAccess({ role:'teacher' });
      window.VMExamAdmin.switchTab('bank');
      window.VMExamAdmin.bankSetView('manage',{ history:'replace', scroll:false });
    });
    const desktopLayout = await page.evaluate(() => {
      const panel=document.getElementById('panel-bank');
      const nav=document.getElementById('bankWorkspaceNav');
      const views=document.getElementById('bankWorkspaceViews');
      const panelRect=panel.getBoundingClientRect(),navRect=nav.getBoundingClientRect(),viewsRect=views.getBoundingClientRect();
      return {
        panelDisplay:getComputedStyle(panel).display,
        navDirection:getComputedStyle(nav).flexDirection,
        navOverflowY:getComputedStyle(nav).overflowY,
        navWidth:navRect.width,
        sideBySide:navRect.right <= viewsRect.left + 1,
        contentShare:viewsRect.width / panelRect.width,
        hero:Boolean(document.querySelector('.exam-admin-hero')),
        kpis:Boolean(document.querySelector('.exam-kpis')),
        primaryTabs:Array.from(document.querySelectorAll('.exam-tabs [data-tab]')).map((tab) => tab.dataset.tab),
      };
    });
    if (desktopLayout.panelDisplay !== 'grid' || desktopLayout.navDirection !== 'column' || !['auto','scroll'].includes(desktopLayout.navOverflowY) || desktopLayout.navWidth > 225 || !desktopLayout.sideBySide || desktopLayout.contentShare < .75 || desktopLayout.hero || desktopLayout.kpis || JSON.stringify(desktopLayout.primaryTabs) !== JSON.stringify(['compose','bank','library','analytics'])) {
      throw new Error(`Question-bank desktop rail is not compact and content-first: ${JSON.stringify(desktopLayout)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.switchTab('compose'));
    const composeLayout = await page.evaluate(() => ({
      composeActive:document.getElementById('panel-compose').classList.contains('active'),
      composeDisplay:getComputedStyle(document.getElementById('panel-compose')).display,
      workflowDisplay:getComputedStyle(document.querySelector('#panel-compose .exam-workflow')).display,
      editorVisible:document.querySelector('#panel-compose .exam-editor-card').getBoundingClientRect().width > 0,
      bankDisplay:getComputedStyle(document.getElementById('panel-bank')).display,
    }));
    if (!composeLayout.composeActive || composeLayout.composeDisplay === 'none' || composeLayout.workflowDisplay !== 'grid' || !composeLayout.editorVisible || composeLayout.bankDisplay !== 'none') {
      throw new Error(`Compose tab broke after the bank rail layout change: ${JSON.stringify(composeLayout)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.switchTab('bank'));
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => {
      const nav=document.getElementById('bankWorkspaceNav'),style=getComputedStyle(nav);
      return {
        pageOverflow:document.documentElement.scrollWidth > innerWidth + 1,
        navDisplay:style.display,
        navOverflow:style.overflowX,
        visible:Array.from(document.querySelectorAll('[data-bank-zone]')).filter((zone) => !zone.hidden).map((zone) => zone.dataset.bankZone),
      };
    });
    if (mobileLayout.pageOverflow || mobileLayout.navDisplay !== 'flex' || !['auto','scroll'].includes(mobileLayout.navOverflow) || JSON.stringify(mobileLayout.visible) !== JSON.stringify(['manage'])) throw new Error(`Question-bank mobile views are not responsive: ${JSON.stringify(mobileLayout)}`);
    console.log('PASS question-bank admin/teacher UI, parser flow, roles and responsive layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
