'use strict';
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const chrome = process.env.VM_CHROME_PATH;
  if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html','utf8');
  const mapper = html.match(/<section class="bank-id-mapper[\s\S]*?<\/section>/)[0];
  const browser = await chromium.launch({ executablePath:chrome, headless:true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body>'+mapper+'</body></html>');
    await page.addScriptTag({ path:'js/question-bank.js' });
    await page.addScriptTag({ path:'js/question-bank-id-guide.js' });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    await page.fill('#bankIdMapOld','2D1H3-1');
    await page.fill('#bankIdMapSchema','vm-id-v2');
    await page.click('#bankIdMapPreview');
    const generated = await page.locator('#bankIdMapOutput').textContent();
    if (!generated.includes('vm-id-v2:12-D-1-TH-3-1') || !generated.includes('UID QB')) throw new Error('Generated mapping preview failed: '+generated);
    await page.click('.bank-id-schema-advanced summary');
    await page.fill('#bankIdMapOrder','area,grade,chapter,difficulty,skill,variant');
    await page.fill('#bankIdMapNew','');
    await page.click('#bankIdMapPreview');
    const reordered = await page.locator('#bankIdMapOutput').textContent();
    if (!reordered.includes('vm-id-v2:D-12-1-TH-3-1')) throw new Error('Segment reorder preview failed: '+reordered);
    const rpcCalls = await page.evaluate(async () => {
      window.__calls=[];
      window.sb={rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='vm_bank_admin_upsert_id_alias')return {data:{ok:true},error:null};if(name==='vm_bank_admin_id_schemas')return {data:{schemas:[]},error:null};return {data:{ok:true},error:null};}};
      document.getElementById('bankIdMapNew').value='CUSTOM-12-001';
      document.getElementById('bankIdAliasSave').click();
      await new Promise((resolve)=>setTimeout(resolve,20));
      return window.__calls;
    });
    const alias = rpcCalls.find((call) => call.name === 'vm_bank_admin_upsert_id_alias');
    if (!alias || alias.args.p_legacy_code !== '2D1H3-1' || alias.args.p_mapped_code !== 'CUSTOM-12-001') throw new Error('Explicit alias save failed: '+JSON.stringify(rpcCalls));
    console.log('PASS question-bank ID schema preview, reorder and alias mapping');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
