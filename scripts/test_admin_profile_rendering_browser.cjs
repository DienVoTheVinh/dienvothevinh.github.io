const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
function read(file) {
  const ref = process.env.VM_SECURITY_BASELINE_REF;
  return (ref ? execFileSync('git',['show',ref+':'+file],{encoding:'utf8'}) : fs.readFileSync(file,'utf8')).replace(/\r\n/g,'\n');
}
function fn(source,name) {
  const start = source.indexOf('function '+name+'(');
  assert(start >= 0, name);
  const lineEnd = source.indexOf('\n',start);
  const end = source.slice(start,lineEnd).endsWith('}') ? lineEnd : source.indexOf('\n}',start)+2;
  return source.slice(start,end);
}
const studentId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const hostile = `<img src=x onerror="window.__xss=1"> O'Neil \\ &quot;`;
(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
  try {
    const page = await browser.newPage();
    // Entirely synthetic origin/data, no real login, account mutation or network.
    await page.route('**/*', route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><div id="rows"></div><table><tbody id="students"></tbody></table><div id="ttThongBao"></div><select id="nxphChonPH"></select><div id="nxphTenHocSinh"></div><input id="nxphGhiNX"><div id="modalNhanXetPH"></div>'}));
    await page.goto('https://vinhmath.test/security-fixture');
    for (const file of ['quan-tri-tai-khoan.html','web/trang-web/quan-tri-tai-khoan.html']) {
      const source = read(file);
      await page.addScriptTag({content:`window.__xss=0;window._hoSo={id:'${adminId}'};var $=id=>document.getElementById(id);
        ${['ttEscapeHtml','qlaEsc','renderUserRow','ttBao'].map(n=>fn(source,n)).join('\n')}`});
      await page.evaluate(({id,hostile})=>{
        document.getElementById('rows').innerHTML=renderUserRow({id,full_name:hostile,username:hostile,role:'student',class_students:[{classes:{name:hostile,is_specialized:true}}]});
        ttBao(hostile);
      },{id:studentId,hostile});
      let state = await page.evaluate(()=>({xss:window.__xss,images:document.querySelectorAll('#rows img,#ttThongBao img').length,text:document.getElementById('rows').textContent,error:document.getElementById('ttThongBao').textContent,buttons:document.querySelectorAll('#rows button').length}));
      assert.equal(state.images,0,file+' rendered untrusted markup');
      assert.equal(state.xss,0);
      assert(state.text.includes(hostile));
      assert.equal(state.error,hostile);
      assert(state.buttons>=1,'account actions preserved');
      // Test delete click dispatch, without invoking the real destructive handler.
      await page.evaluate(()=>{window.__clicked=[];window.xoaTaiKhoan=(...args)=>window.__clicked=args;document.querySelector('#rows button:last-child').click();});
      assert.deepEqual(await page.evaluate(()=>window.__clicked),[studentId],'delete handler must receive ID only, never code from a display name');
    }
    const source = read('quan-tri-hoc-sinh.html');
    const marker = "$('bangHS').innerHTML = dsFiltered.map";
    const start = source.indexOf(marker);
    const end = source.indexOf("}).join('');",start)+"}).join('');".length;
    assert(start>=0 && end>start);
    const renderer = 'function renderStudentRows(dsFiltered){ return '+source.slice(start+"$('bangHS').innerHTML = ".length,end)+' }';
    const funcs = ['ten2','thoiGianDep','phutDep','layBadgeRole','layBadgeMini','hsEscapeTelemetry','moNhanXetPH'];
    if(source.includes('function hsSafeAvatarUrl(')) funcs.push('hsSafeAvatarUrl');
    await page.addScriptTag({content:`${funcs.map(n=>fn(source,n)).join('\n')}
      var MAU=['blue'];var dsHS=[];var dsPhuHuynh=[];var selectedStudentIdNXPH=null;${renderer}`});
    await page.evaluate(({id,hostile})=>{
      const student={id,role:'student',ten:hostile,username:hostile,tenLop:hostile,avatar:'x" onerror="window.__xss=2',chuyenCan:null,diemTB:null,tongGiay:0,soBai:0,parent_id:null};
      document.getElementById('students').innerHTML=renderStudentRows([student]);
      dsHS=[student];dsPhuHuynh=[{id,full_name:hostile,username:hostile}];moNhanXetPH(id);
    },{id:studentId,hostile});
    const state = await page.evaluate(()=>({xss:window.__xss,images:document.querySelectorAll('#students img').length,text:document.getElementById('students').textContent,parent:document.getElementById('nxphChonPH').textContent,options:document.querySelectorAll('#nxphChonPH option').length,buttons:document.querySelectorAll('#students button').length}));
    assert.equal(state.images,0,'malformed avatar must not generate an image');
    assert.equal(state.xss,0);
    assert(state.text.includes(hostile));assert(state.parent.includes(hostile));assert.equal(state.options,2);assert.equal(state.buttons,2);
    const urls = await page.evaluate(()=>['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://a.test/x" onerror="alert(1)','https://name:pass@a.test/a.png','https://a.test/avatar.png','/img/avatar.png'].map(hsSafeAvatarUrl));
    assert.deepEqual(urls.slice(0,4),['','','','']);
    assert.equal(urls[4],'https://a.test/avatar.png');assert.equal(urls[5],'https://vinhmath.test/img/avatar.png');
    console.log('PASS isolated browser: profile/name/avatar/error XSS blocked, delete dispatch safe, valid images and parent/account actions preserved');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
