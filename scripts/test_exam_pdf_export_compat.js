const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = [
  path.join(root, 'luyen-de.html'),
  path.join(root, 'web', 'trang-web', 'luyen-de.html'),
];
const admin = fs.readFileSync(path.join(root, 'js', 'exam-admin.js'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

pages.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const helperStart = source.indexOf('function vmEscapeTexText(');
  const helperEnd = source.indexOf('function ghepTexCode(', helperStart);
  expect(helperStart >= 0 && helperEnd > helperStart, `${path.basename(file)} PDF helpers are missing`);
  const helperCode = source.slice(helperStart, helperEnd);
  const helpers = new Function(`${helperCode}; return { vmEscapeTexText, vmChuanHoaLoiGiaiPdf, vmTaoLoiGiaiNganPdf };`)();

  expect(
    helpers.vmEscapeTexText('DE 100% & A_B') === 'DE 100\\% \\& A\\_B',
    `${path.basename(file)} does not escape PDF titles safely`,
  );
  expect(
    helpers.vmChuanHoaLoiGiaiPdf('Dong 1\n\nDong 2') === 'Dong 1\n\\par\nDong 2',
    `${path.basename(file)} leaves blank paragraphs inside ex_test solutions`,
  );
  const existingAnswer = helpers.vmTaoLoiGiaiNganPdf(
    '14',
    '\\textbf{C\u00e2u tr\u1ea3 l\u1eddi:} 14\n\nGi\u1ea3i th\u00edch',
  );
  expect((existingAnswer.match(/C\u00e2u tr\u1ea3 l\u1eddi:/g) || []).length === 1, `${path.basename(file)} duplicates the short answer label`);
  expect(existingAnswer.includes('\\par'), `${path.basename(file)} does not preserve short-solution paragraphs safely`);

  expect(source.includes('\\\\providecommand{\\\\choiceTF}[1][]{\\\\choice}'), `${path.basename(file)} lacks the optional choiceTF PDF fallback`);
  expect((source.match(/vmEscapeTexText\(currentExam\.title\.toUpperCase\(\)\)/g) || []).length === 2, `${path.basename(file)} does not escape both PDF titles`);
  expect((source.match(/vmChuanHoaLoiGiaiPdf\(q\.solution_latex\)/g) || []).length === 4, `${path.basename(file)} does not normalize every generated MC/TF solution`);
  expect((source.match(/vmTaoLoiGiaiNganPdf\(shortAns, q\.solution_latex \|\| ''\)/g) || []).length === 2, `${path.basename(file)} does not normalize both short-answer export paths`);
});

expect(admin.includes('\\\\providecommand{\\\\choiceTF}[1][]{\\\\choice}'), 'Admin PDF export does not support choiceTF[t]');
expect(!admin.includes('\\\\providecommand{\\\\choiceTF}[4]'), 'Obsolete fixed-arity choiceTF fallback is still present');

console.log('Exam PDF compatibility regression checks passed.');
