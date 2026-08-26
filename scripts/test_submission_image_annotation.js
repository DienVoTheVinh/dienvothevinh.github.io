const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
const edge = fs.readFileSync('web/supabase/function-nop-bai.ts', 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim())
  .forEach((source, index) => new vm.Script(source, { filename: `quan-tri-cham-bai.html#${index + 1}` }));

for (const fragment of [
  '✎ Viết lên ảnh', 'chb-draw-modal', 'function chamMoVe', 'function chamVeBatDau',
  'function chamVeUndo', 'function chamVeRedo', 'function chamVeXoaHet',
  "vmGoiHamFormDataBlob('nop-bai'", "out.toBlob(resolve,'image/jpeg',.94)",
  'function chamVeToanManHinh', 'function chamDoiAnhVe', 'chbDrawPrev', 'chbDrawNext',
  'function chamVeTaiDe', 'function chamVeToggleDe', 'function chamVeGanResizeDe',
  'chbDrawPrompt', 'chbDrawPromptResizer', 'chbDrawPromptZoom',
  'function chamVeGanKinhLup', 'function chamVeCapNhatKinhLup',
  'function chamVeToggleVeNgonTay', 'chbDrawFinger', "event.pointerType==='touch'&&!chamVeState.fingerDraw",
  "chamThemFile(chamVeState.subId,files)", 'Lưu & trả bài'
]) expect(html.includes(fragment), `Missing annotation workflow: ${fragment}`);

expect(html.includes("globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over'"), 'Eraser must remove only annotation strokes');
expect(html.includes("maxSide=2400"), 'Large phone photos need a bounded annotation canvas');
expect(html.includes('touch-action:pan-x pan-y pinch-zoom') && html.includes('.chb-draw-modal.finger-draw .chb-draw-stage canvas+canvas{touch-action:none}') && html.includes('.chb-draw-canvas-scroll{place-items:safe center}'), 'Finger must pan the full image by default and only lock scrolling in explicit finger-draw mode');
expect(html.includes("e.key==='ArrowLeft'") && html.includes("e.key==='ArrowRight'"), 'Keyboard arrows must switch between submission images');
expect(html.includes("chb-draw-modal.fullscreen") && html.includes("width:100vw;height:100dvh"), 'Desktop annotation fullscreen must use the whole viewport');
expect(html.includes('.chb-draw-modal.fullscreen .chb-draw-prompt'), 'Fullscreen annotation must expose the reference prompt panel');
expect(html.includes('.chb-draw-magnifier') && html.includes("event.pointerType==='mouse'"), 'Prompt image needs a mouse, pen and touch magnifier');
expect(html.includes("pages=(chamVeState.gallery||[])") && html.includes("files.push(await chamTaoFileTrang"), 'Annotations from multiple images must be attached together');

for (const fragment of [
  '"submission_file"', 'Ảnh không thuộc bài nộp này.', 'coQuyenQuanLyLop',
  'submittedFiles.find', 'Chỉ có thể viết trực tiếp lên tệp ảnh.',
  '"Cache-Control": "private, no-store, max-age=0"'
]) expect(edge.includes(fragment), `Submission image proxy is missing: ${fragment}`);

expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(html), 'Privileged secrets must never enter the grading frontend');
console.log('PASS direct submission-image annotation + authorized private proxy');
