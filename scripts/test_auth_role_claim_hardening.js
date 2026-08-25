const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260826173000_auth_role_claim_hardening.sql'),
  'utf8'
);
const edge = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'tao-tai-khoan', 'index.ts'),
  'utf8'
);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(/drop trigger if exists trg_protect_profile on public\.profiles/i.test(migration),
  'The permissive legacy profile trigger must be removed.');
expect(/drop function if exists public\.protect_profile_sensitive\(\)/i.test(migration),
  'The dead permissive trigger function must be removed.');
expect(/create or replace function public\.handle_new_user\(\)[\s\S]*security definer[\s\S]*set search_path=''/i.test(migration),
  'The Auth profile trigger needs a pinned SECURITY DEFINER function.');
expect(/new\.raw_app_meta_data->>'vinhmath_role'/i.test(migration),
  'New account roles must come from server-owned app metadata.');
for (const role of ['admin', 'teacher', 'assistant', 'student', 'parent']) {
  expect(migration.includes(`'${role}'`), `Role claim whitelist misses ${role}.`);
}
expect(/else 'student'/i.test(migration), 'Unknown or absent role claims must become student.');
expect(!/v_username\s+like|new\.email\s+like/i.test(migration),
  'Email prefixes or domains must never grant account authority.');
expect(/revoke all on function public\.handle_new_user\(\) from public, anon, authenticated/i.test(migration),
  'Clients must not invoke the Auth trigger directly.');

const typeValidation = edge.indexOf('if (!allowedTypes.has(type))');
const permissionValidation = edge.indexOf('if (["gv", "tg", "portal_hs", "portal_gv"].includes(type))');
const firstCreate = edge.indexOf('svc.auth.admin.createUser');
expect(typeValidation >= 0 && typeValidation < permissionValidation && permissionValidation < firstCreate,
  'Type allowlist and caller authorization must run before every service-role createUser call.');
for (const type of ['hs_ph', 'gv', 'tg', 'portal_hs', 'portal_gv', 'reset_password']) {
  expect(edge.includes(`"${type}"`), `Account request allowlist misses ${type}.`);
}
expect(!/body\.(?:role|vinhmath_role)|body\[['"](?:role|vinhmath_role)['"]\]/.test(edge),
  'A caller-controlled body field must never select the role claim.');

const createCalls = Array.from(edge.matchAll(/svc\.auth\.admin\.createUser\(\{([\s\S]*?)\}\);/g), (match) => match[1]);
expect(createCalls.length === 4, 'Every account creation branch must be covered by the role-claim test.');
for (const call of createCalls) {
  expect(/app_metadata:\s*\{\s*vinhmath_role:/.test(call),
    'Every service-role createUser call must attach an explicit role claim.');
}
expect(/app_metadata:\s*\{\s*vinhmath_role:\s*"student"\s*\}/.test(createCalls[0]),
  'Portal accounts must remain ordinary student profiles.');
expect(/app_metadata:\s*\{\s*vinhmath_role:\s*"student"\s*\}/.test(createCalls[1]),
  'Student accounts need an explicit student claim.');
expect(/app_metadata:\s*\{\s*vinhmath_role:\s*"parent"\s*\}/.test(createCalls[2]),
  'Parent accounts need an explicit parent claim.');
expect(/app_metadata:\s*\{\s*vinhmath_role:\s*accountRole\s*\}/.test(createCalls[3]),
  'GV/TG role claim must come from the already-authorized fixed branch.');
expect(/const accountRole = type === "gv" \? "teacher" : "assistant"/.test(edge),
  'GV/TG requests need a closed role mapping.');

console.log('Auth role-claim hardening tests passed.');
