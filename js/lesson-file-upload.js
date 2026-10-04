(function () {
  'use strict';
  // TUS sends bounded chunks and recovers the server offset after a lost response.
  var CHUNK = 6 * 1024 * 1024;
  function b64(value) { return btoa(Array.from(new TextEncoder().encode(value)).map(function(b){return String.fromCharCode(b);}).join('')); }
  async function request(url, options, progress) {
    var controller = new AbortController(), timer = setTimeout(function(){controller.abort();},90000);
    try {
      var session = await sb.auth.getSession();
      if (!session.data.session) throw new Error('Phiên đăng nhập đã hết hạn.');
      options.headers = Object.assign({'Tus-Resumable':'1.0.0',Authorization:'Bearer '+session.data.session.access_token},options.headers);
      var send = progress && window.VMProgress ? function(url,opts){return VMProgress.transfer(url,opts,progress);} : fetch;
      var res = await send(url,Object.assign({},options,{signal:controller.signal,vmProgress:false}));
      if (!res.ok) { var err=new Error('Tải tệp: HTTP '+res.status+' — '+(await res.text()).slice(0,240)); err.status=res.status; throw err; }
      return res;
    } finally { clearTimeout(timer); }
  }
  async function upload(bucket,path,file,options) {
    var task=window.VMProgress && VMProgress.start('Tải tài liệu lên',{mode:'bytes'});
    try {
      if (!file || !file.size) throw new Error('Tệp trống hoặc không đọc được.');
      if (file.size > 50000000) throw new Error('Kho tài liệu nhận tối đa 50 MB/tệp. Hãy chia nhỏ PDF trước khi tải.');
      var base = new URL(window.VINHMATH_CONFIG.SUPABASE_URL);
      base.hostname=base.hostname.replace('.supabase.co','.storage.supabase.co');
      var endpoint=base.origin+'/storage/v1/upload/resumable';
      var metadata={bucketName:bucket,objectName:path,contentType:(options||{}).contentType||file.type||'application/octet-stream',cacheControl:'3600'};
      var res=await request(endpoint,{method:'POST',headers:{'Upload-Length':String(file.size),'Upload-Metadata':Object.keys(metadata).map(function(k){return k+' '+b64(metadata[k]);}).join(',')}});
      var location=res.headers.get('Location');
      if (!location) throw new Error('Máy chủ không trả phiên tải tệp.');
      var url=new URL(location,endpoint);
      if (url.origin!==base.origin) throw new Error('Địa chỉ tải tệp không hợp lệ.');
      var offset=0, retries=0;
      while(offset<file.size) {
        try {
          var chunk=file.slice(offset,offset+CHUNK);
          res=await request(url.href,{method:'PATCH',headers:{'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:chunk},task && {update:function(percent,detail){task.update((offset+chunk.size*Math.min(1,percent/90))/file.size*99,detail);}});
          var next=Number(res.headers.get('Upload-Offset'));
          if (!Number.isFinite(next)||next<=offset||next>file.size) throw new Error('Máy chủ trả tiến độ tệp không hợp lệ.');
          offset=next; retries=0;
          if(task)task.update(offset/file.size*99,'Máy chủ đã nhận '+Math.round(offset/file.size*100)+'% tệp');
          var button=document.getElementById('nutLuu');
          if(button) button.textContent='Đang tải tệp · '+Math.round(offset/file.size*100)+'%';
        } catch(error) {
          if (++retries>3 || [400,401,403,404,413,415].includes(error.status)) throw error;
          await new Promise(function(resolve){setTimeout(resolve,1000*retries);});
          var head=await request(url.href,{method:'HEAD'});
          offset=Number(head.headers.get('Upload-Offset'));
          if (!Number.isInteger(offset)||offset<0||offset>file.size) throw error;
        }
      }
      if(task)task.finish('Đã lưu tài liệu'); return {data:{path:path},error:null};
    } catch(error) { if(task)task.fail(error); return {data:null,error:error}; }
  }
  window.vmUploadLessonFile=upload;
  var pdfQueue=Promise.resolve(),pdfRevision=0;
  window.vmBuildLessonPdf=function(files){
    var revision=++pdfRevision; files=Array.from(files);
    pdfQueue=pdfQueue.catch(function(){}).then(async function(){
      if(revision!==pdfRevision)return null;
      if(!files.length)return null;
      if(!window.jspdf)throw new Error('Bộ tạo PDF chưa tải xong.');
      var task=window.VMProgress && VMProgress.start('Ghép ảnh thành PDF');
      try {
      var doc=null;
      for(var i=0;i<files.length;i++){
        if(revision!==pdfRevision){if(task)task.cancel();return null;}
        var url=URL.createObjectURL(files[i]),canvas=document.createElement('canvas');
        try{
          var img=await new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(new Error('Không đọc được ảnh '+files[i].name));};im.src=url;});
          var scale=Math.min(1,3200/Math.max(img.naturalWidth,img.naturalHeight));
          var w=canvas.width=Math.max(1,Math.round(img.naturalWidth*scale)),h=canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          var ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          var orientation=w>=h?'l':'p';
          if(!doc)doc=new window.jspdf.jsPDF({orientation:orientation,unit:'px',format:[w,h]});else doc.addPage([w,h],orientation);
          doc.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',0,0,w,h);
        }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=1;}
        if(task)task.update((i+1)/files.length*95,'Đã dựng trang '+(i+1)+'/'+files.length);
        await new Promise(function(resolve){setTimeout(resolve,0);});
      }
      if(revision!==pdfRevision){if(task)task.cancel();return null;}
      var result=doc.output('blob');if(task)task.finish('Đã tạo PDF');return result;
      }catch(error){if(task)task.fail(error);throw error;}
    });return pdfQueue;
  };
})();
