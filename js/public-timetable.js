(function(){
 'use strict';
 var DAYS=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function dateVN(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'';}
 function classKey(s){var c=s.classes||{};return (c.name||'Lớp học')+'|'+(c.grade||'');}
 function activeRows(rows,today){return rows.filter(function(s){if(s.recurrence==='once')return s.date&&s.date>=today;if(s.start_date&&s.start_date>today)return false;if(s.end_date&&s.end_date<today)return false;return Number(s.weekday)>=1&&Number(s.weekday)<=7;});}
 function icon(type){var paths={clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',online:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',room:'<path d="M3 21V9l9-6 9 6v12M8 21v-6h8v6M8 10h1m6 0h1M2 21h20"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2"/>'};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[type]+'</svg>';}
 function render(rows,today,filter){
  var all=activeRows(rows,today),keys=Array.from(new Set(all.map(classKey))).sort(function(a,b){return a.localeCompare(b,'vi',{numeric:true});});
  if(!all.length)return '<p class="timetable-empty">Lịch khai giảng sẽ được cập nhật sớm — phụ huynh liên hệ thầy để được tư vấn.</p>';
  var selected=filter||'',data=all.filter(function(s){return !selected||classKey(s)===selected;}),todayDay=new Date(today+'T12:00:00+07:00').getUTCDay()||7;
  function card(s){var c=s.classes||{},hue=Math.round((keys.indexOf(classKey(s))*137.508+38)%360),time=String(s.start_time||'').slice(0,5)+' – '+String(s.end_time||'').slice(0,5);
   return '<article class="timetable-event" style="--class-hue:'+hue+'"><div class="event-time">'+icon('clock')+'<span>'+esc(time)+'</span></div><h4>'+esc(c.name||'Lớp học')+'</h4><div class="event-tags">'+(c.grade?'<span>Khối '+esc(c.grade)+'</span>':'')+(c.is_specialized?'<span>Chuyên</span>':'')+'</div><div class="event-mode">'+icon(s.mode==='online'?'online':'room')+esc(s.mode==='online'?'Online':'Tại lớp')+'</div>'+(s.recurrence==='biweekly'?'<small class="event-cycle">2 tuần/lần</small>':'')+(s.recurrence==='once'?'<small class="event-cycle">'+icon('calendar')+dateVN(s.date)+'</small>':'')+(s.note?'<p class="event-note">'+esc(s.note)+'</p>':'')+'</article>';
  }
  var weekly=data.filter(function(s){return s.recurrence!=='once';}),once=data.filter(function(s){return s.recurrence==='once';}).sort(function(a,b){return a.date.localeCompare(b.date)||String(a.start_time).localeCompare(String(b.start_time));});
  return '<div class="timetable-toolbar"><div><strong>'+icon('calendar')+'Thời khóa biểu</strong><span>'+keys.length+' lớp · Giờ Việt Nam (UTC+7)</span></div><label>Lọc lớp<select id="publicClassFilter"><option value="">Tất cả các lớp</option>'+keys.map(function(k){return '<option value="'+esc(k)+'"'+(selected===k?' selected':'')+'>'+esc(k.split('|')[0])+'</option>';}).join('')+'</select></label></div><div class="timetable-scroll"><div class="timetable-week">'+DAYS.map(function(day,i){var entries=weekly.filter(function(s){return Number(s.weekday)===i+1;}).sort(function(a,b){return String(a.start_time).localeCompare(String(b.start_time))||classKey(a).localeCompare(classKey(b),'vi');});return '<section class="timetable-day'+(i+1===todayDay?' is-today':'')+'"><header><h3>'+day+'</h3><span>'+(i+1===todayDay?'Hôm nay':entries.length+' ca')+'</span></header><div class="day-events">'+(entries.length?entries.map(card).join(''):'<p class="day-empty">Chưa có ca học</p>')+'</div></section>';}).join('')+'</div></div>'+(once.length?'<section class="timetable-once"><h3>Buổi học theo ngày</h3><div>'+once.map(card).join('')+'</div></section>':'')+'<p class="timetable-footnote">Lịch học thường lệ · Các ca “2 tuần/lần” theo lịch luân phiên của lớp. Liên hệ thầy để xác nhận lịch khai giảng.</p>';
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={render:render,activeRows:activeRows,classKey:classKey};return;}
 window.VMPublicTimetable={render:render};
 var host=document.getElementById('bangLichCongKhai');if(!host)return;
 var snapshot=window.VM_PUBLIC_SCHEDULE||{updatedAt:'',rows:[]},rows=snapshot.rows,filter='',busy=false,status='snapshot';
 var updatedAt=snapshot.updatedAt;
 try{var saved=JSON.parse(localStorage.getItem('vm-public-schedule-v1'));if(saved&&Array.isArray(saved.rows)&&saved.updatedAt>updatedAt){rows=saved.rows;updatedAt=saved.updatedAt;}}catch(e){}
 function paint(){
  var today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  var stamp=updatedAt?new Date(updatedAt).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'';
  host.innerHTML=render(rows,today,filter)+'<div class="timetable-sync"><span role="status">'+(status==='live'?'Đã đồng bộ lịch công khai.':status==='loading'?'Đang kiểm tra lịch mới…':'Bản lịch lưu ngày '+esc(stamp)+'. Chưa xác nhận được thay đổi mới nhất.')+'</span><button type="button"'+(busy?' disabled':'')+'>Cập nhật lịch</button></div>';
  var select=host.querySelector('select');if(select)select.addEventListener('change',function(){filter=select.value;paint();host.querySelector('select').focus({preventScroll:true});});
  host.querySelector('.timetable-sync button').addEventListener('click',refresh);
 }
 async function refresh(){
  if(busy)return;busy=true;status='loading';paint();var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
  try{
   var config=window.VINHMATH_CONFIG;if(!config)throw new Error('No config');
   // Deliberately independent of login state and the third-party client CDN.
   var response=await fetch(config.SUPABASE_URL+'/rest/v1/public_home_schedule?select=weekday,start_time,end_time,mode,recurrence,date,start_date,end_date,class_name,grade,is_specialized&order=weekday,start_time',{headers:{apikey:config.SUPABASE_ANON_KEY},signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('Schedule unavailable');var data=await response.json();if(!Array.isArray(data))throw new Error('Invalid schedule');
   rows=data.map(function(s){return {weekday:s.weekday,start_time:s.start_time,end_time:s.end_time,mode:s.mode,recurrence:s.recurrence,date:s.date,start_date:s.start_date,end_date:s.end_date,classes:{name:s.class_name,grade:s.grade,is_specialized:s.is_specialized}};});
   updatedAt=new Date().toISOString();status='live';try{localStorage.setItem('vm-public-schedule-v1',JSON.stringify({rows:rows,updatedAt:updatedAt}));}catch(e){}
  }catch(e){status='snapshot';}finally{clearTimeout(timer);busy=false;paint();}
 }
 paint();refresh();window.addEventListener('online',refresh);
})();
