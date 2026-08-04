const fs = require('fs');
const { chromium } = require('playwright');

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
    </style><main class="wrap">${controls}${sheet.replace('class="report-sheet"', 'class="report-sheet exporting"')}</main>`);

    await page.evaluate(() => {
      const values = ['100%', '100%', '50%', '75%', '17.4h', '8.5'];
      const details = ['8/8 buổi có mặt', '6/6 bài bắt buộc', '3/6 bài đúng hạn', '12/16 bài đã mở', '12.4h web · 5.0h tập trung', '8 lượt có điểm'];
      document.querySelectorAll('.metric .value').forEach((el, index) => { el.textContent = values[index]; });
      document.querySelectorAll('.metric .detail').forEach((el, index) => { el.textContent = details[index]; });
    });

    const exportLayout = await page.evaluate(() => {
      const card = document.querySelector('.report-sheet.exporting');
      return {
        width: Math.round(card.getBoundingClientRect().width),
        metrics: [...document.querySelectorAll('.metric')].map((metric) => {
          const detail = metric.querySelector('.detail').getBoundingClientRect();
          const bar = metric.querySelector('.metric-bar').getBoundingClientRect();
          const box = metric.getBoundingClientRect();
          return { top: Math.round(box.top), detailBottom: detail.bottom, barTop: bar.top };
        }),
      };
    });
    if (exportLayout.width !== 1120) throw new Error(`Export width drifted to ${exportLayout.width}px`);
    if (new Set(exportLayout.metrics.map((metric) => metric.top)).size !== 1) throw new Error('Export metrics are not aligned in one row');
    if (exportLayout.metrics.some((metric) => metric.detailBottom > metric.barTop)) throw new Error('Metric detail overlaps its progress bar');

    await page.evaluate(() => { document.querySelector('.report-sheet.exporting').style.display = 'none'; });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => {
      const controls = document.querySelector('.report-controls').getBoundingClientRect();
      const picker = document.querySelector('#reportPeriodPicker').getBoundingClientRect();
      return { bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, controls, picker };
    });
    if (mobileLayout.bodyOverflow) throw new Error('Historical period controls overflow the mobile viewport');
    if (mobileLayout.picker.right > mobileLayout.controls.right + 1 || mobileLayout.picker.left < mobileLayout.controls.left - 1) {
      throw new Error('Historical period picker escapes its mobile control card');
    }

    console.log('PASS teacher student report browser layout checks');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
