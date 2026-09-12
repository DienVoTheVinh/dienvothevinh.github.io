// Read-only outsider smoke audit. Never uses stored browser sessions or admin keys.
// Response values are intentionally omitted from reports (counts/field names only).
import vm from 'node:vm';

const site = 'https://vinhmath.com';
const findings = [];
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { response, text, data };
}
function report(label, result, extra = {}) {
  const { response, data } = result;
  const row = { label, status: response.status,
    rows: Array.isArray(data) ? data.length : undefined,
    fields: Array.isArray(data) && data[0] ? Object.keys(data[0]) : undefined,
    errorCode: !Array.isArray(data) ? data?.code : undefined, ...extra };
  findings.push(row); console.log(JSON.stringify(row));
}
const configResult = await request(`${site}/js/config.js`);
const context = { window: {} };
vm.runInNewContext(configResult.text, context, { timeout: 500 });
const { SUPABASE_URL: api, SUPABASE_ANON_KEY: key } = context.window.VINHMATH_CONFIG;
if (!key.startsWith('sb_publishable_')) throw Error('Expected a public publishable key; refusing other credentials');
const headers = { apikey: key, 'Content-Type': 'application/json' };

for (const path of ['/', '/dang-nhap', '/quan-tri-tai-khoan', '/.env', '/.git/config', '/supabase/functions/tao-tai-khoan/index.ts']) {
  const r = await request(site + path);
  report(`static:${path}`, r, { headers: Object.fromEntries(['strict-transport-security','content-security-policy','x-frame-options','x-content-type-options','referrer-policy'].map(h => [h, r.response.headers.get(h)])) });
}
for (const table of ['profiles','classes','class_students','topics','lessons','submissions','attendance','messages','notifications','attempts','attempt_answers','questions','documents','analytics_sessions','analytics_page_views','google_drive_connections','google_oauth_states','vmtools_accounts','vmtools_server_keys','vmtools_drive_connections','vmtools_payments','teacher_service_payments']) {
  const r = await request(`${api}/rest/v1/${table}?select=*&limit=1`, { headers });
  report(`table:${table}`, r);
}
for (const table of ['app_settings','blog_posts','brand_templates']) {
  const r = await request(`${api}/rest/v1/${table}?select=*&limit=1`, { headers });
  report(`public-content:${table}`, r);
}
report('private-setting:meet_link', await request(`${api}/rest/v1/app_settings?key=eq.meet_link&select=key&limit=1`,{headers}));
report('public-setting:theme_mode', await request(`${api}/rest/v1/app_settings?key=eq.theme_mode&select=key&limit=1`,{headers}));
const authSettings = await request(`${api}/auth/v1/settings`,{headers});
report('auth:public-signup',authSettings,{disabled:authSettings.data?.disable_signup,anonymousUsers:authSettings.data?.external?.anonymous_users});
for (const [name, args] of [['is_admin',{}], ['ds_nguoi_nhan',{}], ['vm_my_feature_access',{}], ['vm_public_tenant_context',{p_slug:'uyenmath'}]]) {
  const r = await request(`${api}/rest/v1/rpc/${name}`, { method:'POST', headers, body:JSON.stringify(args) });
  report(`rpc:${name}`, r);
}
// These handlers check authorization before accepting any operation. Empty/list
// payloads cannot create, delete or change accounts or send notifications.
for (const [name, body] of [['tao-tai-khoan',{}],['vinhmath-services-admin',{action:'list'}],['vmtools-release-admin',{action:'list'}],['google-drive-video-manager',{action:'status'}],['vmtools-drive',{action:'status'}]]) {
  const r = await request(`${api}/functions/v1/${name}`, { method:'POST', headers, body:JSON.stringify(body) });
  report(`edge:${name}`, r);
}
// A fabricated, unsigned identity must not turn browser-controlled data into admin authority.
const forged = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
  Buffer.from(JSON.stringify({sub:'00000000-0000-4000-8000-000000000000',role:'authenticated',app_metadata:{vinhmath_role:'admin'},exp:Math.floor(Date.now()/1000)+60})).toString('base64url'),
  Buffer.alloc(32).toString('base64url')].join('.');
report('edge:forged-admin-token', await request(`${api}/functions/v1/tao-tai-khoan`,{
  method:'POST',headers:{...headers,authorization:`Bearer ${forged}`},body:'{}'
}));
for (const bucket of ['tai-lieu','hinh-anh','vmtools-releases']) {
  const r = await request(`${api}/storage/v1/object/list/${bucket}`, { method:'POST', headers, body:JSON.stringify({prefix:'',limit:1}) });
  report(`storage-list:${bucket}`, r);
}
const failures = findings.filter(x =>
  (x.label.startsWith('table:') && x.label!=='table:topics' && x.rows>0) ||
  (x.label.startsWith('edge:') && ![401,403].includes(x.status)) ||
  (x.label.startsWith('storage-list:') && x.rows>0) ||
  (x.label==='private-setting:meet_link' && x.rows>0) ||
  (x.label==='public-setting:theme_mode' && !(x.status===200 && x.rows===1)) ||
  (x.label==='auth:public-signup' && (x.disabled!==true || x.anonymousUsers!==false))
);
console.log(JSON.stringify({completed:findings.length, failures:failures.map(x=>x.label), note:'Topics and active brand presentation are intentionally public. Empty results are not evidence that arbitrary writes are denied.'}));
if(failures.length) process.exitCode=1;
