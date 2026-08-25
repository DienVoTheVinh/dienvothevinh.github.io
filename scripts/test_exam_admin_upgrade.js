const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'quan-tri-de.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js', 'exam-admin.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'exam-admin.css'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'web', 'supabase', 'exam_authoring_analytics.sql'), 'utf8');

function expect(pattern, text, message) {
  if (!pattern.test(text)) throw new Error(message);
}

expect(/data-tab="compose"[\s\S]*data-tab="library"[\s\S]*data-tab="analytics"/, page, 'The three-level exam workflow is missing.');
expect(/value="tf">Chỉ Đúng\/Sai/, page, 'The dedicated true/false exam type is missing.');
expect(/value="thpt">Chuẩn THPTQG/, page, 'The THPTQG three-part exam type is missing.');
expect(/HTML trực tiếp[\s\S]*PDF/, page, 'HTML and PDF preview modes must both be visible.');
expect(/thpt-standard[\s\S]*thpt-practice/, page, 'Both THPTQG templates must be available.');
expect(/exam-toolbox-card[\s\S]*Trắc nghiệm 4 phương án[\s\S]*Đúng\/Sai 4 ý[\s\S]*Trả lời ngắn/, page, 'Question tools must live in the left authoring rail.');
expect(/width:min\(1880px,100%\)/, css, 'The authoring workspace must use large PC screens.');
expect(/\\choiceTF/, js, 'The true/false template must use ex_test choiceTF syntax.');
expect(/providecommand\{\\\\choiceTF\}/, js, 'PDF export must define a choiceTF fallback for the bundled ex_test version.');
expect(/\\\\vmTFItem\{a\}\{#2\}[\s\S]*\\\\vmTFItem\{d\}\{#5\}/, js, 'True/false PDF choices must use a)-d) labels.');
expect(/replace\(\/\\\\begin\\\{bt\\\}\//, js, 'PDF export must normalize short-answer bt blocks before compiling.');
expect(/function normalizeSolutionParagraphs\(/, js, 'PDF export must normalize paragraphs only inside solution blocks.');
if (/raw=raw\.replace\(\/\\r\?\\n\[ \\t\]\*\\r\?\\n\+\/g/.test(js)) {
  throw new Error('PDF export must not inject paragraph commands globally into math environments.');
}
expect(/\\textbf\{Câu trả lời:\}/, js, 'The short-answer template must expose a parser-compatible answer.');
expect(/gv_thong_ke_luyen_de/, js, 'The protected analytics RPC is not wired to the UI.');
expect(/statement_stats/, js, 'Per-statement true/false analytics are not rendered.');
expect(/async function toggleSolutionPdf\(/, js, 'Each exam needs a quick answer-PDF permission toggle.');
expect(/update\(\{ allow_solution_pdf: next \}\)[\s\S]*select\('id,allow_solution_pdf'\)[\s\S]*single\(\)/, js, 'The quick answer-PDF toggle must verify the saved row.');
expect(/exam-solution-toggle/, css, 'The quick answer-PDF toggle is not styled.');
expect(/async function loadPortalManager\(/, js, 'The @gvtt portal manager authorization path is missing.');
expect(/exam_portal_exams'\)\.upsert/, js, 'Portal-authored exams must be assigned inside the same isolated portal.');
expect(/function resetForm\(\)[\s\S]*switchPreview\('html'\)[\s\S]*renderPreview\(false\)/, js, 'Cancel editing must restore the editor and preview layout.');
expect(/@media\(max-width:760px\)/, css, 'Mobile authoring layout is missing.');
expect(/security definer[\s\S]*set search_path = ''/i, sql, 'Analytics RPC must pin the search path.');
expect(/v_role not in \('admin', 'teacher'\)/, sql, 'Analytics RPC must reject non-teacher roles.');
expect(/revoke all on function public\.gv_thong_ke_luyen_de/, sql, 'Analytics RPC execute privileges are not restricted.');
expect(/attempts_exam_submitted_student_idx/, sql, 'Analytics query index is missing.');

console.log('Exam admin upgrade static regression checks passed.');
