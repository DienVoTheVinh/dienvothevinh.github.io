const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lesson = fs.readFileSync(path.join(root, 'bai-hoc.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'quan-tri-lop.html'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260817090000_secure_lesson_solution_unlock.sql'),
  'utf8'
);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(migration.includes('create table if not exists public.lesson_latex_sources'), 'Full LaTeX sources need a private table.');
expect(migration.includes('enable row level security'), 'Private LaTeX sources need RLS.');
expect(/jsonb_array_length\(coalesce\(s\.files,[^)]+\)\) > 0/.test(migration), 'Solutions must unlock only after at least one uploaded file is recorded.');
expect(/s\.submitted_at is not null/.test(migration), 'Solutions must unlock only after submission completion.');
expect(/public\.vm_strip_latex_solutions/.test(migration), 'Public lesson fields must be sanitized.');
expect(/after insert[\s\S]*on public\.submissions/.test(migration), 'Completed submissions must trigger solution-unlock notifications.');
expect(migration.includes("kind = 'solution_unlocked'"), 'Solution notifications need a stable kind.');
expect(migration.includes('action=solution-unlocked'), 'Solution notifications need a direct lesson deep link.');

expect(lesson.includes(".from('lesson_latex_sources')"), 'Student lesson view must fetch protected sources through RLS.');
expect(lesson.includes("params.get('action') === 'solution-unlocked'"), 'Student lesson view must consume solution notification deep links.');
expect(lesson.includes('data-solution-unlocked='), 'Unlocked solution sections need a direct scroll target.');
expect(/vmLatexNativeHTML\([^)]*forceShowSolutions/.test(lesson), 'The renderer must explicitly enable solutions only after authorization.');
expect(lesson.includes('🔓 Xem lời giải ngay'), 'Successful submission must offer immediate solution access.');

expect(admin.includes(".from('lesson_latex_sources')"), 'Teacher editor must retrieve the protected full source.');
expect(/rNguon\.data\.forEach[\s\S]*src\.kind === 'homework'[\s\S]*src\.kind === 'test'/.test(admin), 'Teacher editor must restore protected source by kind.');

console.log('Lesson solution-unlock security regression checks passed.');
