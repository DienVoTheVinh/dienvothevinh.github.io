'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const excludedStandaloneHeaders = new Set(['bai-hoc.html', 'khong-gian.html', 'thi.html']);
const menuPages = fs.readdirSync(ROOT)
  .filter((file) => file.endsWith('.html') && !excludedStandaloneHeaders.has(file))
  .filter((file) => /js\/menu-v5\.js(?:\?[^"']*)?/.test(read(file)))
  .sort();

assert.strictEqual(menuPages.length, 38,
  `Expected 38 shared-menu pages, found ${menuPages.length}: ${menuPages.join(', ')}`);

for (const file of menuPages) {
  const source = read(file);
  const logo = source.match(/<a\s+class="logo"[^>]*>([\s\S]*?)<\/a>/i);
  assert(logo, `${file} must keep a shared topbar logo`);
  assert(/class="brand-vinh"/.test(logo[1]), `${file} logo is missing brand-vinh`);
  assert(/class="brand-math"/.test(logo[1]), `${file} logo is missing brand-math`);
}

const sharedCss = [
  read('css/tokens.css'),
  read('css/vinhmath.css'),
  read('css/rank-system.css'),
].join('\n');
const menuScript = read('js/menu-v5.js');

function fixture(theme) {
  return `<!doctype html>
<html lang="vi" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <style>${sharedCss}</style>
</head>
<body>
  <header class="topbar">
    <div class="nav">
      <a class="logo" href="index">
        <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="VinhMath">
        <span class="brand-container-el"><span class="brand-vinh">Vinh</span><span class="brand-math">Math</span></span>
        <small>· Quản trị</small>
      </a>
      <nav class="navlinks" aria-label="Điều hướng chính"></nav>
      <div class="topbar-actions" style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-ghost btn-sm" id="themeBtn" type="button">☼</button>
        <button class="btn btn-secondary btn-sm" type="button" onclick="dangXuat()">Đăng xuất</button>
      </div>
    </div>
  </header>
  <script>${menuScript.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

function closeEnough(actual, expected, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance;
}

const viewports = [1920, 1440, 961, 960, 768, 390];
const themes = ['light', 'dark'];
const chrome = process.env.VM_CHROME_PATH;

if (!chrome || !fs.existsSync(chrome)) {
  throw new Error('VM_CHROME_PATH must point to an installed Chrome executable');
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const theme of themes) {
      for (const width of viewports) {
        const page = await browser.newPage({ viewport: { width, height: 720 } });
        await page.setContent(fixture(theme), { waitUntil: 'domcontentloaded' });

        const before = await page.evaluate(() => {
          const topbar = document.querySelector('.topbar').getBoundingClientRect();
          const nav = document.querySelector('.topbar .nav').getBoundingClientRect();
          const first = getComputedStyle(document.querySelector('.brand-vinh')).color;
          const second = getComputedStyle(document.querySelector('.brand-math')).color;
          const probe = (variable) => {
            const element = document.createElement('i');
            element.style.color = `var(${variable})`;
            document.body.appendChild(element);
            const color = getComputedStyle(element).color;
            element.remove();
            return color;
          };
          return {
            topbarHeight: topbar.height,
            navWidth: nav.width,
            first,
            second,
            accent: probe('--accent'),
            topbarText: probe('--topbar-text'),
          };
        });

        assert(closeEnough(before.navWidth, Math.min(1880, width)),
          `${theme} ${width}px nav width ${before.navWidth} does not follow min(1880px, viewport)`);
        assert.strictEqual(before.first, before.accent,
          `${theme} ${width}px Vinh color must use --accent`);
        assert.strictEqual(before.second, before.topbarText,
          `${theme} ${width}px Math color must use --topbar-text`);
        assert.notStrictEqual(before.first, before.second,
          `${theme} ${width}px wordmark must retain two distinct colors`);

        await page.evaluate(() => {
          apDungMenu('admin', null, null, null);
          apDungLogoBadge('admin');
          damBaoNutMenuMobile();
        });

        const after = await page.evaluate(() => {
          const topbar = document.querySelector('.topbar').getBoundingClientRect();
          const nav = document.querySelector('.topbar .nav').getBoundingClientRect();
          const links = [...document.querySelectorAll('.navlinks > a')];
          const burger = document.getElementById('navBurger');
          return {
            topbarHeight: topbar.height,
            navWidth: nav.width,
            navLeft: nav.left,
            navRight: nav.right,
            linkHeights: links.map((link) => link.getBoundingClientRect().height),
            linkWhiteSpace: links.map((link) => getComputedStyle(link).whiteSpace),
            menuDisplay: getComputedStyle(document.querySelector('.navlinks')).display,
            burgerDisplay: burger ? getComputedStyle(burger).display : 'missing',
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });

        assert(closeEnough(after.topbarHeight, before.topbarHeight),
          `${theme} ${width}px topbar shifted from ${before.topbarHeight} to ${after.topbarHeight} after menu hydration`);
        assert(closeEnough(after.navWidth, Math.min(1880, width)),
          `${theme} ${width}px hydrated nav width is ${after.navWidth}`);
        assert(after.navLeft >= -1 && after.navRight <= width + 1,
          `${theme} ${width}px nav escaped the viewport`);
        assert(after.overflow <= 1, `${theme} ${width}px page overflows by ${after.overflow}px`);

        if (width > 960) {
          assert.strictEqual(after.burgerDisplay, 'none', `${theme} ${width}px must use desktop navigation`);
          assert.strictEqual(after.menuDisplay, 'flex', `${theme} ${width}px desktop links must be visible`);
          assert(after.linkHeights.length > 0, `${theme} ${width}px admin links were not rendered`);
          assert(after.linkHeights.every((height) => closeEnough(height, after.linkHeights[0], 0.25)),
            `${theme} ${width}px desktop link heights differ: ${after.linkHeights.join(', ')}`);
          assert(after.linkHeights.every((height) => height <= 40),
            `${theme} ${width}px desktop links wrapped: ${after.linkHeights.join(', ')}`);
          assert(after.linkWhiteSpace.every((value) => value === 'nowrap'),
            `${theme} ${width}px desktop links must remain on one line`);
        } else {
          assert.notStrictEqual(after.burgerDisplay, 'none', `${theme} ${width}px must show the burger`);
          assert.strictEqual(after.menuDisplay, 'none', `${theme} ${width}px mobile menu must start collapsed`);
          await page.click('#navBurger');
          const mobileOpen = await page.evaluate(() => {
            const menu = document.querySelector('.navlinks').getBoundingClientRect();
            return {
              open: document.querySelector('.navlinks').classList.contains('open'),
              display: getComputedStyle(document.querySelector('.navlinks')).display,
              left: menu.left,
              right: menu.right,
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
          });
          assert(mobileOpen.open && mobileOpen.display === 'flex', `${theme} ${width}px burger did not open the menu`);
          assert(mobileOpen.left >= -1 && mobileOpen.right <= width + 1,
            `${theme} ${width}px open mobile menu escaped the viewport`);
          assert(mobileOpen.overflow <= 1, `${theme} ${width}px open menu overflows by ${mobileOpen.overflow}px`);
        }

        const rankInvariant = await page.evaluate(() => {
          const nav = document.querySelector('.topbar .nav');
          const beforeWidth = nav.getBoundingClientRect().width;
          const beforeLinkHeights = [...document.querySelectorAll('.navlinks > a')]
            .map((link) => link.getBoundingClientRect().height);
          const tag = document.createElement('span');
          tag.className = 'vm-rank-logo-tag';
          tag.innerHTML = '<span class="vm-rank-pill compact"><span class="vm-rank-symbol">✦</span></span>';
          document.querySelector('.logo').appendChild(tag);
          const afterWidth = nav.getBoundingClientRect().width;
          const afterLinkHeights = [...document.querySelectorAll('.navlinks > a')]
            .map((link) => link.getBoundingClientRect().height);
          return { beforeWidth, afterWidth, beforeLinkHeights, afterLinkHeights };
        });
        assert(closeEnough(rankInvariant.afterWidth, rankInvariant.beforeWidth),
          `${theme} ${width}px rank tag changed nav width from ${rankInvariant.beforeWidth} to ${rankInvariant.afterWidth}`);
        if (width > 960) {
          assert.deepStrictEqual(rankInvariant.afterLinkHeights, rankInvariant.beforeLinkHeights,
            `${theme} ${width}px rank tag changed desktop link heights`);
        }

        await page.close();
      }
    }
    console.log(`PASS shared topbar: ${menuPages.length} pages, two-color wordmark, stable desktop/mobile navigation and rank invariant`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
