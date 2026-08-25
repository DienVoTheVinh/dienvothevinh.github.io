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
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js' });
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
      const caseRoot = document.createElement('div');
      const caseHtml = latexRaHTML(String.raw`Hệ bất phương trình $\begin{cases}x+y-3<0 \\ x-y+1>0\end{cases}$`);
      caseRoot.innerHTML = caseHtml;
      document.body.appendChild(caseRoot);
      renderToanTrong(caseRoot);
      const itemChoiceRoot = document.createElement('div');
      itemChoiceRoot.innerHTML = latexRaHTML(String.raw`\begin{itemchoice}\itemch Ý thứ nhất\itemch Ý thứ hai\end{itemchoice}`);
      const paragraphFixture = String.raw`\begin{ex}
\[\begin{cases}
x+y<3

x-y>1
\end{cases}\]
\loigiai{Dòng một.

Dòng hai.}
\end{ex}`;
      const normalized = VMExamAdmin._normalizeSolutionParagraphs(paragraphFixture);
      return {
        worksheet: counts('worksheet-mixed'),
        standard: counts('thpt-standard'),
        mcQuiz: counts('mc-quiz'),
        tf: counts('tf'),
        essay: {
          type: templates.essay.type,
          hasPrompt: !!templates.essay.essayPrompt,
        },
        casesRendered: !!caseRoot.querySelector('.katex-display .katex'),
        casesError: !!caseRoot.querySelector('.katex-error'),
        casesNested: /\$\s*\\\[|\\\]\s*\$/.test(caseHtml),
        itemChoiceRendered: itemChoiceRoot.querySelectorAll('li').length === 2,
        itemChoiceRaw: /itemchoice|itemch/.test(itemChoiceRoot.textContent),
        normalized,
      };
    });
    if (!result.worksheet.mc || !result.worksheet.short || result.worksheet.tf) throw new Error(`Worksheet template is not mixed: ${JSON.stringify(result.worksheet)}`);
    if (!result.standard.mc || !result.standard.tf || !result.standard.short) throw new Error(`THPTQG template is not three-part: ${JSON.stringify(result.standard)}`);
    if (result.mcQuiz.mc < 2 || result.mcQuiz.tf || result.mcQuiz.short) throw new Error(`MC template is not distinct: ${JSON.stringify(result.mcQuiz)}`);
    if (result.tf.tf < 2 || result.tf.mc || result.tf.short) throw new Error(`True/false template is not distinct: ${JSON.stringify(result.tf)}`);
    if (result.essay.type !== 'essay' || !result.essay.hasPrompt) throw new Error(`Essay template is incomplete: ${JSON.stringify(result.essay)}`);
    if (!result.casesRendered || result.casesError || result.casesNested) throw new Error('dollar-delimited cases environment did not render through real KaTeX');
    if (!result.itemChoiceRendered || result.itemChoiceRaw) throw new Error('itemchoice/itemch did not render as an HTML list');
    if (!/\\begin\{cases\}[\s\S]*\n\n[\s\S]*\\end\{cases\}/.test(result.normalized)) {
      throw new Error('PDF paragraph normalization mutated blank lines inside cases');
    }
    if (!/\\loigiai\{Dòng một\.\n\\par\nDòng hai\.\}/.test(result.normalized)) {
      throw new Error('PDF paragraph normalization did not protect blank lines inside loigiai');
    }
    console.log('PASS five distinct authoring templates, real KaTeX cases and PDF paragraph normalization');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
