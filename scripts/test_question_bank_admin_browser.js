'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html', 'utf8');
  const body = html.match(/<body>([\s\S]*?)<script/)[1];
  const css = ['css/tokens.css', 'css/vinhmath.css', 'css/exam-admin.css']
    .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`);
    await page.addScriptTag({ path: 'js/latex-view.js' });
    await page.addScriptTag({ path: 'js/question-bank.js' });
    await page.addScriptTag({ path: 'js/exam-admin.js' });

    await page.evaluate(async () => {
      window.sb = {
        rpc: async (name) => name === 'vm_bank_admin_taxonomy_catalog'
          ? { data: { items: [{ key: '1D1?2-POWER', vi: 'Lũy thừa cơ bản' }] }, error: null }
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
      workspaceZones: document.querySelectorAll('[data-bank-zone-nav]').length,
      parsed: window.VMExamAdmin._bankState.items.length,
      quarantined: window.VMExamAdmin._bankState.items.filter((item) => item._bankStatus === 'quarantined').length,
      answerPreview: document.getElementById('bankQuestionList').textContent.includes('Đáp án'),
      catalogOptions: document.querySelectorAll('#bankTaxonomyCatalogSelect option').length,
      identities: window.VMExamAdmin._bankState.items.map((item) => ({ id: item.question_id, hash: item.canonical_hash, uid: item.uid })),
    }));
    if (!admin.bankVisible || !admin.workbenchVisible || !admin.importNavVisible || !admin.importZoneVisible || admin.workspaceZones !== 4 || admin.parsed !== 2 || admin.quarantined !== 1 || !admin.answerPreview || admin.catalogOptions !== 2) {
      throw new Error(`Admin workbench failed: ${JSON.stringify(admin)}`);
    }
    await page.evaluate(() => {
      window.VMExamAdmin.bankSelectMissingIds();
      document.getElementById('bankTaxDifficulty').value = 'N';
      window.VMExamAdmin.bankChooseTaxonomy('1D1?2-POWER');
      window.VMExamAdmin.bankApplyClassification();
    });
    const afterBulk = await page.evaluate(() => ({
      ids: window.VMExamAdmin._bankState.items.map((item) => item.question_id),
      quarantined: window.VMExamAdmin._bankState.items.filter((item) => item._bankStatus === 'quarantined').length,
      selected: window.VMExamAdmin._bankState.items.filter((item) => item._bankSelected).length,
      preview: document.getElementById('bankTaxonomyPreview').textContent,
      identities: window.VMExamAdmin._bankState.items.map((item) => ({ id: item.question_id, hash: item.canonical_hash, uid: item.uid })),
    }));
    if (afterBulk.quarantined !== 0 || afterBulk.ids[1] !== '1D1N2-POWER' || afterBulk.ids[0] !== '1D1N1-1' || afterBulk.selected !== 0 || afterBulk.preview !== '1D1N2-POWER') throw new Error(`Taxonomy classification failed: ${JSON.stringify(afterBulk)}`);
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
        internalId:document.getElementById('bankPreviewHtml').textContent.includes('QBI-ADMIN-FULL-1'),
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
    if (JSON.stringify(adminSourcePreview.calls) !== JSON.stringify(['vm_bank_admin_document']) || !adminSourcePreview.showAnswers || !adminSourcePreview.showSolutions || !adminSourcePreview.fullSource || !adminSourcePreview.assignedIdInSource || !adminSourcePreview.editorHandoff || !adminSourcePreview.internalId || adminSourcePreview.correctChoices !== 1 || !adminSourcePreview.solution || !adminSourcePreview.editorExact || !adminSourcePreview.composeActive) {
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

    await page.evaluate(() => window.VMExamAdmin._bankConfigureAccess({ role: 'teacher' }));
    const teacher = await page.evaluate(() => ({
      activeBank: document.getElementById('panel-bank').classList.contains('active'),
      workbenchHidden: document.getElementById('bankAdminWorkbench').hidden,
      importNavHidden: document.getElementById('bankImportNav').hidden,
      importZoneHidden: document.getElementById('bankZoneImport').hidden,
      composeHidden: document.querySelector('[data-tab="compose"]').hidden,
      libraryHidden: document.querySelector('[data-tab="library"]').hidden,
      analyticsHidden: document.querySelector('[data-tab="analytics"]').hidden,
      taxonomyFilterHidden: getComputedStyle(document.querySelector('.bank-admin-taxonomy-filter')).display === 'none',
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

    await page.evaluate(() => {
      window.__bankRpcCalls = [];
      window.sb = {
        rpc: async (name, args) => {
          window.__bankRpcCalls.push({ name, args });
          if (name === 'vm_bank_generate_exam') return { data: { exam_id: 'exam-generated', title: args.p_spec.title, question_count: 9, seed: args.p_spec.seed, warnings: [{ requested:12, selected:9 }] }, error: null };
          if (name === 'vm_bank_source_exam_catalog') return { data: { total: 1, items: [{ id: 'source-exam-1', title: 'Đề chính thức Đồng Nai 2025', province: 'Đồng Nai', exam_year: 2025, exam_kind: 'official', question_count: 22, raw_tex: 'MUST_NOT_RENDER', answer: 'MUST_NOT_RENDER' }] }, error: null };
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
    });
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
    await page.evaluate(async () => window.VMExamAdmin.bankGenerateExam({ preventDefault() {} }));
    const generated = await page.evaluate(() => {
      const call = window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_generate_exam');
      return {
        call,
        visible: !document.getElementById('bankGenerateResult').hidden,
        text: document.getElementById('bankGenerateResult').textContent,
      };
    });
    if (!generated.call || !generated.visible || !generated.text.includes('9 câu') || !generated.text.includes('Yêu cầu 12 câu, tìm được 9 trong phạm vi đã chọn') || generated.text.includes('[object Object]')) throw new Error(`Generated-exam flow failed: ${JSON.stringify(generated)}`);
    const generatedSpec = generated.call.args.p_spec;
    if (generatedSpec.class_id !== 'class-1' || generatedSpec.blueprint[0].count !== 12 || generatedSpec.blueprint[0].grade !== 12 || generatedSpec.blueprint[0].area !== 'D' || generatedSpec.blueprint[0].chapter !== 1 || generatedSpec.blueprint[0].skill !== null || generatedSpec.blueprint[0].question_type !== 'multiple_choice' || generatedSpec.blueprint[0].difficulty !== 'TH') {
      throw new Error(`Generated-exam filters changed: ${JSON.stringify(generatedSpec)}`);
    }
    if (generatedSpec.filters.legacy_prefix !== null || generatedSpec.filters.taxonomy_codes.length || 'taxonomy_prefix' in generatedSpec.blueprint[0]) throw new Error('Teacher generation submitted hidden taxonomy controls');
    if (/(raw_tex|answer|solution|source_path)/i.test(JSON.stringify(generatedSpec))) throw new Error('Teacher generation leaked protected bank fields');

    await page.selectOption('#bankSourceGrade', '12');
    await page.evaluate(async () => window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} }));
    const sourceCatalog = await page.evaluate(() => ({
      text: document.getElementById('bankSourceResults').textContent,
      buttons: document.querySelectorAll('[data-source-exam-id]').length,
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_source_exam_catalog'),
    }));
    if (!sourceCatalog.call || sourceCatalog.call.args.p_filters.grade !== 12 || sourceCatalog.buttons !== 2 || !sourceCatalog.text.includes('Đồng Nai') || sourceCatalog.text.includes('MUST_NOT_RENDER')) {
      throw new Error(`Source catalog sanitization failed: ${JSON.stringify(sourceCatalog)}`);
    }
    await page.click('[data-source-exam-id="source-exam-1"][data-source-mode="assign"]');
    await page.fill('#bankSourceAssignTitle', 'Giao nguyên đề Đồng Nai');
    await page.evaluate(async () => window.VMExamAdmin.bankAssignSourceExam({ preventDefault() {} }));
    const assigned = await page.evaluate(() => ({
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_assign_source_exam'),
      status: document.getElementById('bankSourceAssignStatus').textContent,
    }));
    if (!assigned.call || assigned.call.args.p_document_id !== 'source-exam-1' || assigned.call.args.p_spec.class_id !== 'class-1' || assigned.call.args.p_spec.shuffle !== false || !assigned.status.includes('22 câu')) {
      throw new Error(`Whole-source assignment flow failed: ${JSON.stringify(assigned)}`);
    }
    if (/(raw_tex|answer|solution|source_path)/i.test(JSON.stringify(assigned.call.args))) throw new Error('Source-exam assignment leaked protected bank fields');

    await page.click('[data-source-exam-id="source-exam-1"][data-source-mode="clone"]');
    await page.fill('#bankSourceAssignTitle', 'Đề tương tự Đồng Nai');
    await page.evaluate(async () => window.VMExamAdmin.bankAssignSourceExam({ preventDefault() {} }));
    const cloned = await page.evaluate(() => ({
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_clone_source_structure'),
      status: document.getElementById('bankSourceAssignStatus').textContent,
      button: document.getElementById('bankSourceAssignButton').textContent,
    }));
    if (!cloned.call || cloned.call.args.p_document_id !== 'source-exam-1' || cloned.call.args.p_spec.class_id !== 'class-1' || cloned.call.args.p_spec.shuffle !== true || !cloned.status.includes('20 câu') || !cloned.status.includes('1 vị trí') || !cloned.button.includes('Tạo đề mới')) {
      throw new Error(`Clone-source structure flow failed: ${JSON.stringify(cloned)}`);
    }
    if (/(raw_tex|answer|solution|source_path|taxonomy)/i.test(JSON.stringify(cloned.call.args))) throw new Error('Clone-source flow leaked protected bank fields');

    const teacherEmptyBank = await page.evaluate(async () => {
      window.sb = { rpc: async (name) => {
        if (name === 'vm_bank_generate_exam') return { data:null, error:{ code:'P0002', message:'bank_no_matching_questions' } };
        if (name === 'vm_bank_source_exam_catalog') return { data:{ total:0, items:[] }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      document.getElementById('bankGenTitle').value = 'Đề khi kho trống';
      await window.VMExamAdmin.bankGenerateExam({ preventDefault() {} });
      await window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} });
      return {
        generation:document.getElementById('bankGenerateResult').textContent,
        generationVisible:!document.getElementById('bankGenerateResult').hidden,
        source:document.getElementById('bankSourceResults').textContent,
        leakedTechnicalCode:document.getElementById('bankGenerateResult').textContent.includes('bank_no_matching_questions')
      };
    });
    if (!teacherEmptyBank.generationVisible || !teacherEmptyBank.generation.includes('Không đủ câu phù hợp') || !teacherEmptyBank.generation.includes('quản trị viên') || !teacherEmptyBank.source.includes('Chưa có đề hoàn chỉnh trong kho') || teacherEmptyBank.leakedTechnicalCode) {
      throw new Error(`Teacher empty-bank guidance failed: ${JSON.stringify(teacherEmptyBank)}`);
    }

    const adminEmptyBank = await page.evaluate(async () => {
      window.__emptyBankCalls = [];
      window.sb = { rpc: async (name) => {
        window.__emptyBankCalls.push(name);
        if (name === 'vm_bank_admin_stats') return { data:{ documents:0, items:0, active:0, quarantined:0 }, error:null };
        if (name === 'vm_bank_admin_taxonomy_catalog') return { data:{ items:[] }, error:null };
        if (name === 'vm_bank_source_exam_catalog') return { data:{ total:0, items:[] }, error:null };
        if (name === 'vm_bank_generate_exam') return { data:{ exam_id:'SHOULD_NOT_RUN' }, error:null };
        return { data:null, error:{ code:'PGRST202', message:'unexpected RPC '+name } };
      }};
      window.VMExamAdmin._bankState.statsLoaded = false;
      window.VMExamAdmin._bankConfigureAccess({ role:'admin' });
      document.getElementById('bankGenClass').innerHTML = '<option value="class-1">Toán 12A1</option>';
      document.getElementById('bankGenTitle').value = 'Đề quản trị khi kho trống';
      await window.VMExamAdmin.bankGenerateExam({ preventDefault() {} });
      window.VMExamAdmin.bankFocusImport();
      return {
        generation:document.getElementById('bankGenerateResult').textContent,
        importAction:!!document.querySelector('#bankGenerateResult button'),
        activeElement:document.activeElement && document.activeElement.id,
        generatorCalled:window.__emptyBankCalls.includes('vm_bank_generate_exam')
      };
    });
    if (!adminEmptyBank.generation.includes('0 câu') || !adminEmptyBank.generation.includes('Nhập câu / đề TeX') || !adminEmptyBank.importAction || adminEmptyBank.activeElement !== 'bankImportTopicMode' || adminEmptyBank.generatorCalled) {
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
      const source = Array.from({ length: 41 }, (_, index) => String.raw`\begin{ex}%[1D1N2-POWER]
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
      bank.taxonomyCatalog = [{ catalog_key:'1D1?2-POWER' }];
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

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (mobileOverflow) throw new Error('Question-bank panel overflows the mobile viewport');
    console.log('PASS question-bank admin/teacher UI, parser flow, roles and responsive layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
