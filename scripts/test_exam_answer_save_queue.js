const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('luyen-de.html', 'utf8');

assert.ok(html.includes('var VM_SHORT_ANSWER_CELL_COUNT = 12;'), 'short answers must support the full bank value range');
assert.ok(html.includes('function vmChuanHoaDapAnNgan(value)'), 'client practice comparison must normalize canonical TeX answers');
assert.ok(html.includes('function vmXepHangLuuDapAn(qId, key)'), 'answer writes must be serialized per question');
assert.ok(html.includes('function vmChoLuuHetDapAn()'), 'submission must have a save barrier');

const officialSubmit = html.indexOf("var secureSubmit = await sb.rpc('vm_exam_submit'");
const flush = html.lastIndexOf('await vmChoLuuHetDapAn();', officialSubmit);
assert.ok(flush >= 0 && flush < officialSubmit, 'the last answer save must finish before server grading');
assert.ok(html.includes('Chưa thể nộp vì đáp án cuối chưa được lưu'), 'save failure must block submission visibly');
assert.ok(!html.includes('.replace(/[^0-9,\\-]/g'), 'short answers must not discard letters and common math signs');

console.log('PASS serialized answer autosave + flexible short-answer input');
