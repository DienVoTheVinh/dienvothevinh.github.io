const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('quan-tri-lop.html', 'utf8');

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing fixture section: ${start}`);
  return text.slice(from, to);
}

const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
const assistantCode = between(
  source,
  '/* ===== Trợ giảng của lớp ===== */',
  '/* ===== Panel Bảng tin lớp (trong khu Bài giảng) ===== */'
);

const profiles = [
  { id: 'teacher-1', full_name: 'Cô Lê Lan', username: 'lelan', role: 'teacher' },
  { id: 'assistant-1', full_name: 'Trợ giảng Mai', username: 'tgmai', role: 'assistant' },
  { id: 'student-1', full_name: 'Học sinh Lan', username: 'hslan', role: 'student' },
];

const html = `<!doctype html><html lang="vi"><head><style>
:root { --surface:#fff; --surface-solid:#fff; --surface-2:#f4f5f7; --line:#ddd; --line-2:#bbb; --accent:#a96900; --accent-soft:#fff2d9; --ink:#172033; --ink-3:#667085; --ok:#16845b; --err:#c0392b; --warn:#a96900; }
body { margin:0; padding:24px; font-family:Arial,sans-serif; background:#f7f7f7; color:var(--ink); }
.card { max-width:760px; margin:auto; background:var(--surface); border:1px solid var(--line); border-radius:14px; }
.input { box-sizing:border-box; min-height:40px; border:1px solid var(--line-2); border-radius:9px; padding:8px 12px; background:var(--surface); color:var(--ink); }
.btn { min-height:40px; border:0; border-radius:9px; padding:8px 14px; cursor:pointer; }
.btn-primary { background:#172b57; color:white; font-weight:700; }
${styles}
</style></head><body><div id="troGiangCard"></div><script>
window.$ = function (id) { return document.getElementById(id); };
var hoSoNguoiDung = { id:'admin-1', role:'admin' };
var classDangChon = { id:'class-1', teacher_id:'owner-1', co_teacher_id:'owner-2' };
var tgDanhSachUngVien = ${JSON.stringify(profiles.filter((p) => p.role !== 'student'))};
var tgAssistantIds = [];
var tgUngVienDaChon = null;
var tgGoiYTimer = null;
window.__rows = [];
window.__profiles = ${JSON.stringify(profiles)};
function mockQuery(table) {
  var state = { table:table, filters:{}, inFilters:{} };
  state.select = function () { return state; };
  state.eq = function (column, value) { state.filters[column] = value; return state; };
  state.in = function (column, values) { state.inFilters[column] = values; return state; };
  state.order = function () { return state; };
  state.limit = function () { return state; };
  state.insert = function (payload) { window.__rows.push(payload); return Promise.resolve({ data:[payload], error:null }); };
  state.delete = function () { return state; };
  state.then = function (resolve, reject) {
    var data = [];
    if (table === 'class_assistants') data = window.__rows.filter(function (row) { return !state.filters.class_id || row.class_id === state.filters.class_id; });
    if (table === 'profiles') data = window.__profiles.filter(function (p) {
      return Object.keys(state.inFilters).every(function (key) { return state.inFilters[key].indexOf(p[key]) !== -1; });
    });
    return Promise.resolve({ data:data, error:null }).then(resolve, reject);
  };
  return state;
}
window.sb = { from:function (table) { return mockQuery(table); } };
${assistantCode}
</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.VM_CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => taiTroGiang('class-1'));

  await page.focus('#tgUsername');
  await page.fill('#tgUsername', 'Lan');
  await page.waitForTimeout(260);
  let state = await page.evaluate(() => ({
    options: [...document.querySelectorAll('#tgGoiY .tg-suggestion')].map((el) => el.innerText),
    expanded: document.querySelector('#tgUsername').getAttribute('aria-expanded'),
  }));
  if (state.options.length !== 1 || !state.options[0].includes('Cô Lê Lan') || !state.options[0].includes('Giáo viên')) {
    throw new Error(`Teacher suggestion missing: ${JSON.stringify(state)}`);
  }
  if (state.expanded !== 'true') throw new Error('Suggestion list must be announced as expanded');
  if (process.env.VM_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.VM_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/class-assistant-suggestions-mobile.png`, fullPage: true });
  }

  await page.click('#tgGoiY .tg-suggestion');
  state = await page.evaluate(() => ({
    value: document.querySelector('#tgUsername').value,
    valid: document.querySelector('#tgUsername').classList.contains('is-valid'),
    status: document.querySelector('#tgTrangThai').innerText,
  }));
  if (state.value !== '@lelan' || !state.valid || !state.status.includes('Giáo viên')) {
    throw new Error(`Teacher selection was not confirmed: ${JSON.stringify(state)}`);
  }

  await page.click('#tgAddBtn');
  await page.waitForTimeout(120);
  state = await page.evaluate(() => ({ rows:window.__rows.slice(), card:document.querySelector('#troGiangCard').innerText }));
  if (state.rows.length !== 1 || state.rows[0].assistant_id !== 'teacher-1') {
    throw new Error(`Teacher account was not added as class assistant: ${JSON.stringify(state.rows)}`);
  }
  if (!state.card.includes('Cô Lê Lan') || !state.card.includes('Giáo viên')) {
    throw new Error('Added teacher must remain visibly labelled as Giáo viên');
  }

  await page.focus('#tgUsername');
  await page.fill('#tgUsername', 'Học sinh Lan');
  await page.waitForTimeout(260);
  state = await page.evaluate(() => ({
    options:document.querySelectorAll('#tgGoiY .tg-suggestion').length,
    status:document.querySelector('#tgTrangThai').innerText,
  }));
  if (state.options !== 0 || !state.status.includes('Không tìm thấy')) {
    throw new Error(`Student accounts must not be suggested: ${JSON.stringify(state)}`);
  }

  if (process.env.VM_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.VM_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.VM_SCREENSHOT_DIR}/class-assistant-invalid-mobile.png`, fullPage: true });
  }

  await browser.close();
  console.log('PASS mobile suggestions, teacher selection, role label and student exclusion');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
