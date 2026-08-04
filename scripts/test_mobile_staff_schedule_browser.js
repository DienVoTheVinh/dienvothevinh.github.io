const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const home = fs.readFileSync('trang-chu.html', 'utf8');
  const styleMatch = home.match(/<style>([\s\S]*?)<\/style>/i);
  if (!styleMatch) throw new Error('Homepage inline styles are missing');

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to an installed Chromium browser');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--surface:#fff;--surface-solid:#fff;--line:#ddd;--accent:#d97706;--accent-soft:#fff4dd;--ink:#211;--ink-3:#655;--shadow:none;--r-lg:18px}${styleMatch[1]}</style>
      <main style="padding:12px">
        <section class="staff-schedules-card">
          <div class="staff-schedules-head"><h2>📅 Lịch dạy lớp sắp tới</h2><button id="btnDiemDanhBu">Điểm danh bù</button></div>
          <div class="staff-schedule-scroll"><table class="staff-schedule-table"><thead><tr><th>Lớp</th><th>Thứ</th><th>Giờ</th><th>Hình thức</th><th>Điểm danh</th></tr></thead><tbody>
            <tr class="staff-schedule-row"><td class="staff-schedule-cell staff-schedule-class"><b>Toán 9 - HL</b></td><td class="staff-schedule-cell staff-schedule-date">05/08/2026 (Thứ tư)</td><td class="staff-schedule-cell staff-schedule-time">14:00 – 15:30</td><td class="staff-schedule-cell staff-schedule-mode"><a class="btn">🎥 Dạy Meet</a></td><td class="staff-schedule-cell staff-schedule-actions"><button class="btn">📝 Điểm danh</button><button class="btn">🎁</button></td></tr>
          </tbody></table></div>
        </section>
      </main>`);

    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.staff-schedules-card');
      const row = document.querySelector('.staff-schedule-row');
      const mode = document.querySelector('.staff-schedule-mode');
      const actions = document.querySelector('.staff-schedule-actions');
      const cardRect = card.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const modeRect = mode.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      return {
        headingHidden: getComputedStyle(document.querySelector('thead')).display === 'none',
        rowGrid: getComputedStyle(row).display === 'grid',
        rowFits: rowRect.left >= cardRect.left && rowRect.right <= cardRect.right,
        fullWidthDetails: modeRect.width > rowRect.width * 0.85 && actionsRect.width > rowRect.width * 0.85,
        noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });

    if (!metrics.headingHidden || !metrics.rowGrid) throw new Error('Mobile schedule did not switch from table to cards');
    if (!metrics.rowFits || !metrics.fullWidthDetails) throw new Error('Schedule card content is clipped or cramped');
    if (!metrics.noPageOverflow) throw new Error('Mobile schedule causes horizontal page overflow');
    console.log('PASS mobile staff schedule card geometry');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
