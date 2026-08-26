const fs = require('fs');
const { chromium } = require('playwright');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const asyncStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(asyncStart, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const source = fs.readFileSync('js/student-results.js', 'utf8');
  const names = ['safeUrl','filesOf','titleFor','isImage','isPdf','fileLink','driveFileId','filePreviewUrl','fileFallbackUrl','fileCards','loadClassAnswerHtml'];
  const functions = names.map((name) => extractFunction(source, name)).join('\n');
  const browser = await chromium.launch({ executablePath, headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:1100,height:760} });
    await page.setContent('<!doctype html><meta charset="utf-8"><main id="out"></main>');
    await page.addScriptTag({ content:`
      var mediaGroups={},mediaSequence=0,resultObjectUrls=[],calls=[];
      function esc(value){var node=document.createElement('span');node.textContent=String(value==null?'':value);return node.innerHTML}
      function classOf(){return null}
      function labelFor(){return 'Bài tập về nhà'}
      async function vmGoiHamFormData(name,form){
        calls.push({action:form.get('kind'),lesson:form.get('lesson_id')});
        return {answer:{lesson_id:'lesson-6',tex_content:'Đáp án bài 6',files:[{id:'answer-1',name:'Đáp án 1.png',mime_type:'image/png'}]}};
      }
      async function vmGoiHamFormDataBlob(name,form){
        calls.push({action:form.get('kind'),lesson:form.get('lesson_id'),file:form.get('file_id')});
        return new Blob(['image'],{type:'image/png'});
      }
      function latexTaiLieuRaHTML(value){return '<div data-tex>'+value+'</div>'}
      ${functions}
    ` });
    const state = await page.evaluate(async () => {
      const driveHtml = fileCards([{id:'drive-image',name:'Bài đã chấm.png',link:'https://drive.google.com/file/d/drive-image/view',mime_type:'image/png'}], 'Bài đã chấm');
      const answerHtml = await loadClassAnswerHtml({lesson_id:'lesson-6',kind:'homework',lessons:{title:'Buổi 6'}});
      document.getElementById('out').innerHTML = driveHtml + answerHtml;
      return {
        driveSrc:document.querySelector('.student-result-file img').src,
        answerText:document.getElementById('out').textContent,
        calls,
        groupSizes:Object.values(mediaGroups).map((group) => group.items.length)
      };
    });
    if (!state.driveSrc.includes('drive.google.com/thumbnail?id=drive-image')) throw new Error(`Drive image is not normalized: ${state.driveSrc}`);
    if (!state.answerText.includes('Đáp án chung của bài giảng') || !state.answerText.includes('Đáp án bài 6')) throw new Error(`Lesson answer is missing: ${state.answerText}`);
    if (state.calls.some((call) => call.lesson !== 'lesson-6') || !state.calls.some((call) => call.action === 'class_answer_file' && call.file === 'answer-1')) throw new Error(`Answer requests are not lesson-bound: ${JSON.stringify(state.calls)}`);
    if (!state.groupSizes.includes(1)) throw new Error(`Answer gallery was not created: ${JSON.stringify(state.groupSizes)}`);

    const mismatch = await page.evaluate(async () => {
      vmGoiHamFormData = async () => ({answer:{lesson_id:'lesson-other',files:[]}});
      return loadClassAnswerHtml({lesson_id:'lesson-6',kind:'homework',lessons:{title:'Buổi 6'}});
    });
    if (!mismatch.includes('Chưa tải được đáp án chung')) throw new Error('A mismatched lesson answer was not rejected');
    console.log('PASS student results Drive media and lesson-bound common answer');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
