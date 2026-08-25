'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function texFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes:true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...texFiles(target));
    else if (entry.isFile() && /\.tex$/i.test(entry.name)) files.push(target);
  }
  return files;
}

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');

  const inventory = texFiles('NganHang').reduce((result, file) => {
    const matches = fs.readFileSync(file, 'utf8').match(/\\vv(?![A-Za-z@])/g) || [];
    if (matches.length) {
      result.files += 1;
      result.occurrences += matches.length;
    }
    return result;
  }, { files:0, occurrences:0 });
  if (!inventory.files || !inventory.occurrences) throw new Error('NganHang no longer contains the audited \\vv legacy macro');

  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="math"></div></body>');
    await page.evaluate(() => { window.vmDisableGlobalTikzAuto = true; });
    await page.addScriptTag({ path:'js/latex-view.js' });

    const result = await page.evaluate(() => {
      const full = String.raw`\documentclass{article}
\newcommand{\vv}[1]{\mathbf{#1}}
\begin{document}
$\vv{x}$
\end{document}`;
      const injected = vmChenLegacyTexCompatPreamble(full);
      const twice = vmChenLegacyTexCompatPreamble(injected);
      const tikz = vmTexTikzPreview({
        preamble:'',
        source:String.raw`\begin{tikzpicture}\node {$\vv{u}$};\end{tikzpicture}`,
      }, false);
      const customTikz = vmTexTikzPreview({
        preamble:String.raw`\newcommand{\vv}[1]{\mathbf{#1}}`,
        source:String.raw`\begin{tikzpicture}\node {$\vv{u}$};\end{tikzpicture}`,
      }, false);
      const plainTikz = vmTexTikzPreview({
        preamble:'',
        source:String.raw`\begin{tikzpicture}\node {$u$};\end{tikzpicture}`,
      }, false);
      const options = vmTuyChonRenderToan();
      return {
        mapping:window.vmLegacyMacroCompatibility.vv,
        indamMapping:window.vmLegacyMacroCompatibility.indam,
        legacyKeys:Object.keys(window.vmLegacyMacroCompatibility),
        mappingFrozen:Object.isFrozen(window.vmLegacyMacroCompatibility) && Object.keys(window.vmLegacyMacroCompatibility).every((key) => Object.isFrozen(window.vmLegacyMacroCompatibility[key])),
        katexVv:options.macros['\\vv'],
        katexIndam:options.macros['\\indam'],
        unknownMapped:Object.prototype.hasOwnProperty.call(options.macros, '\\vmUnknown'),
        conditional:vmLegacyTexCompatPreamble(String.raw`$\vv{AB}$`),
        indamConditional:vmLegacyTexCompatPreamble(String.raw`\indam{PHẦN I}`),
        groupConditional:vmLegacyTexCompatPreamble(String.raw`$\vect{AB}\quad\heva{&x=1\\&y=2}\quad\hoac{&x=1\\&x=2}$ \faCube \shortans[oly]{1,5}`),
        commentOnly:vmLegacyTexCompatPreamble(String.raw`% $\vv{AB}$`),
        controlSymbolOnly:vmLegacyTexCompatPreamble(String.raw`\\vv is text after a TeX line break`),
        unrelated:vmLegacyTexCompatPreamble(String.raw`$\vmUnknown{AB}$`),
        markerCount:(twice.match(/VM_LEGACY_MACROS_BEGIN/g) || []).length,
        unchangedOnSecondPass:twice === injected,
        sourceDefinitionBeforeFallback:injected.indexOf(String.raw`\newcommand{\vv}`) < injected.indexOf(String.raw`\providecommand{\vv}`),
        fallbackBeforeDocument:injected.indexOf(String.raw`\providecommand{\vv}`) < injected.indexOf(String.raw`\begin{document}`),
        usesRenew:/\\renewcommand\s*\{?\\vv\b/.test(vmLegacyTexCompatPreamble(String.raw`$\vv{x}$`)),
        tikzFallback:tikz.includes(String.raw`\providecommand{\vv}[1]{\overrightarrow{#1}}`),
        tikzFallbackBeforeDocument:tikz.indexOf(String.raw`\providecommand{\vv}`) < tikz.indexOf(String.raw`\begin{document}`),
        customTikzDefinitionBeforeFallback:customTikz.indexOf(String.raw`\newcommand{\vv}`) < customTikz.indexOf(String.raw`\providecommand{\vv}`),
        plainTikzHasFallback:plainTikz.includes('VM_LEGACY_MACROS_BEGIN'),
      };
    });

    if (!result.mappingFrozen || result.mapping.command !== '\\vv' || result.mapping.arguments !== 1 || result.mapping.sourcePackage !== 'esvect') {
      throw new Error(`Legacy compatibility guide is incomplete: ${JSON.stringify(result)}`);
    }
    if (result.indamMapping.command !== '\\indam' || result.indamMapping.arguments !== 1 || result.indamMapping.sourcePackage !== 'legacy-author-preamble') {
      throw new Error(`Legacy bold compatibility guide is incomplete: ${JSON.stringify(result)}`);
    }
    if (!['vv','indam','vect','heva','hoac','faCube','shortans'].every((key) => result.legacyKeys.includes(key))) {
      throw new Error(`Audited legacy command group is incomplete: ${JSON.stringify(result)}`);
    }
    if (result.katexVv !== '\\overrightarrow{#1}' || result.katexIndam !== '\\textbf{#1}' || result.unknownMapped) {
      throw new Error(`KaTeX legacy mapping is not narrow and deterministic: ${JSON.stringify(result)}`);
    }
    if (!result.conditional.includes('\\providecommand{\\vv}[1]{\\overrightarrow{#1}}') || !result.indamConditional.includes('\\providecommand{\\indam}[1]{\\textbf{#1}}') || result.commentOnly || result.controlSymbolOnly || result.unrelated) {
      throw new Error(`TeX compatibility preamble is not source-conditional: ${JSON.stringify(result)}`);
    }
    for (const command of ['vect','heva','hoac','faCube','shortans']) {
      if (!result.groupConditional.includes(`\\providecommand{\\${command}`)) throw new Error(`Missing guarded \\${command} fallback: ${JSON.stringify(result)}`);
    }
    if (result.markerCount !== 1 || !result.unchangedOnSecondPass || !result.sourceDefinitionBeforeFallback || !result.fallbackBeforeDocument || result.usesRenew) {
      throw new Error(`Full-document compatibility injection is not guarded/idempotent: ${JSON.stringify(result)}`);
    }
    if (!result.tikzFallback || !result.tikzFallbackBeforeDocument || !result.customTikzDefinitionBeforeFallback || result.plainTikzHasFallback) {
      throw new Error(`TikZ compatibility injection is not guarded/source-preserving: ${JSON.stringify(result)}`);
    }

    console.log(`PASS legacy macro compatibility; NganHang \\vv inventory: ${inventory.occurrences} occurrences in ${inventory.files} files`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
