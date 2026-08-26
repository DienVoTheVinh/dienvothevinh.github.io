'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const previewDraftId = '11111111-2222-4333-8444-555555555555';
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html', 'utf8');
  const body = html.match(/<body>([\s\S]*?)<script/)[1];
  const css = ['css/tokens.css', 'css/vinhmath.css', 'css/exam-admin.css']
    .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await page.route('http://vinhmath.test/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
    }));
    await page.goto('http://vinhmath.test/quan-tri-de?tab=bank#bank-create');
    await page.addScriptTag({ path: 'js/latex-view.js' });
    await page.addScriptTag({ path: 'js/question-bank.js' });
    await page.addScriptTag({ path: 'js/exam-admin.js' });

    await page.evaluate((previewDraftId) => {
      window.__draftRpcCalls = [];
      const previewItems = Array.from({ length: 3 }, (_, index) => ({
        question_type: 'multiple_choice',
        grade: 12,
        difficulty: 'TH',
        content_latex: `Câu xem trước ${index + 1}: Giá trị của $${index + 1}+1$ bằng`,
        choices: [{ latex: '0' }, { latex: String(index + 2) }, { latex: '5' }, { latex: '9' }],
        solution_latex: 'MUST_NOT_RENDER_DRAFT_SOLUTION'
      }));
      window.sb = { rpc: async (name, args) => {
        window.__draftRpcCalls.push({ name, args });
        if (name === 'vm_bank_preview_exam_draft') return { data: {
          preview_draft_id: previewDraftId,
          selection_token: '0123456789abcdef0123456789abcdef', title: args.p_spec.title,
          question_count: 3, requested_count: 3, seed: args.p_spec.seed,
          source_origins: args.p_spec.source_origins, warnings: [], questions: previewItems
        }, error: null };
        if (name === 'vm_bank_save_exam_draft') return { data: {
          exam_id: 'saved-exam-1', title: args.p_spec.title,
          question_count: 3, seed: args.p_spec.seed, warnings: []
        }, error: null };
        if (name === 'vm_bank_inventory') return { data: { summary: {}, items: [] }, error: null };
        if (name === 'vm_bank_category_summary') return { data: { items: [], origins: [] }, error: null };
        if (name === 'vm_bank_matrix') return { data: { question_count: 0, items: [] }, error: null };
        if (name === 'vm_bank_taxonomy_facets') return { data: { items: [] }, error: null };
        if (name === 'vm_bank_admin_stats') return { data: { active: 3, items: 3, documents: 1, quarantined: 0 }, error: null };
        if (name === 'vm_bank_admin_taxonomy_catalog') return { data: { items: [] }, error: null };
        if (name === 'vm_bank_source_exam_catalog') return { data: { total: 0, items: [] }, error: null };
        if (name === 'vm_bank_exam_catalog') return { data: { items: [] }, error: null };
        return { data: null, error: { code: 'PGRST202', message: `unexpected RPC ${name}` } };
      }};
      window.VMExamAdmin._bankConfigureAccess({ role: 'admin' });
      window.VMExamAdmin.bankSetView('create', { history: 'replace', scroll: false });
      document.getElementById('bankGenTitle').value = 'Chuyên đề xem trước';
      document.getElementById('bankGenCount').value = '3';
      document.querySelectorAll('input[name="bankGenerationSource"]').forEach((input) => {
        input.checked = input.value === 'topic_pack';
      });
      window.__draftRpcCalls = [];
    }, previewDraftId);

    const before = await page.evaluate(() => ({
      classValue: document.getElementById('bankGenClass').value,
      classRequired: document.getElementById('bankGenClass').required,
      submitHandler: document.getElementById('bankGenerateForm').getAttribute('onsubmit'),
      commitHidden: document.getElementById('bankDraftCommitPanel').hidden
    }));
    if (before.classValue || before.classRequired || !before.submitHandler.includes('bankPreviewExamDraft') || !before.commitHidden) {
      throw new Error(`Draft form still requires a class before preview: ${JSON.stringify(before)}`);
    }

    await page.evaluate(async () => window.VMExamAdmin.bankPreviewExamDraft({ preventDefault() {} }));
    const preview = await page.evaluate(() => ({
      calls: window.__draftRpcCalls.map((entry) => entry.name),
      draft: Boolean(window.VMExamAdmin._bankState.generationDraft),
      draftId: window.VMExamAdmin._bankState.generationDraft && window.VMExamAdmin._bankState.generationDraft.previewDraftId,
      commitHidden: document.getElementById('bankDraftCommitPanel').hidden,
      result: document.getElementById('bankGenerateResult').textContent,
      status: document.getElementById('bankGenerateStatus').textContent,
      previewOpen: document.getElementById('bankPreviewDialog').open || document.getElementById('bankPreviewDialog').hasAttribute('open'),
      questionCount: window.VMExamAdmin._bankState.preview.questions.length,
      leakedSolution: document.getElementById('bankPreviewHtml').textContent.includes('MUST_NOT_RENDER_DRAFT_SOLUTION'),
      publishDisabled: document.getElementById('bankGenPublished').disabled
    }));
    if (preview.calls.includes('vm_bank_save_exam_draft') || preview.calls.filter((name) => name === 'vm_bank_preview_exam_draft').length !== 1 || !preview.draft || preview.draftId !== previewDraftId || preview.commitHidden || !preview.result.includes('chưa lưu') || !preview.status.includes('chưa lưu') || !preview.previewOpen || preview.questionCount !== 3 || preview.leakedSolution || !preview.publishDisabled) {
      throw new Error(`Read-only preview flow failed: ${JSON.stringify(preview)}`);
    }

    await page.evaluate(async () => {
      window.VMExamAdmin.bankClosePreview();
      await window.VMExamAdmin.bankSaveExamDraft({ preventDefault() {} });
    });
    const saved = await page.evaluate(() => {
      const calls = window.__draftRpcCalls.filter((entry) => entry.name === 'vm_bank_save_exam_draft');
      return {
        count: calls.length,
        spec: calls[0] && calls[0].args.p_spec,
        draft: window.VMExamAdmin._bankState.generationDraft,
        commitHidden: document.getElementById('bankDraftCommitPanel').hidden,
        status: document.getElementById('bankGenerateStatus').textContent,
        result: document.getElementById('bankGenerateResult').textContent
      };
    });
    if (saved.count !== 1 || saved.spec.class_id !== null || saved.spec.portal_id !== null || saved.spec.published !== false || saved.spec.expected_selection_token !== '0123456789abcdef0123456789abcdef' || saved.spec.preview_draft_id !== previewDraftId || saved.draft !== null || !saved.commitHidden || saved.status !== 'Đã lưu' || !saved.result.includes('Đã tạo')) {
      throw new Error(`Explicit draft commit failed: ${JSON.stringify(saved)}`);
    }

    console.log('question-bank draft preview browser tests passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
