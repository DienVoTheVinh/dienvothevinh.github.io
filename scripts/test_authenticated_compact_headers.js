'use strict';

const assert = require('assert');
const fs = require('fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const hub = read('quan-tri.html');
const classes = read('quan-tri-lop.html');
const grading = read('quan-tri-cham-bai.html');
const schedule = read('quan-tri-lich.html');
const students = read('quan-tri-hoc-sinh.html');
const home = read('trang-chu.html');
const vmtool = read('vmtool.html');

assert(!hub.includes('admin-hub-head') && !/<h1[^>]*>Trung tâm quản trị<\/h1>/.test(hub),
  'admin hub must not repeat its active navigation context in a large hero');
assert(/<main class="admin-hub"[^>]*aria-label="Công cụ quản trị VinhMath"/.test(hub)
  && hub.includes('class="admin-toolbar"') && hub.includes('id="adminToolSearch"'),
  'admin search must remain the compact first action with an accessible main label');
assert(/\.admin-hub\{[^}]*padding:20px 22px 88px/.test(hub),
  'admin hub top spacing must stay compact on desktop');

assert(!classes.includes('<div class="head">') && !classes.includes('Quản lý Khối &amp; Lớp học') && !classes.includes('Quản lý Khối & Lớp học'),
  'classroom page must remove the redundant page hero');
assert(/class="wrap" role="main" aria-label="Quản lý lớp học"/.test(classes)
  && classes.includes('class="sidebar-classes-head"')
  && /<h1>🏫 Lớp học<\/h1>/.test(classes)
  && classes.includes('onclick="moFormLop()"'),
  'classroom context and create-class action must move into the first working panel');
assert(/\.wrap \{[^}]*padding: 18px 24px 96px/.test(classes)
  && /\.classroom-layout \{[^}]*margin-top: 0/.test(classes),
  'classroom content must start near the top navigation');

assert(!grading.includes('<div class="head">') && !/<h1[^>]*>Chấm bài học sinh nộp<\/h1>/.test(grading),
  'grading page must open directly at its actionable filters');
assert(/class="wrap" role="main" aria-label="Chấm bài học sinh nộp"/.test(grading)
  && grading.includes('id="loc-cho"') && grading.includes('id="selKhoi"'),
  'grading filters and accessible page context must remain intact');
assert(/\.wrap \{[^}]*padding: 18px 24px 96px/.test(grading),
  'grading page top spacing must stay compact');

assert(!schedule.includes('<div class="head">') && !/<h1[^>]*>Lịch dạy &amp; phòng học<\/h1>/.test(schedule) && !/<h1[^>]*>Lịch dạy & phòng học<\/h1>/.test(schedule),
  'schedule page must remove the redundant page hero');
assert(/class="wrap" role="main" aria-label="Lịch dạy và phòng học"/.test(schedule)
  && /class="quick-card-head"[\s\S]*href="trang-chu#weekCal"/.test(schedule),
  'schedule action must remain in the first card header');
assert(/\.wrap \{[^}]*padding: 18px 24px 96px/.test(schedule),
  'schedule form must start near the top navigation');

assert(!students.includes('<div class="head">')
  && /<div hidden aria-hidden="true">\s*<h1 id="lblTitle">/.test(students),
  'student runtime labels must remain script-compatible without occupying the top viewport');
assert(/class="wrap" role="main" aria-label="Quản lý học sinh và tài khoản"/.test(students)
  && students.includes('class="stat-strip"') && students.includes('id="locLop"'),
  'student stats and filters must remain the first visible content with an accessible main label');
assert(/\.wrap \{[^}]*padding: 18px 24px 96px/.test(students),
  'student management top spacing must stay compact');

assert(home.includes('id="loiChao"') && home.includes('Chào em'),
  'personalized Today context is useful and must not be removed by the compact-header pass');
assert(!vmtool.includes('class="vmtool-hero"') && !/<h1[^>]*>VMTool<\/h1>/.test(vmtool),
  'VMTool must not repeat its active navigation context in a large hero');
assert(/class="vmtool-wrap" role="main" aria-label="Công cụ Toán học trực quan"/.test(vmtool)
  && vmtool.includes('class="vmtool-tool-switcher"')
  && vmtool.includes('id="vmtoolModeName"') && vmtool.includes('class="vmtool-mark"'),
  'VMTool tabs and current-mode context must share the compact first row');

console.log('authenticated compact headers: static contract passed');
