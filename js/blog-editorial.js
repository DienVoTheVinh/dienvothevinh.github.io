(function(root){
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeImage(value){var s=String(value||'').trim();return /^(?:https:\/\/|(?:\/)?(?:assets|img)\/)[^\s"'<>\\]+$/i.test(s)?s:'';}
  function topic(p){var s=String(p.title||'').toLowerCase();return s.includes('siêu nhận thức')?'Cách suy nghĩ':s.includes('vinhmath')?'Về VinhMath':'Việc học toán';}
  function card(p,options){
    options=options||{};var image=safeImage(p.cover_url),id=encodeURIComponent(p.id),date=new Date(p.created_at);
    var stamp=Number.isNaN(date.getTime())?'':date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
    return '<article class="editorial-card"><a class="editorial-card-link" href="blog?id='+id+'">'+
      (image?'<div class="editorial-art"><img src="'+esc(image)+'" alt="" width="1536" height="1024" loading="lazy" decoding="async"></div>':'<div class="editorial-art editorial-art-empty" aria-hidden="true">∑</div>')+
      '<div class="editorial-copy"><div class="editorial-eyebrow">'+esc(topic(p))+(p.published===false?' · Bản nháp':'')+'</div><h3>'+esc(p.title)+'</h3><p>'+esc(p.excerpt||'')+'</p><div class="editorial-byline">'+esc(p.author_name||'Thầy Điền Võ Thế Vinh')+'<time>'+stamp+'</time></div><span class="editorial-read">Đọc bài viết <span aria-hidden="true">↗</span></span></div></a>'+
      (options.admin?'<div class="editorial-admin"><a href="viet-blog?id='+id+'">Sửa bài</a><button type="button" data-blog-delete="'+esc(p.id)+'">Xóa</button></div>':'')+'</article>';
  }
  async function home(){
    var box=document.getElementById('blogCongKhai');if(!box)return;
    try{if(typeof daKetNoi!=='function'||!daKetNoi())throw Error('offline');var r=await sb.from('blog_posts').select('id,title,excerpt,author_name,created_at,cover_url').eq('published',true).order('created_at',{ascending:false}).limit(3);if(r.error)throw r.error;box.innerHTML=r.data.length?r.data.map(function(p){return card(p);}).join(''):'<p class="editorial-status">Bài viết đang được cập nhật.</p>';}
    catch(_){box.innerHTML='<p class="editorial-status">Chưa tải được bài viết. <a href="blog">Mở trang Blog</a></p>';}
  }
  var api={esc:esc,safeImage:safeImage,topic:topic,card:card,home:home};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VMBlog=api;
})(typeof window!=='undefined'?window:this);
