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
expect(/\\choiceTF/, js, 'The true/false template must use ex_test choiceTF syntax.');
expect(/\\textbf\{Câu trả lời:\}/, js, 'The short-answer template must expose a parser-compatible answer.');
expect(/gv_thong_ke_luyen_de/, js, 'The protected analytics RPC is not wired to the UI.');
expect(/statement_stats/, js, 'Per-statement true/false analytics are not rendered.');
expect(/@media\(max-width:760px\)/, css, 'Mobile authoring layout is missing.');
expect(/security definer[\s\S]*set search_path = ''/i, sql, 'Analytics RPC must pin the search path.');
expect(/v_role not in \('admin', 'teacher'\)/, sql, 'Analytics RPC must reject non-teacher roles.');
expect(/revoke all on function public\.gv_thong_ke_luyen_de/, sql, 'Analytics RPC execute privileges are not restricted.');
expect(/attempts_exam_submitted_student_idx/, sql, 'Analytics query index is missing.');

console.log('Exam admin upgrade static regression checks passed.');
