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

console.log('Mobile exam workspace regression checks passed.');
