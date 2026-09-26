(function () {
  'use strict';
  var prepared = new WeakMap(), pending = new Map();
  var MB = 1024 * 1024;
  async function prepare(file) {
    if (prepared.has(file)) return prepared.get(file);
    if (file.size > 30 * MB) throw new Error('Tệp “' + file.name + '” vượt 30 MB. Hãy giảm dung lượng hoặc chia PDF.');
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(file.type)) throw new Error('Chỉ nhận ảnh JPG, PNG, WebP, GIF hoặc PDF. Ảnh HEIC cần xuất sang JPG.');
    var result = file;
    // Process one image at a time; no base64 copies or simultaneous full-size canvases.
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 2 * MB && typeof createImageBitmap === 'function') {
      var bitmap, canvas;
      try {
        bitmap = await createImageBitmap(file);
        var scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
        canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
        if (blob && blob.size < file.size * 0.85) result = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg',lastModified:file.lastModified});
      } catch (_) { /* Keep the original supported file if optional optimization fails. */ }
      finally { if (bitmap) bitmap.close(); if (canvas) { canvas.width = 1; canvas.height = 1; } }
    }
    var digest = await crypto.subtle.digest('SHA-256', await result.arrayBuffer());
    var value = {file:result, manifest:{name:result.name, size:result.size, type:result.type,
      sha256:Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2,'0'); }).join('')}};
    prepared.set(file, value); return value;
  }
  function form(meta, action) {
    var fd = new FormData(); fd.append('kind', action);
    Object.keys(meta).forEach(function (key) { if (meta[key] != null && meta[key] !== '') fd.append(key, String(meta[key])); });
    return fd;
  }
  async function call(fd) { return vmGoiHamFormData('nop-bai', fd, {timeoutMs:fd.get('kind')==='nop_file'?300000:120000}); }
  async function upload(files, metadata, onProgress) {
    files = Array.from(files || []); metadata = Object.assign({}, metadata);
    if (!files.length || files.length > 30) throw new Error('Mỗi lần nộp từ 1 đến 30 ảnh/PDF.');
    var status = function (text) { if (onProgress) onProgress(text); };
    var entries = [];
    for (var i=0; i<files.length; i++) { status('Đang chuẩn bị tệp ' + (i+1) + '/' + files.length + '…'); entries.push(await prepare(files[i])); }
    var total = entries.reduce(function (n,e) { return n+e.file.size; },0);
    if (total > 600*MB) throw new Error('Tổng dung lượng sau tối ưu vượt 600 MB. Hãy chia nhỏ PDF hoặc giảm kích thước ảnh.');
    var manifest = entries.map(function (entry) { return entry.manifest; });
    var session = await sb.auth.getSession();
    if (!session.data || !session.data.session) throw new Error('Phiên đăng nhập hết hạn. Đăng nhập lại rồi gửi bài.');
    var identity = session.data.session.user.id;
    var rawKey = JSON.stringify([identity,metadata,manifest]);
    var keyBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rawKey));
    var key='vm-upload-'+Array.from(new Uint8Array(keyBytes)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    var saved;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch(_){}
    var requestId = pending.get(key) || (saved&&saved.until>Date.now()?saved.id:null) || crypto.randomUUID(); pending.set(key,requestId);
    try{sessionStorage.setItem(key,JSON.stringify({id:requestId,until:Date.now()+30*60000}));}catch(_){}
    var begin = form(metadata,'nop_begin'); begin.append('request_id', requestId); begin.append('manifest',JSON.stringify(manifest));
    status('Đăng ký bài nộp: ' + files.length + ' tệp · ' + (total/MB).toFixed(1) + ' MB…');
    var ticket;
    try { ticket = await call(begin); } catch (error) { if (/hết hạn/i.test(error.message)) {pending.delete(key);try{sessionStorage.removeItem(key);}catch(_){}} throw error; }
    var done = Object.keys(ticket.uploaded_files || {}).length, next=0, errors=[];
    async function worker() {
      while (next < entries.length && !errors.length) {
        var index=next++; if (ticket.uploaded_files && ticket.uploaded_files[String(index)]) continue;
        var entry=entries[index], success=false;
        for (var attempt=0; attempt<3 && !success; attempt++) {
          status('Đã tải ' + done + '/' + entries.length + ' tệp' + (attempt ? ' · đang thử lại tệp lỗi…' : '…'));
          var fd=form({upload_id:ticket.upload_id,file_index:index},'nop_file'); fd.append('files',entry.file);
          try { await call(fd); success=true; done++; }
          catch (error) {
            if (attempt===2 || /hết hạn|không có quyền|không khớp|đã thay đổi/i.test(error.message)) { errors.push(error); break; }
            await new Promise(function (resolve) { setTimeout(resolve, 1000*(attempt+1)); });
          }
        }
      }
    }
    // Large originals use one worker so two multipart requests cannot exhaust a
    // phone or a shared Edge isolate. Small/optimized images use two workers.
    await Promise.all(entries.some(function(e){return e.file.size>8*MB;}) ? [worker()] : [worker(),worker()]);
    if (errors.length) throw new Error('Đã giữ ' + done + '/' + files.length + ' tệp. Bấm Gửi lại để tiếp tục phần còn thiếu (trong 30 phút). ' + errors[0].message);
    status('Đã tải đủ ' + done + ' tệp. Đang xác nhận bài nộp…');
    var result=await call(form({upload_id:ticket.upload_id},'nop_finish'));
    pending.delete(key);try{sessionStorage.removeItem(key);}catch(_){} return result;
  }
  window.VMSubmissionUpload={upload:upload,prepare:prepare,maxFiles:30,maxFileBytes:30*MB,maxTotalBytes:600*MB};
})();
