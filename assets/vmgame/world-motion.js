(() => {
  'use strict';
  const icon=VMIcons.icon,environment=VMEnvironment.mount($('#scene'));
  let arrivalTimer,speechTimer,previousNight;
  const nav={home:'world',council:'council',build:'build',travel:'compass'};
  $$('.nav [data-view]').forEach(b=>b.querySelector('span').innerHTML=icon(nav[b.dataset.view]));
  $('.mission-link span').innerHTML=icon('proof');$('.brandmark').innerHTML=icon('council');
  $('#settings').innerHTML=icon('settings');$('#close-drawer').innerHTML=icon('close');
  $$('.hotspot').forEach(b=>b.querySelector('.pin').innerHTML=icon(nav[b.dataset.view]));
  $('#choose-character span').innerHTML=icon('scholar');$('#choose-region>span:last-child').innerHTML=icon('down');$('#main-action span').innerHTML=icon('arrow');$('#open-journal span').innerHTML=icon('arrow');$('.location>span').innerHTML=icon('compass');
  function finishArrival(){clearTimeout(arrivalTimer);const focused=$('#arrival').contains(document.activeElement);$('#arrival').classList.add('hidden');document.body.classList.remove('is-arriving');if(focused)$('#replay-arrival').focus();}
  function arrive(){finishArrival();if(!state.motion||reducedMotion.matches||document.hidden)return;$('#arrival-name').textContent=regions.find(r=>r.id===state.region).country;$('#arrival').classList.remove('hidden');document.body.classList.add('is-arriving');arrivalTimer=setTimeout(finishArrival,3600);}
  function greet(){const c=characters.find(c=>c.id===state.character),speech=$('#scholar-speech');clearTimeout(speechTimer);speech.textContent=`${c.name}: Cùng tìm một lời giải cho nhịp cầu nhé!`;speech.hidden=false;$('.active-scholar').classList.remove('scholar-greeting');void $('.active-scholar').offsetWidth;$('.active-scholar').classList.add('scholar-greeting');speechTimer=setTimeout(()=>{speech.hidden=true;$('.active-scholar').classList.remove('scholar-greeting')},4200);}
  function sync(){
    const effective=state.motion&&!reducedMotion.matches;state.night=Boolean(state.night);document.body.classList.toggle('night-world',state.night);$('#weather-label').textContent=state.night?'Đêm yên · 20:30':regions.find(r=>r.id===state.region).weather;
    $$('.nav [data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===activeView)));
    environment.set({motion:effective,quality:state.quality,night:state.night,enabled:activeView!=='council'});
    $('#motion').setAttribute('aria-pressed',String(effective));$('#motion').setAttribute('aria-label',reducedMotion.matches?'Hệ thống đang giảm chuyển động':effective?'Tắt chuyển động':'Bật chuyển động');$('#motion').querySelector('span').innerHTML=icon(effective?'pause':'play');$('#motion-label').textContent=effective?'Tắt chuyển động':'Bật chuyển động';
    $('#motion-explanation').textContent=reducedMotion.matches?'Đang giảm chuyển động theo cài đặt thiết bị.':!state.motion?'Chuyển động đang tắt trên trình duyệt này. Bấm “Bật chuyển động” để xem.':'';
    $('#day-night').setAttribute('aria-pressed',String(state.night));$('#day-night-label').textContent=state.night?'Ngắm ban ngày':'Ngắm ban đêm';$('#day-night').querySelector('span').innerHTML=icon(state.night?'sun':'moon');$('#replay-arrival').disabled=!effective;$('#replay-arrival').title=effective?'Xem lại cảnh vào':'Cảnh vào tạm dừng khi giảm chuyển động';if(!effective)finishArrival();if(previousNight!==state.night){previousNight=state.night;persist();}
    $$('.region-card').forEach(card=>{if(!card.querySelector('.region-emblem'))card.insertAdjacentHTML('afterbegin',`<span class="region-emblem">${icon('compass')}</span>`)});
    $$('.building>span').forEach((el,i)=>{if(!el.querySelector('svg'))el.innerHTML=icon(['scholar','build','compass'][i%3])});
    const setting=$('#setting-motion');if(setting){setting.disabled=reducedMotion.matches;setting.setAttribute('aria-describedby','settings-motion-note');let note=$('#settings-motion-note');if(!note){note=document.createElement('p');note.id='settings-motion-note';note.className='callout';setting.closest('label').after(note)}note.textContent=reducedMotion.matches?'Thiết bị đang bật Giảm chuyển động. Cảnh vào và các chuyển động được tạm dừng theo cài đặt trợ năng.':'Lựa chọn bật hoặc tắt được lưu trên trình duyệt này. Ngày và đêm vẫn có thể chuyển khi tắt chuyển động.';}
  }
  window.VMWorldMotion={sync,arrive,greet};$('#motion').onclick=()=>{if(reducedMotion.matches){toast('Thiết bị đang bật Giảm chuyển động. Có thể thay đổi trong cài đặt trợ năng của thiết bị.');return;}state.motion=!state.motion;updateWorld();sync();};$('#day-night').onclick=()=>{state.night=!state.night;persist();sync()};$('#replay-arrival').onclick=arrive;$('#skip-arrival').onclick=finishArrival;$('#scholar-interact').onclick=greet;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')finishArrival()});reducedMotion.addEventListener('change',sync);document.addEventListener('visibilitychange',()=>{if(document.hidden)finishArrival()});sync();if(!location.hash||location.hash==='#home')arrive();
})();
