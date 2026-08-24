(function () {
  'use strict';

  var current = null;
  var journey = { submissions: [], attempts: [], gates: [] };
  var selectedRealm = 0;
  var badges = [
    ['first_btvn','🎬','Bài nộp đầu tiên','Khởi động hành trình bằng bài nộp đầu tiên.'],['no_debt','✅','Không nợ bài','Hoàn tất sạch danh sách bài tập.'],['streak_3','🔥','Giữ lửa 3 ngày','Học tập 3 ngày liên tiếp.'],['streak_7','⚡','Một tuần bền bỉ','Giữ chuỗi học tập 7 ngày.'],['streak_14','🌋','Hai tuần rực lửa','Giữ chuỗi học tập 14 ngày.'],['streak_30','☀️','Tháng không ngừng nghỉ','Giữ chuỗi học tập 30 ngày.'],['test_5','🛡️','Chiến binh kiểm tra','Hoàn thành 5 bài kiểm tra.'],['test_10','⚔️','Không ngán đề','Hoàn thành 10 bài kiểm tra.'],['btvn_10','✍️','Máy cày BTVN','Nộp đủ 10 bài tập về nhà.'],['btvn_25','🚜','Siêu máy cày','Nộp đủ 25 bài tập về nhà.'],['review_10','🔍','Bậc thầy sửa sai','Xem lại 10 bài giáo viên đã chấm.'],['explorer_10','🧭','Nhà thám hiểm','Mở 10 bài học khác nhau.'],['diligent','📚','Siêng năng chăm chỉ','Hoàn thành 20 hoạt động học tập.'],['score_80','🏆','Học lực giỏi','Điểm tổng quát đạt từ 80.'],['perfect10','💯','Điểm 10 tuyệt đối','Chinh phục một bài với điểm tuyệt đối.'],['xp_1000','🌟','Ngàn sao kinh nghiệm','Tích lũy 1.000 XP.'],['coin_300','🪙','Nhà sưu tập xu','Tích lũy 300 xu trong hành trình.'],['nuoc_den_chan','⏰','Thánh nước đến chân','Ba lần về đích sát giờ — lần tới mình đi sớm nhé!'],['vua_cup_hoc','🫣','Vua cúp học đang hoàn lương','Một danh hiệu riêng để nhắc mình quay lại lớp đều hơn.'],['vua_luoi_lam_bai','🦥','Vua lười làm bài bị bắt quả tang','Linh thú nhắc khéo: xử lý từng bài một là hết ngay!']
  ];
  var realmPositions = [
    {x:10,y:84,label:'right'},{x:28,y:73,label:'top'},{x:47,y:82,label:'right'},{x:68,y:70,label:'right'},
    {x:86,y:59,label:'left'},{x:70,y:49,label:'right'},{x:49,y:59,label:'left'},{x:25,y:47,label:'left'},
    {x:37,y:30,label:'left'},{x:61,y:22,label:'right'},{x:84,y:12,label:'left'}
  ];

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function dateText(v) { if (!v) return ''; var d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN'); }
  function scoreText(v) { if (v == null || v === '') return ''; var n = Number(v); return Number.isFinite(n) ? n.toFixed(n % 1 ? 1 : 0) + '/10' : ''; }
  function badgeInfo(code) { return badges.find(function (item) { return item[0] === code; }) || [code,'🏵️','Huy hiệu mới','Một cột mốc học tập đã được ghi nhận.']; }
  function status(level) { var visible=Number(current.rank.level||1),raw=Number(current.rank.raw_level||visible);if(level<visible)return'completed';if(level===visible)return'current';if(level<=raw)return'awaiting';return'locked'; }
  function realmStatus(index) { var visible=Math.floor((Number(current.rank.level||1)-1)/4),raw=Math.floor((Number(current.rank.raw_level||current.rank.level||1)-1)/4);if(index<visible)return'completed';if(index===visible)return'current';if(index<=raw)return'awaiting';return'locked'; }

  function guestJourney() {
    return {
      submissions:[{id:'s1',score:9,assessment_level:'good',status:'graded',kind:'homework',submitted_at:'2026-08-20T12:00:00Z',graded_at:'2026-08-21T03:00:00Z',lessons:{title:'Rút gọn biểu thức chứa hằng đẳng thức'}}],
      attempts:[{id:'a1',score:8.5,submitted_at:'2026-08-19T10:00:00Z',exams:{title:'Bài kiểm tra số thực'}}],
      gates:[]
    };
  }

  async function loadJourney() {
    if (!current || current.id === 'guest' || !window.sb) return guestJourney();
    var responses = await Promise.all([
      sb.from('submissions').select('id,score,assessment_level,status,submitted_at,graded_at,kind,lessons(title),exams(title)').eq('student_id',current.id).order('submitted_at',{ascending:false}).limit(20),
      sb.from('attempts').select('id,score,submitted_at,lesson_id,exam_id,lessons(title),exams(title)').eq('student_id',current.id).not('submitted_at','is',null).order('submitted_at',{ascending:false}).limit(20),
      sb.from('rank_breakthrough_attempts').select('id,target_major,attempt_no,status,score,feedback,requested_at,reviewed_at').eq('student_id',current.id).order('requested_at',{ascending:false}).limit(20)
    ]);
    return {
      submissions: responses[0].error ? [] : (responses[0].data || []),
      attempts: responses[1].error ? [] : (responses[1].data || []),
      gates: responses[2].error ? [] : (responses[2].data || [])
    };
  }

  function renderHero() {
    var r=current.rank,m=VMRank.info(r.level),floor=Number(r.xp_floor||VMRank.xpFloor(r.level)),next=r.xp_next==null?floor:Number(r.xp_next),pct=r.xp_next==null?100:Math.max(0,Math.min(100,Math.round((Number(r.xp)-floor)/Math.max(1,next-floor)*100))),c=r.counts||{};
    document.getElementById('achievementSummary').innerHTML='<div><b>'+Number(c.lesson||0)+'</b><small>Bài học đã mở</small></div><div><b>'+Number(c.btvn||0)+'</b><small>Bài tập đã nộp</small></div><div><b>'+Number(c.test||0)+'</b><small>Bài kiểm tra</small></div><div><b>🔥 '+Number(r.streak||0)+'</b><small>Chuỗi ngày hiện tại</small></div>';
    var card=document.getElementById('achievementLevelCard');card.style.setProperty('--level-progress',pct+'%');card.style.setProperty('--rank-color',m.major.color);card.className='achievement-level-card aura-'+m.major.aura;card.innerHTML='<div class="achievement-rank-symbol">'+VMRank.majorMark(m.major,'hero-realm-mark')+'</div>'+VMRank.rankPill(r,'large')+'<h2>'+esc(m.label)+'</h2><p>'+Number(r.xp||0)+' XP'+(r.xp_next==null?' · Đã chạm đỉnh 44 cấp':' · còn '+Math.max(0,next-Number(r.xp||0))+' XP')+'</p><div class="achievement-progress"><i></i></div><small>Cảnh giới '+(m.majorIndex+1)+'/11 · '+esc(m.major.motto)+'</small>';
  }

  function gateNote(majorIndex, state) {
    if (majorIndex === 0) return state === 'completed' ? '✓ Điểm khởi hành đã hoàn tất' : state === 'current' ? '📍 Em đang ở điểm khởi hành' : 'Điểm khởi hành của em';
    var passed=journey.gates.find(function(item){return Number(item.target_major)===majorIndex+1&&item.status==='passed';});
    if (passed) return '✓ Đột phá '+scoreText(passed.score)+(passed.reviewed_at?' · '+dateText(passed.reviewed_at):'');
    if (state === 'completed') return '✓ Hồ sơ xác nhận em đã đi qua';
    if (state === 'current') return '📍 Em đang học tại vùng này';
    if (state === 'awaiting') return '⚡ Đang chờ kiểm tra đột phá';
    return '🔒 Chưa mở đường tới vùng này';
  }

  function mapStateLabel(state) {
    return state === 'completed' ? 'Đã qua' : state === 'current' ? 'Em ở đây' : state === 'awaiting' ? 'Chờ thi' : 'Chưa mở';
  }

  function mapArtwork(progress) {
    return '<svg class="realm-map-art" viewBox="0 0 1000 720" preserveAspectRatio="none" aria-hidden="true">'+
      '<defs><linearGradient id="vmIsland" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#dce9be"/><stop offset=".52" stop-color="#f2e5b6"/><stop offset="1" stop-color="#dbe6c6"/></linearGradient><linearGradient id="vmWater" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7e7e8"/><stop offset="1" stop-color="#9fcfd5"/></linearGradient><pattern id="vmMapGrain" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#766b4f" opacity=".08"/></pattern></defs>'+
      '<rect class="realm-map-paper" x="8" y="8" width="984" height="704" rx="34"/>'+
      '<rect class="realm-map-grain" x="8" y="8" width="984" height="704" rx="34" fill="url(#vmMapGrain)"/>'+
      '<path class="realm-map-water" d="M28 485C118 449 169 479 230 523c87 64 174 69 246 35 63-30 125-17 184 26 89 65 180 52 312-4v132H28Z"/>'+
      '<path class="realm-map-island" d="M63 600c35-91 94-159 165-207 51-35 71-80 103-145 33-67 100-99 182-91 93 9 139-56 238-70 86-12 169 26 195 102 20 59-14 109-48 151-29 36-25 77 3 113 31 41 46 95 15 135-39 50-121 46-180 40-90-8-145 29-228 45-110 21-179-17-249-47-71-30-165 31-196-26Z"/>'+
      '<path class="realm-map-river-bank" d="M824 91c-86 77-43 128-121 177-68 43-151 28-195 95-47 72-10 130-104 177-72 36-128 25-202 69"/><path class="realm-map-river" d="M824 91c-86 77-43 128-121 177-68 43-151 28-195 95-47 72-10 130-104 177-72 36-128 25-202 69"/>'+
      '<path class="realm-route-shadow" pathLength="100" d="M110 605C178 600 219 522 290 533S402 615 480 590 621 540 700 504 845 474 870 418 798 348 680 355 539 418 470 430 307 381 240 340 278 232 370 216 518 195 610 160 749 102 840 85"/>'+
      '<path class="realm-route" pathLength="100" d="M110 605C178 600 219 522 290 533S402 615 480 590 621 540 700 504 845 474 870 418 798 348 680 355 539 418 470 430 307 381 240 340 278 232 370 216 518 195 610 160 749 102 840 85"/>'+
      '<path class="realm-route-progress" pathLength="100" style="stroke-dasharray:'+progress+' 100" d="M110 605C178 600 219 522 290 533S402 615 480 590 621 540 700 504 845 474 870 418 798 348 680 355 539 418 470 430 307 381 240 340 278 232 370 216 518 195 610 160 749 102 840 85"/>'+
      '<g class="realm-map-mountains"><path d="M438 207l55-82 55 82Z"/><path d="M495 207l43-62 48 62Z"/><path d="M733 185l42-66 49 66Z"/><path d="M493 125l13 32-25 0Z" class="snow"/><path d="M775 119l11 27-22 0Z" class="snow"/></g>'+
      '<g class="realm-map-hills"><ellipse cx="138" cy="421" rx="72" ry="38"/><ellipse cx="603" cy="507" rx="95" ry="42"/><ellipse cx="861" cy="333" rx="69" ry="34"/></g>'+
      '<g class="realm-map-forest"><path d="M150 379v34M132 404l18-36 18 36ZM759 369v32M743 393l16-33 17 33ZM898 287v30M883 309l15-31 16 31Z"/><path d="M173 407v25M160 426l13-28 14 28ZM781 391v27M768 412l13-29 14 29Z"/></g>'+
      '<g class="realm-map-campus"><path d="M62 544h74v53H62Z"/><path d="m55 544 44-31 44 31Z"/><path d="M91 565h16v32M73 557h11v11M115 557h11v11"/><path d="M99 513v-18M99 495l21 7-21 7Z"/></g>'+
      '<g class="realm-map-library"><path d="M448 317h76v48h-76Z"/><path d="m440 317 46-26 46 26ZM462 330v35M486 330v35M510 330v35"/></g>'+
      '<g class="realm-map-observatory"><path d="M667 138h46M690 138v34M674 172h32"/><path d="m668 127 36-19 7 13-36 19Z"/><circle cx="706" cy="114" r="4"/></g>'+
      '<g class="realm-map-bridge"><path d="M410 492l25 20M420 482l25 20M413 488l25 20M419 498l25 20"/></g>'+
      '<g class="realm-map-compass"><circle cx="924" cy="86" r="25"/><path d="m924 67 7 19-7 19-7-19Z"/><text x="924" y="57">B</text></g>'+
      '<g class="realm-map-zones"><text x="118" y="648">HỌC VIỆN KHỞI NGUYÊN</text><text x="532" y="546">THUNG LŨNG KIÊN TRÌ</text><text x="713" y="301">CAO NGUYÊN LẬP LUẬN</text><text x="333" y="274">VƯỜN SÁNG TẠO</text><text x="700" y="70">ĐỈNH TRI THỨC</text></g>'+
      '</svg>';
  }

  function renderRealmDetail(majorIndex) {
    var major=VMRank.majors[majorIndex],zoneState=realmStatus(majorIndex);
    var nodes=VMRank.medals.map(function(medal,medalIndex){var level=majorIndex*4+medalIndex+1,s=status(level),icon=s==='completed'?'✓':s==='awaiting'?'⚡':medal.icon;return '<button class="achievement-node '+s+' medal-'+medal.cls+'" data-achievement-level="'+level+'" style="--rank-color:'+major.color+';--region:'+major.color+'"><span class="achievement-node-orb">'+icon+'</span><b>'+esc(medal.name)+'</b><small>'+VMRank.xpFloor(level)+' XP</small></button>';}).join('');
    var detail=document.getElementById('realmDetail');
    detail.style.setProperty('--region',major.color);
    detail.innerHTML='<div class="realm-detail-head"><span>'+VMRank.majorMark(major,'detail-realm-mark')+'</span><div><em>CẢNH GIỚI '+(majorIndex+1)+'/11</em><h3>'+esc(major.name)+'</h3><p>'+esc(major.motto)+' · Cấp '+(majorIndex*4+1)+'–'+(majorIndex*4+4)+'</p></div></div><div class="realm-detail-status realm-'+zoneState+'"><span>'+(zoneState==='completed'?'👣':zoneState==='current'?'📍':zoneState==='awaiting'?'⚡':'🔒')+'</span><b>'+esc(gateNote(majorIndex,zoneState))+'</b></div><div class="realm-detail-medals">'+nodes+'</div>'+(majorIndex<10?'<div class="achievement-gate"><span>⚡</span><small>Đạt từ 8/10 để mở cảnh giới kế tiếp</small></div>':'<div class="achievement-gate summit"><span>🏆</span><small>Đỉnh cao nhất của hành trình 44 cấp</small></div>');
  }

  function selectRealm(majorIndex) {
    selectedRealm=majorIndex;
    document.querySelectorAll('.realm-landmark').forEach(function(button){var selected=Number(button.dataset.realmIndex)===majorIndex;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',selected?'true':'false');});
    renderRealmDetail(majorIndex);
  }

  function renderMap() {
    var currentMajor=Math.max(0,Math.min(10,Math.floor((Number(current.rank.level||1)-1)/4)));
    selectedRealm=currentMajor;
    var progress=Math.round(currentMajor/10*100);
    var landmarks=VMRank.majors.map(function(major,majorIndex){var state=realmStatus(majorIndex),pos=realmPositions[majorIndex];return '<button class="realm-landmark label-'+pos.label+' realm-'+state+(majorIndex===selectedRealm?' selected':'')+'" data-realm-index="'+majorIndex+'" aria-pressed="'+(majorIndex===selectedRealm?'true':'false')+'" aria-label="Cảnh giới '+(majorIndex+1)+': '+esc(major.name)+', '+mapStateLabel(state)+'" style="--x:'+pos.x+'%;--y:'+pos.y+'%;--region:'+major.color+'"><span class="realm-landmark-pin"><i>'+VMRank.majorMark(major,'landmark-realm-mark')+'</i><small>'+(majorIndex+1)+'</small></span><span class="realm-landmark-copy"><b>'+esc(major.name)+'</b><em>'+mapStateLabel(state)+'</em></span></button>';}).join('');
    document.getElementById('achievementMap').innerHTML=mapArtwork(progress)+'<div class="realm-map-key"><span>Khởi hành</span><i></i><span>Đỉnh tri thức</span></div>'+landmarks;
    renderRealmDetail(selectedRealm);
  }

  function assessmentText(level) { return level==='good'?'Tốt':level==='meets'?'Đạt':level==='needs_improvement'?'Cần cố gắng':''; }
  function eventRows() {
    var rows=[];
    journey.submissions.forEach(function(item){var title=(item.lessons&&item.lessons.title)||(item.exams&&item.exams.title)||'Bài học đã nộp',score=scoreText(item.score),assessment=assessmentText(item.assessment_level);rows.push({date:item.graded_at||item.submitted_at,icon:item.kind==='test'?'🧪':'📝',type:item.status==='graded'?'Bài giáo viên đã chấm':'Bài đã nộp',title:title,value:score||assessment||'Đã ghi nhận',note:score&&assessment?assessment:''});});
    journey.attempts.forEach(function(item){rows.push({date:item.submitted_at,icon:'📊',type:'Bài kiểm tra trực tuyến',title:(item.lessons&&item.lessons.title)||(item.exams&&item.exams.title)||'Lượt làm bài',value:scoreText(item.score)||'Đã hoàn thành',note:''});});
    journey.gates.forEach(function(item){rows.push({date:item.reviewed_at||item.requested_at,icon:item.status==='passed'?'🚩':item.status==='failed'?'💪':'⚡',type:'Đột phá cảnh giới '+Number(item.target_major),title:item.status==='passed'?'Đã mở cảnh giới mới':item.status==='failed'?'Cần ôn luyện thêm':'Đang chờ thầy/cô chấm',value:scoreText(item.score)||('Lần '+Number(item.attempt_no||1)),note:item.feedback||''});});
    (current.rank.badges||[]).forEach(function(item){var badge=badgeInfo(item.code);rows.push({date:item.earned_at,icon:badge[1],type:'Huy hiệu mới',title:badge[2],value:'Đã đạt',note:badge[3]});});
    return rows.filter(function(item){return item.date;}).sort(function(a,b){return new Date(b.date)-new Date(a.date);}).slice(0,14);
  }

  function renderPortfolio() {
    var scores=journey.submissions.concat(journey.attempts).filter(function(item){return item.score!=null&&item.score!=='';}).map(function(item){return Number(item.score);}).filter(Number.isFinite),best=scores.length?Math.max.apply(null,scores):null,passed=Math.max(0,Math.floor((Number(current.rank.level||1)-1)/4)),earned=(current.rank.badges||[]).length;
    document.getElementById('portfolioHighlights').innerHTML='<div><b>'+(best==null?'—':scoreText(best))+'</b><small>Điểm cao nhất đã ghi nhận</small></div><div><b>'+passed+'/11</b><small>Cảnh giới đã đi qua</small></div><div><b>'+earned+'</b><small>Huy hiệu đã đạt</small></div>';
    var rows=eventRows(),box=document.getElementById('learningTimeline');
    if(!rows.length){box.innerHTML='<div class="portfolio-empty"><span>🌱</span><b>Nhật ký đang chờ dấu mốc đầu tiên</b><p>Học bài, nộp bài hoặc hoàn thành bài kiểm tra để bắt đầu hồ sơ.</p></div>';return;}
    box.innerHTML=rows.map(function(item,index){return '<article class="timeline-entry"><div class="timeline-marker"><span>'+item.icon+'</span><i></i></div><div class="timeline-copy"><div><small>'+esc(item.type)+'</small><time datetime="'+esc(item.date)+'">'+esc(dateText(item.date))+'</time></div><h3>'+esc(item.title)+'</h3>'+(item.note?'<p>'+esc(item.note)+'</p>':'')+'</div><strong>'+esc(item.value)+'</strong>'+(index===0?'<em>Mới nhất</em>':'')+'</article>';}).join('');
  }

  function renderBadges(){var earned={};(current.rank.badges||[]).forEach(function(b){earned[b.code]=true;});document.getElementById('achievementBadges').innerHTML=badges.map(function(b){var ok=!!earned[b[0]],fun=b[0].indexOf('vua_')===0||b[0]==='nuoc_den_chan';return '<article class="achievement-badge '+(ok?'':'locked')+(fun?' playful':'')+'"><span>'+(ok?b[1]:'🔒')+'</span><b>'+esc(b[2])+'</b><small>'+esc(ok?b[3]:'Chưa mở · '+b[3])+'</small>'+(fun?'<em>Chỉ em, phụ huynh và thầy/cô nhìn thấy</em>':'')+'</article>';}).join('');}
  function renderCompanion(){var box=document.getElementById('companionSanctuary'),c=current.companion,r=current.rank;if(!box)return;var owned=Array.isArray(c.owned)?c.owned:[];box.innerHTML='<div class="companion-sanctuary-main"><div class="companion-large">'+VMRank.petVisual(c,r,'map-pet')+'</div><div><span class="vm-modal-kicker">LINH THÚ ĐỒNG HÀNH</span><h2>'+(c.chosen?(c.hatched?esc(VMRank.pets[c.active_code].name):'Trứng đang được ấp'):'Chưa chọn trứng')+'</h2><p>'+(c.chosen?(c.hatched?'Linh thú tiến hóa cùng mỗi cảnh giới và mang hào quang của cấp bậc hiện tại.':'Học tập để trứng dần ấm lên, đổi màu, nứt vỏ và nở ở cảnh giới Chăm Học.'):'Chọn một trong ba quả trứng trắng. Loài linh thú sẽ được quyết định ngẫu nhiên khi trứng nở.')+'</p><div class="companion-actions">'+(c.chosen?'<button class="btn btn-secondary" data-pet-shop>Đổi / mở khóa linh thú · '+Number(c.coins||0)+' xu</button>':'<button class="btn btn-primary" onclick="location.reload()">Chọn trứng ngay</button>')+'</div></div></div>'+(c.hatched?'<div class="companion-owned">'+Object.keys(VMRank.pets).map(function(code){var pet=VMRank.pets[code],has=owned.indexOf(code)!==-1;return '<button data-pet="'+code+'" '+(has?'':'disabled')+'>'+VMRank.petVisual({chosen:true,hatched:true,active_code:code},r,'owned-pet')+'<b>'+esc(pet.name)+'</b><small>'+(has?(code===c.active_code?'Đang đồng hành':'Đã mở khóa'):'300 xu')+'</small></button>';}).join('')+'</div>':'');bindCompanion(box);}
  function bindCompanion(box){box.querySelectorAll('[data-pet]').forEach(function(btn){btn.addEventListener('click',async function(){var code=btn.dataset.pet,owned=current.companion.owned||[],rpc=owned.indexOf(code)!==-1?'select_companion':'purchase_companion',res=await sb.rpc(rpc,{p_companion_code:code});if(res.error||!res.data||!res.data.ok){alert((res.data&&res.data.message)||(res.error&&res.error.message));return;}location.reload();});});var shop=box.querySelector('[data-pet-shop]');if(shop)shop.addEventListener('click',function(){var ownedBox=box.querySelector('.companion-owned');if(ownedBox)ownedBox.scrollIntoView({behavior:'smooth'});});}
  function openLevel(level){var m=VMRank.info(level),s=status(level),text=s==='completed'?'✓ Em đã chinh phục huy chương này.':s==='current'?'◉ Đây là cấp hiện tại của em.':s==='awaiting'?'⚡ XP đã đủ. Em cần vượt bài kiểm tra đột phá cảnh giới.':'🔒 Cần thêm '+Math.max(0,VMRank.xpFloor(level)-Number(current.rank.xp||0))+' XP.';var d=document.getElementById('achievementDialog');document.getElementById('achievementDialogBody').innerHTML='<div class="achievement-dialog-head"><span>'+VMRank.majorMark(m.major,'dialog-realm-mark')+'</span><button class="achievement-dialog-close">✕</button></div><span class="vm-modal-kicker">CẢNH GIỚI '+(m.majorIndex+1)+'/11</span><h3 id="achievementDialogTitle">'+esc(m.label)+'</h3><p>Cấp '+level+'/44 · mốc '+VMRank.xpFloor(level)+' XP. Em nhận XP khi học bài, nộp bài, làm kiểm tra và xem lại bài giáo viên đã sửa.</p><div class="achievement-dialog-status">'+esc(text)+'</div>';d.querySelector('button').onclick=function(){d.close();};d.showModal();}
  async function load(){if(!window.VMRank){setTimeout(load,60);return;}current=await VMRank.load();if(!current)return;journey=await loadJourney();renderHero();renderMap();renderPortfolio();renderBadges();renderCompanion();document.querySelectorAll('.companion-owned button[disabled]').forEach(function(button){button.disabled=false;button.classList.add('locked');});}
  document.addEventListener('click',function(e){var landmark=e.target.closest('[data-realm-index]');if(landmark&&current){selectRealm(Number(landmark.dataset.realmIndex));return;}var n=e.target.closest('[data-achievement-level]');if(n&&current)openLevel(Number(n.dataset.achievementLevel));});var dialog=document.getElementById('achievementDialog');if(dialog)dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close();});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
