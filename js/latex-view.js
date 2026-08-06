// ============================================================
// VINHMATH — BỘ HIỂN THỊ LATEX DÙNG CHUNG
// Biến LaTeX kiểu đề thi (ex_test) thành HTML xem được trên web:
//  - bỏ dòng chú thích %...
//  - bỏ \begin{center}, \immini...
//  - đổi bảng tabular -> bảng HTML
//  - phần công thức $...$ để nguyên cho KaTeX render
// Trang nào dùng: nạp file này SAU katex + auto-render.
// ============================================================

function getTheorySections(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      var parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

// Bỏ chú thích % (giữ \% là ký hiệu phần trăm thật)
function lamSachLatex(src) {
  if (!src) return '';
  var out = src.replace(/(^|[^\\])%[^\n]*/g, '$1');
  out = out.replace(/\\begin\{center\}|\\end\{center\}/g, ' ');
  out = out.replace(/\\(immini|hetcot|vspace\{[^}]*\}|hspace\{[^}]*\})/g, ' ');
  return out;
}

// Đổi tabular thành bảng HTML (chạy SAU khi đã escape & -> &amp;)
function tabularSangBangHTML(s) {
  return s.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, function (_, body) {
    body = body.replace(/\\hline/g, '');
    var rows = body.split('\\\\').map(function (r) { return r.trim(); }).filter(function (r) { return r.length; });
    var html = rows.map(function (r) {
      var cells = r.split('&amp;').map(function (c) {
        return '<td style="border:1px solid var(--line-2);padding:4px 10px;text-align:center">' + c.trim() + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    return '</p><table style="border-collapse:collapse;margin:10px auto">' + html + '</table><p>';
  });
}

// LaTeX -> chuỗi HTML an toàn (công thức $...$ giữ nguyên chờ KaTeX)
function latexRaHTML(src) {
  var s = lamSachLatex(src || '');
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Bảo vệ các khối công thức toán học tránh bị biên dịch sai ký tự (như \\ thành <br>)
  var mathBlocks = [];
  
  // 1. Bảo vệ $$...$$ và \[...\]
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('$$' + math + '$$');
    return placeholder;
  });
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('\\[' + math + '\\]');
    return placeholder;
  });
  
  // 2. Bảo vệ $...$ và \(...\) (tránh ký tự \$ bị escape)
  s = s.replace(/(^|[^\\])\$([\s\S]*?)\$/g, function (match, prefix, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('$' + math + '$');
    return prefix + placeholder;
  });
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, function (match, math) {
    var placeholder = '___MATHBLOCK_' + mathBlocks.length + '___';
    mathBlocks.push('\\(' + math + '\\)');
    return placeholder;
  });
  
  // 3. Biên dịch các môi trường định dạng LaTeX sang HTML
  s = tabularSangBangHTML(s);
  
  // Bold & Italic
  s = s.replace(/\\textbf\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<b>$1</b>');
  s = s.replace(/\\textit\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<i>$1</i>');
  
  // Môi trường listEX (gói ex_test) -> hiển thị như danh sách trên web.
  // Tham số [n] của listEX là SỐ CỘT khi in PDF, web bỏ qua và xếp dọc cho dễ đọc.
  s = s.replace(/\\begin\{listEX\}(?:\[[^\]]*\])?/g, '\\begin{enumerate}[a)]');
  s = s.replace(/\\end\{listEX\}/g, '\\end{enumerate}');

  // Đệ quy xử lý danh sách lồng nhau (enumerate, itemize)
  s = dichMoiTruongDanhSach(s);
  
  // Khối tiêu đề \boxde và xuống trang \newpage
  s = s.replace(/\\boxde\{([^{}]+)\}/g, '<div class="part-header" style="margin-top:24px;text-align:center;font-size:1.1rem;background:var(--accent-soft);color:var(--accent);padding:8px 16px;border-radius:var(--r-sm)">$1</div>');
  s = s.replace(/\\newpage/g, '<hr style="border-top:1px dashed var(--line-2);margin:24px 0;clear:both">');
  
  // \hfill và xuống dòng \\
  s = s.replace(/\\hfill\s*(\([^\n]*\))/g, '<span style="float:right; color:var(--ink-2); font-weight:600; font-size:0.85rem">$1</span>');
  s = s.replace(/\\hfill/g, '<span style="float:right"></span>');
  s = s.replace(/\\\\/g, '<br>');
  
  // Phục hồi các khối công thức toán học (Dùng split-join thay thế replace để tránh lỗi mất ký tự $)
  for (var i = 0; i < mathBlocks.length; i++) {
    s = s.split('___MATHBLOCK_' + i + '___').join(mathBlocks[i]);
  }
  
  return s;
}

