/* VinhMath — professional exam authoring, preview and analytics workspace. */
(function () {
  'use strict';

  var state = {
    profile: null,
    classes: [],
    exams: [],
    parsed: [],
    editingId: null,
    templateKey: 'custom',
    previewTimer: 0,
    pdfUrl: '',
    analytics: null
  };

  var TYPES = {
    mc: 'Trắc nghiệm', tf: 'Đúng/Sai', essay: 'Tự luận', combo: 'Kết hợp', thpt: 'THPTQG'
  };

  var SNIPPETS = {
    mc: String.raw`\begin{ex}
Nội dung câu hỏi trắc nghiệm.
\choice
{Phương án A}
{\True Phương án B đúng}
{Phương án C}
{Phương án D}
\loigiai{Giải thích vì sao phương án B đúng.}
\end{ex}`,
    tf: String.raw`\begin{ex}
Cho dữ kiện sau. Xét tính đúng sai của các khẳng định.
\choiceTF
{\True Khẳng định a đúng}
{Khẳng định b sai}
{\True Khẳng định c đúng}
{Khẳng định d sai}
\loigiai{Phân tích lần lượt bốn khẳng định.}
\end{ex}`,
    short: String.raw`\begin{bt}
Tính giá trị của biểu thức và ghi kết quả vào ô trả lời.
\loigiai{\textbf{Câu trả lời:} 2026

Trình bày cách tính để nhận được đáp số.}
\end{bt}`
  };

  var TEMPLATES = {
    'thpt-standard': {
      title: 'Đề thi thử tốt nghiệp THPT — Lần 1', type: 'thpt', duration: 90,
      source: String.raw`% PHẦN I — TRẮC NGHIỆM 4 PHƯƠNG ÁN
\begin{ex}
Cho hàm số $f(x)=x^2-2x$. Giá trị $f(2)$ bằng
\choice
{$-2$}
{\True $0$}
{$2$}
{$4$}
\loigiai{Thay $x=2$, ta được $f(2)=2^2-2\cdot2=0$.}
\end{ex}

% PHẦN II — ĐÚNG/SAI, MỖI CÂU 4 Ý
\begin{ex}
Cho hàm số $y=x^2$. Xét tính đúng sai của các khẳng định sau.
\choiceTF
{\True Đồ thị đi qua điểm $O(0;0)$}
{Hàm số nghịch biến trên $\mathbb R$}
{\True Hàm số đồng biến trên $(0;+\infty)$}
{Tập giá trị của hàm số là $\mathbb R$}
\loigiai{Dựa vào tính chất của parabol $y=x^2$ để xét từng ý.}
\end{ex}

% PHẦN III — TRẢ LỜI NGẮN
\begin{bt}
Một cấp số cộng có $u_1=2$, công sai $d=3$. Tính $u_5$.
\loigiai{\textbf{Câu trả lời:} 14

Ta có $u_5=u_1+4d=2+4\cdot3=14$.}
\end{bt}`
    },
    'thpt-practice': {
      title: 'Luyện cấu trúc đề tốt nghiệp THPT — 3 phần', type: 'thpt', duration: 90,
      source: String.raw`% MẪU LUYỆN TẬP THPTQG — THAY NỘI DUNG NHƯNG GIỮ CẤU TRÚC
% I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN
\begin{ex}
Nghiệm của phương trình $2x-6=0$ là
\choice
{$x=-3$}
{$x=-2$}
{\True $x=3$}
{$x=6$}
\loigiai{$2x-6=0\Leftrightarrow x=3$.}
\end{ex}

\begin{ex}
Đạo hàm của hàm số $y=x^3$ là
\choice
{$y'=x^2$}
{\True $y'=3x^2$}
{$y'=3x$}
{$y'=x^4$}
\loigiai{Áp dụng công thức $(x^n)'=nx^{n-1}$.}
\end{ex}

% II. TRẮC NGHIỆM ĐÚNG/SAI
\begin{ex}
Cho cấp số nhân $(u_n)$ với $u_1=2$, công bội $q=3$.
\choiceTF
{\True $u_2=6$}
{$u_3=12$}
{\True $u_n=2\cdot3^{n-1}$}
{$u_4=36$}
\loigiai{Tính $u_n=u_1q^{n-1}$ rồi đối chiếu từng ý.}
\end{ex}

% III. TRẮC NGHIỆM TRẢ LỜI NGẮN
\begin{bt}
Tính $\log_2 32$.
\loigiai{\textbf{Câu trả lời:} 5

Vì $32=2^5$ nên $\log_2 32=5$.}
\end{bt}

\begin{bt}
Một hình lập phương có cạnh bằng $3$. Tính thể tích.
\loigiai{\textbf{Câu trả lời:} 27

Thể tích bằng $3^3=27$.}
\end{bt}`
    },
    tf: { title: 'Bài luyện Đúng/Sai', type: 'tf', duration: 30, source: SNIPPETS.tf + '\n\n' + SNIPPETS.tf.replace('Cho dữ kiện sau.', 'Cho một dữ kiện khác.') }
  };

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function stripLatex(value) {
    return String(value || '').replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
  }
  function toast(message, type) {
    var box = el('examToast');
    if (!box) return;
    box.textContent = message;
    box.className = 'exam-toast show ' + (type || '');
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.className = 'exam-toast'; }, 3600);
  }
  function renderMath(root) {
    if (!root || !window.renderMathInElement) return;
    window.renderMathInElement(root, { delimiters: [
      {left:'$$',right:'$$',display:true}, {left:'\\[',right:'\\]',display:true},
      {left:'$',right:'$',display:false}, {left:'\\(',right:'\\)',display:false}
    ], throwOnError:false });
  }
  function kindOf(q) {
    var c = q && q.choices || [];
    if (c.length === 4 && c[0].key === 'a') return 'tf';
    if (c.length === 1 && c[0].key === 'short') return 'short';
    return 'mc';
  }
  function typeLabel(type) { return TYPES[type] || 'Tùy chỉnh'; }
  function isoVietnam(localValue) {
    if (!localValue) return null;
    var m = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4]-7, +m[5])).toISOString() : null;
  }
  function toLocalInput(value) {
    if (!value) return '';
    var d = new Date(value);
    return new Date(d.getTime() + 7*3600000).toISOString().slice(0,16);
  }

  function switchTab(name) {
    document.querySelectorAll('.exam-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.exam-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    if (name === 'library') renderLibrary();
    if (name === 'analytics' && el('statClass').value) loadAnalyticsOptions();
  }

  function switchPreview(name) {
    document.querySelectorAll('.exam-preview-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.preview === name); });
    el('htmlPreview').style.display = name === 'html' ? 'block' : 'none';
    el('pdfPreview').classList.toggle('active', name === 'pdf');
  }

  function applyTemplate(key) {
    var template = TEMPLATES[key];
    if (!template) return;
    if (el('exLatex').value.trim() && !confirm('Thay nội dung đang soạn bằng mẫu này?')) return;
    state.templateKey = key;
    el('exTitle').value = template.title;
    el('exType').value = template.type;
    el('exDuration').value = template.duration;
    el('exLatex').value = template.source;
    updateExamType();
    renderPreview(true);
    toast('Đã chèn mẫu ' + template.title + '.', 'ok');
  }

  function insertSnippet(kind) {
    var area = el('exLatex');
    var text = SNIPPETS[kind];
    if (!area || !text) return;
    var start = area.selectionStart || area.value.length;
    var end = area.selectionEnd || start;
    var prefix = start && !/\n\s*$/.test(area.value.slice(0,start)) ? '\n\n' : '';
    area.value = area.value.slice(0,start) + prefix + text + area.value.slice(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + prefix.length + text.length;
    state.templateKey = 'custom';
    schedulePreview();
  }

  function formatSource() {
    var area = el('exLatex');
    var value = area.value.replace(/\r\n/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    value = value.replace(/\\end\{(ex|bt)\}\s*\\begin\{/g, '\\end{$1}\n\n\\begin{');
    area.value = value;
    schedulePreview();
    toast('Đã dọn khoảng trắng và phân tách các câu.', 'ok');
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(function () { renderPreview(false); }, 320);
  }

  function renderQuestion(q, number) {
    var kind = kindOf(q);
    var choices = q.choices || [];
    var body = '<article class="exam-question" data-kind="' + kind + '"><div class="exam-question-title"><span class="exam-question-no">Câu ' + number + '.</span><div>' + latexRaHTML(q.content_latex || '') + '</div></div>';
    if (kind === 'mc') {
      body += '<div class="exam-choice-grid">' + choices.map(function (c) { return '<div class="exam-choice' + (c.correct?' correct':'') + '"><b>' + esc(c.key) + '.</b> ' + latexRaHTML(c.latex || '') + '</div>'; }).join('') + '</div>';
    } else if (kind === 'tf') {
      body += '<div class="exam-tf-grid">' + choices.map(function (c) { return '<div class="exam-tf-row"><div><b>' + esc(String(c.key).toUpperCase()) + '.</b> ' + latexRaHTML(c.latex || '') + '</div><span class="exam-tf-answer">' + (c.correct?'ĐÚNG':'SAI') + '</span></div>'; }).join('') + '</div>';
    } else {
      body += '<span class="exam-short-answer">Đáp số: ' + latexRaHTML((choices[0] && choices[0].latex) || 'Chưa nhận diện') + '</span>';
    }
    if (q.solution_latex) body += '<div class="exam-solution"><b>Lời giải:</b> ' + latexRaHTML(q.solution_latex) + '</div>';
    return body + '</article>';
  }

  function renderPreview(force) {
    var source = el('exLatex').value.trim();
    var type = el('exType').value;
    var paper = '';
    state.parsed = source ? parseLatexQuestions(source) : [];
    var counts = {mc:0,tf:0,short:0};
    state.parsed.forEach(function (q) { counts[kindOf(q)]++; });
    el('questionBadge').textContent = state.parsed.length + ' câu';
    if (!source && type !== 'essay') {
      el('htmlPreview').innerHTML = '<div class="exam-empty"><div><strong>Chưa có nội dung</strong>Chọn một mẫu đề hoặc chèn câu hỏi.</div></div>';
      el('previewDot').className = 'exam-status-dot';
      el('previewStatus').textContent = 'Chưa có nội dung';
      updateSaveState();
      return;
    }
    paper += '<div class="exam-paper"><header class="exam-paper-title"><small>Xem trực tiếp trên VinhMath</small><h2>' + esc(el('exTitle').value || 'Đề thi chưa đặt tên') + '</h2></header>';
    if (type === 'essay') {
      paper += '<div class="exam-section-heading">Phần tự luận</div><div style="line-height:1.75">' + latexRaHTML(el('exEssayPrompt').value || 'Chưa nhập đề bài tự luận.') + '</div>';
    } else {
      var sections = [
        {kind:'mc', title:'Phần I. Trắc nghiệm khách quan 4 phương án'},
        {kind:'tf', title:'Phần II. Trắc nghiệm Đúng/Sai — 4 ý'},
        {kind:'short', title:'Phần III. Trắc nghiệm trả lời ngắn'}
      ];
      var no = 0;
      sections.forEach(function (section) {
        var qs = state.parsed.filter(function (q) { return kindOf(q) === section.kind; });
        if (!qs.length) return;
        paper += '<div class="exam-section-heading">' + section.title + '</div>';
        qs.forEach(function (q) { no++; paper += renderQuestion(q, no); });
      });
    }
    paper += '</div>';
    el('htmlPreview').innerHTML = paper;
    renderMath(el('htmlPreview'));
    var valid = type === 'essay' ? !!el('exEssayPrompt').value.trim() : state.parsed.length > 0;
    el('previewDot').className = 'exam-status-dot ' + (valid ? 'ok' : 'warn');
    el('previewStatus').textContent = valid ? (counts.mc + ' TN · ' + counts.tf + ' Đ/S · ' + counts.short + ' TLN') : 'Chưa nhận diện được câu hỏi';
    updateSaveState();
    if (force) switchPreview('html');
  }

  function updateExamType() {
    var type = el('exType').value;
    el('essayField').hidden = type !== 'essay' && type !== 'combo';
    el('sourcePane').style.display = type === 'essay' ? 'none' : 'flex';
    el('sourceHint').textContent = type === 'tf' ? 'Dùng \\choiceTF với đúng 4 ý' : type === 'thpt' ? 'Tự phân 3 phần theo loại câu hỏi' : 'Hỗ trợ \\choice, \\choiceTF, câu trả lời ngắn';
    renderPreview(false);
  }

  function updateSaveState() {
    var type = el('exType').value;
    var valid = !!el('exTitle').value.trim();
    if (type === 'essay') valid = valid && !!el('exEssayPrompt').value.trim();
    else valid = valid && state.parsed.length > 0;
    el('btnSave').disabled = !valid;
  }

  function examSourceFromQuestions(questions) {
    return (questions || []).map(function (q) {
      var kind = kindOf(q), body = '\\begin{' + (kind === 'short' ? 'bt' : 'ex') + '}\n' + (q.content_latex || '');
      if (kind === 'mc') body += '\n\\choice\n' + q.choices.map(function (c) { return '{' + (c.correct?'\\True ':'') + c.latex + '}'; }).join('\n');
      if (kind === 'tf') body += '\n\\choiceTF\n' + q.choices.map(function (c) { return '{' + (c.correct?'\\True ':'') + c.latex + '}'; }).join('\n');
      if (kind === 'short') body += '\n\\loigiai{\\textbf{Câu trả lời:} ' + ((q.choices[0] && q.choices[0].latex) || '') + '\n\n' + (q.solution_latex || '') + '}';
      else if (q.solution_latex) body += '\n\\loigiai{' + q.solution_latex + '}';
      return body + '\n\\end{' + (kind === 'short' ? 'bt' : 'ex') + '}';
    }).join('\n\n');
  }

  async function saveExam(event) {
    event.preventDefault();
    renderPreview(false);
    if (el('btnSave').disabled) { toast('Hãy nhập đủ tiêu đề và nội dung hợp lệ.', 'err'); return; }
    var button = el('btnSave');
    button.disabled = true; button.textContent = '⏳ Đang lưu…';
    var type = el('exType').value;
    var payload = {
      title: el('exTitle').value.trim(), class_id: el('exLop').value || null,
      duration_minutes: Math.max(1, parseInt(el('exDuration').value,10) || 90),
      opens_at: isoVietnam(el('exOpens').value), closes_at: isoVietnam(el('exCloses').value),
      shuffle: el('exShuffle').checked, published: el('exPublished').checked,
      de_type: type, essay_prompt: el('exEssayPrompt').value.trim() || null,
      latex_source: el('exLatex').value.trim() || null, template_key: state.templateKey || 'custom'
    };
    try {
      var examId = state.editingId, result;
      if (examId) {
        result = await sb.from('exams').update(payload).eq('id', examId);
        if (result.error) throw result.error;
        result = await sb.from('exam_questions').delete().eq('exam_id', examId);
        if (result.error) throw result.error;
      } else {
        result = await sb.from('exams').insert(payload).select('id').single();
        if (result.error) throw result.error;
        examId = result.data.id;
      }
      for (var i=0;i<state.parsed.length;i++) {
        var q = state.parsed[i];
        var rq = await sb.from('questions').insert({
          source_id:'EX-'+Date.now().toString(36).toUpperCase()+'-'+i,
          content_latex:q.content_latex, choices:q.choices, solution_latex:q.solution_latex||null, difficulty:'TH'
        }).select('id').single();
        if (rq.error) throw rq.error;
        var link = await sb.from('exam_questions').insert({exam_id:examId,question_id:rq.data.id,sort:i});
        if (link.error) throw link.error;
      }
      toast((state.editingId?'Đã cập nhật':'Đã tạo')+' đề thi thành công.', 'ok');
      await loadExams();
      resetForm();
      switchTab('library');
    } catch (error) {
      toast('Không lưu được đề: ' + (error.message || error), 'err');
    } finally {
      button.textContent = state.editingId ? '💾 Cập nhật đề thi' : '💾 Lưu đề thi';
      updateSaveState();
    }
  }

  async function editExam(id) {
    switchTab('compose');
    var exam = state.exams.find(function (x) { return x.id === id; });
    if (!exam) return;
    el('saveStatus').textContent = 'Đang tải đề…';
    try {
      var detail = await sb.from('exams').select('*').eq('id',id).single();
      if (detail.error) throw detail.error;
      var eq = await sb.from('exam_questions').select('sort,questions(id,content_latex,choices,solution_latex)').eq('exam_id',id).order('sort');
      if (eq.error) throw eq.error;
      var data = detail.data, questions = (eq.data||[]).map(function (x) { return x.questions; }).filter(Boolean);
      state.editingId = id; state.templateKey = data.template_key || 'custom';
      el('formTitle').textContent = '1. Chỉnh sửa đề thi'; el('editBadge').textContent = 'Đang chỉnh sửa';
      el('exTitle').value = data.title || ''; el('exLop').value = data.class_id || '';
      el('exDuration').value = data.duration_minutes || 90; el('exType').value = data.de_type || 'mc';
      el('exOpens').value = toLocalInput(data.opens_at); el('exCloses').value = toLocalInput(data.closes_at);
      el('exShuffle').checked = !!data.shuffle; el('exPublished').checked = !!data.published;
      el('exEssayPrompt').value = data.essay_prompt || '';
      el('exLatex').value = data.latex_source || examSourceFromQuestions(questions);
      el('btnCancelEdit').hidden = false; el('btnSave').textContent = '💾 Cập nhật đề thi';
      updateExamType(); renderPreview(true); el('saveStatus').textContent = 'Đang chỉnh sửa “'+data.title+'”.';
      window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) { toast('Không tải được đề: '+error.message,'err'); }
  }

  function resetForm() {
    state.editingId = null; state.templateKey = 'custom'; state.parsed = [];
    el('examForm').reset(); el('exDuration').value = 90; el('exShuffle').checked = true; el('exPublished').checked = true;
    el('exType').value = 'mc'; el('exLatex').value = ''; el('exEssayPrompt').value = '';
    el('formTitle').textContent = '1. Thiết lập đề thi'; el('editBadge').textContent = 'Đề mới';
    el('btnCancelEdit').hidden = true; el('btnSave').textContent = '💾 Lưu đề thi'; el('saveStatus').textContent = 'Đề chưa lưu.';
    updateExamType();
  }

  async function deleteExam(id) {
    var exam = state.exams.find(function (x) { return x.id === id; });
    if (!confirm('Xóa đề “'+(exam?exam.title:'đã chọn')+'”? Các lượt làm liên quan cũng có thể bị xóa.')) return;
    var result = await sb.from('exams').delete().eq('id',id);
    if (result.error) { toast('Không xóa được đề: '+result.error.message,'err'); return; }
    await loadExams(); renderLibrary(); toast('Đã xóa đề thi.','ok');
  }

  function renderLibrary() {
    var search = (el('librarySearch').value||'').trim().toLowerCase(), classId=el('libraryClass').value, type=el('libraryType').value, status=el('libraryState').value;
    var list = state.exams.filter(function (x) {
      return (!search || x.title.toLowerCase().includes(search)) && (!classId || x.class_id===classId) && (!type || x.de_type===type) && (!status || (status==='published'?x.published:!x.published));
    });
    if (!list.length) { el('examLibrary').innerHTML='<div class="exam-empty exam-card"><div><strong>Không tìm thấy đề phù hợp</strong>Thử thay đổi bộ lọc.</div></div>'; return; }
    el('examLibrary').innerHTML = list.map(function (x) {
      var count = x.exam_questions && x.exam_questions[0] ? x.exam_questions[0].count : 0;
      var className = x.classes && x.classes.name ? x.classes.name : 'Mọi lớp';
      return '<article class="exam-list-card"><div class="exam-list-top"><span class="exam-list-icon">'+(x.de_type==='thpt'?'🎓':x.de_type==='tf'?'✓':'📝')+'</span><div class="exam-list-main"><div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:5px"><span class="exam-badge '+(x.published?'live':'draft')+'">'+(x.published?'Đang mở':'Bản nháp')+'</span><span class="exam-badge">'+esc(typeLabel(x.de_type))+'</span></div><div class="exam-list-title">'+esc(x.title)+'</div><div class="exam-list-meta"><span>🏫 '+esc(className)+'</span><span>⏱ '+x.duration_minutes+' phút</span><span>📋 '+count+' câu</span></div></div></div><div class="exam-list-actions"><button class="btn btn-secondary btn-sm" onclick="VMExamAdmin.editExam(\''+x.id+'\')">Sửa đề</button><a class="btn btn-secondary btn-sm" href="luyen-de.html?exam_id='+x.id+'" target="_blank">Xem kiểu HS</a><button class="btn btn-secondary btn-sm" onclick="VMExamAdmin.openAnalytics(\''+(x.class_id||'')+'\',\''+x.id+'\')">Thống kê</button><button class="btn btn-ghost btn-sm" style="color:var(--err)" onclick="VMExamAdmin.deleteExam(\''+x.id+'\')">Xóa</button></div></article>';
    }).join('');
  }

  async function loadExams() {
    var result = await sb.from('exams').select('id,title,duration_minutes,opens_at,closes_at,published,class_id,de_type,template_key,classes(name),exam_questions(count)').order('created_at',{ascending:false});
    if (result.error) throw result.error;
    state.exams = result.data || [];
    if (state.profile.role !== 'admin') state.exams = state.exams.filter(function (x) { return x.class_id===null || state.classes.some(function (c) { return c.id===x.class_id; }); });
    var qCount = state.exams.reduce(function (sum,x) { return sum + (x.exam_questions&&x.exam_questions[0]?x.exam_questions[0].count:0); },0);
    el('kpiExams').textContent = state.exams.length; el('kpiQuestions').textContent = qCount;
    renderLibrary(); fillAnalyticsExamOptions();
  }

  function classOptions(includeAll) {
    return (includeAll?'<option value="">Tất cả lớp</option>':'<option value="">Chọn lớp</option>') + state.classes.map(function (c) { return '<option value="'+c.id+'">'+esc(c.name)+(c.is_specialized?' · Chuyên':'')+'</option>'; }).join('');
  }

  function fillAnalyticsExamOptions() {
    var classId = el('statClass').value;
    var list = state.exams.filter(function (x) { return classId && (x.class_id===classId || x.class_id===null); });
    el('statExam').innerHTML = '<option value="">Chọn đề</option>' + list.map(function (x) { return '<option value="'+x.id+'">'+esc(x.title)+'</option>'; }).join('');
  }

  async function loadAnalyticsOptions() {
    var classId = el('statClass').value;
    fillAnalyticsExamOptions();
    el('statStudent').innerHTML = '<option value="">Toàn bộ lớp</option>';
    if (!classId) return;
    var result = await sb.from('class_students').select('student_id,profiles!class_students_student_id_fkey(id,full_name,username)').eq('class_id',classId);
    if (result.error) { toast('Không tải được học sinh: '+result.error.message,'err'); return; }
    var students = (result.data||[]).map(function (x) { return x.profiles; }).filter(Boolean).sort(function (a,b) { return a.full_name.localeCompare(b.full_name,'vi'); });
    el('statStudent').innerHTML = '<option value="">Toàn bộ lớp</option>' + students.map(function (s) { return '<option value="'+s.id+'">'+esc(s.full_name)+' · '+esc(s.username)+'</option>'; }).join('');
    if (el('statExam').value) loadAnalytics();
  }

  function metric(label,value) { return '<div class="exam-stat-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>'; }
  function rateColor(rate) { return rate<50?'var(--exam-red)':rate<75?'var(--exam-accent)':'var(--exam-green)'; }
  function escapeTex(value) {
    return String(value || '').replace(/([%&#_$])/g, '\\$1').replace(/[{}]/g, '');
  }
  function renderAnalytics(data) {
    var selected = data.selected_exam || {}, summary=selected.summary||{}, questions=selected.questions||[], student=data.selected_student;
    var html='<div class="exam-stat-grid"><div class="exam-stat-main"><div class="exam-stat-summary">'+metric('Học sinh lớp',data.class_size||0)+metric('Đã làm',summary.student_count||0)+metric('Lượt nộp',summary.attempt_count||0)+metric('Điểm TB',summary.avg_score==null?'—':Number(summary.avg_score).toFixed(2))+metric('Điểm cao nhất',summary.max_score==null?'—':Number(summary.max_score).toFixed(2))+'</div>';
    html+='<section class="exam-stat-card"><h3><span>🎯 Câu học sinh đang yếu</span><small>'+questions.length+' câu</small></h3><div class="exam-stat-card-body exam-weak-list">';
    var sorted=questions.slice().sort(function(a,b){
      var aHas=Number(a.answered_n||0)>0,bHas=Number(b.answered_n||0)>0;
      if(aHas!==bHas)return aHas?-1:1;
      return Number(a.accuracy||0)-Number(b.accuracy||0);
    });
    if(!sorted.length) html+='<div class="exam-empty" style="min-height:180px">Chưa có lượt nộp để phân tích.</div>';
    sorted.forEach(function(q){var rate=Number(q.accuracy||0),answered=Number(q.answered_n||0),rateLabel=answered?rate.toFixed(0)+'%':'—';html+='<div class="exam-weak-row"><span class="exam-weak-no">'+(Number(q.sort)+1)+'</span><div class="exam-weak-text"><b>'+esc(q.kind==='tf'?'Đúng/Sai':q.kind==='short'?'Trả lời ngắn':'Trắc nghiệm')+'</b><div>'+esc(stripLatex(q.content_latex).slice(0,150)||'Câu hỏi')+'</div><div class="exam-progress" style="--rate:'+rateColor(rate)+'"><i style="width:'+(answered?Math.max(0,Math.min(100,rate)):0)+'%"></i></div></div><div class="exam-weak-rate">'+rateLabel+'<small>'+(answered?Number(q.correct_n||0)+' / '+answered+' đúng':'Chưa có lượt trả lời')+'</small></div></div>';if(q.statement_stats&&q.statement_stats.length){html+='<div class="exam-section-breakdown" style="margin:-4px 0 6px 46px">'+q.statement_stats.map(function(s){var sr=Number(s.accuracy||0),sn=Number(s.answered_n||0);return '<div class="exam-section-chip"><b>'+esc(String(s.key).toUpperCase())+' · '+(sn?sr.toFixed(0)+'%':'—')+'</b><small>'+(sn?Number(s.correct_n||0)+'/'+sn+' học sinh đúng':'Chưa có dữ liệu')+'</small></div>';}).join('')+'</div>';}});
    html+='</div></section></div><aside class="exam-stat-side">';
    html+='<section class="exam-stat-card"><h3>📈 Tiến triển cá nhân</h3><div class="exam-stat-card-body">';
    if(!student){html+='<div class="exam-empty" style="min-height:220px"><div><strong>Chọn một học sinh</strong>Xem điểm số và độ chính xác qua nhiều đề.</div></div>';}else{var s=student.summary||{},progress=student.progress||[];html+='<div style="margin-bottom:14px"><b style="font-size:1.05rem">'+esc(student.student&&student.student.full_name||'Học sinh')+'</b><div class="exam-list-meta"><span>Điểm TB '+(s.avg_score==null?'—':Number(s.avg_score).toFixed(2))+'</span><span>Cao nhất '+(s.best_score==null?'—':Number(s.best_score).toFixed(2))+'</span><span>Thay đổi '+(s.delta==null?'—':(Number(s.delta)>=0?'+':'')+Number(s.delta).toFixed(2))+'</span></div></div><div class="exam-student-progress">'+progress.map(function(p){return '<div class="exam-progress-row"><div><b>'+esc(p.title)+'</b><small>'+new Date(p.submitted_at).toLocaleDateString('vi-VN')+' · '+Number(p.correct_n||0)+'/'+Number(p.total_n||0)+' câu đúng</small></div><span class="exam-score">'+(p.score==null?'—':Number(p.score).toFixed(2))+'</span></div>';}).join('')+'</div>';if(!progress.length)html+='<div class="exam-empty" style="min-height:160px">Học sinh chưa nộp đề nào trong lớp này.</div>';}
    html+='</div></section><section class="exam-stat-card"><h3>🧭 Cách đọc báo cáo</h3><div class="exam-stat-card-body" style="font-size:.8rem;line-height:1.65;color:var(--ink-2)"><b>Dưới 50%</b>: cần ôn lại ngay.<br><b>50–74%</b>: chưa ổn định.<br><b>Từ 75%</b>: đang làm chủ tốt.<br><br>Với câu Đúng/Sai, hệ thống phân tích riêng từng ý a–d.</div></section></aside></div>';
    el('analyticsContent').innerHTML=html;
  }

  async function loadAnalytics() {
    var classId=el('statClass').value,examId=el('statExam').value,studentId=el('statStudent').value||null;
    if(!classId||!examId){el('analyticsContent').innerHTML='<div class="exam-empty exam-card"><div><strong>Chọn lớp và đề thi</strong>Hai bộ lọc này cần thiết để tính đúng dữ liệu.</div></div>';return;}
    el('analyticsContent').innerHTML='<div class="exam-empty exam-card"><div><div class="exam-spinner"></div><strong>Đang tổng hợp dữ liệu</strong>Phân tích từng câu và tiến triển học sinh…</div></div>';
    var result=await sb.rpc('gv_thong_ke_luyen_de',{p_class:classId,p_exam:examId,p_student:studentId});
    if(result.error){el('analyticsContent').innerHTML='<div class="exam-empty exam-card" style="color:var(--err)">'+esc(result.error.message)+'</div>';return;}
    if(result.data&&result.data.error){el('analyticsContent').innerHTML='<div class="exam-empty exam-card" style="color:var(--err)">Không có quyền xem báo cáo này ('+esc(result.data.error)+').</div>';return;}
    state.analytics=result.data;renderAnalytics(result.data||{});
  }

  function openAnalytics(classId,examId){switchTab('analytics');if(classId)el('statClass').value=classId;loadAnalyticsOptions().then(function(){el('statExam').value=examId;loadAnalytics();});}

  async function buildPdfSource() {
    var raw=el('exLatex').value.trim(), title=el('exTitle').value.trim()||'Đề thi VinhMath';
    if(el('exType').value==='essay') raw=el('exEssayPrompt').value.trim();
    if(!raw) throw new Error('Chưa có nội dung để biên dịch.');
    if(/\\documentclass(?:\[[^\]]*\])?\{/.test(raw)) return typeof vmChenPreambleMoiTruongTex==='function'?vmChenPreambleMoiTruongTex(raw):raw;
    var sty=await fetch('ex_test.sty').then(function(r){if(!r.ok)throw new Error('Không tải được ex_test.sty');return r.text();});
    var env=typeof vmPreambleMoiTruongTex==='function'?vmPreambleMoiTruongTex():'';
    return '\\begin{filecontents*}{ex_test.sty}\n'+sty+'\n\\end{filecontents*}\n'+
      '\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T5]{fontenc}\n\\usepackage[vietnamese]{babel}\n\\usepackage{amsmath,amssymb,mathtools}\n\\usepackage{geometry}\n\\geometry{top=1.6cm,bottom=1.6cm,left=1.8cm,right=1.8cm}\n\\usepackage{tikz}\n\\usepackage[most]{tcolorbox}\n\\usepackage{enumitem,multicol}\n\\usepackage[loigiai]{ex_test}\n'+env+'\n\\begin{document}\n\\begin{center}{\\Large\\bfseries '+escapeTex(title)+'}\\end{center}\n\\vspace{0.3cm}\n'+raw+'\n\\end{document}';
  }

  async function compilePdf() {
    var dialog=el('pdfDialog'),body=el('pdfDialogBody');
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
    body.innerHTML='<div class="exam-pdf-loading"><div><div class="exam-spinner"></div><strong>Đang biên dịch PDF…</strong><br><small>Hình TikZ có thể cần thêm vài giây.</small></div></div>';
    try{
      if(typeof vmTaiMoiTruongTex==='function')await vmTaiMoiTruongTex();
      var tex=await buildPdfSource();
      var result=await sb.functions.invoke('latex',{body:{tex:tex,engine:'pdflatex'}});
      if(result.error)throw new Error(result.error.message||'Edge Function lỗi');
      if(!(result.data instanceof Blob)||result.data.type.indexOf('pdf')<0){var log=typeof result.data==='string'?result.data:await result.data.text();throw new Error(log.split('\n').filter(function(x){return x.indexOf('!')===0||/error/i.test(x);}).slice(0,6).join(' ')||'Không nhận được PDF');}
      if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=URL.createObjectURL(result.data);
      body.innerHTML='<iframe title="Xem trước PDF" src="'+state.pdfUrl+'#view=FitH"></iframe>';el('pdfDownload').href=state.pdfUrl;el('pdfDownload').download=(el('exTitle').value.trim()||'de-thi-vinhmath').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.pdf';
      el('pdfPreview').innerHTML='<iframe title="PDF đề thi" src="'+state.pdfUrl+'#view=FitH"></iframe>';switchPreview('pdf');toast('PDF đã biên dịch thành công.','ok');
    }catch(error){body.innerHTML='<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tạo được PDF</strong>'+esc(error.message||error)+'</div></div>';toast('PDF chưa biên dịch được.','err');}
  }
  function closePdf(){var d=el('pdfDialog');if(d.close)d.close();else d.removeAttribute('open');}

  async function init() {
    if(!window.sb||!daKetNoi())return;
    var profile=await yeuCauDangNhap();if(!profile)return;
    if(['admin','teacher','assistant'].indexOf(profile.role)<0){location.href='luyen-de';return;}
    state.profile=profile;
    if(profile.role==='assistant'){
      var analyticsTab=document.querySelector('[data-tab="analytics"]');
      if(analyticsTab)analyticsTab.hidden=true;
    }
    if(typeof vmTaiMoiTruongTex==='function')vmTaiMoiTruongTex();
    var classes=await sb.from('classes').select('id,name,is_specialized,teacher_id,co_teacher_id').order('grade').order('name');
    if(classes.error)throw classes.error;
    state.classes=classes.data||[];
    if(profile.role!=='admin'){
      var assistants=await sb.from('class_assistants').select('class_id').eq('assistant_id',profile.id);
      var ids=(assistants.data||[]).map(function(x){return x.class_id;});
      state.classes=state.classes.filter(function(c){return c.teacher_id===profile.id||c.co_teacher_id===profile.id||ids.indexOf(c.id)>=0;});
    }
    el('exLop').innerHTML='<option value="">Mọi lớp</option>'+state.classes.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+(c.is_specialized?' · Chuyên':'')+'</option>';}).join('');
    el('libraryClass').innerHTML=classOptions(true);el('statClass').innerHTML=classOptions(false);el('kpiClasses').textContent=state.classes.length;
    await loadExams();
    var attempts=await sb.from('attempts').select('id',{count:'exact',head:true}).not('exam_id','is',null).not('submitted_at','is',null);
    el('kpiAttempts').textContent=attempts.count==null?'—':attempts.count;
    el('exLatex').addEventListener('input',function(){state.templateKey='custom';schedulePreview();});
    el('exTitle').addEventListener('input',schedulePreview);el('exEssayPrompt').addEventListener('input',schedulePreview);
    renderPreview(false);
  }

  window.VMExamAdmin={switchTab:switchTab,switchPreview:switchPreview,applyTemplate:applyTemplate,insertSnippet:insertSnippet,formatSource:formatSource,renderPreview:renderPreview,updateExamType:updateExamType,saveExam:saveExam,editExam:editExam,resetForm:resetForm,deleteExam:deleteExam,renderLibrary:renderLibrary,loadAnalyticsOptions:loadAnalyticsOptions,loadAnalytics:loadAnalytics,openAnalytics:openAnalytics,compilePdf:compilePdf,closePdf:closePdf,_templates:TEMPLATES,_kindOf:kindOf};
  document.addEventListener('DOMContentLoaded',function(){init().catch(function(error){toast('Không khởi tạo được khu đề thi: '+error.message,'err');});});
})();
