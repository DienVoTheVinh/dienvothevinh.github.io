const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const runtime = fs.readFileSync('js/tex-environments.js', 'utf8');
  const reader = fs.readFileSync('js/latex-view.js', 'utf8');
  const lessonCss = [...fs.readFileSync('bai-hoc.html', 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#f5f5f5;--surface:#fff;--surface-2:#fafafa;--line:#ddd;--line-2:#ccc;--ink:#171717;--ink-3:#666;--accent:#a56700}${lessonCss}</style></head><body><main id="root"></main></body></html>`);
    await page.addScriptTag({ content: runtime });
    await page.addScriptTag({ content: reader });

    const result = await page.evaluate(() => {
      vmXemTruocMoiTruongTex({
        environment_name: 'hopmoi', display_name: 'Hộp mới', aliases: ['hm'], icon: '🧠', tone: 'note',
        web_config: { accent:'#123456', background:'#f4fbff', border:'#77aacc', title_background:'#dceffc', dark_background:'#101820', dark_border:'#335577', dark_title_background:'#172635', radius:'18px', border_width:'3px' },
        latex_definition: '\\newcommand{\\vmSentinel}{OK}', sample_latex: ''
      });
      document.getElementById('root').innerHTML = latexTaiLieuRaHTML('\\begin{hm}Nội dung $x^2$.\\end{hm}', { title:'Mẫu', showSolutions:true });
      const box = document.querySelector('[data-vm-env="hopmoi"]');
      const light = getComputedStyle(box);
      const lightBg = light.getPropertyValue('--vm-env-bg').trim();
      const radius = light.getPropertyValue('--vm-env-radius').trim();
      const borderWidth = light.getPropertyValue('--vm-env-border-width').trim();
      document.documentElement.setAttribute('data-theme', 'dark');
      const dark = getComputedStyle(box);
      const injected = vmChenPreambleMoiTruongTex('\\documentclass{article}\n\\begin{document}\nA\\end{document}');
      const twice = vmChenPreambleMoiTruongTex(injected);
      return {
        exists: !!box,
        text: box && box.textContent,
        lightBg,
        darkBg: dark.getPropertyValue('--vm-env-bg').trim(),
        radius,
        borderWidth,
        preambleBeforeDocument: injected.indexOf('\\newcommand{\\vmSentinel}{OK}') < injected.indexOf('\\begin{document}'),
        markerCount: (twice.match(/VM_TEX_ENVIRONMENTS_BEGIN/g) || []).length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    });

    if (!result.exists || !result.text.includes('Hộp mới') || !result.text.includes('Nội dung')) throw new Error(`Configured environment was not rendered: ${JSON.stringify(result)}`);
    if (result.lightBg !== '#f4fbff' || result.darkBg !== '#101820' || result.radius !== '18px' || result.borderWidth !== '3px') throw new Error(`Published styling was not applied: ${JSON.stringify(result)}`);
    if (!result.preambleBeforeDocument || result.markerCount !== 1) throw new Error(`PDF preamble injection is not stable: ${JSON.stringify(result)}`);
    if (result.overflow) throw new Error(`Configured environment overflows on mobile: ${JSON.stringify(result)}`);
    console.log('PASS TeX environment runtime web/PDF/mobile checks');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
