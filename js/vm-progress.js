/* Shared, role-independent file/media progress. No timers invent percentages.
   Transfers use bytes; unmeasurable rendering uses explicitly labelled stages. */
(function (global) {
  'use strict';
  if (global.VMProgress) return;
  var tasks = new Map(), sequence = 0, panel, rows, scheduled = false;
  var nativeFetch = global.fetch && global.fetch.bind(global);
  var nativeReader = global.FileReader;
  var script = document.currentScript;
  var css = document.createElement('link'); css.rel = 'stylesheet';
  css.href = new URL('../css/vm-progress.css?v=20261004', script ? script.src : location.origin + '/js/vm-progress.js').href;
  (document.head || document.documentElement).appendChild(css);

  function ensurePanel() {
    if (!document.body) return;
    if (!panel) {
      panel = document.createElement('aside'); panel.id = 'vm-transfer-progress';
      panel.setAttribute('data-html2canvas-ignore', 'true');
      panel.setAttribute('aria-label', 'Tiến độ tệp và hình ảnh');
      if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
      rows = document.createElement('div'); rows.className = 'vm-progress-rows'; panel.appendChild(rows);
    }
    // A top-layer popover outside a modal is still inert. Keep it within the
    // active modal's DOM subtree as well as visually above it.
    var dialogs = document.querySelectorAll('dialog:modal'), host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
    if(panel.parentNode !== host) { try { if(panel.hasAttribute('popover'))panel.hidePopover(); } catch(_){} host.appendChild(panel); }
  }
  function paint() {
    scheduled = false; ensurePanel(); if (!panel) return;
    tasks.forEach(function (t) {
      if (!t.node) {
        var node = document.createElement('section'); node.className = 'vm-progress-item';
        var head = document.createElement('div'); head.className = 'vm-progress-head';
        var label = document.createElement('strong'); label.textContent = t.label;
        var percent = document.createElement('span'); percent.className = 'vm-progress-percent';
        var close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
        close.setAttribute('aria-label', 'Ẩn thông báo tiến độ'); close.onclick = function () { remove(t); };
        head.append(label, percent, close);
        var bar = document.createElement('progress'); bar.max = 100; bar.setAttribute('aria-label', t.label);
        var detail = document.createElement('small'); detail.setAttribute('role', 'status');
        node.append(head, bar, detail); rows.appendChild(node);
        Object.assign(t, {node:node, percentNode:percent, bar:bar, detailNode:detail, close:close});
      }
      t.node.dataset.state = t.state;
      t.percentNode.textContent = Math.floor(t.percent) + '%'; t.bar.value = t.percent;
      var detailText = (t.mode === 'steps' && t.state === 'working' ? 'Theo bước · ' : '') + t.detail;
      if (t.detailNode.textContent !== detailText) t.detailNode.textContent = detailText;
      t.close.hidden = t.state === 'working';
    });
    panel.hidden = tasks.size === 0;
    if (tasks.size && panel.hasAttribute('popover')) {
      try { if (!panel.matches(':popover-open')) panel.showPopover(); } catch (_) {}
    } else if (!tasks.size && panel.hasAttribute('popover')) { try { panel.hidePopover(); } catch (_) {} }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } }
  function remove(t) { tasks.delete(t.id); if (t.node) t.node.remove(); schedule(); }
  function start(label, options) {
    options = options || {};
    var t = {id:++sequence, label:label || 'Đang xử lý tệp', percent:0, detail:options.detail || 'Đang chuẩn bị…', mode:options.mode || 'steps', state:'working', started:Date.now()};
    tasks.set(t.id, t); schedule();
    ensurePanel();
    // Re-promote the panel above a newly opened native dialog, without focus.
    if (panel && panel.hasAttribute('popover')) { try { panel.hidePopover(); panel.showPopover(); } catch (_) {} }
    function end(state, detail) {
      if (t.state !== 'working') return;
      t.state = state; t.detail = detail;
      if (state === 'done') t.percent = 100;
      schedule(); setTimeout(function () { remove(t); }, state === 'done' ? 1600 : 10000);
    }
    return {
      update:function (percent, detail, mode) {
        if (t.state !== 'working') return;
        if (Number.isFinite(percent)) t.percent = Math.max(t.percent, Math.min(99, Math.max(0, percent)));
        if (detail) t.detail = detail; if (mode) t.mode = mode; schedule();
      },
      bytes:function (loaded, total, detail) {
        this.update(total > 0 ? loaded / total * 100 : null, detail || (total > 0 ? 'Đang truyền tệp…' : 'Đã nhận ' + (loaded / 1048576).toFixed(1) + ' MB · chưa biết tổng dung lượng'), total > 0 ? 'bytes' : 'steps');
      },
      finish:function (detail) { end('done', detail || 'Hoàn tất'); },
      fail:function (error) { end('error', error && error.name === 'AbortError' ? 'Đã dừng thao tác' : 'Chưa hoàn tất · ' + String(error && error.message || error || 'Hãy thử lại').slice(0, 200)); },
      cancel:function () { end('cancelled', 'Đã dừng thao tác'); }
    };
  }
  function frame() { return new Promise(function (resolve) { requestAnimationFrame(function () { setTimeout(resolve, 0); }); }); }
  async function run(label, work, options) {
    var task = start(label, options);
    try { await frame(); var result = await work(task); task.finish(); return result; }
    catch (error) { task.fail(error); throw error; }
  }

  function hasFiles(body) {
    if (body instanceof Blob) return true;
    if (body instanceof FormData) { for (var value of body.values()) if (value instanceof Blob) return true; }
    return false;
  }
  function trackedRequest(url, options) {
    var method = String(options.method || 'GET').toUpperCase();
    return hasFiles(options.body) || (method !== 'GET' && (/\/functions\/v1\/latex(?:[/?]|$)/.test(url) || /\/storage\/v1\/(?:object|upload\/resumable)/.test(url)));
  }
  // Preserve auth headers, multipart boundaries, credentials, aborts and HTTP
  // statuses. Only binary uploads / compiler jobs use XHR, not ordinary RPCs.
  function transfer(url, options, suppliedTask) {
    options = options || {};
    var own = !suppliedTask, task = suppliedTask || start(/\/latex(?:[/?]|$)/.test(url) ? 'Biên dịch LaTeX' : 'Tải tệp lên', {mode:'bytes'});
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(), signal = options.signal, stopped = false;
      function cleanup() { if (signal) signal.removeEventListener('abort', abort); }
      function fail(error) { if (stopped) return; stopped = true; cleanup(); if (own) task.fail(error); reject(error); }
      function abort() { xhr.abort(); fail(new DOMException('Thao tác đã dừng', 'AbortError')); }
      if (signal && signal.aborted) { abort(); return; }
      try {
        xhr.open(options.method || 'POST', url, true); xhr.responseType = 'arraybuffer';
        xhr.withCredentials = options.credentials === 'include';
        new Headers(options.headers || {}).forEach(function (value, key) { xhr.setRequestHeader(key, value); });
      } catch(error) { fail(error); return; }
      xhr.upload.onprogress = function (event) {
        task.update(event.lengthComputable ? event.loaded / event.total * 90 : 5, 'Đang gửi tệp…', event.lengthComputable ? 'bytes' : 'steps');
      };
      xhr.upload.onload = function () { task.update(90, /\/latex(?:[/?]|$)/.test(url) ? 'Máy chủ đang biên dịch…' : 'Đang chờ máy chủ xác nhận…', 'steps'); };
      xhr.onprogress = function (event) { if (event.lengthComputable) task.update(90 + event.loaded / event.total * 9, 'Đang nhận kết quả…', 'bytes'); };
      xhr.onload = function () {
        if (stopped) return; stopped = true; cleanup();
        var headers = new Headers(); xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(function (line) { var at = line.indexOf(':'); if (at > 0) headers.append(line.slice(0, at), line.slice(at + 1).trim()); });
        if(!xhr.status) { if(own)task.fail(new Error('Không nhận được phản hồi'));reject(new TypeError('Không nhận được phản hồi'));return; }
        var response = new Response([204, 205, 304].includes(xhr.status) ? null : xhr.response, {status:xhr.status, statusText:xhr.statusText, headers:headers});
        Object.defineProperty(response, 'url', {value:xhr.responseURL || String(url)});
        if (own) {
          var apiError = '';
          if (/json/i.test(headers.get('content-type') || '')) { try { apiError = JSON.parse(new TextDecoder().decode(xhr.response)).error || ''; } catch (_) {} }
          if (response.ok && !apiError) task.finish('Máy chủ đã phản hồi'); else task.fail(new Error(apiError || 'HTTP ' + response.status));
        }
        resolve(response);
      };
      xhr.onerror = function () { fail(new TypeError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')); };
      xhr.onabort = function () { fail(new DOMException('Thao tác đã dừng', 'AbortError')); };
      xhr.ontimeout = function () { fail(new Error('Quá thời gian truyền tệp')); };
      if (signal) signal.addEventListener('abort', abort, {once:true});
      try { xhr.send(options.body == null ? null : options.body); } catch (error) { fail(error); }
    });
  }
  async function readResponse(response, kind, task) {
    var total = Number(response.headers.get('Content-Length')) || 0;
    // Compressed content-length is not the decoded stream length.
    if (response.headers.get('Content-Encoding')) total = 0;
    if (!response.body || !response.body.getReader) {
      var fallback = await Response.prototype[kind].call(response); task.finish(); return fallback;
    }
    var reader = response.body.getReader(), parts = [], received = 0;
    try {
      while (true) {
        var chunk = await reader.read(); if (chunk.done) break;
        parts.push(chunk.value); received += chunk.value.byteLength;
        task.bytes(received, total);
      }
      var blob = new Blob(parts, {type:response.headers.get('Content-Type') || 'application/octet-stream'});
      var value = kind === 'blob' ? blob : kind === 'arrayBuffer' ? await nativeBlobArrayBuffer.call(blob) : await nativeBlobText.call(blob);
      task.finish('Đã nhận đủ tệp'); return value;
    } catch (error) { task.fail(error); try { await reader.cancel(); } catch (_) {} throw error; }
    finally { reader.releaseLock(); }
  }
  async function fetchWithProgress(input, options) {
    options = options || {};
    var url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    // A Request may carry a stream / one-shot body. Leave it intact.
    if (!(input instanceof Request) && options.vmProgress !== false && trackedRequest(url, options)) return transfer(url, options);
    var response = await nativeFetch(input, options);
    if (!response.ok) return response;
    var type = response.headers.get('Content-Type') || '';
    if (!/^(?:image\/|application\/pdf|application\/octet-stream|application\/zip)/i.test(type) && !(/\/storage\/v1\/object\//.test(url) && !/json/i.test(type))) return response;
    ['blob', 'arrayBuffer', 'text'].forEach(function (kind) {
      Object.defineProperty(response, kind, {configurable:true, value:function () {
        return readResponse(response, kind, start('Tải tệp xuống', {mode:'bytes'}));
      }});
    });
    return response;
  }
  global.VMProgress = {start:start, run:run, frame:frame, transfer:transfer, readResponse:readResponse};
  if (nativeFetch) global.fetch = fetchWithProgress;

  // These browser boundaries cover existing inline handlers and newly added
  // role pages too (paste, pick, crop, annotations, imports and generated files).
  if (nativeReader) {
    ['readAsText', 'readAsDataURL', 'readAsArrayBuffer', 'readAsBinaryString'].forEach(function (method) {
      var original = nativeReader.prototype[method]; if (!original) return;
      nativeReader.prototype[method] = function (blob) {
        var reader = this, task = start('Đọc tệp', {mode:'bytes'});
        function progress(e) { task.bytes(e.loaded, e.lengthComputable ? e.total : blob.size, 'Đang đọc tệp…'); }
        function end() {
          reader.removeEventListener('progress', progress); reader.removeEventListener('loadend', end);
          if (reader.error) task.fail(reader.error); else if (reader.result == null) task.cancel(); else task.finish('Đã đọc tệp');
        }
        reader.addEventListener('progress', progress); reader.addEventListener('loadend', end, {once:true});
        try { return original.apply(reader, arguments); } catch (e) {
          reader.removeEventListener('progress', progress); reader.removeEventListener('loadend', end); task.fail(e); throw e;
        }
      };
    });
  }
  var nativeBlobText = Blob.prototype.text, nativeBlobArrayBuffer = Blob.prototype.arrayBuffer;
  ['text', 'arrayBuffer'].forEach(function (method) {
    var original = Blob.prototype[method]; if (!original || !nativeReader) return;
    Blob.prototype[method] = function () {
      var blob = this;
      return new Promise(function (resolve, reject) {
        var reader = new nativeReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(reader.error); };
        reader[method === 'text' ? 'readAsText' : 'readAsArrayBuffer'](blob);
      });
    };
  });
  var toBlob = HTMLCanvasElement.prototype.toBlob;
  if (toBlob) HTMLCanvasElement.prototype.toBlob = function (callback) {
    if(typeof callback!=='function')return toBlob.apply(this,arguments);
    var task = start('Kết xuất ảnh', {detail:'Đang mã hóa ảnh…'}), args = Array.from(arguments);
    args[0] = function (blob) { if (blob) task.finish('Đã tạo ảnh'); else task.fail(new Error('Không tạo được ảnh')); callback(blob); };
    try { return toBlob.apply(this, args); } catch (e) { task.fail(e); throw e; }
  };
  if (global.createImageBitmap) {
    var bitmap = global.createImageBitmap.bind(global);
    global.createImageBitmap = function () {
      var args = arguments; return run('Xử lý ảnh', function (task) { task.update(20, 'Đang giải mã ảnh…'); return bitmap.apply(null, args); });
    };
  }
  function html2canvasWrapper(fn) {
    if (!fn || fn.vmProgressWrapped) return fn;
    var wrapped = function () {
      var args = arguments; return run('Kết xuất giao diện', async function (task) {
        task.update(15, 'Đang dựng ảnh…'); var result = await fn.apply(global, args); task.update(95, 'Đã dựng ảnh'); return result;
      });
    }; wrapped.vmProgressWrapped = true; return wrapped;
  }
  var h2c = Object.getOwnPropertyDescriptor(global, 'html2canvas');
  if (!h2c || h2c.configurable) {
    var renderer = html2canvasWrapper(global.html2canvas);
    Object.defineProperty(global, 'html2canvas', {configurable:true, get:function () { return renderer; }, set:function (fn) { renderer = html2canvasWrapper(fn); }});
  }

  // Dynamically loaded blob/private images don't go through fetch. Their
  // decode/load completion is a stage, never a fabricated byte percentage.
  var images = new Map();
  function watchImage(img) {
    var prior = images.get(img);
    if(prior && prior.src === img.src) return;
    if(prior) { prior.task.cancel(); prior.cleanup(); }
    if (!/^(?:blob:|data:image\/)|\/storage\/v1\/object\//.test(img.src) || img.complete) return;
    var task = start('Hiển thị ảnh', {detail:'Đang tải và giải mã ảnh…'}); task.update(20);
    function cleanup() { img.removeEventListener('load', loaded); img.removeEventListener('error', failed); images.delete(img); }
    function loaded() { task.finish('Ảnh đã sẵn sàng'); cleanup(); }
    function failed() { task.fail(new Error('Không đọc được ảnh')); cleanup(); }
    images.set(img, {src:img.src,task:task,cleanup:cleanup});
    img.addEventListener('load', loaded, {once:true}); img.addEventListener('error', failed, {once:true});
  }
  function scanImages(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'IMG') watchImage(root);
    root.querySelectorAll('img').forEach(watchImage);
  }
  function init() {
    ensurePanel();
    new MutationObserver(function (changes) { changes.forEach(function (change) {
      if (change.type === 'attributes') { if(change.target.tagName==='IMG')watchImage(change.target); else if(change.attributeName==='open')schedule(); } else change.addedNodes.forEach(scanImages);
    }); images.forEach(function(record,img){if(!img.isConnected){record.task.cancel();record.cleanup();}}); }).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['src','open']});
    document.addEventListener('close',schedule,true);
    document.addEventListener('change',function(event){
      var input=event.target;
      if(input.tagName!=='INPUT' || input.type!=='file' || !input.files.length)return;
      var task=start('Chọn tệp · '+input.files.length+' tệp'); task.finish('Đã nhận tệp từ thiết bị · chưa tải lên máy chủ');
    },true);
    // Local exports and download links retain their original filenames. CORS
    // or a user-cancelled browser save is never reported as "saved on disk".
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[download]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.dataset.vmProgressBypass) return;
      var url = link.href;
      if (/^(blob:|data:)/.test(url)) {
        var task = start('Xuất tệp'); task.finish('Đã chuyển tệp đến trình tải xuống'); return;
      }
      if (!/^https?:/.test(url)) return;
      event.preventDefault();
      run('Tải tệp xuống', async function (task) {
        task.update(5, 'Đang kết nối…');
        var response = await nativeFetch(url, {credentials:'same-origin'});
        if (!response.ok) throw new Error('Không tải được tệp · HTTP ' + response.status);
        var blob = await readResponse(response, 'blob', {bytes:function (n, total, detail) { task.update(total ? 5 + n / total * 90 : 5, detail, total ? 'bytes' : 'steps'); }, finish:function () {}, fail:function () {}});
        var objectUrl = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = objectUrl; a.download = link.download; a.dataset.vmProgressBypass = 'true'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000); task.update(99, 'Đã chuyển tệp đến trình tải xuống');
      }).catch(function () { /* The progress row contains the recoverable error. */ });
    }, true);
  }
  if(navigator.clipboard){
    ['read','write'].forEach(function(method){
      var original=navigator.clipboard[method];if(!original)return;
      try{navigator.clipboard[method]=function(){
        var args=arguments;
        if(method==='write' && !Array.from(args[0]||[]).some(function(item){return item.types.some(function(type){return /^image\//.test(type);});}))return original.apply(navigator.clipboard,args);
        return run(method==='read'?'Đọc ảnh từ bộ nhớ tạm':'Sao chép ảnh',function(){return original.apply(navigator.clipboard,args);});
      };}catch(_){}
    });
  }
  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.isConnected && this.hasAttribute('download') && !this.dataset.vmProgressBypass) {
      var task = start('Xuất tệp'); task.finish('Đã chuyển tệp đến trình tải xuống');
    }
    return anchorClick.apply(this, arguments);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
