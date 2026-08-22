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

  function activeClass(profile) {
    var memberships = profile.class_students || [];
    var saved = localStorage.getItem('vm-active-class-id');
    return memberships.find(function (item) { return item.class_id === saved; }) || memberships[0] || null;
  }

  async function loadStudentSnapshot(profile) {
    var ids = classIds(profile);
    var gradedPromise = count('submissions', function (query) {
      return query.eq('student_id', profile.id).eq('status', 'graded');
    });
    if (!ids.length) return {lessons:[], posts:[], graded:await gradedPromise};
    var results = await Promise.all([
      sb.from('lessons')
        .select('id,title,class_id,created_at,topics(name)')
        .in('class_id', ids)
        .eq('published', true)
        .order('created_at', {ascending:false})
        .limit(6),
      sb.from('class_posts')
        .select('id,title,class_id,created_at')
        .in('class_id', ids)
        .order('pinned', {ascending:false})
        .order('created_at', {ascending:false})
        .limit(3),
      gradedPromise
    ]);
    return {
      lessons: results[0].data || [],
      posts: results[1].data || [],
      graded: results[2] || 0
    };
  }

  function classNameMap(profile) {
    var map = {};
    (profile.class_students || []).forEach(function (membership) {
      map[membership.class_id] = membership.classes && membership.classes.name || 'Lớp học';
    });
    return map;
  }

  function renderLatestLessons(snapshot, profile) {
    var names = classNameMap(profile);
    if (!snapshot.lessons.length) {
      return '<div class="vm-student-empty"><span>📚</span><b>Chưa có bài giảng mới</b><small>Khi giáo viên công bố bài, em sẽ thấy ngay tại đây.</small></div>';
    }
    return snapshot.lessons.slice(0, 5).map(function (lesson, index) {
      var topic = lesson.topics && lesson.topics.name ? lesson.topics.name : names[lesson.class_id];
      return '<a class="vm-student-lesson-row" href="bai-hoc?id=' + encodeURIComponent(lesson.id) + '">' +
        '<span class="vm-student-lesson-number">' + (index + 1) + '</span><span><b>' + esc(lesson.title) +
        '</b><small>' + esc(topic || 'Bài giảng') + ' · ' + esc(names[lesson.class_id] || 'Lớp học') +
        '</small></span><strong>Vào học →</strong></a>';
    }).join('');
  }

  function renderPosts(snapshot, profile) {
    var names = classNameMap(profile);
    if (!snapshot.posts.length) return '<div class="vm-student-side-empty">Không có thông báo mới.</div>';
    return snapshot.posts.map(function (post) {
      return '<a class="vm-student-post" href="bang-tin-lop?classId=' + encodeURIComponent(post.class_id) + '">' +
        '<span>📌</span><span><b>' + esc(post.title || 'Thông báo lớp') + '</b><small>' +
        esc(names[post.class_id] || 'Lớp học') + '</small></span></a>';
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
    var selected = activeClass(profile);
    var selectedName = selected && selected.classes ? selected.classes.name : '';
    title.textContent = 'Tổng quan hôm nay';
    sub.textContent = 'Bài học, lịch gần nhất và kết quả mới — tất cả trong một màn hình.';
    actions.innerHTML = '<div class="vm-student-home-grid">' +
      '<section class="vm-student-main-card">' +
        '<div class="vm-student-card-head"><div><span class="vm-student-kicker">HỌC TIẾP</span><h3>' +
          esc(selectedName || 'Lớp học của em') + '</h3><p>Bài giảng mới nhất được ưu tiên trước.</p></div>' +
          '<a class="btn btn-primary btn-sm" href="lop-hoc">Xem tất cả bài giảng →</a></div>' +
        '<div class="vm-student-latest" id="vmStudentLatest"><div class="vm-student-loading">Đang tải bài giảng…</div></div>' +
      '</section>' +
      '<aside class="vm-student-side">' +
        '<div class="vm-student-quick-grid">' +
          '<a href="ket-qua"><span>✅</span><b>0</b><small>Bài đã chấm</small></a>' +
          '<a href="luyen-de"><span>🧪</span><b>Thi</b><small>Luyện tập</small></a>' +
          '<a href="ca-nhan"><span>👤</span><b>Em</b><small>Trang cá nhân</small></a>' +
        '</div>' +
        '<div id="vmStudentLiveSlot" class="vm-student-live-slot"></div>' +
        '<section class="vm-student-notices"><div class="vm-student-side-head"><b>Thông báo mới</b><a href="lop-hoc">Xem trong lớp</a></div><div id="vmStudentPosts"><div class="vm-student-loading">Đang tải…</div></div></section>' +
      '</aside>' +
    '</div>';
    moveLiveCards();
    box.classList.add('is-ready');
    var snapshot = await loadStudentSnapshot(profile);
    var latest = document.getElementById('vmStudentLatest');
    var posts = document.getElementById('vmStudentPosts');
    if (latest) latest.innerHTML = renderLatestLessons(snapshot, profile);
    if (posts) posts.innerHTML = renderPosts(snapshot, profile);
    var graded = actions.querySelector('.vm-student-quick-grid a[href="ket-qua"] b');
    if (graded) graded.textContent = snapshot.graded;
  }

  window.vmRoleHomeRender = async function (profile) {
    hideInternalInstallPanel();
    var box = document.getElementById('vmRoleFocus');
    var actions = document.getElementById('vmRoleActions');
    var title = document.getElementById('vmRoleTitle');
    var sub = document.getElementById('vmRoleSub');
    if (!box || !profile) return;
    var role = profile.role;
    if (['admin', 'teacher', 'assistant'].indexOf(role) !== -1) {
      document.body.classList.add('vm-home-staff');
      var pending = await count('submissions', function (query) { return query.eq('status', 'submitted'); });
      var classes = role === 'admin' ? 'Tất cả' : ((profile.class_students || []).length || 'Của tôi');
      title.textContent = 'Việc cần ưu tiên';
      sub.textContent = 'Đi thẳng vào công việc giảng dạy thường dùng nhất.';
      actions.innerHTML = card('🏫','Lớp học','Mở ngay lớp và danh sách bài giảng gần nhất.','quan-tri-lop',classes) +
        card('✍️','Bài chờ chấm','Xử lý bài nộp chưa được phản hồi.','quan-tri-cham-bai',pending) +
        card('📅','Lịch dạy','Xem buổi dạy, điểm danh và thay đổi lịch.','quan-tri-lich') +
        card('📚','Nội dung','Soạn tài liệu, đề thi và bài học.','quan-tri-tai-lieu');
      box.classList.add('is-ready');
      return;
    }
    await renderStudentHome(profile, box, actions, title, sub);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideInternalInstallPanel);
  else hideInternalInstallPanel();
})();
