(function (global) {
  'use strict';

  var items = [];
  var index = 0;
  var returnFocus = null;
  var pointerStart = null;

  function assessment(value) {
    return {
      needs_improvement:{label:'Cần cố gắng',icon:'🌱',className:'needs-improvement'},
      meets:{label:'Đạt',icon:'✓',className:'meets'},
      good:{label:'Tốt',icon:'⭐',className:'good'}
    }[value] || null;
  }

  function safeMediaUrl(value, allowImageData) {
    try {
      var raw = String(value || '');
      var url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? new URL(raw) : new URL(raw, window.location.origin);
      if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'blob:') return url.href;
      if (allowImageData && url.protocol === 'data:' && /^data:image\//i.test(raw)) return raw;
    } catch (_) {}
    return '';
  }

  function normalizedItems(value) {
    return (Array.isArray(value) ? value : []).map(function (item, itemIndex) {
      if (!item || !item.url) return null;
      var url = safeMediaUrl(item.url, true);
      if (!url) return null;
      return {
        url:url,
        name:String(item.name || ('Ảnh ' + (itemIndex + 1))),
        fallbackUrl:safeMediaUrl(item.fallbackUrl, false)
      };
    }).filter(Boolean);
  }

  function ensureViewer() {
    var viewer = document.getElementById('vmResultMediaViewer');
    if (viewer) return viewer;
    viewer = document.createElement('div');
    viewer.id = 'vmResultMediaViewer';
    viewer.className = 'vm-result-media-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-labelledby', 'vmResultMediaTitle');
    viewer.innerHTML = '<div class="vm-result-media-shell">' +
      '<header class="vm-result-media-head"><div><small>XEM ẢNH KẾT QUẢ</small><b id="vmResultMediaTitle">Ảnh bài làm</b></div><div class="vm-result-media-actions">' +
      '<button type="button" data-media-action="fullscreen" aria-label="Mở toàn màn hình">⛶ <span>Toàn màn hình</span></button>' +
      '<button type="button" data-media-action="close" aria-label="Đóng thư viện ảnh">✕ <span>Đóng</span></button></div></header>' +
      '<main class="vm-result-media-stage" data-media-stage><button class="vm-result-media-nav prev" type="button" data-media-action="prev" aria-label="Ảnh trước">‹</button>' +
      '<figure><img data-media-image alt=""><figcaption><b data-media-name></b><span data-media-counter></span><a data-media-fallback target="_blank" rel="noopener">↗ Mở ảnh gốc</a></figcaption></figure>' +
      '<button class="vm-result-media-nav next" type="button" data-media-action="next" aria-label="Ảnh tiếp theo">›</button></main>' +
      '<footer class="vm-result-media-thumbs" data-media-thumbs aria-label="Danh sách ảnh"></footer></div>';
    document.body.appendChild(viewer);

    viewer.addEventListener('click', function (event) {
      var action = event.target.closest('[data-media-action]');
      if (action) {
        var type = action.getAttribute('data-media-action');
        if (type === 'close') close();
        else if (type === 'prev') show(index - 1);
        else if (type === 'next') show(index + 1);
        else if (type === 'fullscreen') toggleFullscreen();
        return;
      }
      var thumb = event.target.closest('[data-media-index]');
      if (thumb) show(Number(thumb.getAttribute('data-media-index')));
      else if (event.target === viewer) close();
    });

    var stage = viewer.querySelector('[data-media-stage]');
    stage.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'touch') return;
      pointerStart = {id:event.pointerId,x:event.clientX,y:event.clientY};
    });
    stage.addEventListener('pointerup', function (event) {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.25) show(index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('pointercancel', function () { pointerStart = null; });

    document.addEventListener('keydown', function (event) {
      if (!viewer.classList.contains('open')) return;
      if (event.key === 'Escape') {
        if (document.fullscreenElement === viewer && document.exitFullscreen) document.exitFullscreen();
        else close();
      } else if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    return viewer;
  }

  function renderThumbs(viewer) {
    var strip = viewer.querySelector('[data-media-thumbs]');
    strip.innerHTML = '';
    items.forEach(function (item, itemIndex) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-media-index', String(itemIndex));
      button.setAttribute('aria-label', 'Mở ' + item.name);
      var image = document.createElement('img');
      image.src = item.url;
      image.alt = '';
      image.loading = 'lazy';
      var label = document.createElement('span');
      label.textContent = String(itemIndex + 1);
      button.appendChild(image); button.appendChild(label); strip.appendChild(button);
    });
  }

  function show(nextIndex) {
    if (!items.length) return;
    index = Math.max(0, Math.min(items.length - 1, Number(nextIndex) || 0));
    var viewer = ensureViewer();
    var item = items[index];
    var image = viewer.querySelector('[data-media-image]');
    var fallback = viewer.querySelector('[data-media-fallback]');
    image.hidden = false;
    image.alt = item.name;
    image.src = item.url;
    image.onerror = function () { image.hidden = true; fallback.hidden = !item.fallbackUrl; };
    fallback.href = item.fallbackUrl || item.url;
    fallback.hidden = true;
    viewer.querySelector('[data-media-name]').textContent = item.name;
    viewer.querySelector('[data-media-counter]').textContent = 'Ảnh ' + (index + 1) + '/' + items.length;
    viewer.querySelector('[data-media-action="prev"]').disabled = index <= 0;
    viewer.querySelector('[data-media-action="next"]').disabled = index >= items.length - 1;
    Array.prototype.forEach.call(viewer.querySelectorAll('[data-media-index]'), function (button) {
      var active = Number(button.getAttribute('data-media-index')) === index;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active) button.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  }

  function open(nextItems, startIndex, options) {
    items = normalizedItems(nextItems);
    if (!items.length) return false;
    var viewer = ensureViewer();
    returnFocus = document.activeElement;
    viewer.querySelector('#vmResultMediaTitle').textContent = options && options.title ? String(options.title) : 'Ảnh bài làm';
    renderThumbs(viewer);
    viewer.classList.add('open');
    document.documentElement.classList.add('vm-result-media-open');
    show(startIndex || 0);
    viewer.querySelector('[data-media-action="close"]').focus();
    return true;
  }

  function close() {
    var viewer = document.getElementById('vmResultMediaViewer');
    if (!viewer || !viewer.classList.contains('open')) return;
    if (document.fullscreenElement === viewer && document.exitFullscreen) document.exitFullscreen();
    viewer.classList.remove('open', 'fullscreen-fallback');
    document.documentElement.classList.remove('vm-result-media-open');
    items = []; index = 0;
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  function updateFullscreenButton() {
    var viewer = document.getElementById('vmResultMediaViewer');
    if (!viewer) return;
    var active = document.fullscreenElement === viewer || viewer.classList.contains('fullscreen-fallback');
    var button = viewer.querySelector('[data-media-action="fullscreen"]');
    if (button) button.innerHTML = active ? '↙ <span>Thu nhỏ</span>' : '⛶ <span>Toàn màn hình</span>';
  }

  function toggleFullscreen() {
    var viewer = ensureViewer();
    if (document.fullscreenElement === viewer && document.exitFullscreen) {
      document.exitFullscreen();
    } else if (viewer.requestFullscreen) {
      viewer.requestFullscreen().catch(function () { viewer.classList.toggle('fullscreen-fallback'); updateFullscreenButton(); });
    } else {
      viewer.classList.toggle('fullscreen-fallback'); updateFullscreenButton();
    }
  }

  global.VMStudentResultUI = {
    assessment:assessment,
    openMedia:open,
    closeMedia:close,
    showMedia:show,
    toggleMediaFullscreen:toggleFullscreen
  };
})(window);
