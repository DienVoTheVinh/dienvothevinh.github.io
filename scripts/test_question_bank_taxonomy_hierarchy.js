'use strict';

// The original author catalogue is the authority for classification families.
// This test deliberately does not use a browser: it guards the data shape and
// the cascade contract which prevents a Grade 10 variant from appearing in a
// Grade 12 selection merely because both use the same local number.
const assert = require('assert');
const fs = require('fs');

const catalog = JSON.parse(fs.readFileSync('NganHang/NganHangTHPT1.3/id_map.json', 'utf8'));
const html = fs.readFileSync('quan-tri-de.html', 'utf8');
const source = fs.readFileSync('js/exam-admin.js', 'utf8');

const keys = Object.keys(catalog);
const familyPattern = /^([012])([A-Z])(\d+)\?(\d+)-(\d+)$/;
assert.ok(keys.length >= 530, `legacy catalogue unexpectedly shrank (${keys.length})`);

const byGrade = keys.reduce((groups, key) => {
  const match = familyPattern.exec(key);
  assert.ok(match, `legacy family key has an invalid shape: ${key}`);
  (groups[match[1]] ||= []).push({ key, match, data: catalog[key] });
  return groups;
}, Object.create(null));
assert.deepStrictEqual(Object.fromEntries(['0', '1', '2'].map((grade) => [grade, byGrade[grade].length])), {
  0: 182,
  1: 257,
  2: 91
}, 'the original bank must retain its distinct Grade 10/11/12 family counts');

for (const grade of ['0', '1', '2']) {
  const rows = byGrade[grade];
  assert.ok(new Set(rows.map((row) => row.match[2] + row.match[3])).size > 1, `grade ${grade} must contain multiple area/chapter branches`);
  assert.ok(new Set(rows.map((row) => row.match[4])).size > 1, `grade ${grade} must contain multiple lesson/skill families`);
  assert.ok(rows.every((row) => row.data && row.data.chap_name && row.data.lesson_name && row.data.type_name), `grade ${grade} lost original hierarchy labels`);
}

// Local variants are intentionally reused. They only become meaningful after
// grade + area + chapter + lesson have been chosen.
const localVariantReuse = Object.values(byGrade).flat().filter((row) => row.match[5] === '1');
assert.ok(localVariantReuse.length > 3, 'variant 1 should be local to a selected family, never a global dropdown value');

for (const id of [
  'bankTaxonomyExplorerSummary', 'bankTaxonomyFamilyList', 'bankTaxonomyBrowserSearch',
  'bankTaxonomyGradeTabs', 'bankTaxSchema', 'bankTaxGrade', 'bankTaxArea',
  'bankTaxChapter', 'bankTaxSkill', 'bankTaxVariant', 'bankTaxDifficulty'
]) assert.ok(html.includes(`id="${id}"`), `taxonomy hierarchy UI is missing ${id}`);
assert.ok(/id="bankTaxArea"[^>]*<select/.test(html) || /<select[^>]*id="bankTaxArea"/.test(html), 'area must be selected from the catalogue, not typed manually');
assert.ok(/<select[^>]*id="bankTaxVariant"/.test(html), 'specific problem type must be selected from the local family catalogue');
assert.ok(!html.includes('list="bankTaxAreaList"') && !html.includes('list="bankTaxVariantList"'), 'legacy free-form datalists must not bypass the original ID catalogue');

for (const name of [
  'bankTaxonomyFiltered', 'bankTaxonomyOptionGroups', 'bankRenderTaxonomySuggestions',
  'bankRenderTaxonomyBrowser', 'bankTaxonomyGradeStats', 'bankUpdateTaxonomyHierarchy',
  'bankSelectTaxonomyGrade', 'bankFilterTaxonomyCatalog'
]) {
  assert.ok(source.includes(`function ${name}`), `missing cascade implementation ${name}`);
}
for (const name of ['bankUpdateTaxonomyHierarchy', 'bankSelectTaxonomyGrade', 'bankFilterTaxonomyCatalog']) {
  assert.ok(source.includes(`${name}:${name}`), `missing public export for ${name}`);
}
const cascade = source.slice(source.indexOf('function bankRenderTaxonomySuggestions'), source.indexOf('function bankTaxonomyGradeStats'));
assert.ok(cascade.includes("schema_name:schema") && cascade.includes("schema_name:schema,grade_code:grade") && cascade.includes("schema_name:schema,grade_code:grade,area:area") && cascade.includes("schema_name:schema,grade_code:grade,area:area,chapter:chapter,skill:skill"), 'taxonomy options must cascade system → grade → area → chapter → lesson → local variant');
assert.ok(cascade.includes("'bankTaxVariant'") && cascade.includes("'Chọn dạng bài cụ thể'"), 'variant dropdown must be fed only after the lesson is selected');
const browser = source.slice(source.indexOf('function bankRenderTaxonomyBrowser'), source.indexOf('function bankRenderTaxonomyCatalog'));
assert.ok(browser.includes('bankTaxonomyGradeTabs') && browser.includes('data-taxonomy-grade') && browser.includes('bankSelectTaxonomyGrade'), 'grade browser tabs must be generated from the selected ID system rather than hardcoded to THPT');
const selection = source.slice(source.indexOf('function bankChooseTaxonomy'), source.indexOf('function bankUpdateTaxonomyHierarchy'));
assert.ok(selection.includes("el('bankTaxSchema').value=entry.schema_name") && selection.includes("el('bankTaxGrade').value = entry.grade_code") && selection.includes("el('bankTaxArea').value = entry.area") && selection.includes("el('bankTaxChapter').value = entry.chapter") && selection.includes("el('bankTaxSkill').value = entry.skill") && selection.includes("el('bankTaxVariant').value = entry.variant"), 'clicking a family must restore its ID system and every hierarchy level');

console.log('question-bank taxonomy hierarchy: original catalogue and cascade contract passed');
