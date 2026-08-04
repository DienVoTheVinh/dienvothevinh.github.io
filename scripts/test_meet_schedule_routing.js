const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/vinhmath.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const context = { Date, Number, String };
vm.createContext(context);
['vmGioThanhPhut', 'vmLichDienRaNgay', 'vmChonBuoiMeetTheoGio']
  .forEach((name) => vm.runInContext(extractFunction(name), context));

const morning = { id: 'morning', weekday: 7, start_time: '09:00:00', end_time: '10:30:00', recurrence: 'weekly', visible: true };
const afternoon = { id: 'afternoon', weekday: 7, start_time: '13:00:00', end_time: '14:30:00', recurrence: 'weekly', visible: true };
const sunday = new Date('2026-08-09T08:00:00+07:00');

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

equal(context.vmLichDienRaNgay(morning, sunday), true, 'visible Sunday session');
equal(context.vmLichDienRaNgay({ ...morning, visible: false }, sunday), false, 'hidden session');
equal(context.vmLichDienRaNgay({ ...morning, recurrence: 'once', date: '2026-08-09' }, sunday), true, 'one-time session');
equal(context.vmLichDienRaNgay({ ...morning, start_date: '2026-08-10' }, sunday), false, 'future start date');
equal(context.vmLichDienRaNgay({ ...morning, recurrence: 'biweekly', start_date: '2026-07-26' }, sunday), true, 'biweekly active week');
equal(context.vmLichDienRaNgay({ ...morning, recurrence: 'biweekly', start_date: '2026-08-02' }, sunday), false, 'biweekly inactive week');

const rows = [afternoon, morning];
equal(context.vmChonBuoiMeetTheoGio(rows, new Date('2026-08-09T08:00:00+07:00')).id, 'morning', 'before morning class');
equal(context.vmChonBuoiMeetTheoGio(rows, new Date('2026-08-09T10:40:00+07:00')).id, 'morning', 'morning grace period');
equal(context.vmChonBuoiMeetTheoGio(rows, new Date('2026-08-09T11:00:00+07:00')).id, 'afternoon', 'between two classes');
equal(context.vmChonBuoiMeetTheoGio(rows, new Date('2026-08-09T13:30:00+07:00')).id, 'afternoon', 'during afternoon class');
equal(context.vmChonBuoiMeetTheoGio(rows, new Date('2026-08-09T16:00:00+07:00')).id, 'afternoon', 'after all classes');

console.log('PASS Meet schedule routing checks');
