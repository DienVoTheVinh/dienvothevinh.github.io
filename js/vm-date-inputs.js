/* Display Vietnamese dates on every OS; keep the original ISO field for callers/FormData. */
(function () {
  'use strict';
  if (window.VMDateInputs) return;
  var records = new Map(), activeCalendar = null;
  var valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function isoDate(y, m, d) {
    var date = new Date(0); date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
    return y >= 1 && y <= 9999 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
      ? String(y).padStart(4, '0') + '-' + pad(m) + '-' + pad(d) : '';
  }
  function parseDate(text) {
    text = String(text).trim();
    if (/^\d{8}$/.test(text)) text = text.slice(0, 2) + '/' + text.slice(2, 4) + '/' + text.slice(4);
    var parts = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    return parts ? isoDate(+parts[3], +parts[2], +parts[1]) : '';
  }
  function display(value) {
    var parts = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return parts ? parts[3] + '/' + parts[2] + '/' + parts[1] : '';
  }
  function closeCalendar() { if (activeCalendar) activeCalendar.remove(); activeCalendar = null; }
  function isVisible(node) { return !!(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'); }
  function sync(r) {
    var value = valueProperty.get.call(r.source);
    r.date.value = display(value);
    if (r.time) r.time.value = value.slice(11, 16);
    r.date.setCustomValidity(''); if (r.time) r.time.setCustomValidity('');
    r.date.setAttribute('aria-invalid', 'false');
    if (r.time) r.time.setAttribute('aria-invalid', 'false');
    r.source.setCustomValidity('');
    r.date.disabled = r.source.disabled; r.date.readOnly = r.source.readOnly;
    r.date.required = r.source.required;
    r.button.disabled = r.source.disabled || r.source.readOnly;
    r.wrap.hidden = r.source.hidden;
    if (r.time) { r.time.disabled = r.source.disabled; r.time.readOnly = r.source.readOnly; r.time.required = r.source.required; }
  }
  function formatTyping(field, isTime, event) {
    if (event && event.isComposing) return;
    var raw = field.value, caret = field.selectionStart, formatted = raw;
    if (!isTime && (/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(raw) && raw.replace(/\D/g,'').length < 8 || event && /^[/.\-]$/.test(event.data || '') && /^\d[/.\-]/.test(raw))) {
      field.dataset.vmMask = 'false'; return;
    }
    // Explicit separators also allow 3/4/2027. A numeric keyboard needs none.
    if (isTime || !/[/.\-]/.test(raw) || field.dataset.vmMask === 'true') {
      var digits = raw.replace(/\D/g, '').slice(0, isTime ? 4 : 8);
      var before = raw.slice(0, caret).replace(/\D/g, '').length;
      formatted = digits.slice(0, 2) + (digits.length > 2 ? (isTime ? ':' : '/') + digits.slice(2, 4) : '') + (!isTime && digits.length > 4 ? '/' + digits.slice(4) : '');
      field.dataset.vmMask = 'true';
      field.value = formatted;
      var position = 0, count = 0;
      while (position < formatted.length && count < before) { if (/\d/.test(formatted[position])) count++; position++; }
      field.setSelectionRange(position, position);
    }
  }
  function commit(r, emit, report) {
    var dateText = r.date.value.trim(), timeText = r.time ? r.time.value.trim() : '';
    var date = parseDate(dateText), timeValid = !r.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(timeText);
    var empty = !dateText && !timeText, valid = empty || (date && timeValid);
    var message = valid ? '' : 'Nhập ngày dd/mm/yyyy' + (r.time ? ' và giờ HH:mm (24 giờ)' : '') + ' hợp lệ.';
    var next = valid && !empty ? date + (r.time ? 'T' + timeText : '') : '';
    if (next && ((r.source.min && next < r.source.min) || (r.source.max && next > r.source.max))) {
      valid = false; message = 'Ngày giờ ngoài khoảng cho phép.';
    }
    var dateBad = !!dateText && !date, timeBad = !!r.time && (!!timeText && !timeValid || !!date && !timeText);
    r.date.setCustomValidity(dateBad || (!dateText && timeText) || (date && timeValid && !valid) ? message : '');
    if (r.time) r.time.setCustomValidity(timeBad ? message : '');
    r.source.setCustomValidity(message);
    r.date.setAttribute('aria-invalid', String(!!report && !!r.date.validationMessage));
    if (r.time) r.time.setAttribute('aria-invalid', String(!!report && !!r.time.validationMessage));
    // Invalid input cannot become an empty/no-deadline value silently.
    if (!valid) return false;
    var changed = valueProperty.get.call(r.source) !== next;
    valueProperty.set.call(r.source, next);
    if (emit && changed) {
      r.source.dispatchEvent(new Event('input', { bubbles: true }));
      r.source.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  function calendar(r) {
    closeCalendar();
    var now = new Date(), initial = parseDate(r.date.value) || isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    var year = +initial.slice(0, 4), month = +initial.slice(5, 7);
    var panel = document.createElement('div'); panel.className = 'vm-date-calendar'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chọn ngày');
    if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
    r.wrap.append(panel); activeCalendar = panel;
    function position() {
      if (!panel.hasAttribute('popover')) return;
      var rect = r.wrap.getBoundingClientRect();
      panel.style.left = Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8)) + 'px';
      panel.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 8)) + 'px';
    }
    function render() {
      panel.replaceChildren();
      var head = document.createElement('div'); head.className = 'vm-date-calendar-head';
      function nav(text, label, change) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', label); b.onclick = change; head.append(b); }
      nav('‹', 'Tháng trước', function () { if (--month < 1) { month = 12; year--; } render(); });
      var title = document.createElement('strong'); title.textContent = 'Tháng ' + month + ' / ' + year; head.append(title);
      nav('›', 'Tháng sau', function () { if (++month > 12) { month = 1; year++; } render(); }); panel.append(head);
      var grid = document.createElement('div'); grid.className = 'vm-date-calendar-grid';
      ['T2','T3','T4','T5','T6','T7','CN'].forEach(function (day) { var e = document.createElement('small'); e.textContent = day; grid.append(e); });
      var start = new Date(year, month - 1, 1).getDay(), days = new Date(year, month, 0).getDate();
      for (var blank = 0; blank < (start + 6) % 7; blank++) grid.append(document.createElement('span'));
      for (var n = 1; n <= days; n++) {
        (function (day) {
          var b = document.createElement('button'), iso = isoDate(year, month, day);
          b.type = 'button'; b.textContent = day; b.setAttribute('aria-label', display(iso));
          if (iso === parseDate(r.date.value)) b.setAttribute('aria-current', 'date');
          b.disabled = !!((r.source.min && iso < r.source.min.slice(0, 10)) || (r.source.max && iso > r.source.max.slice(0, 10)));
          b.onclick = function () { r.date.value = display(iso); if (r.time && !r.time.value) r.time.value = '00:00'; commit(r, true); closeCalendar(); r.date.focus(); };
          grid.append(b);
        })(n);
      }
      panel.append(grid);
      var footer = document.createElement('div'); footer.className = 'vm-date-calendar-footer'; panel.append(footer);
      var clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Xóa ngày'; clear.onclick = function () { r.source.value = ''; r.source.dispatchEvent(new Event('change', {bubbles:true})); closeCalendar(); r.date.focus(); }; footer.append(clear);
      var close = document.createElement('button'); close.type = 'button'; close.textContent = 'Đóng lịch'; close.onclick = function () { closeCalendar(); r.button.focus(); }; footer.append(close);
      position();
    }
    render(); if (panel.hasAttribute('popover')) panel.showPopover(); position(); panel.querySelector('button').focus();
  }
  function enhance(source) {
    if (records.has(source) || source.dataset.vmNativeDate === 'true') return;
    var wrap = document.createElement('span'); wrap.className = 'vm-date-control';
    var date = document.createElement('input'); date.type = 'text'; date.className = source.className + ' vm-date-text'; date.placeholder = 'dd/mm/yyyy'; date.inputMode = 'numeric'; date.autocomplete = 'off';
    date.maxLength = 10; date.setAttribute('aria-label', (source.getAttribute('aria-label') || (source.labels && source.labels[0] ? source.labels[0].textContent.trim() : 'Ngày')) + ' (dd/mm/yyyy)');
    var time = null;
    if (source.type === 'datetime-local') { time = document.createElement('input'); time.type = 'text'; time.className = source.className + ' vm-date-time'; time.placeholder = 'HH:mm'; time.inputMode = 'numeric'; time.maxLength = 5; time.setAttribute('aria-label', 'Giờ và phút (24 giờ)'); }
    var button = document.createElement('button'); button.type = 'button'; button.className = 'vm-date-open'; button.textContent = '▦'; button.setAttribute('aria-label', 'Mở lịch chọn ngày');
    source.after(wrap); wrap.append(date); if (time) wrap.append(time); wrap.append(button);
    source.classList.add('vm-date-iso'); source.tabIndex = -1; source.setAttribute('aria-hidden', 'true');
    var r = { source: source, wrap: wrap, date: date, time: time, button: button }; records.set(source, r);
    // Existing code assigns ISO strings directly, including form resets and async lesson loading.
    Object.defineProperty(source, 'value', { configurable: true, get: function () { return valueProperty.get.call(this); }, set: function (value) { valueProperty.set.call(this, value); sync(r); } });
    source.addEventListener('change', function () { sync(r); });
    source.addEventListener('focus', function () { date.focus(); });
    source.addEventListener('invalid', function (event) {
      event.preventDefault(); commit(r, false, true);
      var invalid = date.validationMessage ? date : (time || date); invalid.focus(); invalid.reportValidity();
    });
    [date, time].filter(Boolean).forEach(function (field) {
      field.addEventListener('beforeinput', function (event) {
        // Backspace over a generated separator removes the preceding digit,
        // rather than re-inserting the slash and trapping the caret.
        if (event.inputType !== 'deleteContentBackward' || field.selectionStart !== field.selectionEnd) return;
        var at = field.selectionStart;
        if (at > 0 && /[/:]/.test(field.value[at - 1]) && field.dataset.vmMask === 'true') {
          event.preventDefault(); field.setRangeText('', Math.max(0, at - 2), at, 'end');
          formatTyping(field, field === time); commit(r, true, false);
        }
      });
      field.addEventListener('input', function (event) {
        if (event.isComposing) return;
        if (!field.value) delete field.dataset.vmMask;
        formatTyping(field, field === time, event); commit(r, true, false);
      });
      field.addEventListener('blur', function () { if (commit(r, true, true)) date.value = display(source.value); });
    });
    button.onclick = function () { calendar(r); };
    sync(r);
  }
  function scan(root) {
    if (root.matches && root.matches('input[type="date"],input[type="datetime-local"]')) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll('input[type="date"],input[type="datetime-local"]').forEach(enhance);
  }
  function validate(root) {
    var ok = true;
    records.forEach(function (r) {
      if (!r.source.isConnected || !isVisible(r.wrap) || r.source.disabled || (root && !root.contains(r.source))) return;
      if (!commit(r, false, true) || !r.date.checkValidity() || (r.time && !r.time.checkValidity())) {
        if (ok) { var invalid = r.date.validationMessage ? r.date : (r.time || r.date); invalid.focus(); invalid.reportValidity(); } ok = false;
      }
    });
    return ok;
  }
  window.VMDateInputs = { scan: scan, validate: validate, parse: parseDate, display: display };
  document.addEventListener('submit', function (e) { if (!validate(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('click', function (e) {
    // The appearance page uses a save button outside a form.
    if (e.target.closest('#festivalSave') && !validate()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('reset', function () { setTimeout(function () { records.forEach(sync); }, 0); });
  document.addEventListener('pointerdown', function (e) { if (activeCalendar && !activeCalendar.parentNode.contains(e.target)) closeCalendar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && activeCalendar) { var parent = activeCalendar.parentNode; closeCalendar(); parent.querySelector('.vm-date-open').focus(); e.stopPropagation(); } });
  function start() {
    scan(document);
    new MutationObserver(function (changes) {
      changes.forEach(function (change) {
        if (change.type === 'childList') change.addedNodes.forEach(scan);
        else { var r = records.get(change.target); if (r) sync(r); }
      });
      records.forEach(function (r, source) { if (!source.isConnected) records.delete(source); });
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'required', 'min', 'max', 'value', 'hidden'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
