'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function checkMatch(source, pattern, message) {
  check(pattern.test(source), message);
}

function checkNoMatch(source, pattern, message) {
  check(!pattern.test(source), message);
}

function section(name, callback) {
  const before = failures.length;
  try {
    callback();
  } catch (error) {
    failures.push(`${name}: ${error && error.message ? error.message : error}`);
  }
  if (failures.length === before) process.stdout.write(`PASS ${name}\n`);
}

function compileInline(relativePath) {
  const html = read(relativePath);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim())
    .forEach((source, index) => {
      new vm.Script(source, { filename: `${relativePath}#${index + 1}` });
    });
  return html;
}

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

function findMigrationContaining(marker) {
  const directory = path.join(root, 'supabase', 'migrations');
  const matches = fs.readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => fs.readFileSync(path.join(directory, file), 'utf8').includes(marker))
    .sort();
  if (!matches.length) throw new Error(`missing migration containing ${marker}`);
  // CREATE OR REPLACE is intentionally versioned. The latest migration is the
  // effective contract after additive schema upgrades such as landing copy.
  return fs.readFileSync(path.join(directory, matches[matches.length - 1]), 'utf8').replace(/\r\n/g, '\n');
}

function sqlFunctionBody(source, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}`;
  const start = source.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) throw new Error(`missing function ${qualifiedName}`);
  const bodyStart = source.indexOf('as $function$', start);
  const end = source.indexOf('$function$;', bodyStart + 'as $function$'.length);
  if (bodyStart < 0 || end <= bodyStart) throw new Error(`unclosed function ${qualifiedName}`);
  return source.slice(start, end + '$function$;'.length);
}

// Extract a classic function declaration without depending on formatting or line count.
function jsFunction(source, name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const match = marker.exec(source);
  if (!match) throw new Error(`missing function ${name}`);
  const braceStart = source.indexOf('{', match.index + match[0].length);
  if (braceStart < 0) throw new Error(`missing body for function ${name}`);

  let depth = 0;
  let quote = '';
  let regex = false;
  let regexClass = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (regex) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '[') { regexClass = true; continue; }
      if (char === ']') { regexClass = false; continue; }
      if (char === '/' && !regexClass) regex = false;
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '/') {
      let previousIndex = index - 1;
      while (previousIndex >= braceStart && /\s/.test(source[previousIndex])) previousIndex -= 1;
      if (previousIndex < braceStart || /[({[=,:;!?&|]/.test(source[previousIndex])) {
        regex = true;
        regexClass = false;
        continue;
      }
    }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(`unclosed body for function ${name}`);
}

const migration = findMigrationContaining(
  'create or replace function public.vm_admin_create_full_site_tenant'
);
const unifiedMigration = findMigrationContaining(
  'create or replace function public.vm_admin_deploy_tenant'
);
const builder = compileInline('quan-tri-khong-gian.html');
const genericLanding = compileInline('khong-gian.html');
const shared = read('js/vinhmath.js');
const menu = read('js/menu-v5.js');

new vm.Script(shared, { filename: 'js/vinhmath.js' });
new vm.Script(menu, { filename: 'js/menu-v5.js' });

section('builder RPC security and draft isolation', () => {
  const body = stripSqlComments(sqlFunctionBody(
    migration,
    'public.vm_admin_create_full_site_tenant'
  ));

  checkMatch(body, /set search_path\s*=\s*''/i,
    'Builder RPC must pin an empty search_path.');
  checkMatch(body, /auth\.uid\(\)[\s\S]*public\.is_admin\(\)[\s\S]*tenant_builder_admin_required/i,
    'Builder RPC must reject anonymous and non-admin callers at runtime.');
  checkMatch(migration,
    /revoke all on function public\.vm_admin_create_full_site_tenant\(jsonb,\s*jsonb\)[\s\S]*from public,\s*anon,\s*authenticated[\s\S]*grant execute[\s\S]*to authenticated/i,
    'Builder RPC needs an explicit authenticated grant after revoking broad execute access.');
  checkMatch(body,
    /insert into public\.exam_portals\s*\([\s\S]*?is_active[\s\S]*?\)\s*values\s*\([\s\S]*?false[\s\S]*?'full_site'/i,
    'Every tenant created by the builder must start inactive and use full_site mode.');
  checkMatch(body, /insert into public\.exam_portal_feature_rules/i,
    'Builder RPC must create presentation rules atomically with the tenant draft.');

  const sensitiveWrites = /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.(?:profiles|classes|class_students|exam_portal_members))\b/i;
  checkNoMatch(body, sensitiveWrites,
    'Builder RPC must not change Auth identities, profiles, classes, class rosters or tenant memberships.');
});

section('admin create and clone workflow', () => {
  checkMatch(builder, /me\.role\s*!==?\s*['"]admin['"]/i,
    'Tenant builder page must remain admin-only.');
  checkMatch(builder, /(?:Tạo|Thêm)\s+(?:không gian|thương hiệu)/i,
    'Admin page needs a visible create-tenant action.');
  checkMatch(builder, /(?:Nhân bản|Sao chép)(?:\s+không gian)?/i,
    'Admin page needs a visible clone-tenant action.');
  checkMatch(builder, /\.rpc\(\s*['"]vm_admin_create_full_site_tenant['"]/i,
    'Create/clone must use the atomic builder RPC.');
  checkMatch(builder, /p_config\s*:/i,
    'Builder RPC call must send an explicit p_config payload.');
  checkMatch(builder, /p_features\s*:/i,
    'Builder RPC call must send feature rules so clones retain presentation configuration.');
  checkMatch(builder, /featureForKey\(r\.feature_key\)/,
    'Cloning must ignore legacy or future feature rules that the shared menu does not expose.');
  checkMatch(builder, /home_title:[^,]*\.trim\(\)\|\|null/,
    'Optional tenant title must save as NULL so an empty field inherits the shared default.');
  checkMatch(builder, /home_image_path:[^,]*\.trim\(\)\|\|null/,
    'Optional tenant image must save as NULL instead of violating the database constraint.');
  checkMatch(builder, /currentTenant[\s\S]{0,1600}(?:clone|nhân bản|sao chép)|(?:clone|nhân bản|sao chép)[\s\S]{0,1600}currentTenant/i,
    'Clone mode must derive its draft from the currently selected tenant.');
});

section('audited deploy and lifecycle workflow', () => {
  const deployBody = stripSqlComments(sqlFunctionBody(
    unifiedMigration,
    'public.vm_admin_deploy_tenant'
  ));
  const lifecycleBody = stripSqlComments(sqlFunctionBody(
    unifiedMigration,
    'public.vm_admin_update_tenant_lifecycle'
  ));

  [deployBody, lifecycleBody].forEach((body) => {
    checkMatch(body, /security definer[\s\S]*set search_path\s*=\s*''/i,
      'Tenant lifecycle RPCs must pin an empty search_path.');
    checkMatch(body, /auth\.uid\(\)[\s\S]*public\.is_admin\(\)/i,
      'Tenant lifecycle RPCs must reject anonymous and non-admin callers.');
    checkNoMatch(body, /update\s+public\.exam_portals\s+set(?:(?!\bwhere\b)[\s\S])*?\bexperience_mode\s*=/i,
      'Deploying an exam-focused tenant must never rewrite experience_mode.');
  });
  checkMatch(deployBody, /experience_mode\s*<>\s*'full_site'/i,
    'Deploy must reject legacy exam-only portals.');
  checkMatch(deployBody,
    /brand_id[\s\S]*brand_templates[\s\S]*is_active[\s\S]*tenant_brand_required/i,
    'Deploy must require an active brand before publishing a tenant.');
  checkMatch(deployBody,
    /set\s+is_active\s*=\s*true\s*,\s*exam_focus_mode\s*=\s*coalesce\(p_exam_focus\s*,\s*false\)[\s\S]*deployed_at\s*=\s*now\(\)[\s\S]*deployed_by\s*=\s*v_actor/i,
    'Deploy must atomically publish the tenant and record its audit metadata.');
  checkMatch(lifecycleBody,
    /where\s+id\s*=\s*p_portal_id\s+and\s+experience_mode\s*=\s*'full_site'/i,
    'Lifecycle updates must stay scoped to full-site tenants.');
  [deployBody, lifecycleBody].forEach((body) => checkMatch(body,
    /exam_portal_feature_rules[\s\S]*'exam_focus'[\s\S]*case\s+when\s+p_exam_focus\s+then\s+'shown'\s+else\s+'hidden'/i,
    'Exam focus must be represented by the shared tenant feature contract.'));
  checkMatch(unifiedMigration,
    /revoke all on function public\.vm_admin_deploy_tenant\(uuid,\s*boolean\) from public,anon[\s\S]*grant execute on function public\.vm_admin_deploy_tenant\(uuid,\s*boolean\) to authenticated/i,
    'Deploy RPC needs an explicit authenticated grant after public/anon revocation.');
  checkMatch(unifiedMigration,
    /revoke all on function public\.vm_admin_update_tenant_lifecycle\(uuid,\s*boolean,\s*boolean\) from public,anon[\s\S]*grant execute on function public\.vm_admin_update_tenant_lifecycle\(uuid,\s*boolean,\s*boolean\) to authenticated/i,
    'Lifecycle RPC needs an explicit authenticated grant after public/anon revocation.');

  const saveIdentity = jsFunction(builder, 'saveIdentity');
  const deployTenant = jsFunction(builder, 'deployTenant');
  const lifecycle = jsFunction(builder, 'updateTenantLifecycle');
  checkNoMatch(saveIdentity, /\bis_active\s*:/,
    'Saving a draft must not publish or pause the live tenant implicitly.');
  checkMatch(builder, /active\.disabled\s*=\s*true/,
    'The identity form must not expose a second direct activation control.');
  check(deployTenant.indexOf('saveIdentity(true)') < deployTenant.indexOf('saveFeatures(true)')
      && deployTenant.indexOf('saveFeatures(true)') < deployTenant.indexOf("vm_admin_deploy_tenant"),
    'Deploy must save identity and presentation rules before invoking the audited RPC.');
  checkMatch(lifecycle, /vm_admin_update_tenant_lifecycle[\s\S]*p_is_active\s*:\s*activeValue===true[\s\S]*p_exam_focus\s*:/,
    'Pause/resume must use the audited lifecycle RPC with an explicit exam-focus state.');
  checkMatch(builder, /quan-tri-thuong-hieu\?embed=1[\s\S]*quan-tri-portal-thi\?embed=1/,
    'The unified tenant manager must embed both legacy editors instead of duplicating them.');
});

section('accessible drag and keyboard ordering', () => {
  checkMatch(builder, /(?:draggable\s*=|\.draggable\s*=|setAttribute\(\s*['"]draggable['"])/i,
    'Feature controls need an actual draggable item or handle.');
  checkMatch(builder, /['"]dragstart['"]/i,
    'Feature ordering must handle dragstart.');
  checkMatch(builder, /['"](?:dragover|dragenter)['"]/i,
    'Feature ordering must expose a valid drop target.');
  checkMatch(builder, /['"]drop['"]/i,
    'Feature ordering must handle drop.');
  checkMatch(builder, /['"]keydown['"]/i,
    'Feature ordering must also support keyboard input.');
  checkMatch(builder, /ArrowUp/i,
    'Keyboard ordering must support ArrowUp.');
  checkMatch(builder, /ArrowDown/i,
    'Keyboard ordering must support ArrowDown.');
  checkMatch(builder, /aria-live\s*=\s*['"](?:polite|assertive)['"]/i,
    'Reorder/save feedback needs an aria-live status region.');
  checkMatch(builder, /role\s*=\s*['"]tablist['"][\s\S]*role\s*=\s*['"]tab['"][\s\S]*aria-selected/i,
    'Builder sections must expose an accessible tab contract.');
  checkMatch(builder, /ArrowLeft[\s\S]*ArrowRight[\s\S]*activateTenantTab/i,
    'Builder tabs must support keyboard navigation.');
  checkMatch(builder, /tenantBuilder[^>]*aria-labelledby\s*=\s*['"]tenantBuilderTitle['"]/i,
    'Create-space dialog needs an accessible name.');
});

section('role-local feature order', () => {
  checkMatch(builder, /role_scope\s*:/i,
    'Saved rules must preserve teacher/student role_scope.');
  checkMatch(builder, /sort_order\s*:/i,
    'Saved rules must preserve the visible order.');
  checkMatch(builder, /data-role\s*=|dataset\.role|data-role/i,
    'Feature items must carry their role identity through rendering and saving.');

  // This was the original bug: one interleaved NodeList assigned a single global
  // index, so moving a teacher item also distorted student sort_order values.
  checkNoMatch(builder,
    /querySelectorAll\(\s*['"]#featureRows\s+select:not\(\[disabled\]\)['"]\s*\)\.forEach\(\s*function\s*\([^,]+,\s*\w+\)/i,
    'Teacher and student controls must not share one global sort index.');

  const roleLoop = /(?:\[\s*['"]teacher['"]\s*,\s*['"]student['"]\s*\]|(?:FEATURE|TENANT)?_?ROLES|roleScopes?)\s*\.forEach\([\s\S]{0,2400}sort_order\s*:/i;
  const roleBuckets = /(?:teacher|student)[A-Za-z_]*(?:Order|Rows|Features)|(?:Order|Rows|Features)[A-Za-z_]*(?:teacher|student)/i;
  check(roleLoop.test(builder) || roleBuckets.test(builder),
    'sort_order must be counted independently inside each teacher/student role list.');
});

section('generic tenant preview and messages', () => {
  checkMatch(builder, /tenantPreview/i,
    'Builder must expose a tenant preview action.');
  checkMatch(builder, /currentTenant\.(?:home_path|slug)/i,
    'Preview URL must be derived from the selected tenant.');
  checkMatch(builder, /preview/i,
    'Preview URL must explicitly request preview mode.');
  const previewSource = jsFunction(builder, 'previewUrl') + jsFunction(builder, 'fillForm');
  checkNoMatch(previewSource, /\bUYENMATH\b|['"]uyenmath['"]/i,
    'Generic preview must not fall back to a hard-coded UYENMATH page.');

  const migrationMessage = jsFunction(builder, 'migrateAccounts');
  checkMatch(migrationMessage, /currentTenant\.(?:short_name|name)/i,
    'Account-migration success text must name the selected tenant dynamically.');
  checkNoMatch(migrationMessage, /\bUYENMATH\b/i,
    'Account-migration status must not hard-code one tenant name.');

  checkMatch(genericLanding, /vmLoadPublicTenantContext\(tenantSlug\)/,
    'Active public spaces must load through the public tenant RPC wrapper.');
  checkMatch(genericLanding, /previewMode[\s\S]*profiles[\s\S]*role\s*!==?\s*['"]admin['"]/,
    'Inactive preview must require an authenticated admin before direct RLS reads.');
  checkMatch(genericLanding, /\.space-preview-note\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/,
    'The admin preview banner must stay hidden on a normal public landing.');
  checkMatch(genericLanding, /vmTenantFirstShownPath\(signedContext,\s*role\.key\)/,
    'Signed-in CTA must respect the selected role feature policy.');
  checkMatch(genericLanding, /signedContext\.slug\s*===\s*tenantSlug/,
    'A session from another tenant must not be silently switched into this space.');
  checkNoMatch(genericLanding, /location\.replace\([^)]*trang-chu/,
    'The generic landing must remain visible until the user chooses a workspace.');
});

section('live tenant HTML preview security contract', () => {
  checkMatch(builder,
    /<iframe\b(?=[^>]*\bid=["']tenantLivePreviewFrame["'])(?=[^>]*\btitle=["'][^"']+["'])(?=[^>]*\bsandbox=["']allow-scripts allow-same-origin["'])(?=[^>]*\breferrerpolicy=["']same-origin["'])[^>]*><\/iframe>/i,
    'Live preview iframe must be named and narrowly sandboxed on the shared origin.');
  checkNoMatch(builder, /\bsrcdoc\s*=/i,
    'Live tenant preview must reuse the canonical renderer instead of interpolating a srcdoc document.');

  const livePreviewUrl = jsFunction(builder, 'previewUrl');
  checkMatch(livePreviewUrl, /new URL\(\s*['"]khong-gian['"]\s*,\s*location\.href\s*\)/,
    'Live preview must always render the canonical khong-gian page.');
  checkMatch(livePreviewUrl, /searchParams\.set\(\s*['"]tenant['"]/,
    'Live preview URL must identify the selected tenant.');
  checkMatch(livePreviewUrl, /searchParams\.set\(\s*['"]preview['"]\s*,\s*['"]1['"]\s*\)/,
    'Live preview URL must explicitly use authenticated preview mode.');
  checkMatch(livePreviewUrl, /searchParams\.set\(\s*['"]embed['"]\s*,\s*['"]builder['"]\s*\)/,
    'Embedded rendering must be distinguishable from a normal preview tab.');
  checkMatch(livePreviewUrl, /searchParams\.set\(\s*['"]channel['"]\s*,\s*livePreviewChannel\s*\)/,
    'Every embedded preview navigation must carry its fresh channel nonce.');
  checkNoMatch(livePreviewUrl, /home_path|tenantHome/,
    'Unsaved home_path must never choose the iframe document.');

  const liveSender = jsFunction(builder, 'sendLivePreview');
  checkMatch(liveSender, /\.postMessage\([\s\S]*?,\s*location\.origin\s*\)/,
    'Parent preview messages must target the exact current origin.');
  checkNoMatch(liveSender, /\.postMessage\([\s\S]*?,\s*['"]\*['"]\s*\)/,
    'Parent preview messages must never use a wildcard targetOrigin.');
  checkMatch(liveSender, /type\s*:\s*['"]vm:tenant-preview:draft['"][\s\S]*version\s*:\s*1[\s\S]*channel\s*:\s*livePreviewChannel[\s\S]*slug\s*:\s*context\.slug/,
    'Draft messages need a version, channel and tenant slug.');

  const parentReceiver = jsFunction(builder, 'handleLivePreviewMessage');
  checkMatch(parentReceiver, /event\.origin\s*!==\s*location\.origin/,
    'Parent must reject preview messages from every other origin.');
  checkMatch(parentReceiver, /event\.source\s*!==\s*frame\.contentWindow/,
    'Parent must reject messages not sent by its current preview frame.');
  checkMatch(parentReceiver, /data\.channel\s*!==\s*livePreviewChannel/,
    'Parent must reject messages from a stale preview channel.');
  checkMatch(parentReceiver, /data\.slug\s*!==\s*currentTenant\.slug/,
    'Parent must reject messages for a previously selected tenant.');

  const draftContext = jsFunction(builder, 'draftPreviewContext');
  [
    'name', 'short_name', 'description', 'support_text', 'home_title', 'home_subtitle',
    'home_image_path', 'landing_copy', 'brand'
  ].forEach((field) => checkMatch(draftContext, new RegExp(`\\b${field}\\s*:`),
    `Live draft allow-list is missing presentation field ${field}.`));
  [
    'login_suffix', 'teacher_login_suffix', 'member_role', 'profile_role',
    'features', 'classes', 'profiles', 'teachers', 'home_path'
  ].forEach((field) => checkNoMatch(draftContext, new RegExp(`\\b${field}\\s*:`),
    `Live draft must not expose non-presentation field ${field}.`));

  checkMatch(genericLanding, /addEventListener\(\s*['"]message['"]\s*,\s*handleBuilderPreviewMessage\s*\)/,
    'Canonical tenant renderer must expose its explicit live-preview message listener.');

  const childReceiver = jsFunction(genericLanding, 'handleBuilderPreviewMessage');
  checkMatch(childReceiver,
    /!previewMode\s*\|\|\s*!embedMode\s*\|\|\s*!previewAuthorized\s*\|\|\s*!currentContext/,
    'Child message handling must be gated by preview mode, embed mode, completed admin authorization and loaded context.');
  checkMatch(childReceiver,
    /event\.origin\s*!==\s*location\.origin\s*\|\|\s*event\.source\s*!==\s*window\.parent/,
    'Embedded renderer must reject every other origin and every source except its direct parent.');
  checkMatch(childReceiver,
    /data\.version\s*!==\s*1\s*\|\|\s*data\.channel\s*!==\s*previewChannel\s*\|\|\s*data\.slug\s*!==\s*tenantSlug/,
    'Child must reject another protocol version, stale channel or another tenant slug.');

  const previewLoader = jsFunction(genericLanding, 'loadPreview');
  checkMatch(previewLoader,
    /vmLayPhienAnToan\([^)]+\)[\s\S]*profiles[\s\S]*profileResult\.data\.role\s*!==\s*['"]admin['"]/,
    'Draft loading must authenticate the session and require the admin role.');
  checkMatch(genericLanding,
    /var\s+context\s*=\s*previewMode\s*\?\s*await\s+loadPreview\(\)\s*:\s*await\s+loadPublic\(\)\s*;\s*if\s*\(previewMode\)\s*previewAuthorized\s*=\s*true\s*;/,
    'The child must authorize live messages only after the protected preview loader resolves.');
  check((genericLanding.match(/previewAuthorized\s*=\s*true/g) || []).length === 1,
    'The renderer must have exactly one post-auth path that enables live preview messages.');

  const childDraftContext = jsFunction(genericLanding, 'previewDraftContext');
  [
    'name', 'short_name', 'description', 'support_text', 'home_title',
    'home_subtitle', 'home_image_path', 'landing_copy', 'brand'
  ].forEach((field) => checkMatch(childDraftContext, new RegExp(`\\b${field}\\s*:`),
    `Child live-draft allow-list is missing presentation field ${field}.`));
  [
    'login_suffix', 'teacher_login_suffix', 'member_role', 'profile_role',
    'features', 'classes', 'profiles', 'teachers', 'home_path'
  ].forEach((field) => checkNoMatch(childDraftContext, new RegExp(`\\bsource\\.${field}\\b|\\b${field}\\s*:\\s*source\\b`),
    `Child must ignore incoming non-presentation field ${field}.`));
  checkNoMatch(childDraftContext, /Object\.assign\(\s*\{\}\s*,\s*currentContext\s*,\s*source\s*\)|\.\.\.source/,
    'Child must not merge an untrusted draft object wholesale into the server-loaded context.');
  checkMatch(childDraftContext, /vmNormalizeTenantLandingCopy\(\s*source\.landing_copy\s*\)/,
    'Live copy must pass through the shared plain-text allow-list before rendering.');

  const childSenders = jsFunction(genericLanding, 'sendPreviewSelection') + jsFunction(genericLanding, 'announcePreviewReady');
  checkMatch(childSenders, /\.postMessage\([\s\S]*?,\s*location\.origin\s*\)/,
    'Child preview messages must target the exact current origin.');
  checkNoMatch(childSenders, /\.postMessage\([\s\S]*?,\s*['"]\*['"]\s*\)/,
    'Child preview messages must never use a wildcard targetOrigin.');
  checkNoMatch(genericLanding, /srcdoc|document\.write\s*\(/i,
    'Canonical live renderer must never build executable HTML from a draft payload.');
});

section('shared runtime order, label and escaping', () => {
  checkMatch(shared, /function vmTenantFeatureConfig\s*\(/,
    'Shared runtime needs a normalized feature-config reader.');
  checkMatch(shared, /sort_order/, 'Shared runtime must consume sort_order.');
  checkMatch(shared, /label_override/, 'Shared runtime must consume label_override.');
  checkMatch(shared, /window\.vmTenantFeatureConfig\s*=\s*vmTenantFeatureConfig/,
    'Shared feature-config reader must be exported for every page/menu.');
  checkMatch(menu, /vmTenantFeatureConfig\s*\(/,
    'Shared menu must use the normalized feature-config reader.');
  checkMatch(menu, /\.sort\(\s*function\s*\([^)]*\)\s*\{[\s\S]{0,220}featureOrder/i,
    'Shared menu must sort by tenant feature order with a deterministic fallback.');
  checkMatch(menu, /vmMenuEsc\(m\.label\)/,
    'Tenant label overrides must be escaped at the menu HTML sink.');
  checkNoMatch(menu, /['"]\s*\+\s*m\.label\s*\+\s*['"]/,
    'Tenant label overrides must never be concatenated raw into menu HTML.');

  const sandbox = {
    window: {},
    location: { pathname: '/trang-chu' },
    document: {},
    console
  };
  const nav = {
    innerHTML: '',
    querySelectorAll() { return []; }
  };
  sandbox.document.querySelector = (selector) => selector === '.navlinks' ? nav : null;
  sandbox.document.getElementById = (id) => id === 'vmTenantMenuStyle' ? {} : null;
  sandbox.document.createElement = () => ({ id: '', textContent: '' });
  sandbox.document.head = { appendChild() {} };

  vm.createContext(sandbox);
  vm.runInContext([
    jsFunction(shared, 'vmTenantFeatureConfig'),
    jsFunction(shared, 'vmTenantFeatureState'),
    jsFunction(shared, 'vmTenantFeatureForPath'),
    jsFunction(shared, 'vmTenantFirstShownPath'),
    jsFunction(menu, 'vmMenuEsc'),
    jsFunction(menu, 'vmMenuFeatureMap'),
    jsFunction(menu, 'vmMenuTenantExamFocus'),
    jsFunction(menu, 'apDungMenu')
  ].join('\n'), sandbox, { filename: 'tenant-builder-runtime-contract.js' });

  const unsafeLabel = 'Lớp <img src=x onerror=alert(1)> & "X"';
  const context = {
    full_site: true,
    features: [
      { audience: 'teacher', feature_key: 'authoring', state: 'hidden', sort_order: 0 },
      { audience: 'teacher', feature_key: 'grading', state: 'locked', sort_order: 10 },
      { audience: 'teacher', feature_key: 'classes', state: 'shown', sort_order: 20, label_override: unsafeLabel },
      { audience: 'teacher', feature_key: 'schedule', state: 'shown', sort_order: 30 },
      { audience: 'teacher', feature_key: 'vmtool', state: 'shown', sort_order: 40 },
      { audience: 'teacher', feature_key: 'home', state: 'shown', sort_order: 50 },
      { audience: 'teacher', feature_key: 'profile', state: 'shown', sort_order: 60 }
    ]
  };

  const config = sandbox.vmTenantFeatureConfig(context, 'classes', 'teacher');
  check(config.sort_order === 20 && config.label_override === unsafeLabel,
    'Runtime must retain a role-specific order and label override before rendering.');
  check(sandbox.vmTenantFirstShownPath(context, 'teacher') === 'quan-tri-lop',
    'First shown route must honor order while skipping hidden and locked features.');
  check(sandbox.vmTenantFeatureForPath('/tai-lieu.html', 'teacher') === 'classes'
    && sandbox.vmTenantFeatureForPath('/tai-lieu.html', 'student') === 'lessons',
  'Shared secondary routes must inherit the correct teacher/student feature guard.');
  check(sandbox.vmTenantFeatureForPath('/quan-tri-video-meet.html', 'teacher') === 'classes'
    && sandbox.vmTenantFeatureForPath('/thi.html', 'student') === 'practice',
  'Direct URLs must not bypass the tenant menu visibility policy.');

  const featureAccess = {
    items: [
      { feature_key: 'authoring', state: 'shown' },
      { feature_key: 'grading', state: 'shown' },
      { feature_key: 'classes', state: 'shown' },
      { feature_key: 'schedule', state: 'locked' },
      { feature_key: 'vmtool', state: 'hidden' },
      { feature_key: 'home', state: 'shown' },
      { feature_key: 'profile', state: 'shown' }
    ]
  };
  sandbox.apDungMenu('teacher', null, context, featureAccess);
  const html = nav.innerHTML;
  check(!html.includes('Soạn thảo'), 'A hidden feature must not remain in the menu.');
  check(!html.includes('VMTool'), 'A globally hidden feature must not be restored by a shown tenant rule.');
  check(html.includes('data-vm-feature="schedule"') && html.includes('Lịch <span aria-hidden="true">🔒</span>'),
    'A globally locked feature must remain visible but disabled even when the tenant marks it shown.');
  check(html.indexOf('vm-feature-locked') >= 0 && html.indexOf('vm-feature-locked') < html.indexOf('Lớp &lt;img'),
    'Locked and shown features must render in their configured order.');
  check(html.includes('Lớp &lt;img src=x onerror=alert(1)&gt; &amp; &quot;X&quot;'),
    'Escaped tenant label must remain readable as text.');
  check(!html.includes('<img src=x'),
    'Tenant label override must not inject an HTML element.');
  check(sandbox.vmMenuTenantExamFocus({ full_site: true, features: [
    { feature_key: 'exam_focus', state: 'shown' }
  ] }) === true && sandbox.vmMenuTenantExamFocus({ full_site: true, features: [
    { feature_key: 'exam_focus', state: 'hidden' }
  ] }) === false,
  'Exam-focus helper must accept only an explicit shown rule on a full-site tenant.');
});

if (failures.length) {
  console.error(`FAIL tenant builder contract (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exitCode = 1;
} else {
  console.log('PASS tenant builder contract: secure drafts, accessible role ordering, generic preview and escaped shared runtime');
}
