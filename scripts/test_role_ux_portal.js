const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (value, message) => { if (!value) throw new Error(message); };
const compile = (file) => new vm.Script(read(file), { filename: file });
const compileInline = (file) => {
  const html = read(file);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((source) => source.trim())
    .forEach((source, index) => new vm.Script(source, { filename: `${file}#${index + 1}` }));
  return html;
};

for (const file of ['js/menu-v5.js', 'js/vinhmath.js', 'js/exam-portal.js', 'js/role-home.js']) compile(file);
const login = compileInline('dang-nhap.html');
const classAdmin = compileInline('quan-tri-lop.html');
const exam = compileInline('luyen-de.html');
const hub = compileInline('quan-tri.html');
const portalAdmin = compileInline('quan-tri-portal-thi.html');
const portal = read('thi.html');
const migration = read('supabase/migrations/20260822122518_partner_exam_portals.sql');
const optimization = read('supabase/migrations/20260822125005_optimize_partner_exam_portal_policies.sql');
const hardening = read('supabase/migrations/20260822125416_harden_partner_portal_scope.sql');
const loginSuffix = read('supabase/migrations/20260822125510_partner_portal_login_suffix.sql');
const teacherSuffix = read('supabase/migrations/20260822131500_partner_portal_teacher_suffix.sql');
const accountFunction = read('supabase/functions/tao-tai-khoan/index.ts');
const menu = read('js/menu-v5.js');
const shared = read('js/vinhmath.js');
const roleHome = read('js/role-home.js');

expect(menu.includes("path: 'trang-chu', label: 'Hôm nay'") && menu.includes("path: 'quan-tri', label: 'Quản trị'"), 'Role navigation is not task-focused');
expect(hub.includes('Trung tâm quản trị') && hub.includes('quan-tri-portal-thi'), 'Admin tools are not grouped in one hub');
expect(roleHome.includes('Việc cần ưu tiên') && roleHome.includes('Hôm nay em học gì?'), 'Teacher/student home priorities are incomplete');
expect(classAdmin.includes("localStorage.getItem('vm-admin-active-class-id')") && classAdmin.includes("dsLop[0] && dsLop[0].id"), 'Class manager must select a valid class immediately');
expect(classAdmin.includes("currentUrl.searchParams.set('tab', tab)"), 'Class tab state must survive reloads');
expect(shared.includes('/@hs$/') && shared.includes('/@(hs|gv)[a-z0-9]{2,20}$/') && shared.includes('/@hs\\.[a-z0-9]+(?:-[a-z0-9]+)*$/') && login.includes('vmDichDangNhap'), 'Default, compact student/teacher and legacy login routing is missing');
expect(portal.includes('Khu vực khảo thí riêng') && !portal.includes('js/menu-v5.js'), 'Portal must have an independent shell');
expect(exam.includes('vmPortalExamIds') && exam.includes("query.in('id', vmPortalExamIds)"), 'Exam engine is not constrained to portal assignments');
expect(portalAdmin.includes('portal_hs') && portalAdmin.includes('portal_gv') && portalAdmin.includes('exam_portal_exams') && portalAdmin.includes('Xem portal'), 'Portal account, exam and admin preview workflow is incomplete');
expect(accountFunction.includes('prof.role !== "admin"') && accountFunction.includes('portal_only: true') && accountFunction.includes('isManager ? "manager" : "student"'), 'Portal account creation must be admin-only and portal-only');
expect(accountFunction.includes('portal.login_suffix') && accountFunction.includes('portal.teacher_login_suffix') && accountFunction.includes('type === "portal_gv"') && !accountFunction.includes('@hs.${portal.slug}'), 'Portal student and teacher accounts must use configured compact suffixes');
expect(!accountFunction.includes('role: "teacher"') || accountFunction.includes('type === "gv"'), 'Partner account must never receive broad teacher access');
for (const helper of ['private.is_portal_only_user()', 'private.can_manage_exam_portal', 'private.can_access_portal_exam', 'private.can_access_portal_question']) expect(migration.includes(helper), `Missing RLS helper ${helper}`);
for (const policy of ['exams_portal_only_scope', 'exam_questions_portal_assigned_read', 'questions_portal_assigned_read', 'profiles_portal_only_scope', 'classes_portal_only_scope', 'lessons_portal_only_scope']) expect(migration.includes(policy), `Missing isolation policy ${policy}`);
expect(migration.includes('as restrictive') && migration.includes('portal_only'), 'Portal isolation must use restrictive RLS');
expect(optimization.includes('exam_portals_brand_idx') && optimization.includes('exam_portals_created_by_idx'), 'Portal foreign keys need covering indexes');
expect(optimization.includes('exam_portals_admin_insert') && !optimization.includes('for all'), 'Admin writes must not create duplicate permissive SELECT policies');
for (const table of ['class_students', 'documents', 'topics', 'schedules', 'submissions', 'class_posts', 'student_lesson_progress', 'lesson_item_progress', 'class_sessions', 'attendance']) expect(hardening.includes(`${table}_portal_only_scope`), `Portal-only account can still reach ${table}`);
expect(loginSuffix.includes("login_suffix ~ '^hs[a-z0-9]{2,20}$'") && loginSuffix.includes('unique (login_suffix)') && loginSuffix.includes("login_suffix <> 'hs'"), 'Portal suffix must be compact, reserved-safe and unique');
expect(teacherSuffix.includes("teacher_login_suffix ~ '^gv[a-z0-9]{2,20}$'") && teacherSuffix.includes('unique (teacher_login_suffix)') && teacherSuffix.includes("teacher_login_suffix <> 'gv'"), 'Portal teacher suffix must be compact, reserved-safe and unique');
expect(!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test([menu, shared, portal, portalAdmin, exam, migration, hardening, loginSuffix, teacherSuffix].join('\n')), 'Privileged credentials must not appear in browser or migration files');

console.log('PASS role UX + partner exam portal: navigation, routing, allow-list, account workflow and RLS');