// Lấy phần nội dung có thể đọc từ một tệp .tex hoàn chỉnh. Giáo viên có thể
// tải nguyên tệp có \documentclass/\begin{document}; phần preamble vẫn được
// giữ ở CSDL để biên dịch PDF, nhưng không đưa lên màn hình học sinh.
function tachNoiDungTaiLieuLatex(src) {
  var s = lamSachLatex(src || '');
  var begin = s.indexOf('\\begin{document}');
  var end = s.lastIndexOf('\\end{document}');
  if (begin !== -1) s = s.slice(begin + '\\begin{document}'.length, end > begin ? end : undefined);
  s = s.replace(/^\s*\\(?:documentclass|usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^\n]*\}\s*$/gm, '');
  s = s.replace(/^\s*\\(?:input|include)\{[^}]+\}\s*$/gm, '');
  s = s.replace(/^\s*\\(?:newcommand|renewcommand|providecommand|def)\b[^\n]*$/gm, '');
  s = s.replace(/\\(?:maketitle|tableofcontents|frontmatter|mainmatter|backmatter|clearpage|pagebreak)\b/g, '');
  s = s.replace(/\\(?:thispagestyle|pagestyle|setcounter|addtocounter|label)\s*\{[^}]*\}(?:\s*\{[^}]*\})?/g, '');
  return s.trim();
}

// Xóa một lệnh có đối số {...} bằng bộ đếm ngoặc, để không lộ lời giải/đáp án
// khi nguồn LaTeX có các khối lồng nhau.
function xoaLenhKhoiLatex(src, command) {
  var token = '\\' + command;
  var out = String(src || '');
  var from = 0;
  while (from < out.length) {
    var at = out.indexOf(token, from);
    if (at === -1) break;
    var brace = at + token.length;
    while (/\s/.test(out.charAt(brace))) brace++;
    if (out.charAt(brace) !== '{') { from = brace; continue; }
    var depth = 1, i = brace + 1;
    while (i < out.length && depth > 0) {
      if (out.charAt(i) === '{' && out.charAt(i - 1) !== '\\') depth++;
      else if (out.charAt(i) === '}' && out.charAt(i - 1) !== '\\') depth--;
      i++;
    }
    out = out.slice(0, at) + out.slice(i);
    from = at;
  }
  return out;
}

