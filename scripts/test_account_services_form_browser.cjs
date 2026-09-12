const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const contract = {};
vm.createContext(contract);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync(path.join(root,'supabase/functions/_shared/vmtools-access.ts'),'utf8').replace(/export /g,'')),contract);
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='https://vinhmath.test')return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      let body=fs.readFileSync(file);
      if(file.endsWith('.html'))body=body.toString().replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g,'');
      return route.fulfill({status:200,body,contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/plain'});
    });
    await page.addInitScript(()=>{
      window.$=id=>document.getElementById(id);
      window.daKetNoi=()=>false;
      window.calls=[];
      window.sb={functions:{invoke:async(name,{body})=>{window.calls.push({name,body});return {error:{message:'Fixture: no account is created'}};}}};
    });
    await page.goto('https://vinhmath.test/quan-tri-tai-khoan.html');
    await page.evaluate(()=>{ttDatMatKhauMacDinh();ttDoiPhamVi();});
    await page.selectOption('#ttLoai','gv');
    await page.fill('#ttHoTen','Giáo viên thử nghiệm');
    await page.fill('#ttTeacherEmail','teacher@example.test');
    assert(!await page.isChecked('#ttClassEnabled'));
    assert(!await page.isChecked('#ttVmEnabled'));
    assert(!await page.isVisible('#ttClassSettings'));
    assert(!await page.isVisible('#ttVmSettings'));
    let grant=await page.evaluate(()=>ttDocDichVuGiaoVien());
    assert.equal(grant.classroom.enabled,false);assert.equal(grant.vmtools.plan,'pending');assert.deepEqual(grant.vmtools.features,[]);
    contract.teacherGrant(grant);
    await page.check('#ttClassEnabled');
    assert(await page.isVisible('#ttClassSettings'));assert(!await page.isVisible('#ttClassUnitsField'));
    await page.selectOption('#ttClassPlan','yearly');
    await page.fill('#ttClassUnits','2');
    assert.equal(await page.textContent('#ttClassUnitsLabel'),'Số năm');
    grant=await page.evaluate(()=>ttDocDichVuGiaoVien());
    assert.equal(grant.classroom.enabled,true);assert.equal(grant.classroom.units,2);assert.equal(grant.vmtools.plan,'pending');contract.teacherGrant(grant);
    await page.check('#ttVmEnabled');
    assert(await page.isVisible('#ttVmSettings'));
    assert.match(await page.evaluate(()=>{try{ttDocDichVuGiaoVien();return '';}catch(e){return e.message;}}),/xác nhận/);
    await page.check('#ttVmConfirm');
    await page.fill('#ttVmAmount','250000');
    grant=await page.evaluate(()=>ttDocDichVuGiaoVien());
    assert.equal(grant.vmtools.plan,'monthly');assert.equal(grant.vmtools.confirmGrant,true);assert.equal(grant.vmtools.amount,250000);assert.equal(grant.vmtools.features.length,7);contract.teacherGrant(grant);
    await page.uncheck('#ttClassEnabled');
    grant=await page.evaluate(()=>ttDocDichVuGiaoVien());
    assert.equal(grant.classroom.enabled,false);assert.equal(grant.vmtools.plan,'monthly');contract.teacherGrant(grant);
    await page.selectOption('#ttVmPlan','custom');
    assert(await page.isVisible('#ttVmUntilField'));assert(!await page.isVisible('#ttVmUnitsField'));
    await page.fill('#ttVmUntil','2020-01-01T09:00');
    assert.match(await page.evaluate(()=>{try{ttDocDichVuGiaoVien();return '';}catch(e){return e.message;}}),/tương lai/);
    // Turning an invalid service off must ignore all stale hidden term/payment values.
    await page.uncheck('#ttVmEnabled');
    grant=await page.evaluate(()=>ttDocDichVuGiaoVien());
    assert.equal(grant.vmtools.plan,'pending');assert.equal(grant.vmtools.until,null);assert.equal(grant.vmtools.amount,0);assert.equal(grant.vmtools.confirmGrant,false);contract.teacherGrant(grant);
    await page.check('#ttClassEnabled');await page.selectOption('#ttClassPlan','monthly');await page.fill('#ttClassUnits','1.5');
    assert.match(await page.evaluate(()=>{try{ttDocDichVuGiaoVien();return '';}catch(e){return e.message;}}),/số nguyên/);
    await page.selectOption('#ttClassPlan','lifetime');
    await page.check('#ttVmEnabled');await page.selectOption('#ttVmPlan','monthly');await page.check('#ttVmConfirm');
    await page.click('#ttNutTao');
    const call=await page.evaluate(()=>calls.at(-1));
    assert.equal(call.name,'tao-tai-khoan');assert.equal(call.body.type,'gv');assert.equal(call.body.classroom.enabled,true);assert.equal(call.body.vmtools.plan,'monthly');contract.teacherGrant(call.body);
    await page.evaluate(()=>{document.getElementById('ttThongBao').style.display='none';});
    for (const theme of ['light','dark']) for (const width of [1440,820,390]) {
      await page.setViewportSize({width,height:1080});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.locator('#ttTeacherEmailField').scrollIntoViewIfNeeded();
      const bounds=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth+2,
        fieldOverflow:Array.from(document.querySelectorAll('.tt-service input:not([type=checkbox]),.tt-service select')).filter(el=>el.getClientRects().length).some(el=>{const a=el.getBoundingClientRect(),b=el.closest('.tt-service').getBoundingClientRect();return a.right>b.right+1||a.left<b.left-1;})}));
      assert(!bounds.overflow,`${theme}/${width}: horizontal overflow`);assert(!bounds.fieldOverflow,`${theme}/${width}: field outside card`);
      if(process.env.VM_QA_DIR){fs.mkdirSync(process.env.VM_QA_DIR,{recursive:true});await page.locator('#ttTeacherEmailField').screenshot({path:path.join(process.env.VM_QA_DIR,`account-services-${theme}-${width}.png`)});}
    }
    await page.selectOption('#ttLoai','hs_ph');
    assert(!await page.isVisible('#ttTeacherEmailField'));
    assert.equal(await page.inputValue('#ttMkHS'),'VinhMath2026#');
    assert.deepEqual(errors,[]);
    console.log('PASS two independent service checkboxes, all four combinations, validation, real request/server contract, light/dark desktop/tablet/mobile layout');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
