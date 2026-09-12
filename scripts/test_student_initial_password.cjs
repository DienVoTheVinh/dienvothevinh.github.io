const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

for (const file of ['quan-tri-tai-khoan.html', 'web/trang-web/quan-tri-tai-khoan.html']) {
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const nodes = Object.fromEntries(['ttLoai','ttMkHS','ttMkPH','ttBulkPassword','ttPasswordNote'].map(id => [id,{value:''}]));
  const context = {crypto, window:{}, $:id => nodes[id]};
  vm.createContext(context);
  vm.runInContext(source.match(/var TT_MAT_KHAU_HS_KHOI_TAO = [^;]+;/)[0],context);
  for (const name of ['ttMatKhauNgauNhien','ttDatMatKhauMacDinh','ttCapNhatMatKhauTheoLoai']) {
    const start = source.indexOf('function '+name+'(');
    const end = source.indexOf('\n}',start);
    vm.runInContext(source.slice(start,end+2),context);
  }
  nodes.ttLoai.value = 'hs_ph';
  context.ttDatMatKhauMacDinh();
  assert.equal(nodes.ttMkHS.value,'VinhMath2026#');
  if (!file.startsWith('web/')) assert.equal(nodes.ttBulkPassword.value,'VinhMath2026#');
  nodes.ttMkHS.value = 'Custom student password';
  nodes.ttLoai.value = 'portal_hs';
  context.ttCapNhatMatKhauTheoLoai(false);
  assert.equal(nodes.ttMkHS.value,'Custom student password','same audience must preserve manual input');
  for (const role of ['gv','portal_gv','tg']) {
    nodes.ttLoai.value = role;
    context.ttDatMatKhauMacDinh();
    assert.notEqual(nodes.ttMkHS.value,'VinhMath2026#','staff must not inherit student default');
    assert(nodes.ttMkHS.value.length >= 16);
    const prior = nodes.ttMkHS.value;
    context.ttCapNhatMatKhauTheoLoai(false);
    assert.equal(nodes.ttMkHS.value,prior,'same staff selection must preserve entered password');
    nodes.ttLoai.value = 'portal_hs';
    context.ttCapNhatMatKhauTheoLoai(false);
    assert.equal(nodes.ttMkHS.value,'VinhMath2026#');
  }
  assert(source.includes('ttCapNhatMatKhauTheoLoai(false)'));
  assert(source.includes("$('ttResetPassword').value = ''") || file.startsWith('web/'));
}
console.log('PASS student initial password preserved; staff defaults separate; old-account reset remains manual');
