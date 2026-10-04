(() => {
  'use strict';
  const host=document.getElementById('vmgame-preview');if(!host)return;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');let motion=true,night=false;
  try{const s=JSON.parse(localStorage.getItem('vmgame-world-v1'));if(s){motion=s.motion!==false;night=Boolean(s.night)}}catch(_){}
  const env=VMEnvironment.mount(host);
  function sync(){const effective=motion&&!reduced.matches;env.set({motion:effective,night});host.classList.toggle('preview-still',!effective);const button=document.getElementById('preview-motion');button.innerHTML=VMIcons.icon(effective?'pause':'play')+'<span>'+(effective?'Tạm dừng':'Bật chuyển động')+'</span>';button.setAttribute('aria-pressed',String(effective));document.getElementById('preview-motion-status').textContent=reduced.matches?'Bản xem trước đang giảm chuyển động theo cài đặt thiết bị.':!motion?'Chuyển động đang tắt. Bạn có thể bật lại ngay trên bản xem trước.':'';const toggle=document.getElementById('preview-night');toggle.innerHTML=VMIcons.icon(night?'sun':'moon')+'<span>'+(night?'Ban ngày':'Ban đêm')+'</span>';toggle.setAttribute('aria-pressed',String(night));}
  document.getElementById('preview-motion').onclick=()=>{if(reduced.matches)return;motion=!motion;sync()};document.getElementById('preview-night').onclick=()=>{night=!night;sync()};reduced.addEventListener('change',sync);sync();
})();
