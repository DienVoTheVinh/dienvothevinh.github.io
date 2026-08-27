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
      sourceCatalogOffset: 0,
      sourceCatalogPageSize: 50,
      sourceCatalogFilterKey: '',
      sourceCatalogResultTotal: 0,
      sourceCatalogHasMore: false,
      sourceCategory: '',
      sourceOrigin: '',
      sourceItems: [],
      repositoryItems: [],
      repositoryLoaded: false,
      repositoryLoading: false,
      repositoryOffset: 0,
      repositoryPageSize: 25,
      repositoryFilterKey: '',
      repositoryResultTotal: 0,
      repositoryHasMore: false,
      repositoryRequestToken: 0,
      searchItems: [],
      selectedSourceId: null,
      selectedSourceMode: 'assign',
      sourceAssignTrigger: null,
      sourceAssignBusy: false,
      taxonomyCatalog: [],
      taxonomyCatalogLoaded: false,
      taxonomyFacets: [],
      taxonomyFacetsLoaded: false,
      sourceCatalogTotal: null,
      searchTotal: null,
      inventory: null,
      inventoryLoaded: false,
      matrixFilters: { status: 'active' },
      matrixRequestToken: 0,
      importMode: 'topic_pack',
      activeView: 'overview',
      manageMode: 'questions',
      taxonomyBrowserQuery: '',
      blueprintSeq: 1,
      generationDraft: null,
      access: {
        canUse: false, canReport: false, canImport: false,
        canDownloadTex: false, canManage: false, canManageIdSchema: false, canAdmin: false,
        source: 'none'
      },
      preview: {
        title: '', questions: [], showAnswers: false, showSolutions: false,
        editableSource: '', fullSource: '', editorMode: 'append', pdfUrl: '',
        mode: 'html', requestToken: 0, historyActive: false, fullscreen: false,
        sidebarOpen: false, sidebarQuery: '', activeKind: '', activeId: '',
        targetType: '', targetId: '', documentId: '', examId: '',
        pendingIssue: null, adminIssue: null
      }
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
    if (!root) return;
    if (typeof window.renderToanTrong === 'function') { window.renderToanTrong(root); return; }
    if (!window.renderMathInElement) return;
    window.renderMathInElement(root, { delimiters: [
      {left:'$$',right:'$$',display:true}, {left:'\\[',right:'\\]',display:true},
      {left:'$',right:'$',display:false}, {left:'\\(',right:'\\)',display:false}
    ], macros:{
      '\\hoac':'\\left[\\begin{aligned}#1\\end{aligned}\\right.',
      '\\heva':'\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
      '\\N':'\\mathbb{N}','\\Z':'\\mathbb{Z}','\\Q':'\\mathbb{Q}',
      '\\R':'\\mathbb{R}','\\C':'\\mathbb{C}','\\vect':'\\overrightarrow{#1}'
    }, throwOnError:false, strict:'ignore', trust:false });
  }
  function renderLatexFragment(value, options) {
    if (typeof window.vmLatexFragmentRaHTML === 'function') return window.vmLatexFragmentRaHTML(value, options || {});
    return latexRaHTML(value || '');
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
      .select('member_role,portal_only,portal:exam_portals!inner(id,slug,name,short_name,is_active,experience_mode)')
      .eq('user_id', profile.id).eq('portal.slug', slug).maybeSingle();
    var data = membership.data;
    if ((!data || !data.portal) && profile.role === 'admin') {
      var portal = await sb.from('exam_portals').select('id,slug,name,short_name,is_active,experience_mode').eq('slug', slug).maybeSingle();
      if (portal.data) data = {member_role:'owner',portal_only:false,portal:portal.data};
    }
    if (!data || !data.portal || !data.portal.is_active || data.portal.experience_mode !== 'exam_only' || ['owner','manager'].indexOf(data.member_role) < 0) return null;
    return data;
  }

  function switchTab(name) {
    if (name === 'bank' && !state.bank.access.canUse) return;
    document.querySelectorAll('.exam-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.exam-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    if (name === 'library') renderLibrary();
    if (name === 'analytics' && el('statClass').value) loadAnalyticsOptions();
    if (name === 'bank') {
      var requestedView=bankViewFromLocation();
      bankSetView(requestedView||state.bank.activeView,{history:requestedView?'none':'replace',normalizeHash:true,scroll:false});
      if (state.bank.access.canAdmin && !state.bank.statsLoaded) bankLoadStats(true);
      if (state.bank.access.canAdmin && state.bank.activeView === 'manage' && state.bank.manageMode === 'sources' && !state.bank.repositoryLoaded) bankLoadRepository();
      if (state.bank.access.canUse && !state.bank.sourceCatalogLoaded) bankLoadSourceCatalog();
    }
  }

  function bankWriteWorkspaceTab(name,mode) {
    if(!window.history||typeof history.pushState!=='function')return;
    var url=new URL(location.href);
    url.searchParams.set('tab',name);
    if(name!=='bank'){
      url.searchParams.delete('preview');
      url.hash='';
    }
    var next=url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash;
    var nextState=Object.assign({},history.state||{},name!=='bank'?{vmBankPreview:false}:{});
    if(mode==='replace')history.replaceState(nextState,'',next);
    else history.pushState(nextState,'',next);
  }

  function bankSyncWorkspaceFromLocation() {
    var params=new URLSearchParams(location.search);
    if(params.get('preview')!=='bank'&&state.bank.preview.historyActive)bankClosePreview({fromHistory:true});
    var requested=bankViewFromLocation()?'bank':params.get('tab');
    if(['compose','bank','library','analytics'].indexOf(requested)<0)return;
    if(requested==='bank'&&!state.bank.access.canUse)return;
    switchTab(requested);
    if(requested==='bank')bankSyncViewFromLocation();
  }

  function bankViewFromLocation() {
    var match=/^#bank-(overview|create|import|repository|manage)$/.exec(String(location.hash||''));
    return match ? match[1] : '';
  }

  function bankAllowedView(name) {
    if(name==='repository')return state.bank.access.canAdmin?'manage':'overview';
    var allowed=['overview','create','manage'];
    if(state.bank.access.canImport)allowed.push('import');
    return allowed.indexOf(name)>=0?name:'overview';
  }

  function bankWriteViewHash(name,mode) {
    if(!window.history||typeof history.pushState!=='function')return;
    var hash='#bank-'+name;
    if(location.hash===hash)return;
    if(mode==='replace')history.replaceState(history.state,'',hash);
    else history.pushState(history.state,'',hash);
  }

  function bankWorkspaceTop() {
    var node=el('bankWorkspaceNav'),top=0;
    while(node){top+=Number(node.offsetTop||0);node=node.offsetParent;}
    var gap=window.innerWidth<=760?8:72;
    return Math.max(0,top-gap);
  }

  function bankSetView(name,options) {
    if(!state.bank.access.canUse)return 'overview';
    options=options||{};
    var requested=String(name||'overview'),key=bankAllowedView(requested);
    state.bank.activeView=key;
    document.querySelectorAll('[data-bank-zone]').forEach(function(zone){
      var visible=zone.dataset.bankZone===key&&(zone.dataset.bankZone!=='import'||state.bank.access.canImport);
      zone.hidden=!visible;
      zone.classList.toggle('active',visible);
      zone.setAttribute('aria-hidden',visible?'false':'true');
    });
    document.querySelectorAll('[data-bank-zone-nav]').forEach(function(button){
      var selected=button.dataset.bankZoneNav===key;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',selected?'true':'false');
      button.tabIndex=selected?0:-1;
    });
    var historyMode=options.history||'none';
    if(options.normalizeHash&&requested!==key&&bankViewFromLocation())historyMode='replace';
    if(historyMode!=='none')bankWriteViewHash(key,historyMode);
    if(options.scroll!==false){
      requestAnimationFrame(function(){
        var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({top:bankWorkspaceTop(),behavior:reduced?'auto':'smooth'});
      });
    }
    if(key==='manage')bankSetManageMode(requested==='repository'?'sources':state.bank.manageMode,{load:true});
    return key;
  }

  function bankScrollZone(name) {
    if(name==='manage')state.bank.manageMode='questions';
    if(name==='repository'&&state.bank.access.canAdmin)state.bank.manageMode='sources';
    return bankSetView(name,{history:'push',normalizeHash:true,scroll:true});
  }

  function bankSetManageMode(mode,options) {
    options=options||{};
    var requested=String(mode||'questions');
    var key=requested==='sources'&&state.bank.access.canAdmin?'sources':'questions';
    state.bank.manageMode=key;
    var questionsPane=el('bankManageQuestionsPane'),sourcesPane=el('bankManageSourcesPane');
    var questionsTab=el('bankManageQuestionsTab'),sourcesTab=el('bankManageSourcesTab');
    if(questionsPane){questionsPane.hidden=key!=='questions';questionsPane.classList.toggle('active',key==='questions');}
    if(sourcesPane){sourcesPane.hidden=key!=='sources';sourcesPane.classList.toggle('active',key==='sources');}
    [[questionsTab,'questions'],[sourcesTab,'sources']].forEach(function(pair){
      var button=pair[0],selected=pair[1]===key;if(!button)return;
      button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected?'true':'false');button.tabIndex=selected?0:-1;
    });
    if(options.load!==false){
      if(key==='sources'&&!state.bank.repositoryLoaded)bankLoadRepository();
      if(key==='questions')bankLoadMatrix(state.bank.matrixFilters||{status:'active'},true);
    }
    return key;
  }

  function bankHandleViewNavigationKey(event) {
    if(['ArrowLeft','ArrowRight','Home','End'].indexOf(event.key)<0)return;
    var buttons=Array.from(document.querySelectorAll('[data-bank-zone-nav]')).filter(function(button){return !button.hidden;});
    if(!buttons.length)return;
    var current=Math.max(0,buttons.indexOf(document.activeElement)),next=current;
    if(event.key==='Home')next=0;
    else if(event.key==='End')next=buttons.length-1;
    else if(event.key==='ArrowRight')next=(current+1)%buttons.length;
    else next=(current-1+buttons.length)%buttons.length;
    event.preventDefault();buttons[next].focus();buttons[next].click();
  }

  function bankSyncViewFromLocation() {
    var requested=bankViewFromLocation();
    if(!requested||!state.bank.access.canUse)return;
    bankSetView(requested,{history:'none',normalizeHash:true,scroll:!!(el('panel-bank')&&el('panel-bank').classList.contains('active'))});
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
    var fullSource = q._vmFullSource || options.fullSource || '';
    var kind = kindOf(q);
    var choices = q.choices || [];
    var body = '<article class="exam-question" data-kind="' + kind + '"><div class="exam-question-title"><span class="exam-question-no">Câu ' + number + '.</span><div>' + renderLatexFragment(q.content_latex || '', {showSolutions:false,fullSource:fullSource}) + '</div></div>';
    if (kind === 'mc') {
      body += '<div class="exam-choice-grid">' + choices.map(function (c) { return '<div class="exam-choice' + (showAnswers && c.correct?' correct':'') + '"><b>' + esc(c.key) + '.</b> ' + renderLatexFragment(c.latex || '', {showSolutions:false,fullSource:fullSource}) + '</div>'; }).join('') + '</div>';
    } else if (kind === 'tf') {
      body += '<div class="exam-tf-grid">' + choices.map(function (c) { return '<div class="exam-tf-row"><div><b>' + esc(String(c.key).toLowerCase()) + ')</b> ' + renderLatexFragment(c.latex || '', {showSolutions:false,fullSource:fullSource}) + '</div>' + (showAnswers?'<span class="exam-tf-answer">' + (c.correct?'ĐÚNG':'SAI') + '</span>':'') + '</div>'; }).join('') + '</div>';
    } else {
      body += shortAnswerSheet(showAnswers ? ((choices[0] && choices[0].latex) || '') : '');
    }
    if (showSolutions && q.solution_latex) body += '<div class="exam-solution"><b>Lời giải:</b> ' + renderLatexFragment(q.solution_latex, {showSolutions:true,fullSource:fullSource}) + '</div>';
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
      paper += '<div class="exam-section-heading">Phần tự luận</div><div style="line-height:1.75">' + renderLatexFragment(el('exEssayPrompt').value || 'Chưa nhập đề bài tự luận.', {showSolutions:true,fullSource:source}) + '</div>';
    } else {
      var sections = [
        {kind:'mc', title:'Phần I. Trắc nghiệm khách quan 4 phương án'},
        {kind:'tf', title:'Phần II. Trắc nghiệm Đúng/Sai — 4 ý'},
        {kind:'short', title:'Phần III. Trắc nghiệm trả lời ngắn'}
      ];
      sections.forEach(function (section) {
        var qs = state.parsed.filter(function (q) { return kindOf(q) === section.kind; });
        if (!qs.length) return;
        paper += '<div class="exam-section-heading">' + section.title + '</div>';
        qs.forEach(function (q, index) { paper += renderQuestion(q, index + 1, {fullSource:source}); });
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
    bankRenderPreviewSidebar();
    var qCount = state.exams.reduce(function (sum,x) { return sum + (x.exam_questions&&x.exam_questions[0]?x.exam_questions[0].count:0); },0);
    el('kpiExams').textContent = state.exams.length; el('kpiQuestions').textContent = qCount;
    renderLibrary(); fillAnalyticsExamOptions();
  }

  async function bankLoadExamCatalog(silent) {
    if (!state.bank.access.canUse || !window.sb || typeof window.sb.rpc !== 'function') return;
    try {
      var response = await sb.rpc('vm_bank_exam_catalog',{p_limit:120});
      if (response.error) throw response.error;
      var data = response.data || {}, rows = Array.isArray(data) ? data : (data.items || []);
      state.exams = rows.map(function (item) {
        var count = Math.max(0,Number(item.question_count || 0));
        return {
          id:item.id,
          title:item.title || 'Đề đã tạo',
          duration_minutes:Number(item.duration_minutes || 0),
          published:!!item.published,
          class_id:item.class_id || null,
          de_type:item.de_type || 'mc',
          bank_generated:!!item.bank_generated,
          source_bank_document_id:item.source_bank_document_id || null,
          classes:item.class_name ? {name:item.class_name} : null,
          exam_questions:[{count:count}]
        };
      });
      bankRenderPreviewSidebar();
      var questionCount = state.exams.reduce(function (sum,exam) {
        return sum + Number(exam.exam_questions[0].count || 0);
      },0);
      if (el('kpiExams')) el('kpiExams').textContent = state.exams.length;
      if (el('kpiQuestions')) el('kpiQuestions').textContent = questionCount;
    } catch (error) {
      state.exams = [];
      bankRenderPreviewSidebar();
      if (!silent && !bankRpcMissing(error)) toast('Chưa tải được danh sách đề đã tạo.','err');
    }
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

  // Nguon ngan hang cu thuong mo tep dap an phu de in o mot tai lieu khac.
  // Khi VinhMath boc mot manh de thanh PDF xem truoc, tep/phu luc do khong
  // duoc su dung va dich vu bien dich khong co thu muc `ans/`. Chi bo cac moc
  // quan ly tep o nhanh fragment; tai lieu day du van duoc giu nguyen ben duoi.
  function normalizeLegacyPdfFragment(raw) {
    return String(raw || '')
      .replace(/\\Opensolutionfile\s*\{[^{}]*\}\s*(?:\[[^\]]*\])?/g, '')
      .replace(/\\Closesolutionfile\s*\{[^{}]*\}/g, '');
  }

  async function buildPdfSource(rawOverride, titleOverride, typeOverride) {
    var hasOverride=arguments.length>0;
    var raw=hasOverride?String(rawOverride||'').trim():el('exLatex').value.trim();
    var title=hasOverride?(String(titleOverride||'').trim()||'Tài liệu VinhMath'):(el('exTitle').value.trim()||'Tài liệu VinhMath');
    var type=hasOverride?(typeOverride||'thpt'):el('exType').value;
    if(!hasOverride&&type==='essay') raw=el('exEssayPrompt').value.trim();
    if(!raw) throw new Error('Chưa có nội dung để biên dịch.');
    if(/\\documentclass(?:\[[^\]]*\])?\{/.test(raw)) {
      var complete=typeof vmChenPreambleMoiTruongTex==='function'?vmChenPreambleMoiTruongTex(raw):raw;
      return typeof vmChenLegacyTexCompatPreamble==='function'?vmChenLegacyTexCompatPreamble(complete):complete;
    }
    raw=normalizeLegacyPdfFragment(raw);
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
    var legacy=typeof vmLegacyTexCompatPreamble==='function'?vmLegacyTexCompatPreamble(raw):'';
    var optionalPackages='';
    if(/\\tkzTab(?:Init|Line|Var|Val|Ima|Slope|Setup)\b/.test(raw)) optionalPackages+='\\usepackage{tkz-tab}\n';
    if(/\\begin\{forest\}/.test(raw)) optionalPackages+='\\usepackage{forest}\n';
    if(/\\begin\{circuitikz\}/.test(raw)) optionalPackages+='\\usepackage{circuitikz}\n';
    if(/\\faCube\b/.test(raw)) optionalPackages+='\\usepackage{fontawesome5}\n';
    if(/\\begin\{axis\}|\\addplot\b/.test(raw)) optionalPackages+='\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n';
    if(/\\includegraphics\b/.test(raw)) optionalPackages+='\\usepackage{graphicx}\n';
    if(/\\begin\{longtable\}/.test(raw)) optionalPackages+='\\usepackage{longtable}\n';
    if(/\\begin\{tabularx\}/.test(raw)) optionalPackages+='\\usepackage{tabularx}\n';
    return '\\begin{filecontents*}{ex_test.sty}\n'+sty+'\n\\end{filecontents*}\n'+
      '\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T5]{fontenc}\n\\usepackage[vietnamese]{babel}\n\\usepackage{amsmath,amssymb,mathtools}\n\\usepackage{geometry}\n\\geometry{top=1.6cm,bottom=1.6cm,left=1.8cm,right=1.8cm}\n\\usepackage{tikz}\n\\usetikzlibrary{calc,intersections,angles,quotes,arrows,arrows.meta,patterns,positioning,shapes.geometric,decorations.pathmorphing,decorations.pathreplacing,decorations.markings,backgrounds,fit,matrix}\n\\usepackage[most]{tcolorbox}\n\\usepackage{enumitem,multicol}\n'+optionalPackages+'\\usepackage[loigiai]{ex_test}\n'+
      '\\providecommand{\\vmTFItem}[2]{\\par\\noindent\\hangindent=1.9em\\hangafter=1\\textbf{#1)}\\ #2\\par}\n'+
      '\\providecommand{\\choiceTF}[5][]{}\n'+
      '\\renewcommand{\\choiceTF}[5][]{\\begingroup\\let\\True\\relax\\vmTFItem{a}{#2}\\vmTFItem{b}{#3}\\vmTFItem{c}{#4}\\vmTFItem{d}{#5}\\endgroup}\n'+
      env+'\n'+legacy+'\n\\begin{document}\n\\shorthandoff{"}\n\\begin{center}{\\Large\\bfseries '+escapeTex(title)+'}\\end{center}\n\\vspace{0.3cm}\n'+raw+'\n\\end{document}';
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
    var documentIndex = Number(item._bankDocumentIndex);
    var sourceDocument = Number.isInteger(documentIndex) && state.bank.documents[documentIndex] || null;
    var fullSource = String(item._vmFullSource || input && input._vmFullSource || sourceDocument && sourceDocument.text || options.fullSource || options.editableSource || '');
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
      choices: choices,
      report_sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) :
        (Number.isFinite(Number(item.source_ordinal)) ? Number(item.source_ordinal) : null)
    };
    if (state.bank.access.canAdmin) {
      normalizedQuestion._vmFullSource = fullSource;
      normalizedQuestion.item_id = String(item.item_id || item.id || '').trim();
      normalizedQuestion.display_id = String(item.legacy_code || item.question_id || '').trim();
      normalizedQuestion.technical_id = String(item.stable_id || '').trim();
      normalizedQuestion.classification_status = String(item.status || '').trim();
    }
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
        var reportId = state.bank.access.canAdmin ? String(question.item_id || '') : '';
        var reportSort = Number.isFinite(Number(question.report_sort)) ? Number(question.report_sort) : number;
        paper += '<section class="bank-preview-question-block" id="bankPreviewQuestion-'+number+'" data-bank-preview-question-number="'+number+'" data-bank-preview-item-id="'+esc(reportId)+'" data-bank-preview-report-sort="'+reportSort+'">';
        if (state.bank.access.canReport && !state.bank.access.canAdmin && state.bank.preview.targetType) {
          paper += '<div class="bank-preview-question-actions"><button class="bank-preview-question-report" type="button" data-bank-preview-report-id="'+esc(reportId)+'" data-bank-preview-report-number="'+number+'" data-bank-preview-report-sort="'+reportSort+'" aria-label="Báo lỗi ở câu '+number+'"><span aria-hidden="true">⚑</span> Báo lỗi</button></div>';
        }
        if (state.bank.access.canAdmin) {
          var pendingId = !question.display_id;
          var identityText = pendingId ? 'Chờ phân loại ID · chưa dùng để tạo đề' : 'Mã phân loại · '+question.display_id;
          var identityTitle = pendingId
            ? 'Câu đang ở khu chờ duyệt; mã hệ thống vẫn được giữ nhưng câu không tham gia tạo đề.'
            : (question.technical_id ? 'Mã hệ thống: '+question.technical_id : '');
          paper += '<div class="bank-preview-question-id'+(pendingId?' pending':'')+'" aria-label="Mã phân loại câu hỏi"'+(identityTitle?' title="'+esc(identityTitle)+'"':'')+'>'+esc(identityText)+'</div>';
        }
        paper += renderQuestion(question, number, {showAnswers:options.showAnswers,showSolutions:options.showSolutions,fullSource:question._vmFullSource || options.fullSource});
        paper += '</section>';
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

  function bankBindPreviewQuestionReports(pane) {
    if (!pane) return;
    pane.querySelectorAll('[data-bank-preview-report-number]').forEach(function (button) {
      button.addEventListener('click',function () {
        if (window.VMExamAdmin && typeof window.VMExamAdmin.bankOpenIssueReport === 'function') {
          window.VMExamAdmin.bankOpenIssueReport(
            button.dataset.bankPreviewReportId || '',
            Number(button.dataset.bankPreviewReportNumber || 0),
            Number(button.dataset.bankPreviewReportSort || 0)
          );
        }
      });
    });
  }

  function bankPreviewCandidates() {
    var seen = Object.create(null), rows = [];
    (state.bank.sourceItems || []).forEach(function (item) {
      var id = String(item && item.id || '').trim(), key = 'source:'+id;
      if (!id || seen[key]) return;
      seen[key] = true;
      var meta = [];
      if (item.grade) meta.push('Khối '+item.grade);
      if (item.exam_year) meta.push(String(item.exam_year));
      if (Number(item.question_count || 0)) meta.push(Number(item.question_count)+' câu');
      rows.push({key:key,kind:'source',id:id,title:String(item.title || 'Đề nguồn'),meta:meta.join(' · '),badge:String(item.source_origin || '') === 'authored' ? 'Tự biên' : 'Đề nguồn'});
    });
    (state.exams || []).filter(function (exam) {
      return !!(exam && (exam.bank_generated || exam.source_bank_document_id));
    }).forEach(function (exam) {
      var id = String(exam.id || '').trim(), key = 'exam:'+id;
      if (!id || seen[key]) return;
      seen[key] = true;
      var count = exam.exam_questions && exam.exam_questions[0] ? Number(exam.exam_questions[0].count || 0) : 0;
      rows.push({key:key,kind:'exam',id:id,title:String(exam.title || 'Đề đã tạo'),meta:(count ? count+' câu · ' : '')+(exam.published ? 'Đang mở' : 'Bản nháp'),badge:'Đã tạo'});
    });
    return rows;
  }

  function bankPreviewIsMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
  }

  function bankRenderPreviewSidebar() {
    var list = el('bankPreviewSourceList'), search = el('bankPreviewSourceSearch'), count = el('bankPreviewSourceCount');
    if (!list) return;
    var query = String(state.bank.preview.sidebarQuery || '').trim().toLowerCase();
    var all = bankPreviewCandidates();
    var rows = all.filter(function (item) {
      return !query || (item.title+' '+item.meta+' '+item.badge).toLowerCase().indexOf(query) >= 0;
    });
    if (search && search.value !== state.bank.preview.sidebarQuery) search.value = state.bank.preview.sidebarQuery;
    if (count) count.textContent = rows.length+(query ? ' / '+all.length : '')+' đề';
    if (!rows.length) {
      list.innerHTML = '<div class="bank-preview-source-empty"><span aria-hidden="true">⌕</span><strong>'+(query?'Không tìm thấy đề':'Chưa có đề khác')+'</strong><small>'+(query?'Thử từ khóa ngắn hơn.':'Danh sách sẽ hiện sau khi tải kho đề.')+'</small></div>';
      return;
    }
    list.innerHTML = rows.map(function (item) {
      var active = state.bank.preview.activeKind === item.kind && String(state.bank.preview.activeId) === item.id;
      return '<button type="button" role="listitem" class="bank-preview-source-item'+(active?' active':'')+'" data-bank-preview-switch-kind="'+esc(item.kind)+'" data-bank-preview-switch-id="'+esc(item.id)+'" aria-current="'+(active?'true':'false')+'"><span class="bank-preview-source-badge">'+esc(item.badge)+'</span><strong>'+esc(item.title)+'</strong><small>'+esc(item.meta || 'Mở bản xem trước')+'</small></button>';
    }).join('');
    list.querySelectorAll('[data-bank-preview-switch-kind]').forEach(function (button) {
      button.addEventListener('click',function () {
        bankSwitchPreviewSource(button.dataset.bankPreviewSwitchKind,button.dataset.bankPreviewSwitchId);
      });
    });
    var activeButton = list.querySelector('.bank-preview-source-item.active');
    if (activeButton && state.bank.preview.fullscreen) activeButton.scrollIntoView({block:'nearest'});
  }

  function bankSyncPreviewLayout() {
    var dialog = el('bankPreviewDialog'), button = el('bankPreviewFullscreenButton'), sidebar = el('bankPreviewSidebar'), toggle = el('bankPreviewSourcesToggle');
    if (!dialog) return;
    dialog.classList.toggle('is-fullscreen',!!state.bank.preview.fullscreen);
    dialog.classList.toggle('sidebar-open',!!state.bank.preview.sidebarOpen);
    if (button) {
      button.setAttribute('aria-pressed',state.bank.preview.fullscreen?'true':'false');
      button.setAttribute('aria-label',state.bank.preview.fullscreen?'Thu gọn cửa sổ xem trước':'Mở toàn màn hình');
      var label = button.querySelector('[data-bank-fullscreen-label]');
      if (label) label.textContent = state.bank.preview.fullscreen ? 'Thu gọn' : 'Toàn màn hình';
    }
    if (toggle) {
      toggle.hidden = !state.bank.preview.fullscreen;
      toggle.setAttribute('aria-expanded',state.bank.preview.sidebarOpen?'true':'false');
    }
    if (sidebar) {
      var visible = state.bank.preview.fullscreen && (!bankPreviewIsMobile() || state.bank.preview.sidebarOpen);
      sidebar.setAttribute('aria-hidden',visible?'false':'true');
    }
  }

  function bankTogglePreviewFullscreen(force) {
    var next = typeof force === 'boolean' ? force : !state.bank.preview.fullscreen;
    state.bank.preview.fullscreen = next;
    if (!next) state.bank.preview.sidebarOpen = false;
    if (next && bankPreviewIsMobile()) state.bank.preview.sidebarOpen = false;
    bankRenderPreviewSidebar();
    bankSyncPreviewLayout();
  }

  function bankTogglePreviewSidebar(force) {
    if (!state.bank.preview.fullscreen) return;
    state.bank.preview.sidebarOpen = typeof force === 'boolean' ? force : !state.bank.preview.sidebarOpen;
    bankSyncPreviewLayout();
    if (state.bank.preview.sidebarOpen) {
      var search = el('bankPreviewSourceSearch');
      if (search) window.setTimeout(function () { search.focus(); },0);
    }
  }

  function bankFilterPreviewSources(value) {
    state.bank.preview.sidebarQuery = String(value || '');
    bankRenderPreviewSidebar();
  }

  function bankSwitchPreviewSource(kind, id) {
    if (!state.bank.access.canUse || !id) return;
    state.bank.preview.sidebarOpen = false;
    bankSyncPreviewLayout();
    if (kind === 'exam') bankOpenExamPreview(id);
    else bankOpenSourcePreview(id);
  }

  function bankSetPreviewActive(kind, id) {
    state.bank.preview.activeKind = kind || '';
    state.bank.preview.activeId = id == null ? '' : String(id);
    bankRenderPreviewSidebar();
  }

  function bankShowPreviewDialog() {
    var dialog = el('bankPreviewDialog');
    if (!dialog) return;
    var url = new URL(location.href);
    if (!state.bank.preview.historyActive && url.searchParams.get('preview') !== 'bank') {
      url.searchParams.set('preview','bank');
      var next = url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash;
      history.pushState(Object.assign({},history.state||{},{vmBankPreview:true}),'',next);
    }
    state.bank.preview.historyActive = true;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open','');
    bankRenderPreviewSidebar();
    bankSyncPreviewLayout();
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

  function bankSetPreviewTarget(context) {
    context = context || {};
    var preview = state.bank.preview;
    preview.targetType = String(context.targetType || '');
    preview.targetId = String(context.targetId || '');
    preview.documentId = String(context.documentId || '');
    preview.examId = String(context.examId || '');
    preview.pendingIssue = null;
    preview.adminIssue = null;
    var reportButton = el('bankPreviewReportButton');
    if (reportButton) {
      reportButton.hidden = state.bank.access.canAdmin || !state.bank.access.canReport ||
        ['source_document','exam'].indexOf(preview.targetType) < 0 || !preview.targetId;
    }
    var downloadTexButton = el('bankPreviewDownloadTex');
    if (downloadTexButton) downloadTexButton.hidden = !state.bank.access.canDownloadTex || !preview.documentId;
    if (el('bankPreviewResolveButton')) el('bankPreviewResolveButton').hidden = true;
  }

  function bankOpenPreview(title, rawQuestions, options) {
    options = options || {};
    if (Object.prototype.hasOwnProperty.call(options,'targetContext')) bankSetPreviewTarget(options.targetContext);
    var questions = (rawQuestions || []).map(function (question) {
      return bankNormalizePreviewQuestion(question,options);
    }).filter(function (question) { return !!question.content_latex.trim(); });
    if (!questions.length) throw new Error('Nội dung này chưa có câu hợp lệ để xem trước.');
    state.bank.preview.title = String(title || 'Nội dung ngân hàng đề');
    state.bank.preview.questions = questions;
    state.bank.preview.showAnswers = !!options.showAnswers;
    state.bank.preview.showSolutions = !!options.showSolutions;
    var generatedSource = state.bank.access.canAdmin && options.allowEditor !== false
      ? examSourceFromQuestions(questions,{showAnswers:!!options.showAnswers,showSolutions:!!options.showSolutions}) : '';
    state.bank.preview.editableSource = String(options.editableSource || generatedSource || '');
    state.bank.preview.fullSource = String(options.fullSource || state.bank.preview.editableSource || '');
    state.bank.preview.editorMode = options.editorMode || (questions.length > 1 ? 'replace' : 'append');
    state.bank.preview.requestToken += 1;
    bankResetPreviewPdf();
    el('bankPreviewTitle').textContent = state.bank.preview.title;
    el('bankPreviewHtml').innerHTML = bankPreviewPaper(state.bank.preview.title,questions,{showAnswers:state.bank.preview.showAnswers,showSolutions:state.bank.preview.showSolutions,fullSource:state.bank.preview.fullSource});
    renderMath(el('bankPreviewHtml'));
    bankBindPreviewQuestionReports(el('bankPreviewHtml'));
    el('bankPreviewStatus').textContent = 'HTML tức thời · '+questions.length+' câu';
    if (el('bankPreviewToEditor')) {
      el('bankPreviewToEditor').hidden = !state.bank.access.canAdmin || !state.bank.preview.editableSource;
      el('bankPreviewToEditor').textContent = questions.length > 1 ? '⇢ Mở đề trong Soạn thảo' : '⇢ Đưa câu vào Soạn thảo';
    }
    bankSwitchPreview('html');
    bankShowPreviewDialog();
  }

  function bankRefreshPreviewHtml() {
    var preview = state.bank.preview, pane = el('bankPreviewHtml');
    if (!pane || !preview.questions.length) return;
    pane.innerHTML = bankPreviewPaper(preview.title,preview.questions,{
      showAnswers:preview.showAnswers,
      showSolutions:preview.showSolutions,
      fullSource:preview.fullSource
    });
    renderMath(pane);
    bankBindPreviewQuestionReports(pane);
    if (preview.adminIssue) bankHighlightIssueTarget(preview.adminIssue);
  }

  function bankOpenPreviewLoading(title, targetContext) {
    state.bank.preview.requestToken += 1;
    state.bank.preview.title = String(title || 'Đang tải nội dung');
    state.bank.preview.questions = [];
    state.bank.preview.showAnswers = false;
    state.bank.preview.showSolutions = false;
    state.bank.preview.editableSource = '';
    state.bank.preview.fullSource = '';
    state.bank.preview.editorMode = 'append';
    bankSetPreviewTarget(targetContext);
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

  async function bankLoadRemotePreview(rpcName, args, fallbackTitle, targetContext) {
    if (!state.bank.access.canUse) return;
    var requestToken = bankOpenPreviewLoading(fallbackTitle,targetContext);
    try {
      var response = await sb.rpc(rpcName,args);
      if (requestToken !== state.bank.preview.requestToken) return;
      if (response.error) throw response.error;
      var payload = bankPreviewPayload(response.data);
      bankOpenPreview(payload.title || fallbackTitle,payload.questions,{
        showAnswers:false,
        showSolutions:false,
        targetContext:targetContext
      });
      bankSetServerState(true);
    } catch (error) {
      if (requestToken !== state.bank.preview.requestToken) return;
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      el('bankPreviewHtml').innerHTML = '<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tải được bản xem trước</strong>'+esc(bankSafeError(error))+'</div></div>';
      el('bankPreviewStatus').textContent = 'Không tải được nội dung';
      toast('Chưa tải được bản xem trước.','err');
    }
  }

  function bankAdminPreviewQuestion(question, item) {
    question = Object.assign({}, question || {});
    item = item || {};
    if (!question.type && item.question_type) question.type = item.question_type;
    if (!question.question_type && item.question_type) question.question_type = item.question_type;
    if (!question.content_tex && item.content_latex) question.content_tex = item.content_latex;
    question.stable_id = item.stable_id || question.stable_id || '';
    question.legacy_code = item.legacy_code || question.legacy_code || '';
    question.status = item.status || question.status || '';
    question.item_id = item.id || item.item_id || question.item_id || '';
    if (item.source_ordinal != null) question.source_ordinal = Number(item.source_ordinal);
    if (!question.question_id && item.legacy_code) question.question_id = item.legacy_code;
    if (item.solution_latex != null) question.solution_tex = String(item.solution_latex || '');
    var answer = item.answer && typeof item.answer === 'object' ? item.answer : {};
    if (Array.isArray(question.choices)) {
      var correctIndexes = Array.isArray(answer.correct_indexes) ? answer.correct_indexes.map(Number) : [];
      question.choices = question.choices.map(function (choice, index) {
        var copy = Object.assign({}, choice || {});
        if (correctIndexes.length) copy.correct = correctIndexes.indexOf(index) >= 0;
        return copy;
      });
    }
    if ((question.type === 'short_answer' || question.question_type === 'short_answer') && answer.value != null) {
      question.short_answer = String(answer.value);
    }
    return question;
  }

  function bankAdminDocumentQuestions(payload) {
    var parser = window.VinhMathQuestionBank;
    if (!parser || typeof parser.parseDocument !== 'function') throw new Error('Chưa tải được bộ đọc ngân hàng TeX.');
    var rawTex = String(payload && payload.raw_tex || '');
    var parsedQuestions = [];
    if (rawTex.trim()) {
      try {
        var parsedDocument = parser.parseDocument(rawTex,{sourcePath:String(payload.original_filename || payload.title || 'de-nguon.tex')});
        parsedQuestions = parsedDocument && Array.isArray(parsedDocument.questions) ? parsedDocument.questions : [];
      } catch (ignore) {}
    }
    var items = Array.isArray(payload && payload.items) ? payload.items.slice() : [];
    items.sort(function (a,b) { return Number(a && a.source_ordinal || 0)-Number(b && b.source_ordinal || 0); });
    var count = Math.max(parsedQuestions.length,items.length), questions = [];
    for (var index=0;index<count;index++) {
      var item = items[index] || {};
      var question = parsedQuestions[index] || null;
      if (!question) {
        var itemSource = String(item.canonical_tex || item.raw_tex || '');
        if (itemSource.trim()) {
          try {
            var parsedItem = parser.parseDocument(itemSource,{sourcePath:String(payload.original_filename || payload.title || 'de-nguon.tex')});
            question = parsedItem && parsedItem.questions && parsedItem.questions[0] || null;
          } catch (ignoreItem) {}
        }
      }
      if (question) questions.push(bankAdminPreviewQuestion(question,item));
    }
    var canonicalRows = items.map(function (item) { return String(item.canonical_tex || item.raw_tex || '').trim(); }).filter(Boolean);
    var canonicalSource = canonicalRows.join('\n\n'), rawSource = rawTex.trim();
    var assignedIds = items.map(function (item) { return String(item.legacy_code || '').trim(); }).filter(Boolean);
    var rawHasAssignedIds = assignedIds.every(function (code) { return rawSource.indexOf(code) >= 0; });
    var editableSource = rawSource;
    if (!editableSource || (canonicalRows.length === items.length && assignedIds.length && !rawHasAssignedIds)) editableSource = canonicalSource || rawSource;
    return {questions:questions,editableSource:editableSource};
  }

  async function bankLoadAdminDocumentPreview(documentId, fallbackTitle, targetContext) {
    if (!state.bank.access.canAdmin) return;
    targetContext = targetContext || {targetType:'source_document',targetId:documentId,documentId:documentId};
    var requestToken = bankOpenPreviewLoading(fallbackTitle,targetContext);
    try {
      var response = await sb.rpc('vm_bank_admin_document',{p_document_id:documentId});
      if (requestToken !== state.bank.preview.requestToken) return;
      if (response.error) throw response.error;
      var payload = Array.isArray(response.data) ? (response.data[0] || {}) : (response.data || {});
      var fullPreview = bankAdminDocumentQuestions(payload);
      bankOpenPreview(payload.title || fallbackTitle,fullPreview.questions,{
        showAnswers:true,
        showSolutions:true,
        editableSource:fullPreview.editableSource,
        fullSource:String(payload.raw_tex || fullPreview.editableSource || ''),
        editorMode:'replace',
        targetContext:targetContext
      });
      bankSetServerState(true);
    } catch (error) {
      if (requestToken !== state.bank.preview.requestToken) return;
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      el('bankPreviewHtml').innerHTML = '<div class="exam-empty" style="color:var(--err)"><div><strong>Chưa tải được bản quản trị</strong>'+esc(bankSafeError(error))+'</div></div>';
      el('bankPreviewStatus').textContent = 'Không tải được nội dung đầy đủ';
      toast('Chưa tải được đề nguồn đầy đủ.','err');
    }
  }

  function bankOpenLocalPreview(index) {
    if (!state.bank.access.canImport || !state.bank.items[index]) return;
    bankSetPreviewActive('', '');
    var question = state.bank.items[index];
    var source = state.bank.documents[question._bankDocumentIndex] || {};
    try {
      bankOpenPreview((source.fileName || source.path || 'Tệp TeX')+' · Câu '+(Number(question.source_index||index)+1),[question],{showAnswers:true,showSolutions:true,editableSource:question.canonical_tex||question.raw_tex||'',fullSource:source.text||question.canonical_tex||question.raw_tex||'',targetContext:null});
    } catch (error) { toast(error.message||String(error),'err'); }
  }

  function bankOpenImportPreview() {
    if (!state.bank.access.canImport || !state.bank.items.length) return;
    bankSetPreviewActive('', '');
    var title = String(el('bankImportTitle') && el('bankImportTitle').value || '').trim() || bankDefaultPastedTitle();
    var source = state.bank.items.map(function (question) {
      return question.canonical_tex || question.raw_tex || '';
    }).filter(Boolean).join('\n\n');
    var documentIndexes = Array.from(new Set(state.bank.items.map(function (question) {
      return Number(question && question._bankDocumentIndex);
    }).filter(function (index) {
      return Number.isInteger(index) && state.bank.documents[index];
    })));
    var originalDocument = documentIndexes.length === 1 ? state.bank.documents[documentIndexes[0]] : null;
    var fullSource = String(originalDocument && originalDocument.text || source);
    try {
      bankOpenPreview(title,state.bank.items,{
        showAnswers:true,
        showSolutions:true,
        editableSource:source,
        fullSource:fullSource,
        editorMode:'replace',
        targetContext:null
      });
    } catch (error) { toast(error.message||String(error),'err'); }
  }

  function bankOpenSearchPreview(index) {
    if (!state.bank.access.canUse || !state.bank.searchItems[index]) return;
    bankSetPreviewActive('', '');
    try { bankOpenPreview('Câu tìm thấy trong ngân hàng',[state.bank.searchItems[index]],{showAnswers:false,showSolutions:false,targetContext:null}); }
    catch (error) { toast(error.message||String(error),'err'); }
  }

  function bankOpenSourcePreview(documentId) {
    var item = state.bank.sourceItems.find(function (entry) { return String(entry.id) === String(documentId); });
    bankSetPreviewActive('source',documentId);
    var targetContext={targetType:'source_document',targetId:String(documentId),documentId:String(documentId)};
    if (state.bank.access.canAdmin) return bankLoadAdminDocumentPreview(documentId,item && item.title || 'Đề nguồn',targetContext);
    return bankLoadRemotePreview('vm_bank_source_exam_preview',{p_document_id:documentId},item && item.title || 'Đề nguồn',targetContext);
  }

  function bankOpenExamPreview(examId, title) {
    if (!examId) return;
    var exam = state.exams.find(function (entry) { return String(entry.id) === String(examId); });
    bankSetPreviewActive('exam',examId);
    return bankLoadRemotePreview('vm_bank_exam_preview',{p_exam_id:examId},title || (exam && exam.title) || 'Đề đã tạo',{
      targetType:'exam',targetId:String(examId),examId:String(examId)
    });
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
      var raw = preview.fullSource || examSourceFromQuestions(preview.questions,{showAnswers:preview.showAnswers,showSolutions:preview.showSolutions});
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

  async function bankDownloadPreviewTex() {
    var preview = state.bank.preview;
    if (!state.bank.access.canDownloadTex || !preview.documentId) return;
    var button = el('bankPreviewDownloadTex');
    if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
    try {
      var response = await sb.rpc('vm_bank_download_tex',{p_document_id:preview.documentId});
      if (response.error) throw response.error;
      var payload = Array.isArray(response.data) ? (response.data[0] || {}) : (response.data || {});
      var raw = String(payload.raw_tex || '');
      if (!raw) throw new Error('Nguồn này chưa có nội dung TeX để tải.');
      var filename = String(payload.original_filename || '').trim() || bankPreviewSlug(payload.title || preview.title)+'.tex';
      if (!/\.tex$/i.test(filename)) filename += '.tex';
      var url = URL.createObjectURL(new Blob([raw],{type:'text/x-tex;charset=utf-8'}));
      var link = document.createElement('a');
      link.href = url; link.download = filename; link.hidden = true;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); },0);
      toast('Đã chuẩn bị tệp TeX để tải xuống.','ok');
    } catch (error) {
      if (bankRpcMissing(error)) {
        state.bank.access.canDownloadTex = false;
        document.body.classList.remove('bank-download-tex-mode');
        if (button) button.hidden = true;
      }
      toast('Chưa tải được TeX: '+bankSafeError(error),'err');
    } finally {
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }

  function bankClosePreview(options) {
    options = options || {};
    state.bank.preview.requestToken += 1;
    state.bank.preview.editableSource = '';
    state.bank.preview.fullSource = '';
    state.bank.preview.editorMode = 'append';
    state.bank.preview.fullscreen = false;
    state.bank.preview.sidebarOpen = false;
    state.bank.preview.sidebarQuery = '';
    state.bank.preview.activeKind = '';
    state.bank.preview.activeId = '';
    state.bank.preview.targetType = '';
    state.bank.preview.targetId = '';
    state.bank.preview.documentId = '';
    state.bank.preview.examId = '';
    state.bank.preview.pendingIssue = null;
    state.bank.preview.adminIssue = null;
    if (el('bankPreviewToEditor')) el('bankPreviewToEditor').hidden = true;
    if (el('bankPreviewReportButton')) el('bankPreviewReportButton').hidden = true;
    if (el('bankPreviewResolveButton')) el('bankPreviewResolveButton').hidden = true;
    if (el('bankPreviewDownloadTex')) el('bankPreviewDownloadTex').hidden = true;
    var dialog = el('bankPreviewDialog');
    if (dialog) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
    bankResetPreviewPdf();
    bankSyncPreviewLayout();
    if (!options.fromHistory) {
      var url = new URL(location.href);
      if (url.searchParams.get('preview') === 'bank') {
        url.searchParams.delete('preview');
        var next = url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash;
        history.replaceState(Object.assign({},history.state||{},{vmBankPreview:false}),'',next);
      }
    }
    state.bank.preview.historyActive = false;
  }

  function bankSetupPreviewDialog() {
    var dialog = el('bankPreviewDialog');
    if (!dialog || dialog._bankBound) return;
    dialog._bankBound = true;
    dialog.addEventListener('click',function (event) { if (event.target === dialog) bankClosePreview(); });
    dialog.addEventListener('cancel',function (event) {
      event.preventDefault();
      if (state.bank.preview.sidebarOpen) { bankTogglePreviewSidebar(false); return; }
      if (state.bank.preview.fullscreen) { bankTogglePreviewFullscreen(false); return; }
      bankClosePreview();
    });
  }

  function bankRestoreSourceAssignFocus() {
    var trigger=state.bank.sourceAssignTrigger;
    state.bank.sourceAssignTrigger=null;
    if(trigger&&trigger.isConnected&&typeof trigger.focus==='function'){
      window.setTimeout(function(){trigger.focus({preventScroll:true});},0);
    }
  }

  function bankCloseSourceAssign() {
    if(state.bank.sourceAssignBusy)return;
    var dialog=el('bankSourceAssignDialog');
    if(!dialog)return;
    if(dialog.close&&dialog.open)dialog.close();
    else {dialog.removeAttribute('open');bankRestoreSourceAssignFocus();}
  }

  function bankSetupSourceAssignDialog() {
    var dialog=el('bankSourceAssignDialog');
    if(!dialog||dialog._bankBound)return;
    dialog._bankBound=true;
    dialog.addEventListener('click',function(event){if(event.target===dialog)bankCloseSourceAssign();});
    dialog.addEventListener('cancel',function(event){if(state.bank.sourceAssignBusy)event.preventDefault();});
    dialog.addEventListener('close',bankRestoreSourceAssignFocus);
  }

  function bankCloseIssueReport() {
    state.bank.preview.pendingIssue = null;
    var dialog = el('bankIssueDialog');
    if (dialog) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
    var form = el('bankIssueForm');
    if (form && typeof form.reset === 'function') form.reset();
  }

  function bankOpenIssueReport(itemId, questionNumber, reportSort) {
    if (!state.bank.access.canReport || state.bank.access.canAdmin) return;
    var preview = state.bank.preview;
    if (['source_document','exam'].indexOf(preview.targetType) < 0 || !preview.targetId) {
      toast('Chưa xác định được đề đang xem để gửi báo lỗi.','err');
      return;
    }
    var isQuestion = Number(questionNumber) > 0;
    var targetType = isQuestion ? 'question' : preview.targetType;
    var target = {};
    if (preview.targetType === 'source_document') {
      target.document_id = preview.documentId || preview.targetId;
      if (isQuestion) target.source_ordinal = Number(reportSort);
    } else {
      target.exam_id = preview.examId || preview.targetId;
      if (isQuestion) target.exam_sort = Number(reportSort);
    }
    // The locator visible to a teacher is deliberately limited to the current
    // document/exam and its ordinal. The server resolves and verifies the
    // private bank item; no TeX, answer or technical ID is submitted.
    state.bank.preview.pendingIssue = {
      targetType:targetType,
      target:target,
      questionNumber:isQuestion ? Number(questionNumber) : 0,
      title:preview.title
    };
    var context = el('bankIssueContext');
    if (context) context.textContent = isQuestion
      ? 'Phản hồi sẽ được gắn với câu '+Number(questionNumber)+' trong “'+preview.title+'”.'
      : 'Phản hồi sẽ được gắn với đề “'+preview.title+'”.';
    var description = el('bankIssueDescription');
    if (description) description.value = '';
    var dialog = el('bankIssueDialog');
    if (dialog) {
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open','');
      window.setTimeout(function () { if (description) description.focus(); },0);
    }
  }

  async function bankSubmitIssueReport(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    var pending = state.bank.preview.pendingIssue;
    if (!pending || !state.bank.access.canReport || state.bank.access.canAdmin) return;
    var issueType = String(el('bankIssueType') && el('bankIssueType').value || 'other');
    if (issueType === 'answer') issueType = 'answer_suspected';
    var description = String(el('bankIssueDescription') && el('bankIssueDescription').value || '').trim();
    if (description.length < 3) { toast('Hãy mô tả ngắn vấn đề cần kiểm tra.','err'); return; }
    var button = el('bankIssueSubmitButton');
    if (button) { button.disabled = true; button.textContent = 'Đang gửi…'; }
    try {
      var response = await sb.rpc('vm_bank_report_issue',{
        p_target_type:pending.targetType,
        p_target:pending.target,
        p_issue_type:issueType,
        p_description:description
      });
      if (response.error) throw response.error;
      var data = response.data || {};
      bankCloseIssueReport();
      toast(data.duplicate ? 'Phản hồi này đã được gửi trước đó.' : 'Đã gửi vị trí cần kiểm tra.','ok');
    } catch (error) {
      toast('Chưa gửi được phản hồi: '+bankSafeError(error),'err');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Gửi báo lỗi'; }
    }
  }

  function bankHighlightIssueTarget(report) {
    report = report || {};
    state.bank.preview.adminIssue = report;
    var focus = report.focus || {}, pane = el('bankPreviewHtml'), target = null;
    if (pane && focus.item_id) target = pane.querySelector('[data-bank-preview-item-id="'+String(focus.item_id).replace(/"/g,'')+'"]');
    var sort = focus.source_ordinal != null ? focus.source_ordinal : focus.exam_sort;
    if (!target && pane && sort != null) target = pane.querySelector('[data-bank-preview-report-sort="'+Number(sort)+'"]');
    if (target) {
      target.classList.add('is-issue-target');
      requestAnimationFrame(function () { target.scrollIntoView({behavior:'smooth',block:'center'}); });
    }
    var status = el('bankPreviewStatus');
    if (status) {
      var summary = '⚑ '+String(report.reporter_name || 'Giáo viên')+': '+String(report.description || 'Nội dung cần kiểm tra');
      status.textContent = summary;
      status.title = summary;
    }
    var resolveButton = el('bankPreviewResolveButton');
    if (resolveButton) resolveButton.hidden = !state.bank.access.canAdmin || ['open','in_review'].indexOf(String(report.status || '')) < 0;
  }

  async function bankOpenIssueFromLocation() {
    if (!state.bank.access.canAdmin) return null;
    var reportId = String(new URLSearchParams(location.search).get('bank_report') || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) return null;
    try {
      var response = await sb.rpc('vm_bank_admin_issue_report',{p_report_id:reportId});
      if (response.error) throw response.error;
      var report = response.data || {}, focus = report.focus || {};
      switchTab('bank');
      bankSetView('repository',{history:'replace',normalizeHash:true,scroll:false});
      if (focus.document_id) {
        await bankLoadAdminDocumentPreview(focus.document_id,report.target_label || 'Nguồn cần kiểm tra',{
          targetType:'source_document',targetId:String(focus.document_id),documentId:String(focus.document_id)
        });
      } else if (focus.exam_id) {
        await bankOpenExamPreview(focus.exam_id,report.target_label || 'Đề cần kiểm tra');
      } else {
        throw new Error('Báo lỗi chưa còn liên kết tới nguồn dữ liệu.');
      }
      bankHighlightIssueTarget(report);
      toast('Đã mở đúng vị trí giáo viên báo lỗi.','ok');
      return report;
    } catch (error) {
      toast('Chưa mở được báo lỗi: '+bankSafeError(error),'err');
      return null;
    }
  }

  async function bankResolveCurrentIssue() {
    var report = state.bank.preview.adminIssue;
    if (!state.bank.access.canAdmin || !report || !report.id) return;
    var button = el('bankPreviewResolveButton');
    if (button) { button.disabled = true; button.textContent = 'Đang lưu…'; }
    try {
      var response = await sb.rpc('vm_bank_admin_resolve_issue',{
        p_report_id:report.id,p_status:'resolved',p_resolution_note:'Đã kiểm tra và xử lý trên Ngân hàng đề.'
      });
      if (response.error) throw response.error;
      report.status = 'resolved';
      if (button) button.hidden = true;
      toast('Đã đánh dấu báo lỗi là đã xử lý.','ok');
    } catch (error) { toast('Chưa cập nhật được báo lỗi: '+bankSafeError(error),'err'); }
    finally { if (button) { button.disabled = false; button.textContent = '✓ Đã xử lý'; } }
  }

  function openBankFromEditor() {
    if (!state.bank.access.canUse) { toast('Tài khoản này không có quyền dùng ngân hàng đề.','err'); return; }
    var area = el('exLatex');
    var selected = area && area.selectionStart !== area.selectionEnd ? area.value.slice(area.selectionStart,area.selectionEnd) : '';
    var query = stripLatex(selected).replace(/\s+/g,' ').trim().slice(0,120);
    if (query && el('bankSearchQuery')) el('bankSearchQuery').value = query;
    bankWriteWorkspaceTab('bank','push');
    switchTab('bank');
    state.bank.manageMode='questions';
    bankSetView('manage',{history:'push',normalizeHash:true,scroll:false});
    var target = el('bankSearchCard');
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
    if (query) toast('Đã chuyển phần đang chọn sang ô tìm ngân hàng.','ok');
  }

  function bankImportEditorSource() {
    if (!state.bank.access.canImport) { toast('Tài khoản này chưa được cấp quyền gửi nguồn TeX.','err'); return; }
    var parser = window.VinhMathQuestionBank;
    var raw = el('exType').value === 'essay' ? el('exEssayPrompt').value.trim() : el('exLatex').value.trim();
    if (!raw) { toast('Bản soạn chưa có nội dung để phân loại.','err'); return; }
    if (!parser) { toast('Chưa tải được bộ đọc ngân hàng TeX.','err'); return; }
    if (state.bank.items.length && !confirm('Thay danh sách tệp đang chờ nhập bằng nội dung trong trình soạn?')) return;
    var title = el('exTitle').value.trim() || 'Nội dung từ trình soạn';
    var fileName = bankPreviewSlug(title)+'.tex';
    var parsed = parser.parseDocument(raw,{sourcePath:fileName});
    if (!parsed.questions || !parsed.questions.length) { toast('Chưa nhận diện được môi trường câu hỏi trong bản soạn.','err'); return; }
    state.bank.documents = [{file:null,fileName:fileName,path:fileName,text:raw,contentHash:parser.hashText(raw),parsed:parsed,inputMethod:'editor'}];
    state.bank.items = [];
    state.bank.parseErrors = (parsed.errors || []).map(function (error) { return {path:fileName,error:error}; });
    state.bank.visibleLimit = 120;
    parsed.questions.forEach(function (question,index) {
      question._bankDocumentIndex = 0;
      question._bankIndex = index;
      question._bankSelected = state.bank.importMode==='topic_pack'&&!question.question_id;
      bankRefreshQuestion(question);
      state.bank.items.push(question);
    });
    if(state.bank.importMode==='complete_exam'){
      var firstEditorMissing=state.bank.items.find(function(question){return !bankHasClassification(question);});
      if(firstEditorMissing)firstEditorMissing._bankSelected=true;
    }
    if (el('bankImportTitle')) el('bankImportTitle').value = title;
    bankRenderLocal();
    switchTab('bank');
    bankScrollZone('import');
    toast('Đã chuyển '+state.bank.items.length+' câu sang bước phân loại và nhập kho.','ok');
  }

  function bankSendPreviewToEditor() {
    var source = state.bank.preview.editableSource;
    if (!state.bank.access.canAdmin || !source) return;
    var area = el('exLatex');
    var replace = state.bank.preview.editorMode === 'replace';
    if (area.value.trim()) {
      var question = replace
        ? 'Thay nội dung đang soạn bằng đúng đề đang xem? Nội dung hiện tại vẫn được giữ nếu bấm Hủy.'
        : 'Nối câu đang xem vào cuối bản soạn hiện tại?';
      if (!confirm(question)) return;
    }
    area.value = replace || !area.value.trim() ? source.trim() : area.value.trim()+'\n\n'+source.trim();
    if (replace || !el('exTitle').value.trim()) el('exTitle').value = state.bank.preview.title || 'Nội dung từ ngân hàng';
    if (el('exType').value === 'essay') { el('exType').value = 'combo'; updateExamType(); }
    state.templateKey = 'custom';
    bankWriteWorkspaceTab('compose','replace');
    bankClosePreview({fromHistory:true});
    switchTab('compose');
    renderPreview(true);
    area.focus();
    area.scrollIntoView({behavior:'smooth',block:'center'});
    toast(replace?'Đã mở đúng đề trong Soạn thảo.':'Đã đưa câu vào bản soạn.','ok');
  }

  function bankTypeLabel(type) {
    return {multiple_choice:'Trắc nghiệm',true_false:'Đúng/Sai',short_answer:'Trả lời ngắn',essay:'Tự luận'}[type] || 'Không xác định';
  }

  function bankPickNumber(source, keys) {
    source = source || {};
    for (var i=0;i<keys.length;i++) {
      if (source[keys[i]] == null || source[keys[i]] === '') continue;
      var value = Number(source[keys[i]]);
      if (isFinite(value) && value >= 0) return value;
    }
    return null;
  }

  function bankSetOverviewValue(id, value) {
    var node = el(id); if (!node) return;
    node.textContent = value == null ? '—' : Number(value).toLocaleString('vi-VN');
  }

  function bankSetGenerationSourceCount(id,value,unit) {
    var node=el(id);if(!node)return;
    var count=value==null||Number.isNaN(Number(value))?null:Number(value);
    node.textContent=count==null?'Chưa rõ dữ liệu':count.toLocaleString('vi-VN')+' '+unit+' hiện có';
    var label=node.closest('label');
    if(label){label.classList.toggle('bank-source-empty',count===0);label.title=count===0?'Nguồn này chưa có dữ liệu phù hợp; có thể chọn cùng nguồn khác để hệ thống tự cân bằng.':'';}
  }

  function bankUpdateOverview() {
    var stats = state.bank.stats || {}, sources = state.bank.sourceItems || [];
    var complete = bankPickNumber(stats,['complete_exams','mock_exam_documents']);
    if (complete == null) complete = state.bank.sourceCatalogTotal;
    var topic = bankPickNumber(stats,['topic_pack_questions','topic_questions','topic_pack_items','topic_pack_documents']);
    var thpt = bankPickNumber(stats,['thpt_exam_documents','official_mock_documents','thpt_exams']);
    var semester = bankPickNumber(stats,['semester_documents','semester_exams']);
    var other = bankPickNumber(stats,['other_documents','other_sources','mock_other_documents','mock_exam_other_documents']);
    var province = bankPickNumber(stats,['province_exam_documents']);
    var authored = bankPickNumber(stats,['authored_documents']);
    if (sources.length && !state.bank.sourceCategory) {
      var sourceKinds = {thpt:0,semester:0,other:0};
      sources.forEach(function (item) {
        var kind = String(item.exam_kind || '').toLowerCase();
        var title = String(item.title || '').toLowerCase();
        if (kind === 'semester' || /học kỳ|hoc ky|hk\s*[12]|giữa học kỳ|giua hoc ky|ghk\s*[12]/.test(title+' '+kind)) sourceKinds.semester += 1;
        else if (kind === 'official' || /thptqg|tốt nghiệp|tot nghiep|đề tham khảo|de tham khao|dethamkhao|đề minh họa|de minh hoa|deminhhoa|đề chính thức|de chinh thuc|dechinhthuc/.test(title+' '+kind)) sourceKinds.thpt += 1;
        else sourceKinds.other += 1;
      });
      if (thpt == null) thpt = sourceKinds.thpt;
      if (semester == null) semester = sourceKinds.semester;
      if (other == null) other = sourceKinds.other;
      if (province == null) province = sources.filter(function(item){return String(item.source_origin||'')==='province_exam';}).length;
      if (authored == null) authored = sources.filter(function(item){return String(item.source_origin||'')==='authored';}).length;
    }
    bankSetOverviewValue('bankOverviewComplete',complete);
    bankSetOverviewValue('bankOverviewTopic',topic);
    bankSetOverviewValue('bankOverviewThpt',thpt);
    bankSetOverviewValue('bankOverviewSemester',semester);
    bankSetOverviewValue('bankOverviewOther',other);
    bankSetOverviewValue('bankOverviewProvince',province);
    bankSetOverviewValue('bankOverviewAuthored',authored);
    bankSetOverviewValue('bankOverviewActive',bankPickNumber(stats,['inventory_active','active']));
    bankSetOverviewValue('bankOverviewReview',bankPickNumber(stats,['inventory_quarantined','quarantined']));
    bankSetGenerationSourceCount('bankGenerationSourceProvinceCount',province,'đề');
    bankSetGenerationSourceCount('bankGenerationSourceAuthoredCount',authored,'đề');
    bankSetGenerationSourceCount('bankGenerationSourceTopicCount',topic,'câu');
  }

  function bankInventoryCategoryTotals(items,key) {
    return (items||[]).filter(function(item){
      var status=String(item.status||'active').toLowerCase();
      return String(item.key||'')===key&&status==='active';
    }).reduce(function(total,item){
      var usable=item.active_questions==null?item.question_occurrences:item.active_questions;
      return {documents:total.documents+Number(item.documents||0),questions:total.questions+Number(usable||0)};
    },{documents:0,questions:0});
  }

  async function bankLoadInventory(silent) {
    if(!state.bank.access.canUse||!window.sb||typeof window.sb.rpc!=='function')return;
    try{
      var responses=await Promise.all([
        sb.rpc('vm_bank_inventory',{p_filters:{}}),
        sb.rpc('vm_bank_category_summary')
      ]);
      var response=responses[0];if(response.error)throw response.error;
      var canonicalResponse=responses[1]||{},canonicalData=canonicalResponse.error?{}:(canonicalResponse.data||{});
      var canonicalItems=Array.isArray(canonicalData.items)?canonicalData.items:[];
      var canonicalOrigins=Array.isArray(canonicalData.origins)?canonicalData.origins:[];
      var data=response.data||{},items=Array.isArray(data.items)?data.items:[],summary=data.summary||{};
      var thpt=bankInventoryCategoryTotals(items,'thptqg'),semester=bankInventoryCategoryTotals(items,'semester'),otherExam=bankInventoryCategoryTotals(items,'other_exam');
      var canonicalTopic=canonicalItems.find(function(item){return String(item.key||'')==='topic_pack';});
      var canonicalTopicQuestions=canonicalResponse.error
        ? bankPickNumber(state.bank.stats,['topic_pack_questions'])
        : Number(canonicalTopic?canonicalTopic.active_questions:0);
      var provinceOrigin=canonicalOrigins.find(function(item){return String(item.key||'')==='province_exam';});
      var authoredOrigin=canonicalOrigins.find(function(item){return String(item.key||'')==='authored';});
      state.bank.inventory=data;state.bank.inventoryLoaded=true;
      state.bank.stats=Object.assign({},state.bank.stats,{
        complete_exams:Number(summary.full_exams==null?thpt.documents+semester.documents+otherExam.documents:summary.full_exams),
        topic_pack_questions:canonicalTopicQuestions,
        thpt_exam_documents:thpt.documents,
        semester_documents:semester.documents,
        other_documents:otherExam.documents,
        province_exam_documents:canonicalResponse.error?bankPickNumber(state.bank.stats,['province_exam_documents']):Number(provinceOrigin?provinceOrigin.active_documents:0),
        authored_documents:canonicalResponse.error?bankPickNumber(state.bank.stats,['authored_documents']):Number(authoredOrigin?authoredOrigin.active_documents:0),
        inventory_active:Number(summary.active||0),
        inventory_quarantined:Number(summary.quarantined||0)
      });
      bankUpdateOverview();
      if(canonicalResponse.error&&!silent&&!bankRpcMissing(canonicalResponse.error))toast('Chưa tải được số câu chuẩn; hãy thử lại.','err');
    }catch(error){state.bank.inventoryLoaded=false;if(!silent&&!bankRpcMissing(error))toast('Chưa tải được tổng quan kho.','err');}
  }

  function bankRenderSourceCategoryTabs() {
    document.querySelectorAll('[data-bank-source-category]').forEach(function(button){
      var category=button.getAttribute('data-bank-source-category')||'';
      var origin=button.getAttribute('data-bank-source-origin')||'';
      var active=category===state.bank.sourceCategory&&origin===state.bank.sourceOrigin;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function bankSetSourceCategory(category) {
    var origin=['authored','province_exam'].indexOf(category)>=0?category:'';
    category=['thptqg','semester','other_exam'].indexOf(category)>=0?category:'';
    state.bank.sourceCategory=category;
    state.bank.sourceOrigin=origin;
    bankRenderSourceCategoryTabs();
    if(el('bankSourceType'))el('bankSourceType').value='';
    bankLoadSourceCatalog();
  }

  function bankOpenOverview(kind) {
    if(kind==='topic'){
      bankScrollZone('manage');
      setTimeout(function(){if(el('bankSearchGrade'))el('bankSearchGrade').focus({preventScroll:true});},260);
      return;
    }
    if(kind==='repository'){state.bank.manageMode='sources';bankScrollZone('repository');return;}
    bankScrollZone('create');
    setTimeout(function(){bankSetSourceCategory(kind==='complete'?'':kind);},180);
  }

  function bankMatrixRows(items) {
    var rows = {
      multiple_choice:{label:'Trắc nghiệm',NB:0,TH:0,VD:0,VDC:0,total:0},
      true_false:{label:'Đúng / Sai',NB:0,TH:0,VD:0,VDC:0,total:0},
      short_answer:{label:'Trả lời ngắn',NB:0,TH:0,VD:0,VDC:0,total:0},
      essay:{label:'Tự luận / Khác',NB:0,TH:0,VD:0,VDC:0,total:0}
    };
    (items || []).forEach(function (item) {
      var type = item.question_type || item.type || 'essay';
      if (!rows[type]) type = 'essay';
      var difficulty = String(item.difficulty || 'TH').toUpperCase();
      if (['NB','TH','VD','VDC'].indexOf(difficulty) < 0) difficulty = 'TH';
      var count=Math.max(0,Number(item.count==null?1:item.count)||0);
      rows[type][difficulty] += count; rows[type].total += count;
    });
    return rows;
  }

  function bankRenderMatrix(items, total, scope) {
    var body = el('bankMatrixBody'), footer = el('bankMatrixTotalRow');
    if (!body || !footer) return;
    var rows = bankMatrixRows(items), columns = ['NB','TH','VD','VDC'], totals = {NB:0,TH:0,VD:0,VDC:0,total:0};
    body.innerHTML = Object.keys(rows).map(function (key) {
      var row = rows[key];
      columns.forEach(function (column) { totals[column] += row[column]; }); totals.total += row.total;
      return '<tr><th>'+row.label+'</th>'+columns.map(function (column) { return '<td>'+row[column]+'</td>'; }).join('')+'<td><b>'+row.total+'</b></td></tr>';
    }).join('');
    footer.innerHTML = '<th>Tổng</th>'+columns.map(function (column) { return '<td>'+totals[column]+'</td>'; }).join('')+'<td><b>'+totals.total+'</b></td>';
    var safeTotal = Number(total == null ? totals.total : total);
    if (el('bankMatrixCount')) el('bankMatrixCount').textContent = safeTotal.toLocaleString('vi-VN')+' câu';
    if (el('bankMatrixScope')) el('bankMatrixScope').textContent = scope || 'Toàn bộ kết quả đang hiển thị';
    if (el('bankMatrixNote')) el('bankMatrixNote').textContent = safeTotal > totals.total
      ? 'Ma trận hiển thị mẫu '+totals.total.toLocaleString('vi-VN')+' / '+safeTotal.toLocaleString('vi-VN')+' câu phù hợp.'
      : 'Đã tổng hợp '+totals.total.toLocaleString('vi-VN')+' câu trong phạm vi này.';
    if (el('bankMatrixCard')) el('bankMatrixCard').setAttribute('aria-busy','false');
    if (el('bankMatrixRetry')) el('bankMatrixRetry').hidden=true;
  }

  async function bankLoadMatrix(filters,silent) {
    if(!state.bank.access.canUse||!window.sb||typeof window.sb.rpc!=='function')return false;
    state.bank.matrixFilters=filters||{status:'active'};
    var token=++state.bank.matrixRequestToken;
    if(el('bankMatrixCard'))el('bankMatrixCard').setAttribute('aria-busy','true');
    if(el('bankMatrixCount'))el('bankMatrixCount').textContent='Đang tải…';
    if(el('bankMatrixNote'))el('bankMatrixNote').textContent='Đang tổng hợp toàn bộ kho câu phù hợp…';
    if(el('bankMatrixRetry'))el('bankMatrixRetry').hidden=true;
    try{
      var response=await sb.rpc('vm_bank_matrix',{p_filters:state.bank.matrixFilters});if(response.error)throw response.error;
      if(token!==state.bank.matrixRequestToken)return false;
      var data=response.data||{},items=Array.isArray(data)?data:(data.items||[]),total=Number(data.question_count==null?items.reduce(function(sum,item){return sum+Number(item.count||0);},0):data.question_count);
      bankRenderMatrix(items,total,bankBrowseScopeLabel());return true;
    }catch(error){
      if(token!==state.bank.matrixRequestToken)return false;
      if(el('bankMatrixCard'))el('bankMatrixCard').setAttribute('aria-busy','false');
      if(el('bankMatrixCount'))el('bankMatrixCount').textContent='Chưa tải';
      if(el('bankMatrixNote'))el('bankMatrixNote').textContent='Không tải được thống kê. Dữ liệu kho không bị mất.';
      if(el('bankMatrixRetry'))el('bankMatrixRetry').hidden=false;
      if(!silent&&!bankRpcMissing(error))toast('Chưa tải được ma trận câu hỏi.','err');return false;
    }
  }

  function bankRetryMatrix() {
    return bankLoadMatrix(state.bank.matrixFilters||{status:'active'},false);
  }

  function bankNormalizeFacetEntry(raw) {
    raw = raw || {};
    var grade = Number(raw.grade), chapter = Number(raw.chapter), skill = Number(raw.skill);
    var area = String(raw.area || '').trim().toUpperCase().slice(0,1);
    if (!Number.isInteger(grade) || grade < 1 || grade > 12 || !area || !isFinite(chapter)) return null;
    return {
      grade:grade, area:area, chapter:chapter, skill:isFinite(skill)?skill:null,
      area_label:String(raw.area_label || (area==='D'?'Đại số & Giải tích':area==='H'?'Hình học':area==='C'?'Chuyên đề':area)).trim(),
      chapter_label:String(raw.chapter_label || ('Chương '+chapter)).trim(),
      skill_label:String(raw.skill_label || raw.lesson_label || raw.lesson_name || (isFinite(skill)?'Bài / Chủ đề '+skill:'')).trim()
    };
  }

  function bankBrowseEntries() {
    var source = state.bank.taxonomyFacets.length ? state.bank.taxonomyFacets : state.bank.taxonomyCatalog;
    return (source || []).map(bankNormalizeFacetEntry).filter(Boolean);
  }

  function bankChapterValueParts(value) {
    var match = /^([A-Z]):(\d+)$/.exec(value);
    return match ? {area:match[1],chapter:Number(match[2])} : {area:null,chapter:null};
  }

  function bankBrowseChapterParts() {
    return bankChapterValueParts(el('bankSearchChapter') ? el('bankSearchChapter').value : '');
  }

  function bankHierarchyChapterOptions(grade) {
    var chapters = bankBrowseEntries().filter(function (entry) { return entry.grade===Number(grade); });
    var seen = Object.create(null), options = [];
    chapters.forEach(function (entry) {
      var value=entry.area+':'+entry.chapter;if(seen[value])return;seen[value]=true;
      options.push({value:value,label:entry.area_label+' · '+entry.chapter_label,area:entry.area,chapter:Number(entry.chapter)});
    });
    options.sort(function(a,b){return a.chapter-b.chapter||a.area.localeCompare(b.area,'vi');});
    return options;
  }

  function bankHierarchyTopicOptions(grade, chapterValue) {
    var chapter=bankChapterValueParts(chapterValue),seen=Object.create(null),options=[];
    bankBrowseEntries().filter(function(entry){return entry.grade===Number(grade)&&entry.area===chapter.area&&entry.chapter===chapter.chapter&&entry.skill!=null;}).forEach(function(entry){
      var value=String(entry.skill);if(seen[value])return;seen[value]=true;
      options.push({value:value,label:entry.skill_label||('Bài / Chủ đề '+value)});
    });
    options.sort(function(a,b){return a.label.localeCompare(b.label,'vi',{numeric:true});});
    return options;
  }

  function bankFillHierarchyControls(gradeSelect,chapterSelect,topicSelect,level) {
    if(!gradeSelect||!chapterSelect||!topicSelect)return;
    var grade=Number(gradeSelect.value),keep=level==='catalog',previousChapter=chapterSelect.value,previousTopic=topicSelect.value;
    if(!grade){chapterSelect.innerHTML='<option value="">Chọn khối trước</option>';chapterSelect.disabled=true;topicSelect.innerHTML='<option value="">Chọn chương trước</option>';topicSelect.disabled=true;return;}
    if(level==='grade'||level==='catalog'){
      var chapters=bankHierarchyChapterOptions(grade);
      if(!chapters.length){
        var catalogueReady=state.bank.taxonomyFacetsLoaded||state.bank.taxonomyCatalogLoaded;
        chapterSelect.innerHTML='<option value="">'+(catalogueReady?'Chưa có chương trong khối này':'Đang tải danh mục chương…')+'</option>';
        chapterSelect.disabled=true;
        topicSelect.innerHTML='<option value="">Chọn chương trước</option>';
        topicSelect.disabled=true;
        return;
      }
      chapterSelect.innerHTML='<option value="">Tất cả chương</option>'+chapters.map(function(option){return '<option value="'+esc(option.value)+'">'+esc(option.label)+'</option>';}).join('');
      chapterSelect.disabled=false;
      if(keep&&chapters.some(function(option){return option.value===previousChapter;}))chapterSelect.value=previousChapter;
      else chapterSelect.value='';
    }
    if(!chapterSelect.value){topicSelect.innerHTML='<option value="">Chọn chương trước</option>';topicSelect.disabled=true;return;}
    if(level==='chapter'||level==='grade'||level==='catalog'){
      var topics=bankHierarchyTopicOptions(grade,chapterSelect.value);
      topicSelect.innerHTML='<option value="">Tất cả bài / chủ đề</option>'+topics.map(function(option){return '<option value="'+esc(option.value)+'">'+esc(option.label)+'</option>';}).join('');
      topicSelect.disabled=false;
      if(keep&&topics.some(function(option){return option.value===previousTopic;}))topicSelect.value=previousTopic;
      else topicSelect.value='';
    }
  }

  function bankBrowseScopeLabel() {
    var parts = [];
    ['bankSearchGrade','bankSearchChapter','bankSearchTopic'].forEach(function (id) {
      var select = el(id), option = select && select.options[select.selectedIndex];
      if (select && select.value && option) parts.push(option.textContent.trim());
    });
    return parts.length ? parts.join(' → ') : 'Toàn bộ kho câu đang dùng';
  }

  function bankRenderBrowseHierarchy(level) {
    var gradeSelect = el('bankSearchGrade'), chapterSelect = el('bankSearchChapter'), topicSelect = el('bankSearchTopic');
    if (!gradeSelect || !chapterSelect || !topicSelect) return;
    bankFillHierarchyControls(gradeSelect,chapterSelect,topicSelect,level||'grade');
    if (el('bankMatrixScope')) el('bankMatrixScope').textContent=bankBrowseScopeLabel();
  }

  function bankUpdateBrowseHierarchy(level) {
    bankRenderBrowseHierarchy(level || 'grade');
  }

  function bankRenderGeneratorHierarchy(level) {
    bankFillHierarchyControls(el('bankGenGrade'),el('bankGenChapter'),el('bankGenTopic'),level||'grade');
    bankUpdateBlueprintTotal();
  }

  function bankUpdateGeneratorHierarchy(level) {
    bankRenderGeneratorHierarchy(level || 'grade');
  }

  function bankImportChapterParts() {
    return bankChapterValueParts(el('bankImportTopicChapter') ? el('bankImportTopicChapter').value : '');
  }

  function bankImportTopicScopeLabel() {
    var parts=[];
    ['bankImportTopicGrade','bankImportTopicChapter','bankImportTopicLesson'].forEach(function(id){
      var select=el(id),option=select&&select.options[select.selectedIndex];
      if(select&&select.value&&option)parts.push(option.textContent.trim());
    });
    return parts.length?parts.join(' → '):'Chưa chọn phạm vi';
  }

  function bankSyncTaxonomyFromImportScope() {
    if(!state.bank.access.canAdmin||state.bank.importMode!=='topic_pack')return;
    var grade=el('bankImportTopicGrade')&&el('bankImportTopicGrade').value;
    var chapter=bankImportChapterParts();
    var lesson=el('bankImportTopicLesson')&&el('bankImportTopicLesson').value;
    var schema=el('bankTaxSchema')&&el('bankTaxSchema').value||'legacy-v1';
    if(el('bankTaxGrade'))el('bankTaxGrade').value=bankTaxonomyGradeCode(grade,schema);
    bankRenderTaxonomySuggestions();
    if(el('bankTaxArea'))el('bankTaxArea').value=chapter.area||'';
    bankRenderTaxonomySuggestions();
    if(el('bankTaxChapter'))el('bankTaxChapter').value=chapter.chapter||'';
    bankRenderTaxonomySuggestions();
    if(el('bankTaxSkill'))el('bankTaxSkill').value=lesson||'';
    bankRenderTaxonomySuggestions();
    if(el('bankTaxVariant'))el('bankTaxVariant').value='';
    bankRenderTaxonomyBrowser();
    bankUpdateTaxonomyPreview();
  }

  function bankUpdateImportHierarchy(level) {
    var grade=el('bankImportTopicGrade'),chapter=el('bankImportTopicChapter'),topic=el('bankImportTopicLesson');
    if(!grade||!chapter||!topic)return;
    bankFillHierarchyControls(grade,chapter,topic,level||'grade');
    if(chapter.options.length&&chapter.options[0])chapter.options[0].textContent=grade.value?'Chọn một chương':'Chọn khối trước';
    if(topic.options.length&&topic.options[0])topic.options[0].textContent=chapter.value?'Toàn bộ chương (không chọn bài)':'Chọn chương trước';
    var scope=el('bankImportTopicScope');if(scope)scope.textContent=bankImportTopicScopeLabel();
    bankSyncTaxonomyFromImportScope();
  }

  function bankUpdateBlueprintHierarchy(id,level) {
    var row=document.querySelector('[data-blueprint-row="'+String(id)+'"]');if(!row)return;
    bankFillHierarchyControls(row.querySelector('.bank-blueprint-grade'),row.querySelector('.bank-blueprint-chapter'),row.querySelector('.bank-blueprint-topic'),level||'grade');
    bankUpdateBlueprintTotal();
  }

  function bankRefreshAllHierarchyControls() {
    bankRenderBrowseHierarchy('catalog');
    bankRenderGeneratorHierarchy('catalog');
    bankUpdateImportHierarchy('catalog');
    document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row').forEach(function(row){bankUpdateBlueprintHierarchy(row.getAttribute('data-blueprint-row'),'catalog');});
  }

  function bankResetSearchFilters() {
    ['bankSearchQuery','bankSearchPrefix'].forEach(function(id){if(el(id))el(id).value='';});
    ['bankSearchGrade','bankSearchType','bankSearchDifficulty'].forEach(function(id){if(el(id))el(id).value='';});
    bankRenderBrowseHierarchy('grade');
    state.bank.searchItems=[];state.bank.searchTotal=null;
    if(el('bankSearchTotal'))el('bankSearchTotal').textContent='0 câu';
    if(el('bankSearchResults'))el('bankSearchResults').innerHTML='<div class="exam-empty" style="min-height:160px"><div><strong>Chọn bộ lọc để tìm câu</strong>Kết quả không chứa đáp án hoặc raw TeX.</div></div>';
    bankLoadMatrix({status:'active'},true);
  }

  async function bankLoadBrowseFacets(silent) {
    if (!state.bank.access.canUse || !window.sb || typeof window.sb.rpc !== 'function') return;
    try {
      var response=await sb.rpc('vm_bank_taxonomy_facets',{p_filters:{}});
      if(response.error)throw response.error;
      var data=response.data||{},rows=Array.isArray(data)?data:(data.items||data.facets||[]),seen=Object.create(null);
      state.bank.taxonomyFacets=rows.map(bankNormalizeFacetEntry).filter(function(entry){
        if(!entry)return false;var key=[entry.grade,entry.area,entry.chapter,entry.skill].join(':');if(seen[key])return false;seen[key]=true;return true;
      });
      state.bank.taxonomyFacetsLoaded=true;bankRefreshAllHierarchyControls();
    }catch(error){state.bank.taxonomyFacetsLoaded=false;if(!silent&&!bankRpcMissing(error))toast('Chưa tải được bộ lọc chương và bài học.','err');bankRefreshAllHierarchyControls();}
  }

  function bankNormalizeAccess(raw, profile) {
    raw = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
    if (raw.bank && typeof raw.bank === 'object') raw = raw.bank;
    var roleAdmin = !!profile && profile.role === 'admin';
    var canAdmin = roleAdmin || raw.is_admin === true || raw.can_admin === true || raw.canAdmin === true;
    var access = {
      canUse:canAdmin || raw.can_use === true || raw.canUse === true,
      canReport:canAdmin || raw.can_report === true || raw.canReport === true,
      canImport:canAdmin || raw.can_import === true || raw.canImport === true,
      canDownloadTex:canAdmin || raw.can_download_tex === true || raw.canDownloadTex === true,
      canManage:canAdmin || raw.can_manage === true || raw.canManage === true,
      canManageIdSchema:canAdmin || raw.can_manage_id_schema === true || raw.canManageIdSchema === true,
      canAdmin:canAdmin,
      source:raw.source || (canAdmin ? 'admin' : 'server')
    };
    if (!access.canUse) {
      access.canReport = false;
      access.canImport = false;
      access.canDownloadTex = false;
      access.canManage = false;
      access.canManageIdSchema = false;
    }
    return access;
  }

  function bankAccessFor(profile) {
    // Fail closed when the capability RPC is unavailable. Admin keeps the
    // highest tier; all delegated staff permissions must come from the server.
    return bankNormalizeAccess({},profile);
  }

  async function bankLoadAccess(profile) {
    var fallback = bankAccessFor(profile);
    if (!window.sb || typeof window.sb.rpc !== 'function') return fallback;
    try {
      var response = await sb.rpc('vm_my_bank_capabilities');
      if (response.error) throw response.error;
      return bankNormalizeAccess(response.data,profile);
    } catch (error) {
      if (profile && profile.role === 'admin') return fallback;
      return bankNormalizeAccess({},profile);
    }
  }

  function bankFillClassOptions() {
    var options = '<option value="">Chọn lớp</option>' + state.classes.map(function (c) {
      return '<option value="'+c.id+'">'+esc(c.name)+(c.is_specialized?' · Chuyên':'')+'</option>';
    }).join('');
    ['bankGenClass','bankSourceAssignClass'].forEach(function (id) { if (el(id)) el(id).innerHTML = options; });
  }

  function bankSetupGenerationDraftForm() {
    var form=el('bankGenerateForm');
    if(!form||form._bankDraftBound)return;
    form._bankDraftBound=true;
    var invalidate=function(event){
      if(!state.bank.generationDraft)return;
      if(event&&event.target&&['bankGenClass','bankGenPublished'].indexOf(event.target.id)>=0)return;
      state.bank.generationDraft=null;
      if(el('bankDraftCommitPanel'))el('bankDraftCommitPanel').hidden=true;
      if(el('bankGenerateStatus'))el('bankGenerateStatus').textContent='Tiêu chí đã đổi · cần xem lại';
    };
    form.addEventListener('input',invalidate);
    form.addEventListener('change',invalidate);
    var classField=el('bankGenClass'),publishField=el('bankGenPublished');
    var syncPublish=function(){
      if(!publishField)return;
      publishField.disabled=!classField||!classField.value;
      if(publishField.disabled)publishField.checked=false;
      if(classField&&classField.value)classField.removeAttribute('aria-invalid');
    };
    if(classField)classField.addEventListener('change',syncPublish);
    syncPublish();
  }

  function bankConfigureAccess(profile, capabilities) {
    state.bank.access = capabilities ? bankNormalizeAccess(capabilities,profile) : bankAccessFor(profile);
    document.body.classList.add('bank-access-ready');
    document.body.classList.toggle('bank-admin-mode',state.bank.access.canAdmin);
    document.body.classList.toggle('bank-import-mode',state.bank.access.canImport);
    document.body.classList.toggle('bank-delegated-import-mode',state.bank.access.canImport&&!state.bank.access.canAdmin);
    document.body.classList.toggle('bank-download-tex-mode',state.bank.access.canDownloadTex);
    document.body.classList.toggle('bank-manage-mode',state.bank.access.canManage);
    document.body.classList.toggle('bank-id-schema-manage-mode',state.bank.access.canManageIdSchema);
    bankSetupPreviewDialog();
    bankSetupSourceAssignDialog();
    var tab = el('bankTab');
    if (tab) tab.hidden = !state.bank.access.canUse;
    if (el('editorToBankButton')) el('editorToBankButton').hidden = !state.bank.access.canImport;
    if (el('bankAdminWorkbench')) el('bankAdminWorkbench').hidden = !state.bank.access.canImport;
    if (el('bankImportNav')) el('bankImportNav').hidden = !state.bank.access.canImport;
    if (el('bankManageSourcesTab')) el('bankManageSourcesTab').hidden = !state.bank.access.canAdmin;
    if (el('bankOverviewReviewCard')) el('bankOverviewReviewCard').hidden = !state.bank.access.canAdmin;
    if (el('bankDelegatedImportPanel')) el('bankDelegatedImportPanel').hidden = !state.bank.access.canImport || state.bank.access.canAdmin;
    if (el('bankPreviewDownloadTex')) el('bankPreviewDownloadTex').hidden = !state.bank.access.canDownloadTex || !state.bank.preview.documentId;
    if (!state.bank.access.canUse) {
      document.body.classList.remove('bank-teacher-mode');
      return;
    }
    if(!state.bank.access.canAdmin)state.bank.manageMode='questions';
    bankSetView(bankViewFromLocation()||state.bank.activeView,{history:'none',normalizeHash:true,scroll:false});
    bankFillClassOptions();
    var saveClassLabel=el('bankGenClassLabel');
    if(saveClassLabel)saveClassLabel.textContent=state.bank.access.canAdmin?'Lớp khi lưu (không bắt buộc)':'Lớp khi lưu *';
    bankSetupGenerationDraftForm();
    bankNewSeed();
    bankUpdateGenerationKind();
    bankUpdateOverview();
    bankRenderBrowseHierarchy('grade');
    bankRenderMatrix([],0,'Toàn bộ kho câu đang dùng');
    bankLoadBrowseFacets(true);
    bankLoadInventory(true);
    bankLoadMatrix({status:'active'},true);
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
      if (state.bank.activeView === 'manage' && state.bank.manageMode === 'sources') bankLoadRepository();
    }
    if (state.bank.access.canImport) {
      bankSetupDropzone();
      bankSetImportMode('topic_pack');
      if (state.bank.access.canAdmin) bankLoadTaxonomyCatalog(true);
    }
  }

  function bankNewSeed() {
    if (!el('bankGenSeed')) return;
    var day = new Date().toISOString().slice(0,10).replace(/-/g,'');
    el('bankGenSeed').value = 'vm-'+day+'-'+Math.random().toString(36).slice(2,8);
  }

  function bankGenerationKind() {
    var selected = document.querySelector('input[name="bankGenerationKind"]:checked');
    return selected ? selected.value : 'practice_topic';
  }

  var BANK_SEMESTER_PERIODS = {
    midterm_1:'Giữa kỳ I',
    final_1:'Cuối kỳ I',
    midterm_2:'Giữa kỳ II',
    final_2:'Cuối kỳ II'
  };

  function bankSemesterPeriod() {
    var selected = document.querySelector('input[name="bankSemesterPeriod"]:checked');
    if (!selected || !BANK_SEMESTER_PERIODS[selected.value]) return null;
    return {value:selected.value,label:BANK_SEMESTER_PERIODS[selected.value]};
  }

  function bankUpdateSemesterPeriod() {
    var fieldset=el('bankSemesterPeriodFieldset'),selected=bankSemesterPeriod();
    document.querySelectorAll('input[name="bankSemesterPeriod"]').forEach(function(input){
      var label=input.closest('label');if(label)label.classList.toggle('active',input.checked);
    });
    if(fieldset)fieldset.setAttribute('aria-invalid','false');
    if(selected&&bankGenerationKind()==='semester_exam'&&el('bankGenTitle')){
      el('bankGenTitle').placeholder='Ví dụ: '+selected.label+' · Toán 11';
    }
    return selected;
  }

  function bankGenerationSources() {
    return Array.from(document.querySelectorAll('input[name="bankGenerationSource"]:checked'))
      .map(function (input) { return input.value; })
      .filter(function (value,index,all) {
        return ['province_exam','authored','topic_pack'].indexOf(value) >= 0 && all.indexOf(value) === index;
      });
  }

  function bankUpdateGenerationKind() {
    var kind = bankGenerationKind();
    document.querySelectorAll('input[name="bankGenerationKind"]').forEach(function (input) {
      input.closest('label').classList.toggle('active',input.checked);
    });
    var presets = {
      practice_topic:{placeholder:'Ví dụ: Chuyên đề Hàm số · Lớp 12',duration:45,count:20,type:''},
      semester_exam:{placeholder:'Ví dụ: Đề cuối học kỳ I · Toán 11',duration:90,count:20,type:'multiple_choice'},
      thptqg_exam:{placeholder:'Ví dụ: Đề luyện thi THPTQG · Số 01',duration:90,count:12,type:'multiple_choice'}
    };
    var preset = presets[kind] || presets.practice_topic;
    var semesterFieldset=el('bankSemesterPeriodFieldset'),isSemester=kind==='semester_exam';
    if(semesterFieldset){semesterFieldset.hidden=!isSemester;semesterFieldset.setAttribute('aria-invalid','false');}
    document.querySelectorAll('input[name="bankSemesterPeriod"]').forEach(function(input){
      input.disabled=!isSemester;input.required=isSemester;
    });
    if (el('bankGenTitle')) el('bankGenTitle').placeholder = preset.placeholder;
    if (el('bankGenDuration')) el('bankGenDuration').value = preset.duration;
    if (el('bankGenCount')) el('bankGenCount').value = preset.count;
    if (el('bankGenType')) el('bankGenType').value = preset.type;
    if (el('bankBlueprintRows')) el('bankBlueprintRows').innerHTML = '';
    if (kind === 'thptqg_exam') {
      if (el('bankGenGrade')) el('bankGenGrade').value = '12';
      bankUpdateGeneratorHierarchy('grade');
      bankAddBlueprintRow({grade:12,question_type:'true_false',count:4});
      bankAddBlueprintRow({grade:12,question_type:'short_answer',count:6});
    } else if (kind === 'semester_exam') {
      var grade = parseInt(el('bankGenGrade') && el('bankGenGrade').value,10) || null;
      bankAddBlueprintRow({grade:grade,question_type:'true_false',count:4});
      bankAddBlueprintRow({grade:grade,question_type:'short_answer',count:6});
    }
    bankRenumberBlueprintRows();
    bankUpdateBlueprintTotal();
    var button = el('bankGenerateButton');
    if (button) button.textContent = kind === 'practice_topic'
      ? '👁 Xem trước chuyên đề'
      : kind === 'semester_exam' ? '👁 Xem trước đề học kỳ' : '👁 Xem trước đề THPTQG';
    bankUpdateSemesterPeriod();
  }

  function bankBlueprintSelect(className,label,options,value,onchange,disabled) {
    return '<div class="exam-field"><label>'+label+'</label><select class="input '+className+'" onchange="'+(onchange||'VMExamAdmin.bankUpdateBlueprintTotal()')+'"'+(disabled?' disabled':'')+'>'+options.map(function (option) {
      return '<option value="'+esc(option[0])+'"'+(String(value||'')===String(option[0])?' selected':'')+'>'+esc(option[1])+'</option>';
    }).join('')+'</select></div>';
  }

  function bankAddBlueprintRow(values) {
    var box = el('bankBlueprintRows');
    if (!box) return;
    if (box.querySelectorAll('.bank-blueprint-row').length >= 29) { toast('Một đề tối đa 30 nhóm câu.','err'); return; }
    values = values || {};
    var id = ++state.bank.blueprintSeq;
    var gradeValue=String(values.grade||''),chapterValue=values.area&&values.chapter?String(values.area).toUpperCase()+':'+String(values.chapter):String(values.chapter_value||''),topicValue=String(values.skill||values.lesson||'');
    var chapterOptions=gradeValue?bankHierarchyChapterOptions(gradeValue).map(function(option){return [option.value,option.label];}):[];
    var topicOptions=gradeValue&&chapterValue?bankHierarchyTopicOptions(gradeValue,chapterValue).map(function(option){return [option.value,option.label];}):[];
    var row = document.createElement('div');
    row.className = 'bank-blueprint-row';
    row.setAttribute('data-blueprint-row',String(id));
    row.innerHTML = '<div class="bank-blueprint-row-no">Nhóm <span>'+id+'</span></div>'+
      bankBlueprintSelect('bank-blueprint-grade','Khối',[['','Mọi khối'],['10','10'],['11','11'],['12','12']],gradeValue,"VMExamAdmin.bankUpdateBlueprintHierarchy("+id+",'grade')")+
      bankBlueprintSelect('bank-blueprint-chapter','Chương',gradeValue?[['','Tất cả chương']].concat(chapterOptions):[['','Chọn khối trước']],chapterValue,"VMExamAdmin.bankUpdateBlueprintHierarchy("+id+",'chapter')",!gradeValue)+
      bankBlueprintSelect('bank-blueprint-topic','Bài / Chủ đề',chapterValue?[['','Tất cả bài / chủ đề']].concat(topicOptions):[['','Chọn chương trước']],topicValue,"VMExamAdmin.bankUpdateBlueprintHierarchy("+id+",'topic')",!chapterValue)+
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
    var mainChapter=bankChapterValueParts(el('bankGenChapter').value);
    var segments = [{
      count:Math.max(1,Math.min(100,parseInt(el('bankGenCount').value,10)||20)),
      grade:parseInt(el('bankGenGrade').value,10)||null,
      area:mainChapter.area,
      chapter:mainChapter.chapter,
      skill:parseInt(el('bankGenTopic').value,10)||null,
      difficulty:el('bankGenDifficulty').value||null,
      question_type:el('bankGenType').value||null
    }];
    document.querySelectorAll('#bankBlueprintRows .bank-blueprint-row').forEach(function (row) {
      var chapter=bankChapterValueParts(row.querySelector('.bank-blueprint-chapter').value);
      segments.push({
        count:Math.max(1,Math.min(100,parseInt(row.querySelector('.bank-blueprint-count input').value,10)||1)),
        grade:parseInt(row.querySelector('.bank-blueprint-grade').value,10)||null,
        area:chapter.area,
        chapter:chapter.chapter,
        skill:parseInt(row.querySelector('.bank-blueprint-topic').value,10)||null,
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
    if (bankIsStalePreviewError(error)) return 'Kho câu đã thay đổi sau lúc xem trước. Hãy tạo lại bản xem trước rồi lưu.';
    if (state.bank.access.canAdmin) return String(error && error.message || error || 'Lỗi không xác định');
    return bankRpcMissing(error)
      ? 'Chức năng đang được cập nhật trên máy chủ. Vui lòng thử lại sau.'
      : 'Máy chủ chưa hoàn tất yêu cầu. Vui lòng thử lại; khi đang xem một nguồn, có thể dùng nút Báo lỗi.';
  }

  function bankIsStalePreviewError(error) {
    var message=String(error&&error.message||error||'').toLowerCase();
    return message.indexOf('bank_generation_preview_stale')>=0;
  }

  function bankSetImportMode(mode) {
    if(!state.bank.access.canImport)return;
    mode=mode==='complete_exam'?'complete_exam':'topic_pack';
    state.bank.importMode=mode;
    var source=el('bankImportSourceKind');if(source)source.value=mode==='complete_exam'?'mock_exam':'topic_pack';
    document.querySelectorAll('[data-bank-import-mode]').forEach(function(button){
      var active=button.getAttribute('data-bank-import-mode')===mode;
      button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false');button.tabIndex=active?0:-1;
    });
    var topicPanel=el('bankImportTopicPanel'),examPanel=el('bankImportExamPanel');
    if(topicPanel)topicPanel.hidden=mode!=='topic_pack';
    if(examPanel)examPanel.hidden=mode!=='complete_exam';
    if(el('bankImportTitleLabel'))el('bankImportTitleLabel').textContent=mode==='topic_pack'?'Tên gói câu *':'Tên nguyên đề *';
    if(el('bankImportTitle'))el('bankImportTitle').placeholder=mode==='topic_pack'?'Ví dụ: Khối 12 · Chương 1 · Hàm số':'Ví dụ: Đề thi thử THPTQG Toán · Bình Định 2026';
    var missingButton=el('bankSelectMissingButton');
    if(missingButton)missingButton.textContent=mode==='topic_pack'?'☑ Chọn tất cả câu thiếu mã':'→ Câu tiếp theo thiếu ID';
    if(mode==='topic_pack')bankUpdateImportHierarchy('catalog');
    else{
      bankUpdateImportExamKind();
      var firstMissing=state.bank.items.find(function(question){return !bankHasClassification(question);});
      state.bank.items.forEach(function(question){question._bankSelected=question===firstMissing;});
      if(state.bank.items.length)bankRenderLocal();
    }
  }

  function bankDefaultAcademicYear() {
    var now=new Date(),year=now.getFullYear(),start=now.getMonth()>=7?year:year-1;
    return start+'-'+(start+1);
  }

  function bankUpdateImportExamKind() {
    if(!state.bank.access.canImport)return;
    var kind=String(el('bankImportExamType')&&el('bankImportExamType').value||''),context=el('bankImportSchoolContext');
    var needsTerm=['midterm','final','semester_1','semester_2'].indexOf(kind)>=0;
    if(context)context.hidden=!needsTerm;
    if(needsTerm&&el('bankImportSchoolYear')&&!el('bankImportSchoolYear').value.trim())el('bankImportSchoolYear').value=bankDefaultAcademicYear();
    if(kind==='semester_1'&&el('bankImportTerm'))el('bankImportTerm').value='1';
    if(kind==='semester_2'&&el('bankImportTerm'))el('bankImportTerm').value='2';
    bankUpdateImportOrigin(false);
  }

  function bankUpdateImportOrigin(fromUser) {
    if(!state.bank.access.canImport)return;
    var select=el('bankImportOrigin'),title=String(el('bankImportTitle')&&el('bankImportTitle').value||'').trim();
    if(!select)return;
    if(fromUser)select.dataset.userSelected='true';
    if(select.dataset.userSelected!=='true')select.value=/^dethamkhao\s*\d{1,2}(?:\D|$)/i.test(title)?'authored':'province_exam';
    var authored=select.value==='authored',label=el('bankImportUnitLabel'),input=el('bankImportUnit');
    if(label)label.textContent=authored?'Tác giả / nguồn nội bộ':'Tỉnh / đơn vị';
    if(input)input.placeholder=authored?'Ví dụ: Nhóm biên soạn VinhMath':'Ví dụ: Sở GD&ĐT TP.HCM';
  }

  function bankFocusImport() {
    if (!state.bank.access.canImport) {
      toast('Tài khoản này chưa được cấp quyền gửi nguồn vào ngân hàng đề.','err');
      return;
    }
    switchTab('bank');
    bankScrollZone('import');
    var modeButton = document.querySelector('[data-bank-import-mode="'+state.bank.importMode+'"]');
    if (modeButton) modeButton.focus({preventScroll:true});
  }

  function bankImportActionHtml(label) {
    return state.bank.access.canImport
      ? '<div><button class="btn btn-primary btn-sm" type="button" onclick="VMExamAdmin.bankFocusImport()">'+esc(label || 'Nhập dữ liệu vào kho')+'</button></div>'
      : '';
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
        : 'Hãy giảm số câu, chọn bộ lọc rộng hơn hoặc chọn thêm nguồn lấy câu.';
      return '<strong>'+title+'</strong><p>'+guidance+' '+nextStep+'</p>'+bankImportActionHtml('↓ Nhập câu / đề TeX vào kho');
    }
    return '<strong>Chưa tạo được đề</strong><p>'+esc(bankSafeError(error))+'</p>';
  }

  function bankGenerationWarningsHtml(warnings) {
    if(!Array.isArray(warnings)||!warnings.length)return '';
    return '<div class="bank-generation-warnings">'+warnings.map(function(warning){
      if(warning&&typeof warning==='object')return '<span>Yêu cầu '+Number(warning.requested||0)+' câu, tìm được '+Number(warning.selected||0)+' trong phạm vi đã chọn.</span>';
      return '<span>'+esc(String(warning||'Kho không đủ câu trong phạm vi đã chọn.'))+'</span>';
    }).join('')+'</div>';
  }

  function bankSourceEmptyHtml() {
    var guidance = state.bank.access.canAdmin
      ? 'Danh mục này chỉ hiện tệp được nhập dưới dạng “Đề hoàn chỉnh · có thể giao nguyên đề”. Kho câu theo chủ đề không xuất hiện ở đây. Hãy nhập một đề thi thử hoặc đề chính thức dạng .tex và điền tỉnh, năm, loại kỳ thi.'
      : 'Danh mục này chưa có đề hoàn chỉnh phù hợp. Các câu rời trong kho không tự trở thành một đề gốc.';
    return '<div class="exam-empty" style="min-height:150px"><div><strong>Chưa có đề hoàn chỉnh trong kho</strong>'+guidance+bankImportActionHtml('↓ Nhập đề hoàn chỉnh (.tex)')+'</div></div>';
  }

  function bankTaxonomyDifficultyCode(value) {
    var token = String(value == null ? '' : value).trim().toUpperCase();
    return {NB:'N',TH:'H',VD:'V',VDC:'G',N:'N',H:'H',V:'V',G:'G',C:'G',B:'N',Y:'N',T:'H',K:'V'}[token] || '';
  }

  function bankTaxonomyDifficultyValue(value,schemaName) {
    var token=String(value==null?'':value).trim().toUpperCase();
    var semantic={N:'NB',B:'NB',Y:'NB',NB:'NB',H:'TH',T:'TH',TH:'TH',V:'VD',K:'VD',VD:'VD',G:'VDC',C:'VDC',VDC:'VDC'}[token]||'';
    return String(schemaName||'legacy-v1').toLowerCase()==='legacy-v1'?bankTaxonomyDifficultyCode(token):semantic;
  }

  function bankTaxonomyGradeCode(value,schemaName) {
    var token = String(value == null ? '' : value).trim();
    if(String(schemaName||'legacy-v1').toLowerCase()==='legacy-v1')return {10:'0',11:'1',12:'2',0:'0',1:'1',2:'2'}[token] || '';
    return /^(?:[1-9]|1[0-2])$/.test(token)?String(Number(token)):'';
  }

  function bankTaxonomyVariant(value,schemaName) {
    var token = String(value == null ? '' : value).trim();
    if(String(schemaName||'legacy-v1').toLowerCase()==='legacy-v1')return /^\d+$/.test(token) ? String(Math.max(0,parseInt(token,10))) : '';
    return /^[A-Z0-9][A-Z0-9-]{0,23}$/i.test(token)?token.toUpperCase():'';
  }

  function bankTaxonomyCode(parts) {
    var parser = window.VinhMathQuestionBank;
    var schemaName=String(parts.schema_name||'legacy-v1').trim().toLowerCase();
    var gradeCode = bankTaxonomyGradeCode(parts.grade_code != null ? parts.grade_code : parts.grade,schemaName);
    var area = String(parts.area == null ? '' : parts.area).trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,1);
    var chapterToken = String(parts.chapter == null ? '' : parts.chapter).trim();
    var chapter = /^\d+$/.test(chapterToken) ? Number(chapterToken) : -1;
    var difficultyCode = bankTaxonomyDifficultyValue(parts.difficulty_code != null ? parts.difficulty_code : parts.difficulty,schemaName);
    var skillToken = String(parts.skill == null ? '' : parts.skill).trim();
    var skill = /^\d+$/.test(skillToken) ? Number(skillToken) : -1;
    var variant = bankTaxonomyVariant(parts.variant,schemaName);
    if (!gradeCode || !area || chapter < 0 || !difficultyCode || skill < 0 || !variant || !parser) return null;
    var code = schemaName==='legacy-v1'
      ? gradeCode+area+chapter+difficultyCode+skill+'-'+variant
      : schemaName+':'+gradeCode+area+chapter+difficultyCode+skill+'-'+variant;
    var parsed=parser.parseQuestionId(code);
    return parsed ? parsed.id : null;
  }

  function bankNormalizeTaxonomyEntry(raw, index) {
    var parser = window.VinhMathQuestionBank;
    var entry = typeof raw === 'string' ? {code:raw} : (raw || {});
    var taxonomy = entry.taxonomy && typeof entry.taxonomy === 'object' ? entry.taxonomy : entry;
    var schemaName=String(entry.schema_name||taxonomy.schema_name||'legacy-v1').trim().toLowerCase();
    var candidate = String(entry.sample_code || entry.code || entry.legacy_code || entry.taxonomy_code || '').trim().toUpperCase();
    var familyKey = String(entry.key || entry.taxonomy_key || taxonomy.taxonomy_key || '').trim();
    var parsed = parser && candidate ? parser.parseQuestionId(candidate) : null;
    if (!parsed) {
      candidate = bankTaxonomyCode({
        schema_name:schemaName,
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
    var familyMatch = /^([012])([A-Z])(\d+)\?(\d+)-(\d+)$/.exec(familyKey.toUpperCase());
    if (!parsed && !familyMatch) return null;
    var label = String(entry.label || entry.name || entry.title || entry.vi || entry.slug || taxonomy.label || '').trim();
    var gradeCode = parsed ? parsed.grade_code : familyMatch[1];
    var grade = parsed ? parsed.grade : ({0:10,1:11,2:12}[gradeCode] || null);
    var area = parsed ? parsed.area : familyMatch[2];
    var chapter = parsed ? parsed.chapter : Number(familyMatch[3]);
    var difficultyCode = parsed ? parsed.difficulty_code : bankTaxonomyDifficultyCode(entry.difficulty_code || entry.difficulty || taxonomy.difficulty_code || taxonomy.difficulty);
    var skill = parsed ? parsed.skill : Number(familyMatch[4]);
    var variant = parsed ? parsed.variant : familyMatch[5];
    var catalogKey = familyKey || (parsed && parsed.taxonomy_key) || '';
    return {
      catalog_key:catalogKey,
      code:parsed ? parsed.id : null,
      schema_name:parsed ? parsed.schema_name : schemaName,
      schema_label:String(entry.schema_label || taxonomy.schema_label || schemaName).trim(),
      grade_code:gradeCode,
      grade:grade,
      area:area,
      chapter:chapter,
      difficulty_code:difficultyCode,
      difficulty:parsed ? parsed.difficulty : (entry.difficulty || taxonomy.difficulty || null),
      skill:skill,
      variant:variant,
      status:String(entry.status || taxonomy.status || 'active').trim().toLowerCase(),
      label:label || ('Mẫu phân loại '+(index+1)),
      area_label:String(entry.area_label || taxonomy.area_label || '').trim(),
      chapter_label:String(entry.chapter_label || taxonomy.chapter_label || '').trim(),
      skill_label:String(entry.skill_label || taxonomy.skill_label || '').trim(),
      variant_label:String(entry.variant_label || taxonomy.variant_label || '').trim()
    };
  }

  function bankTaxonomyFiltered(filters) {
    filters=filters||{};
    return (state.bank.taxonomyCatalog||[]).filter(function(entry){
      return Object.keys(filters).every(function(key){
        var expected=filters[key];
        return expected==null||expected===''||String(entry[key])===String(expected);
      });
    });
  }

  function bankTaxonomyConsensusLabel(rows,field,fallback) {
    var counts=Object.create(null),best='',bestCount=0;
    (rows||[]).forEach(function(row){
      var value=String(row&&row[field]||'').trim();if(!value)return;
      counts[value]=(counts[value]||0)+1;
      if(counts[value]>bestCount){best=value;bestCount=counts[value];}
    });
    return best||fallback||'';
  }

  function bankTaxonomyOptionGroups(rows,key,labelField,prefix) {
    var groups=Object.create(null);
    (rows||[]).forEach(function(entry){
      var value=String(entry[key]==null?'':entry[key]).trim();if(!value)return;
      (groups[value]||(groups[value]=[])).push(entry);
    });
    return Object.keys(groups).sort(function(a,b){return a.localeCompare(b,'vi',{numeric:true});}).map(function(value){
      var label=bankTaxonomyConsensusLabel(groups[value],labelField,(prefix||'')+value);
      return {value:value,label:label,rows:groups[value]};
    });
  }

  function bankFillTaxonomySelect(id,options,placeholder,enabled) {
    var select=el(id);if(!select)return '';
    var previous=String(select.value||'');
    var valid=(options||[]).some(function(option){return String(option.value)===previous;});
    select.innerHTML='<option value="">'+esc(placeholder)+'</option>'+(options||[]).map(function(option){
      var text=option.text||option.value+(option.label&&option.label!==String(option.value)?' · '+option.label:'');
      return '<option value="'+esc(option.value)+'">'+esc(text)+'</option>';
    }).join('');
    select.disabled=!enabled||!(options||[]).length;
    select.value=valid?previous:'';
    return select.value;
  }

  function bankRenderTaxonomySuggestions() {
    var catalog=state.bank.taxonomyCatalog||[];
    var schemaOptions=bankTaxonomyOptionGroups(catalog,'schema_name','schema_label','').map(function(option){
      option.text=option.value==='legacy-v1'
        ? 'legacy-v1 · THPT 10–12'
        : option.value+(option.label&&option.label!==option.value?' · '+option.label:'');
      return option;
    });
    var schemaSelect=el('bankTaxSchema');
    var schema=bankFillTaxonomySelect('bankTaxSchema',schemaOptions,'Chọn hệ ID',true);
    if(!schema&&schemaSelect&&schemaOptions.length){
      schema=schemaOptions.some(function(option){return option.value==='legacy-v1';})?'legacy-v1':schemaOptions[0].value;
      schemaSelect.value=schema;
    }
    var gradeGroups=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema}),'grade_code','grade_label','');
    var gradeOptions=gradeGroups.map(function(option){
      var row=option.rows&&option.rows[0];
      option.text='Khối '+String(row&&row.grade||option.value);
      return option;
    });
    var grade=bankFillTaxonomySelect('bankTaxGrade',gradeOptions,schema?'Chọn khối':'Chọn hệ ID trước',!!schema);
    var areas=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema,grade_code:grade}),'area','area_label','Mảng ');
    var area=bankFillTaxonomySelect('bankTaxArea',areas,grade?'Chọn mảng':'Chọn khối trước',!!grade);
    var chapters=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema,grade_code:grade,area:area}),'chapter','chapter_label','Chương ');
    var chapter=bankFillTaxonomySelect('bankTaxChapter',chapters,area?'Chọn chương':'Chọn mảng trước',!!area);
    var skills=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema,grade_code:grade,area:area,chapter:chapter}),'skill','skill_label','Bài / kỹ năng ');
    var skill=bankFillTaxonomySelect('bankTaxSkill',skills,chapter?'Chọn bài / kỹ năng':'Chọn chương trước',!!chapter);
    var variants=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema,grade_code:grade,area:area,chapter:chapter,skill:skill}),'variant','variant_label','Dạng ');
    bankFillTaxonomySelect('bankTaxVariant',variants,skill?'Chọn dạng bài cụ thể':'Chọn bài / kỹ năng trước',!!skill);
  }

  function bankTaxonomyGradeStats(schemaName,gradeCode) {
    var rows=bankTaxonomyFiltered({schema_name:schemaName,grade_code:gradeCode});
    var chapters=new Set(),skills=new Set(),labels=new Set();
    rows.forEach(function(row){
      chapters.add(row.area+'|'+row.chapter);skills.add(row.area+'|'+row.chapter+'|'+row.skill);
      var label=String(row.variant_label||row.label||'').trim();if(label)labels.add(label);
    });
    return {rows:rows,count:rows.length,chapters:chapters.size,skills:skills.size,labels:labels.size};
  }

  function bankRenderTaxonomyBrowser() {
    var schema=el('bankTaxSchema')&&el('bankTaxSchema').value||'legacy-v1';
    var grade=el('bankTaxGrade')&&el('bankTaxGrade').value;
    var gradeGroups=bankTaxonomyOptionGroups(bankTaxonomyFiltered({schema_name:schema}),'grade_code','grade_label','');
    var tabs=el('bankTaxonomyGradeTabs');
    if(tabs)tabs.innerHTML=gradeGroups.map(function(group){
      var row=group.rows&&group.rows[0],actual=row&&row.grade||group.value,stats=bankTaxonomyGradeStats(schema,group.value);
      return '<button type="button" data-taxonomy-grade="'+esc(group.value)+'" onclick="VMExamAdmin.bankSelectTaxonomyGrade(\''+esc(group.value)+'\',\''+esc(schema)+'\')"'+(grade===group.value?' class="active" aria-selected="true"':' aria-selected="false"')+'><b>Khối '+esc(actual)+'</b><small>'+stats.count+' họ mã · '+stats.labels+' dạng</small></button>';
    });
    var schemaRows=bankTaxonomyFiltered({schema_name:schema});
    var stats=grade?bankTaxonomyGradeStats(schema,grade):{rows:schemaRows,count:schemaRows.length,chapters:0,skills:0,labels:0};
    if(!grade){var allChapters=new Set(),allSkills=new Set();stats.rows.forEach(function(row){allChapters.add(row.area+'|'+row.chapter);allSkills.add(row.area+'|'+row.chapter+'|'+row.skill);});stats.chapters=allChapters.size;stats.skills=allSkills.size;}
    if(!grade){var allLabels=new Set();stats.rows.forEach(function(row){var label=String(row.variant_label||row.label||'').trim();if(label)allLabels.add(label);});stats.labels=allLabels.size;}
    var summary=el('bankTaxonomyExplorerSummary');
    var activeGradeRow=stats.rows&&stats.rows[0];
    if(summary)summary.textContent=schema+' · '+(grade?'Khối '+(activeGradeRow&&activeGradeRow.grade||grade)+' · ':'Toàn bộ · ')+stats.count+' họ mã · '+stats.skills+' bài/kỹ năng · '+stats.labels+' dạng';
    var query=String(state.bank.taxonomyBrowserQuery||'').trim().toLocaleLowerCase('vi');
    var rows=stats.rows.filter(function(row){
      if(!query)return true;
      return [row.catalog_key,row.area_label,row.chapter_label,row.skill_label,row.variant_label,row.label].join(' ').toLocaleLowerCase('vi').indexOf(query)>=0;
    });
    var list=el('bankTaxonomyFamilyList');if(!list)return;
    if(!rows.length){list.innerHTML='<div class="exam-empty"><div><strong>Không có họ mã phù hợp</strong>Thử đổi khối hoặc từ khóa.</div></div>';return;}
    var shown=rows.slice(0,120);
    list.innerHTML=shown.map(function(row){
      var chapter=bankTaxonomyConsensusLabel(bankTaxonomyFiltered({schema_name:row.schema_name,grade_code:row.grade_code,area:row.area,chapter:row.chapter}),'chapter_label','Chương '+row.chapter);
      var skill=bankTaxonomyConsensusLabel(bankTaxonomyFiltered({schema_name:row.schema_name,grade_code:row.grade_code,area:row.area,chapter:row.chapter,skill:row.skill}),'skill_label','Bài / kỹ năng '+row.skill);
      var variant=String(row.variant_label||row.label||('Dạng '+row.variant));
      return '<button type="button" class="bank-taxonomy-family" onclick="VMExamAdmin.bankChooseTaxonomy(\''+esc(row.catalog_key)+'\')"><code>'+esc(row.catalog_key)+'</code><span><b>'+esc(variant)+'</b><small>'+esc((row.area_label||('Mảng '+row.area))+' · '+chapter+' · '+skill)+'</small></span><i>Chọn</i></button>';
    }).join('')+(rows.length>shown.length?'<p class="bank-taxonomy-more">Đang hiện '+shown.length+' / '+rows.length+' họ mã. Nhập từ khóa để thu hẹp.</p>':'');
  }

  function bankRenderTaxonomyCatalog(message) {
    var select = el('bankTaxonomyCatalogSelect');
    var status = el('bankTaxonomyCatalogStatus');
    if (!select) return;
    bankRenderTaxonomySuggestions();
    var schema=el('bankTaxSchema')&&el('bankTaxSchema').value;
    var grade=el('bankTaxGrade')&&el('bankTaxGrade').value;
    var catalog = bankTaxonomyFiltered({schema_name:schema,grade_code:grade});
    select.innerHTML = '<option value="">'+(catalog.length?'Chọn một họ mã đã chuẩn hóa':'Danh mục chưa sẵn sàng')+'</option>' + catalog.map(function (entry) {
      var label=String(entry.variant_label||entry.label||'').trim();
      return '<option value="'+esc(entry.catalog_key)+'">'+esc(entry.catalog_key+' · '+label)+'</option>';
    }).join('');
    if (status) status.textContent = message || (catalog.length ? 'Đang hiển thị '+catalog.length+' / '+(state.bank.taxonomyCatalog||[]).length+' họ mã.' : 'Danh mục chưa sẵn sàng; dữ liệu đang nhập vẫn được giữ nguyên.');
    bankRenderTaxonomyBrowser();
  }

  async function bankLoadTaxonomyCatalog(silent) {
    if (!state.bank.access.canAdmin) return;
    var status = el('bankTaxonomyCatalogStatus');
    if (status) status.textContent = 'Đang tải danh mục phân loại…';
    if (!window.sb || typeof window.sb.rpc !== 'function') {
      state.bank.taxonomyCatalog = [];
      state.bank.taxonomyCatalogLoaded = false;
      bankRenderTaxonomyCatalog('Chưa kết nối được danh mục; tạm dừng phân loại để không tạo mã ngoài chuẩn gốc.');
      bankRefreshAllHierarchyControls();
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
        if (!entry || entry.status==='archived' || seen[entry.catalog_key]) return false;
        seen[entry.catalog_key] = true; return true;
      }).sort(function (a,b) { return a.catalog_key.localeCompare(b.catalog_key,'vi',{numeric:true}); });
      state.bank.taxonomyCatalogLoaded = true;
      bankRenderTaxonomyCatalog();
      bankRefreshAllHierarchyControls();
    } catch (error) {
      state.bank.taxonomyCatalog = [];
      state.bank.taxonomyCatalogLoaded = false;
      bankRenderTaxonomyCatalog(bankRpcMissing(error)
        ? 'Danh mục máy chủ chưa được bật; dùng 6 ô phân loại thủ công.'
        : 'Không tải được danh mục; dữ liệu đang nhập vẫn được giữ nguyên.');
      bankRefreshAllHierarchyControls();
      if (!silent && !bankRpcMissing(error)) toast('Chưa tải được danh mục phân loại.','err');
    }
  }

  function bankChooseTaxonomy(code) {
    if (!state.bank.access.canAdmin) return;
    var entry = state.bank.taxonomyCatalog.find(function (item) { return item.catalog_key === code; });
    if (!entry) { bankUpdateTaxonomyPreview(); return; }
    if(el('bankTaxSchema'))el('bankTaxSchema').value=entry.schema_name||'legacy-v1';
    bankRenderTaxonomySuggestions();
    el('bankTaxGrade').value = entry.grade_code;
    bankRenderTaxonomySuggestions();
    el('bankTaxArea').value = entry.area;
    bankRenderTaxonomySuggestions();
    el('bankTaxChapter').value = entry.chapter;
    bankRenderTaxonomySuggestions();
    el('bankTaxSkill').value = entry.skill;
    bankRenderTaxonomySuggestions();
    el('bankTaxVariant').value = entry.variant;
    var difficultyCode = bankTaxonomyDifficultyCode(entry.difficulty_code || entry.difficulty);
    if (difficultyCode) el('bankTaxDifficulty').value = difficultyCode;
    bankRenderTaxonomyCatalog();
    bankUpdateTaxonomyPreview();
  }

  function bankUpdateTaxonomyHierarchy(level) {
    if(!state.bank.access.canAdmin)return;
    var clear={schema:['bankTaxGrade','bankTaxArea','bankTaxChapter','bankTaxSkill','bankTaxVariant'],grade:['bankTaxArea','bankTaxChapter','bankTaxSkill','bankTaxVariant'],area:['bankTaxChapter','bankTaxSkill','bankTaxVariant'],chapter:['bankTaxSkill','bankTaxVariant'],skill:['bankTaxVariant'],variant:[]};
    (clear[level]||[]).forEach(function(id){if(el(id))el(id).value='';});
    bankRenderTaxonomyCatalog();
    bankUpdateTaxonomyPreview();
  }

  function bankSelectTaxonomyGrade(gradeCode,schemaName) {
    if(!state.bank.access.canAdmin||!el('bankTaxGrade'))return;
    if(schemaName&&el('bankTaxSchema'))el('bankTaxSchema').value=String(schemaName).toLowerCase();
    bankRenderTaxonomySuggestions();
    var schema=el('bankTaxSchema')&&el('bankTaxSchema').value||'legacy-v1';
    el('bankTaxGrade').value=bankTaxonomyGradeCode(gradeCode,schema);
    bankUpdateTaxonomyHierarchy('grade');
  }

  function bankFilterTaxonomyCatalog() {
    var input=el('bankTaxonomyBrowserSearch');
    state.bank.taxonomyBrowserQuery=String(input&&input.value||'');
    bankRenderTaxonomyBrowser();
  }

  function bankCurrentTaxonomyCode() {
    return bankTaxonomyCode({
      schema_name:el('bankTaxSchema') && el('bankTaxSchema').value,
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
    var familyKey = parsed ? parsed.taxonomy_key : '';
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

  function bankDefaultPastedTitle() {
    if(state.bank.importMode==='complete_exam')return 'Đề TeX chưa đặt tên';
    var scope=bankImportTopicScopeLabel();
    return scope&&scope!=='Chưa chọn phạm vi'?'Gói câu · '+scope:'Gói câu TeX chưa đặt tên';
  }

  function bankClearPastedTex() {
    if(!state.bank.access.canImport)return;
    var area=el('bankPasteTex');if(!area)return;
    var hasPastedQueue=state.bank.documents.some(function(document){return document.inputMethod==='paste';});
    if(hasPastedQueue&&state.bank.items.length&&!confirm('Xóa cả nội dung đã dán và danh sách câu vừa tách?'))return;
    area.value='';area.focus();
    if(hasPastedQueue){state.bank.documents=[];state.bank.items=[];state.bank.parseErrors=[];state.bank.visibleLimit=120;bankRenderLocal();}
    if(el('bankPasteAssetWarning'))el('bankPasteAssetWarning').hidden=true;
  }

  function bankParsePastedTex() {
    if(!state.bank.access.canImport){toast('Tài khoản này chưa được cấp quyền gửi nguồn TeX.','err');return;}
    var parser=window.VinhMathQuestionBank,area=el('bankPasteTex'),raw=String(area&&area.value||'').trim();
    if(!parser){toast('Chưa tải được bộ đọc ngân hàng TeX.','err');return;}
    if(!raw){toast('Hãy dán nội dung TeX cần tách câu.','err');if(area)area.focus();return;}
    if(state.bank.items.length&&!confirm('Thay danh sách câu đang chờ nhập bằng nội dung TeX vừa dán?'))return;
    var title=String(el('bankImportTitle')&&el('bankImportTitle').value||'').trim()||bankDefaultPastedTitle();
    if(el('bankImportTitle')&&!el('bankImportTitle').value.trim())el('bankImportTitle').value=title;
    var fileName=bankPreviewSlug(title)+'.tex',parsed;
    try{parsed=parser.parseDocument(raw,{sourcePath:fileName});}
    catch(error){toast('Không tách được nội dung TeX: '+String(error&&error.message||error),'err');return;}
    if(!parsed.questions||!parsed.questions.length){toast('Chưa tìm thấy môi trường câu hỏi. Hãy kiểm tra các khối \\begin{ex}…\\end{ex} hoặc \\begin{bt}…\\end{bt}.','err');return;}
    state.bank.documents=[{file:null,fileName:fileName,path:'Dán trực tiếp · '+fileName,text:raw,contentHash:parser.hashText(raw),parsed:parsed,inputMethod:'paste'}];
    state.bank.items=[];state.bank.parseErrors=(parsed.errors||[]).map(function(error){return {path:fileName,error:error};});state.bank.visibleLimit=120;
    parsed.questions.forEach(function(question,index){
      question._bankDocumentIndex=0;question._bankIndex=index;question._bankSelected=state.bank.importMode==='topic_pack'&&!question.question_id;bankRefreshQuestion(question);state.bank.items.push(question);
    });
    if(state.bank.importMode==='complete_exam'){
      var firstPastedMissing=state.bank.items.find(function(question){return !bankHasClassification(question);});
      if(firstPastedMissing)firstPastedMissing._bankSelected=true;
    }
    var hasExternalAssets=/\\includegraphics\b/i.test(raw)||state.bank.items.some(function(question){return !!question.has_assets;});
    if(el('bankPasteAssetWarning'))el('bankPasteAssetWarning').hidden=!hasExternalAssets;
    bankSyncTaxonomyFromImportScope();
    bankRenderLocal();
    var summary=el('bankLocalSummary');if(summary)summary.scrollIntoView({behavior:'smooth',block:'center'});
    toast('Đã tách '+state.bank.items.length+' câu. Các câu thiếu ID đã được chọn để phân loại.','ok');
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

  function bankAdminPackageChunkInfo(record,lineNumber) {
    var required=['document_total_items','document_chunk','document_chunks'];
    var missing=required.filter(function(name){
      return !Object.prototype.hasOwnProperty.call(record,name)||record[name]===null||record[name]==='';
    });
    if(missing.length)throw new Error('Gói JSONL v1 ở dòng '+lineNumber+' thiếu metadata bắt buộc: '+missing.join(', ')+'. Không có dữ liệu nào được nhập; hãy xuất lại gói bằng phiên bản mới.');
    var expectedCount=Number(record.document_total_items),chunkNumber=Number(record.document_chunk),chunkCount=Number(record.document_chunks);
    if(!Number.isSafeInteger(expectedCount)||expectedCount<1||!Number.isSafeInteger(chunkNumber)||chunkNumber<1||!Number.isSafeInteger(chunkCount)||chunkCount<1||chunkNumber>chunkCount){
      throw new Error('Metadata chunk ở dòng '+lineNumber+' không hợp lệ. document_total_items, document_chunk và document_chunks phải là số nguyên dương; document_chunk không được vượt document_chunks.');
    }
    return {expectedCount:expectedCount,chunkNumber:chunkNumber,chunkCount:chunkCount,isFinalChunk:chunkNumber===chunkCount};
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
      var preflightRecords=0;
      await bankReadJsonl(file,function(record,lineNumber){
        if(!record||record.schema_version!=='vinhmath.question-bank.admin-package.v1')throw new Error('Dòng '+lineNumber+' không phải gói admin VinhMath.');
        preflightRecords+=1;
        if(record.record_type==='taxonomy')return;
        if(record.record_type!=='document_chunk')throw new Error('Loại bản ghi không hỗ trợ ở dòng '+lineNumber+'.');
        bankAdminPackageChunkInfo(record,lineNumber);
      });
      if(!preflightRecords)throw new Error('Gói không có dữ liệu.');
      bankSetImportProgress(0,1,'Cấu trúc gói hợp lệ · đang bắt đầu nhập…');
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
        var chunkInfo=bankAdminPackageChunkInfo(record,lineNumber);
        var expectedCount=chunkInfo.expectedCount;
        var isFinalChunk=chunkInfo.isFinalChunk;
        var importMetadata={import_state:isFinalChunk?'complete':'staged',expected_count:expectedCount};
        var documentPayload;
        if(documentIds[key])documentPayload={id:documentIds[key],raw_tex:'',metadata:importMetadata};
        else {
          documentPayload=Object.assign({},record.document||{});
          if(!String(documentPayload.raw_tex||'').trim())throw new Error('Lô đầu của tài liệu '+key+' không có TeX nguồn. Hãy nhập lại từ đầu gói.');
          documentPayload.metadata=Object.assign({},documentPayload.metadata||{},importMetadata);
        }
        var response=await sb.rpc('vm_bank_admin_import',{p_document:documentPayload,p_items:items});
        if(response.error)throw response.error;
        if(response.data&&response.data.error)throw new Error(response.data.error);
        var result=response.data||{};
        if(result.document_id)documentIds[key]=result.document_id;
        if(isFinalChunk){
          var serverDocumentId=documentIds[key];
          if(!serverDocumentId)throw new Error('Máy chủ chưa trả mã tài liệu '+key+' để hoàn tất nhập kho.');
          var finalize=await sb.rpc('vm_bank_admin_finalize_document',{p_document_id:serverDocumentId,p_expected_count:expectedCount});
          if(finalize.error)throw finalize.error;
          if(finalize.data&&finalize.data.error)throw new Error(finalize.data.error);
          if(!finalize.data||finalize.data.ready!==true)throw new Error('Tài liệu '+key+' chưa vượt qua kiểm tra hoàn tất.');
        }
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

  function bankSelectNextMissingId(silent) {
    var current=state.bank.items.findIndex(function(question){return !!question._bankSelected;}),next=-1;
    for(var i=current+1;i<state.bank.items.length;i++){if(!bankHasClassification(state.bank.items[i])){next=i;break;}}
    if(next<0){for(var j=0;j<=current;j++){if(!bankHasClassification(state.bank.items[j])){next=j;break;}}}
    state.bank.items.forEach(function(question,index){question._bankSelected=index===next;});
    if(next>=0)state.bank.visibleLimit=Math.max(state.bank.visibleLimit,next+1);
    bankRenderLocal();
    if(next>=0){
      var row=document.querySelector('[data-bank-question-index="'+next+'"]');if(row)row.scrollIntoView({behavior:'smooth',block:'center'});
      if(!silent)toast('Đã chuyển đến câu '+(next+1)+' đang thiếu ID.','ok');
    }else if(!silent)toast('Tất cả câu đã có mã phân loại hợp lệ.','ok');
    return next;
  }

  function bankSelectMissingIds() {
    if (!state.bank.access.canAdmin) return;
    if(state.bank.importMode==='complete_exam'){bankSelectNextMissingId(false);return;}
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
    if(state.bank.importMode==='complete_exam'&&selected.length>1){toast('Nguyên đề có nhiều kiến thức: hãy gắn ID lần lượt từng câu để tránh phân loại sai hàng loạt.','err');return;}
    selected.forEach(function (question) {
      question.question_id = code;
      question._bankSelected = false;
      bankRefreshQuestion(question);
    });
    var next=state.bank.importMode==='complete_exam'?bankSelectNextMissingId(true):-1;
    if(state.bank.importMode!=='complete_exam')bankRenderLocal();
    toast('Đã áp dụng mã '+code+' cho '+selected.length+' câu.'+(next>=0?' Đã chuyển sang câu tiếp theo thiếu ID.':''),'ok');
  }

  function bankRenderLocal() {
    var items = state.bank.items;
    var active = items.filter(function (q) { return q._bankStatus === 'active'; }).length;
    var quarantined = items.length - active;
    var summary = el('bankLocalSummary');
    if (summary) summary.innerHTML = '<span>'+state.bank.documents.length+' tệp</span><span>'+items.length+' câu</span><span>✓ '+active+' hợp lệ</span><span>⚠ '+quarantined+' cách ly</span>'+(state.bank.parseErrors.length?'<span>'+state.bank.parseErrors.length+' lỗi cấu trúc tệp</span>':'');
    var previewButton=el('bankImportPreviewButton');if(previewButton)previewButton.hidden=!items.length;
    var delegatedButton=el('bankDelegatedImportButton');if(delegatedButton)delegatedButton.disabled=!state.bank.documents.length;
    var localMatrix=el('bankLocalMatrix');
    if(localMatrix){
      var matrixRows=bankMatrixRows(items),matrixHtml=[];
      Object.keys(matrixRows).forEach(function(key){var row=matrixRows[key];if(!row.total)return;matrixHtml.push('<span><b>'+row.total+'</b> '+esc(row.label)+'</span>');});
      ['NB','TH','VD','VDC'].forEach(function(level){var count=items.filter(function(question){return String(question.difficulty||'').toUpperCase()===level;}).length;if(count)matrixHtml.push('<span><b>'+count+'</b> '+level+'</span>');});
      localMatrix.innerHTML=matrixHtml.join('');localMatrix.hidden=!matrixHtml.length;
    }
    if (el('bankBulkTools')) el('bankBulkTools').hidden = !items.length;
    var list = el('bankQuestionList');
    if (!list) return;
    if (!items.length) { list.innerHTML = ''; if (el('bankLoadMore')) el('bankLoadMore').hidden = true; bankUpdateSelectionStatus(); return; }
    var visible = items.slice(0, state.bank.visibleLimit);
    list.innerHTML = visible.map(function (q, index) {
      var globalIndex = q._bankIndex;
      var source = state.bank.documents[q._bankDocumentIndex] || {};
      return '<article class="bank-question-item '+(q._bankStatus==='quarantined'?'quarantined ':'')+(q._bankSelected?'selected':'')+'" data-bank-question-index="'+globalIndex+'">'+
        '<div class="bank-question-select bank-admin-only-ui"><label><input type="checkbox" '+(q._bankSelected?'checked':'')+' onchange="VMExamAdmin.bankToggleQuestionSelection('+globalIndex+',this.checked)" aria-label="Chọn câu '+(globalIndex+1)+'"><span class="bank-question-index">#'+(globalIndex+1)+'</span></label></div><div class="bank-question-main"><div class="bank-question-top"><span class="bank-chip">'+esc(bankTypeLabel(q.type))+'</span><span class="bank-chip">'+esc(q.grade||'Chưa rõ khối')+'</span><span class="bank-chip">'+esc(q.difficulty||'Chưa rõ mức')+'</span><span class="bank-chip '+(q._bankStatus==='active'?'ok':'warn')+'">'+(q._bankStatus==='active'?'Hợp lệ':'Cách ly')+'</span>'+(q.has_assets?'<span class="bank-chip">Có hình</span>':'')+'</div><p>'+esc(stripLatex(q.content_tex).slice(0,230)||'Câu hỏi chưa có nội dung hiển thị')+'</p><span class="bank-question-source">'+esc(source.path||q.source_path||'Tệp TeX')+' · vị trí '+(Number(q.source_index||0)+1)+'</span>'+(state.bank.access.canAdmin?'<span class="bank-answer-summary">Đáp án nội bộ: '+esc(bankAnswerSummary(q))+'</span>':'')+'<button class="btn btn-secondary btn-sm bank-preview-open" type="button" onclick="VMExamAdmin.bankOpenLocalPreview('+globalIndex+')">🌐 Xem HTML / PDF</button></div>'+
        '<div class="bank-question-id bank-admin-only-ui"><label for="bankItemId'+globalIndex+'">Mã phân loại</label><input class="input" id="bankItemId'+globalIndex+'" value="'+esc(q.question_id||'')+'" placeholder="Ví dụ: 2D1H3-1" onchange="VMExamAdmin.bankUpdateId('+globalIndex+',this.value)"><small>Giữ chuẩn mã; UID/hash được tạo tự động và không đổi.</small>'+(q._bankReason?'<span class="bank-question-reason">'+esc(q._bankReason)+'</span>':'')+'</div></article>';
    }).join('');
    var more = el('bankLoadMore');
    if (more) { more.hidden = visible.length >= items.length; more.textContent = 'Hiện thêm '+Math.min(120,items.length-visible.length)+' câu'; }
    bankUpdateSelectionStatus();
  }

  async function bankSelectFiles(fileList) {
    if (!state.bank.access.canImport) return;
    var parser = window.VinhMathQuestionBank;
    if (!parser) { toast('Chưa tải được bộ đọc ngân hàng TeX.','err'); return; }
    var files = Array.from(fileList || []).filter(function (file) { return /\.tex$/i.test(file.name || ''); }).sort(function (a,b) { return String(a.webkitRelativePath||a.name).localeCompare(String(b.webkitRelativePath||b.name),'vi'); });
    if (!files.length) { toast('Chỉ nhận tệp có đuôi .tex.','err'); return; }
    if (state.bank.importMode==='complete_exam' && files.length>1) { toast('Mỗi nguyên đề chỉ nhận một tệp TeX. Hãy nạp từng đề riêng để giữ đúng tên và thứ tự câu.','err'); return; }
    state.bank.documents = []; state.bank.items = []; state.bank.parseErrors = []; state.bank.visibleLimit = 120;
    if(el('bankPasteAssetWarning'))el('bankPasteAssetWarning').hidden=true;
    if (el('bankLocalSummary')) el('bankLocalSummary').innerHTML = '<span>Đang đọc 0 / '+files.length+' tệp…</span>';
    for (var i=0;i<files.length;i++) {
      var file = files[i];
      try {
        var text = await bankReadFile(file);
        var path = file.webkitRelativePath || file.name;
        var parsed = parser.parseDocument(text, {sourcePath:path});
        var documentIndex = state.bank.documents.length;
        var document = {file:file,fileName:file.name,path:path,text:text,contentHash:parser.hashText(text),parsed:parsed,inputMethod:'file'};
        state.bank.documents.push(document);
        (parsed.errors || []).forEach(function (error) { state.bank.parseErrors.push({path:path,error:error}); });
        (parsed.questions || []).forEach(function (question) {
          question._bankDocumentIndex = documentIndex;
          question._bankIndex = state.bank.items.length;
          question._bankSelected = state.bank.importMode==='topic_pack'&&!question.question_id;
          bankRefreshQuestion(question);
          state.bank.items.push(question);
        });
      } catch (error) {
        state.bank.parseErrors.push({path:file.name,error:{code:'READ_ERROR',message:error.message||String(error)}});
      }
      if (el('bankLocalSummary')) el('bankLocalSummary').innerHTML = '<span>Đang đọc '+(i+1)+' / '+files.length+' tệp…</span>';
      if (i % 12 === 0) await new Promise(function (resolve) { setTimeout(resolve,0); });
    }
    if(state.bank.importMode==='complete_exam'){
      var firstFileMissing=state.bank.items.find(function(question){return !bankHasClassification(question);});
      if(firstFileMissing)firstFileMissing._bankSelected=true;
    }
    bankSyncTaxonomyFromImportScope();
    bankRenderLocal();
    toast('Đã nhận diện '+state.bank.items.length+' câu từ '+state.bank.documents.length+' tệp. Câu thiếu ID đã được chọn.','ok');
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

  function bankExamKindTags(kind) {
    var tags={
      thpt_official:['thptqg','official','đề chính thức'],
      thpt_reference:['thptqg','reference','đề tham khảo','minh họa'],
      thpt_mock:['thptqg','mock','thi thử'],
      midterm:['midterm','giữa kỳ'],
      final:['final','cuối kỳ'],
      semester_1:['semester','học kỳ','hk1'],
      semester_2:['semester','học kỳ','hk2'],
      chapter:['chapter','kiểm tra chương'],
      other:['other']
    };
    return (tags[kind]||tags.other).slice();
  }

  function bankImportMetadata() {
    var mode=state.bank.importMode==='complete_exam'?'complete_exam':'topic_pack';
    var year=parseInt(el('bankImportYear')&&el('bankImportYear').value,10)||null;
    if(mode==='topic_pack'){
      var chapter=bankImportChapterParts(),skill=parseInt(el('bankImportTopicLesson')&&el('bankImportTopicLesson').value,10)||null;
      return {mode:mode,source_kind:'topic_pack',source_origin:'topic_pack',exam_kind:'topic_pack',grade:parseInt(el('bankImportTopicGrade')&&el('bankImportTopicGrade').value,10)||null,area:chapter.area,chapter:chapter.chapter,skill:skill,unit:null,year:null,tags:['topic_pack'].concat(chapter.area?['area_'+chapter.area]:[],chapter.chapter?['chapter_'+chapter.chapter]:[],skill?['skill_'+skill]:[])};
    }
    var kind=String(el('bankImportExamType')&&el('bankImportExamType').value||'other');
    var schoolYear=String(el('bankImportSchoolYear')&&el('bankImportSchoolYear').value||'').trim()||null;
    var term=parseInt(el('bankImportTerm')&&el('bankImportTerm').value,10)||null;
    if(kind==='semester_1')term=1;if(kind==='semester_2')term=2;
    var title=String(el('bankImportTitle')&&el('bankImportTitle').value||'').trim();
    var origin=String(el('bankImportOrigin')&&el('bankImportOrigin').value||'province_exam');
    if(/^dethamkhao\s*\d+/i.test(title))origin='authored';
    return {mode:mode,source_kind:'mock_exam',source_origin:origin,exam_kind:kind,grade:parseInt(el('bankImportExamGrade')&&el('bankImportExamGrade').value,10)||null,area:null,chapter:null,skill:null,unit:String(el('bankImportUnit')&&el('bankImportUnit').value||'').trim()||null,year:year,school_year:schoolYear,term:term,tags:['complete_exam','origin_'+origin].concat(bankExamKindTags(kind),schoolYear?['school_year_'+schoolYear]:[],term?['term_'+term]:[])};
  }

  function bankValidateImportMetadata() {
    var meta=bankImportMetadata();
    var title=String(el('bankImportTitle')&&el('bankImportTitle').value||'').trim();
    if(!title){toast(meta.mode==='topic_pack'?'Hãy đặt tên gói câu.':'Hãy đặt tên nguyên đề.','err');if(el('bankImportTitle'))el('bankImportTitle').focus();return false;}
    if(meta.mode==='topic_pack'&&(!meta.grade||!meta.area||!meta.chapter)){
      toast('Hãy chọn đúng khối và chương cho gói câu trước khi nhập.','err');
      var grade=el('bankImportTopicGrade');if(grade)grade.focus();return false;
    }
    if(meta.mode==='complete_exam'&&(!meta.grade||!meta.exam_kind||!meta.year)){
      toast('Hãy chọn loại đề, khối và năm của đề nguồn.','err');return false;
    }
    if(meta.mode==='complete_exam'&&['midterm','final','semester_1','semester_2'].indexOf(meta.exam_kind)>=0&&(!meta.school_year||!meta.term)){
      toast('Đề giữa kỳ / cuối kỳ cần đủ niên khóa và học kỳ.','err');return false;
    }
    return true;
  }

  function bankCatalogEntryForQuestion(question) {
    var parsed=question&&question.id_info;
    if(!parsed)return null;
    var familyKey=parsed.taxonomy_key;
    return (state.bank.taxonomyCatalog||[]).find(function(entry){
      return entry.catalog_key===parsed.id||entry.catalog_key===familyKey;
    })||null;
  }

  function bankImportValidationIssues(meta) {
    var issues=[];
    if(state.bank.parseErrors.length)issues.push(state.bank.parseErrors.length+' lỗi cấu trúc TeX');
    state.bank.items.forEach(function(question,index){
      var number=index+1;
      if(!bankHasClassification(question)){issues.push('Câu '+number+' chưa có ID đúng chuẩn');return;}
      if(state.bank.taxonomyCatalogLoaded&&!bankCatalogEntryForQuestion(question)){issues.push('Câu '+number+' có ID chưa tồn tại trong danh mục chuẩn');return;}
      if(question._bankStatus!=='active'){issues.push('Câu '+number+': '+(question._bankReason||'chưa đủ điều kiện sử dụng'));return;}
      if(meta.mode==='topic_pack'){
        if(Number(question.grade)!==Number(meta.grade)||String(question.area||'').toUpperCase()!==String(meta.area||'').toUpperCase()||Number(question.chapter)!==Number(meta.chapter)||(meta.skill&&Number(question.skill)!==Number(meta.skill))){
          issues.push('Câu '+number+' lệch phạm vi '+bankImportTopicScopeLabel());
        }
      }else if(Number(question.grade)!==Number(meta.grade)){
        issues.push('Câu '+number+' không thuộc khối '+meta.grade);
      }
    });
    return issues;
  }

  function bankDocumentPayload(document, transfer) {
    transfer=transfer||{};
    var expectedCount=Number(transfer.expectedCount||(document.parsed&&document.parsed.questions||[]).length||0);
    var importState=transfer.final?'complete':'staged';
    if (document._serverId) return {id:document._serverId,raw_tex:'',metadata:{import_state:importState,expected_count:expectedCount}};
    var baseName = String(document.fileName || 'de-tex').replace(/\.tex$/i,'');
    var sharedTitle = String(el('bankImportTitle').value || '').trim();
    var title = sharedTitle ? (state.bank.documents.length > 1 ? sharedTitle+' · '+baseName : sharedTitle) : baseName;
    var importMeta=bankImportMetadata(),unit=importMeta.unit,year=importMeta.year,examType=importMeta.exam_kind,sourceKind=importMeta.source_kind;
    return {
      title:title, source_kind:sourceKind, province:unit, exam_year:year, exam_kind:examType,
      tags:importMeta.tags,
      original_filename:document.fileName,
      content_hash:document.contentHash, raw_tex:document.text,
      metadata:{source_title:title,source_origin:importMeta.source_origin,content_mode:importMeta.mode,import_state:importState,expected_count:expectedCount,province_or_unit:unit,exam_year:year,academic_year:importMeta.school_year||(year?String(year):null),school_year:importMeta.school_year||null,term:importMeta.term||null,exam_type:examType,grade:importMeta.grade,area:importMeta.area,chapter:importMeta.chapter,topic:importMeta.skill,skill:importMeta.skill,parser_version:(window.VinhMathQuestionBank&&window.VinhMathQuestionBank.VERSION)||'unknown',question_count:(document.parsed.questions||[]).length,parse_errors:document.parsed.errors||[]},
      provenance:{relative_path:document.path,input_method:document.inputMethod||'file',size:document.file&&document.file.size||document.text.length,last_modified:document.file&&document.file.lastModified||null}
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

  async function bankDelegateImport() {
    if (!state.bank.access.canImport || state.bank.access.canAdmin || !state.bank.documents.length) return;
    if (!bankValidateImportMetadata()) return;
    var button = el('bankDelegatedImportButton'), total = state.bank.documents.length, done = 0;
    if (button) { button.disabled = true; button.textContent = 'Đang gửi…'; }
    try {
      for (var index=0;index<state.bank.documents.length;index++) {
        var documentItem = state.bank.documents[index];
        if (!String(documentItem.text || '').trim()) throw new Error('Tệp '+(documentItem.fileName || index+1)+' không có nội dung TeX.');
        var payload = bankDocumentPayload(documentItem,{expectedCount:(documentItem.parsed&&documentItem.parsed.questions||[]).length,final:false});
        payload.metadata = Object.assign({},payload.metadata||{}, {
          import_state:'pending_review', review_status:'pending_review', delegated_upload:true
        });
        var response = await sb.rpc('vm_bank_delegate_upload_tex',{p_document:payload});
        if (response.error) throw response.error;
        if (response.data && response.data.error) throw new Error(response.data.error);
        done += 1;
        bankSetImportProgress(done,total,'Đã gửi '+done+' / '+total+' nguồn vào hàng chờ');
      }
      bankSetImportProgress(total,total,'Đã gửi đủ '+total+' nguồn · đang chờ kiểm tra');
      toast('Đã gửi nguồn TeX. Nội dung sẽ xuất hiện trong kho sau khi được kiểm tra.','ok');
    } catch (error) {
      if (bankRpcMissing(error)) {
        state.bank.access.canImport = false;
        bankConfigureAccess(state.profile,state.bank.access);
      }
      bankSetImportProgress(done,total,'Dừng ở '+done+' / '+total+' nguồn');
      toast('Chưa gửi được nguồn: '+bankSafeError(error),'err');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Gửi nguồn chờ duyệt'; }
    }
  }

  async function bankImport() {
    if (!state.bank.access.canImport || !state.bank.documents.length) return;
    if (!state.bank.access.canAdmin) return bankDelegateImport();
    if (!state.bank.items.length) return;
    if(!bankValidateImportMetadata())return;
    if(!state.bank.taxonomyCatalogLoaded)await bankLoadTaxonomyCatalog(false);
    if(!state.bank.taxonomyCatalogLoaded){toast('Chưa tải được danh mục ID chuẩn. Hãy thử tải lại danh mục trước khi nhập.','err');return;}
    var importMeta=bankImportMetadata(),issues=bankImportValidationIssues(importMeta);
    if(issues.length){
      var firstInvalid=state.bank.items.findIndex(function(question){
        if(!bankHasClassification(question)||question._bankStatus!=='active'||!bankCatalogEntryForQuestion(question))return true;
        if(importMeta.mode==='topic_pack')return Number(question.grade)!==Number(importMeta.grade)||String(question.area||'').toUpperCase()!==String(importMeta.area||'').toUpperCase()||Number(question.chapter)!==Number(importMeta.chapter)||(importMeta.skill&&Number(question.skill)!==Number(importMeta.skill));
        return Number(question.grade)!==Number(importMeta.grade);
      });
      state.bank.items.forEach(function(question,index){question._bankSelected=index===firstInvalid;});bankRenderLocal();
      toast('Chưa thể nhập: '+issues.slice(0,3).join(' · ')+(issues.length>3?' · và '+(issues.length-3)+' lỗi khác':''),'err');
      var invalidRow=firstInvalid>=0&&document.querySelector('[data-bank-question-index="'+firstInvalid+'"]');if(invalidRow)invalidRow.scrollIntoView({behavior:'smooth',block:'center'});return;
    }
    var button = el('bankImportButton'), total = state.bank.items.length, done = 0;
    button.disabled = true; button.textContent = 'Đang nhập…';
    var totals = {inserted:0,updated:0,quarantined:0,linked:0};
    try {
      for (var d=0;d<state.bank.documents.length;d++) {
        var sourceDocument = state.bank.documents[d];
        var items = state.bank.items.filter(function (question) { return question._bankDocumentIndex === d; });
        for (var offset=0;offset<items.length;offset+=40) {
          var chunk=items.slice(offset,offset+40),isFinal=offset+chunk.length>=items.length;
          var response = await sb.rpc('vm_bank_admin_import',{p_document:bankDocumentPayload(sourceDocument,{expectedCount:items.length,final:isFinal}),p_items:chunk.map(bankItemPayload)});
          if (response.error) throw response.error;
          if (response.data && response.data.error) throw new Error(response.data.error);
          var result = response.data || {};
          if (result.document_id) sourceDocument._serverId = result.document_id;
          Object.keys(totals).forEach(function (key) { totals[key] += Number(result[key]||0); });
          done += Math.min(40,items.length-offset);
          bankSetImportProgress(done,total,'Đang nhập '+done+' / '+total+' câu');
        }
        if(!sourceDocument._serverId)throw new Error('Máy chủ chưa trả mã tài liệu để hoàn tất nhập kho.');
        var finalize=await sb.rpc('vm_bank_admin_finalize_document',{p_document_id:sourceDocument._serverId,p_expected_count:items.length});
        if(finalize.error)throw finalize.error;
        if(finalize.data&&finalize.data.error)throw new Error(finalize.data.error);
        if(!finalize.data||finalize.data.ready!==true)throw new Error('Nguồn đã nhập nhưng chưa vượt qua kiểm tra hoàn tất.');
      }
      bankSetServerState(true);
      bankSetImportProgress(total,total,'Hoàn tất · '+totals.inserted+' mới · '+totals.updated+' cập nhật · '+totals.quarantined+' cách ly');
      toast('Đã nhập ngân hàng đề thành công.','ok');
      await bankLoadStats(false);
      await bankLoadInventory(true);
      await bankLoadSourceCatalog();
      state.bank.repositoryLoaded=false;
      await bankLoadRepository();
      await bankLoadMatrix({status:'active'},true);
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
      state.bank.stats = Object.assign({},state.bank.stats,data,{
        documents:Number(data.documents||0),
        items:Number(data.items||0),
        active:Number(data.active||0),
        quarantined:Number(data.quarantined||0)
      });
      el('bankStatDocuments').textContent = Number(data.documents||0).toLocaleString('vi-VN');
      el('bankStatItems').textContent = Number(data.items||0).toLocaleString('vi-VN');
      el('bankStatActive').textContent = Number(data.active||0).toLocaleString('vi-VN');
      el('bankStatQuarantine').textContent = Number(data.quarantined||0).toLocaleString('vi-VN');
      if(el('bankStatIdBreakdown'))el('bankStatIdBreakdown').textContent=
        Number(data.missing_id||0).toLocaleString('vi-VN')+' thiếu ID · '+
        Number(data.invalid_id||0).toLocaleString('vi-VN')+' sai cú pháp · '+
        Number(data.unknown_taxonomy||0).toLocaleString('vi-VN')+' chờ danh mục';
      state.bank.statsLoaded = true; bankUpdateOverview(); bankSetServerState(true);
    } catch (error) {
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      if (!silent) toast('Chưa tải được thống kê ngân hàng.','err');
    }
  }

  function bankSearchFilters() {
    var grade = parseInt(el('bankSearchGrade').value,10) || null;
    var chapter = bankBrowseChapterParts();
    var skill = parseInt(el('bankSearchTopic').value,10) || null;
    var difficulty = el('bankSearchDifficulty').value;
    var type = el('bankSearchType').value;
    var legacyPrefix = state.bank.access.canAdmin && el('bankSearchPrefix') ? el('bankSearchPrefix').value.trim().toUpperCase() : '';
    return {
      query:el('bankSearchQuery').value.trim(),
      grade:grade,
      area:chapter.area,
      chapter:chapter.chapter,
      skill:skill,
      difficulties:difficulty?[difficulty]:[],
      question_types:type?[type]:[],
      legacy_prefix:legacyPrefix,
      status:'active'
    };
  }

  async function bankSearch(event) {
    if (event) event.preventDefault();
    if (!state.bank.access.canUse) return;
    var button = el('bankSearchButton'), results = el('bankSearchResults');
    button.disabled = true; results.innerHTML = '<div class="exam-empty" style="min-height:150px"><div><div class="exam-spinner"></div><strong>Đang tìm câu phù hợp</strong></div></div>';
    try {
      var filters=bankSearchFilters();
      var response = await sb.rpc('vm_bank_search',{p_filters:filters,p_limit:50,p_offset:0});
      if (response.error) throw response.error;
      var data = response.data || {}, items = Array.isArray(data) ? data : data.items || [];
      state.bank.searchItems = items;
      var total = Number(data.total==null?items.length:data.total);
      state.bank.searchTotal = total;
      el('bankSearchTotal').textContent = total.toLocaleString('vi-VN')+' câu';
      if (!items.length) results.innerHTML = '<div class="exam-empty" style="min-height:150px"><div><strong>Không có câu phù hợp</strong>Thử nới bộ lọc chuyên đề hoặc mức độ.</div></div>';
      else results.innerHTML = items.map(function (item,itemIndex) {
        var choices = Array.isArray(item.choices) ? item.choices : [];
        var identityLabel = item.legacy_code||'Chờ phân loại ID';
        var identityChip=state.bank.access.canAdmin?'<span class="bank-chip bank-internal-id"'+(item.stable_id?' title="Mã hệ thống: '+esc(item.stable_id)+'"':'')+'>Mã phân loại · '+esc(identityLabel)+'</span>':'';
        var route=['Khối '+(item.grade||'—'),item.chapter_label||(item.chapter?'Chương '+item.chapter:''),item.skill_label||(item.skill?'Bài / Chủ đề '+item.skill:'')].filter(Boolean).join(' → ');
        return '<article class="bank-result-item"><div class="bank-result-top">'+identityChip+'<span class="bank-chip">'+esc(bankTypeLabel(item.question_type))+'</span><span class="bank-chip">'+esc(item.difficulty||'—')+'</span></div><div class="bank-result-route">'+esc(route)+'</div><p>'+renderLatexFragment(item.content_latex||'',{showSolutions:false})+'</p>'+(choices.length?'<div class="bank-result-meta">'+choices.map(function(choice,choiceIndex){return '<span><b>'+esc(choice.key||choice.label||String.fromCharCode(65+choiceIndex))+'.</b> '+renderLatexFragment(choice.latex||choice.tex||'',{showSolutions:false})+'</span>';}).join(' · ')+'</div>':'')+'<div class="bank-result-meta">'+esc(item.source_label||'Nguồn đã ẩn')+'</div><button class="btn btn-secondary btn-sm bank-preview-open" type="button" data-bank-search-preview="'+itemIndex+'">🌐 Xem HTML / PDF</button></article>';
      }).join('');
      results.querySelectorAll('[data-bank-search-preview]').forEach(function (button) { button.addEventListener('click',function () { bankOpenSearchPreview(Number(button.dataset.bankSearchPreview)); }); });
      renderMath(results);if(!await bankLoadMatrix(filters,true))bankRenderMatrix(items,total,bankBrowseScopeLabel());bankSetServerState(true);
    } catch (error) {
      if (bankRpcMissing(error)) bankSetServerState(false,error);
      results.innerHTML = '<div class="exam-empty" style="min-height:150px;color:var(--err)"><div><strong>Chưa tìm được câu</strong>'+esc(bankSafeError(error))+'</div></div>';
      bankRenderMatrix([],0,bankBrowseScopeLabel());
    } finally { button.disabled = false; }
  }

  function bankGenerationDraftSnapshot() {
    var prefix=state.bank.access.canAdmin&&el('bankGenPrefix')?el('bankGenPrefix').value.trim().toUpperCase():'';
    var period=bankGenerationKind()==='semester_exam'?bankSemesterPeriod():null;
    return {
      title:String(el('bankGenTitle')&&el('bankGenTitle').value||'').trim(),
      output_kind:bankGenerationKind(),
      semester_period:period?period.value:null,
      source_origins:bankGenerationSources(),
      duration_minutes:Math.max(1,parseInt(el('bankGenDuration')&&el('bankGenDuration').value,10)||45),
      seed:String(el('bankGenSeed')&&el('bankGenSeed').value||'').trim(),
      legacy_prefix:prefix||null,
      blueprint:bankCollectBlueprint()
    };
  }

  function bankGenerationDraftFingerprint(snapshot) {
    return JSON.stringify(snapshot||bankGenerationDraftSnapshot());
  }

  async function bankPreviewExamDraft(event) {
    if(event&&typeof event.preventDefault==='function')event.preventDefault();
    if(!state.bank.access.canUse)return;
    var snapshot=bankGenerationDraftSnapshot(),title=snapshot.title,outputKind=snapshot.output_kind;
    if(!title){toast('Hãy nhập tiêu đề để tạo bản xem trước.','err');if(el('bankGenTitle'))el('bankGenTitle').focus();return;}
    if(!snapshot.source_origins.length){toast('Hãy chọn ít nhất một nguồn lấy câu.','err');return;}
    if(outputKind==='semester_exam'&&!snapshot.semester_period){
      var semesterFieldset=el('bankSemesterPeriodFieldset');
      if(semesterFieldset){semesterFieldset.setAttribute('aria-invalid','true');semesterFieldset.scrollIntoView({behavior:'smooth',block:'nearest'});}
      var firstSemesterPeriod=document.querySelector('input[name="bankSemesterPeriod"]:not(:disabled)');
      if(firstSemesterPeriod)firstSemesterPeriod.focus();
      toast('Hãy chọn Giữa kỳ I, Cuối kỳ I, Giữa kỳ II hoặc Cuối kỳ II.','err');return;
    }
    if(outputKind==='thptqg_exam'&&String(el('bankGenGrade').value||'')!=='12'){toast('Đề THPTQG cần chọn khối 12.','err');return;}
    var total=snapshot.blueprint.reduce(function(sum,segment){return sum+segment.count;},0);
    if(total>200){toast('Một đề tối đa 200 câu. Hãy giảm số câu trong các nhóm.','err');return;}
    var button=el('bankGenerateButton'),status=el('bankGenerateStatus'),box=el('bankGenerateResult'),commit=el('bankDraftCommitPanel');
    state.bank.generationDraft=null;
    if(commit)commit.hidden=true;
    button.disabled=true;status.textContent='Đang dựng bản xem trước, chưa lưu…';box.hidden=true;
    try{
      var filters={taxonomy_codes:snapshot.legacy_prefix?[snapshot.legacy_prefix]:[],legacy_prefix:snapshot.legacy_prefix||null,source_origins:snapshot.source_origins};
      if(snapshot.semester_period)filters.semester_period=snapshot.semester_period;
      var previewSpec={
        title:title,
        duration_minutes:snapshot.duration_minutes,
        seed:snapshot.seed,
        output_kind:outputKind,
        source_origins:snapshot.source_origins,
        filters:filters,
        blueprint:snapshot.blueprint,
        exclude_question_ids:[]
      };
      if(snapshot.semester_period)previewSpec.semester_period=snapshot.semester_period;
      var response=await sb.rpc('vm_bank_preview_exam_draft',{p_spec:previewSpec});
      if(response.error)throw response.error;
      if(response.data&&response.data.error)throw new Error(response.data.error);
      var data=Array.isArray(response.data)?response.data[0]||{}:response.data||{};
      var questions=Array.isArray(data.questions)?data.questions:[];
      var warnings=Array.isArray(data.warnings)?data.warnings:[];
      var previewDraftId=String(data.preview_draft_id||'').trim().toLowerCase();
      if(!questions.length)throw new Error('bank_no_matching_questions');
      if(!data.selection_token)throw new Error('bank_preview_selection_token_missing');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(previewDraftId))throw new Error('bank_preview_draft_id_missing');
      state.bank.generationDraft={
        fingerprint:bankGenerationDraftFingerprint(snapshot),
        snapshot:snapshot,
        questions:questions.slice(),
        requestedCount:Number(data.requested_count==null?total:data.requested_count),
        warnings:warnings.slice(),
        selectionToken:String(data.selection_token),
        previewDraftId:previewDraftId
      };
      var periodLabel=snapshot.semester_period&&BANK_SEMESTER_PERIODS[snapshot.semester_period]||'';
      var selectedCount=Number(data.question_count==null?questions.length:data.question_count);
      box.innerHTML='<b>✓ Bản xem trước “'+esc(data.title||title)+'” · chưa lưu</b><br>'+selectedCount+' / '+Number(data.requested_count==null?total:data.requested_count)+' câu'+(periodLabel?' · '+esc(periodLabel):'')+bankGenerationWarningsHtml(warnings)+'<div class="bank-preview-result-actions"><button class="btn btn-primary btn-sm" type="button" data-bank-preview-draft>🌐 Xem HTML / PDF</button><span>Kiểm tra xong mới chọn lớp và lưu.</span></div>';
      var previewButton=box.querySelector('[data-bank-preview-draft]');
      if(previewButton)previewButton.addEventListener('click',function(){
        bankSetPreviewActive('','');
        bankOpenPreview(title,state.bank.generationDraft.questions,{showAnswers:false,showSolutions:false,allowEditor:false,targetContext:null});
      });
      box.hidden=false;if(commit)commit.hidden=false;
      status.textContent='Bản xem trước chưa lưu';
      bankSetServerState(true);
      bankSetPreviewActive('','');
      bankOpenPreview(title,questions,{showAnswers:false,showSolutions:false,allowEditor:false,targetContext:null});
    }catch(error){
      if(bankRpcMissing(error))bankSetServerState(false,error);
      status.textContent='Chưa tạo được bản xem trước';
      box.innerHTML=bankGenerationFailureHtml(error,total);box.hidden=false;
      toast(bankIsAvailabilityError(error)?'Ngân hàng chưa có đủ câu phù hợp để xem trước.':'Chưa tạo được bản xem trước: '+bankSafeError(error),'err');
    }finally{button.disabled=false;}
  }

  async function bankSaveExamDraft(event) {
    if(event&&typeof event.preventDefault==='function')event.preventDefault();
    var draft=state.bank.generationDraft;
    if(!draft){toast('Hãy tạo và xem bản nháp trước khi lưu.','err');return;}
    if(draft.fingerprint!==bankGenerationDraftFingerprint()){
      toast('Tiêu chí đã thay đổi. Hãy tạo lại bản xem trước trước khi lưu.','err');
      var commit=el('bankDraftCommitPanel');if(commit)commit.hidden=true;
      state.bank.generationDraft=null;return;
    }
    return bankGenerateExam(event);
  }

  async function bankGenerateExam(event) {
    if(event&&typeof event.preventDefault==='function')event.preventDefault();
    if (!state.bank.access.canUse) return;
    var title = el('bankGenTitle').value.trim(), classId = el('bankGenClass').value;
    if (!title) { toast('Hãy nhập tiêu đề.','err'); return; }
    if (!classId && !state.bank.access.canAdmin) {
      var classField=el('bankGenClass');
      if(classField){classField.setAttribute('aria-invalid','true');classField.focus();classField.scrollIntoView({behavior:'smooth',block:'nearest'});}
      toast('Hãy chọn lớp trước khi lưu đề.','err'); return;
    }
    var outputKind=bankGenerationKind(),sourceOrigins=bankGenerationSources();
    if(!sourceOrigins.length){toast('Hãy chọn ít nhất một nguồn lấy câu.','err');return;}
    var semesterPeriod=outputKind==='semester_exam'?bankSemesterPeriod():null;
    if(outputKind==='semester_exam'&&!semesterPeriod){
      var semesterFieldset=el('bankSemesterPeriodFieldset');
      if(semesterFieldset){semesterFieldset.setAttribute('aria-invalid','true');semesterFieldset.scrollIntoView({behavior:'smooth',block:'nearest'});}
      var firstSemesterPeriod=document.querySelector('input[name="bankSemesterPeriod"]:not(:disabled)');
      if(firstSemesterPeriod)firstSemesterPeriod.focus();
      toast('Hãy chọn Giữa kỳ I, Cuối kỳ I, Giữa kỳ II hoặc Cuối kỳ II.','err');return;
    }
    if(outputKind==='thptqg_exam'&&String(el('bankGenGrade').value||'')!=='12'){
      toast('Đề THPTQG cần chọn khối 12.','err');return;
    }
    var prefix=state.bank.access.canAdmin&&el('bankGenPrefix')?el('bankGenPrefix').value.trim().toUpperCase():'', blueprint=bankCollectBlueprint();
    var total=blueprint.reduce(function(sum,segment){return sum+segment.count;},0);
    if(total>200){toast('Một đề tối đa 200 câu. Hãy giảm số câu trong các nhóm.','err');return;}
    var generationFilters={taxonomy_codes:prefix?[prefix]:[],legacy_prefix:prefix||null,source_origins:sourceOrigins};
    if(semesterPeriod)generationFilters.semester_period=semesterPeriod.value;
    var shouldPublish=!!el('bankGenPublished').checked;
    if(!classId)shouldPublish=false;
    var spec = {title:title,class_id:classId||null,portal_id:classId&&state.portal?state.portal.id:null,duration_minutes:Math.max(1,parseInt(el('bankGenDuration').value,10)||45),published:shouldPublish,seed:el('bankGenSeed').value.trim(),output_kind:outputKind,source_origins:sourceOrigins,filters:generationFilters,blueprint:blueprint,exclude_question_ids:[]};
    if(semesterPeriod){spec.semester_period=semesterPeriod.value;spec.semester_period_label=semesterPeriod.label;}
    if(state.bank.generationDraft&&state.bank.generationDraft.selectionToken&&state.bank.generationDraft.previewDraftId){
      spec.expected_selection_token=state.bank.generationDraft.selectionToken;
      spec.preview_draft_id=state.bank.generationDraft.previewDraftId;
    }
    var button=el('bankSaveDraftButton')||el('bankGenerateButton'),status=el('bankGenerateStatus'),box=el('bankGenerateResult');
    button.disabled=true;status.textContent='Đang lưu đề đã xem…';box.hidden=true;
    try {
      if(state.bank.access.canAdmin&&!state.bank.statsLoaded)await bankLoadStats(true);
      if(state.bank.access.canAdmin&&state.bank.statsLoaded&&Number(state.bank.stats.active||0)===0)throw new Error('bank_no_matching_questions');
      var response=await sb.rpc('vm_bank_save_exam_draft',{p_spec:spec});
      if(response.error)throw response.error;if(response.data&&response.data.error)throw new Error(response.data.error);
      var data=response.data||{},query=state.portal?'portal='+encodeURIComponent(state.portal.slug)+'&':'';
      var sourceLabels={province_exam:'đề tỉnh / kỳ thi',authored:'tác giả / tự biên',topic_pack:'kho chuyên đề'};
      var usedSources=Array.isArray(data.source_origins)&&data.source_origins.length?data.source_origins:sourceOrigins;
      var periodSummary=data.semester_period_label||spec.semester_period_label||'';
      box.innerHTML='<b>✓ Đã tạo “'+esc(data.title||title)+'”</b><br>'+Number(data.question_count||0)+' câu'+(periodSummary?' · '+esc(periodSummary):'')+' · '+esc(usedSources.map(function(value){return sourceLabels[value]||value;}).join(' + '))+' · mã trộn '+esc(data.seed||spec.seed)+bankGenerationWarningsHtml(data.warnings)+(data.exam_id?'<div class="bank-preview-result-actions"><button class="btn btn-primary btn-sm" type="button" data-bank-preview-exam="'+esc(data.exam_id)+'">🌐 Xem HTML / PDF</button><a class="btn btn-secondary btn-sm" href="luyen-de?'+query+'exam_id='+encodeURIComponent(data.exam_id)+'" target="_blank" rel="noopener">Mở trang làm đề ↗</a></div>':'');
      if(data.matrix){var generatedMatrix=Array.isArray(data.matrix)?{items:data.matrix}:data.matrix;bankRenderMatrix(generatedMatrix.items||[],Number(generatedMatrix.question_count==null?data.question_count:generatedMatrix.question_count),'Ma trận đề vừa tạo');}
      var generatedPreview=box.querySelector('[data-bank-preview-exam]');if(generatedPreview)generatedPreview.addEventListener('click',function(){bankOpenExamPreview(generatedPreview.dataset.bankPreviewExam,data.title||title);});
      box.hidden=false;status.textContent='Đã lưu';bankSetServerState(true);bankNewSeed();
      state.bank.generationDraft=null;
      if(el('bankDraftCommitPanel'))el('bankDraftCommitPanel').hidden=true;
      if(el('bankGenPublished'))el('bankGenPublished').checked=false;
      try{
        if(state.bank.access.canAdmin)await loadExams();else await bankLoadExamCatalog(true);
      }catch(refreshError){
        // The exam is already committed at this point. A catalog refresh
        // failure must not turn a successful explicit save into a false error.
      }
    }catch(error){
      if(bankRpcMissing(error))bankSetServerState(false,error);
      if(bankIsStalePreviewError(error)){
        state.bank.generationDraft=null;
        if(el('bankDraftCommitPanel'))el('bankDraftCommitPanel').hidden=true;
      }
      var availability=bankIsAvailabilityError(error)||(state.bank.access.canAdmin&&state.bank.statsLoaded&&Number(state.bank.stats.active||0)===0);
      status.textContent=availability?'Kho chưa đủ dữ liệu':(bankIsStalePreviewError(error)?'Cần xem trước lại':'Chưa tạo được đề');
      box.innerHTML=bankGenerationFailureHtml(error,total);box.hidden=false;
      toast(availability?'Ngân hàng chưa có đủ câu phù hợp để tạo đề.':'Không tạo được đề: '+bankSafeError(error),'err');
    }
    finally{button.disabled=false;}
  }

  function bankSourceSemantic(value) {
    return {
      thpt_official:{category:'thptqg',variant:'official'},
      thpt_reference:{category:'thptqg',variant:'reference'},
      thpt_mock:{category:'thptqg',variant:'mock'},
      midterm:{category:'semester',variant:'midterm'},
      final:{category:'semester',variant:'final'},
      semester_1:{category:'semester',variant:'semester_1'},
      semester_2:{category:'semester',variant:'semester_2'},
      chapter:{category:'other_exam',variant:'chapter'},
      other:{category:'other_exam',variant:null}
    }[value]||null;
  }

  function bankSyncSourceCategory() {
    var select=el('bankSourceType');
    if(!select)return;
    var semantic=bankSourceSemantic(select.value||'');
    state.bank.sourceCategory=semantic?semantic.category:'';
    state.bank.sourceOrigin='';
    bankRenderSourceCategoryTabs();
  }

  function bankSourceFilters() {
    var selected=el('bankSourceType').value||'';
    var semantic=bankSourceSemantic(selected);
    return {
      query:el('bankSourceQuery').value.trim(),
      province:el('bankSourceUnit').value.trim(),
      grade:parseInt(el('bankSourceGrade')&&el('bankSourceGrade').value,10)||null,
      exam_year:parseInt(el('bankSourceYear').value,10)||null,
      exam_kind:semantic?null:(selected||null),
      bank_category:semantic?semantic.category:(state.bank.sourceCategory||null),
      bank_variant:semantic?semantic.variant:null,
      source_origin:state.bank.sourceOrigin||null,
      tags:[]
    };
  }

  function bankSourceExamKindLabel(item) {
    item=item||{};
    var category=String(item.bank_category||'').toLowerCase();
    var variant=String(item.bank_variant||'').toLowerCase();
    var kind=String(item.exam_kind||'').toLowerCase();
    if(category==='thptqg'){
      if(variant==='official'||kind==='thpt_official')return 'THPTQG · chính thức';
      if(variant==='reference'||kind==='thpt_reference')return 'THPTQG · tham khảo';
      return 'THPTQG · thi thử';
    }
    if(category==='semester'){
      if(variant==='midterm'||kind==='midterm')return 'Giữa kỳ';
      if(variant==='final'||kind==='final')return 'Cuối kỳ';
      if(variant==='semester_1'||kind==='semester_1')return 'Học kỳ I';
      if(variant==='semester_2'||kind==='semester_2')return 'Học kỳ II';
      return 'Học kỳ';
    }
    if(variant==='chapter'||kind==='chapter')return 'Kiểm tra chương';
    if(variant==='mock'||kind==='mock'||kind==='thpt_mock')return 'Thi thử';
    if(variant==='other'||kind==='other')return 'Đề khác';
    return item.exam_kind||'Đề nguồn';
  }

  function bankSourceIdentity(item) {
    item=item||{};
    if(item.id!=null&&String(item.id)!=='')return 'id:'+String(item.id);
    return 'fallback:'+[
      item.title||'',item.province||'',item.grade||'',item.exam_year||'',
      item.bank_category||'',item.bank_variant||'',item.source_origin||'',item.exam_kind||'',item.question_count||''
    ].join('|');
  }

  function bankMergeSourceItems(current,incoming) {
    var seen=Object.create(null),merged=[];
    (current||[]).concat(incoming||[]).forEach(function(item){
      var key=bankSourceIdentity(item);
      if(seen[key])return;
      seen[key]=true;
      merged.push(item);
    });
    return merged;
  }

  function bankUpdateSourcePagination() {
    var pagination=el('bankSourcePagination'),status=el('bankSourcePageStatus'),more=el('bankSourceLoadMoreButton');
    if(!pagination||!status||!more)return;
    var displayed=state.bank.sourceItems.length;
    var total=Math.max(displayed,Number(state.bank.sourceCatalogResultTotal||0));
    pagination.hidden=!state.bank.sourceCatalogLoaded||(!displayed&&!total);
    status.textContent='Đã hiển thị '+displayed+' / '+total+' đề';
    more.hidden=!state.bank.sourceCatalogHasMore;
    more.disabled=state.bank.sourceCatalogLoading;
    more.textContent=state.bank.sourceCatalogLoading?'Đang tải…':'Tải thêm đề';
  }

  function bankRenderSourceCatalog() {
    var box=el('bankSourceResults'),items=state.bank.sourceItems;
    if(!box)return;
    if(!items.length)box.innerHTML=bankSourceEmptyHtml();
    else {
      box.innerHTML=items.map(function(item){
        var assignable=item.assignable!==false,authored=String(item.source_origin||'')==='authored';
        var pending=Math.max(0,Number(item.total_question_count||item.question_count||0)-Number(item.question_count||0));
        var sourceLabel=authored?'Tác giả / tự biên':bankRepositoryKindLabel(item);
        var unitLabel=authored?(item.province||'Nguồn tự biên VinhMath'):(item.province||'Chưa ghi tỉnh / đơn vị');
        var readiness=!assignable?'<div class="bank-source-note review">'+(authored?'Đề tự biên đang được chuẩn hóa'+(state.bank.access.canAdmin&&pending?' · còn '+pending+' câu cần phân loại':'')+'. Có thể mở HTML/PDF để kiểm tra.':'Nguồn đang được chuẩn hóa. Có thể mở HTML/PDF để kiểm tra.')+'</div>':'';
        var useActions=assignable||state.bank.access.canAdmin
          ? '<button class="btn btn-secondary" type="button" data-source-exam-id="'+esc(item.id)+'" data-source-mode="assign"'+(assignable?'':' disabled aria-disabled="true"')+'>Giao nguyên đề</button><button class="btn btn-secondary" type="button" data-source-exam-id="'+esc(item.id)+'" data-source-mode="clone"'+(assignable?'':' disabled aria-disabled="true"')+'>Tạo đề cùng cấu trúc</button>'
          : '';
        return '<article class="bank-source-item"><div class="bank-result-top"><span class="bank-chip">'+esc(sourceLabel)+'</span><span class="bank-chip">'+esc(item.grade?'Khối '+item.grade:'Chưa rõ khối')+'</span><span class="bank-chip">'+esc(item.exam_year||'Chưa rõ năm')+'</span><span class="bank-chip">'+esc(bankSourceExamKindLabel(item))+'</span><span class="bank-chip">'+Number(item.question_count||0)+' câu</span></div><h3>'+esc(item.title||'Đề chưa đặt tên')+'</h3><p>'+esc(unitLabel)+'</p>'+readiness+'<div class="bank-source-actions"><button class="btn btn-primary bank-source-preview" type="button" data-source-preview-id="'+esc(item.id)+'">🌐 Xem HTML / PDF</button>'+useActions+'</div></article>';
      }).join('');
      box.querySelectorAll('[data-source-preview-id]').forEach(function(button){button.addEventListener('click',function(){bankOpenSourcePreview(button.dataset.sourcePreviewId);});});
      box.querySelectorAll('[data-source-exam-id]').forEach(function(button){button.addEventListener('click',function(){bankChooseSourceExam(button.dataset.sourceExamId,button.dataset.sourceMode);});});
    }
    bankUpdateSourcePagination();
    bankRenderPreviewSidebar();
  }

  async function bankLoadSourceCatalog(event,options) {
    if(event)event.preventDefault();if(!state.bank.access.canUse)return;
    if(state.bank.sourceCatalogLoading)return;
    options=options||{};
    var filters=bankSourceFilters(),filterKey=JSON.stringify(filters),append=!!options.append;
    if(append&&(!state.bank.sourceCatalogLoaded||state.bank.sourceCatalogFilterKey!==filterKey))append=false;
    if(append&&!state.bank.sourceCatalogHasMore){bankUpdateSourcePagination();return;}
    var offset=append?state.bank.sourceCatalogOffset:0;
    state.bank.sourceCatalogLoading=true;
    var button=el('bankSourceSearchButton'),box=el('bankSourceResults'),more=el('bankSourceLoadMoreButton');
    button.disabled=true;
    if(!append){box.innerHTML='<div class="exam-empty" style="min-height:150px"><div><div class="exam-spinner"></div><strong>Đang tải danh mục đề hoàn chỉnh</strong></div></div>';state.bank.sourceCatalogLoaded=false;state.bank.sourceCatalogHasMore=false;state.bank.sourceCatalogOffset=0;state.bank.sourceCatalogResultTotal=0;}
    if(more)more.disabled=true;
    bankUpdateSourcePagination();
    try{
      var pageSize=state.bank.sourceCatalogPageSize||50;
      var response=await sb.rpc('vm_bank_source_exam_catalog',{p_filters:filters,p_limit:pageSize,p_offset:offset});
      if(response.error)throw response.error;
      var data=response.data||{},items=Array.isArray(data)?data:(Array.isArray(data.items)?data.items:[]);
      var hasServerTotal=!Array.isArray(data)&&data.total!=null&&Number.isFinite(Number(data.total));
      var total=hasServerTotal?Math.max(0,Number(data.total)):offset+items.length;
      state.bank.sourceItems=bankMergeSourceItems(append?state.bank.sourceItems:[],items);
      state.bank.sourceCatalogOffset=offset+items.length;
      state.bank.sourceCatalogResultTotal=Math.max(state.bank.sourceItems.length,total);
      state.bank.sourceCatalogHasMore=items.length>0&&(hasServerTotal?state.bank.sourceItems.length<total:items.length===pageSize);
      state.bank.sourceCatalogFilterKey=filterKey;
      if(!state.bank.sourceCategory)state.bank.sourceCatalogTotal=state.bank.sourceCatalogResultTotal;
      state.bank.sourceCatalogLoaded=true;
      bankUpdateOverview();
      bankRenderSourceCatalog();
      bankSetServerState(true);
    }catch(error){
      if(bankRpcMissing(error))bankSetServerState(false,error);
      if(append){toast('Chưa tải thêm được đề: '+bankSafeError(error),'err');}
      else {state.bank.sourceCatalogLoaded=false;state.bank.sourceItems=[];box.innerHTML='<div class="exam-empty" style="min-height:150px;color:var(--err)"><div><strong>Chưa tải được danh mục</strong>'+esc(bankSafeError(error))+'</div></div>';}
    }
    finally{state.bank.sourceCatalogLoading=false;button.disabled=false;bankUpdateSourcePagination();}
  }

  function bankLoadMoreSources(event) {
    return bankLoadSourceCatalog(event,{append:true});
  }

  function bankRepositoryFilters() {
    var origin=el('bankRepositoryGroup')&&el('bankRepositoryGroup').value||'';
    return {
      query:String(el('bankRepositoryQuery')&&el('bankRepositoryQuery').value||'').trim(),
      source_origin:origin||null,
      repository_status:String(el('bankRepositoryStatus')&&el('bankRepositoryStatus').value||'')||null,
      grade:parseInt(el('bankRepositoryGrade')&&el('bankRepositoryGrade').value,10)||null
    };
  }

  function bankRepositoryKindLabel(item) {
    var origin=String(item&&item.source_origin||'').toLowerCase();
    if(origin==='authored')return 'Tác giả / tự biên';
    if(origin==='province_exam')return 'Đề tỉnh / kỳ thi';
    if(origin==='topic_pack'||String(item&&item.source_kind||'')==='topic_pack')return 'Gói câu chuyên đề';
    return 'Nguồn khác';
  }

  function bankRepositoryStatusInfo(item) {
    var status=String(item&&item.repository_status||'').toLowerCase();
    if(!status){
      var importState=String(item&&item.import_state||'').toLowerCase();
      if(String(item&&item.status||'')==='archived')status='archived';
      else if(Number(item&&item.error_count||0)>0)status='error';
      else if(importState&&importState!=='complete'&&importState!=='legacy_complete')status='staging';
      else if(Number(item&&item.quarantined_count||0)>0||Number(item&&item.active_count||0)<Number(item&&item.total_count||0))status='review';
      else status='ready';
    }
    return {
      ready:{label:'Sẵn sàng',className:'ready'},
      review:{label:'Cần phân loại',className:'review'},
      staging:{label:'Đang nạp dở',className:'staging'},
      error:{label:'Lỗi nguồn',className:'error'},
      archived:{label:'Đã lưu trữ',className:'archived'}
    }[status]||{label:'Đã lưu',className:'archived'};
  }

  function bankFormatBytes(value) {
    var bytes=Math.max(0,Number(value||0));
    if(bytes<1024)return bytes+' B';
    if(bytes<1048576)return (bytes/1024).toFixed(bytes<10240?1:0)+' KB';
    return (bytes/1048576).toFixed(1)+' MB';
  }

  function bankRepositoryDate(value) {
    if(!value)return 'Chưa rõ thời điểm';
    var date=new Date(value);
    return isNaN(date.getTime())?'Chưa rõ thời điểm':date.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function bankRenderRepository() {
    var box=el('bankRepositoryResults'),items=state.bank.repositoryItems||[];
    if(!box)return;
    if(!items.length){
      box.innerHTML='<div class="exam-empty bank-repository-empty"><div><strong>Không có tệp nguồn phù hợp</strong>Đổi bộ lọc hoặc nạp một tệp TeX mới ở trạm Nạp &amp; chuẩn hóa.</div></div>';
      return;
    }
    box.innerHTML=items.map(function(item){
      var status=bankRepositoryStatusInfo(item),total=Number(item.total_count||0),active=Number(item.active_count||0);
      var fileName=item.original_filename||item.relative_path||'Tệp TeX đã lưu';
      var grade=item.grade?'Khối '+item.grade:(item.source_origin==='authored'?'Nhiều khối / chưa gán':'Chưa rõ khối');
      var route=bankRepositoryKindLabel(item)+' · '+grade+(item.exam_year?' · '+item.exam_year:'');
      var countText=total?(active+' / '+total+' câu dùng được'):'Chưa tách câu';
      return '<button class="bank-repository-item" type="button" data-bank-repository-document="'+esc(item.id)+'" aria-label="Mở và biên dịch '+esc(item.title||fileName)+'">'+
        '<span class="bank-repository-file"><span class="bank-repository-icon" aria-hidden="true">TeX</span><span><strong>'+esc(item.title||fileName)+'</strong><small>'+esc(fileName)+'</small></span></span>'+
        '<span class="bank-repository-route"><b>'+esc(route)+'</b><small>'+esc(countText)+'</small></span>'+
        '<span class="bank-repository-meta"><span class="bank-repository-state '+status.className+'">'+esc(status.label)+'</span><small>'+esc(bankFormatBytes(item.raw_size))+' · '+esc(bankRepositoryDate(item.updated_at||item.created_at))+'</small></span>'+
        '<span class="bank-repository-open">Mở HTML/PDF <i aria-hidden="true">→</i></span></button>';
    }).join('');
    box.querySelectorAll('[data-bank-repository-document]').forEach(function(button){
      button.addEventListener('click',function(){bankOpenRepositoryDocument(button.dataset.bankRepositoryDocument);});
    });
  }

  function bankUpdateRepositoryPagination() {
    var prev=el('bankRepositoryPrev'),next=el('bankRepositoryNext'),status=el('bankRepositoryPageStatus');
    if(!prev||!next||!status)return;
    var offset=Math.max(0,Number(state.bank.repositoryOffset||0)),size=state.bank.repositoryPageSize||25,total=Math.max(0,Number(state.bank.repositoryResultTotal||0));
    var start=total&&state.bank.repositoryItems.length?offset+1:0,end=Math.min(total,offset+state.bank.repositoryItems.length);
    status.textContent=start+'–'+end+' / '+total+' tệp';
    prev.disabled=state.bank.repositoryLoading||offset<=0;
    next.disabled=state.bank.repositoryLoading||offset+size>=total;
  }

  async function bankLoadRepository(event,options) {
    if(event&&event.preventDefault)event.preventDefault();
    if(!state.bank.access.canAdmin)return;
    options=options||{};
    var filters=bankRepositoryFilters(),filterKey=JSON.stringify(filters),size=state.bank.repositoryPageSize||25;
    var offset=Number(options.offset);
    if(!Number.isFinite(offset))offset=state.bank.repositoryFilterKey===filterKey?state.bank.repositoryOffset:0;
    offset=Math.max(0,Math.floor(offset/size)*size);
    var token=++state.bank.repositoryRequestToken;
    state.bank.repositoryLoading=true;state.bank.repositoryFilterKey=filterKey;
    var box=el('bankRepositoryResults'),button=el('bankRepositorySearchButton');
    if(button)button.disabled=true;
    if(box)box.innerHTML='<div class="exam-empty bank-repository-empty"><div><div class="exam-spinner"></div><strong>Đang mở kho nguồn</strong>Chỉ tải thông tin tệp; TeX gốc chỉ được lấy khi admin bấm mở.</div></div>';
    bankUpdateRepositoryPagination();
    try{
      var response=await sb.rpc('vm_bank_admin_document_catalog',{p_filters:filters,p_limit:size,p_offset:offset});
      if(response.error)throw response.error;
      if(token!==state.bank.repositoryRequestToken)return;
      var data=response.data||{},items=Array.isArray(data)?data:(Array.isArray(data.items)?data.items:[]);
      state.bank.repositoryItems=items;
      state.bank.repositoryOffset=offset;
      state.bank.repositoryResultTotal=Math.max(items.length,Number(data.total==null?items.length:data.total));
      state.bank.repositoryHasMore=offset+items.length<state.bank.repositoryResultTotal;
      state.bank.repositoryLoaded=true;
      bankRenderRepository();bankSetServerState(true);
    }catch(error){
      if(token!==state.bank.repositoryRequestToken)return;
      state.bank.repositoryItems=[];state.bank.repositoryResultTotal=0;state.bank.repositoryLoaded=false;
      if(box)box.innerHTML='<div class="exam-empty bank-repository-empty error"><div><strong>Chưa mở được kho nguồn</strong>'+esc(bankSafeError(error))+'</div></div>';
      if(bankRpcMissing(error))bankSetServerState(false,error);
    }finally{
      if(token===state.bank.repositoryRequestToken){state.bank.repositoryLoading=false;if(button)button.disabled=false;bankUpdateRepositoryPagination();}
    }
  }

  function bankRepositoryPage(direction) {
    if(state.bank.repositoryLoading)return;
    var size=state.bank.repositoryPageSize||25;
    return bankLoadRepository(null,{offset:Math.max(0,state.bank.repositoryOffset+(direction<0?-size:size))});
  }

  function bankResetRepositoryFilters() {
    ['bankRepositoryQuery','bankRepositoryGroup','bankRepositoryStatus','bankRepositoryGrade'].forEach(function(id){if(el(id))el(id).value='';});
    state.bank.repositoryFilterKey='';state.bank.repositoryOffset=0;
    return bankLoadRepository();
  }

  function bankOpenRepositoryDocument(documentId) {
    if(!state.bank.access.canAdmin||!documentId)return;
    var item=(state.bank.repositoryItems||[]).find(function(entry){return String(entry.id)===String(documentId);});
    return bankLoadAdminDocumentPreview(documentId,item&&item.title||'Tệp nguồn');
  }

  function bankChooseSourceExam(id,mode) {
    if(!state.bank.access.canUse)return;var item=state.bank.sourceItems.find(function(entry){return String(entry.id)===String(id);});if(!item)return;
    if(item.assignable===false){toast('Nguồn này chưa đủ câu hợp lệ hoặc chưa hoàn tất kiểm duyệt.','err');return;}
    mode=mode==='clone'?'clone':'assign';state.bank.selectedSourceId=item.id;state.bank.selectedSourceMode=mode;
    state.bank.sourceAssignTrigger=document.activeElement;
    el('bankSourceSelectedMode').textContent=mode==='clone'?'Tạo đề mới theo cấu trúc':'Giao nguyên đề';
    el('bankSourceAssignHeading').textContent=mode==='clone'?'Tạo đề cùng cấu trúc':'Giao nguyên đề';
    el('bankSourceSelectedTitle').textContent=item.title||'Đề nguồn';
    el('bankSourceAssignTitle').value=mode==='clone'?'Đề mới theo cấu trúc '+(item.title||'đề nguồn'):(item.title||'');
    el('bankSourceAssignButton').textContent=mode==='clone'?'✨ Tạo đề mới cùng cấu trúc':'Giao nguyên đề cho lớp';
    el('bankSourceAssignStatus').textContent=mode==='clone'
      ? 'Hệ thống giữ số lượng, thứ tự dạng câu và mức độ gần tương đương; không lặp lại câu của đề gốc.'
      : 'Giữ nguyên '+Number(item.question_count||0)+' câu theo thứ tự đề gốc.';
    var dialog=el('bankSourceAssignDialog');
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
    else dialog.setAttribute('open','');
    window.setTimeout(function(){var classField=el('bankSourceAssignClass');if(classField)classField.focus({preventScroll:true});},0);
  }

  async function bankAssignSourceExam(event) {
    event.preventDefault();if(!state.bank.access.canUse||!state.bank.selectedSourceId)return;
    var classId=el('bankSourceAssignClass').value,title=el('bankSourceAssignTitle').value.trim();if(!classId||!title){toast('Hãy chọn lớp và đặt tên đề.','err');return;}
    var mode=state.bank.selectedSourceMode==='clone'?'clone':'assign',button=el('bankSourceAssignButton'),status=el('bankSourceAssignStatus'),dialog=el('bankSourceAssignDialog');state.bank.sourceAssignBusy=true;button.disabled=true;if(dialog)dialog.setAttribute('aria-busy','true');document.querySelectorAll('[data-bank-source-assign-close]').forEach(function(closeButton){closeButton.disabled=true;});status.textContent=mode==='clone'?'Đang tìm câu tương đương và dựng đề mới…':'Đang sao nguyên đề và giao lớp…';
    try{
      var spec={title:title,class_id:classId,portal_id:state.portal?state.portal.id:null,duration_minutes:Math.max(1,parseInt(el('bankSourceAssignDuration').value,10)||90),published:!!el('bankSourceAssignPublished').checked,opens_at:null,closes_at:null,shuffle:mode==='clone',seed:'vm-clone-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)};
      var response=mode==='clone'
        ?await sb.rpc('vm_bank_clone_source_structure',{p_document_id:state.bank.selectedSourceId,p_spec:spec})
        :await sb.rpc('vm_bank_assign_source_exam',{p_document_id:state.bank.selectedSourceId,p_spec:spec});
      if(response.error)throw response.error;if(response.data&&response.data.error)throw new Error(response.data.error);var data=response.data||{},warnings=Array.isArray(data.warnings)?data.warnings.length:0;
      status.innerHTML='✓ '+(mode==='clone'?'Đã tạo đề mới ':'Đã giao ')+Number(data.question_count||0)+' câu'+(data.skipped?' · bỏ qua '+Number(data.skipped)+' câu chưa hợp lệ':'')+(warnings?' · '+warnings+' vị trí chưa có câu tương đương':'')+(data.exam_id?' · <button class="btn btn-secondary btn-sm" type="button" data-bank-preview-exam="'+esc(data.exam_id)+'">Xem HTML / PDF</button> · <a href="luyen-de?exam_id='+encodeURIComponent(data.exam_id)+'" target="_blank" rel="noopener">mở trang làm đề ↗</a>':'');var assignedPreview=status.querySelector('[data-bank-preview-exam]');if(assignedPreview)assignedPreview.addEventListener('click',function(){bankOpenExamPreview(assignedPreview.dataset.bankPreviewExam,title);});bankSetServerState(true);if(state.bank.access.canAdmin)await loadExams();else await bankLoadExamCatalog(true);
    }catch(error){if(bankRpcMissing(error))bankSetServerState(false,error);status.textContent='Chưa giao được đề: '+bankSafeError(error);}
    finally{state.bank.sourceAssignBusy=false;button.disabled=false;if(dialog)dialog.removeAttribute('aria-busy');document.querySelectorAll('[data-bank-source-assign-close]').forEach(function(closeButton){closeButton.disabled=false;});}
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
    var bankAccess=await bankLoadAccess(profile);
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
    if(typeof vmTaiMoiTruongTex==='function')await vmTaiMoiTruongTex();
    bankConfigureAccess(profile,bankAccess);
    if(!bankAccess.canAdmin){
      await bankLoadExamCatalog(true);
      el('kpiAttempts').textContent='—';
      return;
    }
    var engineSetting=await sb.from('app_settings').select('value').eq('key','latex_engine_default').maybeSingle();
    if(!engineSetting.error&&engineSetting.data&&['pdflatex','xelatex','lualatex'].indexOf(engineSetting.data.value)>=0)state.pdfEngine=engineSetting.data.value;
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
    if(bankViewFromLocation())requestedTab='bank';
    if(requestedTemplate&&TEMPLATES[requestedTemplate])applyTemplate(requestedTemplate);
    else if(!requestedTab||requestedTab==='compose')applyTemplate('worksheet-mixed');
    if(['compose','bank','library','analytics'].indexOf(requestedTab)>=0)switchTab(requestedTab);
    if(requestedTab==='library'&&['published','draft'].indexOf(requestedState)>=0){el('libraryState').value=requestedState;renderLibrary();}
    await bankOpenIssueFromLocation();
    renderPreview(false);
  }

  window.VMExamAdmin={switchTab:switchTab,switchPreview:switchPreview,applyTemplate:applyTemplate,insertSnippet:insertSnippet,formatSource:formatSource,renderPreview:renderPreview,updateExamType:updateExamType,saveExam:saveExam,editExam:editExam,resetForm:resetForm,deleteExam:deleteExam,toggleSolutionPdf:toggleSolutionPdf,renderLibrary:renderLibrary,loadAnalyticsOptions:loadAnalyticsOptions,loadAnalytics:loadAnalytics,openAnalytics:openAnalytics,compilePdf:compilePdf,closePdf:closePdf,openBankFromEditor:openBankFromEditor,bankImportEditorSource:bankImportEditorSource,bankSendPreviewToEditor:bankSendPreviewToEditor,bankSwitchPreview:bankSwitchPreview,bankCompilePreviewPdf:bankCompilePreviewPdf,bankDownloadPreviewTex:bankDownloadPreviewTex,bankClosePreview:bankClosePreview,bankOpenLocalPreview:bankOpenLocalPreview,bankOpenImportPreview:bankOpenImportPreview,bankOpenSearchPreview:bankOpenSearchPreview,bankOpenSourcePreview:bankOpenSourcePreview,bankOpenExamPreview:bankOpenExamPreview,bankSetView:bankSetView,bankScrollZone:bankScrollZone,bankSetManageMode:bankSetManageMode,bankOpenOverview:bankOpenOverview,bankSetSourceCategory:bankSetSourceCategory,bankSyncSourceCategory:bankSyncSourceCategory,bankUpdateBrowseHierarchy:bankUpdateBrowseHierarchy,bankUpdateGeneratorHierarchy:bankUpdateGeneratorHierarchy,bankUpdateImportHierarchy:bankUpdateImportHierarchy,bankUpdateImportExamKind:bankUpdateImportExamKind,bankUpdateImportOrigin:bankUpdateImportOrigin,bankUpdateBlueprintHierarchy:bankUpdateBlueprintHierarchy,bankResetSearchFilters:bankResetSearchFilters,bankFocusImport:bankFocusImport,bankSetImportMode:bankSetImportMode,bankParsePastedTex:bankParsePastedTex,bankClearPastedTex:bankClearPastedTex,bankNewSeed:bankNewSeed,bankAddBlueprintRow:bankAddBlueprintRow,bankRemoveBlueprintRow:bankRemoveBlueprintRow,bankUpdateBlueprintTotal:bankUpdateBlueprintTotal,bankSelectFiles:bankSelectFiles,bankImportAdminPackage:bankImportAdminPackage,bankUpdateId:bankUpdateId,bankApplyBulkIds:bankApplyBulkIds,bankLoadTaxonomyCatalog:bankLoadTaxonomyCatalog,bankChooseTaxonomy:bankChooseTaxonomy,bankUpdateTaxonomyHierarchy:bankUpdateTaxonomyHierarchy,bankSelectTaxonomyGrade:bankSelectTaxonomyGrade,bankFilterTaxonomyCatalog:bankFilterTaxonomyCatalog,bankUpdateTaxonomyPreview:bankUpdateTaxonomyPreview,bankToggleQuestionSelection:bankToggleQuestionSelection,bankSelectMissingIds:bankSelectMissingIds,bankClearSelection:bankClearSelection,bankApplyClassification:bankApplyClassification,bankShowMore:bankShowMore,bankImport:bankImport,bankLoadStats:bankLoadStats,bankSearch:bankSearch,bankRetryMatrix:bankRetryMatrix,bankPreviewExamDraft:bankPreviewExamDraft,bankSaveExamDraft:bankSaveExamDraft,bankGenerateExam:bankGenerateExam,bankLoadSourceCatalog:bankLoadSourceCatalog,bankLoadMoreSources:bankLoadMoreSources,bankChooseSourceExam:bankChooseSourceExam,bankCloseSourceAssign:bankCloseSourceAssign,bankAssignSourceExam:bankAssignSourceExam,bankLoadRepository:bankLoadRepository,bankRepositoryPage:bankRepositoryPage,bankResetRepositoryFilters:bankResetRepositoryFilters,bankOpenRepositoryDocument:bankOpenRepositoryDocument,_templates:TEMPLATES,_kindOf:kindOf,_normalizeSolutionParagraphs:normalizeSolutionParagraphs,_normalizeLegacyPdfFragment:normalizeLegacyPdfFragment,_buildPdfSource:buildPdfSource,_syncAuthoringRail:syncAuthoringRail,_bankConfigureAccess:bankConfigureAccess,_bankAccessFor:bankAccessFor,_bankRefreshQuestion:bankRefreshQuestion,_bankCollectBlueprint:bankCollectBlueprint,_bankRenderMatrix:bankRenderMatrix,_bankUpdateOverview:bankUpdateOverview,_bankLoadInventory:bankLoadInventory,_bankLoadMatrix:bankLoadMatrix,_bankState:state.bank};
  Object.assign(window.VMExamAdmin,{
    bankTogglePreviewFullscreen:bankTogglePreviewFullscreen,
    bankTogglePreviewSidebar:bankTogglePreviewSidebar,
    bankFilterPreviewSources:bankFilterPreviewSources,
    bankSwitchPreviewSource:bankSwitchPreviewSource,
    bankOpenIssueReport:bankOpenIssueReport,
    bankSubmitIssueReport:bankSubmitIssueReport,
    bankCloseIssueReport:bankCloseIssueReport,
    bankOpenIssueFromLocation:bankOpenIssueFromLocation,
    bankResolveCurrentIssue:bankResolveCurrentIssue,
    bankUpdateGenerationKind:bankUpdateGenerationKind,
    bankUpdateSemesterPeriod:bankUpdateSemesterPeriod
  });
  window.addEventListener('resize',scheduleAuthoringRailSync,{passive:true});
  window.addEventListener('scroll',scheduleAuthoringRailSync,{passive:true});
  window.addEventListener('popstate',bankSyncWorkspaceFromLocation);
  window.addEventListener('hashchange',bankSyncWorkspaceFromLocation);
  window.addEventListener('vm:tex-environments-ready',bankRefreshPreviewHtml);
  document.addEventListener('DOMContentLoaded',function(){var bankNav=el('bankWorkspaceNav');if(bankNav)bankNav.addEventListener('keydown',bankHandleViewNavigationKey);syncAuthoringRail();init().catch(function(error){toast('Không khởi tạo được trình soạn thảo: '+error.message,'err');});});
})();
