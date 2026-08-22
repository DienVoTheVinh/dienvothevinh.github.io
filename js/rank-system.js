(function () {
  'use strict';

  var MAJORS = [
    {name:'Tân Binh',symbol:'✦',color:'#9b6b43',aura:'earth',motto:'Khởi đầu một hành trình lớn.'},
    {name:'Chăm Học',symbol:'🌱',color:'#2d9b68',aura:'leaf',motto:'Đều đặn mỗi ngày là một loại siêu năng lực.'},
    {name:'Học Khá',symbol:'📘',color:'#2587bd',aura:'water',motto:'Nền tảng vững, bước chân chắc.'},
    {name:'Học Giỏi',symbol:'🏅',color:'#d79008',aura:'gold',motto:'Hiểu sâu hơn một chút mỗi ngày.'},
    {name:'Học Bá',symbol:'👑',color:'#e05472',aura:'rose',motto:'Bản lĩnh được tạo nên từ luyện tập.'},
    {name:'Cao Thủ',symbol:'⚔',color:'#8257c7',aura:'violet',motto:'Bình tĩnh trước mọi thử thách.'},
    {name:'Kỳ Tài',symbol:'✧',color:'#1b9f9a',aura:'teal',motto:'Tìm ra cách giải của riêng mình.'},
    {name:'Thiên Tài',symbol:'⚡',color:'#4676e8',aura:'storm',motto:'Tò mò là động cơ của trí tuệ.'},
    {name:'Học Thần',symbol:'🔮',color:'#783fd1',aura:'cosmic',motto:'Kiến thức kết nối thành sức mạnh.'},
    {name:'Đại Thần',symbol:'☀',color:'#ef7b17',aura:'solar',motto:'Dẫn đường bằng sự tử tế và hiểu biết.'},
    {name:'Vô Cực',symbol:'∞',color:'#2a49ad',aura:'infinite',motto:'Không ngừng học, không ngừng lớn.'}
  ];
  var MEDALS = [
    {name:'Đồng',icon:'●',cls:'bronze'},
    {name:'Bạc',icon:'◐',cls:'silver'},
    {name:'Vàng',icon:'◆',cls:'gold'},
    {name:'Kim Cương',icon:'◇',cls:'diamond'}
  ];
  var PETS = {
    kim_ho:{name:'Kim Hồ',sheet:'assets/companions/kim-ho-evolution.png',color:'#e9a20a'},
    lam_long:{name:'Lam Long',sheet:'assets/companions/lam-long-evolution.png',color:'#13a6bd'},
    van_mieu:{name:'Vân Miêu',sheet:'assets/companions/van-mieu-evolution.png',color:'#8d6bd8'}
  };
  var snapshotPromise = null;
  var current = null;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function page() { return (location.pathname.split('/').pop() || 'index').split('.')[0]; }
  function info(level) {
    var value = Math.max(1, Math.min(44, Number(level) || 1));
    var majorIndex = Math.floor((value - 1) / 4), medalIndex = (value - 1) % 4;
    return {level:value,majorIndex:majorIndex,medalIndex:medalIndex,major:MAJORS[majorIndex],medal:MEDALS[medalIndex],label:MAJORS[majorIndex].name + ' · ' + MEDALS[medalIndex].name};
  }
  function xpFloor(level) { var l=Math.max(1,Number(level)||1); return 100*(l-1)+25*(l-1)*(l-2); }
  function addCss() {
    if (document.getElementById('vmRankCss')) return;
    var link=document.createElement('link'); link.id='vmRankCss'; link.rel='stylesheet'; link.href='css/rank-system.css?v=1'; document.head.appendChild(link);
  }
  function guestData() {
    return {id:'guest',rank:{xp:485,level:4,raw_level:4,unlocked_major:1,xp_floor:450,xp_next:700,streak:4,counts:{lesson:8,btvn:5,test:2,review:3},badges:[],breakthrough:null},companion:{chosen:false,hatched:false,incubation_stage:4,owned:[],coins:85},missions:{tasks:[]}};
  }
  async function load() {
    if (snapshotPromise) return snapshotPromise;
    snapshotPromise=(async function(){
      if (sessionStorage.getItem('vm-guest-mode') === 'true') return guestData();
      var session=await sb.auth.getSession(), user=session.data && session.data.session && session.data.session.user;
      if (!user) return null;
      // hs_ho_so also refreshes the student's XP counters, so it must finish
      // before we calculate the rank snapshot.
      var profile=await sb.rpc('hs_ho_so');
      var results=await Promise.all([sb.rpc('student_rank_snapshot'),sb.rpc('companion_snapshot')]);
      var missions=profile.data||{}, rank=results[0].data||{}, companion=results[1].data||{};
      if (results[0].error) return null;
      return {id:user.id,rank:rank,companion:companion,missions:missions};
    })();
    return snapshotPromise;
  }
  function rankPill(rank, extra) {
    var meta=info(rank.level);
    return '<span class="vm-rank-pill aura-'+meta.major.aura+' '+(extra||'')+'" style="--rank-color:'+meta.major.color+'"><span class="vm-rank-symbol">'+meta.major.symbol+'</span><b>'+esc(meta.major.name)+'</b><span class="vm-rank-medal medal-'+meta.medal.cls+'">'+meta.medal.icon+' '+esc(meta.medal.name)+'</span></span>';
  }
  function injectLogo(rank) {
    var logo=document.querySelector('.topbar .logo'); if(!logo) return;
    var old=logo.querySelector('.vm-rank-logo-tag'); if(old) old.remove();
    var wrap=document.createElement('span'); wrap.className='vm-rank-logo-tag'; wrap.innerHTML=rankPill(rank,'compact'); logo.appendChild(wrap);
  }
  function injectHome(rank) {
    var slot=document.getElementById('vmRankHome'); if(!slot) return;
    var meta=info(rank.level), next=rank.xp_next, remain=next==null?0:Math.max(0,Number(next)-Number(rank.xp||0));
    slot.innerHTML='<a href="thanh-tuu" class="vm-rank-home-card aura-'+meta.major.aura+'" style="--rank-color:'+meta.major.color+'"><span class="vm-rank-home-icon">'+meta.major.symbol+'</span><span><small>CẤP BẬC HIỆN TẠI</small><b>'+esc(meta.label)+'</b><em>'+Number(rank.xp||0)+' XP'+(next==null?' · Đã chạm Vô Cực':' · Còn '+remain+' XP tới huy chương kế')+'</em></span><strong>Xem bản đồ →</strong></a>';
    var quick=document.querySelector('.vm-student-quick-grid a[href="thanh-tuu"]');
    if(quick){var b=quick.querySelector('b'),s=quick.querySelector('small');if(b)b.textContent=meta.major.name;if(s)s.textContent=meta.medal.name;}
  }
  function sprite(petCode, major, className) {
    var pet=PETS[petCode]||PETS.kim_ho, index=Math.max(0,Math.min(10,(major||1)-1));
    var col=index%4,row=Math.floor(index/4),x=(col*100/3),y=(row*50);
    return '<span class="vm-pet-sprite '+(className||'')+'" role="img" aria-label="'+esc(pet.name)+'" style="--pet-sheet:url(\''+pet.sheet+'\');--pet-x:'+x+'%;--pet-y:'+y+'%;--pet-color:'+pet.color+'"></span>';
  }
  function egg(stage, className) {
    return '<span class="vm-pet-egg egg-stage-'+Math.max(1,Math.min(4,Number(stage)||1))+' '+(className||'')+'" role="img" aria-label="Trứng linh thú trắng"><i></i></span>';
  }
  function petVisual(companion, rank, className) {
    if (!companion || !companion.chosen || !companion.hatched) return egg(companion&&companion.incubation_stage,className);
    return sprite(companion.active_code,Math.ceil(Number(rank.level||1)/4),className);
  }
  function encouragement(data) {
    var tasks=(data.missions&&data.missions.tasks)||[], meta=info(data.rank.level), pool;
    if(tasks.length) pool=['Mình còn '+tasks.length+' việc cần làm. Chọn một việc nhỏ trước nhé!','Làm xong một bài rồi nghỉ một chút, mình cổ vũ bạn!','Đừng để bài tập cô đơn lâu quá nha 😄'];
    else pool=['Hôm nay sạch việc rồi! Mình rất tự hào về bạn.','Giữ nhịp học đều nhé, '+meta.major.name+'!','Một câu khó chỉ là câu chưa tìm đúng đường thôi.'];
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function renderCompanion(data) {
    var old=document.getElementById('vmCompanionDock'); if(old) old.remove();
    var dock=document.createElement('aside'); dock.id='vmCompanionDock'; dock.className='vm-companion-dock';
    dock.innerHTML='<button type="button" class="vm-companion-character" aria-label="Tương tác với linh thú">'+petVisual(data.companion,data.rank,'dock-pet')+'</button><div class="vm-companion-speech" aria-live="polite"><button type="button" aria-label="Đóng">×</button><p>'+esc(encouragement(data))+'</p><a href="thanh-tuu#linh-thu">Xem linh thú</a></div>';
    document.body.appendChild(dock);
    var speech=dock.querySelector('.vm-companion-speech');
    dock.querySelector('.vm-companion-character').addEventListener('click',function(){speech.querySelector('p').textContent=encouragement(data);speech.classList.toggle('show');this.classList.remove('react');void this.offsetWidth;this.classList.add('react');});
    speech.querySelector('button').addEventListener('click',function(){speech.classList.remove('show');});
  }
  function modal(html, cls) {
    var layer=document.createElement('div'); layer.className='vm-rank-modal '+(cls||''); layer.innerHTML='<div class="vm-rank-modal-card">'+html+'</div>'; document.body.appendChild(layer);
    layer.addEventListener('click',function(e){if(e.target===layer||e.target.closest('[data-close-rank-modal]'))layer.remove();}); return layer;
  }
  function showEggChoice(data) {
    if(data.id==='guest' || data.companion.chosen || ['trang-chu','thanh-tuu','ca-nhan'].indexOf(page())===-1) return;
    if(document.querySelector('.vm-egg-choice')) return;
    var layer=modal('<button class="vm-modal-x" data-close-rank-modal>×</button><span class="vm-modal-kicker">LINH THÚ ĐỒNG HÀNH</span><h2>Chọn một quả trứng trắng</h2><p>Cả ba trông giống hệt nhau. Hãy học tập, truyền năng lượng XP và chờ xem người bạn nào sẽ nở ra!</p><div class="vm-egg-grid">'+[1,2,3].map(function(i){return '<button type="button" data-egg="'+i+'">'+egg(1)+'<b>Quả trứng '+i+'</b><small>Chạm để chọn</small></button>';}).join('')+'</div><small class="vm-modal-note">Linh thú được chọn ngẫu nhiên và chỉ lộ diện khi em hoàn tất giai đoạn ấp.</small>','vm-egg-choice');
    layer.querySelectorAll('[data-egg]').forEach(function(btn){btn.addEventListener('click',async function(){layer.querySelectorAll('[data-egg]').forEach(function(b){b.disabled=true;});var r=await sb.rpc('choose_companion_egg',{p_egg_slot:Number(btn.dataset.egg)});if(r.error||!r.data||!r.data.ok){alert((r.data&&r.data.message)||(r.error&&r.error.message)||'Chưa chọn được trứng');layer.querySelectorAll('[data-egg]').forEach(function(b){b.disabled=false;});return;}layer.remove();snapshotPromise=null;current=await load();renderCompanion(current);showCelebration('🥚','Trứng đã nhận năng lượng!',r.data.message);});});
  }
  function particles(layer) {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors=['#f5b400','#ff7b54','#7b61ff','#1bb7a8','#fff'];
    for(var i=0;i<42;i++){var p=document.createElement('i');p.className='vm-confetti';p.style.setProperty('--x',(Math.random()*100)+'vw');p.style.setProperty('--delay',(Math.random()*.7)+'s');p.style.setProperty('--spin',(Math.random()*720+360)+'deg');p.style.background=colors[i%colors.length];layer.appendChild(p);}
  }
  function showCelebration(icon,title,body) {
    var layer=modal('<div class="vm-celebrate-icon">'+icon+'</div><span class="vm-modal-kicker">VINHMATH CHÚC MỪNG</span><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p><button class="btn btn-primary" data-close-rank-modal>Tiếp tục hành trình</button>','vm-rank-celebration'); particles(layer);
  }
  function maybeCelebrate(data) {
    if(!data.id||data.id==='guest')return; var key='vm-rank-seen:'+data.id,now=Number(data.rank.level||1),prev=Number(localStorage.getItem(key)||0);localStorage.setItem(key,String(now));
    if(prev>0&&now>prev){var meta=info(now);showCelebration(meta.major.symbol,'Đã thăng cấp: '+meta.label,'Linh thú và hào quang của em vừa nhận một hình thái mới!');}
  }
  function maybeBreakthrough(data) {
    var b=data.rank.breakthrough;if(!b||!b.eligible)return;var target=MAJORS[Number(b.target_major)-1],status=b.status||'ready',key='vm-breakthrough:'+data.id+':'+b.target_major+':'+status;
    if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');
    var failed=status==='failed',requested=status==='requested';
    var html='<button class="vm-modal-x" data-close-rank-modal>×</button><div class="vm-breakthrough-orb">'+target.symbol+'</div><span class="vm-modal-kicker">CỘT MỐC ĐỘT PHÁ</span><h2>'+esc(requested?'Thầy/cô đã nhận yêu cầu':failed?'Mình sẽ thử lại nhé!':'Em sắp đột phá '+target.name)+'</h2><p>'+(requested?'Hãy ôn tập và chờ thầy/cô giao bài kiểm tra riêng.':failed?'Lần trước em đạt <b>'+esc(b.score)+'/10</b>. Cần từ 8 điểm; XP vẫn được giữ nguyên.':'XP đã đủ, nhưng cần vượt bài kiểm tra riêng với điểm từ <b>8/10</b> để mở đại cấp mới.')+'</p>';
    if(!requested)html+='<button class="btn btn-primary" data-request-breakthrough>'+(failed?'Xin kiểm tra lại':'Báo thầy/cô em đã sẵn sàng')+'</button>';html+='<a class="vm-modal-link" href="thanh-tuu">Xem cột mốc trên bản đồ</a>';
    var layer=modal(html,'vm-breakthrough-modal'),button=layer.querySelector('[data-request-breakthrough]');
    if(button)button.addEventListener('click',async function(){button.disabled=true;button.textContent='Đang gửi…';var r=await sb.rpc('request_rank_breakthrough');if(r.error||!r.data||!r.data.ok){button.disabled=false;button.textContent='Thử lại';alert((r.data&&r.data.message)||(r.error&&r.error.message)||'Chưa gửi được yêu cầu');return;}layer.remove();showCelebration('⚡','Đã gửi yêu cầu',r.data.message);});
  }
  async function init() {
    addCss(); current=await load(); if(!current)return; injectLogo(current.rank);injectHome(current.rank);renderCompanion(current);showEggChoice(current);maybeCelebrate(current);maybeBreakthrough(current);
    window.dispatchEvent(new CustomEvent('vm-rank-ready',{detail:current}));
  }
  window.VMRank={majors:MAJORS,medals:MEDALS,pets:PETS,info:info,xpFloor:xpFloor,rankPill:rankPill,petVisual:petVisual,load:load,init:init,getCurrent:function(){return current;},refresh:function(){snapshotPromise=null;return init();}};
})();
