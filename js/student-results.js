(function () {
  'use strict';

  var results = [];
  var activeFilter = 'all';
  var activeClass = 'all';
  var activeGrade = 'all';
  var mediaGroups = {};
  var mediaSequence = 0;
  var resultObjectUrls = [];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function safeUrl(value) {
    try {
      var raw = String(value || '');
      var url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? new URL(raw) : new URL(raw, window.location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'blob:' ? url.href : '';
    } catch (_) { return ''; }
  }

  function releaseResultObjectUrls() {
    resultObjectUrls.forEach(function (url) { try { URL.revokeObjectURL(url); } catch (_) {} });
    resultObjectUrls = [];
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

  function classOf(item) {
    return item.lessons && item.lessons.classes || item.exams && item.exams.classes || null;
  }

  function assessmentFor(value) {
    if (window.VMStudentResultUI && typeof window.VMStudentResultUI.assessment === 'function') {
      return window.VMStudentResultUI.assessment(value);
    }
    return {
      needs_improvement:{label:'Cần cố gắng',icon:'🌱',className:'needs-improvement'},
      meets:{label:'Đạt',icon:'✓',className:'meets'},
      good:{label:'Tốt',icon:'⭐',className:'good'}
    }[value] || null;
  }

  function isImage(file) {
    var text = String(file.name || '') + ' ' + String(file.link || file.url || '');
    return /\.(png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(text) || /^image\//i.test(String(file.type || file.mime_type || ''));
  }

  function isPdf(file) {
    var text = String(file.name || '') + ' ' + String(file.link || file.url || '');
    return /\.pdf(?:[?#]|$)/i.test(text) || /^application\/pdf/i.test(String(file.type || file.mime_type || ''));
  }

  function fileLink(file) {
    return safeUrl(file.link || file.url || file.publicUrl || '');
  }

  function driveFileId(file) {
    if (file && file.id) return String(file.id);
    var value = String(file && (file.link || file.url) || '');
    var pathMatch = value.match(/\/file\/d\/([\w_-]+)/);
    if (pathMatch) return pathMatch[1];
    var queryMatch = value.match(/[?&]id=([\w_-]+)/);
    return queryMatch && /drive\.google\.com/i.test(value) ? queryMatch[1] : '';
  }

  function filePreviewUrl(file, size) {
    var prepared = safeUrl(file && file.previewUrl || '');
    if (prepared) return prepared;
    var id = driveFileId(file);
    if (id) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=' + (size || 'w2000');
    return fileLink(file);
  }

  function fileFallbackUrl(file) {
    var direct = fileLink(file);
    if (direct) return direct;
    var id = driveFileId(file);
    return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view' : '';
  }

  function fileCards(files, sectionTitle) {
    var imageItems = files.filter(isImage).map(function (file, index) {
      return {url:filePreviewUrl(file, 'w2000'),fallbackUrl:fileFallbackUrl(file),name:file.name || ('Ảnh ' + (index + 1))};
    }).filter(function (item) { return !!item.url; });
    var groupId = 'result-media-' + (++mediaSequence);
    mediaGroups[groupId] = {title:sectionTitle || 'Ảnh kết quả',items:imageItems};
    var imageIndex = 0;
    var html = files.map(function (file, index) {
      var url = fileLink(file);
      var name = esc(file.name || ('Tệp ' + (index + 1)));
      if (isImage(file)) {
        var previewUrl = filePreviewUrl(file, 'w600');
        if (!previewUrl) return '';
        var currentImageIndex = imageIndex++;
        return '<button class="student-result-file" type="button" data-result-media-group="' + esc(groupId) + '" data-result-media-index="' + currentImageIndex + '" aria-label="Xem ' + name + '"><img src="' + esc(previewUrl) + '" alt="' + name + '" loading="lazy"><span>' + name + '</span></button>';
      }
      if (!url) return '';
      if (isPdf(file)) {
        return '<article class="student-result-file student-result-pdf"><iframe src="' + esc(url) + '#toolbar=1" title="' + name + '" loading="lazy"></iframe><a href="' + esc(url) + '" target="_blank" rel="noopener">📄 ' + name + '</a></article>';
      }
      return '<a class="student-result-file generic" href="' + esc(url) + '" target="_blank" rel="noopener"><b>📄 Mở tệp</b><span>' + name + '</span></a>';
    }).filter(Boolean).join('');
    return html || '<div class="student-results-empty"><p>Không có tệp đính kèm.</p></div>';
  }

  function matches(item) {
    var itemClass = classOf(item);
    if (activeClass !== 'all' && (!itemClass || String(itemClass.id) !== activeClass)) return false;
    if (activeGrade !== 'all' && (!itemClass || String(itemClass.grade) !== activeGrade)) return false;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'corrected') return filesOf(item.graded_files).length > 0;
    if (activeFilter === 'homework') return item.kind === 'homework' || item.kind === 'homework_bonus';
    return item.kind === activeFilter;
  }

  function hasUnlockedSolution(item) {
    return !!(item && item.solution_source && item.solution_source.has_solution);
  }

  function render() {
    var box = document.getElementById('studentResultsList');
    var filtered = results.filter(matches);
    if (!filtered.length) {
      box.innerHTML = '<div class="student-results-empty"><span>📭</span><b>Chưa có bài phù hợp</b><p>Khi em nộp bài có lời giải hoặc giáo viên chấm xong, nội dung sẽ xuất hiện tại đây.</p></div>';
      return;
    }
    box.innerHTML = filtered.map(function (item) {
      var corrected = filesOf(item.graded_files).length;
      var assessment = assessmentFor(item.assessment_level);
      var unlockedSolution = hasUnlockedSolution(item);
      var isGraded = item.status === 'graded';
      var score = item.score == null ? (assessment ? assessment.icon + ' ' + assessment.label : (isGraded ? 'Đã chấm' : '🔓 Lời giải')) : esc(item.score) + '/10';
      var itemClass = classOf(item);
      return '<article class="student-result-card">' +
        '<div class="student-result-score' + (item.score == null ? ' no-score' : '') + (assessment ? ' ' + assessment.className : '') + '">' + score + '</div>' +
        '<div class="student-result-main"><div class="student-result-meta"><span class="student-result-kind">' + esc(labelFor(item.kind)) + '</span>' +
          (itemClass ? '<span class="student-result-kind">' + esc(itemClass.name) + '</span>' : '') +
          (assessment ? '<span class="student-result-assessment ' + assessment.className + '">' + assessment.icon + ' ' + assessment.label + '</span>' : '') +
          (corrected ? '<span class="student-result-corrected">✍️ Có ' + corrected + ' file sửa</span>' : '') +
          (unlockedSolution ? '<span class="student-result-solution-badge">🔓 Có lời giải LaTeX</span>' : '') +
        '</div><h2>' + esc(titleFor(item)) + '</h2><p>' + (isGraded ? 'Giáo viên chấm ' : 'Em nộp bài ') + esc(formatDate(item.graded_at || item.submitted_at)) +
          (item.feedback ? ' · Có lời phê' : '') + (!isGraded && unlockedSolution ? ' · Em đã nộp bài, lời giải đã mở' : '') + '</p></div>' +
        '<div class="student-result-actions"><button class="btn btn-primary btn-sm" type="button" data-result-id="' + esc(item.id) + '">' + (isGraded ? 'Xem kết quả' : 'Xem lời giải') + ' →</button></div>' +
      '</article>';
    }).join('');
  }

  async function loadSolutionHtml(item) {
    if (!hasUnlockedSolution(item) || !item.lesson_id) return '';
    var response = await sb.from('lesson_latex_sources')
      .select('content,has_solution')
      .eq('lesson_id', item.lesson_id)
      .eq('kind', item.kind)
      .maybeSingle();
    if (response.error || !response.data || !response.data.has_solution || !response.data.content) {
      return '<div class="student-result-solution-error">Chưa tải được lời giải. Em thử mở lại sau ít phút.</div>';
    }
    if (typeof latexTaiLieuRaHTML !== 'function') {
      return '<div class="student-result-solution-error">Bộ đọc LaTeX chưa sẵn sàng. Em tải lại trang để xem lời giải.</div>';
    }
    return '<section class="student-result-solution"><div class="student-result-solution-head"><span>🔓</span><div><small>LỜI GIẢI ĐÃ MỞ</small><h3>Lời giải LaTeX của bài</h3></div></div>' +
      latexTaiLieuRaHTML(response.data.content, { title:titleFor(item), kind:item.kind, showSolutions:true }) + '</section>';
  }

  async function loadClassAnswerHtml(item) {
    if (!item || !item.lesson_id || typeof vmGoiHamFormData !== 'function' || typeof vmGoiHamFormDataBlob !== 'function') return '';
    try {
      var request = new FormData();
      request.append('kind', 'class_answer_get');
      request.append('lesson_id', String(item.lesson_id));
      var response = await vmGoiHamFormData('nop-bai', request, {timeoutMs:45000});
      var answer = response && response.answer;
      if (!answer) return '';
      if (String(answer.lesson_id || '') !== String(item.lesson_id)) {
        throw new Error('Đáp án trả về không thuộc bài giảng đang xem.');
      }
      var sourceFiles = filesOf(answer.files);
      var preparedFiles = (await Promise.all(sourceFiles.map(async function (file) {
        try {
          if (!file.id) return null;
          var form = new FormData();
          form.append('kind', 'class_answer_file');
          form.append('lesson_id', String(item.lesson_id));
          form.append('file_id', String(file.id));
          var blob = await vmGoiHamFormDataBlob('nop-bai', form, {timeoutMs:90000});
          if (!(blob instanceof Blob)) throw new Error('Máy chủ không trả về tệp đáp án hợp lệ.');
          var objectUrl = URL.createObjectURL(blob);
          resultObjectUrls.push(objectUrl);
          return Object.assign({}, file, {previewUrl:objectUrl,link:objectUrl,mime_type:file.mime_type || blob.type});
        } catch (fileError) {
          console.warn('Không tải được một tệp đáp án chung:', fileError && fileError.message ? fileError.message : fileError);
          return null;
        }
      }))).filter(Boolean);
      var texHtml = answer.tex_content && typeof latexTaiLieuRaHTML === 'function'
        ? '<section class="student-result-solution"><div class="student-result-solution-head"><span>🔐</span><div><small>ĐÁP ÁN CHUNG ĐÚNG BÀI GIẢNG</small><h3>' + esc(titleFor(item)) + '</h3></div></div>' + latexTaiLieuRaHTML(answer.tex_content, {title:titleFor(item) + ' — Đáp án chung',kind:item.kind,showSolutions:true}) + '</section>'
        : '';
      var filesHtml = preparedFiles.length
        ? '<section class="student-result-file-section student-result-class-answer"><h3>🔐 Đáp án chung của bài giảng</h3><div class="student-result-files">' + fileCards(preparedFiles, 'Đáp án chung — ' + titleFor(item)) + '</div></section>'
        : '';
      return filesHtml + texHtml;
    } catch (error) {
      console.warn('Chưa tải được đáp án chung đúng bài giảng:', error && error.message ? error.message : error);
      return '<div class="student-result-solution-error">Chưa tải được đáp án chung của bài giảng này. Em có thể thử mở lại sau.</div>';
    }
  }

  async function prepareResultFiles(item, sourceFiles, collection) {
    if (!Array.isArray(sourceFiles) || !sourceFiles.length) return [];
    if (!item || !item.id || typeof vmGoiHamFormDataBlob !== 'function') return sourceFiles;
    return (await Promise.all(sourceFiles.map(async function (file) {
      if (!file) return file;
      var privateFileId = driveFileId(file);
      if (!privateFileId) return file;
      try {
        var form = new FormData();
        form.append('kind', 'result_file');
        form.append('submission_id', String(item.id));
        form.append('file_id', privateFileId);
        form.append('collection', collection);
        var blob = await vmGoiHamFormDataBlob('nop-bai', form, {timeoutMs:90000});
        if (!(blob instanceof Blob)) throw new Error('Máy chủ không trả về tệp kết quả hợp lệ.');
        var objectUrl = URL.createObjectURL(blob);
        resultObjectUrls.push(objectUrl);
        return Object.assign({}, file, {previewUrl:objectUrl,link:objectUrl,mime_type:file.mime_type || blob.type});
      } catch (fileError) {
        console.warn('Không tải được tệp kết quả qua kênh riêng:', fileError && fileError.message ? fileError.message : fileError);
        return file;
      }
    }))).filter(Boolean);
  }

  function lessonResultHref(item) {
    if (!item || !item.lesson_id) return '';
    var query = new URLSearchParams({
      id:String(item.lesson_id),
      action:'graded',
      kind:String(item.kind || 'homework'),
      submission:String(item.id || ''),
      from:'ket-qua'
    });
    return 'bai-hoc?' + query.toString();
  }

  function closeResultDialog() {
    var dialog = document.getElementById('studentResultDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    releaseResultObjectUrls();
  }

  async function openResult(id) {
    var item = results.find(function (row) { return String(row.id) === String(id); });
    if (!item) return;
    var correctedSource = filesOf(item.graded_files);
    var submittedSource = filesOf(item.files);
    var assessment = assessmentFor(item.assessment_level);
    var itemClass = classOf(item);
    mediaGroups = {};
    releaseResultObjectUrls();
    var feedbackHtml = item.status === 'graded'
      ? '<div class="student-result-feedback"><b>' + (item.score == null ? 'Nhận xét của giáo viên' : 'Điểm ' + esc(item.score) + '/10 · Nhận xét của giáo viên') + '</b><p>' + esc(item.feedback || 'Giáo viên chưa để lại lời phê bằng chữ. Em hãy xem file bài sửa bên dưới.') + '</p></div>'
      : '<div class="student-result-solution-ready"><span>🔓</span><div><b>Em đã nộp bài — lời giải đã được mở</b><p>Bài đang chờ giáo viên chấm. Em có thể xem lời giải ngay bên dưới để tự đối chiếu.</p></div></div>';
    var inner = document.getElementById('studentResultDialogInner');
    inner.innerHTML = '<div class="student-results-empty"><span>⏳</span><b>Đang chuẩn bị kết quả và lời giải…</b></div>';
    var dialog = document.getElementById('studentResultDialog');
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    var loadedLessonContent = await Promise.all([
      loadSolutionHtml(item),
      loadClassAnswerHtml(item),
      prepareResultFiles(item, correctedSource, 'graded_files'),
      prepareResultFiles(item, submittedSource, 'files')
    ]);
    var solutionHtml = loadedLessonContent[0];
    var classAnswerHtml = loadedLessonContent[1];
    var corrected = loadedLessonContent[2];
    var submitted = loadedLessonContent[3];
    var contextHref = lessonResultHref(item);
    inner.innerHTML = '<header class="student-result-viewer-bar"><div class="student-result-viewer-context"><span class="student-result-viewer-kicker">KẾT QUẢ</span><div class="student-result-viewer-crumbs"><span>' + esc(itemClass ? itemClass.name : 'Lớp học') + '</span><b>›</b><strong>' + esc(titleFor(item)) + '</strong></div></div><div class="student-result-viewer-actions">' +
      (contextHref ? '<a class="btn btn-secondary btn-sm" href="' + esc(contextHref) + '">Mở đúng vị trí trong bài học ↗</a>' : '') +
      '<button class="student-result-dialog-close" type="button" aria-label="Đóng và quay lại danh sách Kết quả"><span>✕</span><b>Đóng</b></button></div></header>' +
      '<main class="student-result-viewer-content"><section class="student-result-viewer-title"><div><div class="sec-label">' + esc(labelFor(item.kind)) + '</div><h2 id="studentResultDialogTitle">' + esc(titleFor(item)) + '</h2></div><p>Đang xem toàn bộ phản hồi tại đúng bài đã nộp. Đóng cửa sổ để tiếp tục xem các kết quả khác.</p></section>' +
      '<div class="student-result-dialog-meta">' + (itemClass ? '<span>🏫 ' + esc(itemClass.name) + '</span>' : '') + '<span>🕐 ' + esc(formatDate(item.graded_at || item.submitted_at)) + '</span>' + '</div>' +
      (assessment ? '<div class="student-result-assessment-banner ' + assessment.className + '"><span>' + assessment.icon + '</span><div><small>Mức đánh giá</small><b>' + assessment.label + '</b></div></div>' : '') +
      feedbackHtml +
      (corrected.length ? '<section class="student-result-file-section"><h3>✍️ Bài giáo viên đã sửa</h3><div class="student-result-files">' + fileCards(corrected, 'Bài giáo viên đã sửa') + '</div></section>' : '') +
      (submitted.length ? '<section class="student-result-file-section"><h3>📎 Bài em đã nộp</h3><div class="student-result-files">' + fileCards(submitted, 'Bài em đã nộp') + '</div></section>' : '') +
      classAnswerHtml +
      solutionHtml +
      '<p class="student-result-inline-note">Điểm, nhận xét, file sửa và lời giải đã mở được tập trung trong một không gian xem; dữ liệu của bài khác vẫn giữ nguyên ở danh sách Kết quả.</p></main>';
    inner.querySelector('.student-result-dialog-close').addEventListener('click', closeResultDialog);
    if (typeof renderToanTrong === 'function') renderToanTrong(inner);
    else if (typeof renderLatex === 'function') renderLatex(inner);
    if (typeof vmRenderTikzTrong === 'function') vmRenderTikzTrong(inner);
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
        id:'demo-graded', lesson_id:'demo-lesson', exam_id:null, status:'graded',
        submitted_at:new Date().toISOString(), graded_at:new Date().toISOString(),
        kind:'homework', score:8.5, assessment_level:'good',
        feedback:'Bài làm trình bày rõ. Em xem phần giáo viên đánh dấu để sửa lại bước biến đổi cuối.',
        files:[], graded_files:[{name:'Bài sửa minh họa.png',link:'/img/logo.png'}], solution_source:null,
        lessons:{id:'demo-lesson',title:'Bài đã chấm minh họa',class_id:'guest-class',classes:{id:'guest-class',name:'Lớp minh họa',grade:9}}, exams:null
      }];
      populateScopes();
      document.getElementById('studentResultsCount').textContent = results.length;
      render();
      return;
    }
    var response = await sb.from('submissions')
      .select('id,lesson_id,exam_id,submitted_at,graded_at,status,kind,score,assessment_level,feedback,files,graded_files,is_late,reviewed_at,lessons(id,title,class_id,classes(id,name,grade)),exams(id,title,class_id,classes(id,name,grade))')
      .eq('student_id', profile.id)
      .not('submitted_at', 'is', null)
      .order('submitted_at', {ascending:false});
    if (response.error) {
      console.error('Không tải được kết quả:', response.error.message);
      document.getElementById('studentResultsList').innerHTML = '<div class="student-results-error"><span>⚠️</span><b>Chưa tải được bài đã chấm</b><p>Vui lòng thử lại sau. Hệ thống không hiển thị dữ liệu của học sinh khác.</p></div>';
      return;
    }
    var rows = response.data || [];
    var lessonIds = Array.from(new Set(rows.map(function (item) { return item.lesson_id; }).filter(Boolean)));
    var sourceMap = {};
    if (lessonIds.length) {
      var sourceResponse = await sb.from('lesson_latex_sources')
        .select('lesson_id,kind,has_solution,updated_at')
        .in('lesson_id', lessonIds)
        .eq('has_solution', true);
      if (!sourceResponse.error) (sourceResponse.data || []).forEach(function (source) {
        sourceMap[String(source.lesson_id) + '|' + source.kind] = source;
      });
    }
    rows.forEach(function (item) { item.solution_source = sourceMap[String(item.lesson_id) + '|' + item.kind] || null; });
    results = rows.filter(function (item) { return item.status === 'graded' || hasUnlockedSolution(item); });
    populateScopes();
    document.getElementById('studentResultsCount').textContent = results.length;
    render();
  }

  function populateScopes() {
    var classes = {};
    results.forEach(function (item) {
      var c = classOf(item);
      if (c && c.id) classes[c.id] = c;
    });
    var rows = Object.keys(classes).map(function (id) { return classes[id]; }).sort(function (a, b) {
      return Number(a.grade || 99) - Number(b.grade || 99) || String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    });
    var classSelect = document.getElementById('studentResultClassFilter');
    classSelect.innerHTML = '<option value="all">Tất cả các lớp</option>' + rows.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    var grades = Array.from(new Set(rows.map(function (c) { return c.grade; }).filter(function (g) { return g != null; }))).sort(function (a, b) { return a - b; });
    var gradeSelect = document.getElementById('studentResultGradeFilter');
    gradeSelect.innerHTML = '<option value="all">Tất cả các khối</option>' + grades.map(function (g) { return '<option value="' + esc(g) + '">Khối ' + esc(g) + '</option>'; }).join('');
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
    if (resultButton) { openResult(resultButton.getAttribute('data-result-id')); return; }
    var mediaButton = event.target.closest('[data-result-media-group]');
    if (mediaButton && window.VMStudentResultUI) {
      var mediaGroup = mediaGroups[mediaButton.getAttribute('data-result-media-group')];
      if (mediaGroup) window.VMStudentResultUI.openMedia(mediaGroup.items, Number(mediaButton.getAttribute('data-result-media-index') || 0), {title:mediaGroup.title});
    }
  });

  document.getElementById('studentResultDialog').addEventListener('click', function (event) {
    if (event.target === this) closeResultDialog();
  });

  document.getElementById('studentResultClassFilter').addEventListener('change', function () { activeClass = this.value; render(); });
  document.getElementById('studentResultGradeFilter').addEventListener('change', function () { activeGrade = this.value; render(); });
  window.addEventListener('pagehide', releaseResultObjectUrls);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
