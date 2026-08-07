const fs = require('fs');

const source = fs.readFileSync('bang-vang.html', 'utf8');

if (!/top3\.length === 3 \? \[1,0,2\]/.test(source)) {
  throw new Error('Desktop podium order 2-1-3 must remain centered');
}
if (!/@media\(max-width:\s*720px\)[\s\S]*?\.pod-1\s*\{\s*order:1;[\s\S]*?\.pod-2\s*\{\s*order:2;[\s\S]*?\.pod-3\s*\{\s*order:3;/.test(source)) {
  throw new Error('Mobile podium must render rank 1 before ranks 2 and 3');
}
if (!/@media\(max-width:\s*720px\)[\s\S]*?\.pod-1\s*\{[^}]*transform:none;/.test(source)) {
  throw new Error('Mobile winner card must not be shifted out of the viewport');
}

console.log('PASS desktop podium stays centered and mobile podium starts with rank 1');
