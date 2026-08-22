/* VinhMath partner portal — lightweight classroom, lesson and exam workspace. */
(function () {
  'use strict';

  var state = {
    canManage: false,
    classes: [],
    lessons: [],
    students: [],
    classStudents: [],
    exams: [],
    selectedClassId: null
  };

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function safeUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value, location.origin);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function selectedClass() {
    return state.classes.find(function (item) { return item.id === state.selectedClassId; }) || null;
  }
  function lessonsFor(classId) {
    return state.lessons.filter(function (item) { return item.class_id === classId; });
  }
  function examsFor(classId) {
    return state.exams.filter(function (item) { return item.class_id === classId; });
  }
  function toast(message, type) {
    var box = el('portalToast');
    if (!box) return;
    box.textContent = message;
    box.className = 'portal-toast show ' + (type || '');
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.className = 'portal-toast'; }, 3800);
  }
  function openModal(html) {
    el('portalModalBody').innerHTML = html;
    el('portalModal').hidden = false;
    document.body.classList.add('portal-modal-open');
    var first = el('portalModalBody').querySelector('input,select,textarea,button');
    if (first) setTimeout(function () { first.focus(); }, 20);
  }
  function closeModal() {
    el('portalModal').hidden = true;
    el('portalModalBody').innerHTML = '';
    document.body.classList.remove('portal-modal-open');
  }
  function renderMath(root) {
    if (!root || !window.renderMathInElement) return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          {left:'$$',right:'$$',display:true}, {left:'\\[',right:'\\]',display:true},
          {left:'$',right:'$',display:false}, {left:'\\(',right:'\\)',display:false}
        ],
        throwOnError: false,
        strict: 'ignore',
        trust: false
      });
    } catch (_) {}
  }
  function lessonBody(lesson) {
    if (!lesson.latex_content) return '';
    if (typeof window.latexRaHTML === 'function') return window.latexRaHTML(lesson.latex_content);
    return '<div class="portal-lesson-tex">' + esc(lesson.latex_content) + '</div>';
  }

  async function loadData() {
    var portalId = vmPortalState.portal.id;
    var classResult = await sb.from('classes')
      .select('id,name,grade,school_year,mode,note,teacher_id,brand_id,created_at')
      .eq('portal_id', portalId)
      .order('grade', {ascending:true, nullsFirst:false})
      .order('name');
    if (classResult.error) throw classResult.error;
    state.classes = classResult.data || [];
    if (!state.selectedClassId || !state.classes.some(function (item) { return item.id === state.selectedClassId; })) {
      state.selectedClassId = state.classes[0] ? state.classes[0].id : null;
    }

    var classIds = state.classes.map(function (item) { return item.id; });
    state.lessons = [];
    state.classStudents = [];
    if (classIds.length) {
      var lessonResult = await sb.from('lessons')
        .select('id,class_id,title,note,youtube_url,resource_url,latex_content,published,sort,created_at')
        .in('class_id', classIds)
        .order('sort')
        .order('created_at');
      if (lessonResult.error) throw lessonResult.error;
      state.lessons = lessonResult.data || [];
      if (state.canManage) {
        var csResult = await sb.from('class_students').select('class_id,student_id').in('class_id', classIds);
        if (csResult.error) throw csResult.error;
        state.classStudents = csResult.data || [];
      }
    }

    if (state.canManage) {
      var results = await Promise.all([
        sb.from('exam_portal_members')
          .select('user_id,member_role,profile:profiles(id,full_name,username)')
          .eq('portal_id', portalId)
          .eq('member_role', 'student')
          .order('created_at'),
        sb.from('exams')
          .select('id,class_id,title,duration_minutes,published,de_type,latex_source,created_at,exam_questions(count)')
          .eq('portal_id', portalId)
          .order('created_at', {ascending:false})
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      state.students = (results[0].data || []).map(function (item) {
        var profile = item.profile || {};
        return {id:item.user_id, full_name:profile.full_name || profile.username || 'Học sinh', username:profile.username || ''};
      });
      state.exams = results[1].data || [];
    }
  }

  function renderLearn() {
    var box = el('portalLessonList');
    if (!box) return;
    if (!state.classes.length) {
      box.innerHTML = '<div class="card portal-empty"><b>Chưa có lớp học</b><br>' +
        (state.canManage ? 'Mở tab Nội dung để tạo lớp đầu tiên.' : 'Giáo viên sẽ thêm em vào lớp phù hợp.') + '</div>';
      return;
    }
    box.innerHTML = state.classes.map(function (klass) {
      var lessons = lessonsFor(klass.id);
      var lessonHtml = lessons.length ? lessons.map(function (lesson, index) {
        var video = safeUrl(lesson.youtube_url);
        var resource = safeUrl(lesson.resource_url);
        var actions = '';
        if (video) actions += '<a class="btn btn-secondary btn-sm" href="' + esc(video) + '" target="_blank" rel="noopener">▶ Xem video</a>';
        if (resource) actions += '<a class="btn btn-secondary btn-sm" href="' + esc(resource) + '" target="_blank" rel="noopener">📎 Mở tài liệu</a>';
        return '<details class="card portal-lesson"' + (index === 0 ? ' open' : '') + '><summary><span class="portal-lesson-no">' + (index + 1) + '</span><span><b>' + esc(lesson.title) + '</b><small>' + esc(lesson.note || 'Bấm để xem nội dung bài học') + '</small></span>' + (state.canManage && !lesson.published ? '<span class="portal-chip upcoming">Bản nháp</span>' : '') + '</summary><div class="portal-lesson-content">' + lessonBody(lesson) + (actions ? '<div class="portal-lesson-actions">' + actions + '</div>' : '') + '</div></details>';
      }).join('') : '<div class="portal-empty portal-empty-compact">Chưa có bài giảng được công bố.</div>';
      return '<section class="portal-class-block"><div class="portal-class-heading"><div><span class="portal-chip">Khối ' + esc(klass.grade || '—') + '</span><h3>' + esc(klass.name) + '</h3><p>' + esc(klass.note || ('Niên khóa ' + (klass.school_year || ''))) + '</p></div><span class="portal-class-count">' + lessons.length + ' bài</span></div><div class="portal-lesson-list">' + lessonHtml + '</div></section>';
    }).join('');
    renderMath(box);
  }

  function renderManage() {
    var box = el('portalManageContent');
    if (!box || !state.canManage) return;
    var klass = selectedClass();
    var classList = state.classes.length ? state.classes.map(function (item) {
      return '<button type="button" class="portal-class-select' + (item.id === state.selectedClassId ? ' active' : '') + '" onclick="VMPortalClassroom.selectClass(\'' + item.id + '\')"><span><b>' + esc(item.name) + '</b><small>Khối ' + esc(item.grade || '—') + ' · ' + lessonsFor(item.id).length + ' bài</small></span><span>›</span></button>';
    }).join('') : '<div class="portal-empty portal-empty-compact">Chưa có lớp nào.</div>';

    var main = '';
    if (!klass) {
      main = '<div class="card portal-manage-empty"><div><span class="portal-empty-icon">🏫</span><h3>Tạo lớp đầu tiên</h3><p>Chỉ cần tên lớp và khối. Sau đó thêm học sinh, bài giảng và đề thi ngay trong cùng một màn hình.</p><button class="btn btn-primary" onclick="VMPortalClassroom.openClassForm()">+ Tạo lớp học</button></div></div>';
    } else {
      var assigned = {};
      state.classStudents.filter(function (item) { return item.class_id === klass.id; }).forEach(function (item) { assigned[item.student_id] = true; });
      var members = state.students.length ? state.students.map(function (student) {
        return '<label class="portal-member-toggle"><input type="checkbox" ' + (assigned[student.id] ? 'checked' : '') + ' onchange="VMPortalClassroom.toggleStudent(\'' + student.id + '\',this.checked)"><span><b>' + esc(student.full_name) + '</b><small>@' + esc(student.username) + '</small></span></label>';
      }).join('') : '<div class="portal-empty portal-empty-compact">Chưa có tài khoản học sinh trong portal.</div>';
      var lessons = lessonsFor(klass.id);
      var lessonRows = lessons.length ? lessons.map(function (lesson) {
        return '<article class="portal-manage-row"><div><div class="portal-row-title">' + esc(lesson.title) + '</div><div class="portal-row-meta"><span>' + (lesson.published ? 'Đã công bố' : 'Bản nháp') + '</span>' + (lesson.youtube_url ? '<span>Có video</span>' : '') + (lesson.resource_url ? '<span>Có tài liệu</span>' : '') + '</div></div><div class="portal-row-actions"><button class="btn btn-secondary btn-sm" onclick="VMPortalClassroom.openLessonForm(\'' + lesson.id + '\')">Sửa</button><button class="btn btn-ghost btn-sm portal-danger" onclick="VMPortalClassroom.deleteLesson(\'' + lesson.id + '\')">Xóa</button></div></article>';
      }).join('') : '<div class="portal-empty portal-empty-compact">Chưa có bài giảng.</div>';
      var exams = examsFor(klass.id);
      var examRows = exams.length ? exams.map(function (exam) {
        var count = exam.exam_questions && exam.exam_questions[0] ? exam.exam_questions[0].count : 0;
        return '<article class="portal-manage-row"><div><div class="portal-row-title">' + esc(exam.title) + '</div><div class="portal-row-meta"><span>' + (exam.published ? 'Đang mở' : 'Đang ẩn') + '</span><span>' + Number(exam.duration_minutes || 0) + ' phút</span><span>' + count + ' câu</span></div></div><div class="portal-row-actions"><a class="btn btn-secondary btn-sm" href="luyen-de?portal=' + encodeURIComponent(vmPortalState.portal.slug) + '&exam_id=' + encodeURIComponent(exam.id) + '" target="_blank">Xem</a><button class="btn btn-secondary btn-sm" onclick="VMPortalClassroom.toggleExam(\'' + exam.id + '\',' + (!exam.published) + ')">' + (exam.published ? 'Ẩn' : 'Mở') + '</button><button class="btn btn-ghost btn-sm portal-danger" onclick="VMPortalClassroom.deleteExam(\'' + exam.id + '\')">Xóa</button></div></article>';
      }).join('') : '<div class="portal-empty portal-empty-compact">Chưa có đề thi.</div>';
      main = '<div class="portal-manage-main"><section class="card portal-class-overview"><div><span class="portal-chip">Khối ' + esc(klass.grade || '—') + '</span><h3>' + esc(klass.name) + '</h3><p>' + esc(klass.note || ('Niên khóa ' + klass.school_year)) + '</p></div><div class="portal-row-actions"><button class="btn btn-secondary btn-sm" onclick="VMPortalClassroom.openClassForm(\'' + klass.id + '\')">Sửa lớp</button><button class="btn btn-ghost btn-sm portal-danger" onclick="VMPortalClassroom.deleteClass(\'' + klass.id + '\')">Xóa lớp</button></div></section>' +
        '<section class="portal-manage-section"><div class="portal-manage-head"><div><span>1</span><div><h3>Học sinh</h3><p>Chọn những học sinh thuộc lớp này.</p></div></div></div><div class="portal-member-grid">' + members + '</div></section>' +
        '<section class="portal-manage-section"><div class="portal-manage-head"><div><span>2</span><div><h3>Bài giảng</h3><p>Nội dung, video và tài liệu học tập.</p></div></div><button class="btn btn-primary btn-sm" onclick="VMPortalClassroom.openLessonForm()">+ Tạo bài giảng</button></div><div class="portal-manage-list">' + lessonRows + '</div></section>' +
        '<section class="portal-manage-section"><div class="portal-manage-head"><div><span>3</span><div><h3>Đề thi</h3><p>Dán hoặc tải tệp TeX, rồi công bố cho lớp.</p></div></div><button class="btn btn-primary btn-sm" onclick="VMPortalClassroom.openExamForm()">+ Thêm đề thi</button></div><div class="portal-manage-list">' + examRows + '</div></section></div>';
    }
    box.innerHTML = '<div class="portal-manage-layout"><aside class="card portal-class-sidebar"><div class="portal-class-sidebar-head"><div><b>Lớp học</b><small>' + state.classes.length + ' lớp</small></div><button class="btn btn-primary btn-sm" onclick="VMPortalClassroom.openClassForm()">+ Tạo</button></div><div class="portal-class-select-list">' + classList + '</div></aside>' + main + '</div>';
  }

  async function refresh(message) {
    await loadData();
    renderLearn();
    renderManage();
    if (message) toast(message, 'ok');
  }

  function openClassForm(classId) {
    var klass = state.classes.find(function (item) { return item.id === classId; }) || {};
    openModal('<form onsubmit="VMPortalClassroom.saveClass(event,\'' + (klass.id || '') + '\')"><div class="portal-modal-kicker">Lớp học</div><h2 id="portalModalTitle">' + (klass.id ? 'Chỉnh sửa lớp' : 'Tạo lớp mới') + '</h2><div class="portal-form-grid"><label class="portal-field full"><span>Tên lớp</span><input class="input" id="pcClassName" required maxlength="80" value="' + esc(klass.name || '') + '" placeholder="Ví dụ: Toán 10 - A1"></label><label class="portal-field"><span>Khối</span><input class="input" id="pcClassGrade" type="number" min="1" max="12" required value="' + esc(klass.grade || '') + '" placeholder="10"></label><label class="portal-field"><span>Niên khóa</span><input class="input" id="pcClassYear" required maxlength="20" value="' + esc(klass.school_year || '2026-2027') + '"></label><label class="portal-field full"><span>Ghi chú ngắn</span><textarea class="input" id="pcClassNote" rows="2" maxlength="300" placeholder="Mục tiêu hoặc lịch học của lớp">' + esc(klass.note || '') + '</textarea></label></div><div class="portal-form-actions"><button type="button" class="btn btn-secondary" onclick="VMPortalClassroom.closeModal()">Hủy</button><button class="btn btn-primary">' + (klass.id ? 'Lưu thay đổi' : 'Tạo lớp') + '</button></div></form>');
  }

  async function saveClass(event, classId) {
    event.preventDefault();
    var payload = {
      name: el('pcClassName').value.trim(),
      grade: Number(el('pcClassGrade').value),
      school_year: el('pcClassYear').value.trim(),
      note: el('pcClassNote').value.trim() || null,
      mode: 'online'
    };
    if (!payload.name || !Number.isInteger(payload.grade) || payload.grade < 1 || payload.grade > 12) {
      toast('Hãy nhập tên lớp và khối hợp lệ.', 'err'); return;
    }
    var result;
    if (classId) {
      result = await sb.from('classes').update(payload).eq('id', classId);
    } else {
      payload.portal_id = vmPortalState.portal.id;
      payload.teacher_id = vmPortalState.profile.id;
      payload.brand_id = vmPortalState.portal.brand ? vmPortalState.portal.brand.id : null;
      result = await sb.from('classes').insert(payload).select('id').single();
      if (!result.error) state.selectedClassId = result.data.id;
    }
    if (result.error) { toast('Không lưu được lớp: ' + result.error.message, 'err'); return; }
    closeModal();
    await refresh(classId ? 'Đã cập nhật lớp.' : 'Đã tạo lớp mới.');
  }

  function openLessonForm(lessonId) {
    var lesson = state.lessons.find(function (item) { return item.id === lessonId; }) || {};
    if (!selectedClass()) { toast('Hãy tạo hoặc chọn một lớp trước.', 'err'); return; }
    openModal('<form onsubmit="VMPortalClassroom.saveLesson(event,\'' + (lesson.id || '') + '\')"><div class="portal-modal-kicker">Bài giảng · ' + esc(selectedClass().name) + '</div><h2 id="portalModalTitle">' + (lesson.id ? 'Chỉnh sửa bài giảng' : 'Tạo bài giảng') + '</h2><div class="portal-form-grid"><label class="portal-field full"><span>Tiêu đề bài</span><input class="input" id="pcLessonTitle" required maxlength="140" value="' + esc(lesson.title || '') + '" placeholder="Ví dụ: Hàm số bậc hai"></label><label class="portal-field full"><span>Mô tả ngắn</span><input class="input" id="pcLessonNote" maxlength="300" value="' + esc(lesson.note || '') + '" placeholder="Học sinh sẽ thấy dòng này ở danh sách bài"></label><label class="portal-field full"><span>Nội dung bài giảng</span><textarea class="input portal-code-input" id="pcLessonContent" rows="10" placeholder="Nhập nội dung hoặc TeX, ví dụ $y=ax^2$">' + esc(lesson.latex_content || '') + '</textarea><small>Có thể dán nội dung TeX đang dùng tại VinhMath.</small></label><label class="portal-field"><span>Link video</span><input class="input" id="pcLessonVideo" type="url" value="' + esc(lesson.youtube_url || '') + '" placeholder="https://..."></label><label class="portal-field"><span>Link tài liệu/PDF</span><input class="input" id="pcLessonResource" type="url" value="' + esc(lesson.resource_url || '') + '" placeholder="https://..."></label><label class="portal-check full"><input type="checkbox" id="pcLessonPublished" ' + (lesson.published !== false ? 'checked' : '') + '><span><b>Công bố cho học sinh</b><small>Bỏ chọn để lưu bản nháp.</small></span></label></div><div class="portal-form-actions"><button type="button" class="btn btn-secondary" onclick="VMPortalClassroom.closeModal()">Hủy</button><button class="btn btn-primary">Lưu bài giảng</button></div></form>');
  }

  async function saveLesson(event, lessonId) {
    event.preventDefault();
    var klass = selectedClass();
    if (!klass) return;
    var video = el('pcLessonVideo').value.trim(), resource = el('pcLessonResource').value.trim();
    if ((video && !safeUrl(video)) || (resource && !safeUrl(resource))) { toast('Link video hoặc tài liệu chưa hợp lệ.', 'err'); return; }
    var payload = {
      class_id: klass.id,
      title: el('pcLessonTitle').value.trim(),
      note: el('pcLessonNote').value.trim() || null,
      latex_content: el('pcLessonContent').value.trim() || null,
      youtube_url: video || null,
      resource_url: resource || null,
      published: el('pcLessonPublished').checked,
      teacher_id: vmPortalState.profile.id
    };
    if (!lessonId) payload.sort = lessonsFor(klass.id).length;
    var result = lessonId ? await sb.from('lessons').update(payload).eq('id', lessonId) : await sb.from('lessons').insert(payload);
    if (result.error) { toast('Không lưu được bài giảng: ' + result.error.message, 'err'); return; }
    closeModal();
    await refresh(lessonId ? 'Đã cập nhật bài giảng.' : 'Đã tạo bài giảng mới.');
  }

  function openExamForm() {
    if (!selectedClass()) { toast('Hãy tạo hoặc chọn một lớp trước.', 'err'); return; }
    openModal('<form onsubmit="VMPortalClassroom.saveExam(event)"><div class="portal-modal-kicker">Đề thi · ' + esc(selectedClass().name) + '</div><h2 id="portalModalTitle">Thêm đề cho học sinh</h2><div class="portal-form-grid"><label class="portal-field full"><span>Tên đề</span><input class="input" id="pcExamTitle" required maxlength="160" placeholder="Ví dụ: Kiểm tra 45 phút - Chương 1"></label><label class="portal-field"><span>Thời gian làm</span><div class="portal-input-suffix"><input class="input" id="pcExamDuration" type="number" min="1" max="300" value="45" required><span>phút</span></div></label><label class="portal-field"><span>Loại đề</span><select class="input" id="pcExamType"><option value="mc">Trắc nghiệm</option><option value="tf">Đúng / Sai</option><option value="thpt">Cấu trúc THPT</option></select></label><label class="portal-field full"><span>Nội dung TeX</span><textarea class="input portal-code-input" id="pcExamSource" rows="13" required placeholder="Dán các khối \\begin{ex} ... \\end{ex}"></textarea><div class="portal-source-tools"><button type="button" class="btn btn-secondary btn-sm" onclick="VMPortalClassroom.insertExamTemplate()">Chèn mẫu 1 câu</button><label class="btn btn-secondary btn-sm portal-file-button">Tải tệp .tex<input id="pcExamFile" type="file" accept=".tex,.txt,text/plain" onchange="VMPortalClassroom.loadTexFile(event)"></label><span id="pcExamCount">Chưa phân tích</span></div></label><label class="portal-check full"><input type="checkbox" id="pcExamPublished" checked><span><b>Mở đề cho học sinh ngay</b><small>Có thể ẩn lại sau trong danh sách đề.</small></span></label></div><div class="portal-form-actions"><button type="button" class="btn btn-secondary" onclick="VMPortalClassroom.closeModal()">Hủy</button><button class="btn btn-primary" id="pcExamSave">Tạo đề thi</button></div></form>');
    el('pcExamSource').addEventListener('input', updateExamCount);
  }

  function parsedExamQuestions() {
    var source = el('pcExamSource') ? el('pcExamSource').value.trim() : '';
    return source && typeof window.parseLatexQuestions === 'function' ? window.parseLatexQuestions(source) : [];
  }
  function updateExamCount() {
    var questions = parsedExamQuestions();
    var label = el('pcExamCount');
    if (label) label.textContent = questions.length ? ('Nhận diện ' + questions.length + ' câu') : 'Chưa nhận diện được câu hỏi';
  }
  function insertExamTemplate() {
    var area = el('pcExamSource');
    if (!area) return;
    var sample = '\\begin{ex}\nNội dung câu hỏi.\n\\choice\n{Phương án A}\n{\\True Phương án B đúng}\n{Phương án C}\n{Phương án D}\n\\loigiai{Trình bày lời giải tại đây.}\n\\end{ex}';
    area.value += (area.value.trim() ? '\n\n' : '') + sample;
    area.focus(); updateExamCount();
  }
  async function loadTexFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Tệp TeX vượt quá 2 MB.', 'err'); event.target.value = ''; return; }
    el('pcExamSource').value = await file.text();
    updateExamCount();
  }

  async function saveExam(event) {
    event.preventDefault();
    var klass = selectedClass();
    var questions = parsedExamQuestions();
    if (!klass || !questions.length) { toast('Chưa nhận diện được câu hỏi trong nội dung TeX.', 'err'); return; }
    var invalid = questions.some(function (question) { return !question.content_latex || !Array.isArray(question.choices) || !question.choices.length; });
    if (invalid) { toast('Có câu hỏi thiếu phương án hoặc đáp án. Hãy kiểm tra lại TeX.', 'err'); return; }
    var button = el('pcExamSave');
    button.disabled = true; button.textContent = 'Đang tạo…';
    var published = el('pcExamPublished').checked;
    var examId = null;
    try {
      var examResult = await sb.from('exams').insert({
        portal_id: vmPortalState.portal.id,
        class_id: klass.id,
        title: el('pcExamTitle').value.trim(),
        duration_minutes: Math.max(1, Math.min(300, Number(el('pcExamDuration').value) || 45)),
        shuffle: true,
        published: published,
        de_type: el('pcExamType').value,
        latex_source: el('pcExamSource').value.trim(),
        template_key: 'portal-simple'
      }).select('id').single();
      if (examResult.error) throw examResult.error;
      examId = examResult.data.id;
      for (var i = 0; i < questions.length; i++) {
        var question = questions[i];
        var questionResult = await sb.from('questions').insert({
          portal_id: vmPortalState.portal.id,
          source_id: 'PORTAL-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).slice(2,6).toUpperCase(),
          content_latex: question.content_latex,
          choices: question.choices,
          solution_latex: question.solution_latex || null,
          difficulty: 'TH'
        }).select('id').single();
        if (questionResult.error) throw questionResult.error;
        var linkResult = await sb.from('exam_questions').insert({exam_id:examId, question_id:questionResult.data.id, sort:i});
        if (linkResult.error) throw linkResult.error;
      }
      var assignment = await sb.from('exam_portal_exams').insert({
        portal_id: vmPortalState.portal.id,
        exam_id: examId,
        class_id: klass.id,
        published: published,
        show_result: true,
        sort: examsFor(klass.id).length
      });
      if (assignment.error) throw assignment.error;
      closeModal();
      await refresh('Đã tạo đề với ' + questions.length + ' câu.');
      await refreshPortalExams();
    } catch (error) {
      if (examId) await cleanupExam(examId);
      button.disabled = false; button.textContent = 'Tạo đề thi';
      toast('Không tạo được đề: ' + (error.message || error), 'err');
    }
  }

  async function cleanupExam(examId) {
    var links = await sb.from('exam_questions').select('question_id').eq('exam_id', examId);
    var ids = (links.data || []).map(function (item) { return item.question_id; });
    await sb.from('exams').delete().eq('id', examId);
    if (ids.length) await sb.from('questions').delete().in('id', ids);
  }

  async function refreshPortalExams() {
    var result = await sb.from('exam_portal_exams').select('portal_id,exam_id,class_id,published,show_result,available_from,available_until,sort,exam:exams(id,title,duration_minutes,opens_at,closes_at,de_type,exam_questions(count))').eq('portal_id', vmPortalState.portal.id).order('sort').order('available_from', {ascending:true, nullsFirst:true});
    if (result.error) return;
    vmPortalState.assignments = result.data || [];
    if (typeof vmPortalRenderExams === 'function') vmPortalRenderExams();
    if (typeof vmPortalRenderResults === 'function') vmPortalRenderResults();
  }

  async function toggleStudent(studentId, checked) {
    var klass = selectedClass();
    if (!klass) return;
    var result = checked ? await sb.from('class_students').upsert({class_id:klass.id,student_id:studentId},{onConflict:'class_id,student_id'}) : await sb.from('class_students').delete().eq('class_id',klass.id).eq('student_id',studentId);
    if (result.error) { toast('Không cập nhật được học sinh: ' + result.error.message, 'err'); renderManage(); return; }
    await refresh(checked ? 'Đã thêm học sinh vào lớp.' : 'Đã đưa học sinh ra khỏi lớp.');
  }

  async function toggleExam(examId, published) {
    var results = await Promise.all([
      sb.from('exams').update({published:published}).eq('id', examId),
      sb.from('exam_portal_exams').update({published:published}).eq('portal_id', vmPortalState.portal.id).eq('exam_id', examId)
    ]);
    if (results[0].error || results[1].error) { toast('Không đổi được trạng thái đề.', 'err'); return; }
    await refresh(published ? 'Đã mở đề cho học sinh.' : 'Đã ẩn đề.');
    await refreshPortalExams();
  }

  async function deleteLesson(lessonId) {
    if (!confirm('Xóa bài giảng này?')) return;
    var result = await sb.from('lessons').delete().eq('id', lessonId);
    if (result.error) { toast('Không xóa được bài giảng: ' + result.error.message, 'err'); return; }
    await refresh('Đã xóa bài giảng.');
  }

  async function deleteExam(examId) {
    if (!confirm('Xóa đề thi và toàn bộ câu hỏi của đề này?')) return;
    await cleanupExam(examId);
    await refresh('Đã xóa đề thi.');
    await refreshPortalExams();
  }

  async function deleteClass(classId) {
    if (!confirm('Xóa lớp này cùng bài giảng và đề thi thuộc lớp?')) return;
    var classExamIds = examsFor(classId).map(function (item) { return item.id; });
    for (var i = 0; i < classExamIds.length; i++) await cleanupExam(classExamIds[i]);
    var result = await sb.from('classes').delete().eq('id', classId);
    if (result.error) { toast('Không xóa được lớp: ' + result.error.message, 'err'); return; }
    state.selectedClassId = null;
    await refresh('Đã xóa lớp.');
    await refreshPortalExams();
  }

  async function init(canManage) {
    state.canManage = !!canManage;
    try {
      await loadData();
      renderLearn();
      if (state.canManage) renderManage();
    } catch (error) {
      var lessonBox = el('portalLessonList');
      if (lessonBox) lessonBox.innerHTML = '<div class="card portal-empty">Không tải được lớp học: ' + esc(error.message || error) + '</div>';
      var manageBox = el('portalManageContent');
      if (manageBox && state.canManage) manageBox.innerHTML = '<div class="card portal-empty">Không tải được công cụ quản lý.</div>';
    }
  }

  window.VMPortalClassroom = {
    init: init,
    closeModal: closeModal,
    selectClass: function (id) { state.selectedClassId = id; renderManage(); },
    openClassForm: openClassForm,
    saveClass: saveClass,
    openLessonForm: openLessonForm,
    saveLesson: saveLesson,
    openExamForm: openExamForm,
    insertExamTemplate: insertExamTemplate,
    loadTexFile: loadTexFile,
    saveExam: saveExam,
    toggleStudent: toggleStudent,
    toggleExam: toggleExam,
    deleteLesson: deleteLesson,
    deleteExam: deleteExam,
    deleteClass: deleteClass,
    _state: state
  };
})();
