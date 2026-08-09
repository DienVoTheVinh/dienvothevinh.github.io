const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vinhmath-exam-pdf-'));
const texPath = path.join(tempDir, 'exam-pdf-compat.tex');
const pdflatex = process.env.VM_PDFLATEX_PATH || 'pdflatex';

const tex = String.raw`\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T5]{fontenc}
\usepackage[vietnamese]{babel}
\usepackage{amsmath,amssymb}
\usepackage[loigiai]{ex_test}
\providecommand{\vmTFItem}[2]{\par\noindent\hangindent=1.9em\hangafter=1\textbf{#1)}\ #2\par}
\providecommand{\choiceTF}[5][]{\begingroup\let\True\relax\vmTFItem{a}{#2}\vmTFItem{b}{#3}\vmTFItem{c}{#4}\vmTFItem{d}{#5}\endgroup}
\newtheorem{bt}{Bài}
\begin{document}
\begin{center}{\Large\bfseries DE 100\% \& A\_B}\end{center}
\begin{ex}
Cho hàm số $f(x)=x^2-2x$. Xét tính đúng sai của các khẳng định sau.
\choiceTF[t]
{\True Đồ thị là một parabol.}
{Hàm số đồng biến trên $\mathbb R$.}
{Đỉnh của đồ thị là $I(1;-1)$.}
{\True $f(2)=0$.}
\loigiai{Dựa vào dạng đồ thị của hàm bậc hai.\par Xét lần lượt từng khẳng định.}
\end{ex}
\begin{bt}
Tính $7+7$.
\loigiai{\textbf{Câu trả lời:} 14\par Ta có $7+7=14$.}
\end{bt}
\end{document}
`;

try {
  fs.writeFileSync(texPath, tex, 'utf8');
  const result = spawnSync(pdflatex, ['-interaction=nonstopmode', '-halt-on-error', path.basename(texPath)], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      TEXINPUTS: `${root}${path.delimiter}${process.env.TEXINPUTS || ''}`,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const log = `${result.stdout || ''}\n${result.stderr || ''}`;
    throw new Error(`pdflatex failed (${result.status}):\n${log.slice(-4000)}`);
  }
  const pdfPath = path.join(tempDir, 'exam-pdf-compat.pdf');
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) {
    throw new Error('pdflatex did not produce a usable PDF');
  }
  console.log('Exam PDF generated TeX compiled successfully.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
