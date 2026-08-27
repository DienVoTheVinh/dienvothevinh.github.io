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
    const customCalls = await page.evaluate(async () => {
      window.__calls=[];
      window.sb={rpc:async(name,args)=>{
        window.__calls.push({name,args});
        if(name==='vm_bank_admin_save_id_system')return {data:{ok:true,schema_name:'thcs-chuyen-v1',example:'thcs-chuyen-v1:6D1TH1-1'},error:null};
        if(name==='vm_bank_admin_id_schemas')return {data:{schemas:[{schema_name:'thcs-chuyen-v1',label:'Toán chuyên THCS',system_kind:'taxonomy',education_level:'thcs',grades:[6,7,8,9],is_locked:false,is_active:true}],aliases:[]},error:null};
        if(name==='vm_bank_admin_save_id_family')return {data:{ok:true,schema_name:'thcs-chuyen-v1',taxonomy_key:'thcs-chuyen-v1:6D1?1-1',codes:{TH:'thcs-chuyen-v1:6D1TH1-1'}},error:null};
        return {data:{ok:true},error:null};
      }};
      document.getElementById('bankIdSystemPreset').value='thcs_specialized';
      document.getElementById('bankIdSystemPreset').dispatchEvent(new Event('change'));
      document.getElementById('bankIdSystemSave').click();
      await new Promise((resolve)=>setTimeout(resolve,30));
      document.getElementById('bankIdFamilySchema').value='thcs-chuyen-v1';
      document.getElementById('bankIdFamilySchema').dispatchEvent(new Event('change'));
      document.getElementById('bankIdFamilyGrade').value='6';
      document.getElementById('bankIdFamilyChapterLabel').value='Số hữu tỉ';
      document.getElementById('bankIdFamilySkillLabel').value='Cộng hai số hữu tỉ';
      document.getElementById('bankIdFamilyVariantLabel').value='Tính trực tiếp';
      document.getElementById('bankIdFamilySave').click();
      await new Promise((resolve)=>setTimeout(resolve,30));
      return window.__calls;
    });
    const savedSystem=customCalls.find((call)=>call.name==='vm_bank_admin_save_id_system');
    if(!savedSystem || savedSystem.args.p_system.schema_name!=='thcs-chuyen-v1' || savedSystem.args.p_system.grades.join(',')!=='6,7,8,9' || !savedSystem.args.p_system.is_specialized) throw new Error('Specialized THCS system save failed: '+JSON.stringify(customCalls));
    const savedFamily=customCalls.find((call)=>call.name==='vm_bank_admin_save_id_family');
    if(!savedFamily || savedFamily.args.p_family.schema_name!=='thcs-chuyen-v1' || savedFamily.args.p_family.grade!==6 || savedFamily.args.p_family.variant!=='1') throw new Error('Custom taxonomy family save failed: '+JSON.stringify(customCalls));
    console.log('PASS question-bank ID schema preview, alias mapping, custom THCS system and family builder');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
