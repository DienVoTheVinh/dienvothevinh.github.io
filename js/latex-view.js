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
  s = tabularSangBangHTML(s);
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