function dinhDangVanBanTaiLieuLatex(src) {
  var html = latexRaHTML(src || '');
  html = html.replace(/\\part\*?\{([^{}]*)\}/g, '<h1 class="vm-tex-h1">$1</h1>');
  html = html.replace(/\\chapter\*?\{([^{}]*)\}/g, '<h1 class="vm-tex-h1">$1</h1>');
  html = html.replace(/\\section\*?\{([^{}]*)\}/g, '<h2 class="vm-tex-h2">$1</h2>');
  html = html.replace(/\\subsection\*?\{([^{}]*)\}/g, '<h3 class="vm-tex-h3">$1</h3>');
  html = html.replace(/\\subsubsection\*?\{([^{}]*)\}/g, '<h4 class="vm-tex-h4">$1</h4>');
  html = html.replace(/\\(?:emph)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<em>$1</em>');
  html = html.replace(/\\underline\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<u>$1</u>');
  html = html.replace(/\\textcolor\{[^}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  html = html.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '<div class="vm-tex-media-note">Hình minh họa có trong bản PDF tải về</div>');
  html = html.replace(/\\(?:noindent|centering|raggedright|raggedleft|small|normalsize|large|Large|LARGE|bfseries|itshape)\b/g, '');
  html = html.replace(/\\(?:vfill|medskip|bigskip|smallskip)\b/g, '<div class="vm-tex-gap"></div>');
  html = html.replace(/\n\s*\n+/g, '<div class="vm-tex-gap"></div>');
  html = html.replace(/\n/g, ' ');
  return html.trim();
}

// Bộ đọc tài liệu dùng chung cho lý thuyết thường, đề kiểm tra, BTVN và bài
// thưởng. Mặc định không hiển thị \loigiai/\solution để tránh lộ đáp án.
function latexTaiLieuRaHTML(src, options) {
  options = options || {};
  var kind = options.kind || 'document';
  var title = options.title || 'Tài liệu học tập';
  var body = tachNoiDungTaiLieuLatex(src || '');
  if (!options.showSolutions) {
    body = xoaLenhKhoiLatex(body, 'loigiai');
    body = xoaLenhKhoiLatex(body, 'solution');
    body = xoaLenhKhoiLatex(body, 'answer');
  }

  var labels = {
    document: 'Nội dung tài liệu', theory: 'Lý thuyết', test: 'Câu',
    homework: 'Bài', homework_bonus: 'Bài thưởng', example: 'Ví dụ',
    definition: 'Định nghĩa', theorem: 'Định lý', note: 'Lưu ý'
  };
  var envLabels = { ex: kind === 'test' ? labels.test : labels.homework, bt: labels.homework, vd: labels.example, dl: labels.theorem, dn: labels.definition, hq: 'Hệ quả', nx: 'Nhận xét', note: labels.note, remark: 'Nhận xét' };
  var envRe = /\\begin\{(ex|bt|vd|dl|dn|hq|nx|note|remark)\}([\s\S]*?)\\end\{\1\}/g;
  var html = '', last = 0, match, count = 0;

  function renderQuestion(env, content) {
    count++;
    var parsed = (env === 'ex' || env === 'bt') && typeof parseSingleQuestionLatex === 'function'
      ? parseSingleQuestionLatex('\\begin{' + env + '}' + content + '\\end{' + env + '}') : null;
    var questionBody = parsed ? parsed.content_latex : content;
    var inner = dinhDangVanBanTaiLieuLatex(questionBody);
    var choices = '';
    if (parsed && parsed.choices && parsed.choices.length > 1) {
      choices = '<div class="vm-tex-choices">' + parsed.choices.map(function (choice) {
        return '<div class="vm-tex-choice"><span class="vm-tex-choice-key">' + choice.key + '</span><div>' + dinhDangVanBanTaiLieuLatex(choice.latex || '') + '</div></div>';
      }).join('') + '</div>';
    }
    var numbered = ['ex', 'bt', 'vd'].indexOf(env) !== -1;
    return '<section class="vm-tex-block vm-tex-block-' + env + '">' +
      '<div class="vm-tex-block-title"><span>' + (envLabels[env] || labels.document) + (numbered ? ' ' + count : '') + '</span></div>' +
      '<div class="vm-tex-block-body">' + inner + choices + '</div></section>';
  }

  while ((match = envRe.exec(body)) !== null) {
    var prose = dinhDangVanBanTaiLieuLatex(body.slice(last, match.index));
    if (prose) html += '<div class="vm-tex-prose">' + prose + '</div>';
    html += renderQuestion(match[1], match[2]);
    last = envRe.lastIndex;
  }
  var tail = dinhDangVanBanTaiLieuLatex(body.slice(last));
  if (tail) html += '<div class="vm-tex-prose">' + tail + '</div>';
  if (!html.trim()) html = '<div class="vm-tex-empty">Tệp LaTeX chưa có nội dung có thể hiển thị.</div>';

  return '<article class="vm-tex-reader" data-document-kind="' + kind + '">' +
    '<header class="vm-tex-reader-head"><span class="vm-tex-reader-kicker">ĐỌC TRỰC TIẾP TRÊN VINHMATH</span><h2>' +
    String(title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h2></header>' + html + '</article>';
}

async function napFileTexVaoO(input, textareaId, statusId) {
  var file = input && input.files ? input.files[0] : null;
  var textarea = document.getElementById(textareaId);
  var status = statusId ? document.getElementById(statusId) : null;
  if (!file || !textarea) return;
  if (!/\.tex$/i.test(file.name)) {
    if (status) status.textContent = 'Vui lòng chọn đúng tệp .tex';
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (status) status.textContent = 'Tệp .tex vượt quá 5 MB';
    input.value = '';
    return;
  }
  try {
    var content = typeof file.text === 'function' ? await file.text() : await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
    textarea.value = String(content || '').replace(/^\uFEFF/, '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    if (status) status.textContent = '✓ Đã nạp ' + file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
  } catch (e) {
    if (status) status.textContent = 'Không đọc được tệp .tex';
  }
}

function parseItems(text) {
  var parts = text.split(/\\item\s*/);
  var first = parts.shift().trim();
  var html = parts.map(function (p) {
    return '<li style="margin-bottom:6px; line-height:1.6">' + p.trim() + '</li>';
  }).join('');
  return (first ? '<p style="margin-bottom:6px">' + first + '</p>' : '') + html;
}

// Xử lý các môi trường danh sách lồng nhau từ trong ra ngoài (innermost first)
function dichMoiTruongDanhSach(s) {
  var regexEnumerate = /\\begin\{enumerate\}(?:\[([^\]]*)\])?((?:(?!\\begin\{enumerate\}|\\begin\{itemize\})[\s\S])*?)\\end\{enumerate\}/g;
  var regexItemize = /\\begin\{itemize\}((?:(?!\\begin\{enumerate\}|\\begin\{itemize\})[\s\S])*?)\\end\{itemize\}/g;

  var changed = true;
  var limit = 10;
  while (changed && limit > 0) {
    changed = false;
    limit--;

    // Thay thế enumerate ở cấp trong cùng trước
    var nextS = s.replace(regexEnumerate, function(match, opt, body) {
      changed = true;
      var listStyle = 'decimal';
      if (opt) {
        if (opt.includes('a')) listStyle = 'lower-alpha';
        else if (opt.includes('A')) listStyle = 'upper-alpha';
        else if (opt.includes('i')) listStyle = 'lower-roman';
        else if (opt.includes('I')) listStyle = 'upper-roman';
      }
      var items = parseItems(body);
      return '<ol style="list-style-type:' + listStyle + '; padding-left:20px; margin: 10px 0">' + items + '</ol>';
    });

    if (nextS !== s) {
      s = nextS;
      continue;
    }

    // Thay thế itemize ở cấp trong cùng trước
    nextS = s.replace(regexItemize, function(match, body) {
      changed = true;
      var items = parseItems(body);
      return '<ul style="list-style-type:disc; padding-left:20px; margin: 10px 0">' + items + '</ul>';
    });

    if (nextS !== s) {
      s = nextS;
      continue;
    }
  }
  return s;
}

// Render mọi công thức toán bên trong phần tử
function renderToanTrong(el) {
  if (window.renderMathInElement && el) {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      macros: {
        "\\hoac": "\\left[\\begin{aligned}#1\\end{aligned}\\right.",
        "\\heva": "\\left\\{\\begin{aligned}#1\\end{aligned}\\right."
      },
      throwOnError: false
    });
  }
}

// Trình biên dịch LaTeX Parser (bóc tách \begin{ex}...\end{ex} hoặc \begin{bt}...\end{bt})
function parseLatexQuestions(latexText) {
  latexText = lamSachLatex(latexText || '');
  function parseBraces(text, count) {
    var blocks = [];
    var index = 0;
    for (var b = 0; b < count; b++) {
      var start = text.indexOf('{', index);
      if (start === -1) break;
      var braceCount = 1;
      var i = start + 1;
      while (i < text.length && braceCount > 0) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') braceCount--;
        i++;
      }
      blocks.push(text.substring(start + 1, i - 1));
      index = i;
    }
    return blocks;
  }

  var regexEx = /\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}/g;
  var match;
  var questions = [];
  
  while ((match = regexEx.exec(latexText)) !== null) {
    var envType = match[1];
    var content = match[2];
    
    var solution = "";
    var solIndex = content.indexOf('\\loigiai');
    if (solIndex !== -1) {
      var braceStart = content.indexOf('{', solIndex);
      if (braceStart !== -1) {
        var braceCount = 1;
        var i = braceStart + 1;
        while (i < content.length && braceCount > 0) {
          if (content[i] === '{') braceCount++;
          else if (content[i] === '}') braceCount--;
          i++;
        }
        solution = content.substring(braceStart + 1, i - 1);
        content = content.substring(0, solIndex) + content.substring(i);
      }
    }
    
    var choices = [];
    var choiceTFIndex = content.indexOf('\\choiceTF');
    var choiceIndex = content.indexOf('\\choice');
    var questionBody = content;
    
    if (envType === 'bt') {
      var ansMatch = solution.match(/\\textbf\{(Câu trả lời|Đáp số|Kết quả|Đáp án):?\}\s*([^\n}]+)/i);
      if (ansMatch) {
        var ansText = ansMatch[2].replace(/\.$/, '').trim();
        choices.push({
          key: 'short',
          latex: ansText,
          correct: true
        });
      }
    } else {
      if (choiceTFIndex !== -1) {
        questionBody = content.substring(0, choiceTFIndex).trim();
        var remaining = content.substring(choiceTFIndex + 9);
        var blocks = parseBraces(remaining, 4);
        var keys = ['a', 'b', 'c', 'd'];
        blocks.forEach(function (block, idx) {
          var isCorrect = false;
          var cleaned = block.trim();
          if (cleaned.includes('\\True') || cleaned.includes('\\true')) {
            isCorrect = true;
            cleaned = cleaned.replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
          }
          cleaned = cleaned.replace(/^[a-d][\.\)]\s*/i, '');
          choices.push({
            key: keys[idx],
            latex: cleaned,
            correct: isCorrect
          });
        });
      } else if (choiceIndex !== -1) {
        questionBody = content.substring(0, choiceIndex).trim();
        var remaining = content.substring(choiceIndex + 7);
        var blocks = parseBraces(remaining, 4);
        var keys = ['A', 'B', 'C', 'D'];
        blocks.forEach(function (block, idx) {
          var isCorrect = false;
          var cleaned = block.trim();
          if (cleaned.includes('\\True') || cleaned.includes('\\true')) {
            isCorrect = true;
            cleaned = cleaned.replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
          }
          cleaned = cleaned.replace(/^[A-D][\.\)]\s*/i, '');
          choices.push({
            key: keys[idx],
            latex: cleaned,
            correct: isCorrect
          });
        });
      } else {
        var ansMatch = solution.match(/\\textbf\{(Câu trả lời|Đáp số|Kết quả|Đáp án):?\}\s*([^\n}]+)/i);
        if (ansMatch) {
          var ansText = ansMatch[2].replace(/\.$/, '').trim();
          choices.push({
            key: 'short',
            latex: ansText,
            correct: true
          });
        }
      }
    }
    
    questions.push({
      content_latex: questionBody.trim(),
      choices: choices,
      solution_latex: solution.trim()
    });
  }
  return questions;
}

