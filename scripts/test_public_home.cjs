'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const source = read('js/public-home.js');
const css = read('css/public-home.css');
assert.match(html, /Hệ thống dạy và học toán thông minh/);
assert.ok(html.indexOf('id="vmInstallHero"') < html.indexOf('<header class="topbar">'), 'Install strip must precede navigation');
for (const id of ['vmInstallHeroBtn', 'vmInstallHeroNote', 'homeTry', 'homeMathCanvas', 'scene-space', 'scene-graph', 'scene-geometry', 'graphA', 'blogCongKhai', 'bangLichCongKhai']) {
  assert.equal(html.split('id="' + id + '"').length - 1, 1, `Unique integration anchor: ${id}`);
}
assert.match(css, /body\.vm-public-home/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(html, /id="cyberCanvas"|id="preloader"/);
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"\s]*)?"/g)) {
  if (/^(?:https?:|#)/.test(match[1])) continue;
  const file = path.join(root, match[1].replace(/^\//, ''));
  assert.ok(fs.existsSync(file) || fs.existsSync(file + '.html'), `Missing linked asset/route: ${match[1]}`);
}

// Deterministic motion and interaction checks, without network or real user data.
function checkMotion(reduce) {
  const elements = new Map(), frames = new Map(), observers = [];
  let frameId = 0;
  const ctx = new Proxy({}, { get: (obj, key) => obj[key] || (() => {}) });
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const value = { id, value: '1', hidden: false, dataset: {}, attrs: {}, listeners: {},
      classList: { add() {}, remove() {} },
      setAttribute(k,v) { this.attrs[k] = v; },
      addEventListener(k,v) { this.listeners[k] = v; },
      getBoundingClientRect: () => ({ width: 500, height: 390, left: 0, top: 0 }),
      getContext: () => ctx
    };
    elements.set(id, value); return value;
  }
  const buttons = ['space', 'graph', 'geometry'].map(id => { const e = element('button-' + id); e.dataset.scene = id; return e; });
  const canvas = element('homeMathCanvas'); canvas.parentElement = element('stage');
  const media = { matches: reduce, addEventListener() {} };
  const document = { hidden: false, body: element('body'), listeners: {},
    getElementById: element, querySelector: element,
    querySelectorAll: selector => selector === '[data-scene]' ? buttons : [],
    addEventListener(k,v) { this.listeners[k] = v; }
  };
  class Observer { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} unobserve() {} }
  const context = { document, matchMedia: () => media, devicePixelRatio: 3,
    ResizeObserver: Observer, IntersectionObserver: Observer, innerHeight: 900,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id), sessionStorage: { setItem() {} },
    window: { IntersectionObserver: Observer, addEventListener() {} }
  };
  vm.runInNewContext(source, context);
  assert.equal(canvas.width, 750, 'Canvas resolution is capped for performance');
  assert.equal(frames.size, reduce ? 0 : 1, 'Reduced motion starts static');
  element('mathMotion').listeners.click();
  assert.equal(frames.size, reduce ? 1 : 0, 'Pause/play control works');
  if (!reduce) element('mathMotion').listeners.click();
  document.hidden = true; document.listeners.visibilitychange();
  assert.equal(frames.size, 0, 'Background tab stops animation');
  document.hidden = false; document.listeners.visibilitychange();
  buttons[1].listeners.click();
  assert.equal(frames.size, 0, 'Other math scenes stop sphere animation');
  assert.equal(element('scene-space').hidden, true);
  assert.equal(element('scene-graph').hidden, false);
  element('graphA').value = '1.5'; element('graphA').listeners.input();
  assert.equal(element('graphAValue').textContent, '1,5');
  assert.equal(element('.math-tracer').attrs.cy, 214);
  assert.match(element('parabolaPath').attrs.d, /^M[\d.]+ [\d.]+ L/);
  buttons[0].listeners.click();
  assert.equal(frames.size, 1, 'Sphere resumes when selected');
  observers[1].fn([{ isIntersecting: false }]);
  assert.equal(frames.size, 0, 'Offscreen sphere stops animation');
}
checkMotion(false); checkMotion(true);
console.log('Public homepage: assets, integration anchors, syntax, motion budget and math interactions passed.');
