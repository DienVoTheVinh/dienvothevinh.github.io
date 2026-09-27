'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('js/public-timetable.js','utf8');
for(const id of ['dong-hanh','hoc-sinh','bien-soan'])assert.equal(html.split('id="'+id+'"').length-1,1);
for(const s of ['304','186','311','378','196','76 học sinh · 6 giáo viên · 7 phụ huynh','Sắp ra mắt','Dữ liệu giả định'])assert.ok(html.includes(s),s);
for(const file of ['monthly-report-light.svg','monthly-report-dark.svg','latex-geometry.webp','latex-combinatorics.webp'])assert.ok(fs.existsSync('assets/home-showcase/'+file));
for(const theme of ['light','dark']){const svg=fs.readFileSync('assets/home-showcase/monthly-report-'+theme+'.svg','utf8');assert.match(svg,/HỌC SINH MINH HỌA/);assert.match(svg,/DỮ LIỆU GIẢ ĐỊNH/);assert.doesNotMatch(svg,/<image|foreignObject/);assert.match(svg,/width="1440" height="1060"/);}
assert.match(html,/data-home-dark=/);assert.doesNotMatch(html,/monthly-report\.webp/);
assert.match(fs.readFileSync('js/home-showcase.js','utf8'),/dialog.open/);
assert.doesNotMatch(html,/hero-footnote|KHÁM PHÁ TIẾP|01 \/ HỆ SINH/);
assert.match(html,/home-arrow/);
assert.doesNotMatch(source,/sb\.from\(|daKetNoi\(/);
assert.match(source,/public_home_schedule\?select=/);
assert.doesNotMatch(source.match(/public_home_schedule\?select=[^']+/)[0],/meet_link|teacher_id|location|note|schedule_key/);
const snap={window:{}};vm.runInNewContext(fs.readFileSync('js/public-schedule-snapshot.js','utf8'),snap);
assert.equal(snap.window.VM_PUBLIC_SCHEDULE.rows.length,33);
for(const row of snap.window.VM_PUBLIC_SCHEDULE.rows){assert.doesNotMatch(JSON.stringify(row),/meet_link|teacher_id|location|note|profile_id/);assert.ok(row.classes.name);}
const migration=fs.readFileSync('supabase/migrations/20260927043034_public_home_schedule_projection.sql','utf8');
assert.match(migration,/s\.visible is true and c\.portal_id is null/);
assert.match(migration,/enable row level security/);
assert.match(migration,/revoke all on function public\.refresh_public_home_schedule\(\) from public, anon, authenticated/);
assert.doesNotMatch(migration,/grant select on public\.(?:classes|schedules|profiles)/);
assert.match(migration,/after insert or update or delete on public\.schedules/);
assert.match(migration,/after insert or update or delete on public\.classes/);
for(const file of ['js/home-showcase.js','js/public-timetable.js'])new vm.Script(fs.readFileSync(file,'utf8'));
async function exercise(fetchImpl){
 let events={},host={innerHTML:'',querySelector:s=>s==='select'?null:{addEventListener(){}}};
 const context={window:{...snap.window,VINHMATH_CONFIG:{SUPABASE_URL:'https://public.test',SUPABASE_ANON_KEY:'public-key'},addEventListener:(k,v)=>events[k]=v},document:{getElementById:()=>host},fetch:fetchImpl,AbortController,setTimeout,clearTimeout,Date,Intl,localStorage:{getItem(){throw Error('Blocked storage')},setItem(){throw Error('Blocked storage')}}};
 vm.runInNewContext(source,context);
 assert.ok(host.innerHTML.includes('Toán 7'),'Shipped fallback paints immediately without login or CDN');
 await new Promise(setImmediate);await new Promise(setImmediate);return host.innerHTML;
}
(async()=>{
 const offline=await exercise(async()=>{throw Error('offline')});assert.match(offline,/Bản lịch lưu ngày/);assert.match(offline,/timetable-event/);assert.doesNotMatch(offline,/Chưa tải được lịch học/);
 const live=await exercise(async(url,options)=>{assert.ok(url.includes('/public_home_schedule?'));assert.equal(options.headers.apikey,'public-key');assert.equal(options.headers.Authorization,undefined);return {ok:true,json:async()=>[{weekday:1,start_time:'18:00',end_time:'19:30',mode:'online',class_name:'Lớp <thử>',grade:7,recurrence:'weekly'}]};});assert.match(live,/Đã đồng bộ lịch công khai/);assert.match(live,/Lớp &lt;thử&gt;/);
 const empty=await exercise(async()=>({ok:true,json:async()=>[]}));assert.match(empty,/Lịch khai giảng/);assert.doesNotMatch(empty,/timetable-event/);
 console.log('Showcase: aggregate labels, anonymized snapshot, least-privilege projection, immediate fallback, storage denial, anonymous refresh and escaping passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
