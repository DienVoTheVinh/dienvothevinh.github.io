'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html', 'utf8');
  const body = html.match(/<body>([\s\S]*?)<script/)[1];
  const source = fs.readFileSync('NganHang/DeOnTheoChuong Toan 11/THPT/Dethamkhao26.tex', 'utf8');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`);
    await page.addScriptTag({ path: 'js/latex-view.js' });
    await page.addScriptTag({ path: 'js/exam-admin.js' });
    const result = await page.evaluate((tex) => {
      document.getElementById('exTitle').value = 'Dethamkhao26';
      document.getElementById('exType').value = 'thpt';
      document.getElementById('exLatex').value = tex;
      window.VMExamAdmin.renderPreview(true);
      const preview = document.getElementById('htmlPreview');
      const sections = Array.from(preview.querySelectorAll('.exam-section-heading')).map((heading) => ({
        title: heading.textContent.trim(),
        questions: (() => {
          const rows = [];
          let node = heading.nextElementSibling;
          while (node && !node.classList.contains('exam-section-heading')) {
            if (node.classList.contains('exam-question')) rows.push({
              kind: node.dataset.kind,
              number: node.querySelector('.exam-question-no').textContent.trim()
            });
            node = node.nextElementSibling;
          }
          return rows;
        })()
      }));
      return {
        status: document.getElementById('previewStatus').textContent.trim(),
        sections,
        rawShortansVisible: /\\shortans/.test(preview.textContent)
      };
    }, source);
    const expected = [
      { marker: 'Phần I.', kind: 'mc', count: 12 },
      { marker: 'Phần II.', kind: 'tf', count: 4 },
      { marker: 'Phần III.', kind: 'short', count: 6 }
    ];
    if (result.status !== '12 TN · 4 Đ/S · 6 TLN') throw new Error(`Wrong THPT counts: ${JSON.stringify(result)}`);
    if (result.sections.length !== 3) throw new Error(`Missing THPT section headings: ${JSON.stringify(result.sections)}`);
    expected.forEach((section, index) => {
      const actual = result.sections[index];
      if (!actual.title.startsWith(section.marker) || actual.questions.length !== section.count ||
          actual.questions.some((question) => question.kind !== section.kind) ||
          actual.questions[0].number !== 'Câu 1.') {
        throw new Error(`Wrong section ${section.marker}: ${JSON.stringify(actual)}`);
      }
    });
    if (result.rawShortansVisible) throw new Error('Raw shortans command leaked into HTML preview');
    console.log('PASS Dethamkhao26 renders in canonical 12 MC / 4 TF / 6 short-answer sections');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
