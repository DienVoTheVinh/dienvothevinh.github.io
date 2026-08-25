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
    pdfEngine: 'pdflatex',
    previewTimer: 0,
    pdfUrl: '',
    analytics: null,
    portal: null,
    portalMembership: null,
    bank: {
      documents: [],
      items: [],
      parseErrors: [],
      visibleLimit: 120,
      serverReady: null,
      statsLoaded: false,
      stats: { documents: null, items: null, active: null, quarantined: null },
      sourceCatalogLoaded: false,
      sourceCatalogLoading: false,
      sourceItems: [],
      searchItems: [],
      selectedSourceId: null,
      selectedSourceMode: 'assign',
      taxonomyCatalog: [],
      taxonomyCatalogLoaded: false,
      blueprintSeq: 1,
      access: { canUse: false, canAdmin: false },
      preview: { title: '', questions: [], showAnswers: false, showSolutions: false, editableSource: '', pdfUrl: '', mode: 'html', requestToken: 0 }
    }
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
    'worksheet-mixed': {
      title: 'Phiếu ôn tập Toán', type: 'combo', duration: 45,
      source: String.raw`% CÂU TRẮC NGHIỆM
\begin{ex}
Giá trị của $2^3$ bằng
\choice
{$4$}
{$6$}
{\True $8$}
{$9$}
\loigiai{$2^3=8$.}
\end{ex}

% CÂU TRẢ LỜI NGẮN
\begin{bt}
Tính $15+27$.
\loigiai{\textbf{Câu trả lời:} 42

$15+27=42$.}
\end{bt}`
    },
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
    'mc-quiz': {
      title: 'Bài kiểm tra trắc nghiệm', type: 'mc', duration: 45,
      source: String.raw`% CÂU 1
\begin{ex}
Nghiệm của phương trình $2x-6=0$ là
\choice
{$x=-3$}
{$x=-2$}
{\True $x=3$}
{$x=6$}
\loigiai{$2x-6=0\Leftrightarrow x=3$.}
\end{ex}

% CÂU 2
\begin{ex}
Đạo hàm của hàm số $y=x^3$ là
\choice
{$y'=x^2$}
{\True $y'=3x^2$}
{$y'=3x$}
{$y'=x^4$}
\loigiai{Áp dụng công thức $(x^n)'=nx^{n-1}$.}
\end{ex}`
    },
    tf: { title: 'Bài luyện Đúng/Sai', type: 'tf', duration: 30, source: SNIPPETS.tf + '\n\n' + SNIPPETS.tf.replace('Cho dữ kiện sau.', 'Cho một dữ kiện khác.') },
    essay: {
      title: 'Bài kiểm tra tự luận', type: 'essay', duration: 60, source: '',
      essayPrompt: String.raw`Bài 1. Trình bày đầy đủ lời giải của bài toán.

Bài 2. Giải thích rõ các bước biến đổi và kết luận.`
    }
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
    var explicit = q && (q.question_type || q.type);
    if (explicit === 'true_false' || explicit === 'tf') return 'tf';
    if (explicit === 'short_answer' || explicit === 'short') return 'short';
    if (explicit === 'multiple_choice' || explicit === 'mc') return 'mc';
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

  function portalSlug() {
    return (new URLSearchParams(location.search).get('portal') || '').trim().toLowerCase();
  }

  async function loadPortalManager(profile) {
    var slug = portalSlug();
    if (!slug) return null;
    var membership = await sb.from('exam_portal_members')
      .select('member_role,portal_only,portal:exam_portals!inner(id,slug,name,short_name,is_active)')
      .eq('user_id', profile.id).eq('portal.slug', slug).maybeSingle();
    var data = membership.data;
    if ((!data || !data.portal) && profile.role === 'admin') {
      var portal = await sb.from('exam_portals').select('id,slug,name,short_name,is_active').eq('slug', slug).maybeSingle();
      if (portal.data) data = {member_role:'owner',portal_only:false,portal:portal.data};
    }
    if (!data || !data.portal || !data.portal.is_active || ['owner','manager'].indexOf(data.member_role) < 0) return null;
    return data;
  }

  function switchTab(name) {
    if (name === 'bank' && !state.bank.access.canUse) return;
    document.querySelectorAll('.exam-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.exam-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    if (name === 'library') renderLibrary();
    if (name === 'analytics' && el('statClass').value) loadAnalyticsOptions();
    if (name === 'bank') {
      if (state.bank.access.canAdmin && !state.bank.statsLoaded) bankLoadStats(true);
      if (state.bank.access.canUse && !state.bank.sourceCatalogLoaded) bankLoadSourceCatalog();
    }
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
    el('exEssayPrompt').value = template.essayPrompt || '';
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

  function shortAnswerSheet(value) {
    var chars = String(value || '').trim().replace(/\./g, ',').replace(/\s+/g, '').replace(/[^0-9,\-]/g, '').slice(0, 4).split('');
    var boxes = '';
    for (var i = 0; i < 4; i++) boxes += '<span class="exam-short-cell">' + esc(chars[i] || '') + '</span>';
    return '<div class="exam-short-answer"><span>Phiếu trả lời:</span><span class="exam-short-cells">' + boxes + '</span></div>';
  }

  function renderQuestion(q, number, options) {
    options = options || {};
    var showAnswers = options.showAnswers !== false;
    var showSolutions = options.showSolutions !== false;
    var kind = kindOf(q);
    var choices = q.choices || [];
    var body = '<article class="exam-question" data-kind="' + kind + '"><div class="exam-question-title"><span class="exam-question-no">Câu ' + number + '.</span><div>' + latexRaHTML(q.content_latex || '') + '</div></div>';
    if (kind === 'mc') {
      body += '<div class="exam-choice-grid">' + choices.map(function (c) { return '<div class="exam-choice' + (showAnswers && c.correct?' correct':'') + '"><b>' + esc(c.key) + '.</b> ' + latexRaHTML(c.latex || '') + '</div>'; }).join('') + '</div>';
    } else if (kind === 'tf') {
      body += '<div class="exam-tf-grid">' + choices.map(function (c) { return '<div class="exam-tf-row"><div><b>' + esc(String(c.key).toLowerCase()) + ')</b> ' + latexRaHTML(c.latex || '') + '</div>' + (showAnswers?'<span class="exam-tf-answer">' + (c.correct?'ĐÚNG':'SAI') + '</span>':'') + '</div>'; }).join('') + '</div>';
    } else {
      body += shortAnswerSheet(showAnswers ? ((choices[0] && choices[0].latex) || '') : '');
    }
    if (showSolutions && q.solution_latex) body += '<div class="exam-solution"><b>Lời giải:</b> ' + latexRaHTML(q.solution_latex) + '</div>';
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
    paper += '<div class="exam-paper"><header class="exam-paper-title"><h2>' + esc(el('exTitle').value || 'Nội dung chưa đặt tên') + '</h2></header>';
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
    el('essayField').hidden = type !== 'essay';
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

  function examSourceFromQuestions(questions, options) {
    options = options || {};
    var showAnswers = options.showAnswers !== false;
    var showSolutions = options.showSolutions !== false;
    return (questions || []).map(function (q) {
      var kind = kindOf(q), body = '\\begin{' + (kind === 'short' ? 'bt' : 'ex') + '}\n' + (q.content_latex || '');
      if (kind === 'mc') body += '\n\\choice\n' + q.choices.map(function (c) { return '{' + (showAnswers && c.correct?'\\True ':'') + c.latex + '}'; }).join('\n');
      if (kind === 'tf') body += '\n\\choiceTF\n' + q.choices.map(function (c) { return '{' + (showAnswers && c.correct?'\\True ':'') + c.latex + '}'; }).join('\n');
      if (kind === 'short' && (showAnswers || (showSolutions && q.solution_latex))) body += '\n\\loigiai{\\textbf{Câu trả lời:} ' + (showAnswers ? ((q.choices[0] && q.choices[0].latex) || '') : '') + (showSolutions && q.solution_latex ? '\n\n' + q.solution_latex : '') + '}';
      else if (kind !== 'short' && showSolutions && q.solution_latex) body += '\n\\loigiai{' + q.solution_latex + '}';
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
      allow_solution_pdf: !!el('exAllowSolutionPdf').checked,
      de_type: type, essay_prompt: el('exEssayPrompt').value.trim() || null,
      latex_source: el('exLatex').value.trim() || null, template_key: state.templateKey || 'custom',
      portal_id: state.portal ? state.portal.id : null
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
          content_latex:q.content_latex, choices:q.choices, solution_latex:q.solution_latex||null, difficulty:'TH',
          portal_id: state.portal ? state.portal.id : null
        }).select('id').single();
        if (rq.error) throw rq.error;
        var link = await sb.from('exam_questions').insert({exam_id:examId,question_id:rq.data.id,sort:i});
        if (link.error) throw link.error;
      }
      if (state.portal) {
        var assignment = await sb.from('exam_portal_exams').upsert({
          portal_id:state.portal.id, exam_id:examId, class_id:payload.class_id,
          published:payload.published, show_result:true,
          available_from:payload.opens_at, available_until:payload.closes_at
        }, {onConflict:'portal_id,exam_id'});
        if (assignment.error) throw assignment.error;
      }
      toast((state.editingId?'Đã cập nhật':'Đã tạo')+' nội dung thành công.', 'ok');
      await loadExams();
      resetForm();
      switchTab('library');
    } catch (error) {
      toast('Không lưu được nội dung: ' + (error.message || error), 'err');
    } finally {
      button.textContent = state.editingId ? '💾 Cập nhật nội dung' : '💾 Lưu nội dung';
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
      el('formTitle').textContent = '3. Chỉnh sửa nội dung'; el('editBadge').textContent = 'Đang sửa';
      el('exTitle').value = data.title || ''; el('exLop').value = data.class_id || '';
      el('exDuration').value = data.duration_minutes || 90; el('exType').value = data.de_type || 'mc';
      el('exOpens').value = toLocalInput(data.opens_at); el('exCloses').value = toLocalInput(data.closes_at);
      el('exShuffle').checked = !!data.shuffle; el('exPublished').checked = !!data.published;
      el('exAllowSolutionPdf').checked = !!data.allow_solution_pdf;
      el('exEssayPrompt').value = data.essay_prompt || '';
      el('exLatex').value = data.latex_source || examSourceFromQuestions(questions);
      el('btnCancelEdit').hidden = false; el('btnSave').textContent = '💾 Cập nhật nội dung';
      updateExamType(); renderPreview(true); el('saveStatus').textContent = 'Đang chỉnh sửa “'+data.title+'”.';
      window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) { toast('Không tải được nội dung: '+error.message,'err'); }
  }

  function resetForm() {
    state.editingId = null; state.templateKey = 'custom'; state.parsed = [];
    el('examForm').reset(); el('exDuration').value = 90; el('exShuffle').checked = true; el('exPublished').checked = true; el('exAllowSolutionPdf').checked = false;
    el('exType').value = 'mc'; el('exLatex').value = ''; el('exEssayPrompt').value = '';
    el('formTitle').textContent = '3. Thiết lập xuất bản'; el('editBadge').textContent = 'Mới';
    el('btnCancelEdit').hidden = true; el('btnSave').textContent = '💾 Lưu nội dung'; el('saveStatus').textContent = 'Nội dung chưa lưu.';
    updateExamType(); switchPreview('html'); renderPreview(false);
    document.documentElement.style.removeProperty('overflow'); document.body.style.removeProperty('overflow');
    window.scrollTo({top:document.getElementById('panel-compose').offsetTop || 0,behavior:'smooth'});
  }

  async function deleteExam(id) {
    var exam = state.exams.find(function (x) { return x.id === id; });
    if (!confirm('Xóa đề “'+(exam?exam.title:'đã chọn')+'”? Các lượt làm liên quan cũng có thể bị xóa.')) return;
    var result = await sb.from('exams').delete().eq('id',id);
    if (result.error) { toast('Không xóa được đề: '+result.error.message,'err'); return; }
    await loadExams(); renderLibrary(); toast('Đã xóa đề thi.','ok');
  }

  async function toggleSolutionPdf(id) {
    var exam = state.exams.find(function (x) { return x.id === id; });
    if (!exam) { toast('Không tìm thấy đề cần cập nhật.','err'); return; }
    var next = !exam.allow_solution_pdf;
    var button = document.querySelector('[data-solution-toggle="'+id+'"]');
    if (button) button.disabled = true;
    var result = await sb.from('exams')
      .update({ allow_solution_pdf: next })
      .eq('id', id)
      .select('id,allow_solution_pdf')
      .single();
    if (result.error) {
      if (button) button.disabled = false;
      toast('Không đổi được quyền tải PDF đáp án: '+result.error.message,'err');
      return;
    }
    exam.allow_solution_pdf = !!result.data.allow_solution_pdf;
    renderLibrary();
    toast(exam.allow_solution_pdf ? 'Đã mở PDF đáp án cho học sinh sau khi nộp lần đầu.' : 'Đã khóa PDF đáp án của đề này.','ok');
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
      var solutionLabel = x.allow_solution_pdf ? '🔓 HS được tải đáp án' : '🔒 Khóa PDF đáp án';
      var portalQuery = state.portal ? 'portal='+encodeURIComponent(state.portal.slug)+'&' : '';
      var analyticsAction = state.portal ? '' : '<button class="btn btn-secondary btn-sm" onclick="VMExamAdmin.openAnalytics(\''+(x.class_id||'')+'\',\''+x.id+'\')">Thống kê</button>';
      var protectedExam = !!(x.bank_generated || x.source_bank_document_id);
      var primaryAction = protectedExam
        ? '<button class="btn btn-primary btn-sm" onclick="VMExamAdmin.bankOpenExamPreview(\''+x.id+'\')">Xem HTML / PDF</button>'
        : '<button class="btn btn-secondary btn-sm" onclick="VMExamAdmin.editExam(\''+x.id+'\')">Sửa</button>';
      return '<article class="exam-list-card"><div class="exam-list-top"><span class="exam-list-icon">'+(x.de_type==='thpt'?'🎓':x.de_type==='tf'?'✓':'📝')+'</span><div class="exam-list-main"><div class="exam-list-badges"><span class="exam-badge '+(x.published?'live':'draft')+'">'+(x.published?'Đang mở':'Bản nháp')+'</span><span class="exam-badge">'+esc(typeLabel(x.de_type))+'</span>'+(protectedExam?'<span class="exam-badge">Ngân hàng đề</span>':'')+'<button type="button" class="exam-solution-toggle '+(x.allow_solution_pdf?'on':'off')+'" data-solution-toggle="'+x.id+'" aria-pressed="'+(x.allow_solution_pdf?'true':'false')+'" title="Bật hoặc khóa quyền tải bản có đáp án" onclick="VMExamAdmin.toggleSolutionPdf(\''+x.id+'\')">'+solutionLabel+'</button></div><div class="exam-list-title">'+esc(x.title)+'</div><div class="exam-list-meta"><span>🏫 '+esc(className)+'</span><span>⏱ '+x.duration_minutes+' phút</span><span>📋 '+count+' câu</span></div></div></div><div class="exam-list-actions">'+primaryAction+'<a class="btn btn-secondary btn-sm" href="luyen-de.html?'+portalQuery+'exam_id='+x.id+'" target="_blank">Xem kiểu HS</a>'+analyticsAction+'<button class="btn btn-ghost btn-sm" style="color:var(--err)" onclick="VMExamAdmin.deleteExam(\''+x.id+'\')">Xóa</button></div></article>';
    }).join('');
  }

  async function loadExams() {
    var query = sb.from('exams').select('id,title,duration_minutes,opens_at,closes_at,published,allow_solution_pdf,class_id,de_type,template_key,portal_id,bank_generated,source_bank_document_id,classes(name),exam_questions(count)');
    query = state.portal ? query.eq('portal_id',state.portal.id) : query.is('portal_id',null);
    var result = await query.order('created_at',{ascending:false});
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
    var bankOverlay=await sb.rpc('vm_bank_staff_exam_analytics',{p_class_id:classId,p_exam_id:examId});
    if(bankOverlay.error){el('analyticsContent').innerHTML='<div class="exam-empty exam-card" style="color:var(--err)">Không tải được nội dung phân tích an toàn ('+esc(bankOverlay.error.message)+').</div>';return;}
    if(bankOverlay.data&&bankOverlay.data.protected_bank&&result.data&&result.data.selected_exam){
      result.data.selected_exam.questions=bankOverlay.data.questions||[];
    }
    state.analytics=result.data;renderAnalytics(result.data||{});
  }

  function openAnalytics(classId,examId){switchTab('analytics');if(classId)el('statClass').value=classId;loadAnalyticsOptions().then(function(){el('statExam').value=examId;loadAnalytics();});}

  function normalizeSolutionParagraphs(raw) {
    var text=String(raw||'').replace(/\r\n?/g,'\n'), token='\\loigiai', from=0;
    while(from<text.length){
      var at=text.indexOf(token,from);
      if(at===-1)break;
      var open=at+token.length;
      while(/\s/.test(text.charAt(open)))open++;
      if(text.charAt(open)!=='{'){from=open;continue;}
      var depth=1,i=open+1;
      while(i<text.length&&depth>0){
        if(text.charAt(i)==='{'&&text.charAt(i-1)!=='\\')depth++;
        else if(text.charAt(i)==='}'&&text.charAt(i-1)!=='\\')depth--;
        i++;
      }
      if(depth!==0)break;
      var body=text.slice(open+1,i-1).replace(/\n[ \t]*\n+/g,'\n\\par\n');
      text=text.slice(0,open+1)+body+text.slice(i-1);
      from=open+1+body.length+1;
    }
    return text;
  }

  async function buildPdfSource(rawOverride, titleOverride, typeOverride) {
    var hasOverride=arguments.length>0;
    var raw=hasOverride?String(rawOverride||'').trim():el('exLatex').value.trim();
    var title=hasOverride?(String(titleOverride||'').trim()||'Tài liệu VinhMath'):(el('exTitle').value.trim()||'Tài liệu VinhMath');
    var type=hasOverride?(typeOverride||'thpt'):el('exType').value;
    if(!hasOverride&&type==='essay') raw=el('exEssayPrompt').value.trim();
    if(!raw) throw new Error('Chưa có nội dung để biên dịch.');
    if(/\\documentclass(?:\[[^\]]*\])?\{/.test(raw)) return typeof vmChenPreambleMoiTruongTex==='function'?vmChenPreambleMoiTruongTex(raw):raw;
    // The bundled ex_test version has neither `bt` nor `choiceTF`. Keep the
    // authoring syntax intact for HTML, but normalize it for PDF compilation.
    raw=raw.replace(/\\begin\{bt\}/g,'\\begin{ex}').replace(/\\end\{bt\}/g,'\\end{ex}');
    raw=raw.replace(/\\begin\{itemchoice\}\s*(?:\[[^\]]*\])?/g,'\\begin{enumerate}[label=\\alph*)]')
      .replace(/\\end\{itemchoice\}/g,'\\end{enumerate}')
      .replace(/\\itemch\b/g,'\\item');
    // ex_test 2.4.5 defines \loigiai with a non-paragraph-safe argument. A
    // blank line inside a solution therefore aborts pdflatex. Chi chuyen dong
    // trang ben trong \loigiai: chen \par toan cuc se pha cases/aligned/tabular.
    raw=normalizeSolutionParagraphs(raw);
    var sty=await fetch('ex_test.sty').then(function(r){if(!r.ok)throw new Error('Không tải được ex_test.sty');return r.text();});
    var env=typeof vmPreambleMoiTruongTex==='function'?vmPreambleMoiTruongTex():'';
    var optionalPackages='';
    if(/\\tkzTab(?:Init|Line|Var|Val|Ima|Slope|Setup)\b/.test(raw)) optionalPackages+='\\usepackage{tkz-tab}\n';
    if(/\\begin\{forest\}/.test(raw)) optionalPackages+='\\usepackage{forest}\n';
    if(/\\begin\{circuitikz\}/.test(raw)) optionalPackages+='\\usepackage{circuitikz}\n';
    if(/\\includegraphics\b/.test(raw)) optionalPackages+='\\usepackage{graphicx}\n';
    if(/\\begin\{longtable\}/.test(raw)) optionalPackages+='\\usepackage{longtable}\n';
    if(/\\begin\{tabularx\}/.test(raw)) optionalPackages+='\\usepackage{tabularx}\n';
    return '\\begin{filecontents*}{ex_test.sty}\n'+sty+'\n\\end{filecontents*}\n'+
      '\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T5]{fontenc}\n\\usepackage[vietnamese]{babel}\n\\usepackage{amsmath,amssymb,mathtools}\n\\usepackage{geometry}\n\\geometry{top=1.6cm,bottom=1.6cm,left=1.8cm,right=1.8cm}\n\\usepackage{tikz}\n\\usetikzlibrary{calc,intersections,angles,quotes,arrows,arrows.meta,patterns,positioning,shapes.geometric,decorations.pathmorphing,decorations.pathreplacing,decorations.markings,backgrounds,fit,matrix}\n\\usepackage[most]{tcolorbox}\n\\usepackage{enumitem,multicol}\n'+optionalPackages+'\\usepackage[loigiai]{ex_test}\n'+
      '\\providecommand{\\vmTFItem}[2]{\\par\\noindent\\hangindent=1.9em\\hangafter=1\\textbf{#1)}\\ #2\\par}\n'+
      '\\providecommand{\\choiceTF}[5][]{}\n'+
      '\\renewcommand{\\choiceTF}[5][]{\\begingroup\\let\\True\\relax\\vmTFItem{a}{#2}\\vmTFItem{b}{#3}\\vmTFItem{c}{#4}\\vmTFItem{d}{#5}\\endgroup}\n'+
      env+'\n\\begin{document}\n\\begin{center}{\\Large\\bfseries '+escapeTex(title)+'}\\end{center}\n\\vspace{0.3cm}\n'+raw+'\n\\end{document}';
  }

  async function compilePdf() {
    var dialog=el('pdfDialog'),body=el('pdfDialogBody');
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
    body.innerHTML='<div class="exam-pdf-loading"><div><div class="exam-spinner"></div><strong>Đang biên dịch PDF…</strong><br><small>Hình TikZ có thể cần thêm vài giây.</small></div></div>';
    try{
      if(typeof vmTaiMoiTruongTex==='function')await vmTaiMoiTruongTex();
      var tex=await buildPdfSource();
      var result=await sb.functions.invoke('latex',{body:{tex:tex,engine:state.pdfEngine||'pdflatex'}});
      if(result.error)throw new Error(result.error.message||'Edge Function lỗi');
      if(!(result.data instanceof Blob)||result.data.type.indexOf('pdf')<0){var log=typeof result.data==='string'?result.data:await result.data.text();throw new Error(log.split('\n').filter(function(x){return x.indexOf('!')===0||/error/i.test(x);}).slice(0,6).join(' ')||'Không nhận được PDF');}
      if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=URL.createObjectURL(result.data);
      body.innerHTML='<iframe title="Xem trước PDF" src="'+state.pdfUrl+'#view=FitH"></iframe>';el('pdfDownload').href=state.pdfUrl;el('pdfDownload').download=(el('exTitle').value.trim()||'de-thi-vinhmath').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.pdf';
      el('pdfPreview').innerHTML='<iframe title="PDF VinhMath" src="'+state.pdfUrl+'#view=FitH"></iframe>';switchPreview('pdf');toast('PDF đã biên dịch thành công.','ok');
    }catch(error){body.innerHTML='<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tạo được PDF</strong>'+esc(error.message||error)+'</div></div>';toast('PDF chưa biên dịch được.','err');}
  }
  function closePdf(){var d=el('pdfDialog');if(d.close)d.close();else d.removeAttribute('open');}

  function bankPreviewSlug(value) {
    return String(value || 'ngan-hang-de-vinhmath').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'ngan-hang-de-vinhmath';
  }

  function bankNormalizePreviewQuestion(input, options) {
    options = options || {};
    var item = input && (input.questions || input.question) || input || {};
    var type = item.question_type || item.type || '';
    var kind = type === 'true_false' || type === 'tf' ? 'tf' : type === 'short_answer' || type === 'short' ? 'short' : 'mc';
    var sourceChoices = Array.isArray(item.choices) ? item.choices : [];
    var choices = sourceChoices.map(function (choice, index) {
      var defaultKey = kind === 'tf' ? String.fromCharCode(97 + index) : String.fromCharCode(65 + index);
      var normalizedChoice = {
        key: String(choice && (choice.key || choice.label) || defaultKey),
        latex: String(choice && (choice.latex != null ? choice.latex : choice.tex) || '')
      };
      if (options.showAnswers) normalizedChoice.correct = !!(choice && (choice.correct === true || choice.is_correct === true));
      return normalizedChoice;
    });
    if (kind === 'short') {
      var shortValue = options.showAnswers ? String(item.short_answer || (choices[0] && choices[0].latex) || '') : '';
      choices = [{key:'short',latex:shortValue,correct:false}];
    }
    var normalizedQuestion = {
      question_type: kind === 'tf' ? 'true_false' : kind === 'short' ? 'short_answer' : 'multiple_choice',
      content_latex: String(item.content_latex != null ? item.content_latex : item.content_tex || ''),
      choices: choices
    };
    if (options.showSolutions) normalizedQuestion.solution_latex = String(item.solution_latex != null ? item.solution_latex : item.solution_tex || '');
    return normalizedQuestion;
  }

  function bankPreviewPaper(title, questions, options) {
    options = options || {};
    var sections = [
      {kind:'mc',title:'Phần I. Trắc nghiệm khách quan 4 phương án'},
      {kind:'tf',title:'Phần II. Trắc nghiệm Đúng/Sai — 4 ý'},
      {kind:'short',title:'Phần III. Trắc nghiệm trả lời ngắn'}
    ];
    var paper = '<div class="exam-paper"><header class="exam-paper-title"><h2>'+esc(title || 'Nội dung ngân hàng đề')+'</h2></header>';
    var number = 0;
    sections.forEach(function (section) {
      var rows = questions.filter(function (question) { return kindOf(question) === section.kind; });
      if (!rows.length) return;
      if (questions.length > 1) paper += '<div class="exam-section-heading">'+section.title+'</div>';
      rows.forEach(function (question) {
        number += 1;
        paper += renderQuestion(question, number, {showAnswers:options.showAnswers,showSolutions:options.showSolutions});
      });
    });
    return paper + '</div>';
  }

  function bankResetPreviewPdf() {
    var preview = state.bank.preview;
    if (preview.pdfUrl) URL.revokeObjectURL(preview.pdfUrl);
    preview.pdfUrl = '';
    var pane = el('bankPreviewPdf'), download = el('bankPreviewDownload'), button = el('bankPreviewCompileButton');
    if (pane) pane.innerHTML = '<div class="bank-preview-empty"><span aria-hidden="true">📄</span><strong>PDF chưa được biên dịch</strong><small>Bấm “Biên dịch PDF” để kiểm tra bản in.</small></div>';
    if (download) { download.hidden = true; download.removeAttribute('href'); }
    if (button) { button.disabled = false; button.textContent = '▶ Biên dịch PDF'; }
  }

  function bankShowPreviewDialog() {
    var dialog = el('bankPreviewDialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open','');
  }

  function bankSwitchPreview(mode) {
    mode = mode === 'pdf' ? 'pdf' : 'html';
    state.bank.preview.mode = mode;
    document.querySelectorAll('[data-bank-preview-tab]').forEach(function (button) {
      var active = button.dataset.bankPreviewTab === mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    document.querySelectorAll('[data-bank-preview-pane]').forEach(function (pane) {
      var active = pane.dataset.bankPreviewPane === mode;
      pane.hidden = !active;
      pane.classList.toggle('active',active);
    });
  }

  function bankOpenPreview(title, rawQuestions, options) {
    options = options || {};
    var questions = (rawQuestions || []).map(function (question) {
      return bankNormalizePreviewQuestion(question,options);
    }).filter(function (question) { return !!question.content_latex.trim(); });
    if (!questions.length) throw new Error('Nội dung này chưa có câu hợp lệ để xem trước.');
    state.bank.preview.title = String(title || 'Nội dung ngân hàng đề');
    state.bank.preview.questions = questions;
    state.bank.preview.showAnswers = !!options.showAnswers;
    state.bank.preview.showSolutions = !!options.showSolutions;
    state.bank.preview.editableSource = String(options.editableSource || '');
    state.bank.preview.requestToken += 1;
    bankResetPreviewPdf();
    el('bankPreviewTitle').textContent = state.bank.preview.title;
    el('bankPreviewHtml').innerHTML = bankPreviewPaper(state.bank.preview.title,questions,options);
    renderMath(el('bankPreviewHtml'));
    el('bankPreviewStatus').textContent = 'HTML tức thời · '+questions.length+' câu';
    if (el('bankPreviewToEditor')) el('bankPreviewToEditor').hidden = !state.bank.preview.editableSource;
    bankSwitchPreview('html');
    bankShowPreviewDialog();
  }

  function bankOpenPreviewLoading(title) {
    state.bank.preview.requestToken += 1;
    state.bank.preview.title = String(title || 'Đang tải nội dung');
    state.bank.preview.questions = [];
    state.bank.preview.showAnswers = false;
    state.bank.preview.showSolutions = false;
    state.bank.preview.editableSource = '';
    bankResetPreviewPdf();
    el('bankPreviewTitle').textContent = state.bank.preview.title;
    el('bankPreviewHtml').innerHTML = '<div class="bank-preview-empty"><div class="exam-spinner"></div><strong>Đang tải bản xem trước an toàn…</strong></div>';
    el('bankPreviewStatus').textContent = 'Đang tải nội dung…';
    if (el('bankPreviewToEditor')) el('bankPreviewToEditor').hidden = true;
    bankSwitchPreview('html');
    bankShowPreviewDialog();
    return state.bank.preview.requestToken;
  }

  function bankPreviewPayload(data) {
    var payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
    var rows = Array.isArray(payload.questions) ? payload.questions.slice() : [];
    rows.sort(function (a,b) { return Number(a && a.sort || 0)-Number(b && b.sort || 0); });
    return {title:payload.title || payload.exam_title || (payload.exam && payload.exam.title) || '',questions:rows};
  }

  async function bankLoadRemotePreview(rpcName, args, fallbackTitle) {
    if (!state.bank.access.canUse) return;
    var requestToken = bankOpenPreviewLoading(fallbackTitle);
    try {
      var response = await sb.rpc(rpcName,args);
      if (requestToken !== state.bank.preview.requestToken) return;
      if (response.error) throw response.error;
      var payload = bankPreviewPayload(response.data);
      bankOpenPreview(payload.title || fallbackTitle,payload.questions,{showAnswers:false,showSolutions:false});
      bankSetServerState(true);
    } catch (error) {
      if (requestToken !== state.bank.preview.requestToken) return;
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      el('bankPreviewHtml').innerHTML = '<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tải được bản xem trước</strong>'+esc(bankSafeError(error))+'</div></div>';
      el('bankPreviewStatus').textContent = 'Không tải được nội dung';
      toast('Chưa tải được bản xem trước.','err');
    }
  }

  function bankOpenLocalPreview(index) {
    if (!state.bank.access.canAdmin || !state.bank.items[index]) return;
    var question = state.bank.items[index];
    var source = state.bank.documents[question._bankDocumentIndex] || {};
    try {
      bankOpenPreview((source.fileName || source.path || 'Tệp TeX')+' · Câu '+(Number(question.source_index||index)+1),[question],{showAnswers:true,showSolutions:true,editableSource:question.canonical_tex||question.raw_tex||''});
    } catch (error) { toast(error.message||String(error),'err'); }
  }

  function bankOpenSearchPreview(index) {
    if (!state.bank.access.canUse || !state.bank.searchItems[index]) return;
    try { bankOpenPreview('Câu tìm thấy trong ngân hàng',[state.bank.searchItems[index]],{showAnswers:false,showSolutions:false}); }
    catch (error) { toast(error.message||String(error),'err'); }
  }

  function bankOpenSourcePreview(documentId) {
    var item = state.bank.sourceItems.find(function (entry) { return String(entry.id) === String(documentId); });
    return bankLoadRemotePreview('vm_bank_source_exam_preview',{p_document_id:documentId},item && item.title || 'Đề nguồn');
  }

  function bankOpenExamPreview(examId, title) {
    if (!examId) return;
    var exam = state.exams.find(function (entry) { return String(entry.id) === String(examId); });
    return bankLoadRemotePreview('vm_bank_exam_preview',{p_exam_id:examId},title || (exam && exam.title) || 'Đề đã tạo');
  }

  async function bankCompilePreviewPdf() {
    var preview = state.bank.preview;
    if (!preview.questions.length) { toast('Chưa có nội dung để biên dịch.','err'); return; }
    var requestToken = preview.requestToken;
    var button = el('bankPreviewCompileButton'), pane = el('bankPreviewPdf');
    button.disabled = true; button.textContent = '⏳ Đang biên dịch…';
    pane.innerHTML = '<div class="bank-preview-empty"><div class="exam-spinner"></div><strong>Đang biên dịch PDF…</strong><small>Hình TikZ đã từng dùng sẽ lấy từ bộ nhớ đệm.</small></div>';
    el('bankPreviewStatus').textContent = 'Đang biên dịch PDF…';
    bankSwitchPreview('pdf');
    try {
      if (typeof vmTaiMoiTruongTex === 'function') await vmTaiMoiTruongTex();
      var raw = examSourceFromQuestions(preview.questions,{showAnswers:preview.showAnswers,showSolutions:preview.showSolutions});
      var tex = await buildPdfSource(raw,preview.title,'thpt');
      var result = await sb.functions.invoke('latex',{body:{tex:tex,engine:state.pdfEngine||'pdflatex'}});
      if (requestToken !== preview.requestToken) return;
      if (result.error) throw new Error(result.error.message||'Edge Function lỗi');
      if (!(result.data instanceof Blob) || result.data.type.indexOf('pdf') < 0) {
        var log = typeof result.data === 'string' ? result.data : await result.data.text();
        throw new Error(log.split('\n').filter(function (line) { return line.indexOf('!')===0 || /error/i.test(line); }).slice(0,6).join(' ') || 'Không nhận được PDF');
      }
      if (preview.pdfUrl) URL.revokeObjectURL(preview.pdfUrl);
      preview.pdfUrl = URL.createObjectURL(result.data);
      pane.innerHTML = '<iframe title="PDF ngân hàng đề" src="'+preview.pdfUrl+'#view=FitH"></iframe>';
      var download = el('bankPreviewDownload');
      download.href = preview.pdfUrl; download.download = bankPreviewSlug(preview.title)+'.pdf'; download.hidden = false;
      button.textContent = '↻ Biên dịch lại PDF';
      el('bankPreviewStatus').textContent = 'PDF đã biên dịch · sẵn sàng tải xuống';
      toast('PDF ngân hàng đề đã sẵn sàng.','ok');
    } catch (error) {
      if (requestToken !== preview.requestToken) return;
      pane.innerHTML = '<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tạo được PDF</strong>'+esc(error.message||error)+'</div></div>';
      button.textContent = '↻ Thử biên dịch lại';
      el('bankPreviewStatus').textContent = 'Biên dịch PDF chưa thành công';
      toast('PDF chưa biên dịch được.','err');
    } finally { if (requestToken === preview.requestToken) button.disabled = false; }
  }

  function bankClosePreview() {
    state.bank.preview.requestToken += 1;
    state.bank.preview.editableSource = '';
    if (el('bankPreviewToEditor')) el('bankPreviewToEditor').hidden = true;
    var dialog = el('bankPreviewDialog');
    if (dialog) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
    bankResetPreviewPdf();
  }

  function bankSetupPreviewDialog() {
    var dialog = el('bankPreviewDialog');
    if (!dialog || dialog._bankBound) return;
    dialog._bankBound = true;
    dialog.addEventListener('click',function (event) { if (event.target === dialog) bankClosePreview(); });
    dialog.addEventListener('cancel',function (event) { event.preventDefault(); bankClosePreview(); });
  }

  function openBankFromEditor() {
    if (!state.bank.access.canUse) { toast('Tài khoản này không có quyền dùng ngân hàng đề.','err'); return; }
    var area = el('exLatex');
    var selected = area && area.selectionStart !== area.selectionEnd ? area.value.slice(area.selectionStart,area.selectionEnd) : '';
    var query = stripLatex(selected).replace(/\s+/g,' ').trim().slice(0,120);
    if (query && el('bankSearchQuery')) el('bankSearchQuery').value = query;
    switchTab('bank');
    var target = el('bankSearchCard');
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
    if (query) toast('Đã chuyển phần đang chọn sang ô tìm ngân hàng.','ok');
  }

  function bankImportEditorSource() {
    if (!state.bank.access.canAdmin) { toast('Chỉ admin được đưa TeX trực tiếp vào kho riêng.','err'); return; }
    var parser = window.VinhMathQuestionBank;
    var raw = el('exType').value === 'essay' ? el('exEssayPrompt').value.trim() : el('exLatex').value.trim();
    if (!raw) { toast('Bản soạn chưa có nội dung để phân loại.','err'); return; }
    if (!parser) { toast('Chưa tải được bộ đọc ngân hàng TeX.','err'); return; }
    if (state.bank.items.length && !confirm('Thay danh sách tệp đang chờ nhập bằng nội dung trong trình soạn?')) return;
    var title = el('exTitle').value.trim() || 'Nội dung từ trình soạn';
    var fileName = bankPreviewSlug(title)+'.tex';
    var parsed = parser.parseDocument(raw,{sourcePath:fileName});
    if (!parsed.questions || !parsed.questions.length) { toast('Chưa nhận diện được môi trường câu hỏi trong bản soạn.','err'); return; }
    state.bank.documents = [{file:null,fileName:fileName,path:fileName,text:raw,contentHash:parser.hashText(raw),parsed:parsed}];
    state.bank.items = [];
    state.bank.parseErrors = (parsed.errors || []).map(function (error) { return {path:fileName,error:error}; });
    state.bank.visibleLimit = 120;
    parsed.questions.forEach(function (question,index) {
      question._bankDocumentIndex = 0;
      question._bankIndex = index;
      question._bankSelected = false;
      bankRefreshQuestion(question);
      state.bank.items.push(question);
    });
    if (el('bankImportTitle')) el('bankImportTitle').value = title;
    bankRenderLocal();
    switchTab('bank');
    var workbench = el('bankAdminWorkbench');
    if (workbench) workbench.scrollIntoView({behavior:'smooth',block:'start'});
    toast('Đã chuyển '+state.bank.items.length+' câu sang bước phân loại và nhập kho.','ok');
  }

  function bankSendPreviewToEditor() {
    var source = state.bank.preview.editableSource;
    if (!state.bank.access.canAdmin || !source) return;
    var area = el('exLatex');
    if (area.value.trim() && !confirm('Nối câu đang xem vào cuối bản soạn hiện tại?')) return;
    area.value = area.value.trim() ? area.value.trim()+'\n\n'+source.trim() : source.trim();
    if (!el('exTitle').value.trim()) el('exTitle').value = state.bank.preview.title || 'Nội dung từ ngân hàng';
    if (el('exType').value === 'essay') { el('exType').value = 'combo'; updateExamType(); }
    state.templateKey = 'custom';
    bankClosePreview();
    switchTab('compose');
    renderPreview(true);
    area.focus();
    area.scrollIntoView({behavior:'smooth',block:'center'});
    toast('Đã đưa câu vào bản soạn.','ok');
  }

  function bankTypeLabel(type) {
    return {multiple_choice:'Trắc nghiệm',true_false:'Đúng/Sai',short_answer:'Trả lời ngắn',essay:'Tự luận'}[type] || 'Không xác định';
  }

  function bankAccessFor(profile) {
    var canAdmin = !!profile && profile.role === 'admin';
    return { canAdmin:canAdmin, canUse:canAdmin || (!!profile && profile.role === 'teacher') };
  }

  function bankFillClassOptions() {
    var options = '<option value="">Chọn lớp</option>' + state.classes.map(function (c) {
      return '<option value="'+c.id+'">'+esc(c.name)+(c.is_specialized?' · Chuyên':'')+'</option>';
    }).join('');
    ['bankGenClass','bankSourceAssignClass'].forEach(function (id) { if (el(id)) el(id).innerHTML = options; });
  }

  function bankConfigureAccess(profile) {
    state.bank.access = bankAccessFor(profile);
    bankSetupPreviewDialog();
    var tab = el('bankTab');
    if (tab) tab.hidden = !state.bank.access.canUse;
    if (el('editorToBankButton')) el('editorToBankButton').hidden = !state.bank.access.canAdmin;
    if (el('bankAdminWorkbench')) el('bankAdminWorkbench').hidden = !state.bank.access.canAdmin;
    if (!state.bank.access.canUse) {
      document.body.classList.remove('bank-teacher-mode');
      return;
    }
    bankFillClassOptions();
    bankNewSeed();
    if (!state.bank.access.canAdmin) {
      document.body.classList.add('bank-teacher-mode');
      if (el('bankGenPrefix')) el('bankGenPrefix').value = '';
      if (el('bankSearchPrefix')) el('bankSearchPrefix').value = '';
      ['compose','library','analytics'].forEach(function (name) {
        var node = document.querySelector('[data-tab="'+name+'"]');
        if (node) node.hidden = true;
      });
      if (el('examWorkspaceLabel')) el('examWorkspaceLabel').textContent = 'Không gian tạo đề an toàn';
      if (el('examWorkspaceTitle')) el('examWorkspaceTitle').textContent = 'Tạo đề từ ngân hàng';
      switchTab('bank');
    } else {
      document.body.classList.remove('bank-teacher-mode');
      bankSetupDropzone();
      bankLoadTaxonomyCatalog(true);
    }
  }

  function bankNewSeed() {
    if (!el('bankGenSeed')) return;
    var day = new Date().toISOString().slice(0,10).replace(/-/g,'');
    el('bankGenSeed').value = 'vm-'+day+'-'+Math.random().toString(36).slice(2,8);
  }

  function bankBlueprintSelect(className,label,options,value) {
    return '<div class="exam-field"><label>'+label+'</label><select class="input '+className+'" onchange="VMExamAdmin.bankUpdateBlueprintTotal()">'+options.map(function (option) {
      return '<option value="'+esc(option[0])+'"'+(String(value||'')===option[0]?' selected':'')+'>'+esc(option[1])+'</option>';
    }).join('')+'</select></div>';
  }

  function bankAddBlueprintRow(values) {
    var box = el('bankBlueprintRows');
    if (!box) return;
    if (box.querySelectorAll('.bank-blueprint-row').length >= 29) { toast('Một đề tối đa 30 nhóm câu.','err'); return; }
    values = values || {};
    var id = ++state.bank.blueprintSeq;
    var row = document.createElement('div');
    row.className = 'bank-blueprint-row';
    row.setAttribute('data-blueprint-row',String(id));
    row.innerHTML = '<div class="bank-blueprint-row-no">Nhóm <span>'+id+'</span></div>'+
      bankBlueprintSelect('bank-blueprint-grade','Khối',[['','Mọi khối'],['10','10'],['11','11'],['12','12']],values.grade)+
      bankBlueprintSelect('bank-blueprint-type','Dạng câu',[['','Hỗn hợp'],['multiple_choice','Trắc nghiệm'],['true_false','Đúng/Sai'],['short_answer','Trả lời ngắn']],values.question_type)+
      bankBlueprintSelect('bank-blueprint-difficulty','Mức độ',[['','Cân bằng'],['NB','Nhận biết'],['TH','Thông hiểu'],['VD','Vận dụng'],['VDC','Vận dụng cao']],values.difficulty)+
      '<div class="exam-field bank-blueprint-count"><label>Số câu</label><input class="input" type="number" min="1" max="100" value="'+Math.max(1,Math.min(100,parseInt(values.count,10)||5))+'" oninput="VMExamAdmin.bankUpdateBlueprintTotal()"></div>'+
      '<button class="btn btn-secondary bank-blueprint-remove" type="button" aria-label="Xóa nhóm câu" title="Xóa nhóm" onclick="VMExamAdmin.bankRemoveBlueprintRow('+id+')">×</button>';
    box.appendChild(row);
    bankRenumberBlueprintRows();
    bankUpdateBlueprintTotal();
  }

  function bankRemoveBlueprintRow(id) {
    var row = document.querySelector('[data-blueprint-row="'+String(id)+'"]');
    if (row) row.remove();
    bankRenumberBlueprintRows();
    bankUpdateBlueprintTotal();
  }

  function bankRenumberBlueprintRows() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row'));
    rows.forEach(function (row,index) { var label=row.querySelector('.bank-blueprint-row-no span'); if(label) label.textContent=String(index+2); });
    var button = el('bankAddBlueprintButton');
    if (button) button.disabled = rows.length >= 29;
  }

  function bankCollectBlueprint() {
    var segments = [{
      count:Math.max(1,Math.min(100,parseInt(el('bankGenCount').value,10)||20)),
      grade:parseInt(el('bankGenGrade').value,10)||null,
      difficulty:el('bankGenDifficulty').value||null,
      question_type:el('bankGenType').value||null
    }];
    document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row').forEach(function (row) {
      segments.push({
        count:Math.max(1,Math.min(100,parseInt(row.querySelector('.bank-blueprint-count input').value,10)||1)),
        grade:parseInt(row.querySelector('.bank-blueprint-grade').value,10)||null,
        difficulty:row.querySelector('.bank-blueprint-difficulty').value||null,
        question_type:row.querySelector('.bank-blueprint-type').value||null
      });
    });
    return segments;
  }

  function bankUpdateBlueprintTotal() {
    if (!el('bankGenCount')) return 0;
    var total = bankCollectBlueprint().reduce(function (sum,segment) { return sum+segment.count; },0);
    var status = el('bankBlueprintTotal');
    if (status) { status.textContent='Tổng '+total+' câu'+(total>200?' · vượt giới hạn 200':''); status.classList.toggle('warn',total>200); }
    return total;
  }

  function bankRpcMissing(error) {
    var code = String(error && error.code || '').toUpperCase();
    var message = String(error && error.message || error || '').toLowerCase();
    return code === '42883' || code === 'PGRST202' || message.indexOf('could not find the function') >= 0 || message.indexOf('schema cache') >= 0 || message.indexOf('does not exist') >= 0;
  }

  function bankSafeError(error) {
    if (state.bank.access.canAdmin) return String(error && error.message || error || 'Lỗi không xác định');
    return bankRpcMissing(error)
      ? 'Chức năng đang được cập nhật trên máy chủ. Vui lòng thử lại sau.'
      : 'Máy chủ chưa hoàn tất yêu cầu. Vui lòng thử lại hoặc báo quản trị viên.';
  }

  function bankFocusImport() {
    if (!state.bank.access.canAdmin) {
      toast('Chỉ quản trị viên có quyền nhập dữ liệu vào ngân hàng đề.','err');
      return;
    }
    switchTab('bank');
    var card = el('bankImportCard');
    if (card) card.scrollIntoView({behavior:'smooth',block:'start'});
    var sourceKind = el('bankImportSourceKind');
    if (sourceKind) sourceKind.focus({preventScroll:true});
  }

  function bankImportActionHtml(label) {
    return state.bank.access.canAdmin
      ? '<div><button class="btn btn-primary btn-sm" type="button" onclick="VMExamAdmin.bankFocusImport()">'+esc(label || 'Nhập dữ liệu vào kho')+'</button></div>'
      : '<div><small>Hãy báo quản trị viên nhập thêm dữ liệu vào ngân hàng đề.</small></div>';
  }

  function bankIsAvailabilityError(error) {
    var message = String(error && error.message || error || '').toLowerCase();
    return message.indexOf('bank_no_matching_questions') >= 0 ||
      message.indexOf('no matching questions') >= 0 ||
      message.indexOf('insufficient') >= 0 ||
      message.indexOf('not enough') >= 0;
  }

  function bankGenerationFailureHtml(error, requestedCount) {
    var confirmedEmpty = state.bank.access.canAdmin && state.bank.statsLoaded && Number(state.bank.stats.active || 0) === 0;
    if (bankIsAvailabilityError(error) || confirmedEmpty) {
      var title = confirmedEmpty ? 'Ngân hàng chưa có câu đang dùng' : 'Không đủ câu phù hợp để tạo đề';
      var guidance = confirmedEmpty
        ? 'Kho hiện có 0 câu ở trạng thái “Đang dùng”, nên hệ thống chưa thể tạo đề.'
        : 'Đề đang yêu cầu '+Number(requestedCount || 0)+' câu nhưng kho không có đủ câu khớp khối, dạng câu và mức độ đã chọn.';
      var nextStep = state.bank.access.canAdmin
        ? 'Hãy nhập một đề TeX hoặc gói câu theo chủ đề, gán mã phân loại rồi bấm “Nhập các câu vào kho”. Nếu kho đã có dữ liệu, hãy giảm số câu hoặc nới bộ lọc.'
        : 'Hãy giảm số câu hoặc chọn bộ lọc rộng hơn. Nếu vẫn gặp lỗi, quản trị viên cần nhập thêm câu vào kho.';
      return '<strong>'+title+'</strong><p>'+guidance+' '+nextStep+'</p>'+bankImportActionHtml('↓ Nhập câu / đề TeX vào kho');
    }
    return '<strong>Chưa tạo được đề</strong><p>'+esc(bankSafeError(error))+'</p>';
  }

  function bankSourceEmptyHtml() {
    var guidance = state.bank.access.canAdmin
      ? 'Danh mục này chỉ hiện tệp được nhập dưới dạng “Đề hoàn chỉnh · có thể giao nguyên đề”. Kho câu theo chủ đề không xuất hiện ở đây. Hãy nhập một đề thi thử hoặc đề chính thức dạng .tex và điền tỉnh, năm, loại kỳ thi.'
      : 'Quản trị viên chưa nhập đề thi thử hoặc đề chính thức hoàn chỉnh nào. Các câu rời trong kho không tự trở thành một đề gốc.';
    return '<div class="exam-empty" style="min-height:150px"><div><strong>Chưa có đề hoàn chỉnh trong kho</strong>'+guidance+bankImportActionHtml('↓ Nhập đề hoàn chỉnh (.tex)')+'</div></div>';
  }

  function bankTaxonomyDifficultyCode(value) {
    var token = String(value == null ? '' : value).trim().toUpperCase();
    return {NB:'N',TH:'H',VD:'V',VDC:'G',N:'N',H:'H',V:'V',G:'G',C:'G',B:'N',Y:'N',T:'H',K:'V'}[token] || '';
  }

  function bankTaxonomyGradeCode(value) {
    var token = String(value == null ? '' : value).trim();
    return {10:'0',11:'1',12:'2',0:'0',1:'1',2:'2'}[token] || '';
  }

  function bankTaxonomyVariant(value) {
    return String(value == null ? '' : value).trim().toUpperCase()
      .replace(/\s+/g,'-').replace(/[^A-Z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');
  }

  function bankTaxonomyCode(parts) {
    var parser = window.VinhMathQuestionBank;
    var gradeCode = bankTaxonomyGradeCode(parts.grade_code != null ? parts.grade_code : parts.grade);
    var area = String(parts.area == null ? '' : parts.area).trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,1);
    var chapter = Math.max(0,parseInt(parts.chapter,10)||0);
    var difficultyCode = bankTaxonomyDifficultyCode(parts.difficulty_code != null ? parts.difficulty_code : parts.difficulty);
    var skill = Math.max(0,parseInt(parts.skill,10)||0);
    var variant = bankTaxonomyVariant(parts.variant);
    if (!gradeCode || !area || !chapter || !difficultyCode || !skill || !variant || !parser) return null;
    var code = gradeCode+area+chapter+difficultyCode+skill+'-'+variant;
    return parser.parseQuestionId(code) ? code : null;
  }

  function bankNormalizeTaxonomyEntry(raw, index) {
    var parser = window.VinhMathQuestionBank;
    var entry = typeof raw === 'string' ? {code:raw} : (raw || {});
    var taxonomy = entry.taxonomy && typeof entry.taxonomy === 'object' ? entry.taxonomy : entry;
    var candidate = String(entry.code || entry.legacy_code || entry.taxonomy_code || '').trim().toUpperCase();
    var familyKey = String(entry.key || entry.taxonomy_key || taxonomy.taxonomy_key || '').trim().toUpperCase();
    var parsed = parser && candidate ? parser.parseQuestionId(candidate) : null;
    if (!parsed) {
      candidate = bankTaxonomyCode({
        grade_code:taxonomy.grade_code != null ? taxonomy.grade_code : entry.grade_code,
        grade:taxonomy.grade != null ? taxonomy.grade : entry.grade,
        area:taxonomy.area != null ? taxonomy.area : entry.area,
        chapter:taxonomy.chapter != null ? taxonomy.chapter : entry.chapter,
        difficulty_code:taxonomy.difficulty_code != null ? taxonomy.difficulty_code : entry.difficulty_code,
        difficulty:taxonomy.difficulty != null ? taxonomy.difficulty : entry.difficulty,
        skill:taxonomy.skill != null ? taxonomy.skill : entry.skill,
        variant:taxonomy.variant != null ? taxonomy.variant : entry.variant
      });
      parsed = parser && candidate ? parser.parseQuestionId(candidate) : null;
    }
    var familyMatch = /^([012])([A-Z])(\d+)\?(\d+)-([A-Z0-9-]+)$/.exec(familyKey);
    if (!parsed && !familyMatch) return null;
    var label = String(entry.label || entry.name || entry.title || entry.vi || entry.slug || taxonomy.label || '').trim();
    var gradeCode = parsed ? parsed.grade_code : familyMatch[1];
    var grade = parsed ? parsed.grade : ({0:10,1:11,2:12}[gradeCode] || null);
    var area = parsed ? parsed.area : familyMatch[2];
    var chapter = parsed ? parsed.chapter : Number(familyMatch[3]);
    var difficultyCode = parsed ? parsed.difficulty_code : bankTaxonomyDifficultyCode(entry.difficulty_code || entry.difficulty || taxonomy.difficulty_code || taxonomy.difficulty);
    var skill = parsed ? parsed.skill : Number(familyMatch[4]);
    var variant = parsed ? parsed.variant : familyMatch[5];
    var catalogKey = parsed ? parsed.id : familyKey;
    return {
      catalog_key:catalogKey,
      code:parsed ? parsed.id : null,
      grade_code:gradeCode,
      grade:grade,
      area:area,
      chapter:chapter,
      difficulty_code:difficultyCode,
      difficulty:parsed ? parsed.difficulty : (entry.difficulty || taxonomy.difficulty || null),
      skill:skill,
      variant:variant,
      label:label || ('Mẫu phân loại '+(index+1)),
      area_label:String(entry.area_label || taxonomy.area_label || '').trim(),
      chapter_label:String(entry.chapter_label || taxonomy.chapter_label || '').trim(),
      skill_label:String(entry.skill_label || taxonomy.skill_label || '').trim(),
      variant_label:String(entry.variant_label || taxonomy.variant_label || '').trim()
    };
  }

  function bankRenderTaxonomySuggestions() {
    var catalog = state.bank.taxonomyCatalog || [];
    var configs = [
      ['bankTaxAreaList','area','area_label'],
      ['bankTaxChapterList','chapter','chapter_label'],
      ['bankTaxSkillList','skill','skill_label'],
      ['bankTaxVariantList','variant','variant_label']
    ];
    configs.forEach(function (config) {
      var list = el(config[0]); if (!list) return;
      var seen = Object.create(null), options = [];
      catalog.forEach(function (entry) {
        var value = String(entry[config[1]] == null ? '' : entry[config[1]]).trim();
        if (!value || seen[value]) return;
        seen[value] = true;
        var label = String(entry[config[2]] || '').trim();
        options.push('<option value="'+esc(value)+'"'+(label?' label="'+esc(label)+'"':'')+'></option>');
      });
      list.innerHTML = options.join('');
    });
  }

  function bankRenderTaxonomyCatalog(message) {
    var select = el('bankTaxonomyCatalogSelect');
    var status = el('bankTaxonomyCatalogStatus');
    if (!select) return;
    var catalog = state.bank.taxonomyCatalog || [];
    select.innerHTML = '<option value="">'+(catalog.length?'Chọn một mã đã chuẩn hóa':'Nhập tay bằng 6 tiêu chí bên dưới')+'</option>' + catalog.map(function (entry) {
      return '<option value="'+esc(entry.catalog_key)+'">'+esc(entry.catalog_key+' · '+entry.label)+'</option>';
    }).join('');
    if (status) status.textContent = message || (catalog.length ? 'Đã tải '+catalog.length+' mã chuẩn.' : 'Danh mục chưa sẵn sàng; vẫn có thể phân loại thủ công.');
    bankRenderTaxonomySuggestions();
  }

  async function bankLoadTaxonomyCatalog(silent) {
    if (!state.bank.access.canAdmin) return;
    var status = el('bankTaxonomyCatalogStatus');
    if (status) status.textContent = 'Đang tải danh mục phân loại…';
    if (!window.sb || typeof window.sb.rpc !== 'function') {
      state.bank.taxonomyCatalog = [];
      bankRenderTaxonomyCatalog('Chưa kết nối danh mục; dùng 6 ô phân loại thủ công.');
      return;
    }
    try {
      var rows = [], offset = 0, total = null;
      for (var page=0;page<20;page++) {
        var response = await sb.rpc('vm_bank_admin_taxonomy_catalog',{p_query:null,p_limit:500,p_offset:offset});
        if (response.error) throw response.error;
        var data = response.data || [];
        var pageRows = Array.isArray(data) ? data : (data.items || data.catalog || data.entries || data.taxonomies || []);
        rows = rows.concat(pageRows);
        if (!Array.isArray(data) && data.total != null) total = Number(data.total);
        if (!pageRows.length || pageRows.length < 500 || (total != null && rows.length >= total)) break;
        offset += pageRows.length;
      }
      var seen = Object.create(null);
      state.bank.taxonomyCatalog = rows.map(bankNormalizeTaxonomyEntry).filter(function (entry) {
        if (!entry || seen[entry.catalog_key]) return false;
        seen[entry.catalog_key] = true; return true;
      }).sort(function (a,b) { return a.catalog_key.localeCompare(b.catalog_key,'vi',{numeric:true}); });
      state.bank.taxonomyCatalogLoaded = true;
      bankRenderTaxonomyCatalog();
    } catch (error) {
      state.bank.taxonomyCatalog = [];
      state.bank.taxonomyCatalogLoaded = false;
      bankRenderTaxonomyCatalog(bankRpcMissing(error)
        ? 'Danh mục máy chủ chưa được bật; dùng 6 ô phân loại thủ công.'
        : 'Không tải được danh mục; dữ liệu đang nhập vẫn được giữ nguyên.');
      if (!silent && !bankRpcMissing(error)) toast('Chưa tải được danh mục phân loại.','err');
    }
  }

  function bankChooseTaxonomy(code) {
    if (!state.bank.access.canAdmin) return;
    var entry = state.bank.taxonomyCatalog.find(function (item) { return item.catalog_key === code; });
    if (!entry) { bankUpdateTaxonomyPreview(); return; }
    el('bankTaxGrade').value = entry.grade_code;
    el('bankTaxArea').value = entry.area;
    el('bankTaxChapter').value = entry.chapter;
    var difficultyCode = bankTaxonomyDifficultyCode(entry.difficulty_code || entry.difficulty);
    if (difficultyCode) el('bankTaxDifficulty').value = difficultyCode;
    el('bankTaxSkill').value = entry.skill;
    el('bankTaxVariant').value = entry.variant;
    bankUpdateTaxonomyPreview();
  }

  function bankCurrentTaxonomyCode() {
    return bankTaxonomyCode({
      grade_code:el('bankTaxGrade') && el('bankTaxGrade').value,
      area:el('bankTaxArea') && el('bankTaxArea').value,
      chapter:el('bankTaxChapter') && el('bankTaxChapter').value,
      difficulty_code:el('bankTaxDifficulty') && el('bankTaxDifficulty').value,
      skill:el('bankTaxSkill') && el('bankTaxSkill').value,
      variant:el('bankTaxVariant') && el('bankTaxVariant').value
    });
  }

  function bankUpdateTaxonomyPreview() {
    if (!state.bank.access.canAdmin) return;
    var code = bankCurrentTaxonomyCode();
    var preview = el('bankTaxonomyPreview');
    if (preview) {
      preview.textContent = code || 'Chọn đủ 6 tiêu chí';
      preview.classList.toggle('ready',!!code);
    }
    var catalogSelect = el('bankTaxonomyCatalogSelect');
    var parsed = code && window.VinhMathQuestionBank ? window.VinhMathQuestionBank.parseQuestionId(code) : null;
    var familyKey = parsed ? (parsed.grade_code+parsed.area+parsed.chapter+'?'+parsed.skill+'-'+parsed.variant) : '';
    var matchingEntry = state.bank.taxonomyCatalog.find(function (entry) { return entry.catalog_key === code || entry.catalog_key === familyKey; });
    if (catalogSelect && matchingEntry) catalogSelect.value = matchingEntry.catalog_key;
    else if (catalogSelect) catalogSelect.value = '';
    return code;
  }

  function bankSetServerState(ready, error) {
    state.bank.serverReady = ready;
    var notice = el('bankServerNotice');
    if (notice) notice.hidden = ready !== false;
    if (ready === false && error && !bankRpcMissing(error)) {
      var paragraph = notice && notice.querySelector('p');
      if (paragraph) paragraph.textContent = 'Máy chủ đã phản hồi nhưng chưa thể dùng chức năng này: ' + String(error.message || error);
    }
  }

  function bankReadFile(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Không đọc được tệp.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  async function bankReadJsonl(file, onRecord) {
    if (!file || typeof file.stream !== 'function') {
      var fallback = await bankReadFile(file);
      var fallbackLines = fallback.split(/\r?\n/);
      for (var f=0;f<fallbackLines.length;f++) {
        if (fallbackLines[f].trim()) await onRecord(JSON.parse(fallbackLines[f]),f+1);
      }
      return;
    }
    var reader=file.stream().getReader(),decoder=new TextDecoder('utf-8'),buffer='',lineNumber=0;
    while(true){
      var part=await reader.read();
      buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});
      if(buffer.length>36*1024*1024&&!/[\r\n]/.test(buffer))throw new Error('Một bản ghi trong gói vượt giới hạn an toàn 36 MB.');
      var lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
      for(var i=0;i<lines.length;i++){lineNumber+=1;if(lines[i].trim())await onRecord(JSON.parse(lines[i]),lineNumber);}
      if(part.done)break;
    }
    if(buffer.trim()){lineNumber+=1;await onRecord(JSON.parse(buffer),lineNumber);}
  }

  async function bankImportAdminPackage(fileList) {
    if(!state.bank.access.canAdmin)return;
    var file=Array.from(fileList||[]).find(function(item){return /\.jsonl$/i.test(item.name||'');});
    if(!file){toast('Hãy chọn gói ngân hàng có đuôi .jsonl.','err');return;}
    if(file.size>600*1024*1024){toast('Gói vượt giới hạn 600 MB. Hãy tách thành nhiều gói.','err');return;}
    var button=el('bankPackageButton'),documentIds=Object.create(null),done=0,total=0;
    var totals={inserted:0,updated:0,quarantined:0,linked:0,taxonomy:0,records:0};
    button.disabled=true;button.textContent='Đang nhập gói…';
    bankSetImportProgress(0,1,'Đang kiểm tra gói '+file.name+'…');
    try{
      await bankReadJsonl(file,async function(record,lineNumber){
        if(!record||record.schema_version!=='vinhmath.question-bank.admin-package.v1')throw new Error('Dòng '+lineNumber+' không phải gói admin VinhMath.');
        totals.records+=1;total=Math.max(total,Number(record.package_total_items||0));
        if(record.record_type==='taxonomy'){
          var taxonomyEntries=Array.isArray(record.entries)?record.entries:[];
          if(!taxonomyEntries.length||taxonomyEntries.length>1000)throw new Error('Danh mục ID ở dòng '+lineNumber+' không hợp lệ.');
          var taxonomyResponse=await sb.rpc('vm_bank_admin_import_taxonomy',{p_entries:taxonomyEntries});
          if(taxonomyResponse.error)throw taxonomyResponse.error;
          if(taxonomyResponse.data&&taxonomyResponse.data.error)throw new Error(taxonomyResponse.data.error);
          totals.taxonomy+=Number(taxonomyResponse.data&&taxonomyResponse.data.upserted||0);
          bankSetImportProgress(done,total||1,'Đã đồng bộ '+totals.taxonomy+' mã phân loại · đang nhập câu…');
          return;
        }
        if(record.record_type!=='document_chunk')throw new Error('Loại bản ghi không hỗ trợ ở dòng '+lineNumber+'.');
        var items=Array.isArray(record.items)?record.items:[];
        if(!items.length||items.length>250)throw new Error('Lô câu ở dòng '+lineNumber+' phải có từ 1 đến 250 câu.');
        var key=String(record.client_document_key||record.document&&record.document.client_document_key||'').trim();
        if(!key)throw new Error('Thiếu khóa tài liệu ở dòng '+lineNumber+'.');
        var documentPayload;
        if(documentIds[key])documentPayload={id:documentIds[key],raw_tex:''};
        else {
          documentPayload=record.document||{};
          if(!String(documentPayload.raw_tex||'').trim())throw new Error('Lô đầu của tài liệu '+key+' không có TeX nguồn. Hãy nhập lại từ đầu gói.');
        }
        var response=await sb.rpc('vm_bank_admin_import',{p_document:documentPayload,p_items:items});
        if(response.error)throw response.error;
        if(response.data&&response.data.error)throw new Error(response.data.error);
        var result=response.data||{};
        if(result.document_id)documentIds[key]=result.document_id;
        ['inserted','updated','quarantined','linked'].forEach(function(name){totals[name]+=Number(result[name]||0);});
        done+=items.length;
        bankSetImportProgress(done,total||done,'Đang nhập '+done.toLocaleString('vi-VN')+' / '+(total||done).toLocaleString('vi-VN')+' câu');
        if(totals.records%8===0)await new Promise(function(resolve){setTimeout(resolve,0);});
      });
      if(!totals.records)throw new Error('Gói không có dữ liệu.');
      bankSetServerState(true);
      bankSetImportProgress(total||done,total||done,'Hoàn tất · '+totals.inserted.toLocaleString('vi-VN')+' mới · '+totals.updated.toLocaleString('vi-VN')+' cập nhật · '+totals.quarantined.toLocaleString('vi-VN')+' cách ly');
      toast('Đã nhập gói ngân hàng an toàn.','ok');
      await bankLoadStats(false);
      await bankLoadTaxonomyCatalog(true);
    }catch(error){
      if(bankRpcMissing(error))bankSetServerState(false,error);
      bankSetImportProgress(done,total||done||1,'Dừng ở '+done.toLocaleString('vi-VN')+' câu · '+bankSafeError(error));
      toast('Chưa nhập xong gói: '+bankSafeError(error),'err');
    }finally{button.disabled=false;button.textContent='Nhập gói ngân hàng lớn';}
  }

  function bankRefreshQuestion(question) {
    var parser = window.VinhMathQuestionBank;
    var idInfo = parser && question.question_id ? parser.parseQuestionId(question.question_id) : null;
    question.id_info = idInfo;
    question.grade = idInfo ? idInfo.grade : null;
    question.area = idInfo ? idInfo.area : null;
    question.chapter = idInfo ? idInfo.chapter : null;
    question.chapter_code = idInfo ? idInfo.chapter_code : null;
    question.topic_code = idInfo ? idInfo.topic_code : null;
    question.difficulty = idInfo ? idInfo.difficulty : null;
    question.difficulty_code = idInfo ? idInfo.difficulty_code : null;
    question.difficulty_rank = idInfo ? idInfo.difficulty_rank : null;
    question.skill = idInfo ? idInfo.skill : null;
    question.skill_code = idInfo ? idInfo.skill_code : null;
    question.skill_family = idInfo ? idInfo.skill_family : null;
    question.variant = idInfo ? idInfo.variant : null;
    question.taxonomy_key = idInfo ? idInfo.taxonomy_key : null;
    question.similarity_key = idInfo ? idInfo.similarity_key : null;
    if (parser) {
      question.canonical_tex = parser.buildCanonical(question);
      var identityTex = parser.normalizeQuestionForDedupe
        ? parser.normalizeQuestionForDedupe(question.canonical_tex)
        : question.canonical_tex;
      question.canonical_hash = parser.hashText(identityTex);
      question.uid = 'qb-'+question.canonical_hash;
    }
    var reasons = [];
    if (!question.question_id) reasons.push('Thiếu ID câu');
    else if (!idInfo) reasons.push('ID chưa đúng cấu trúc VinhMath');
    else if (!idInfo.difficulty) reasons.push('Mã mức độ chưa được ánh xạ');
    if (question.type === 'multiple_choice') {
      if ((question.choices || []).length !== 4) reasons.push('Trắc nghiệm cần đúng 4 phương án');
      if ((question.correct_choice_indexes || []).length !== 1) reasons.push('Cần đúng 1 phương án đúng');
    } else if (question.type === 'true_false') {
      if ((question.choices || []).length !== 4) reasons.push('Câu Đúng/Sai cần đúng 4 ý');
    } else if (question.type === 'short_answer') {
      if (!String(question.short_answer || '').trim()) reasons.push('Thiếu đáp án trả lời ngắn');
    } else {
      reasons.push('Câu tự luận cần admin duyệt thủ công');
    }
    if (question.asset_refs && question.asset_refs.length) reasons.push('Còn tệp ngoài chưa được đóng gói');
    question._bankStatus = reasons.length ? 'quarantined' : 'active';
    question._bankReason = reasons.join('; ');
    return question;
  }

  function bankAnswerSummary(question) {
    if (question.type === 'multiple_choice') {
      return (question.correct_choice_indexes || []).map(function (index) { return String.fromCharCode(65 + index); }).join(', ') || '—';
    }
    if (question.type === 'true_false') {
      return (question.choices || []).map(function (choice) { return choice.correct ? 'Đ' : 'S'; }).join(' · ');
    }
    if (question.type === 'short_answer') return String(question.short_answer || '—');
    return 'Duyệt thủ công';
  }

  function bankHasClassification(question) {
    var parser = window.VinhMathQuestionBank;
    return !!(parser && parser.parseQuestionId(question && question.question_id || ''));
  }

  function bankUpdateSelectionStatus() {
    var selected = state.bank.items.filter(function (question) { return !!question._bankSelected; }).length;
    var status = el('bankTaxonomySelectionStatus');
    if (status) status.textContent = selected ? 'Đã chọn '+selected+' câu' : 'Chưa chọn câu nào';
    return selected;
  }

  function bankToggleQuestionSelection(index, checked) {
    if (!state.bank.access.canAdmin || !state.bank.items[index]) return;
    state.bank.items[index]._bankSelected = !!checked;
    var row = document.querySelector('[data-bank-question-index="'+index+'"]');
    if (row) row.classList.toggle('selected',!!checked);
    bankUpdateSelectionStatus();
  }

  function bankSelectMissingIds() {
    if (!state.bank.access.canAdmin) return;
    var selected = 0;
    state.bank.items.forEach(function (question) {
      question._bankSelected = !bankHasClassification(question);
      if (question._bankSelected) selected++;
    });
    bankRenderLocal();
    toast(selected ? 'Đã chọn '+selected+' câu thiếu mã phân loại.' : 'Tất cả câu đã có mã phân loại hợp lệ.','ok');
  }

  function bankClearSelection() {
    if (!state.bank.access.canAdmin) return;
    state.bank.items.forEach(function (question) { question._bankSelected = false; });
    bankRenderLocal();
  }

  function bankApplyClassification() {
    if (!state.bank.access.canAdmin) return;
    var code = bankUpdateTaxonomyPreview();
    if (!code) { toast('Hãy chọn đủ khối, mảng, chương, mức độ, kỹ năng và biến thể dạng bài.','err'); return; }
    var selected = state.bank.items.filter(function (question) { return !!question._bankSelected; });
    if (!selected.length) { toast('Hãy đánh dấu ít nhất một câu cần phân loại.','err'); return; }
    selected.forEach(function (question) {
      question.question_id = code;
      question._bankSelected = false;
      bankRefreshQuestion(question);
    });
    bankRenderLocal();
    toast('Đã áp dụng mã '+code+' cho '+selected.length+' câu.','ok');
  }

  function bankRenderLocal() {
    var items = state.bank.items;
    var active = items.filter(function (q) { return q._bankStatus === 'active'; }).length;
    var quarantined = items.length - active;
    var summary = el('bankLocalSummary');
    if (summary) summary.innerHTML = '<span>'+state.bank.documents.length+' tệp</span><span>'+items.length+' câu</span><span>✓ '+active+' hợp lệ</span><span>⚠ '+quarantined+' cách ly</span>'+(state.bank.parseErrors.length?'<span>'+state.bank.parseErrors.length+' lỗi cấu trúc tệp</span>':'');
    if (el('bankBulkTools')) el('bankBulkTools').hidden = !items.length;
    var list = el('bankQuestionList');
    if (!list) return;
    if (!items.length) { list.innerHTML = ''; if (el('bankLoadMore')) el('bankLoadMore').hidden = true; bankUpdateSelectionStatus(); return; }
    var visible = items.slice(0, state.bank.visibleLimit);
    list.innerHTML = visible.map(function (q, index) {
      var globalIndex = q._bankIndex;
      var source = state.bank.documents[q._bankDocumentIndex] || {};
      return '<article class="bank-question-item '+(q._bankStatus==='quarantined'?'quarantined ':'')+(q._bankSelected?'selected':'')+'" data-bank-question-index="'+globalIndex+'">'+
        '<div class="bank-question-select"><label><input type="checkbox" '+(q._bankSelected?'checked':'')+' onchange="VMExamAdmin.bankToggleQuestionSelection('+globalIndex+',this.checked)" aria-label="Chọn câu '+(globalIndex+1)+'"><span class="bank-question-index">#'+(globalIndex+1)+'</span></label></div><div class="bank-question-main"><div class="bank-question-top"><span class="bank-chip">'+esc(bankTypeLabel(q.type))+'</span><span class="bank-chip">'+esc(q.grade||'Chưa rõ khối')+'</span><span class="bank-chip">'+esc(q.difficulty||'Chưa rõ mức')+'</span><span class="bank-chip '+(q._bankStatus==='active'?'ok':'warn')+'">'+(q._bankStatus==='active'?'Hợp lệ':'Cách ly')+'</span>'+(q.has_assets?'<span class="bank-chip">Có hình</span>':'')+'</div><p>'+esc(stripLatex(q.content_tex).slice(0,230)||'Câu hỏi chưa có nội dung hiển thị')+'</p><span class="bank-question-source">'+esc(source.path||q.source_path||'Tệp TeX')+' · vị trí '+(Number(q.source_index||0)+1)+'</span><span class="bank-answer-summary">Đáp án nội bộ: '+esc(bankAnswerSummary(q))+'</span><button class="btn btn-secondary btn-sm bank-preview-open" type="button" onclick="VMExamAdmin.bankOpenLocalPreview('+globalIndex+')">🌐 Xem HTML / PDF</button></div>'+
        '<div class="bank-question-id"><label for="bankItemId'+globalIndex+'">Mã phân loại</label><input class="input" id="bankItemId'+globalIndex+'" value="'+esc(q.question_id||'')+'" placeholder="Ví dụ: 2D1H3-HAM-SO" onchange="VMExamAdmin.bankUpdateId('+globalIndex+',this.value)"><small>UID/hash được tạo tự động, không đổi khi sửa mã này.</small>'+(q._bankReason?'<span class="bank-question-reason">'+esc(q._bankReason)+'</span>':'')+'</div></article>';
    }).join('');
    var more = el('bankLoadMore');
    if (more) { more.hidden = visible.length >= items.length; more.textContent = 'Hiện thêm '+Math.min(120,items.length-visible.length)+' câu'; }
    bankUpdateSelectionStatus();
  }

  async function bankSelectFiles(fileList) {
    if (!state.bank.access.canAdmin) return;
    var parser = window.VinhMathQuestionBank;
    if (!parser) { toast('Chưa tải được bộ đọc ngân hàng TeX.','err'); return; }
    var files = Array.from(fileList || []).filter(function (file) { return /\.tex$/i.test(file.name || ''); }).sort(function (a,b) { return String(a.webkitRelativePath||a.name).localeCompare(String(b.webkitRelativePath||b.name),'vi'); });
    if (!files.length) { toast('Chỉ nhận tệp có đuôi .tex.','err'); return; }
    state.bank.documents = []; state.bank.items = []; state.bank.parseErrors = []; state.bank.visibleLimit = 120;
    if (el('bankLocalSummary')) el('bankLocalSummary').innerHTML = '<span>Đang đọc 0 / '+files.length+' tệp…</span>';
    for (var i=0;i<files.length;i++) {
      var file = files[i];
      try {
        var text = await bankReadFile(file);
        var path = file.webkitRelativePath || file.name;
        var parsed = parser.parseDocument(text, {sourcePath:path});
        var documentIndex = state.bank.documents.length;
        var document = {file:file,fileName:file.name,path:path,text:text,contentHash:parser.hashText(text),parsed:parsed};
        state.bank.documents.push(document);
        (parsed.errors || []).forEach(function (error) { state.bank.parseErrors.push({path:path,error:error}); });
        (parsed.questions || []).forEach(function (question) {
          question._bankDocumentIndex = documentIndex;
          question._bankIndex = state.bank.items.length;
          question._bankSelected = false;
          bankRefreshQuestion(question);
          state.bank.items.push(question);
        });
      } catch (error) {
        state.bank.parseErrors.push({path:file.name,error:{code:'READ_ERROR',message:error.message||String(error)}});
      }
      if (el('bankLocalSummary')) el('bankLocalSummary').innerHTML = '<span>Đang đọc '+(i+1)+' / '+files.length+' tệp…</span>';
      if (i % 12 === 0) await new Promise(function (resolve) { setTimeout(resolve,0); });
    }
    bankRenderLocal();
    toast('Đã nhận diện '+state.bank.items.length+' câu từ '+state.bank.documents.length+' tệp.','ok');
  }

  function bankUpdateId(index, value) {
    if (!state.bank.access.canAdmin || !state.bank.items[index]) return;
    state.bank.items[index].question_id = String(value || '').trim().toUpperCase();
    bankRefreshQuestion(state.bank.items[index]);
    bankRenderLocal();
  }

  function bankApplyBulkIds() {
    bankApplyClassification();
  }

  function bankShowMore() { state.bank.visibleLimit += 120; bankRenderLocal(); }

  function bankSetupDropzone() {
    var zone = el('bankDropzone');
    if (!zone || zone._bankBound) return;
    zone._bankBound = true;
    ['dragenter','dragover'].forEach(function (name) { zone.addEventListener(name,function (event) { event.preventDefault();event.stopPropagation();zone.classList.add('dragover'); }); });
    ['dragleave','drop'].forEach(function (name) { zone.addEventListener(name,function (event) { event.preventDefault();event.stopPropagation();zone.classList.remove('dragover'); }); });
    zone.addEventListener('drop',function (event) { bankSelectFiles(event.dataTransfer && event.dataTransfer.files); });
  }

  function bankDocumentPayload(document) {
    if (document._serverId) return {id:document._serverId,raw_tex:''};
    var baseName = String(document.fileName || 'de-tex').replace(/\.tex$/i,'');
    var sharedTitle = String(el('bankImportTitle').value || '').trim();
    var title = sharedTitle ? (state.bank.documents.length > 1 ? sharedTitle+' · '+baseName : sharedTitle) : baseName;
    var unit = String(el('bankImportUnit').value || '').trim() || null;
    var year = parseInt(el('bankImportYear').value,10) || null;
    var examType = String(el('bankImportExamType').value || 'other');
    var sourceKind = String(el('bankImportSourceKind').value || 'mock_exam');
    return {
      title:title, source_kind:sourceKind, province:unit, exam_year:year, exam_kind:examType,
      original_filename:document.fileName,
      content_hash:document.contentHash, raw_tex:document.text,
      metadata:{source_title:title,province_or_unit:unit,exam_year:year,exam_type:examType,parser_version:(window.VinhMathQuestionBank&&window.VinhMathQuestionBank.VERSION)||'unknown',question_count:(document.parsed.questions||[]).length,parse_errors:document.parsed.errors||[]},
      provenance:{relative_path:document.path,size:document.file&&document.file.size||document.text.length,last_modified:document.file&&document.file.lastModified||null}
    };
  }

  function bankItemPayload(question) {
    var answer = null;
    if (question.type === 'multiple_choice' || question.type === 'true_false') answer = {correct_indexes:question.correct_choice_indexes||[]};
    if (question.type === 'short_answer') answer = {value:question.short_answer||'',option:question.short_answer_option||null};
    return {
      client_key:question.uid, canonical_hash:question.canonical_hash, legacy_code:question.question_id||null,
      question_type:question.type, difficulty:question.difficulty||null, grade:question.grade||null,
      similarity_key:question.similarity_key||null,
      taxonomy:{area:question.area||null,chapter:question.chapter||null,chapter_code:question.chapter_code||null,topic_code:question.topic_code||null,difficulty_rank:question.difficulty_rank||null,skill:question.skill||null,skill_code:question.skill_code||null,skill_family:question.skill_family||null,variant:question.variant||null,taxonomy_key:question.taxonomy_key||null,similarity_key:question.similarity_key||null},
      content_latex:question.content_tex||'', choices:question.choices||[], answer:answer,
      solution_latex:question.solution_tex||'', raw_tex:question.raw_tex||'', canonical_tex:question.canonical_tex||'',
      assets:{has_assets:!!question.has_assets,asset_refs:question.asset_refs||[],embedded_graphics:question.embedded_graphics||[]},
      status:question._bankStatus, quarantine_reason:question._bankReason||null,
      source_ordinal:Number(question.source_index||0)+1, source_location:{path:question.source_path||null,index:Number(question.source_index||0)+1}
    };
  }

  function bankSetImportProgress(done, total, label) {
    var box = el('bankImportProgress'); if (!box) return;
    box.hidden = false;
    box.querySelector('span').textContent = label || ('Đang nhập '+done+' / '+total+' câu');
    box.querySelector('i').style.width = (total ? Math.min(100,done*100/total) : 0)+'%';
  }

  async function bankImport() {
    if (!state.bank.access.canAdmin || !state.bank.items.length) return;
    var button = el('bankImportButton'), total = state.bank.items.length, done = 0;
    button.disabled = true; button.textContent = 'Đang nhập…';
    var totals = {inserted:0,updated:0,quarantined:0,linked:0};
    try {
      for (var d=0;d<state.bank.documents.length;d++) {
        var document = state.bank.documents[d];
        var items = state.bank.items.filter(function (question) { return question._bankDocumentIndex === d; });
        for (var offset=0;offset<items.length;offset+=40) {
          var response = await sb.rpc('vm_bank_admin_import',{p_document:bankDocumentPayload(document),p_items:items.slice(offset,offset+40).map(bankItemPayload)});
          if (response.error) throw response.error;
          if (response.data && response.data.error) throw new Error(response.data.error);
          var result = response.data || {};
          if (result.document_id) document._serverId = result.document_id;
          Object.keys(totals).forEach(function (key) { totals[key] += Number(result[key]||0); });
          done += Math.min(40,items.length-offset);
          bankSetImportProgress(done,total,'Đang nhập '+done+' / '+total+' câu');
        }
      }
      bankSetServerState(true);
      bankSetImportProgress(total,total,'Hoàn tất · '+totals.inserted+' mới · '+totals.updated+' cập nhật · '+totals.quarantined+' cách ly');
      toast('Đã nhập ngân hàng đề thành công.','ok');
      await bankLoadStats(false);
    } catch (error) {
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      bankSetImportProgress(done,total,'Dừng ở '+done+' / '+total+' câu · '+String(error.message||error));
      toast('Chưa nhập được ngân hàng: '+String(error.message||error),'err');
    } finally { button.disabled = false; button.textContent = 'Nhập các câu vào kho'; }
  }

  async function bankLoadStats(silent) {
    if (!state.bank.access.canAdmin) return;
    try {
      var response = await sb.rpc('vm_bank_admin_stats');
      if (response.error) throw response.error;
      var data = Array.isArray(response.data) ? response.data[0] || {} : response.data || {};
      state.bank.stats = {
        documents:Number(data.documents||0),
        items:Number(data.items||0),
        active:Number(data.active||0),
        quarantined:Number(data.quarantined||0)
      };
      el('bankStatDocuments').textContent = Number(data.documents||0).toLocaleString('vi-VN');
      el('bankStatItems').textContent = Number(data.items||0).toLocaleString('vi-VN');
      el('bankStatActive').textContent = Number(data.active||0).toLocaleString('vi-VN');
      el('bankStatQuarantine').textContent = Number(data.quarantined||0).toLocaleString('vi-VN');
      state.bank.statsLoaded = true; bankSetServerState(true);
    } catch (error) {
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      if (!silent) toast('Chưa tải được thống kê ngân hàng.','err');
    }
  }

  function bankSearchFilters() {
    var grade = parseInt(el('bankSearchGrade').value,10) || null;
    var difficulty = el('bankSearchDifficulty').value;
    var type = el('bankSearchType').value;
    var legacyPrefix = state.bank.access.canAdmin && el('bankSearchPrefix') ? el('bankSearchPrefix').value.trim().toUpperCase() : '';
    return {query:el('bankSearchQuery').value.trim(),grade:grade,difficulties:difficulty?[difficulty]:[],question_types:type?[type]:[],legacy_prefix:legacyPrefix,status:'active'};
  }

  async function bankSearch(event) {
    if (event) event.preventDefault();
    if (!state.bank.access.canUse) return;
    var button = el('bankSearchButton'), results = el('bankSearchResults');
    button.disabled = true; results.innerHTML = '<div class="exam-empty" style="min-height:150px"><div><div class="exam-spinner"></div><strong>Đang tìm câu phù hợp</strong></div></div>';
    try {
      var response = await sb.rpc('vm_bank_search',{p_filters:bankSearchFilters(),p_limit:50,p_offset:0});
      if (response.error) throw response.error;
      var data = response.data || {}, items = Array.isArray(data) ? data : data.items || [];
      state.bank.searchItems = items;
      var total = Number(data.total==null?items.length:data.total);
      el('bankSearchTotal').textContent = total.toLocaleString('vi-VN')+' câu';
      if (!items.length) results.innerHTML = '<div class="exam-empty" style="min-height:150px"><div><strong>Không có câu phù hợp</strong>Thử nới bộ lọc chuyên đề hoặc mức độ.</div></div>';
      else results.innerHTML = items.map(function (item,itemIndex) {
        var choices = Array.isArray(item.choices) ? item.choices : [];
        var identityLabel = state.bank.access.canAdmin ? (item.stable_id||item.legacy_code||('Câu hỏi '+(itemIndex+1))) : ('Câu hỏi '+(itemIndex+1));
        return '<article class="bank-result-item"><div class="bank-result-top"><span class="bank-chip">'+esc(identityLabel)+'</span><span class="bank-chip">'+esc(bankTypeLabel(item.question_type))+'</span><span class="bank-chip">Khối '+esc(item.grade||'—')+'</span><span class="bank-chip">'+esc(item.difficulty||'—')+'</span></div><p>'+latexRaHTML(item.content_latex||'')+'</p>'+(choices.length?'<div class="bank-result-meta">'+choices.map(function(choice,choiceIndex){return '<span><b>'+esc(choice.key||choice.label||String.fromCharCode(65+choiceIndex))+'.</b> '+latexRaHTML(choice.latex||choice.tex||'')+'</span>';}).join(' · ')+'</div>':'')+'<div class="bank-result-meta">'+esc(item.source_label||'Nguồn đã ẩn')+'</div><button class="btn btn-secondary btn-sm bank-preview-open" type="button" data-bank-search-preview="'+itemIndex+'">🌐 Xem HTML / PDF</button></article>';
      }).join('');
      results.querySelectorAll('[data-bank-search-preview]').forEach(function (button) { button.addEventListener('click',function () { bankOpenSearchPreview(Number(button.dataset.bankSearchPreview)); }); });
      renderMath(results); bankSetServerState(true);
    } catch (error) {
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      results.innerHTML = '<div class="exam-empty" style="min-height:150px;color:var(--err)"><div><strong>Chưa tìm được câu</strong>'+esc(bankSafeError(error))+'</div></div>';
    } finally { button.disabled = false; }
  }

  async function bankGenerateExam(event) {
    event.preventDefault();
    if (!state.bank.access.canUse) return;
    var title = el('bankGenTitle').value.trim(), classId = el('bankGenClass').value;
    if (!title || !classId) { toast('Hãy nhập tiêu đề và chọn lớp.','err'); return; }
    var prefix=state.bank.access.canAdmin&&el('bankGenPrefix')?el('bankGenPrefix').value.trim().toUpperCase():'', blueprint=bankCollectBlueprint();
    var total=blueprint.reduce(function(sum,segment){return sum+segment.count;},0);
    if(total>200){toast('Một đề tối đa 200 câu. Hãy giảm số câu trong các nhóm.','err');return;}
    var spec = {title:title,class_id:classId,portal_id:state.portal?state.portal.id:null,duration_minutes:Math.max(1,parseInt(el('bankGenDuration').value,10)||45),published:!!el('bankGenPublished').checked,seed:el('bankGenSeed').value.trim(),filters:{taxonomy_codes:prefix?[prefix]:[],legacy_prefix:prefix||null,source_kinds:[]},blueprint:blueprint,exclude_question_ids:[]};
    var button=el('bankGenerateButton'),status=el('bankGenerateStatus'),box=el('bankGenerateResult');
    button.disabled=true;status.textContent='Đang chọn và cân bằng câu…';box.hidden=true;
    try {
      if(state.bank.access.canAdmin&&!state.bank.statsLoaded)await bankLoadStats(true);
      if(state.bank.access.canAdmin&&state.bank.statsLoaded&&Number(state.bank.stats.active||0)===0)throw new Error('bank_no_matching_questions');
      var response=await sb.rpc('vm_bank_generate_exam',{p_spec:spec});
      if(response.error)throw response.error;if(response.data&&response.data.error)throw new Error(response.data.error);
      var data=response.data||{},query=state.portal?'portal='+encodeURIComponent(state.portal.slug)+'&':'';
      box.innerHTML='<b>✓ Đã tạo “'+esc(data.title||title)+'”</b><br>'+Number(data.question_count||0)+' câu · mã trộn '+esc(data.seed||spec.seed)+(data.warnings&&data.warnings.length?'<br><span>'+esc(data.warnings.join(' · '))+'</span>':'')+(data.exam_id?'<div class="bank-preview-result-actions"><button class="btn btn-primary btn-sm" type="button" data-bank-preview-exam="'+esc(data.exam_id)+'">🌐 Xem HTML / PDF</button><a class="btn btn-secondary btn-sm" href="luyen-de?'+query+'exam_id='+encodeURIComponent(data.exam_id)+'" target="_blank" rel="noopener">Mở trang làm đề ↗</a></div>':'');
      var generatedPreview=box.querySelector('[data-bank-preview-exam]');if(generatedPreview)generatedPreview.addEventListener('click',function(){bankOpenExamPreview(generatedPreview.dataset.bankPreviewExam,data.title||title);});
      box.hidden=false;status.textContent='Hoàn tất';bankSetServerState(true);bankNewSeed();
      if(state.bank.access.canAdmin)await loadExams();
    }catch(error){
      if(bankRpcMissing(error))bankSetServerState(false,error);
      var availability=bankIsAvailabilityError(error)||(state.bank.access.canAdmin&&state.bank.statsLoaded&&Number(state.bank.stats.active||0)===0);
      status.textContent=availability?'Kho chưa đủ dữ liệu':'Chưa tạo được đề';
      box.innerHTML=bankGenerationFailureHtml(error,total);box.hidden=false;
      toast(availability?'Ngân hàng chưa có đủ câu phù hợp để tạo đề.':'Không tạo được đề: '+bankSafeError(error),'err');
    }
    finally{button.disabled=false;}
  }

  function bankSourceFilters() {
    return {query:el('bankSourceQuery').value.trim(),province:el('bankSourceUnit').value.trim(),exam_year:parseInt(el('bankSourceYear').value,10)||null,exam_kind:el('bankSourceType').value||null,tags:[]};
  }

  async function bankLoadSourceCatalog(event) {
    if(event)event.preventDefault();if(!state.bank.access.canUse)return;
    if(state.bank.sourceCatalogLoading)return;
    state.bank.sourceCatalogLoading=true;
    var button=el('bankSourceSearchButton'),box=el('bankSourceResults');button.disabled=true;box.innerHTML='<div class="exam-empty" style="min-height:150px"><div><div class="exam-spinner"></div><strong>Đang tải danh mục đề hoàn chỉnh</strong></div></div>';
    try{
      var response=await sb.rpc('vm_bank_source_exam_catalog',{p_filters:bankSourceFilters(),p_limit:50,p_offset:0});
      if(response.error)throw response.error;var data=response.data||{},items=Array.isArray(data)?data:data.items||[];state.bank.sourceItems=items;
      state.bank.sourceCatalogLoaded=true;
      if(!items.length)box.innerHTML=bankSourceEmptyHtml();
      else {
        box.innerHTML=items.map(function(item){return '<article class="bank-source-item"><div class="bank-result-top"><span class="bank-chip">'+esc(item.exam_year||'Chưa rõ năm')+'</span><span class="bank-chip">'+esc(item.exam_kind||'Đề nguồn')+'</span><span class="bank-chip">'+Number(item.question_count||0)+' câu</span></div><h3>'+esc(item.title||'Đề chưa đặt tên')+'</h3><p>'+esc(item.province||'Chưa ghi tỉnh / đơn vị')+'</p><div class="bank-source-actions"><button class="btn btn-primary bank-source-preview" type="button" data-source-preview-id="'+esc(item.id)+'">🌐 Xem HTML / PDF</button><button class="btn btn-secondary" type="button" data-source-exam-id="'+esc(item.id)+'" data-source-mode="assign">Giao nguyên đề</button><button class="btn btn-secondary" type="button" data-source-exam-id="'+esc(item.id)+'" data-source-mode="clone">Tạo đề cùng cấu trúc</button></div></article>';}).join('');
        box.querySelectorAll('[data-source-preview-id]').forEach(function(button){button.addEventListener('click',function(){bankOpenSourcePreview(button.dataset.sourcePreviewId);});});
        box.querySelectorAll('[data-source-exam-id]').forEach(function(button){button.addEventListener('click',function(){bankChooseSourceExam(button.dataset.sourceExamId,button.dataset.sourceMode);});});
      }
      bankSetServerState(true);
    }catch(error){state.bank.sourceCatalogLoaded=false;if(bankRpcMissing(error))bankSetServerState(false,error);box.innerHTML='<div class="exam-empty" style="min-height:150px;color:var(--err)"><div><strong>Chưa tải được danh mục</strong>'+esc(bankSafeError(error))+'</div></div>';}
    finally{state.bank.sourceCatalogLoading=false;button.disabled=false;}
  }

  function bankChooseSourceExam(id,mode) {
    if(!state.bank.access.canUse)return;var item=state.bank.sourceItems.find(function(entry){return String(entry.id)===String(id);});if(!item)return;
    mode=mode==='clone'?'clone':'assign';state.bank.selectedSourceId=item.id;state.bank.selectedSourceMode=mode;
    el('bankSourceSelectedMode').textContent=mode==='clone'?'Tạo đề mới theo cấu trúc':'Giao nguyên đề';
    el('bankSourceSelectedTitle').textContent=item.title||'Đề nguồn';
    el('bankSourceAssignTitle').value=mode==='clone'?'Đề mới theo cấu trúc '+(item.title||'đề nguồn'):(item.title||'');
    el('bankSourceAssignButton').textContent=mode==='clone'?'✨ Tạo đề mới cùng cấu trúc':'Giao nguyên đề cho lớp';
    el('bankSourceAssign').hidden=false;
    el('bankSourceAssignStatus').textContent=mode==='clone'
      ? 'Hệ thống giữ số lượng, thứ tự dạng câu và mức độ gần tương đương; không lặp lại câu của đề gốc.'
      : 'Giữ nguyên '+Number(item.question_count||0)+' câu theo thứ tự đề gốc.';
    el('bankSourceAssign').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  async function bankAssignSourceExam(event) {
    event.preventDefault();if(!state.bank.access.canUse||!state.bank.selectedSourceId)return;
    var classId=el('bankSourceAssignClass').value,title=el('bankSourceAssignTitle').value.trim();if(!classId||!title){toast('Hãy chọn lớp và đặt tên đề.','err');return;}
    var mode=state.bank.selectedSourceMode==='clone'?'clone':'assign',button=el('bankSourceAssignButton'),status=el('bankSourceAssignStatus');button.disabled=true;status.textContent=mode==='clone'?'Đang tìm câu tương đương và dựng đề mới…':'Đang sao nguyên đề và giao lớp…';
    try{
      var spec={title:title,class_id:classId,portal_id:state.portal?state.portal.id:null,duration_minutes:Math.max(1,parseInt(el('bankSourceAssignDuration').value,10)||90),published:!!el('bankSourceAssignPublished').checked,opens_at:null,closes_at:null,shuffle:mode==='clone',seed:'vm-clone-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)};
      var response=mode==='clone'
        ?await sb.rpc('vm_bank_clone_source_structure',{p_document_id:state.bank.selectedSourceId,p_spec:spec})
        :await sb.rpc('vm_bank_assign_source_exam',{p_document_id:state.bank.selectedSourceId,p_spec:spec});
      if(response.error)throw response.error;if(response.data&&response.data.error)throw new Error(response.data.error);var data=response.data||{},warnings=Array.isArray(data.warnings)?data.warnings.length:0;
      status.innerHTML='✓ '+(mode==='clone'?'Đã tạo đề mới ':'Đã giao ')+Number(data.question_count||0)+' câu'+(data.skipped?' · bỏ qua '+Number(data.skipped)+' câu chưa hợp lệ':'')+(warnings?' · '+warnings+' vị trí chưa có câu tương đương':'')+(data.exam_id?' · <button class="btn btn-secondary btn-sm" type="button" data-bank-preview-exam="'+esc(data.exam_id)+'">Xem HTML / PDF</button> · <a href="luyen-de?exam_id='+encodeURIComponent(data.exam_id)+'" target="_blank" rel="noopener">mở trang làm đề ↗</a>':'');var assignedPreview=status.querySelector('[data-bank-preview-exam]');if(assignedPreview)assignedPreview.addEventListener('click',function(){bankOpenExamPreview(assignedPreview.dataset.bankPreviewExam,title);});bankSetServerState(true);if(state.bank.access.canAdmin)await loadExams();
    }catch(error){if(bankRpcMissing(error))bankSetServerState(false,error);status.textContent='Chưa giao được đề: '+bankSafeError(error);}
    finally{button.disabled=false;}
  }

  var railFrame=0;
  function syncAuthoringRail(){
    var rail=document.querySelector('.exam-stack');
    if(!rail)return;
    if(window.innerWidth<=1100){rail.style.removeProperty('--exam-rail-height');return;}
    var rect=rail.getBoundingClientRect();
    var stickyTop=76;
    var visibleTop=Math.max(stickyTop,rect.top);
    var available=Math.max(360,window.innerHeight-visibleTop-12);
    rail.style.setProperty('--exam-rail-height',available+'px');
  }
  function scheduleAuthoringRailSync(){
    if(railFrame)return;
    railFrame=requestAnimationFrame(function(){railFrame=0;syncAuthoringRail();});
  }

  async function init() {
    if(!window.sb||!daKetNoi())return;
    var profile=await yeuCauDangNhap();if(!profile)return;
    state.profile=profile;
    state.portalMembership=await loadPortalManager(profile);
    state.portal=state.portalMembership&&state.portalMembership.portal||null;
    var bankAccess=bankAccessFor(profile);
    if(!bankAccess.canUse){location.href=state.portal?'thi?portal='+encodeURIComponent(state.portal.slug):'luyen-de';return;}
    if(portalSlug()&&!state.portal){location.href='thi?portal='+encodeURIComponent(portalSlug());return;}
    if(state.portal){
      document.body.classList.add('portal-authoring');
      el('examWorkspaceLabel').textContent='Không gian '+(state.portal.short_name||state.portal.name);
      el('examWorkspaceTitle').textContent='Soạn thảo';
      el('examPortalBack').hidden=false;el('examPortalBack').href='thi?portal='+encodeURIComponent(state.portal.slug)+'#manage';
      document.title='Soạn thảo · '+(state.portal.short_name||state.portal.name);
      var analyticsTab=document.querySelector('[data-tab="analytics"]');if(analyticsTab)analyticsTab.hidden=true;
    }
    if(state.portal){
      var analyticsTab=document.querySelector('[data-tab="analytics"]');
      if(analyticsTab)analyticsTab.hidden=true;
    }
    var classQuery=sb.from('classes').select('id,name,is_specialized,teacher_id,co_teacher_id,portal_id');
    classQuery=state.portal?classQuery.eq('portal_id',state.portal.id):classQuery.is('portal_id',null);
    var classes=await classQuery.order('grade').order('name');
    if(classes.error)throw classes.error;
    state.classes=classes.data||[];
    if(profile.role!=='admin'&&!state.portal){
      state.classes=state.classes.filter(function(c){return c.teacher_id===profile.id||c.co_teacher_id===profile.id;});
    }
    el('kpiClasses').textContent=state.classes.length;
    bankConfigureAccess(profile);
    if(!bankAccess.canAdmin){
      el('kpiExams').textContent='—';el('kpiQuestions').textContent='—';el('kpiAttempts').textContent='—';
      return;
    }
    var engineSetting=await sb.from('app_settings').select('value').eq('key','latex_engine_default').maybeSingle();
    if(!engineSetting.error&&engineSetting.data&&['pdflatex','xelatex','lualatex'].indexOf(engineSetting.data.value)>=0)state.pdfEngine=engineSetting.data.value;
    if(typeof vmTaiMoiTruongTex==='function')vmTaiMoiTruongTex();
    el('exLop').innerHTML='<option value="">Mọi lớp</option>'+state.classes.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+(c.is_specialized?' · Chuyên':'')+'</option>';}).join('');
    el('libraryClass').innerHTML=classOptions(true);el('statClass').innerHTML=classOptions(false);
    await loadExams();
    if(state.portal){el('kpiAttempts').textContent='Riêng';}else{var attempts=await sb.from('attempts').select('id',{count:'exact',head:true}).not('exam_id','is',null).not('submitted_at','is',null);el('kpiAttempts').textContent=attempts.count==null?'—':attempts.count;}
    el('exLatex').addEventListener('input',function(){state.templateKey='custom';schedulePreview();});
    el('exTitle').addEventListener('input',schedulePreview);el('exEssayPrompt').addEventListener('input',schedulePreview);
    var queryParams=new URLSearchParams(location.search);
    var requestedTemplate=queryParams.get('template');
    var requestedTab=queryParams.get('tab');
    var requestedState=queryParams.get('state');
    if(requestedTemplate&&TEMPLATES[requestedTemplate])applyTemplate(requestedTemplate);
    else if(!requestedTab||requestedTab==='compose')applyTemplate('worksheet-mixed');
    if(['compose','bank','library','analytics'].indexOf(requestedTab)>=0)switchTab(requestedTab);
    if(requestedTab==='library'&&['published','draft'].indexOf(requestedState)>=0){el('libraryState').value=requestedState;renderLibrary();}
    renderPreview(false);
  }

  window.VMExamAdmin={switchTab:switchTab,switchPreview:switchPreview,applyTemplate:applyTemplate,insertSnippet:insertSnippet,formatSource:formatSource,renderPreview:renderPreview,updateExamType:updateExamType,saveExam:saveExam,editExam:editExam,resetForm:resetForm,deleteExam:deleteExam,toggleSolutionPdf:toggleSolutionPdf,renderLibrary:renderLibrary,loadAnalyticsOptions:loadAnalyticsOptions,loadAnalytics:loadAnalytics,openAnalytics:openAnalytics,compilePdf:compilePdf,closePdf:closePdf,openBankFromEditor:openBankFromEditor,bankImportEditorSource:bankImportEditorSource,bankSendPreviewToEditor:bankSendPreviewToEditor,bankSwitchPreview:bankSwitchPreview,bankCompilePreviewPdf:bankCompilePreviewPdf,bankClosePreview:bankClosePreview,bankOpenLocalPreview:bankOpenLocalPreview,bankOpenSearchPreview:bankOpenSearchPreview,bankOpenSourcePreview:bankOpenSourcePreview,bankOpenExamPreview:bankOpenExamPreview,bankFocusImport:bankFocusImport,bankNewSeed:bankNewSeed,bankAddBlueprintRow:bankAddBlueprintRow,bankRemoveBlueprintRow:bankRemoveBlueprintRow,bankUpdateBlueprintTotal:bankUpdateBlueprintTotal,bankSelectFiles:bankSelectFiles,bankImportAdminPackage:bankImportAdminPackage,bankUpdateId:bankUpdateId,bankApplyBulkIds:bankApplyBulkIds,bankLoadTaxonomyCatalog:bankLoadTaxonomyCatalog,bankChooseTaxonomy:bankChooseTaxonomy,bankUpdateTaxonomyPreview:bankUpdateTaxonomyPreview,bankToggleQuestionSelection:bankToggleQuestionSelection,bankSelectMissingIds:bankSelectMissingIds,bankClearSelection:bankClearSelection,bankApplyClassification:bankApplyClassification,bankShowMore:bankShowMore,bankImport:bankImport,bankLoadStats:bankLoadStats,bankSearch:bankSearch,bankGenerateExam:bankGenerateExam,bankLoadSourceCatalog:bankLoadSourceCatalog,bankChooseSourceExam:bankChooseSourceExam,bankAssignSourceExam:bankAssignSourceExam,_templates:TEMPLATES,_kindOf:kindOf,_normalizeSolutionParagraphs:normalizeSolutionParagraphs,_syncAuthoringRail:syncAuthoringRail,_bankConfigureAccess:bankConfigureAccess,_bankAccessFor:bankAccessFor,_bankRefreshQuestion:bankRefreshQuestion,_bankCollectBlueprint:bankCollectBlueprint,_bankState:state.bank};
  window.addEventListener('resize',scheduleAuthoringRailSync,{passive:true});
  window.addEventListener('scroll',scheduleAuthoringRailSync,{passive:true});
  document.addEventListener('DOMContentLoaded',function(){syncAuthoringRail();init().catch(function(error){toast('Không khởi tạo được trình soạn thảo: '+error.message,'err');});});
})();
