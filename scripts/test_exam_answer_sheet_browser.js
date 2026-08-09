const fs = require('fs');
const { chromium } = require('playwright');

function between(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing exam answer section: ${from} -> ${to}`);
  return source.slice(start, end);
}

(async () => {
  const source = fs.readFileSync('luyen-de.html', 'utf8');
  const css = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const answers = between(source, '// Thang điểm 2025:', 'async function nopBaiExam');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>:root{--surface:#fff;--surface-2:#f7f4ef;--bg:#fff;--line:#ddd;--line-2:#bbb;--accent:#c77b00;--accent-soft:#fff3d8;--ink:#171717;--ink-3:#666;--ok:#16865a;--ok-soft:#eaf8f1;--err:#c43b45;--err-soft:#fff0f1;--r-sm:10px}${css}</style><main id="wkQuestions"></main><nav id="wkNavQuestions"></nav>`);
    await page.addScriptTag({ content: `
      window.$ = function(id){ return document.getElementById(id); };
      window.latexRaHTML = function(value){ return String(value || ''); };
      window.renderToanTrong = function(){};
      window.selectedAnswers = {};
      window.timerInterval = 1;
      window.currentAttempt = { id:null, is_practice:true, attempt_answers:[] };
      window.examQuestions = [
        { id:'tf-1', content_latex:'Mệnh đề', choices:[
          {key:'a',latex:'Ý thứ nhất',correct:true},{key:'b',latex:'Ý thứ hai',correct:false},{key:'c',latex:'Ý thứ ba',correct:true},{key:'d',latex:'Ý thứ tư',correct:false}
        ]},
        { id:'short-1', content_latex:'Tính giá trị', choices:[{key:'short',latex:'3,6',correct:true}] }
      ];
      ${answers}
    ` });

    await page.evaluate(() => renderExamQuestions(false));
    let state = await page.evaluate(() => ({
      tfLabels: Array.from(document.querySelectorAll('.tf-statement-key')).map((el) => el.textContent),
      cells: document.querySelectorAll('#qBox-short-1 .short-answer-cell').length,
    }));
    if (JSON.stringify(state.tfLabels) !== JSON.stringify(['a)', 'b)', 'c)', 'd)'])) throw new Error(`True/false labels are not lowercase: ${JSON.stringify(state)}`);
    if (state.cells !== 4) throw new Error(`Short answer sheet must have four character cells: ${JSON.stringify(state)}`);

    const cells = page.locator('#qBox-short-1 .short-answer-cell');
    await cells.nth(0).fill('3');
    await cells.nth(1).fill('.');
    await cells.nth(2).fill('6');
    await page.waitForFunction(() => selectedAnswers['short-1'] === '3,6');
    state = await page.evaluate(() => ({
      value: selectedAnswers['short-1'],
      cellValues: Array.from(document.querySelectorAll('#qBox-short-1 .short-answer-cell')).map((el) => el.value),
      correct: currentAttempt.attempt_answers.find((item) => item.question_id === 'short-1').is_correct,
    }));
    if (state.value !== '3,6' || state.cellValues.slice(0, 3).join('') !== '3,6' || !state.correct) throw new Error(`Short answer cells did not synchronize: ${JSON.stringify(state)}`);

    await page.evaluate(() => renderExamQuestions(true));
    state = await page.evaluate(() => ({
      correctSheet: document.querySelector('#qBox-short-1 .short-answer-sheet').classList.contains('correct'),
      disabled: Array.from(document.querySelectorAll('#qBox-short-1 .short-answer-cell')).every((el) => el.disabled),
    }));
    if (!state.correctSheet || !state.disabled) throw new Error(`Submitted short answer sheet state failed: ${JSON.stringify(state)}`);
    console.log('PASS lowercase true/false labels and four-cell short answer sheet');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