// Phân tích 1 câu hỏi chặn bằng LaTeX (hỗ trợ \begin{ex}, \choice, \choiceTF hoặc dạng text A., B., C., D.)
function parseSingleQuestionLatex(latexText) {
  if (!latexText || !latexText.trim()) return null;
  var text = latexText.trim();
  
  if (text.includes('\\begin{ex}') || text.includes('\\begin{bt}')) {
    var qs = parseLatexQuestions(text);
    if (qs && qs.length > 0) return qs[0];
  }
  
  var wrapped = '\\begin{ex}\n' + text + '\n\\end{ex}';
  var qsWrapped = parseLatexQuestions(wrapped);
  if (qsWrapped && qsWrapped.length > 0 && qsWrapped[0].choices && qsWrapped[0].choices.length > 0) {
    return qsWrapped[0];
  }
  
  var choices = [];
  var body = text;
  
  var optionRegex = /(?:^|\n|\s*)([A-Da-d])[\.\)]\s*([\s\S]*?)(?=(?:[A-Da-d][\.\)]|$))/g;
  var matches = [];
  var m;
  while ((m = optionRegex.exec(text)) !== null) {
    matches.push(m);
  }
  
  if (matches.length === 4) {
    var firstOptIndex = text.indexOf(matches[0][0]);
    if (firstOptIndex > 0) body = text.substring(0, firstOptIndex).trim();
    
    matches.forEach(function(match) {
      var key = match[1].toUpperCase();
      var optText = match[2].trim();
      var isCorrect = false;
      if (optText.includes('*') || optText.includes('\\True') || optText.includes('\\true')) {
        isCorrect = true;
        optText = optText.replace(/\*/g, '').replace(/\\True\s*/g, '').replace(/\\true\s*/g, '');
      }
      choices.push({ key: key, latex: optText.trim(), correct: isCorrect });
    });
  }
  
  return {
    content_latex: body.trim(),
    choices: choices,
    solution_latex: ''
  };
}
