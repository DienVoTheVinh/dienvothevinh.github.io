const fs = require('fs');

const lesson = fs.readFileSync('bai-hoc.html', 'utf8');
const css = fs.readFileSync('css/vinhmath.css', 'utf8');
const menu = fs.readFileSync('js/menu-v5.js', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(lesson.includes('height:100dvh'), 'Lesson shell must use the dynamic mobile viewport');
expect(lesson.includes('background:var(--surface-solid); border-right:1px solid var(--line)'), 'Lesson sidebar must use an opaque surface');
expect(lesson.includes('class="sidebar-scrim"'), 'Mobile lesson sidebar must include a dismissible scrim');
expect(lesson.includes('.sidebar.open + .sidebar-scrim'), 'Sidebar scrim must become interactive only while the menu is open');
expect(lesson.includes('aria-controls="mucLuc" aria-expanded="false"'), 'Lesson menu button must expose its expanded state');
expect(lesson.includes('class="back-icon"') && lesson.includes('<svg viewBox="0 0 24 24"'), 'Back navigation must use the clean SVG icon');
expect(lesson.includes("sidebar.classList.toggle('open', shouldOpen)"), 'Mobile sidebar must support deterministic open and close actions');
expect(lesson.includes("e.key === 'Escape'"), 'Mobile sidebar must close with Escape');
expect(lesson.includes('submission-empty-card'), 'Empty submission state must retain its compact mobile styling hook');
expect(lesson.includes('class="lesson-action-shell"') && lesson.includes('vmToggleLessonAction(this,true)'), 'Mobile lesson actions must support compact focus mode');
expect(lesson.includes("localStorage.setItem('vm-lesson-action:' + lessonId"), 'Collapsed lesson actions must remember their per-lesson state');
expect(lesson.includes('class="lesson-action-restore"'), 'Collapsed lesson actions must leave a clear restore control');
expect(lesson.includes('pdf-zoom-toolbar') && lesson.includes('pdf-fit-btn'), 'PDF controls must expose stable mobile layout hooks');
expect(lesson.includes('width:min(76vw,290px)'), 'Mobile table of contents must leave reading context visible');
expect(lesson.includes('class="sb-close"'), 'Mobile table of contents must provide a direct close control');
expect(lesson.includes('.ml-bai-hd { min-height:42px'), 'Mobile table of contents rows must stay compact but touchable');
expect(!lesson.includes('id="mapHeaderLogo"'), 'Partner logo must not float as a separate overlapping header control');
expect(lesson.includes('lesson-partner-chip') && lesson.includes('.lesson-partner-chip { display:none !important; }'), 'Partner identity must stay in the teacher badge and hide cleanly on mobile');

expect(css.includes('top:var(--vm-bell-panel-top'), 'Mobile notification panel must use the measured topbar boundary');
expect(css.includes('bottom:max(8px,var(--vm-safe-bottom))'), 'Mobile notification panel must stay inside the safe viewport');
expect(css.includes('.bell-list{flex:1;min-height:0;max-height:none;overflow-y:auto}'), 'Notification items must scroll below the fixed controls');
expect(css.includes('.vm-push-state{display:inline-flex'), 'Notification permission state must be embedded inside its device card');
expect(css.includes('.vm-push-privacy{display:none}'), 'Mobile notification controls must remain compact');
expect(menu.includes("document.body.appendChild(p)"), 'Mobile notification panel must escape the filtered topbar containing block');
expect(menu.includes("topbar.getBoundingClientRect().bottom"), 'Notification panel must measure the real mobile header height');
expect(menu.includes("!p.contains(ev.target)"), 'Clicks inside the body-level notification panel must not close it');
expect(menu.includes("window.addEventListener('resize'"), 'Open notification panel must follow mobile viewport changes');
expect(menu.includes("p.style.display = mo ? 'flex' : 'none'"), 'Notification panel must use a bounded flex layout');

console.log('PASS mobile lesson shell and notification panel checks');
