const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const css = fs.readFileSync('css/vinhmath.css', 'utf8');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('VM_CHROME_PATH must point to an installed Chromium browser');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${css}</style>
      <div class="topbar"><div class="nav"><div class="bell-wrap" id="wrap">
        <button class="nav-bell" id="nutChuong">B</button>
        <div class="bell-panel" id="bangThongBao" style="display:none">
          <div class="bell-head"><b>Thông báo</b><button class="bell-readall">Đọc hết</button></div>
          <div class="bell-list"><div class="bell-item">Nội dung thông báo</div></div>
        </div>
      </div></div></div><main style="height:1200px">Trang quản trị</main>`);

    const metrics = await page.evaluate(() => {
      const panel = document.getElementById('bangThongBao');
      const topbar = document.querySelector('.topbar');
      document.body.appendChild(panel);
      panel.style.setProperty('--vm-bell-panel-top', Math.ceil(topbar.getBoundingClientRect().bottom + 6) + 'px');
      panel.style.display = 'flex';
      const rect = panel.getBoundingClientRect();
      return {
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        headerBottom: topbar.getBoundingClientRect().bottom,
      };
    });

    if (metrics.height < metrics.viewportHeight * 0.6) throw new Error(`Panel collapsed to ${metrics.height}px`);
    if (metrics.top < metrics.headerBottom) throw new Error('Panel overlaps the mobile header');
    if (metrics.bottom > metrics.viewportHeight + 1) throw new Error('Panel escapes the mobile viewport');
    console.log('PASS mobile notification panel browser geometry');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
