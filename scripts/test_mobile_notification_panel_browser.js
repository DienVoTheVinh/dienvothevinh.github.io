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
    for (const width of [390, 591]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${css}</style>
      <div class="topbar"><div class="nav"><div class="bell-wrap" id="wrap">
        <button class="nav-bell" id="nutChuong">B</button>
        <div class="bell-panel" id="bangThongBao" style="display:none">
          <div class="bell-head"><b>Thông báo</b><button class="bell-readall">Đọc hết</button></div>
          <section class="vm-push-panel" id="vmPushPanel">
            <div class="vm-push-panel-title"><span>📲</span><div><b>Thông báo trên thiết bị</b><small>Bật để nhận thông báo kể cả khi ứng dụng đóng.</small></div><span class="vm-push-state" id="vmPushState"><span class="vm-push-dot"></span><span>Chưa bật</span></span></div>
            <div class="vm-push-actions"><button class="vm-push-primary">Bật thông báo nổi</button></div>
            <p class="vm-push-privacy">Thông tin quyền thông báo.</p>
          </section>
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
        const pushRect = panel.querySelector('#vmPushPanel').getBoundingClientRect();
        const stateRect = panel.querySelector('#vmPushState').getBoundingClientRect();
        const primaryRect = panel.querySelector('.vm-push-primary').getBoundingClientRect();
        return {
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        headerBottom: topbar.getBoundingClientRect().bottom,
        stateInsidePanel: panel.querySelector('#vmPushPanel #vmPushState') !== null,
        stateInsideHeader: panel.querySelector('.bell-head #vmPushState') !== null,
          privacyVisible: getComputedStyle(panel.querySelector('.vm-push-privacy')).display !== 'none',
          stateFits: stateRect.left >= pushRect.left && stateRect.right <= pushRect.right,
          stateCompact: stateRect.width < pushRect.width * 0.55 && stateRect.height < 40,
          primaryFits: primaryRect.left >= pushRect.left && primaryRect.right <= pushRect.right,
          pushRounded: parseFloat(getComputedStyle(panel.querySelector('#vmPushPanel')).borderRadius) >= 12,
        };
      });

      if (metrics.height < metrics.viewportHeight * 0.6) throw new Error(`${width}px: panel collapsed to ${metrics.height}px`);
      if (metrics.top < metrics.headerBottom) throw new Error(`${width}px: panel overlaps the mobile header`);
      if (metrics.bottom > metrics.viewportHeight + 1) throw new Error(`${width}px: panel escapes the mobile viewport`);
      if (!metrics.stateInsidePanel || metrics.stateInsideHeader) throw new Error(`${width}px: push state is not embedded in its device card`);
      if (!metrics.stateFits || !metrics.stateCompact || !metrics.primaryFits) throw new Error(`${width}px: device controls overflow or lose their compact shape`);
      if (!metrics.pushRounded) throw new Error(`${width}px: device settings card is not visually contained`);
      if (metrics.privacyVisible) throw new Error(`${width}px: secondary push privacy copy should stay hidden on mobile`);
      await page.close();
    }
    console.log('PASS mobile notification panel browser geometry');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
