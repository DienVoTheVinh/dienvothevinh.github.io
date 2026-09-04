const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const home = read('trang-chu.html');
const classroom = read('lop-hoc.html');
const migration = read('supabase/migrations/20260904113000_scope_attendance_by_schedule.sql');

for (const [name, source] of [['trang-chu.html', home], ['lop-hoc.html', classroom]]) {
  expect(source.includes(".eq('schedule_id', scheduleId)"), `${name} must find attendance by schedule slot`);
  expect(source.includes(".eq('held_on', dateStr)"), `${name} must also scope attendance by occurrence date`);
  expect(source.includes('schedule_id: scheduleId'), `${name} must save the owning schedule slot`);
  expect(source.includes('teacher_id: teacherId || null'), `${name} must preserve the teacher assigned to the slot`);
  expect(source.includes("ins.error.code === '23505'"), `${name} must recover safely from concurrent duplicate clicks`);
}

expect(home.includes("+ s.id + '\\', \\'' + attendanceDateStr") && home.includes("+ effStart.slice(0, 5)"),
  'Staff home attendance button must pass the exact schedule and date');
expect(home.includes("class_sessions!inner(schedule_id, class_id, held_on)"),
  'Make-up attendance must compare exact schedule occurrences');
expect(home.includes("var k = o.scheduleId + '|' + o.date"),
  'Two periods of the same class and date must remain separate in make-up attendance');
expect(home.includes('occurrenceCounts[legacyKey] === 1'),
  'Legacy date-only attendance may hide a make-up row only when that date has one unambiguous period');

expect(migration.includes('add column if not exists schedule_id uuid'), 'Migration must add the schedule identity');
expect(migration.includes('foreign key (schedule_id)') && migration.includes('references public.schedules(id)'),
  'Schedule identity must retain referential integrity');
expect(migration.includes('unique index if not exists uq_class_sessions_schedule_held_on') && migration.includes('(schedule_id, held_on)'),
  'The database must prevent duplicate sessions for one schedule occurrence');

console.log('Attendance schedule-session regression checks passed.');
