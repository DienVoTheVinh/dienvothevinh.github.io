(function(){
 'use strict';
 var triggers=Array.from(document.querySelectorAll('[data-home-image]'));if(!triggers.length)return;
 var dialog=document.createElement('dialog');dialog.className='home-image-dialog';dialog.setAttribute('aria-label','Xem ảnh giao diện');
 var header=document.createElement('header'),title=document.createElement('span'),close=document.createElement('button'),zoom=document.createElement('button'),scroll=document.createElement('div'),image=document.createElement('img'),opener;
 close.type='button';close.textContent='×';close.setAttribute('aria-label','Đóng ảnh');scroll.className='image-scroll';header.append(title,close);scroll.append(image);dialog.append(header,scroll);document.body.append(dialog);
 zoom.type='button';zoom.className='image-zoom';zoom.textContent='Phóng lớn';zoom.setAttribute('aria-pressed','false');header.insertBefore(zoom,close);
 zoom.addEventListener('click',function(){var large=dialog.classList.toggle('is-zoomed');zoom.textContent=large?'Vừa màn hình':'Phóng lớn';zoom.setAttribute('aria-pressed',String(large));});
 function source(button){return document.documentElement.dataset.theme==='dark'&&button.dataset.homeDark?button.dataset.homeDark:button.dataset.homeImage;}
 function syncTheme(){
  triggers.forEach(function(button){var img=button.querySelector('img');img.classList.toggle('home-ui-raster',!button.dataset.homeDark);if(button.dataset.homeDark)img.src=source(button);});
  if(opener&&dialog.open){image.src=source(opener);image.classList.toggle('home-ui-raster',!opener.dataset.homeDark);}
 }
 syncTheme();new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 triggers.forEach(function(button){button.addEventListener('click',function(){opener=button;image.src=source(button);image.classList.toggle('home-ui-raster',!button.dataset.homeDark);image.alt=button.querySelector('img').alt;title.textContent=image.alt;dialog.classList.remove('is-zoomed');zoom.textContent='Phóng lớn';zoom.setAttribute('aria-pressed','false');dialog.showModal();scroll.scrollTop=scroll.scrollLeft=0;close.focus();});});
 close.addEventListener('click',function(){dialog.close();});dialog.addEventListener('click',function(e){if(e.target===dialog){var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',function(){image.removeAttribute('src');if(opener)opener.focus({preventScroll:true});});
})();
