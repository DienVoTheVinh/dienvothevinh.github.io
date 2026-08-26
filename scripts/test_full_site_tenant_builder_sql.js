'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826211000_create_full_site_tenant_builder.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
expect(Number(path.basename(migrationPath).slice(0, 14)) > 20260826210001,
  'builder migration must run after the full-site tenant schema and indexes');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function has(pattern, message) {
  expect(pattern.test(sql), message);
}

has(/create or replace function public\.vm_admin_create_full_site_tenant\([\s\S]*p_config jsonb,[\s\S]*p_features jsonb default '\[\]'::jsonb/i,
  'builder RPC signature or safe empty feature default is missing');
has(/security invoker[\s\S]*set search_path = ''/i,
  'builder must retain caller RLS and pin an empty search path');
expect(!/security definer/i.test(sql),
  'builder must not bypass the existing admin RLS policies');
has(/v_actor is null or not \(select public\.is_admin\(\)\)/i,
  'builder needs an explicit authenticated admin guard');

has(/jsonb_typeof\(coalesce\(p_config, '\{\}'::jsonb\)\) <> 'object'[\s\S]*jsonb_typeof\(coalesce\(p_features, '\[\]'::jsonb\)\) <> 'array'/i,
  'builder payload containers must be validated before expansion');
has(/brand\.id = v_brand_id and brand\.is_active/i,
  'builder must only attach an active canonical brand template');
has(/'khong-gian\?tenant='\s*\|\|\s*v_slug/i,
  'new tenants must default to the shipped generic branded landing');
expect(!/'dang-nhap\?tenant=' \|\| v_slug/i.test(sql),
  'the post-login tenant home must not redirect back into the login flow');
has(/char_length\(v_home_path\) not between 1 and 256[\s\S]*v_home_path !~ '\^\[a-z0-9\]/i,
  'presentation path must be checked before the portal insert');
for (const variable of ['v_description', 'v_support_text', 'v_home_title', 'v_home_subtitle', 'v_home_image_path']) {
  expect(sql.includes(`char_length(${variable})`), `missing bounded validation for ${variable}`);
}

has(/jsonb_array_length\(coalesce\(p_features, '\[\]'::jsonb\)\) > 32/i,
  'feature override payload needs a hard size bound');
has(/jsonb_typeof\(item\) <> 'object'/i,
  'every feature override must be an object');
has(/when 'teacher' then[\s\S]*'classes'[\s\S]*'grading'[\s\S]*'authoring'[\s\S]*when 'student' then[\s\S]*'lessons'[\s\S]*'practice'[\s\S]*'results'/i,
  'feature keys must be validated against their role-specific menu matrix');
has(/'shown', 'locked', 'hidden'/i,
  'feature state vocabulary must match the runtime');
has(/between -1000 and 1000/i,
  'feature ordering must match the table constraint');
has(/jsonb_typeof\(item->'label_override'\) not in \('string', 'null'\)/i,
  'label overrides must reject structured JSON values');
has(/group by item->>'role_scope', item->>'feature_key'[\s\S]*having count\(\*\) > 1[\s\S]*tenant_builder_feature_duplicate/i,
  'duplicate role/feature overrides must fail before the upsert');

has(/insert into public\.exam_portals[\s\S]*false,[\s\S]*'full_site'/i,
  'every new full-site tenant must be staged inactive');
has(/insert into public\.exam_portal_feature_rules[\s\S]*on conflict \(portal_id, role_scope, feature_key\) do update/i,
  'default rules and validated overrides must be written atomically');
has(/when unique_violation then[\s\S]*tenant_builder_identity_conflict[\s\S]*errcode = '23505'/i,
  'slug or suffix races need a stable conflict error');

for (const forbidden of [
  /insert into public\.exam_portal_members/i,
  /update auth\.users/i,
  /update public\.profiles/i,
  /update public\.classes/i,
  /update public\.class_students/i
]) {
  expect(!forbidden.test(sql), 'builder must not mutate accounts, memberships, roles or classroom data');
}

has(/revoke all on function public\.vm_admin_create_full_site_tenant\(jsonb, jsonb\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to authenticated/i,
  'builder RPC must have an explicit authenticated-only execute grant');

const dollarMarkers = (sql.match(/\$function\$/g) || []).length;
expect(dollarMarkers === 2, 'builder function delimiter must be balanced');
has(/end;\s*\$function\$;/i, 'builder PL/pgSQL block must end with a semicolon');

console.log('PASS atomic admin tenant builder SQL contract');
