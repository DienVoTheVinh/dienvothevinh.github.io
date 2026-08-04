const fs = require('fs');
const { chromium } = require('playwright');

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
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
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

(async () => {
  const source = fs.readFileSync('quan-tri-bao-cao-hoc-sinh.html', 'utf8');
  const style = source.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
  const sheet = source.match(/<article class="report-sheet"[\s\S]*?<\/article>/i)?.[0];
  const controls = source.match(/<section class="card report-controls"[\s\S]*?<\/section>/i)?.[0];
  if (!style || !sheet || !controls) throw new Error('Report fixture markup is incomplete');

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to an installed Chromium browser');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      :root{--surface:#fff;--surface-2:#f7f5f1;--line:#e7ddce;--ink:#171717;--ink-2:#4b5563;--ink-3:#667085;--accent:#e99a00;--accent-soft:#fff1cf}
      *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.card{background:#fff;border:1px solid var(--line);border-radius:14px}.input{min-height:42px;border:1px solid var(--line);border-radius:9px;padding:0 10px}.wrap{width:100%}
      ${style}
    </style><main class="wrap">${controls}${sheet.replace('class="report-sheet"', 'class="report-sheet exporting"')}<span id="exportStatus"></span></main>`);

    const editorFunctions = ['bcDateKey', 'bcNormalizeInsightItems', 'bcNormalizeInsight', 'bcSameInsight', 'bcInsightHtml', 'bcRenderInsights', 'bcSetInsightEditor', 'bcReadInsightEditor', 'bcSetInsightStatus', 'luuNhanDinhBaoCao']
      .map((name) => extractFunction(source, name)).join('\n');
    await page.addScriptTag({ content: `
      function $(id){return document.getElementById(id);}
      function bcEsc(value){return String(value == null ? '' : value);}
      var reportMe=null,reportStudent=null,reportPeriodType='month',reportResult=null,reportSystemInsight=null,reportActiveInsight=null,reportSavedInsight=null,reportInsightDirty=false,reportInsightLoadError='';
      ${editorFunctions}
    ` });

    const saveFlow = await page.evaluate(async () => {
      const classSelect = document.querySelector('#reportClass');
      classSelect.innerHTML = '<option value="class-1">Toán 7 - Q5</option>';
      reportMe = { id: 'teacher-1', role: 'teacher' };
      reportStudent = { id: 'student-1', full_name: 'Nguyễn Lan Trí' };
      reportResult = { start: new Date('2026-07-01T00:00:00+07:00'), end: new Date('2026-07-31T23:59:59.999+07:00') };
      reportActiveInsight = { strengths: ['Gợi ý cũ'], limitations: ['Hạn chế cũ'], improvements: ['Cải thiện cũ'] };
      document.querySelector('#editStrengths').value = 'Có tiến bộ rõ\nNộp bài đều';
      document.querySelector('#editLimitations').value = 'Cần chuyên cần hơn';
      document.querySelector('#editImprovements').value = 'Ôn bài 20 phút mỗi ngày';
      document.querySelector('#insightEditor').hidden = false;
      let captured = null;
      sb = { from(table) { return { upsert(row, options) { captured = { table, row, options }; return { select() { return { async single() { return { data: { ...row, updated_at: '2026-08-05T10:00:00Z' }, error: null }; } }; } }; } }; } };
      await luuNhanDinhBaoCao();
      return {
        captured,
        strengths: [...document.querySelectorAll('#reportStrengths li')].map((item) => item.textContent),
        limitations: [...document.querySelectorAll('#reportLimitations li')].map((item) => item.textContent),
        improvements: [...document.querySelectorAll('#reportImprovements li')].map((item) => item.textContent),
        editorHidden: document.querySelector('#insightEditor').hidden,
        exportStatus: document.querySelector('#exportStatus').textContent,
      };
    });
    if (saveFlow.captured.table !== 'teacher_report_insights') throw new Error('Teacher insight save uses the wrong table');
    if (saveFlow.captured.row.student_id !== 'student-1' || saveFlow.captured.row.class_id !== 'class-1' || saveFlow.captured.row.period_start !== '2026-07-01' || saveFlow.captured.row.period_end !== '2026-07-31') throw new Error(`Teacher insight save lost report scope: ${JSON.stringify(saveFlow.captured.row)}`);
    if (saveFlow.captured.options.onConflict !== 'student_id,class_id,period_type,period_start,period_end') throw new Error('Teacher insight save is not idempotent for one report period');
    if (saveFlow.strengths.join('|') !== 'Có tiến bộ rõ|Nộp bài đều' || saveFlow.limitations[0] !== 'Cần chuyên cần hơn' || saveFlow.improvements[0] !== 'Ôn bài 20 phút mỗi ngày') throw new Error(`Saved insights are not rendered into the report: ${JSON.stringify(saveFlow)}`);
    if (!saveFlow.editorHidden || !saveFlow.exportStatus.includes('Có thể tải ảnh')) throw new Error(`Successful save does not prepare the final image flow: ${JSON.stringify(saveFlow)}`);

    await page.evaluate(() => {
      const values = ['100%', '100%', '50%', '75%', '17.4h', '8.5'];
      const details = ['8/8 buổi có mặt', '6/6 bài bắt buộc', '3/6 bài đúng hạn', '12/16 bài đã mở', '12.4h web · 5.0h tập trung', '8 lượt có điểm'];
      document.querySelectorAll('.metric .value').forEach((el, index) => { el.textContent = values[index]; });
      document.querySelectorAll('.metric .detail').forEach((el, index) => { el.textContent = details[index]; });
      document.querySelector('#reportAvatar').textContent = 'HP';
    });

    const exportLayout = await page.evaluate(() => {
      const card = document.querySelector('.report-sheet.exporting');
      const avatar = document.querySelector('.student-avatar');
      const avatarBox = avatar.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(avatar);
      const textBox = textRange.getBoundingClientRect();
      return {
        width: Math.round(card.getBoundingClientRect().width),
        avatarCenterDelta: {
          x: Math.abs((avatarBox.left + avatarBox.width / 2) - (textBox.left + textBox.width / 2)),
          y: Math.abs((avatarBox.top + avatarBox.height / 2) - (textBox.top + textBox.height / 2)),
        },
        metrics: [...document.querySelectorAll('.metric')].map((metric) => {
          const detail = metric.querySelector('.detail').getBoundingClientRect();
          const bar = metric.querySelector('.metric-bar').getBoundingClientRect();
          const box = metric.getBoundingClientRect();
          return { top: Math.round(box.top), detailBottom: detail.bottom, barTop: bar.top };
        }),
        detailValueRights: [...document.querySelectorAll('.detail-row b')].map((item) => Math.round(item.getBoundingClientRect().right * 10) / 10),
      };
    });
    if (exportLayout.width !== 1120) throw new Error(`Export width drifted to ${exportLayout.width}px`);
    if (exportLayout.avatarCenterDelta.x > 1 || exportLayout.avatarCenterDelta.y > 1.5) throw new Error(`Student initials are not centered in export avatar: ${JSON.stringify(exportLayout.avatarCenterDelta)}`);
    if (new Set(exportLayout.metrics.map((metric) => metric.top)).size !== 1) throw new Error('Export metrics are not aligned in one row');
    if (exportLayout.metrics.some((metric) => metric.detailBottom > metric.barTop)) throw new Error('Metric detail overlaps its progress bar');
    if (Math.max(...exportLayout.detailValueRights) - Math.min(...exportLayout.detailValueRights) > 1) throw new Error(`Grouped detail values are not right-aligned: ${JSON.stringify(exportLayout.detailValueRights)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileExportLayout = await page.evaluate(() => {
      const card = document.querySelector('.report-sheet.exporting');
      const avatar = card.querySelector('.student-avatar').getBoundingClientRect();
      const title = getComputedStyle(card.querySelector('.student-id h2'));
      const lower = [...card.querySelectorAll('.report-lower > .report-panel')].map((panel) => panel.getBoundingClientRect());
      const metricTops = [...card.querySelectorAll('.metric')].map((metric) => Math.round(metric.getBoundingClientRect().top));
      return {
        width: Math.round(card.getBoundingClientRect().width),
        avatarWidth: Math.round(avatar.width),
        avatarHeight: Math.round(avatar.height),
        titleSize: parseFloat(title.fontSize),
        lowerSameRow: Math.abs(lower[0].top - lower[1].top) < 1,
        metricRows: new Set(metricTops).size,
      };
    });
    if (mobileExportLayout.width !== 1120 || mobileExportLayout.avatarWidth !== 58 || mobileExportLayout.avatarHeight !== 58) throw new Error(`Mobile viewport leaks into fixed export layout: ${JSON.stringify(mobileExportLayout)}`);
    if (mobileExportLayout.titleSize < 22 || !mobileExportLayout.lowerSameRow || mobileExportLayout.metricRows !== 1) throw new Error(`Export typography or grids changed under mobile media rules: ${JSON.stringify(mobileExportLayout)}`);

    await page.evaluate(() => { document.querySelector('.report-sheet.exporting').classList.remove('exporting'); });
    const mobileLayout = await page.evaluate(() => {
      const controls = document.querySelector('.report-controls').getBoundingClientRect();
      const picker = document.querySelector('#reportPeriodPicker').getBoundingClientRect();
      const report = document.querySelector('.report-sheet').getBoundingClientRect();
      const insightCards = [...document.querySelectorAll('.insight-card')].map((item) => item.getBoundingClientRect());
      const detailGroups = [...document.querySelectorAll('.detail-group')].map((item) => item.getBoundingClientRect());
      return { bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, controls, picker, report, insightCards, detailGroups };
    });
    if (mobileLayout.bodyOverflow) throw new Error('Historical period controls overflow the mobile viewport');
    if (mobileLayout.picker.right > mobileLayout.controls.right + 1 || mobileLayout.picker.left < mobileLayout.controls.left - 1) {
      throw new Error('Historical period picker escapes its mobile control card');
    }
    if (mobileLayout.report.right > 390 || mobileLayout.report.left < 0) throw new Error('Student report escapes the mobile viewport');
    if (mobileLayout.insightCards.some((item) => item.right > mobileLayout.report.right || item.left < mobileLayout.report.left)) throw new Error('Insight cards escape the mobile report');
    if (mobileLayout.detailGroups.length !== 3 || mobileLayout.detailGroups.some((item) => item.right > mobileLayout.report.right || item.left < mobileLayout.report.left)) throw new Error('Grouped report details are incomplete or escape the mobile report');

    const mobileEditor = await page.evaluate(() => {
      const editor = document.querySelector('#insightEditor');
      editor.hidden = false;
      document.querySelector('#editStrengths').value = 'Có tiến bộ\nNộp bài đều';
      const report = document.querySelector('.report-sheet').getBoundingClientRect();
      const editorBox = editor.getBoundingClientRect();
      const fields = [...editor.querySelectorAll('textarea')].map((item) => item.getBoundingClientRect());
      const buttons = [...editor.querySelectorAll('button')].map((item) => item.getBoundingClientRect());
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        editorInsideReport: editorBox.left >= report.left && editorBox.right <= report.right,
        fieldsInsideEditor: fields.every((item) => item.left >= editorBox.left && item.right <= editorBox.right),
        buttonWidths: buttons.map((item) => item.width),
      };
    });
    if (mobileEditor.bodyOverflow || !mobileEditor.editorInsideReport || !mobileEditor.fieldsInsideEditor) throw new Error(`Insight editor escapes mobile report: ${JSON.stringify(mobileEditor)}`);
    if (mobileEditor.buttonWidths.some((width) => width < 90)) throw new Error(`Insight editor actions are too cramped on mobile: ${JSON.stringify(mobileEditor.buttonWidths)}`);

    console.log('PASS teacher student report browser layout checks');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
