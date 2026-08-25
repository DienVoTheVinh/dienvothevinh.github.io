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
      parsed: window.VMExamAdmin._bankState.items.length,
      quarantined: window.VMExamAdmin._bankState.items.filter((item) => item._bankStatus === 'quarantined').length,
      answerPreview: document.getElementById('bankQuestionList').textContent.includes('Đáp án'),
      catalogOptions: document.querySelectorAll('#bankTaxonomyCatalogSelect option').length,
      identities: window.VMExamAdmin._bankState.items.map((item) => ({ id: item.question_id, hash: item.canonical_hash, uid: item.uid })),
    }));
    if (!admin.bankVisible || !admin.workbenchVisible || admin.parsed !== 2 || admin.quarantined !== 1 || !admin.answerPreview || admin.catalogOptions !== 2) {
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

    const fallback = await page.evaluate(async () => {
      window.sb = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'catalog not deployed' } }) };
      await window.VMExamAdmin.bankLoadTaxonomyCatalog(false);
      return {
        status: document.getElementById('bankTaxonomyCatalogStatus').textContent,
        manualFields: ['bankTaxGrade','bankTaxArea','bankTaxChapter','bankTaxDifficulty','bankTaxSkill','bankTaxVariant'].every((id) => !!document.getElementById(id)),
      };
    });
    if (!fallback.manualFields || !fallback.status.includes('phân loại thủ công')) throw new Error(`Taxonomy fallback failed: ${JSON.stringify(fallback)}`);

    const packageImport = await page.evaluate(async () => {
      window.__packageCalls = [];
      window.sb = { rpc: async (name, args) => {
        window.__packageCalls.push({ name, args });
        if (name === 'vm_bank_admin_import_taxonomy') return { data: { upserted: args.p_entries.length, failed: [] }, error: null };
        if (name === 'vm_bank_admin_import') return { data: { document_id: 'server-doc-1', inserted: args.p_items.length, updated: 0, quarantined: 0, linked: args.p_items.length }, error: null };
        if (name === 'vm_bank_admin_stats') return { data: { documents: 1, items: 2, active: 2, quarantined: 0 }, error: null };
        if (name === 'vm_bank_admin_taxonomy_catalog') return { data: { items: [] }, error: null };
        return { data: null, error: { code: 'PGRST202', message: 'unexpected RPC '+name } };
      }};
      const common = { schema_version:'vinhmath.question-bank.admin-package.v1', package_records:3, package_total_items:2 };
      const lines = [
        { ...common, package_record:1, record_type:'taxonomy', entries:[{ key:'1D1?1-1', vi:{ type_name:'Mũ' }, slug:{ type_name:'power' } }] },
        { ...common, package_record:2, record_type:'document_chunk', client_document_key:'client-doc-1', document:{ client_document_key:'client-doc-1', title:'Đề thử', source_kind:'mock_exam', raw_tex:'\\begin{ex}A\\end{ex}' }, items:[{ source_ordinal:1, question_type:'multiple_choice', content_latex:'A', choices:[{latex:'1'},{latex:'2'},{latex:'3'},{latex:'4'}], answer:{correct_indexes:[0]}, canonical_tex:'A', legacy_code:'1D1N1-1', status:'active' }] },
        { ...common, package_record:3, record_type:'document_chunk', client_document_key:'client-doc-1', document:{ client_document_key:'client-doc-1', raw_tex:'' }, items:[{ source_ordinal:2, question_type:'short_answer', content_latex:'B', answer:{value:'2'}, canonical_tex:'B', legacy_code:'1D1N1-1', status:'active' }] }
      ];
      const file = new File([lines.map((line) => JSON.stringify(line)).join('\n')+'\n'], 'bank.jsonl', { type:'application/x-ndjson' });
      await window.VMExamAdmin.bankImportAdminPackage([file]);
      const imports = window.__packageCalls.filter((call) => call.name === 'vm_bank_admin_import');
      return {
        taxonomyCalls: window.__packageCalls.filter((call) => call.name === 'vm_bank_admin_import_taxonomy').length,
        imports: imports.length,
        firstHasRaw: Boolean(imports[0] && imports[0].args.p_document.raw_tex),
        secondServerId: imports[1] && imports[1].args.p_document.id,
        secondRaw: imports[1] && imports[1].args.p_document.raw_tex,
        progress: document.getElementById('bankImportProgress').textContent
      };
    });
    if (packageImport.taxonomyCalls !== 1 || packageImport.imports !== 2 || !packageImport.firstHasRaw || packageImport.secondServerId !== 'server-doc-1' || packageImport.secondRaw !== '' || !packageImport.progress.includes('Hoàn tất')) {
      throw new Error(`Admin streaming package import failed: ${JSON.stringify(packageImport)}`);
    }

    await page.evaluate(() => window.VMExamAdmin._bankConfigureAccess({ role: 'teacher' }));
    const teacher = await page.evaluate(() => ({
      activeBank: document.getElementById('panel-bank').classList.contains('active'),
      workbenchHidden: document.getElementById('bankAdminWorkbench').hidden,
      composeHidden: document.querySelector('[data-tab="compose"]').hidden,
      libraryHidden: document.querySelector('[data-tab="library"]').hidden,
      analyticsHidden: document.querySelector('[data-tab="analytics"]').hidden,
      taxonomyFilterHidden: getComputedStyle(document.querySelector('.bank-admin-taxonomy-filter')).display === 'none',
    }));
    if (!Object.values(teacher).every(Boolean)) throw new Error(`Teacher boundary failed: ${JSON.stringify(teacher)}`);

    await page.evaluate(() => {
      window.__bankRpcCalls = [];
      window.sb = {
        rpc: async (name, args) => {
          window.__bankRpcCalls.push({ name, args });
          if (name === 'vm_bank_generate_exam') return { data: { exam_id: 'exam-generated', title: args.p_spec.title, question_count: 12, seed: args.p_spec.seed, warnings: [] }, error: null };
          if (name === 'vm_bank_source_exam_catalog') return { data: { total: 1, items: [{ id: 'source-exam-1', title: 'Đề chính thức Đồng Nai 2025', province: 'Đồng Nai', exam_year: 2025, exam_kind: 'official', question_count: 22, raw_tex: 'MUST_NOT_RENDER', answer: 'MUST_NOT_RENDER' }] }, error: null };
          if (name === 'vm_bank_assign_source_exam') return { data: { exam_id: 'exam-assigned', title: args.p_spec.title, question_count: 22, skipped: 0, source_document_id: args.p_document_id }, error: null };
          if (name === 'vm_bank_clone_source_structure') return { data: { exam_id: 'exam-cloned', title: args.p_spec.title, question_count: 20, source_question_count: 22, seed: args.p_spec.seed, warnings: [{ position: 3, code: 'no_compatible_question' }] }, error: null };
          return { data: null, error: { code: 'PGRST202', message: 'missing test RPC' } };
        }
      };
      for (const id of ['bankGenClass', 'bankSourceAssignClass']) {
        document.getElementById(id).innerHTML = '<option value="class-1">Toán 12A1</option>';
      }
    });
    await page.fill('#bankGenTitle', 'Đề tự sinh tuần 3');
    const blueprintBuilder = await page.evaluate(() => {
      window.VMExamAdmin.bankAddBlueprintRow({ count:7, grade:11, question_type:'short_answer', difficulty:'VD' });
      const segments = window.VMExamAdmin._bankCollectBlueprint();
      const total = document.getElementById('bankBlueprintTotal').textContent;
      document.querySelector('#bankBlueprintRows .bank-blueprint-remove').click();
      return { segments, total, remaining:document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row').length };
    });
    if (blueprintBuilder.segments.length !== 2 || blueprintBuilder.segments[1].count !== 7 || blueprintBuilder.segments[1].question_type !== 'short_answer' || !blueprintBuilder.total.includes('27 câu') || blueprintBuilder.remaining !== 0) {
      throw new Error(`Multi-segment blueprint builder failed: ${JSON.stringify(blueprintBuilder)}`);
    }
    await page.selectOption('#bankGenGrade', '12');
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
    if (!generated.call || !generated.visible || !generated.text.includes('12 câu')) throw new Error(`Generated-exam flow failed: ${JSON.stringify(generated)}`);
    const generatedSpec = generated.call.args.p_spec;
    if (generatedSpec.class_id !== 'class-1' || generatedSpec.blueprint[0].count !== 12 || generatedSpec.blueprint[0].grade !== 12 || generatedSpec.blueprint[0].question_type !== 'multiple_choice' || generatedSpec.blueprint[0].difficulty !== 'TH') {
      throw new Error(`Generated-exam filters changed: ${JSON.stringify(generatedSpec)}`);
    }
    if (generatedSpec.filters.legacy_prefix !== null || generatedSpec.filters.taxonomy_codes.length || 'taxonomy_prefix' in generatedSpec.blueprint[0]) throw new Error('Teacher generation submitted hidden taxonomy controls');
    if (/(raw_tex|answer|solution|source_path)/i.test(JSON.stringify(generatedSpec))) throw new Error('Teacher generation leaked protected bank fields');

    await page.evaluate(async () => window.VMExamAdmin.bankLoadSourceCatalog({ preventDefault() {} }));
    const sourceCatalog = await page.evaluate(() => ({
      text: document.getElementById('bankSourceResults').textContent,
      buttons: document.querySelectorAll('[data-source-exam-id]').length,
      call: window.__bankRpcCalls.find((entry) => entry.name === 'vm_bank_source_exam_catalog'),
    }));
    if (!sourceCatalog.call || sourceCatalog.buttons !== 2 || !sourceCatalog.text.includes('Đồng Nai') || sourceCatalog.text.includes('MUST_NOT_RENDER')) {
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
