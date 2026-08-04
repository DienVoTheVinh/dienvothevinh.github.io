const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function extractPopupManager(source) {
  const marker = source.indexOf('/* ---------- POPUP THEO');
  const start = source.indexOf('(function () {', marker);
  const end = source.indexOf('/* ----------', start + 20);
  if (marker < 0 || start < 0 || end < 0) throw new Error('Shared popup manager is missing');
  return source.slice(start, end);
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const sharedCss = fs.readFileSync(path.join(root, 'css/vinhmath.css'), 'utf8');
  const sharedJs = fs.readFileSync(path.join(root, 'js/vinhmath.js'), 'utf8');
  const popupManager = extractPopupManager(sharedJs);

  const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  let modalCount = 0;
  const modalPages = [];
  const pagesWithoutManager = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const tags = html.match(/<[^>]+class="[^"]+"[^>]*>/gi) || [];
    const pageModals = tags.filter((tag) => {
      const match = tag.match(/class="([^"]+)"/i);
      const classes = match ? match[1].trim().split(/\s+/) : [];
      return classes.includes('modal') || classes.includes('inline-modal');
    }).length;
    modalCount += pageModals;
    if (pageModals) modalPages.push({ file, html, count: pageModals });
    if (pageModals && !html.includes('js/vinhmath.js')) pagesWithoutManager.push(file);
  }
  if (modalCount < 20) throw new Error(`Popup scan unexpectedly found only ${modalCount} modal overlays`);
  if (pagesWithoutManager.length) throw new Error(`Modal pages missing shared popup manager: ${pagesWithoutManager.join(', ')}`);

  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    let renderedModalCount = 0;
    const renderFailures = [];
    for (const modalPage of modalPages) {
      const scanPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        const markup = modalPage.html
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
        await scanPage.setContent(markup, { waitUntil: 'domcontentloaded' });
        await scanPage.addStyleTag({ content: sharedCss });
        await scanPage.evaluate((manager) => { (0, eval)(manager); }, popupManager);
        const results = await scanPage.evaluate(async () => {
          const overlays = Array.from(document.querySelectorAll('.modal,.inline-modal')).filter((element) => {
            const classes = Array.from(element.classList);
            return classes.includes('modal') || classes.includes('inline-modal');
          });
          overlays.forEach((element) => { element.style.display = 'none'; });
          const rows = [];
          for (const overlay of overlays) {
            overlay.style.display = 'flex';
            window.vmCanhPopup(overlay);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const content = overlay.querySelector('[data-vm-popup-content],.modal-content,.lb-modal,.sam-inner') || overlay.firstElementChild;
            const rect = content ? content.getBoundingClientRect() : null;
            rows.push({
              id: overlay.id || '(không có id)',
              mode: overlay.getAttribute('data-vm-popup-position') || 'native-default',
              visible: !!(rect && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0),
            });
            overlay.style.display = 'none';
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          return rows;
        });
        renderedModalCount += results.length;
        for (const result of results) {
          if (!result.visible || result.mode === 'click') renderFailures.push(`${modalPage.file}#${result.id}`);
        }
      } finally {
        await scanPage.close();
      }
    }
    if (renderedModalCount !== modalCount) {
      throw new Error(`Rendered ${renderedModalCount}/${modalCount} discovered modal overlays`);
    }
    if (renderFailures.length) throw new Error(`Modal overlays outside the viewport: ${renderFailures.join(', ')}`);

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>:root{--bg:#fff;--line:#ddd;--shadow:none}${sharedCss}
        .modal{display:none;position:fixed;inset:0;align-items:flex-start;justify-content:center;padding:24px;background:rgba(0,0,0,.55)}
        .modal-content{position:relative;width:100%;max-width:340px;max-height:760px;overflow:auto;margin:0 auto;padding:18px;background:#fff}
        input,button{min-height:44px}
      </style>
      <button id="trigger">Mở trình soạn</button>
      <div class="modal" id="modalForm" style="z-index:10000">
        <div class="modal-content"><input id="outerInput"><button id="topicGear">Quản lý chuyên đề</button></div>
      </div>
      <div class="modal" id="modalChuyenDe" style="z-index:10">
        <div class="modal-content"><input id="topicName"><div style="height:900px"></div></div>
      </div>
      <div id="explicitClickPopup" data-vm-popup-position="click" style="display:none;position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.4)">
        <div class="modal-content" id="clickContent" style="width:220px;height:120px"><button>Popup nhỏ</button></div>
      </div>`);
    await page.evaluate((manager) => { (0, eval)(manager); }, popupManager);

    await page.click('#trigger');
    await page.evaluate(() => {
      const modal = document.getElementById('modalForm');
      modal.style.display = 'flex';
      window.vmCanhPopup(modal);
    });
    await page.waitForTimeout(60);
    await page.click('#topicGear');
    await page.evaluate(() => {
      const modal = document.getElementById('modalChuyenDe');
      modal.style.display = 'flex';
      window.vmCanhPopup(modal);
    });
    await page.waitForTimeout(60);

    const nested = await page.evaluate(() => {
      const outer = document.getElementById('modalForm');
      const inner = document.getElementById('modalChuyenDe');
      const outerContent = outer.querySelector('.modal-content');
      const innerContent = inner.querySelector('.modal-content');
      const input = document.getElementById('topicName');
      const rect = innerContent.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const hit = document.elementFromPoint(inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2);
      return {
        outerNative: getComputedStyle(outerContent).position === 'relative' && outerContent.style.left === '' && outerContent.style.top === '',
        innerNative: getComputedStyle(innerContent).position === 'relative' && innerContent.style.left === '' && innerContent.style.top === '',
        innerVisible: rect.top >= 0 && rect.top < innerHeight && rect.bottom > 0,
        innerReceivesTouch: hit === input,
        stackOrder: Number(getComputedStyle(inner).zIndex) > Number(getComputedStyle(outer).zIndex),
        parentIsUnderlay: outer.classList.contains('vm-popup-underlay') && getComputedStyle(outer).pointerEvents === 'none' && getComputedStyle(outer).backgroundColor === 'rgba(0, 0, 0, 0)',
        childIsInteractive: !inner.classList.contains('vm-popup-underlay') && getComputedStyle(inner).pointerEvents !== 'none',
        nestedScrollLock: document.documentElement.classList.contains('vm-popup-open'),
      };
    });
    for (const [name, passed] of Object.entries(nested)) if (!passed) throw new Error(`Nested popup failed: ${name}`);

    await page.evaluate(() => { document.getElementById('modalChuyenDe').style.display = 'none'; });
    await page.waitForTimeout(60);
    const afterNestedClose = await page.evaluate(() => {
      const input = document.getElementById('outerInput');
      const rect = input.getBoundingClientRect();
      return {
        outerReceivesTouch: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === input,
        parentRestored: !document.getElementById('modalForm').classList.contains('vm-popup-underlay') && getComputedStyle(document.getElementById('modalForm')).pointerEvents !== 'none',
        parentKeepsScrollLock: document.documentElement.classList.contains('vm-popup-open'),
      };
    });
    for (const [name, passed] of Object.entries(afterNestedClose)) if (!passed) throw new Error(`Nested popup close failed: ${name}`);

    await page.mouse.click(350, 760);
    await page.evaluate(() => {
      const popup = document.getElementById('explicitClickPopup');
      popup.style.display = 'block';
      window.vmCanhPopup(popup);
    });
    await page.waitForTimeout(60);
    const clickOptIn = await page.evaluate(() => {
      const content = document.getElementById('clickContent');
      const rect = content.getBoundingClientRect();
      return getComputedStyle(content).position === 'fixed' && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    });
    if (!clickOptIn) throw new Error('Explicit click-positioned popup no longer works');

    await page.evaluate(() => {
      document.getElementById('explicitClickPopup').style.display = 'none';
      document.getElementById('modalForm').style.display = 'none';
    });
    await page.waitForTimeout(60);
    const unlocked = await page.evaluate(() => !document.documentElement.classList.contains('vm-popup-open'));
    if (!unlocked) throw new Error('Popup scroll lock remained after every overlay closed');

    console.log(`PASS shared popup system: ${modalCount} modal overlays rendered across ${modalPages.length} pages; ${htmlFiles.length} pages scanned`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
