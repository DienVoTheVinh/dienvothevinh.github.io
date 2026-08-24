const fs = require('fs');
const path = require('path');

const expect = (condition, message) => { if (!condition) throw new Error(message); };

require(path.resolve(__dirname, '../js/festival-theme.js'));
const festival = global.VMFestival;
expect(festival, 'Festival runtime must expose a testable public API.');

[
  [29, 9, 2023],
  [17, 9, 2024],
  [6, 10, 2025],
  [25, 9, 2026]
].forEach(([day, month, year]) => {
  const lunar = festival.solarToLunar(day, month, year, 7);
  expect(lunar.day === 15 && lunar.month === 8 && lunar.leap === 0,
    `Expected ${day}/${month}/${year} to be Mid-Autumn, got ${JSON.stringify(lunar)}`);
});

expect(festival.isActive({ mode: 'on', festival: 'mid_autumn' }, new Date('2026-01-01T00:00:00Z')), 'Forced-on mode must be active.');
expect(!festival.isActive({ mode: 'off', festival: 'mid_autumn' }, new Date('2026-09-25T00:00:00Z')), 'Off mode must win even on Mid-Autumn.');
expect(festival.isActive({ mode: 'scheduled', festival: 'mid_autumn', start_date: '2026-08-20', end_date: '2026-09-30' }, new Date('2026-08-24T05:00:00Z')), 'Scheduled range must use Vietnam date.');

const css = fs.readFileSync(path.resolve(__dirname, '../css/festival-theme.css'), 'utf8');
const runtime = fs.readFileSync(path.resolve(__dirname, '../js/festival-theme.js'), 'utf8');
const shell = fs.readFileSync(path.resolve(__dirname, '../js/vinhmath.js'), 'utf8');
const admin = fs.readFileSync(path.resolve(__dirname, '../quan-tri-le-hoi.html'), 'utf8');
const hub = fs.readFileSync(path.resolve(__dirname, '../quan-tri.html'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260824091555_mid_autumn_festival_theme.sql'), 'utf8');

expect(/\.vm-festival-layer[\s\S]*pointer-events:none/.test(css), 'Festival layer must never intercept clicks.');
expect(/@media\(max-width:760px\)[\s\S]*\.vm-festival-layer\{position:absolute[\s\S]*height:320px/.test(css), 'Mobile festival decoration must be a bounded absolute layer, not a fixed viewport overlay.');
expect(/\.vm-festival-layer \*\{animation:none!important;filter:none!important/.test(css), 'Mobile festival decoration must disable expensive perpetual effects.');
expect(runtime.includes("data-vm-passive-overlay") && runtime.includes("layer.setAttribute('inert', '')"), 'Festival runtime must mark the layer as passive and inert.');
expect(shell.includes("closest('[data-vm-passive-overlay]')"), 'Popup manager must ignore passive decorative overlays.');
expect(/prefers-reduced-motion/.test(css) && /vm-lite-motion/.test(css), 'Festival animations must respect reduced motion and low-end devices.');
expect(/value="auto"/.test(admin) && /value="scheduled"/.test(admin) && /value="on"/.test(admin) && /value="off"/.test(admin), 'Admin must support automatic, scheduled, forced-on and off modes.');
expect(hub.includes('quan-tri-le-hoi'), 'Admin hub must expose the festival shortcut.');
expect(/festival_config/.test(migration) && /on conflict \(key\) do nothing/.test(migration), 'Migration must seed a non-destructive initial festival configuration.');

console.log('PASS Mid-Autumn layer, lunar schedule, admin controls and performance guards');
