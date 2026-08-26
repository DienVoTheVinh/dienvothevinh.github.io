'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const FULL_MATRIX = {
  question_count: 23055,
  items: [
    { question_type: 'multiple_choice', difficulty: 'NB', count: 12000 },
    { question_type: 'multiple_choice', difficulty: 'TH', count: 7000 },
    { question_type: 'true_false', difficulty: 'VD', count: 3000 },
    { question_type: 'short_answer', difficulty: 'VDC', count: 1055 }
  ]
};

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to Chrome');
  }

  const html = fs.readFileSync('quan-tri-de.html', 'utf8');
  const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
  if (!bodyMatch) throw new Error('Could not isolate the exam-admin body');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await page.route('http://vinhmath.test/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${bodyMatch[1]}</body></html>`
    }));
    await page.goto('http://vinhmath.test/quan-tri-de?tab=bank#bank-manage');
    await page.addScriptTag({ path: 'js/exam-admin.js' });

    await page.evaluate(() => {
      const bank = window.VMExamAdmin._bankState;
      bank.access = { canUse: true, canAdmin: true };
      window.__matrixRpcCalls = [];
      window.__matrixDeferred = [];
      window.__matrixMode = 'deferred';
      window.__matrixResponses = [];
      window.sb = {
        rpc(name, args) {
          window.__matrixRpcCalls.push({ name, args });
          if (name !== 'vm_bank_matrix') {
            return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `unexpected RPC ${name}` } });
          }
          if (window.__matrixMode === 'queued') {
            const response = window.__matrixResponses.shift();
            if (!response) throw new Error('Missing queued matrix response');
            return Promise.resolve(response);
          }
          return new Promise((resolve) => {
            window.__matrixDeferred.push({ resolve, args });
          });
        }
      };
    });

    // A pending refresh must immediately replace any old/zero badge with an explicit loading state.
    await page.evaluate(() => {
      window.__matrixPending = window.VMExamAdmin._bankLoadMatrix({ status: 'active' }, true);
    });
    const loading = await page.evaluate(() => ({
      count: document.getElementById('bankMatrixCount').textContent,
      note: document.getElementById('bankMatrixNote').textContent,
      busy: document.getElementById('bankMatrixCard').getAttribute('aria-busy'),
      retryHidden: document.getElementById('bankMatrixRetry').hidden,
      deferred: window.__matrixDeferred.length
    }));
    if (loading.count !== 'Đang tải…' || loading.count.includes('0 câu') || loading.busy !== 'true' || !loading.retryHidden || loading.deferred !== 1) {
      throw new Error(`Matrix loading state flashed a false zero: ${JSON.stringify(loading)}`);
    }
    await page.evaluate((payload) => {
      window.__matrixDeferred.shift().resolve({ data: payload, error: null });
    }, FULL_MATRIX);
    await page.evaluate(() => window.__matrixPending);

    const loaded = await page.evaluate(() => ({
      count: document.getElementById('bankMatrixCount').textContent,
      busy: document.getElementById('bankMatrixCard').getAttribute('aria-busy'),
      footer: document.getElementById('bankMatrixTotalRow').textContent,
      retryHidden: document.getElementById('bankMatrixRetry').hidden
    }));
    if (loaded.count !== '23.055 câu' || loaded.busy !== 'false' || !loaded.footer.includes('23055') || !loaded.retryHidden) {
      throw new Error(`Full matrix did not render after loading: ${JSON.stringify(loaded)}`);
    }

    // Reset clears search filters, but it must reload the active/full matrix instead of rendering zero.
    await page.evaluate((payload) => {
      window.__matrixMode = 'queued';
      window.__matrixResponses = [{ data: payload, error: null }];
      window.__matrixRpcCalls = [];
      document.getElementById('bankSearchQuery').value = 'hàm số';
      document.getElementById('bankSearchGrade').value = '12';
      document.getElementById('bankSearchType').value = 'multiple_choice';
      window.VMExamAdmin.bankResetSearchFilters();
    }, FULL_MATRIX);
    await page.waitForFunction(() => document.getElementById('bankMatrixCount').textContent === '23.055 câu');
    const reset = await page.evaluate(() => ({
      query: document.getElementById('bankSearchQuery').value,
      grade: document.getElementById('bankSearchGrade').value,
      type: document.getElementById('bankSearchType').value,
      count: document.getElementById('bankMatrixCount').textContent,
      calls: window.__matrixRpcCalls
    }));
    const resetCall = reset.calls[0] || {};
    if (reset.query || reset.grade || reset.type || reset.count !== '23.055 câu' || reset.calls.length !== 1 || resetCall.name !== 'vm_bank_matrix' || JSON.stringify(resetCall.args) !== JSON.stringify({ p_filters: { status: 'active' } })) {
      throw new Error(`Reset did not reload the full active matrix: ${JSON.stringify(reset)}`);
    }

    // A failed load exposes an actionable retry; retry uses the same filters and recovers.
    const recovery = await page.evaluate(async (payload) => {
      window.__matrixMode = 'queued';
      window.__matrixResponses = [
        { data: null, error: { code: '57014', message: 'statement timeout' } },
        { data: payload, error: null }
      ];
      window.__matrixRpcCalls = [];
      const first = await window.VMExamAdmin._bankLoadMatrix({ status: 'active', grade: 12 }, true);
      const failed = {
        result: first,
        count: document.getElementById('bankMatrixCount').textContent,
        note: document.getElementById('bankMatrixNote').textContent,
        busy: document.getElementById('bankMatrixCard').getAttribute('aria-busy'),
        retryHidden: document.getElementById('bankMatrixRetry').hidden
      };
      const retried = await window.VMExamAdmin.bankRetryMatrix();
      return {
        failed,
        retried,
        count: document.getElementById('bankMatrixCount').textContent,
        retryHidden: document.getElementById('bankMatrixRetry').hidden,
        calls: window.__matrixRpcCalls
      };
    }, FULL_MATRIX);
    if (recovery.failed.result !== false || recovery.failed.count !== 'Chưa tải' || !recovery.failed.note.includes('Dữ liệu kho không bị mất') || recovery.failed.busy !== 'false' || recovery.failed.retryHidden || recovery.retried !== true || recovery.count !== '23.055 câu' || !recovery.retryHidden || recovery.calls.length !== 2 || recovery.calls.some((call) => JSON.stringify(call.args) !== JSON.stringify({ p_filters: { status: 'active', grade: 12 } }))) {
      throw new Error(`Matrix failure/retry contract failed: ${JSON.stringify(recovery)}`);
    }

    // The latest request owns the UI even if an older, slower response arrives last.
    await page.evaluate(() => {
      window.__matrixMode = 'deferred';
      window.__matrixDeferred = [];
      window.__matrixRpcCalls = [];
      window.__olderMatrix = window.VMExamAdmin._bankLoadMatrix({ status: 'active' }, true);
      window.__newerMatrix = window.VMExamAdmin._bankLoadMatrix({ status: 'active', grade: 12 }, true);
    });
    await page.waitForFunction(() => window.__matrixDeferred.length === 2);
    await page.evaluate(() => {
      window.__matrixDeferred[1].resolve({
        data: {
          question_count: 7,
          items: [{ question_type: 'short_answer', difficulty: 'VD', count: 7 }]
        },
        error: null
      });
    });
    await page.evaluate(() => window.__newerMatrix);
    const afterNewer = await page.evaluate(() => document.getElementById('bankMatrixCount').textContent);
    if (afterNewer !== '7 câu') throw new Error(`Newer matrix response did not render: ${afterNewer}`);

    await page.evaluate((payload) => {
      window.__matrixDeferred[0].resolve({ data: payload, error: null });
    }, FULL_MATRIX);
    await page.evaluate(() => window.__olderMatrix);
    const race = await page.evaluate(() => ({
      count: document.getElementById('bankMatrixCount').textContent,
      footer: document.getElementById('bankMatrixTotalRow').textContent,
      filters: window.VMExamAdmin._bankState.matrixFilters,
      calls: window.__matrixRpcCalls
    }));
    if (race.count !== '7 câu' || !race.footer.includes('7') || race.footer.includes('23055') || JSON.stringify(race.filters) !== JSON.stringify({ status: 'active', grade: 12 }) || race.calls.length !== 2) {
      throw new Error(`Stale matrix response overwrote the latest result: ${JSON.stringify(race)}`);
    }

    console.log('PASS question-bank matrix loading, reset, retry and stale-response resilience');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
