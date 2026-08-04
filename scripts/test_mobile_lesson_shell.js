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
expect(lesson.includes('pdf-zoom-toolbar') && lesson.includes('pdf-fit-btn'), 'PDF controls must expose stable mobile layout hooks');

expect(css.includes('top:var(--vm-bell-panel-top'), 'Mobile notification panel must use the measured topbar boundary');
expect(css.includes('bottom:max(8px,var(--vm-safe-bottom))'), 'Mobile notification panel must stay inside the safe viewport');
expect(css.includes('.bell-list{flex:1;min-height:0;max-height:none;overflow-y:auto}'), 'Notification items must scroll below the fixed controls');
expect(css.includes('.vm-push-settings-button{grid-column:1/-1'), 'Enable-notifications control must occupy a full visible mobile row');
expect(menu.includes("topbar.getBoundingClientRect().bottom"), 'Notification panel must measure the real mobile header height');
expect(menu.includes("p.style.display = mo ? 'flex' : 'none'"), 'Notification panel must use a bounded flex layout');

console.log('PASS mobile lesson shell and notification panel checks');
