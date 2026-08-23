const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const practice = read('luyen-de.html');
const grading = read('quan-tri-cham-bai.html');
const results = read('js/student-results.js');
const migration = read('supabase/migrations/20260822192813_add_submission_assessment_level.sql');

const practiceFunctions = [
  'vmPracticeHasText', 'vmPracticeHasFiles', 'vmPracticeSubmissionFor', 'vmBuildLessonPracticeItems'
].map((name) => extractFunction(practice, name)).join('\n');
const sandbox = { vmPracticeLessons: [], vmPracticeSubmissions: [] };
vm.createContext(sandbox);
new vm.Script(practiceFunctions).runInContext(sandbox);
sandbox.vmPracticeLessons = [{
  id:'lesson-1', title:'Buổi 1', created_at:'2026-08-20T00:00:00Z', classes:{name:'Toán 9',grade:9},
  homework_text:'Bài tập', homework_images:[], homework2_text:'Bài thêm', homework2_images:[],
  test_active:true, linked_exam_id:null, linked_exam_ids:[]
}, {
  id:'lesson-2', title:'Buổi 2', created_at:'2026-08-21T00:00:00Z', classes:{name:'Toán 12',grade:12},
  test_active:true, linked_exam_id:'exam-1', linked_exam_ids:[]
}];
const items = sandbox.vmBuildLessonPracticeItems();
expect(items.filter((item) => item.kind === 'homework').length === 2, 'Bài tập bắt buộc và bài tập thêm phải cùng xuất hiện.');
expect(items.filter((item) => item.kind === 'test').length === 1, 'Bài kiểm tra đã liên kết đề thi không được hiển thị lặp.');

expect(practice.includes("selectedClassId = 'all'") && practice.includes('vmPracticeAllClassIds'), 'Học sinh nhiều lớp phải mở được phạm vi Tất cả các lớp.');
expect(practice.includes("classList.add('has-class-filter')") && practice.includes('practice-class-filter'), 'Bộ lọc lớp trên PC phải nằm ở thanh bên trái.');
expect(practice.includes('practice-specialized-tag') && practice.includes('background:#eee9ff'), 'Nhãn Chuyên phải có màu tương phản riêng.');
expect(practice.includes("data-practice-filter=\"homework\"") && practice.includes("data-practice-filter=\"test\"") && practice.includes("data-practice-filter=\"exam\""), 'Luyện tập thiếu bộ lọc loại bài.');
expect(results.includes('studentResultClassFilter') && results.includes('studentResultGradeFilter'), 'Kết quả thiếu lọc lớp hoặc khối.');
expect(!results.includes('&action=graded&kind=') && results.includes('student-result-pdf'), 'Kết quả phải xem bài sửa và PDF tại chỗ.');
expect(grading.includes('assessment_level: assessmentInput ? assessmentInput.value : null'), 'Mức đánh giá chưa được lưu vào đúng submission.');
expect(grading.includes('needs_improvement') && grading.includes('meets') && grading.includes('good'), 'Màn chấm thiếu một trong ba mức đánh giá.');
expect(migration.includes('submissions_assessment_level_check') && migration.includes('not valid') && migration.includes('validate constraint'), 'Constraint mức đánh giá phải được thêm và validate an toàn.');

console.log('PASS unified practice, inline results and three-level grading');
