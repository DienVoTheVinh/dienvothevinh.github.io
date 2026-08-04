const fs = require('fs');

const home = fs.readFileSync('trang-chu.html', 'utf8');
const grading = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(home.includes('GCAL_GIO_CUOI = 24'), 'Calendar must render through midnight');
expect(home.includes('function gcalKhoangMin(ev)'), 'Calendar must normalize sessions ending at 00:00');
expect(home.includes("content:'00:00'"), 'Calendar must label the midnight boundary');
expect(home.includes('gcal-export'), 'Calendar mobile toolbar must expose a compact export action');

const toMinSource = home.match(/function gcalToMin\(t\) \{[^\n]+\}/);
const rangeSource = home.match(/function gcalKhoangMin\(ev\) \{[\s\S]*?\n\}/);
expect(toMinSource && rangeSource, 'Calendar minute helpers must remain extractable');
const overnightRange = new Function(`${toMinSource[0]}\n${rangeSource[0]}\nreturn gcalKhoangMin({ start: '23:00', end: '00:00' });`)();
expect(overnightRange.start === 1380 && overnightRange.end === 1440, '23:00-00:00 must occupy the final hour of the day');

expect(grading.includes("data-vm-popup-position', 'native'"), 'Image viewer must opt out of click anchoring');
expect(grading.includes("window.vmCanhPopup(lb, { position: 'native' })"), 'Image viewer must preserve its native viewport layout');
expect(grading.includes('height: 100dvh'), 'Image viewer must use the dynamic mobile viewport');
expect(grading.includes('grid-template-columns: 1fr 1.18fr 1fr'), 'Image viewer controls must use a stable mobile grid');
expect(grading.includes('imgBox.scrollTop = 0'), 'Image navigation must reset the image viewport');

expect(manifest.icons.length === 2, 'Manifest must expose both standard VinhMath app icon sizes');
expect(manifest.icons.every((icon) => /^\/icons\/vinhmath-(192|512)\.png$/.test(icon.src)), 'App icons must be resized from the website VinhMath logo');

console.log('PASS midnight calendar, mobile gallery and VinhMath icon checks');
