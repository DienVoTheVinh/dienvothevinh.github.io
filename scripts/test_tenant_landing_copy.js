const fs = require('fs');
const vm = require('vm');

function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function expect(value, message) { if (!value) throw new Error(message); }
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const migrationName = '20260826212000_tenant_landing_copy_overlay.sql';
const migration = read(`supabase/migrations/${migrationName}`);
const shared = read('js/vinhmath.js');
const builder = read('quan-tri-khong-gian.html');
const landing = read('khong-gian.html');
const uyen = read('uyenmath.html');

expect(Number(migrationName.slice(0, 14)) > 20260826211000,
  'Landing-copy migration must run after the full-site tenant builder.');
expect(/add column if not exists landing_copy jsonb not null default '\{\}'::jsonb/.test(migration),
  'Tenant copy must be a sparse JSON object on exam_portals.');
expect(/vm_tenant_landing_copy_is_valid/.test(migration) && /pg_column_size\(p_copy\) <= 8192/.test(migration),
  'Database must enforce an allow-list and bounded public copy payload.');
expect(/entry\.key not in[\s\S]*highlight_3_body[\s\S]*footer_text/.test(migration),
  'Unknown landing-copy keys must be rejected.');
expect(/'landing_copy', portal\.landing_copy/.test(migration),
  'Public tenant context must return the validated presentation copy.');
expect(/not public\.vm_tenant_landing_copy_is_valid\(v_landing_copy\)/.test(migration),
  'Atomic tenant creation must validate cloned copy.');
expect(/home_image_path, landing_copy[\s\S]*v_home_image_path,[\s\S]*v_landing_copy/.test(migration),
  'Atomic tenant creation must persist the copy overlay.');
expect(/set home_path = 'khong-gian\?tenant=uyenmath'/.test(migration),
  'UYENMATH must move onto the generic shared landing renderer.');

const runtimeStart = shared.indexOf('var VM_TENANT_LANDING_COPY_LIMITS');
const runtimeEnd = shared.indexOf('function vmTenantOneRow', runtimeStart);
expect(runtimeStart >= 0 && runtimeEnd > runtimeStart, 'Shared landing-copy runtime is missing.');
const sandbox = {};
vm.runInNewContext(shared.slice(runtimeStart, runtimeEnd), sandbox);
const copy = sandbox.vmTenantLandingCopy({
  name: 'Không gian mẫu', short_name: 'MẪU', support_text: 'Hỗ trợ chung',
  landing_copy: { kicker: 'Lời riêng', highlight_1_title: '<b>Không phải HTML</b>', unknown: 'bỏ qua' }
});
expect(copy.kicker === 'Lời riêng', 'A valid tenant sentence must override the shared default.');
expect(copy.highlight_1_title === '<b>Không phải HTML</b>', 'Copy normalization must preserve text without interpreting it.');
expect(!Object.prototype.hasOwnProperty.call(copy, 'unknown'), 'Unknown client copy keys must be ignored.');
expect(copy.highlight_2_title === 'Luyện tập & đề thi', 'Missing keys must inherit central VinhMath defaults.');
expect(/window\.vmTenantLandingCopy\s*=\s*vmTenantLandingCopy/.test(shared),
  'The generic renderer must consume the shared copy runtime.');

Object.values({
  kicker: 'copyKicker', badge: 'copyBadgeText', section: 'copyHighlightsTitle',
  card: 'copyHighlight3Body', cta: 'copyCtaGuestText', footer: 'copyFooterText'
}).forEach((id) => expect(builder.includes(`id="${id}"`), `Builder is missing editable copy field ${id}.`));
expect(/landing_copy:landingCopyFromForm\(\)/.test(builder), 'Builder save must persist sparse copy.');
expect(/landing_copy:source&&source\.landing_copy\|\|\{\}/.test(builder), 'Clone must reuse presentation copy without forking code.');
expect(/\.range\(from,from\+size-1\)/.test(builder), 'Feature-rule loading must be paginated beyond 1,000 rows.');
expect(/brands\.filter\(function\(b\)\{return b\.is_active!==false;\}\)/.test(builder),
  'New tenants may use active brands while existing inactive links remain editable.');

expect(/vmTenantLandingCopy\(context\)/.test(landing), 'Generic landing must merge central defaults and tenant overrides.');
const render = functionSource(landing, 'renderLanding');
expect(!/innerHTML\s*=/.test(render), 'Tenant copy must only reach text sinks, never innerHTML.');
['spaceHighlightsTitle', 'spaceHighlight1Body', 'spaceCtaText', 'spaceFooterName'].forEach((id) =>
  expect(render.includes(`setText('${id}'`), `Renderer must bind ${id} through textContent.`));
expect(/new URL\('khong-gian', location\.href\)/.test(uyen) && /location\.replace/.test(uyen),
  'The legacy UYENMATH URL must be a compatibility redirect to shared code.');
expect(!/(?:uyenmath-(?:lop|bai|de|vmtool)|\/uyenmath\/)/i.test(landing),
  'Tenant landing must not point to forked feature implementations.');

console.log('PASS tenant landing copy: editable sparse text, shared defaults, safe rendering and one VinhMath feature source');
