const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'quan-tri-lop.html'), 'utf8');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'web', 'supabase', 'lesson_multiple_exams.sql'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/id="modalBaiNop"[\s\S]*?aria-label="Đóng cửa sổ bài học sinh đã nộp"/.test(admin), 'Quick-submission popup must expose a labelled close button.');
expect(/\.bn-modal-head[^}]*padding-right:\s*52px/.test(admin), 'Quick-submission header must reserve space for its close button.');
expect(/#modalBaiNop \.modal-close[^}]*z-index:\s*3/.test(admin), 'Quick-submission close button must stay above header actions.');

expect(admin.includes('id="bhLinkedExamOptions"'), 'Teacher lesson editor must render the multi-exam picker.');
expect(admin.includes('function layDanhSachDeDaGan()'), 'Teacher lesson editor must collect every checked exam.');
expect(admin.includes('linked_exam_ids: linkedExamIds'), 'Teacher lesson save must persist all selected exams.');
expect(admin.includes('linked_exam_id: linkedExamIds[0] || null'), 'Teacher lesson save must keep the legacy first exam.');
expect(admin.includes("Array.isArray(bh.linked_exam_ids)"), 'Existing lessons must restore multiple assigned exams.');

expect(lesson.includes('linked_exam_id, linked_exam_ids'), 'Student lesson query must request multi-exam assignments.');
expect(lesson.includes(".in('id', linkedExamIds)"), 'Student lesson must load all assigned exams in one query.');
expect(lesson.includes('id="linkedExamList"'), 'Student lesson must render a dedicated list of assigned exams.');
expect(lesson.includes("linkedExamIds.indexOf(String(a.id))"), 'Student lesson must preserve the teacher-defined exam order.');

expect(sql.includes("add column if not exists linked_exam_ids uuid[]"), 'Database change must add a UUID array for linked exams.');
expect(sql.includes('array[linked_exam_id]::uuid[]'), 'Database change must backfill legacy assignments.');

console.log('Lesson multi-exam + quick-submission popup checks passed.');
