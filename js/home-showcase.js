(function(){
 'use strict';
 var triggers=Array.from(document.querySelectorAll('[data-home-image]'));if(!triggers.length)return;
 var dialog=document.createElement('dialog');dialog.className='home-image-dialog';dialog.setAttribute('aria-label','Xem ảnh giao diện');
 var header=document.createElement('header'),title=document.createElement('span'),close=document.createElement('button'),scroll=document.createElement('div'),image=document.createElement('img'),opener;
 close.type='button';close.textContent='×';close.setAttribute('aria-label','Đóng ảnh');scroll.className='image-scroll';header.append(title,close);scroll.append(image);dialog.append(header,scroll);document.body.append(dialog);
 triggers.forEach(function(button){button.addEventListener('click',function(){opener=button;image.src=button.dataset.homeImage;image.alt=button.querySelector('img').alt;title.textContent=image.alt;dialog.showModal();close.focus();});});
 close.addEventListener('click',function(){dialog.close();});dialog.addEventListener('click',function(e){if(e.target===dialog){var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',function(){image.removeAttribute('src');if(opener)opener.focus({preventScroll:true});});
})();
