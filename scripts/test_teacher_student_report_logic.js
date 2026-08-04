const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('quan-tri-bao-cao-hoc-sinh.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
inlineScripts.forEach((source, index) => new vm.Script(source, { filename: `report-inline-${index + 1}.js` }));

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const context = { Date, Set, Array, Math, Number };
vm.createContext(context);
['bcDate', 'bcDateKey', 'bcHasArray', 'bcInPeriod', 'bcPercent', 'bcCalendarPeriod', 'bcShiftPeriod', 'tinhBaoCao', 'taoNhanDinhHeThong']
  .forEach((name) => vm.runInContext(extractFunction(name), context));

function periodKeys(type, date) {
  const period = context.bcCalendarPeriod(type, date);
  return [context.bcDateKey(period.start), context.bcDateKey(period.end)];
}

function deepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

deepEqual(periodKeys('week', '2026-08-04T12:00:00+07:00'), ['2026-08-03', '2026-08-09'], 'calendar week Monday to Sunday');
deepEqual(periodKeys('month', '2026-08-04T12:00:00+07:00'), ['2026-08-01', '2026-08-31'], 'August calendar month');
deepEqual(periodKeys('month', '2026-07-15T12:00:00+07:00'), ['2026-07-01', '2026-07-31'], 'selectable July calendar month');
deepEqual(periodKeys('month', '2026-04-15T12:00:00+07:00'), ['2026-04-01', '2026-04-30'], '30-day calendar month');
deepEqual(periodKeys('month', '2024-02-15T12:00:00+07:00'), ['2024-02-01', '2024-02-29'], 'leap-year February');
deepEqual(periodKeys('month', '2025-02-15T12:00:00+07:00'), ['2025-02-01', '2025-02-28'], 'regular February');
deepEqual(periodKeys('month', context.bcShiftPeriod('month', new Date('2026-08-04T12:00:00+07:00'), -1)), ['2026-07-01', '2026-07-31'], 'previous month navigation');
deepEqual(periodKeys('week', context.bcShiftPeriod('week', new Date('2026-08-04T12:00:00+07:00'), -1)), ['2026-07-27', '2026-08-02'], 'previous week navigation');

const start = new Date('2025-08-01T00:00:00+07:00');
const end = new Date('2025-08-07T23:59:59.999+07:00');
const lessons = [
  { id: 'l1', title: 'BTVN đã nộp', created_at: '2025-08-01T00:00:00Z', homework_text: 'Bài 1', homework_due: '2025-08-02T20:00:00+07:00' },
  { id: 'l2', title: 'BTVN còn thiếu', created_at: '2025-08-02T00:00:00Z', homework_text: 'Bài 2', homework_due: '2025-08-03T20:00:00+07:00' },
  { id: 'l3', title: 'Bài thưởng', created_at: '2025-08-03T00:00:00Z', homework2_text: 'Thưởng', homework2_due: '2025-08-04T20:00:00+07:00' },
  { id: 'l4', title: 'Kiểm tra', created_at: '2025-08-04T00:00:00Z', linked_exam_id: 'e4', test_deadline: '2025-08-05T20:00:00+07:00' },
  { id: 'l5', title: 'Nội dung đã xem', created_at: '2025-08-05T00:00:00Z' },
  { id: 'l6', title: 'Bài cũ được xem lại', created_at: '2025-06-01T00:00:00Z' },
];

const result = context.tinhBaoCao({
  start,
  end,
  lop: { id: 'c1', name: 'Lớp 7' },
  sessions: [
    { id: 's1', held_on: '2025-08-01', lesson_id: 'l1' },
    { id: 's2', held_on: '2025-08-06', lesson_id: 'l5' },
  ],
  attendance: [
    { session_id: 's1', status: 'present' },
    { session_id: 's2', status: 'late' },
  ],
  lessons,
  progress: [
    { lesson_id: 'l5', item: 'lythuyet', done_at: '2025-08-06T08:00:00+07:00' },
    { lesson_id: 'l6', item: 'video', done_at: '2025-08-07T08:00:00+07:00' },
  ],
  submissions: [
    { lesson_id: 'l1', kind: 'homework', submitted_at: '2025-08-02T19:00:00+07:00', is_late: false, status: 'submitted', score: null },
    { lesson_id: 'l1', kind: 'homework', submitted_at: '2025-08-03T19:00:00+07:00', is_late: true, status: 'graded', graded_at: '2025-08-04T08:00:00+07:00', reviewed_at: '2025-08-05T08:00:00+07:00', feedback: 'Trình bày tốt', score: 9 },
    { lesson_id: 'l3', kind: 'homework_bonus', submitted_at: '2025-08-04T21:00:00+07:00', is_late: true },
  ],
  attempts: [
    { exam_id: 'e4', submitted_at: '2025-08-05T19:00:00+07:00', score: 8 },
    { exam_id: 'old', submitted_at: '2025-07-01T19:00:00+07:00', score: 2 },
  ],
  analytics: [{ duration_seconds: 3600 }],
  study: [{ focus_seconds: 1800 }],
  remarks: [
    { ngay: '2025-08-06', attitude_score: 8, remark: 'Em học tốt và có tiến bộ.' },
    { ngay: '2025-08-01', attitude_score: 6, remark: 'Cần xem lại bài đã chấm.' },
  ],
});

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

equal(result.attendanceRate, 100, 'attendance rate');
equal(result.late, 1, 'late sessions');
equal(result.tasks.length, 3, 'required task denominator');
equal(result.submitted.length, 1, 'submitted metric counts mandatory homework only');
equal(result.onTime.length, 1, 'on-time metric counts mandatory homework only');
equal(result.submitRate, 50, 'mandatory homework submission rate');
equal(result.onTimeRate, 50, 'mandatory homework on-time rate');
equal(result.homeworkTasks.length, 2, 'homework denominator');
equal(result.homeworkSubmitted.length, 1, 'submitted homework numerator');
equal(result.homeworkOnTime.length, 1, 'earliest submission keeps on-time credit after late resubmission');
equal(result.testTasks.length, 1, 'test denominator');
equal(result.testSubmitted.length, 1, 'completed test numerator');
equal(result.bonusTasks.length, 1, 'bonus task denominator');
equal(result.bonusDone.length, 1, 'bonus submitted tasks');
equal(result.bonusOnTime.length, 0, 'late bonus task is not counted on time');
equal(result.viewed, 2, 'viewed lessons including reviewed older lessons');
equal(result.viewItems, 2, 'viewed content items');
equal(result.hours, 1, 'study hours without double counting');
equal(result.avg, 8.5, 'score average only within period');
equal(result.gradedTasks.length, 1, 'graded submission denominator excludes online attempts without review flow');
equal(result.reviewedTasks.length, 1, 'reviewed graded submissions');
equal(result.reviewRate, 100, 'reviewed graded submission rate');

const insight = context.taoNhanDinhHeThong(result);
if (!insight.strengths.some((item) => item.includes('Giáo viên ghi nhận'))) throw new Error('teacher positive remark is not reflected in strengths');
if (insight.limitations.some((item) => item.includes('Giáo viên lưu ý'))) throw new Error('generic teacher-note limitation must not outrank measurable findings');
if (insight.improvements.some((item) => item.includes('góp ý của giáo viên'))) throw new Error('generic teacher-note action must not outrank concrete improvements');

const julyAssignment = context.tinhBaoCao({
  start: new Date('2026-07-01T00:00:00+07:00'),
  end: new Date('2026-07-31T23:59:59.999+07:00'),
  lop: { id: 'q5', name: 'Toán 7 - Q5' },
  sessions: [], attendance: [], progress: [], attempts: [], analytics: [], study: [], remarks: [],
  lessons: Array.from({ length: 7 }, (_, index) => ({
    id: `j${index + 1}`,
    title: `BTVN tháng 7 số ${index + 1}`,
    created_at: `2026-07-${String(5 + index * 4).padStart(2, '0')}T05:00:00Z`,
    homework_text: 'Bài tập',
    homework_due: index < 5 ? `2026-07-${String(10 + index * 4).padStart(2, '0')}T16:59:00Z` : `2026-08-0${index - 4}T16:59:00Z`,
  })),
  submissions: [
    { lesson_id: 'j1', kind: 'homework', submitted_at: '2026-07-09T10:00:00Z', is_late: false },
    { lesson_id: 'j2', kind: 'homework', submitted_at: '2026-07-13T10:00:00Z', is_late: false },
    { lesson_id: 'j3', kind: 'homework', submitted_at: '2026-07-17T10:00:00Z', is_late: false },
    { lesson_id: 'j6', kind: 'homework', submitted_at: '2026-07-31T10:00:00Z', is_late: false },
    { lesson_id: 'j7', kind: 'homework', submitted_at: '2026-08-04T10:00:00Z', is_late: true },
  ],
});
equal(julyAssignment.homeworkTasks.length, 5, 'July report excludes homework whose due date belongs to August');
equal(julyAssignment.homeworkSubmitted.length, 3, 'July completion state stops at the end of the reporting month');
equal(julyAssignment.homeworkOnTime.length, 3, 'July on-time rate uses only homework due inside July');

const gradedWithoutNumericScore = context.tinhBaoCao({
  start,
  end,
  lop: { id: 'c1', name: 'Lớp 7' },
  sessions: [], attendance: [], progress: [], attempts: [], analytics: [], study: [], remarks: [],
  lessons: [{ id: 'g1', title: 'Bài đã chấm bằng lời phê', created_at: '2025-08-01T00:00:00Z', homework_text: 'Bài tập', homework_due: '2025-08-02T20:00:00+07:00' }],
  submissions: [{ lesson_id: 'g1', kind: 'homework', submitted_at: '2025-08-02T19:00:00+07:00', status: 'graded', graded_at: '2025-08-03T08:00:00+07:00', feedback: 'Đã chấm', score: null }],
});
equal(gradedWithoutNumericScore.avg, null, 'written feedback must not be fabricated into a numeric score');
equal(gradedWithoutNumericScore.gradedWithoutScore.length, 1, 'graded work without numeric score is explained separately');

console.log('PASS teacher student report calculation checks');
