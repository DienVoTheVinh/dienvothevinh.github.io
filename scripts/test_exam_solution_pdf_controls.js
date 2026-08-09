const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const student = fs.readFileSync(path.join(root, 'luyen-de.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'js', 'exam-admin.js'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'js', 'latex-view.js'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(student.includes('id="btnPdfSolution"') && student.includes('pdf-solution-access is-locked'), 'Student answer-PDF action must always be visible in a locked state.');
expect(student.includes('id="wkPdfSolutionBtn"'), 'Mobile exam workspace needs an answer-PDF shortcut.');
expect(student.includes('id="pdfSolutionStatus"'), 'Student download panel must explain the answer-PDF state.');
expect(student.includes("sb.rpc('can_download_exam_solution'"), 'Answer-PDF permission must be verified server-side.');
expect(student.includes("['btnPdfSolution', 'wkPdfSolutionBtn']"), 'Desktop and mobile answer-PDF actions must stay synchronized.');
expect(/if \(mode === 'solution' && !\(await vmKiemTraQuyenPdfLoiGiai\(\)\)\)/.test(student) && student.includes('vmBaoKhongDuocTaiPdfLoiGiai'), 'Locked answer-PDF generation must stop before compilation.');
expect(!/btnPdfSolution[^\n]*style\.display\s*=\s*'none'/.test(student), 'The answer-PDF action must not disappear when locked.');

expect(admin.includes('data-solution-toggle="'), 'Every exam card needs a quick answer-PDF toggle.');
expect(admin.includes('toggleSolutionPdf:toggleSolutionPdf'), 'The quick toggle must be exposed to card actions.');
expect(admin.includes('.update({ allow_solution_pdf: next })'), 'The quick toggle must persist the existing Supabase permission flag.');
expect(admin.includes(".select('id,allow_solution_pdf')") && admin.includes('.single()'), 'The quick toggle must verify the saved permission value.');
expect(student.includes('.q-title { font-weight: 400;'), 'Exam prompts must use normal text weight.');
expect(student.includes('class="q-title-label"'), 'Only the question number should keep a stronger weight.');
expect(reader.includes('alreadyInDisplay'), 'The shared LaTeX reader must avoid nested display delimiters around cases.');

console.log('Exam answer-PDF access control checks passed.');
