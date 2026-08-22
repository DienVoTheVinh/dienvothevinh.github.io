(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function card(icon, title, detail, href, count) {
    return '<a class="vm-role-action" href="' + href + '"><span class="ic">' + icon + '</span>' +
      (count != null ? '<span class="count">' + esc(count) + '</span>' : '') +
      '<b>' + esc(title) + '</b><small>' + esc(detail) + '</small></a>';
  }

  async function count(table, configure) {
    try {
      var query = sb.from(table).select('id', {count:'exact', head:true});
      var result = await configure(query);
      return result.count || 0;
    } catch (_) { return 0; }
  }

  function hideInternalInstallPanel() {
    var hero = document.getElementById('vmInstallHero');
    if (!hero) return;
    hero.hidden = true;
    hero.classList.remove('is-visible');
    hero.style.display = 'none';
  }

  function classIds(profile) {
    return (profile.class_students || []).map(function (item) { return item.class_id; }).filter(Boolean);
  }

  async function loadStudentSnapshot(profile) {
    var ids = classIds(profile);
    var gradedPromise = count('submissions', function (query) {
      return query.eq('student_id', profile.id).eq('status', 'graded');
    });
    if (!ids.length) return {lessons:[], exams:[], posts:[], tasks:[], reminders:[], graded:await gradedPromise};
    var results = await Promise.all([
      sb.from('lessons')
        .select('id,title,class_id,created_at,homework_text,homework_images,homework_document_id,homework_latex_content,homework_due,test_document_id,test_latex_content,test_active,test_started_at,test_deadline,linked_exam_id,linked_exam_ids,topics(name)')
        .in('class_id', ids).eq('published', true).order('created_at', {ascending:false}).limit(14),
      sb.from('exams')
        .select('id,title,class_id,created_at,opens_at,closes_at,de_type')
        .in('class_id', ids).eq('published', true).order('created_at', {ascending:false}).limit(10),
      sb.from('class_posts')
        .select('id,title,class_id,created_at')
        .in('class_id', ids).order('pinned', {ascending:false}).order('created_at', {ascending:false}).limit(3),
      gradedPromise,
      sb.rpc('hs_ho_so'),
      sb.rpc('get_my_reminders')
    ]);
    var missionData = results[4] && results[4].data && !results[4].data.error ? results[4].data : {};
    if (missionData && Object.keys(missionData).length) window._nvData = missionData;
    return {lessons:results[0].data || [], exams:results[1].data || [], posts:results[2].data || [], graded:results[3] || 0,
      tasks:Array.isArray(missionData.tasks) ? missionData.tasks : [], reminders:results[5].data || []};
  }

  function classNameMap(profile) {
    var map = {};
    (profile.class_students || []).forEach(function (membership) {
      map[membership.class_id] = membership.classes && membership.classes.name || 'Lớp học';
    });
    return map;
  }

  var vmStudentFeed = [];
  var vmStudentTodos = [];
  var vmStudentFeedFilter = 'todo';
  function hasText(value) { return typeof value === 'string' && value.trim() !== ''; }
  function hasFiles(value) { return Array.isArray(value) && value.length > 0; }

  function formatUpdateTime(value) {
    if (!value) return 'Mới cập nhật';
    var date = new Date(value);
    if (isNaN(date.getTime())) return 'Mới cập nhật';
    var delta = Date.now() - date.getTime();
    if (delta >= 0 && delta < 3600000) return Math.max(1, Math.round(delta / 60000)) + ' phút trước';
    if (delta >= 0 && delta < 86400000) return Math.max(1, Math.round(delta / 3600000)) + ' giờ trước';
    return new Intl.DateTimeFormat('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric'}).format(date);
  }

  function formatDeadline(value, prefix) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return prefix + ' ' + new Intl.DateTimeFormat('vi-VN', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
  }

  function parseDueDate(value) {
    if (!value) return null;
    var plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    var date = plain ? new Date(+plain[1], +plain[2] - 1, +plain[3], 23, 59, 59, 999) : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function todoDue(value) {
    var due = parseDueDate(value);
    if (!due) return {priority:null, label:'', time:Number.MAX_SAFE_INTEGER, state:'normal'};
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    var days = Math.round((dueDay - today) / 86400000);
    if (days < 0) return {priority:0, label:'Quá hạn ' + (-days) + ' ngày', time:due.getTime(), state:'overdue'};
    if (days === 0) return {priority:1, label:'Hôm nay', time:due.getTime(), state:'today'};
    if (days === 1) return {priority:2, label:'Ngày mai', time:due.getTime(), state:'soon'};
    return {priority:days <= 3 ? 3 : 6, label:'Còn ' + days + ' ngày', time:due.getTime(), state:days <= 3 ? 'soon' : 'normal'};
  }

  function buildStudentTodos(snapshot, profile) {
    var names = classNameMap(profile), lessons = {}, todos = [];
    var kind = {
      review:{icon:'🔎', label:'Xem lại bài đã chấm', tab:'', weight:2},
      btvn:{icon:'📝', label:'Bài tập về nhà', tab:'btvn', weight:4},
      test:{icon:'🧪', label:'Bài kiểm tra', tab:'test', weight:3},
      dando:{icon:'📌', label:'Lời dặn của giáo viên', tab:'', weight:5},
      lesson:{icon:'📚', label:'Bài giảng chưa xem', tab:'', weight:7}
    };
    (snapshot.lessons || []).forEach(function (lesson) { lessons[lesson.id] = lesson; });
    (snapshot.tasks || []).forEach(function (task) {
      var meta = kind[task.kind] || kind.lesson, lesson = lessons[task.lesson_id] || {};
      var dueValue = task.kind === 'btvn' ? lesson.homework_due : (task.kind === 'test' ? lesson.test_deadline : null);
      var due = todoDue(dueValue), priority = due.priority == null ? meta.weight : due.priority;
      todos.push({id:'todo-task-' + task.kind + '-' + task.lesson_id, type:'todo', icon:meta.icon, label:meta.label,
        title:task.title || 'Việc cần làm', className:task.class_name || names[task.class_id] || 'Lớp học',
        detail:due.label || meta.label, priorityLabel:due.label || 'Ưu tiên', priorityState:due.state,
        priority:priority, dueTime:due.time, createdAt:task.created_at,
        href:'bai-hoc?id=' + encodeURIComponent(task.lesson_id) + (meta.tab ? '&tab=' + meta.tab : '')});
    });
    (snapshot.reminders || []).filter(function (item) { return !item.done; }).forEach(function (item) {
      var due = todoDue(item.due_date);
      if (due.priority != null && due.priority > 6) return;
      var className = item.scope || names[item.class_id] || 'Nhắc nhở từ giáo viên';
      todos.push({id:'todo-reminder-' + item.id, type:'todo', icon:'📌', label:'Giáo viên nhắc',
        title:item.content || item.lesson_title || 'Nhắc nhở học tập', className:className,
        detail:due.label || 'Cần hoàn thành', priorityLabel:due.label || 'Ưu tiên', priorityState:due.state,
        priority:due.priority == null ? 3 : due.priority, dueTime:due.time, createdAt:item.created_at || item.due_date,
        href:item.lesson_id ? 'bai-hoc?id=' + encodeURIComponent(item.lesson_id) : 'lop-hoc'});
    });
    return todos.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.dueTime !== b.dueTime) return a.dueTime - b.dueTime;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function buildStudentFeed(snapshot, profile) {
    var names = classNameMap(profile), linkedExams = {}, feed = [];
    (snapshot.lessons || []).forEach(function (lesson) {
      var className = names[lesson.class_id] || 'Lớp học';
      var topic = lesson.topics && lesson.topics.name ? lesson.topics.name : 'Bài giảng';
      var base = {lessonId:lesson.id, title:lesson.title, className:className, createdAt:lesson.created_at};
      feed.push(Object.assign({}, base, {id:'lesson-' + lesson.id, type:'lesson', icon:'📚', label:'Bài giảng mới', detail:topic, href:'bai-hoc?id=' + encodeURIComponent(lesson.id)}));
      var homework = hasText(lesson.homework_text) || hasFiles(lesson.homework_images) || !!lesson.homework_document_id || hasText(lesson.homework_latex_content);
      if (homework) feed.push(Object.assign({}, base, {id:'homework-' + lesson.id, type:'homework', icon:'📝', label:'Bài tập mới', detail:formatDeadline(lesson.homework_due, 'Hạn') || 'Bài tập về nhà', href:'bai-hoc?id=' + encodeURIComponent(lesson.id) + '&tab=btvn'}));
      var linked = Array.isArray(lesson.linked_exam_ids) ? lesson.linked_exam_ids.slice() : [];
      if (lesson.linked_exam_id) linked.push(lesson.linked_exam_id);
      linked.forEach(function (id) { if (id) linkedExams[id] = true; });
      var test = !!lesson.test_document_id || hasText(lesson.test_latex_content) || !!lesson.test_active || linked.length > 0;
      if (test) feed.push(Object.assign({}, base, {id:'test-' + lesson.id, type:'test', icon:'🧪', label:'Bài kiểm tra mới', detail:formatDeadline(lesson.test_deadline, 'Đóng lúc') || 'Trong bài giảng', href:'bai-hoc?id=' + encodeURIComponent(lesson.id) + '&tab=test'}));
    });
    (snapshot.exams || []).forEach(function (exam) {
      if (linkedExams[exam.id]) return;
      feed.push({id:'exam-' + exam.id, type:'test', icon:'🧪', label:'Đề luyện mới', title:exam.title, className:names[exam.class_id] || 'Lớp học', detail:formatDeadline(exam.closes_at, 'Đóng lúc') || 'Sẵn sàng làm bài', createdAt:exam.created_at || exam.opens_at, href:'luyen-de?exam_id=' + encodeURIComponent(exam.id)});
    });
    return feed.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  }

  function renderStudentFeed() {
    var box = document.getElementById('vmStudentLatest');
    if (!box) return;
    var rows = vmStudentFeedFilter === 'todo' ? vmStudentTodos.slice(0, 10) : vmStudentFeed.filter(function (item) { return item.type === vmStudentFeedFilter; }).slice(0, 10);
    if (!rows.length) {
      box.innerHTML = vmStudentFeedFilter === 'todo'
        ? '<div class="vm-student-empty"><span>🎉</span><b>Em đã hoàn thành mọi việc</b><small>Việc mới hoặc sắp đến hạn sẽ tự xuất hiện tại đây.</small></div>'
        : '<div class="vm-student-empty"><span>📭</span><b>Chưa có cập nhật mới</b><small>Bài giảng, bài tập và bài kiểm tra mới sẽ cùng xuất hiện tại đây.</small></div>';
      return;
    }
    box.innerHTML = rows.map(function (item) {
      var priorityClass = item.type === 'todo' ? ' priority-' + esc(item.priorityState || 'normal') : '';
      var timeLabel = item.type === 'todo' ? item.priorityLabel : formatUpdateTime(item.createdAt);
      return '<a class="vm-student-feed-row type-' + esc(item.type) + priorityClass + '" href="' + esc(item.href) + '"><span class="vm-student-feed-icon">' + item.icon + '</span>' +
        '<span class="vm-student-feed-copy"><span class="vm-student-feed-meta"><b>' + esc(item.label) + '</b><small>' + esc(timeLabel) + '</small></span>' +
        '<strong>' + esc(item.title) + '</strong><small>' + esc(item.className) + ' · ' + esc(item.detail || '') + '</small></span><span class="vm-student-feed-open">Mở →</span></a>';
    }).join('');
  }

  function bindFeedFilters() {
    var filters = document.getElementById('vmStudentFeedFilters');
    if (!filters || filters.dataset.bound === '1') return;
    filters.dataset.bound = '1';
    filters.addEventListener('click', function (event) {
      var button = event.target.closest('[data-feed-filter]');
      if (!button) return;
      vmStudentFeedFilter = button.getAttribute('data-feed-filter') || 'todo';
      filters.querySelectorAll('[data-feed-filter]').forEach(function (item) { item.classList.toggle('active', item === button); });
      renderStudentFeed();
    });
  }

  function renderPosts(snapshot, profile) {
    var names = classNameMap(profile);
    if (!snapshot.posts.length) return '<div class="vm-student-side-empty">Không có thông báo mới.</div>';
    return snapshot.posts.map(function (post) {
      return '<a class="vm-student-post" href="bang-tin-lop?classId=' + encodeURIComponent(post.class_id) + '"><span>📌</span><span><b>' + esc(post.title || 'Thông báo lớp') + '</b><small>' + esc(names[post.class_id] || 'Lớp học') + '</small></span></a>';
    }).join('');
  }

  function moveLiveCards() {
    var slot = document.getElementById('vmStudentLiveSlot');
    if (!slot) return;
    ['khungDiemDanhHoc', 'khungMeetHoc'].forEach(function (id) {
      var liveCard = document.getElementById(id);
      if (liveCard && liveCard.parentElement !== slot) slot.appendChild(liveCard);
    });
  }

  async function renderStudentHome(profile, box, actions, title, sub) {
    document.body.classList.add('vm-home-student');
    hideInternalInstallPanel();
    title.textContent = 'Cập nhật học tập mới nhất';
    sub.textContent = 'Mọi bài giảng, bài tập và bài kiểm tra từ các lớp của em — không cần chọn từng lớp.';
    actions.innerHTML = '<div class="vm-student-home-grid"><section class="vm-student-main-card">' +
      '<div class="vm-student-card-head"><div><span class="vm-student-kicker">MỚI TỪ CÁC LỚP CỦA EM</span><h3>Dòng cập nhật học tập</h3><p>Thông tin mới nhất được gom theo thời gian, không trùng lặp giữa các lớp.</p></div><a class="btn btn-primary btn-sm" href="lop-hoc">Xem tất cả bài giảng →</a></div>' +
      '<div class="vm-student-feed-filters" id="vmStudentFeedFilters"><button class="vm-student-todo-filter active" type="button" data-feed-filter="todo">Cần làm <span id="vmStudentTodoCount">0</span></button><button type="button" data-feed-filter="lesson">Bài giảng</button><button type="button" data-feed-filter="homework">Bài tập</button><button type="button" data-feed-filter="test">Kiểm tra</button></div>' +
      '<div class="vm-student-latest" id="vmStudentLatest"><div class="vm-student-loading">Đang tải cập nhật…</div></div></section>' +
      '<aside class="vm-student-side"><div class="vm-student-quick-grid"><a href="ket-qua"><span>✅</span><b>0</b><small>Bài đã chấm</small></a><a href="luyen-de"><span>🧪</span><b>Thi</b><small>Luyện tập</small></a><a href="thanh-tuu"><span>🗺️</span><b>Level</b><small>Bản đồ thành tựu</small></a></div>' +
      '<div id="vmStudentLiveSlot" class="vm-student-live-slot"></div><section class="vm-student-notices"><div class="vm-student-side-head"><b>Thông báo mới</b><a href="lop-hoc">Xem trong lớp</a></div><div id="vmStudentPosts"><div class="vm-student-loading">Đang tải…</div></div></section></aside></div>';
    moveLiveCards();
    box.classList.add('is-ready');
    bindFeedFilters();
    var snapshot = await loadStudentSnapshot(profile);
    vmStudentFeed = buildStudentFeed(snapshot, profile);
    vmStudentTodos = buildStudentTodos(snapshot, profile);
    var todoCount = document.getElementById('vmStudentTodoCount');
    if (todoCount) todoCount.textContent = vmStudentTodos.length;
    renderStudentFeed();
    var posts = document.getElementById('vmStudentPosts');
    if (posts) posts.innerHTML = renderPosts(snapshot, profile);
    var graded = actions.querySelector('.vm-student-quick-grid a[href="ket-qua"] b');
    if (graded) graded.textContent = snapshot.graded;
  }

  window.vmRoleHomeRender = async function (profile) {
    hideInternalInstallPanel();
    var box = document.getElementById('vmRoleFocus'), actions = document.getElementById('vmRoleActions'), title = document.getElementById('vmRoleTitle'), sub = document.getElementById('vmRoleSub');
    if (!box || !profile) return;
    var role = profile.role;
    if (['admin', 'teacher', 'assistant'].indexOf(role) !== -1) {
      document.body.classList.add('vm-home-staff');
      var pending = await count('submissions', function (query) { return query.eq('status', 'submitted'); });
      var classes = role === 'admin' ? 'Tất cả' : ((profile.class_students || []).length || 'Của tôi');
      title.textContent = 'Việc cần ưu tiên';
      sub.textContent = 'Đi thẳng vào công việc giảng dạy thường dùng nhất.';
      actions.innerHTML = card('🏫','Lớp học','Mở ngay lớp và danh sách bài giảng gần nhất.','quan-tri-lop',classes) + card('✍️','Bài chờ chấm','Xử lý bài nộp chưa được phản hồi.','quan-tri-cham-bai',pending) + card('📅','Lịch dạy','Xem buổi dạy, điểm danh và thay đổi lịch.','quan-tri-lich') + card('📚','Nội dung','Soạn tài liệu, đề thi và bài học.','quan-tri-tai-lieu');
      box.classList.add('is-ready');
      return;
    }
    await renderStudentHome(profile, box, actions, title, sub);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideInternalInstallPanel);
  else hideInternalInstallPanel();
})();
