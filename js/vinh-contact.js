(function(){
'use strict';
document.querySelectorAll('[data-vinh-contact]').forEach(host=>{
 host.classList.add('vinh-contact');
 host.innerHTML=`<div class="vinh-contact-heading"><strong>Liên hệ thầy Điền Võ Thế Vinh</strong><span>${host.dataset.vinhContact==='vmtools'?'Hỏi về VMTools, đăng ký sử dụng hoặc góp ý khi dạy học.':'Trao đổi về lớp học hoặc phần mềm VMTools.'}</span></div><div class="vinh-contact-actions"><a href="https://www.facebook.com/ienvothevinh" target="_blank" rel="noopener noreferrer"><span class="vinh-contact-icon" aria-hidden="true">f</span><span>Facebook cá nhân<small>Điền Võ Thế Vinh ↗</small></span></a><a href="https://zaloapp.com/qr/p/ka7whkhn35yy" target="_blank" rel="noopener noreferrer"><span class="vinh-contact-icon zalo" aria-hidden="true">Z</span><span>Zalo<small>The Vinh ↗</small></span></a><button type="button" data-contact-qr aria-haspopup="dialog">Quét mã Zalo</button></div>`;
 host.querySelector('[data-contact-qr]').onclick=()=>{
  const dialog=document.createElement('dialog');dialog.className='vinh-contact-dialog';dialog.setAttribute('aria-label','Mã Zalo The Vinh');
  dialog.innerHTML='<button type="button" class="vinh-contact-close" aria-label="Đóng mã QR">✕</button><h2>Zalo · The Vinh</h2><p>Mở Zalo và quét mã để liên hệ với thầy.</p><img src="/assets/vmtools/zalo-the-vinh.png" width="520" height="520" alt="Mã QR Zalo The Vinh"><a href="https://zaloapp.com/qr/p/ka7whkhn35yy" target="_blank" rel="noopener noreferrer">Mở Zalo trên thiết bị này ↗</a>';
  document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{dialog.remove();host.querySelector('[data-contact-qr]').focus();},{once:true});dialog.showModal();
 };
});
})();
