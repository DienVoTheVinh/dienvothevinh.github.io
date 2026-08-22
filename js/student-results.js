(function () {
  'use strict';

  var results = [];
  var activeFilter = 'all';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function safeUrl(value) {
    try {
      var url = new URL(String(value || ''), window.location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (_) { return ''; }
  }

  function filesOf(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (file, index) {
      if (typeof file === 'string') return {name:'Tệp ' + (index + 1), link:file};
      return file && typeof file === 'object' ? file : null;
    }).filter(Boolean);
  }

  function labelFor(kind) {
    if (kind === 'test') return 'Bài kiểm tra';
    if (kind === 'homework_bonus') return 'Bài tập thưởng';
    if (kind === 'homework') return 'Bài tập về nhà';
    return 'Bài đã chấm';
  }

  function titleFor(item) {
    return item.lessons && item.lessons.title || item.exams && item.exams.title || labelFor(item.kind);
  }

  function formatDate(value) {
    if (!value) return 'Chưa rõ thời gian';
    try {
      return new Intl.DateTimeFormat('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
    } catch (_) { return 'Chưa rõ thời gian'; }
  }

  function deepLink(item) {
    if (item.lesson_id) {
      return 'bai-hoc?id=' + encodeURIComponent(item.lesson_id) + '&action=graded&kind=' +
        encodeURIComponent(item.kind || 'homework') + '&submission=' + encodeURIComponent(item.id);
    }
    if (item.exam_id) return 'luyen-de?exam_id=' + encodeURIComponent(item.exam_id);
    return '';
  }

  function isImage(file) {
    var text = String(file.name || '') + ' ' + String(file.link || file.url || '');
    return /\.(png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(text) || /^image\//i.test(String(file.type || file.mime_type || ''));
  }

  function fileLink(file) {
    return safeUrl(file.link || file.url || file.publicUrl || '');
  }

  function fileCards(files) {
    var html = files.map(function (file, index) {
      var url = fileLink(file);
      if (!url) return '';
      var name = esc(file.name || ('Tệp ' + (index + 1)));
      if (isImage(file)) {
        return '<a class="student-result-file" href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="' + name + '" loading="lazy"><span>' + name + '</span></a>';
      }
      return '<a class="student-result-file generic" href="' + esc(url) + '" target="_blank" rel="noopener"><b>📄 Mở tệp</b><span>' + name + '</span></a>';
    }).filter(Boolean).join('');
    return html || '<div class="student-results-empty"><p>Không có tệp đính kèm.</p></div>';
  }

  function matches(item) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'corrected') return filesOf(item.graded_files).length > 0;
    if (activeFilter === 'homework') return item.kind === 'homework' || item.kind === 'homework_bonus';
    return item.kind === activeFilter;
  }

  function render() {
    var box = document.getElementById('studentResultsList');
    var filtered = results.filter(matches);
    if (!filtered.length) {
      box.innerHTML = '<div class="student-results-empty"><span>📭</span><b>Chưa có bài phù hợp</b><p>Khi giáo viên chấm xong, điểm, lời phê và file sửa sẽ xuất hiện tại đây.</p></div>';
      return;
    }
    box.innerHTML = filtered.map(function (item) {
      var corrected = filesOf(item.graded_files).length;
      var score = item.score == null ? 'Đã chấm' : esc(item.score) + '/10';
      return '<article class="student-result-card">' +
        '<div class="student-result-score' + (item.score == null ? ' no-score' : '') + '">' + score + '</div>' +
        '<div class="student-result-main"><div class="student-result-meta"><span class="student-result-kind">' + esc(labelFor(item.kind)) + '</span>' +
          (corrected ? '<span class="student-result-corrected">✍️ Có ' + corrected + ' file sửa</span>' : '') +
        '</div><h2>' + esc(titleFor(item)) + '</h2><p>Giáo viên chấm ' + esc(formatDate(item.graded_at || item.submitted_at)) +
          (item.feedback ? ' · Có lời phê' : '') + '</p></div>' +
        '<div class="student-result-actions"><button class="btn btn-primary btn-sm" type="button" data-result-id="' + esc(item.id) + '">Xem bài sửa →</button></div>' +
      '</article>';
    }).join('');
  }

  function openResult(id) {
    var item = results.find(function (row) { return String(row.id) === String(id); });
    if (!item) return;
    var corrected = filesOf(item.graded_files);
    var submitted = filesOf(item.files);
    var link = deepLink(item);
    var inner = document.getElementById('studentResultDialogInner');
    inner.innerHTML = '<div class="student-result-dialog-head"><div><div class="sec-label">' + esc(labelFor(item.kind)) + '</div><h2 id="studentResultDialogTitle">' + esc(titleFor(item)) + '</h2></div><button class="student-result-dialog-close" type="button" aria-label="Đóng">✕</button></div>' +
      '<div class="student-result-feedback"><b>' + (item.score == null ? 'Nhận xét của giáo viên' : 'Điểm ' + esc(item.score) + '/10 · Nhận xét của giáo viên') + '</b><p>' + esc(item.feedback || 'Giáo viên chưa để lại lời phê bằng chữ. Em hãy xem file bài sửa bên dưới.') + '</p></div>' +
      (corrected.length ? '<section class="student-result-file-section"><h3>✍️ Bài giáo viên đã sửa</h3><div class="student-result-files">' + fileCards(corrected) + '</div></section>' : '') +
      (submitted.length ? '<section class="student-result-file-section"><h3>📎 Bài em đã nộp</h3><div class="student-result-files">' + fileCards(submitted) + '</div></section>' : '') +
      (link ? '<div class="student-result-deep-link"><a class="btn btn-secondary btn-sm" href="' + esc(link) + '">Mở trong bài giảng →</a></div>' : '');
    var dialog = document.getElementById('studentResultDialog');
    inner.querySelector('.student-result-dialog-close').addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  async function load() {
    if (!daKetNoi()) {
      document.getElementById('studentResultsList').innerHTML = '<div class="student-results-error"><span>⚠️</span><b>Chưa kết nối được dữ liệu</b><p>Vui lòng tải lại trang khi có mạng.</p></div>';
      return;
    }
    var profile = await yeuCauDangNhap();
    if (!profile) return;
    if (profile.role !== 'student') {
      window.location.replace('ca-nhan');
      return;
    }
    if (sessionStorage.getItem('vm-guest-mode') === 'true') {
      results = [{
        id:'demo-graded', lesson_id:'demo-lesson', exam_id:null,
        submitted_at:new Date().toISOString(), graded_at:new Date().toISOString(),
        kind:'homework', score:8.5,
        feedback:'Bài làm trình bày rõ. Em xem phần giáo viên đánh dấu để sửa lại bước biến đổi cuối.',
        files:[], graded_files:[{name:'Bài sửa minh họa.png',link:'/img/logo.png'}],
        lessons:{id:'demo-lesson',title:'Bài đã chấm minh họa',class_id:'guest-class'}, exams:null
      }];
      document.getElementById('studentResultsCount').textContent = results.length;
      render();
      return;
    }
    var response = await sb.from('submissions')
      .select('id,lesson_id,exam_id,submitted_at,graded_at,kind,score,feedback,files,graded_files,is_late,reviewed_at,lessons(id,title,class_id),exams(id,title,class_id)')
      .eq('student_id', profile.id)
      .eq('status', 'graded')
      .order('graded_at', {ascending:false});
    if (response.error) {
      console.error('Không tải được kết quả:', response.error.message);
      document.getElementById('studentResultsList').innerHTML = '<div class="student-results-error"><span>⚠️</span><b>Chưa tải được bài đã chấm</b><p>Vui lòng thử lại sau. Hệ thống không hiển thị dữ liệu của học sinh khác.</p></div>';
      return;
    }
    results = response.data || [];
    document.getElementById('studentResultsCount').textContent = results.length;
    render();
  }

  document.addEventListener('click', function (event) {
    var filter = event.target.closest('[data-filter]');
    if (filter) {
      activeFilter = filter.getAttribute('data-filter');
      document.querySelectorAll('.student-result-filter').forEach(function (button) {
        button.classList.toggle('active', button === filter);
      });
      render();
      return;
    }
    var resultButton = event.target.closest('[data-result-id]');
    if (resultButton) openResult(resultButton.getAttribute('data-result-id'));
  });

  document.getElementById('studentResultDialog').addEventListener('click', function (event) {
    if (event.target === this) this.close();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
