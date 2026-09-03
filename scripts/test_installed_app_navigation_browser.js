const fs = require('fs');
const { chromium } = require('playwright');

function between(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing installed-app navigation section: ${from} -> ${to}`);
  return source.slice(start, end);
}

(async () => {
  const shared = fs.readFileSync('js/vinhmath.js', 'utf8');
  const navigation = between(shared, '/* ---------- 0A.', '/* ---------- 1. CHẾ ĐỘ SÁNG');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://vinhmath.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<a id="internal" href="/luyen-de?exam_id=1" target="_blank">Làm đề</a><a id="external" href="https://meet.google.com/abc" target="_blank">Meet</a>',
    }));
    await page.goto('https://vinhmath.com/test-installed-navigation');
    await page.addScriptTag({ content: `
      window.matchMedia = function(query) {
        return { matches: query === '(display-mode: standalone)', media: query, addEventListener: function(){}, removeEventListener: function(){} };
      };
      ${navigation}
      document.addEventListener('click', function(event) { event.preventDefault(); });
    ` });

    await page.click('#internal');
    await page.click('#external');
    const state = await page.evaluate(() => ({
      installed: vmDangChayTrongUngDungDaCai(),
      internalTarget: document.getElementById('internal').getAttribute('target'),
      externalTarget: document.getElementById('external').getAttribute('target'),
    }));
    if (!state.installed || state.internalTarget !== null || state.externalTarget !== '_blank') {
      throw new Error(`Installed-app link routing failed: ${JSON.stringify(state)}`);
    }
    console.log('PASS installed VinhMath keeps same-origin links inside the app');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
