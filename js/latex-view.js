// ============================================================
// VINHMATH — BỘ HIỂN THỊ LATEX DÙNG CHUNG
// Biến LaTeX kiểu đề thi (ex_test) thành HTML xem được trên web:
//  - bỏ dòng chú thích %...
//  - bỏ \begin{center}, \immini...
//  - đổi bảng tabular -> bảng HTML
//  - phần công thức $...$ để nguyên cho KaTeX render
// Trang nào dùng: nạp file này SAU katex + auto-render.
// ============================================================

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
