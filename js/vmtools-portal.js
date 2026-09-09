(async function(){
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let data={files:[],access:{}},session=null,frame=null,accessError=false;
vmToolsShowcase($('vmtools-showcase'));
const header=document.querySelector('.vmtools-portal-head');
const hideBar=document.createElement('button');hideBar.id='vm-hide-toolbar';hideBar.className='vm-button';hideBar.textContent='Ẩn thanh';hideBar.title='Ẩn thanh điều hướng để mở rộng vùng làm việc';hideBar.setAttribute('aria-label','Ẩn thanh điều hướng');hideBar.hidden=true;header.querySelector('nav').append(hideBar);
const showBar=document.createElement('button');showBar.id='vm-show-toolbar';showBar.className='vm-show-toolbar';showBar.textContent='⌄';showBar.title='Hiện thanh điều hướng';showBar.setAttribute('aria-label','Hiện thanh điều hướng');showBar.hidden=true;document.body.append(showBar);
let barHidden=false;try{barHidden=sessionStorage.getItem('vmtools-toolbar-hidden')==='1';}catch{}
function layoutShell(){const working=!!frame&&!frame.hidden;document.body.classList.toggle('vm-working',working);document.body.classList.toggle('vm-toolbar-hidden',working&&barHidden);hideBar.hidden=!working;showBar.hidden=!working||!barHidden;}
function setBar(hidden){barHidden=hidden;try{sessionStorage.setItem('vmtools-toolbar-hidden',hidden?'1':'0');}catch{}layoutShell();(hidden?showBar:hideBar).focus();}
hideBar.onclick=()=>setBar(true);showBar.onclick=()=>setBar(false);

async function api(body){const r=await fetch(VINHMATH_CONFIG.SUPABASE_URL+'/functions/v1/vmtools-license',{method:'POST',headers:{'Content-Type':'application/json',apikey:VINHMATH_CONFIG.SUPABASE_ANON_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok||d.error)throw Error(d.error||'Chưa kết nối được máy chủ');return d;}
async function token(){const {data,error}=await sb.auth.getSession();if(error||!data.session)throw Error('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');return data.session.access_token;}
const contact='<a href="#lien-he">Liên hệ thầy Vinh</a>';
function accessMessage(){if(accessError)return 'Chưa xác minh được phiên đăng nhập. <a href="/dang-nhap?redirect=vmtool">Đăng nhập lại VinhMath →</a>';const trial=data.trial?.allowed?' Bạn có thể mở bản web để trải nghiệm các công cụ đang được thầy Vinh cho phép.':'';return (!session?'Đăng nhập bằng tài khoản giáo viên đã được kích hoạt để tải phần mềm. <a href="/dang-nhap?redirect=vmtool">Đăng nhập VinhMath →</a>':data.access?.download?'Tài khoản '+esc(data.account?.email||'giáo viên')+' đã được bật quyền tải VMTools.':'Quyền tải VMTools chưa được kích hoạt, đã bị tắt hoặc hết hạn. '+contact+' để được hỗ trợ.')+trial;}
function render(){
 $('vm-access').innerHTML=accessMessage();const r=data.release;
 $('release-label').textContent=r?'PHIÊN BẢN '+r.version:'TẢI & TRẢI NGHIỆM';$('release-notes').textContent=r?.notes||'Thông tin bản phát hành sẽ xuất hiện tại đây khi được công bố.';
 const installers=data.files.filter(f=>f.kind==='installer');
 const card=(platform,title,desc,symbol)=>{const files=installers.filter(f=>f.platform===platform);return '<article><span class="vm-platform-symbol" aria-hidden="true">'+symbol+'</span><h3>'+title+'</h3><p>'+desc+'</p>'+(files.length?files.map(f=>'<button class="vm-button primary" data-download="'+esc(f.id)+'">'+(platform==='darwin'?'Tải bản thử nghiệm':'Tải cho Windows')+' · '+(f.arch==='arm64'?'Apple Silicon':'Intel / AMD')+' ↓</button><p class="vm-download-meta">Phiên bản '+esc(f.version)+' · '+(f.size/1048576).toFixed(1)+' MB</p>'+((data.files.find(m=>m.platform===platform&&m.arch===f.arch&&m.kind==='update_manifest'))?'<button class="vm-manifest" data-download="'+esc(data.files.find(m=>m.platform===platform&&m.arch===f.arch&&m.kind==='update_manifest').id)+'">Tệp xác minh cập nhật (.vmupdate.json)</button>':'')).join(''):'<button class="vm-button" disabled>Chưa có bộ cài được công bố</button>')+'</article>';};
 $('vm-downloads').innerHTML=card('win32','Windows','Windows 11 · Máy tính Intel / AMD 64 bit. Bộ cài đầy đủ cho cài mới và cập nhật.','⊞')+card('darwin','macOS','Bản thử nghiệm cho Apple Silicon (M1 trở lên). Chưa được Apple xác thực; macOS có thể chặn mở. Mac Intel có thể dùng bản web.','⌘')+'<article><span class="vm-platform-symbol" aria-hidden="true">◎</span><h3>Web & Chrome</h3><p>Dùng trên trình duyệt, tablet hoặc Mac. Có thể cài dạng ứng dụng qua chức năng cài đặt của Chrome khi trình duyệt hỗ trợ.</p><button class="vm-button primary" data-open-web>Mở VMTools trên web ↗</button><button class="vm-button" data-install-web>Cài qua Chrome ↗</button><p class="vm-download-meta">Dùng tài khoản được cấp quyền, hoặc trải nghiệm khi thầy Vinh mở.</p></article>';
 document.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{if(!session){location.href='/dang-nhap?redirect=vmtool';return;}b.disabled=true;try{
 const file=data.files.find(f=>f.id===b.dataset.download);if(!file)throw Error('Không tìm thấy tệp phát hành.');
 $('vm-feedback').textContent='Đang tải '+file.file_name+'… Vui lòng giữ trang này mở.';
 const link=await api({action:'download',fileId:file.id,token:await token()}),url=new URL(link.url);if(url.origin!==VINHMATH_CONFIG.SUPABASE_URL)throw Error('Đường dẫn tải không hợp lệ');
 const response=await fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(600000)});if(!response.ok)throw Error('Chưa tải được tệp. Vui lòng thử lại.');
 const blob=await response.blob();if(blob.size!==file.size)throw Error('Tệp tải chưa đầy đủ. Vui lòng thử lại.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');if(digest!==file.sha256)throw Error('Tệp tải không khớp bản phát hành. Vui lòng thử lại.');
 const objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=file.file_name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
 $('vm-feedback').textContent='Đã kiểm tra tệp và chuyển đến trình tải xuống. Với cập nhật ngoại tuyến, lưu bộ cài và tệp xác minh vào cùng một thư mục.';
 }catch(e){$('vm-feedback').textContent=e.message;}finally{b.disabled=false;}});
 document.querySelectorAll('[data-install-web]').forEach(b=>b.onclick=()=>{if(!session&&!data.trial?.allowed){location.href='/dang-nhap?redirect=vmtool';return;}if(!data.access?.web&&!data.trial?.allowed){$('vm-feedback').textContent='Vui lòng liên hệ thầy Vinh để bật quyền dùng VMTools trên web.';return;}location.href='/vmtools/';});
 document.querySelectorAll('[data-open-web]').forEach(b=>b.onclick=e=>{e.preventDefault();openWeb();});
}
function downloads(){if(frame)frame.hidden=true;layoutShell();$('vmtools-content').hidden=false;document.querySelector('.vm-footer').hidden=false;$('download').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
async function openWeb(){if(!session&&!data.trial?.allowed){location.href='/dang-nhap?redirect=vmtool';return;}if(!data.access?.web&&!data.trial?.allowed){downloads();$('vm-feedback').textContent='Quyền dùng VMTools trên web chưa được kích hoạt hoặc đã hết hạn. Vui lòng liên hệ thầy Vinh.';return;}if(!frame){frame=document.createElement('iframe');frame.title='VMTools — Không gian dạy học';frame.className='vm-web-workspace';frame.style.background='var(--vm-bg)';frame.style.colorScheme=document.body.dataset.vmTheme||'dark';frame.style.visibility='hidden';frame.addEventListener('load',()=>{frame.style.visibility='visible';});frame.src='/vmtools/web-entry.html?v=053';frame.allow='clipboard-read; clipboard-write; fullscreen';$('vmtools-content').after(frame);}$('vmtools-content').hidden=true;document.querySelector('.vm-footer').hidden=true;frame.hidden=false;layoutShell();window.scrollTo(0,0);}
$('use-web').onclick=openWeb;$('show-downloads').onclick=e=>{e.preventDefault();downloads();history.replaceState(null,'','#download');};
try{
 data={...data,...await api({action:'public-catalog'})};
 const auth=await sb.auth.getSession();session=auth.data.session;
 if(session){try{data={...data,...await api({action:'web-catalog',token:await token()})};}catch(e){accessError=true;data.trial={allowed:false};$('vm-feedback').textContent=e.message;}}
 render();if(new URLSearchParams(location.search).get('tab')==='web')await openWeb();else if(location.hash==='#download'||new URLSearchParams(location.search).get('tab')==='download')downloads();
}catch(e){render();$('vm-feedback').textContent='Chưa tải được danh sách phát hành. '+e.message;}
})();
