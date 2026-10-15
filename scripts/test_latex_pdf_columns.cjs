const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = require('./test_latex_pdf_export.js');
const html = fs.readFileSync('bai-hoc.html', 'utf8');

(async () => {
  let destroyed = 0;
  const item = (x, y, width, str = 'x', rotated = false) => ({str, width, transform:[12,rotated ? 12 : 0,0,12,x,y]});
  let glyphs = [item(50,700,100),item(330,700,100),item(280,815,40),item(280,20,40),item(280,400,40,'watermark',true)];
  global.vmTaiPdfJs = async () => ({getDocument:() => ({promise:Promise.resolve({numPages:1, getPage:async () => ({getViewport:() => ({width:595,height:842}), getTextContent:async () => ({items:glyphs}), cleanup:() => {}}), destroy:async () => {destroyed++;}})})});
  const blob = new Blob(['fixture']);
  assert.equal(await helpers.overflow(blob, {layout:'one',margins:'normal'}), false);
  assert.equal(destroyed, 0, 'One-column exports need no extra PDF parsing');
  assert.equal(await helpers.overflow(blob, {layout:'two',margins:'normal'}), false, 'Ignore header, footer and watermark');
  glyphs.push(item(250,700,65));
  assert.equal(await helpers.overflow(blob, {layout:'two',margins:'tight'}), true);
  assert.equal(destroyed, 2, 'Release parsed PDF resources');
  delete global.vmTaiPdfJs;

  const source = html.slice(html.indexOf('async function vmBatDauXuatPdf('), html.indexOf('function vmTaiPdfDaTao('));
  const original = String.raw`\documentclass{article}\begin{document}\begin{ex}Question.\loigiai{PRIVATEANSWERSENTINEL}\end{ex}\end{document}`;
  for (const answers of ['show','hide','dots']) {
    for (const spills of [false,true]) {
      const controls = {};
      for (const id of ['vmPdfAnswers','vmPdfDotLines','vmPdfLayout','vmPdfMargins','vmPdfFontSize','vmPdfConfigPane','vmPdfResultPane','vmPdfProgressPane','vmPdfProgressTitle','vmPdfProgressText','vmPdfResultNote','vmPdfPreviewArea']) controls[id] = {style:{},value:'',innerHTML:'',textContent:''};
      Object.assign(controls.vmPdfAnswers,{value:answers}); Object.assign(controls.vmPdfDotLines,{value:'4'});
      Object.assign(controls.vmPdfLayout,{value:'two'}); Object.assign(controls.vmPdfMargins,{value:'tight'}); Object.assign(controls.vmPdfFontSize,{value:'10'});
      const sent = [];
      const scope = {$:id => controls[id], vmLatexDownloads:{fixture:{tex:original}}, vmPdfExportKey:'fixture', vmPdfPresetName:'custom', vmPdfExportUrl:'', chuanHoaTexBaiHoc:async tex => tex, vmCauHinhNoiDungPdf:helpers.configure, vmBienDoiLoiGiaiPdf:helpers.answers, vmSuaXungDotGeometry:helpers.repair, vmBienDichPdfTex:async tex => {sent.push(tex);return blob;}, vmPdfBiTranHaiCot:async () => spills, URL:{createObjectURL:() => 'blob:fixture',revokeObjectURL:() => {}}, renderPDFWithJS:() => {}, vmEscHtml:String};
      vm.runInNewContext(source + '\nthis.run = vmBatDauXuatPdf;', scope);
      await scope.run();
      assert.equal(sent.length, spills ? 2 : 1);
      const result = sent[sent.length - 1];
      assert.equal(result.includes('PRIVATEANSWERSENTINEL'), answers === 'show', 'Layout repair must retain answer privacy');
      assert.equal((result.match(/\\dotfill/g) || []).length, answers === 'dots' ? 4 : 0);
      assert.equal(result.includes('10pt,onecolumn'), spills);
      assert.equal(controls.vmPdfResultNote.innerHTML.includes('một cột'), spills);
      assert.equal(scope.vmPdfExportBlob, blob);
    }
  }
  console.log('PASS actual PDF-glyph overflow detection, resource cleanup, one-column fallback and retained answers/dotted lines');
})().catch(error => {console.error(error);process.exitCode=1;});
