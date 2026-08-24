const decoder = new TextDecoder();
const read = (path) => decoder.decode(Deno.readFileSync(path));
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const examPage = read('luyen-de.html');
const shared = read('js/vinhmath.js');
const lesson = read('bai-hoc.html');
const classPage = read('lop-hoc.html');
const docsPage = read('tai-lieu.html');
const migration = read('supabase/migrations/20260824074535_secure_exam_content_and_private_assets.sql');
const lockdown = read('supabase/migrations/20260824075720_lock_exam_and_course_asset_access.sql');

expect(examPage.includes("sb.rpc('vm_exam_load'"), 'Exam content must load through the sanitized server RPC.');
expect(examPage.includes("sb.rpc('vm_exam_save_answer'"), 'Official answers must be saved through the grading RPC.');
expect(examPage.includes("sb.rpc('vm_exam_submit'"), 'Official submission must be scored on the server.');
expect(!examPage.includes("select('sort, questions(id, content_latex, choices, solution_latex)')"), 'The browser still fetches official answer keys directly.');
expect(!examPage.includes("sb.from('attempt_answers').upsert"), 'The browser can still set is_correct directly.');

expect(shared.includes('createSignedUrl(path, ttl)'), 'Private course assets must use short-lived signed URLs.');
expect(lesson.includes('await vmSecureLessonAssets(details)'), 'Lesson assets must be signed after lesson authorization.');
expect(classPage.includes("vmSignedCourseAsset('tai-lieu'"), 'Class documents must use signed URLs.');
expect(docsPage.includes("vmSignedCourseAsset('tai-lieu'"), 'Document library must use signed URLs.');

expect(migration.includes("choice_value - array['correct','is_correct','answer','solution']"), 'Sanitized payload must strip all answer markers.');
expect(migration.includes('private.vm_exam_grade_answer'), 'Server-side grading function is missing.');
expect(migration.includes('exam_time_expired'), 'Server must enforce exam timing independently of the browser.');
expect(lockdown.includes("update storage.buckets set public = false where id in ('tai-lieu', 'hinh-anh')"), 'Course buckets are not switched to private.');
expect(lockdown.includes('private.vm_can_read_course_asset(bucket_id, name)'), 'Storage access is not linked to course authorization.');
expect(lockdown.includes('from anon;'), 'Anonymous table grants are not revoked.');

console.log('PASS security hardening: server-side exam grading, private assets, anonymous lockout');
