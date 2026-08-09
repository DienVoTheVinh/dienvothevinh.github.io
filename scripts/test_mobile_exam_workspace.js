const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'luyen-de.html'), 'utf8');

function expect(pattern, message) {
  if (!pattern.test(page)) throw new Error(message);
}

expect(
  /id="viewWorkspace"[^>]*data-vm-popup-position="native"/,
  'Exam workspace must opt out of the shared click-positioned popup manager.'
);
expect(
  /\.exam-workspace\s*\{[^}]*height:\s*100dvh\s*!important[^}]*transform:\s*none\s*!important/s,
  'Exam workspace must stay bound to the dynamic viewport.'
);
expect(
  /\.exam-header\s*\{[^}]*position:\s*relative\s*!important[^}]*transform:\s*none\s*!important/s,
  'Exam header needs a defensive reset against stale popup inline positioning.'
);
expect(
  /class="exam-actions"/,
  'Exam action buttons need their own responsive layout container.'
);
expect(
  /@media\s*\(max-width:\s*700px\)[\s\S]*grid-template-areas:\s*"title timer"\s*"actions actions"/,
  'Mobile exam header must use the stable two-row layout.'
);
expect(
  /font-variant-numeric:\s*tabular-nums/,
  'Timer digits must not change width while counting down.'
);
expect(
  /h\.toString\(\)\.padStart\(2, '0'\)\s*\+\s*':'\s*\+/,
  'Timer must keep a stable HH:MM:SS shape.'
);
expect(
  /class="exam-card-head"/,
  'Exam cards need a responsive title and status row.'
);
expect(
  /class="btn btn-primary btn-sm exam-card-action"/,
  'Exam card actions need the mobile full-width class.'
);
expect(
  /\.exam-meta\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  'Mobile exam metadata must use two predictable columns.'
);
expect(
  /\.choice-row\s*>\s*span:last-child\s*\{[^}]*overflow-wrap:\s*anywhere/s,
  'Long answer content must wrap instead of widening the mobile workspace.'
);
expect(
  /#tabLopHocSinh\s*\{[^}]*overflow-x:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch[^}]*touch-action:\s*pan-x pinch-zoom/s,
  'The student class strip must be independently swipeable on mobile.'
);
expect(
  /#tabLopHocSinh \.tab-btn\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s,
  'Class tabs must keep their width so the horizontal strip can scroll.'
);
expect(
  /id="wkPdfBtn"[^>]*onclick="moConfigPDF\('exam'\)"/,
  'Mobile exam workspace must expose a direct PDF action.'
);
expect(
  /@media\(max-width:\s*900px\)[\s\S]*\.wk-pdf-mobile\s*\{\s*display:\s*inline-flex\s*!important/s,
  'The PDF action must become visible when the desktop sidebar is hidden.'
);
expect(
  /async function vmCapNhatVaXacNhanLuotLam[\s\S]*\.maybeSingle\(\)/,
  'Attempt submission must accept a zero-row update long enough to verify it safely.'
);
expect(
  /currentAttempt\s*=\s*\{\s*id:\s*null,[\s\S]*is_practice:\s*true[\s\S]*moPhongTuLuan\(currentExam, false\)/,
  'Essay retry must start a separate local practice attempt instead of reusing the submitted attempt id.'
);
if (/from\('attempts'\)\.update\([\s\S]{0,300}?\.single\(\)/.test(page)) {
  throw new Error('Attempt updates must not force zero rows through single().');
}

console.log('Mobile exam workspace regression checks passed.');
