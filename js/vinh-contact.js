(function(){
'use strict';
document.querySelectorAll('[data-vinh-contact]').forEach(host=>{
 host.classList.add('vinh-contact');
 host.innerHTML=`<div class="vinh-contact-heading"><strong>Liên hệ thầy Điền Võ Thế Vinh</strong><span>${host.dataset.vinhContact==='vmtools'?'Hỏi về VMTools, đăng ký sử dụng hoặc góp ý khi dạy học.':'Trao đổi về lớp học hoặc phần mềm VMTools.'}</span></div><div class="vinh-contact-actions"><a href="https://www.facebook.com/ienvothevinh" target="_blank" rel="noopener noreferrer"><span class="vinh-contact-icon" aria-hidden="true">f</span><span>Facebook cá nhân<small>Điền Võ Thế Vinh ↗</small></span></a><button type="button" data-contact-qr aria-haspopup="dialog" aria-label="Quét mã Zalo"><span class="vinh-contact-icon zalo" aria-hidden="true">Z</span><span>Quét mã Zalo<small>The Vinh</small></span></button></div>`;
 host.querySelector('[data-contact-qr]').onclick=()=>{
  const dialog=document.createElement('dialog');dialog.className='vinh-contact-dialog';dialog.setAttribute('aria-label','Mã Zalo The Vinh');
  dialog.innerHTML='<button type="button" class="vinh-contact-close" aria-label="Đóng mã QR">✕</button><h2>Zalo · The Vinh</h2><p>Mở Zalo và quét mã để liên hệ với thầy.</p><img src="/assets/vmtools/zalo-the-vinh.png" width="520" height="520" alt="Mã QR Zalo The Vinh"><a href="/assets/vmtools/zalo-the-vinh.png" download="Zalo-The-Vinh.png">Lưu mã QR vào thiết bị ↓</a>';
  document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{dialog.remove();host.querySelector('[data-contact-qr]').focus();},{once:true});dialog.showModal();
 };
});
})();
