(function(){
'use strict';
const views={
 workspace:['Không gian làm việc','Hai góc nội tiếp ADB và ACB cùng chắn cung AB: viết bài và dựng hình cạnh nhau.','workspace-053'],
 calculator:['Máy tính','Chiếu giao diện máy tính để hướng dẫn học sinh thao tác từng phím.','calculator'],
 geometry:['Hình học 2D','Kéo điểm, dựng hình và đánh dấu trực tiếp khi giảng bài.','geometry'],
 solid:['Hình học 3D','Hình chóp S.ABCD: hai mặt phẳng (SAC), (SBD) cắt nhau theo SO, với O = AC ∩ BD.','solid-053'],
 graphs:['Đồ thị','Biểu diễn hàm số và khám phá mối liên hệ bằng hình ảnh.','graphs'],
 cubic:['Bảng biến thiên','Hàm số y = x³ − 3x cùng bảng biến thiên, ngay trong mục Đồ thị.','cubic-053'],
 'geometry-code':['LaTeX hình phẳng','Xem mã TikZ có màu cú pháp, sao chép hoặc tải tệp .tex để đưa hình vào tài liệu.','geometry-code-053'],
 'variation-code':['LaTeX bảng biến thiên','Xuất bảng biến thiên sang mã tkz-tab, kèm khung xem mã và hình minh họa.','variation-code-053']
};
window.vmToolsShowcase=function(host,{home=false}={}){
 let theme=home?(document.documentElement.dataset.theme==='light'?'light':'dark'):(localStorage.getItem('vmtools-promo-theme')||'dark'),view='workspace';
 host.classList.add('vm-showcase','vm-launch');host.dataset.vmTheme=theme;
 host.innerHTML=`<canvas class="vm-cosmos" aria-hidden="true"></canvas><div class="vm-launch-grid"><div class="vm-intro"><div class="vm-brand"><img class="vm-app-logo" src="/vmtools/icons/icon-192.png" alt="Logo VMTools" width="96" height="96"><div><p class="vm-eyebrow">Giới thiệu</p><strong>VMTools</strong><span>Không gian dạy học</span></div></div><h2 class="vm-title">Viết bài, vẽ hình.<br>Cùng một màn hình.</h2><p class="vm-description">Trang viết, hình 2D, 3D, đồ thị và máy tính — các công cụ cho buổi dạy trực tiếp và online của bạn.</p><div class="vm-actions"><a class="vm-button vm-experience" href="${home?'/vmtool?tab=web':'?tab=web'}" ${home?'':'data-open-web'}>Trải nghiệm ngay VMTools trên web <span aria-hidden="true">↗</span></a><a class="vm-button primary" href="${home?'/vmtool#download':'#download'}">Tải VMTools <span aria-hidden="true">↓</span></a></div><p class="vm-author"><strong>Một dự án mới của thầy Điền Võ Thế Vinh</strong><span>Từ nhu cầu dạy học hằng ngày.</span></p></div><div class="vm-launch-preview"><div class="vm-stage"><div class="vm-window"><div class="vm-window-bar"><span><i></i><i></i><i></i></span><span>VMTools · ${views[view][0]}</span><span>0.5.3</span></div><img src="/assets/vmtools/workspace-053-${theme}.webp" alt="Giao diện thật VMTools: bài học hai góc nội tiếp cùng chắn cung AB" width="1680" height="1050" ${home?'loading="lazy"':'fetchpriority="high"'}></div></div><div class="vm-preview-controls"><div class="vm-theme-picker" aria-label="Giao diện VMTools"><button data-vm-theme="dark" aria-pressed="${theme==='dark'}">◐ Nền tối</button><button data-vm-theme="light" aria-pressed="${theme==='light'}">☀ Nền sáng</button></div></div></div></div><div class="vm-gallery-tabs" aria-label="Khám phá công cụ">${Object.entries(views).map(([k,[label]])=>`<button data-vm-view="${k}" aria-pressed="${view===k}">${label}</button>`).join('')}</div><p class="vm-caption">${views[view][1]}</p><div class="vm-teaching-grid"><article><span>DẠY TRỰC TIẾP</span><h3>Dựng hình khi giảng bài.</h3><p>Vẽ nhanh hình phẳng THCS, minh họa hình không gian THCS, THPT và hướng dẫn học sinh bấm máy tính.</p></article><article><span>DẠY ONLINE</span><h3>Chia sẻ một cửa sổ.</h3><p>Viết, vẽ hình và xem đồ thị cạnh nhau. Giảm việc chuyển ứng dụng và chọn lại cửa sổ chia sẻ.</p></article><article><span>SOẠN TÀI LIỆU</span><h3>Mang hình vẽ vào LaTeX.</h3><p>Xem và sao chép mã TikZ của hình phẳng, mã tkz-tab của bảng biến thiên để dùng trong tài liệu dạy học.</p></article></div><p class="vm-micro">Windows · macOS thử nghiệm · Trình duyệt Chrome</p>`;
 if(home){
  host.querySelector('.vm-experience').innerHTML='Mở VMTools trên web <svg class="home-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
  host.querySelector('.vm-actions .primary').innerHTML='Tải VMTools <svg class="home-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>';
 }
 const cosmos=window.VMToolsCosmos.mount(host);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');let revision=0,animation=null;
 function update(){
  host.dataset.vmTheme=theme;if(!home){document.body.dataset.vmTheme=theme;document.documentElement.dataset.vmTheme=theme;document.documentElement.style.colorScheme=theme;}
  const img=host.querySelector('.vm-window img'),nextView=view,nextTheme=theme,token=++revision,src='/assets/vmtools/'+views[view][2]+'-'+theme+'.webp';
  function commit(){if(token!==revision)return;const changed=img.getAttribute('src')!==src;img.src=src;img.alt='Giao diện thật VMTools · '+views[nextView][0]+' · nền '+(nextTheme==='dark'?'tối':'sáng');host.querySelector('.vm-window-bar span:nth-child(2)').textContent='VMTools · '+views[nextView][0];host.querySelector('.vm-caption').textContent=views[nextView][1];host.querySelectorAll('[data-vm-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.vmTheme===nextTheme));host.querySelectorAll('[data-vm-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.vmView===nextView));if(home&&changed&&!reduced.matches&&img.animate){if(animation)animation.cancel();animation=img.animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.2,.65,.2,1)'});}cosmos.draw();}
  // Keep the current screenshot until the next one is decoded; never flash blank.
  if(home&&img.getAttribute('src')!==src){const next=new Image();next.src=src;next.decode().then(commit).catch(()=>{});}else commit();
 }
 let reschedule=()=>{};
 host.querySelectorAll('[data-vm-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.vmTheme;localStorage.setItem('vmtools-promo-theme',theme);update();reschedule();});host.querySelectorAll('[data-vm-view]').forEach(b=>b.onclick=()=>{view=b.dataset.vmView;update();cosmos.pulse(b);reschedule();});update();
 if(home){
  new MutationObserver(()=>{theme=document.documentElement.dataset.theme==='light'?'light':'dark';update();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const order=Object.keys(views),toggle=document.createElement('button');toggle.type='button';toggle.className='vm-slideshow-toggle';
  host.querySelector('.vm-preview-controls').appendChild(toggle);
  let timer=0,inView=false,hover=false,focused=false,paused=false,suspended=false;
  function sync(){clearTimeout(timer);timer=0;const stopped=paused||reduced.matches;toggle.textContent=stopped?'▶ Tự chuyển':'Ⅱ Tạm dừng';toggle.setAttribute('aria-label',stopped?'Bật tự chuyển ảnh giới thiệu':'Tạm dừng tự chuyển ảnh giới thiệu');toggle.setAttribute('aria-pressed',String(!stopped));toggle.disabled=reduced.matches;
   if(inView&&!document.hidden&&!stopped&&!hover&&!focused&&!suspended)timer=setTimeout(()=>{view=order[(order.indexOf(view)+1)%order.length];update();sync();},6500);
  }
  reschedule=sync;toggle.onclick=()=>{paused=!paused;sync();};
  host.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;sync();}});host.addEventListener('pointerleave',()=>{hover=false;sync();});
  host.addEventListener('focusin',()=>{focused=true;sync();});host.addEventListener('focusout',e=>{if(!host.contains(e.relatedTarget)){focused=false;sync();}});
  const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();},{threshold:.15});observer.observe(host);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',()=>{if(animation)animation.cancel();sync();});
  window.addEventListener('pagehide',()=>{suspended=true;sync();});window.addEventListener('pageshow',()=>{suspended=false;sync();});sync();
 }
};
document.querySelectorAll('[data-vmtools-home]').forEach(host=>vmToolsShowcase(host,{home:true}));
})();
