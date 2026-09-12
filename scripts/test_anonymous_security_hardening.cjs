const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const html = fs.readFileSync('quan-tri-tai-khoan.html','utf8');
const students = fs.readFileSync('quan-tri-hoc-sinh.html','utf8');
const analytics = fs.readFileSync('js/analytics.js','utf8');
const sql = fs.readFileSync('supabase/migrations/20260912184636_anonymous_surface_hardening.sql','utf8');
function extract(source, name) {
  source = source.replace(/\r\n/g,'\n');
  const start = source.indexOf('function '+name+'(');
  assert(start >= 0, name);
  const end = source.indexOf('\n}\n',start);
  assert(end > start);
  return source.slice(start,end+2);
}
const context = {crypto, window:{ttBulkPortalDaTao:null,ttBulkPasswordDaTao:'',ttBulkResultsData:[
  {ok:true,fullName:'Test A',studentLogin:'a@test.invalid',parentLogin:'pa@test.invalid',password:'random-A'},
  {ok:true,fullName:'Test B',studentLogin:'b@test.invalid',parentLogin:'pb@test.invalid',password:'random-B'}
]}};
vm.createContext(context);
for(const name of ['ttMatKhauNgauNhien','ttBulkVanBanChiaSe','ttBulkTsv']) vm.runInContext(extract(html,name),context);
const passwords = new Set(Array.from({length:1000},()=>context.ttMatKhauNgauNhien()));
assert.equal(passwords.size,1000);
assert([...passwords].every(p=>p.length>=16));
for(const render of ['ttBulkVanBanChiaSe','ttBulkTsv']) {
  const result = context[render]();
  assert(result.includes('random-A') && result.includes('random-B'),render+' must retain each actual password');
}
assert(html.includes('var studentPassword = password || ttMatKhauNgauNhien()'));
assert(html.includes('password: studentPassword'));
assert(!html.includes('TT_MAT_KHAU_MAC_DINH'));

vm.runInContext(extract(students,'hsEscapeTelemetry'),context);
const payload = '<img src=x onerror="window.__securityCanary=1">';
assert(!context.hsEscapeTelemetry(payload).includes('<img'));
assert(context.hsEscapeTelemetry(payload).includes('&lt;img'));
assert(students.includes('hsEscapeTelemetry(p.device_type)'));
assert(analytics.indexOf('if (authResult.error || !profileId) return') < analytics.indexOf(".upsert({"));
assert(analytics.includes("sessionStorage.getItem('vm-session-profile-id') !== profileId"));
assert(analytics.includes('currentAuth.data.session.user.id !== profileId'));
assert(analytics.includes('new URL(document.referrer).origin'));
assert(sql.includes('revoke all on public.analytics_sessions, public.analytics_page_views from anon'));
assert(sql.includes('profile_id = (select auth.uid())'));
assert(sql.includes("device_type in ('Desktop','Tablet','Mobile')"));
assert(sql.includes('revoke truncate, references, trigger'));
assert(sql.includes('settings_public_presentation') && !/using \(key in \([^;]*'meet_link'/.test(sql));
for(const page of ['quan-tri-tai-khoan.html','quan-tri-hoc-sinh.html']) {
  for(const m of fs.readFileSync(page,'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
}
new vm.Script(analytics);
console.log('PASS anonymous hardening: strong password option, individual exports, markup escaped, session isolation, policy boundaries');
