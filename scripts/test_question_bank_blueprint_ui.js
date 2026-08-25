const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('quan-tri-de.html','utf8');
const js = fs.readFileSync('js/exam-admin.js','utf8');
const css = fs.readFileSync('css/exam-admin.css','utf8');

for (const marker of ['bankBlueprintRows','bankAddBlueprintButton','bankBlueprintTotal','Thêm nhóm câu']) assert(html.includes(marker), marker);
for (const marker of ['bankAddBlueprintRow','bankRemoveBlueprintRow','bankCollectBlueprint','bankUpdateBlueprintTotal','blueprint:blueprint']) assert(js.includes(marker), marker);
assert(js.includes("if(total>200)"));
assert(js.includes("state.bank.access.canAdmin&&el('bankGenPrefix')"));
assert(!js.includes('blueprint:[{count:count'));
assert(css.includes('.bank-blueprint-row') && css.includes('.bank-blueprint-actions'));
assert(css.includes('@media(max-width:760px)') && css.includes('.bank-blueprint-row{grid-template-columns:1fr}'));

console.log('PASS multi-segment bank blueprint UI');
