const fs = require('fs');

const workflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

for (const directory of ['cautruc13', 'bia13']) {
  if (!new RegExp(`for dir in [^\\n]*\\b${directory}\\b`).test(workflow)) {
    throw new Error(`Pages artifact omits required LaTeX directory: ${directory}`);
  }
}

for (const required of [
  '_site/cautruc13/mausac-minimal.tex',
  '_site/cautruc13/Khai-bao-minimal.tex',
  '_site/cautruc13/BosungK.tex',
  '_site/cautruc13/LT-3.tex',
]) {
  if (!workflow.includes(`test -s ${required}`)) {
    throw new Error(`Pages workflow does not verify required runtime asset: ${required}`);
  }
}

console.log('PASS Pages artifact keeps runtime LaTeX structure files');
