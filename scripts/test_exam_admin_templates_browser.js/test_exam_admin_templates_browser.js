const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const reader = fs.readFileSync('js/latex-view.js', 'utf8');
  const admin = fs.readFileSync('js/exam-admin.js', 'utf8');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addScriptTag({ content: reader });
    await page.addScriptTag({ content: admin });
    const result = await page.evaluate(() => {
      const templates = VMExamAdmin._templates;
      function counts(key) {
        const parsed = parseLatexQuestions(templates[key].source);
        return parsed.reduce((acc, q) => {
          acc[VMExamAdmin._kindOf(q)] += 1;
          return acc;
        }, { mc: 0, tf: 0, short: 0 });
      }
      return { standard: counts('thpt-standard'), practice: counts('thpt-practice') };
    });
    for (const [name, counts] of Object.entries(result)) {
      if (!counts.mc || !counts.tf || !counts.short) throw new Error(`${name} template is not three-part: ${JSON.stringify(counts)}`);
    }
    console.log('PASS THPTQG templates parse into MC, TF and short-answer sections');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
