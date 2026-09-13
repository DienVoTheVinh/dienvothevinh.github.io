(()=>{'use strict';
 const token=location.hash.slice(1),message=document.getElementById('email-message'),details=document.getElementById('email-details'),button=document.getElementById('email-confirm');
 // The proof is never in a query string, referrer or persistent browser storage.
 history.replaceState(null,'',location.pathname);
 async function api(action){
  const r=await fetch(window.VINHMATH_CONFIG.SUPABASE_URL+'/functions/v1/vinhmath-email-confirm',{method:'POST',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json',apikey:window.VINHMATH_CONFIG.SUPABASE_ANON_KEY},body:JSON.stringify({action,token})});
  const data=await r.json();if(!r.ok||data.error)throw Error(data.error||'Chưa xác nhận được email');return data;
 }
 function done(){message.textContent='Đã xác nhận email và hoàn tất liên kết VMTools. Quản trị có thể cấp quyền sử dụng cho tài khoản này.';button.hidden=true;}
 button.onclick=async()=>{button.disabled=true;try{await api('confirm');done();}catch(e){message.textContent=e.message;button.disabled=false;}};
 if(!/^[a-f0-9]{64}$/.test(token)){message.textContent='Liên kết không hợp lệ. Vui lòng mở lại thư xác nhận mới nhất.';return;}
 api('preview').then(data=>{details.textContent=(data.name||'Giáo viên')+' · '+data.email;if(data.confirmed){done();return;}message.textContent='Chỉ bấm xác nhận nếu đây là email và tài khoản của bạn.';button.hidden=false;}).catch(e=>{message.textContent=e.message;});
})();
