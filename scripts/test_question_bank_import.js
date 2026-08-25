'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QuestionBank = require('../js/question-bank.js');
const Builder = require('./build_question_bank_import.js');

const repoRoot = path.resolve(__dirname, '..');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const directorySnapshot = (directory) => digest(JSON.stringify(
  Builder.walkFilesReadOnly(directory).map((file) => {
    const stat = fs.statSync(file);
    return [path.relative(directory, file), stat.size, stat.mtimeMs];
  })
));
const archive = Builder.DEFAULT_ARCHIVE;
const archiveStatBefore = fs.statSync(archive);

assert.ok(fs.existsSync(archive), 'RAR source must exist');
const entries = Builder.listArchiveEntries(archive);
const documents = entries.filter((entry) => Builder.ROUTED_DOCUMENT_PATTERN.test(entry)).sort();
assert.strictEqual(documents.length, 21, 'only the 21 routed DuLieuNganHang TeX documents are imported');
assert.ok(documents.every((entry) => /\/DuLieuNganHang\/(10|11|12)\//.test(entry)));

const taxonomy = Builder.readTaxonomy(archive, entries);
assert.strictEqual(taxonomy.keys.length, 530);
assert.strictEqual(Object.keys(taxonomy.vi).length, 530);
assert.strictEqual(Object.keys(taxonomy.slug).length, 530);
assert.deepStrictEqual(taxonomy.vi['0D1?1-1'], {
  chap_name: 'Mệnh đề. Tập hợp',
  lesson_name: 'Mệnh đề',
  type_name: 'Xác định mệnh đề, mệnh đề chứa biến'
});

const declaredSource = String.raw`
\newcommand{\mycmd}[1]{#1}
\def \junkx \ymax{2}
\begin{ex}%[0D1N1-1]\junkx \mycmd{A}\dfrac{1}{2}\end{ex}`;
const declared = Builder.collectDeclaredMacros(declaredSource);
assert.ok(declared.has('mycmd'));
assert.ok(declared.has('ymax'));
assert.ok(!declared.has('junkx'), 'junk injected between def and target is not a declaration');
const cleanedUnit = Builder.sanitizeObfuscatedTex(declaredSource, declared);
assert.ok(!cleanedUnit.tex.includes('\\def \\junkx'));
assert.ok(cleanedUnit.tex.includes('\\mycmd'));
assert.ok(cleanedUnit.tex.includes('\\dfrac'));
assert.deepStrictEqual(cleanedUnit.removed_macros, [{ name: 'junkx', count: 1 }]);

const metadata = Builder.inferDocumentMetadata('NganHangTHPT1.3/DuLieuNganHang/12/Phan2_Lop_12_Hinh_hoc_Chuong_5.tex');
assert.strictEqual(metadata.grade, 12);
assert.strictEqual(metadata.collection, 'DuLieuNganHang');
assert.strictEqual(metadata.source_kind, 'topic_pack');
assert.strictEqual(metadata.source_label, 'Nguồn Đúng sai');
assert.strictEqual(metadata.expected_type, 'true_false');
assert.strictEqual(metadata.question_mode, 'true_false');
assert.strictEqual(metadata.area, 'H');
assert.strictEqual(metadata.chapter, 5);
assert.strictEqual(metadata.part, 2);
assert.strictEqual(metadata.batch_kind, 'part');
assert.strictEqual(metadata.batch_number, 2);

const result = Builder.buildQuestionBankImport({ archive });
assert.strictEqual(result.schema_version, 'vinhmath.question-bank.import.v1');
assert.deepStrictEqual(result.stats, {
  documents: 21,
  taxonomy_entries: 530,
  total_blocks: 20971,
  unique_questions: 20628,
  duplicate_occurrences: 343,
  active_occurrences: 17841,
  quarantine_occurrences: 3130,
  active_questions: 17823,
  quarantine_questions: 2805,
  removed_noise_macros: 423663,
  quarantine_reasons: {
    grade_path_mismatch: 94,
    mc_choice_count: 1,
    mc_correct_answer_count: 74,
    missing_short_answer: 6,
    unsupported_question_type: 2678
  }
});
assert.strictEqual(result.manifest.documents.length, 21);
assert.strictEqual(result.manifest.taxonomy.count, 530);
assert.strictEqual(result.manifest.source.read_mode, 'tar-stream-only');
assert.match(result.manifest.source.sha256, /^[0-9a-f]{64}$/);
assert.strictEqual(result.manifest.conventions.taxonomy_key_pattern, '<grade><area><chapter>?<skill>-<variant>');
assert.strictEqual(result.manifest.conventions.similarity_rule, 'same taxonomy key independent of difficulty');
assert.strictEqual(result.manifest.archive_profile.source_document_candidates.length, 17);
assert.strictEqual(
  result.manifest.archive_profile.source_document_candidates.reduce((sum, document) => sum + document.question_blocks, 0),
  1972
);
assert.deepStrictEqual(
  result.manifest.archive_profile.source_document_candidates.reduce((counts, document) => {
    counts[document.source_kind] = (counts[document.source_kind] || 0) + 1;
    return counts;
  }, {}),
  { topic_pack: 12, mock_exam: 5 }
);
assert.strictEqual(result.manifest.archive_profile.saved_generator_state.selected_collection, 'Ôn học kỳ 2');
assert.deepStrictEqual(result.manifest.archive_profile.saved_generator_state.output_modes, ['print', 'oneleftnote', 'loigiai', 'bdkhien']);
assert.strictEqual(
  result.manifest.documents.reduce((sum, document) => sum + document.item_count, 0),
  20971
);
assert.strictEqual(
  result.records.reduce((sum, record) => sum + record.occurrences.length, 0),
  20971,
  'dedupe keeps every source occurrence'
);
assert.ok(result.records.every((record) => record.question.canonical_tex));
assert.ok(result.records.filter((record) => record.question.question_id).every((record) => {
  return record.question.taxonomy_key === record.question.similarity_key &&
    record.question.taxonomy_key === record.question.id_info.taxonomy_key &&
    (record.question.difficulty
      ? record.question.difficulty_rank === QuestionBank.DIFFICULTY_RANK[record.question.difficulty]
      : record.question.difficulty_rank === null);
}));
assert.ok(result.records.every((record) => record.occurrences.every((occurrence) => occurrence.raw_tex)));
assert.ok(result.records.filter((record) => record.status === 'active').every((record) => {
  const activeOccurrence = record.occurrences.find((occurrence) => occurrence.status === 'active');
  return record.taxonomy && activeOccurrence && activeOccurrence.answer_integrity &&
    !activeOccurrence.assets.some((asset) => !asset.resolved) &&
    ['multiple_choice', 'true_false', 'short_answer'].includes(record.question.type);
}));

const activeShortRecords = result.records.filter((record) =>
  record.status === 'active' && record.question.type === 'short_answer'
);
assert.strictEqual(activeShortRecords.length, 3929, 'real corpus active short-answer baseline changed');
for (const record of activeShortRecords) {
  const reparsedShort = QuestionBank.parseQuestionBlock(record.question.canonical_tex);
  assert.strictEqual(reparsedShort.type, 'short_answer');
  assert.strictEqual(reparsedShort.short_answer, record.question.short_answer);
  assert.strictEqual(reparsedShort.canonical_hash, record.question.canonical_hash);
  assert.strictEqual(reparsedShort.uid, record.question.uid);
}
let canonicalShortBlocks = 0;
let reparsedCanonicalShortBlocks = 0;
for (const document of result.cleanDocuments) {
  for (const block of document.canonical_blocks) {
    if (!/\\textbf\{Câu trả lời:\}/.test(block)) continue;
    canonicalShortBlocks += 1;
    if (QuestionBank.parseQuestionBlock(block).type === 'short_answer') reparsedCanonicalShortBlocks += 1;
  }
}
assert.strictEqual(canonicalShortBlocks, 3946, 'clean-dir canonical short-answer occurrence baseline changed');
assert.strictEqual(
  reparsedCanonicalShortBlocks,
  canonicalShortBlocks,
  'every clean-dir bt + loigiai short answer must remain short after re-import'
);

const duplicate = result.records.find((record) => record.occurrences.length > 1);
assert.ok(duplicate, 'at least one canonical question must have duplicate occurrences');
assert.strictEqual(new Set(duplicate.occurrences.map((item) => item.source_hash)).size >= 1, true);

const firstDocument = result.manifest.documents[0];
assert.deepStrictEqual(
  firstDocument.items.map((item) => item.order),
  Array.from({ length: firstDocument.item_count }, (_, index) => index + 1),
  'document items preserve source order'
);

const supplementalSnapshotsBefore = Builder.DEFAULT_SUPPLEMENTAL_DIRECTORIES.map(directorySnapshot);
const supplemental = Builder.buildSupplementalQuestionBankManifest({
  archive,
  sourceDirectories: Builder.DEFAULT_SUPPLEMENTAL_DIRECTORIES,
  taxonomy,
  primaryResult: result,
  includeImportPackages: true
});
assert.strictEqual(supplemental.schema_version, 'vinhmath.question-bank.supplemental-manifest.v1');
assert.strictEqual(supplemental.manifest.mode, 'manifest-only');
assert.strictEqual(supplemental.manifest.write_policy, 'no-production-import');
assert.deepStrictEqual(supplemental.stats, {
  source_directories: 3,
  tex_files: 770,
  question_documents: 274,
  mock_exam_documents: 52,
  topic_pack_documents: 222,
  excluded_tex_files: 496,
  total_blocks: 5993,
  parsed_occurrences: 5993,
  parser_failures: 0,
  unique_questions: 4741,
  duplicate_occurrences: 1252,
  duplicate_groups: 1028,
  primary_overlap_questions: 620,
  net_new_questions: 4121,
  active_occurrences: 4915,
  quarantine_occurrences: 1078,
  active_questions: 3839,
  quarantine_questions: 902,
  question_types: {
    multiple_choice: 3276,
    true_false: 878,
    short_answer: 1419,
    essay: 420
  },
  unique_question_types: {
    multiple_choice: 2546,
    true_false: 663,
    short_answer: 1126,
    essay: 406
  },
  quarantine_reasons: {
    mc_correct_answer_count: 34,
    missing_or_invalid_id: 442,
    missing_short_answer: 1,
    unmapped_id: 193,
    unsupported_question_type: 406
  },
  occurrence_quarantine_reasons: {
    mc_correct_answer_count: 42,
    missing_or_invalid_id: 594,
    missing_short_answer: 1,
    unmapped_id: 201,
    unsupported_question_type: 420
  },
  asset_references: 19,
  resolved_asset_references: 19,
  unresolved_asset_references: 0,
  ambiguous_asset_references: 0,
  cross_source_asset_references: 6,
  content_addressed_assets: 13
});
assert.strictEqual(supplemental.manifest.primary_bank.unique_questions, 20628);
assert.strictEqual(supplemental.manifest.taxonomy.count, 530);
assert.strictEqual(supplemental.manifest.documents.length, 274);
assert.strictEqual(supplemental.manifest.mock_exams.length, 52);
assert.strictEqual(supplemental.importPackages.length, 274);
assert.strictEqual(
  supplemental.importPackages.reduce((sum, document) => sum + document.items.length, 0),
  5993,
  'supplemental admin package keeps every source occurrence'
);
assert.ok(supplemental.importPackages.every((entry) => entry.document.raw_tex && entry.document.client_document_key));
assert.ok(supplemental.manifest.mock_exams.every((document) => document.item_count === 22));
assert.strictEqual(
  supplemental.manifest.canonical_questions.filter((question) => question.existing_in_primary_bank).length,
  620,
  'exact canonical SHA-256 dedupes every supplemental source against the primary bank'
);
assert.strictEqual(
  supplemental.manifest.canonical_questions.filter((question) => question.dedupe_status === 'new').length +
    supplemental.manifest.canonical_questions.filter((question) => question.dedupe_status === 'duplicate_supplemental').length,
  4121
);
assert.ok(supplemental.manifest.canonical_questions.every((question) => /^qbs-[0-9a-f]{64}$/.test(question.system_uid)));
assert.ok(supplemental.manifest.canonical_questions.every((question) => !('canonical_tex' in question) && !('raw_tex' in question)));
assert.ok(supplemental.manifest.documents.every((document) => {
  return document.items.map((item) => item.order).every((order, index) => order === index + 1) &&
    document.items.every((item) => item.provenance && Array.isArray(item.provenance.metadata_tags));
}), 'supplemental documents preserve source order and bracket provenance');

const excludedReasonCounts = supplemental.manifest.excluded_documents.reduce((counts, document) => {
  counts[document.exclusion_reason] = (counts[document.exclusion_reason] || 0) + 1;
  return counts;
}, {});
assert.deepStrictEqual(excludedReasonCounts, {
  controller_tex: 12,
  generated_answer_artifact: 484
});
assert.ok(supplemental.manifest.excluded_documents.every((document) => !document.item_count));
assert.strictEqual(supplemental.manifest.assets.length, 13);
assert.ok(supplemental.manifest.assets.every((asset) => /^sha256:[0-9a-f]{64}$/.test(asset.content_address)));
assert.ok(supplemental.manifest.documents.some((document) => document.items.some((item) =>
  item.assets.some((asset) => /^cross_source_/.test(asset.resolution_scope || ''))
)), 'cross-source asset references must resolve through the shared content-addressed index');

const supplementalSourceStats = Object.fromEntries(
  supplemental.manifest.source.directories.map((source) => [source.label, source])
);
assert.deepStrictEqual(
  [
    supplementalSourceStats['De on theo chuong T10 hk1'].unique_questions,
    supplementalSourceStats['De On Theo Chuong Toan 12 Hk1'].unique_questions,
    supplementalSourceStats['DeOnTheoChuong Toan 11'].unique_questions
  ],
  [1704, 714, 2476]
);
assert.deepStrictEqual(
  [
    supplementalSourceStats['De on theo chuong T10 hk1'].primary_overlap,
    supplementalSourceStats['De On Theo Chuong Toan 12 Hk1'].primary_overlap,
    supplementalSourceStats['DeOnTheoChuong Toan 11'].primary_overlap
  ],
  [89, 35, 506]
);
assert.deepStrictEqual(
  Builder.DEFAULT_SUPPLEMENTAL_DIRECTORIES.map(directorySnapshot),
  supplementalSnapshotsBefore,
  'supplemental TeX/assets must remain untouched'
);
const repeatedSupplemental = Builder.buildSupplementalQuestionBankManifest({
  archive,
  sourceDirectories: Builder.DEFAULT_SUPPLEMENTAL_DIRECTORIES,
  taxonomy,
  primaryResult: result
});
assert.strictEqual(
  digest(JSON.stringify(repeatedSupplemental.manifest)),
  digest(JSON.stringify(supplemental.manifest)),
  'supplemental manifest must be deterministic and idempotent'
);

const archiveStatAfter = fs.statSync(archive);
assert.strictEqual(archiveStatAfter.size, archiveStatBefore.size);
assert.strictEqual(archiveStatAfter.mtimeMs, archiveStatBefore.mtimeMs, 'RAR source must remain untouched');

const second = Builder.buildQuestionBankImport({ archive });
assert.strictEqual(digest(Builder.serializeJsonl(result.records)), digest(Builder.serializeJsonl(second.records)));
assert.strictEqual(digest(JSON.stringify(result.manifest)), digest(JSON.stringify(second.manifest)));

assert.deepStrictEqual(Builder.selectChunk(result.records, 2, 50).chunk, {
  number: 2,
  size: 50,
  start_index: 50,
  end_index_exclusive: 100,
  total_chunks: Math.ceil(20628 / 50),
  total_records: 20628
});
assert.strictEqual(Builder.selectChunk(result.records, 2, 50).records.length, 50);

const primaryAdminPackages = Builder.buildPrimaryAdminPackages(result);
assert.strictEqual(primaryAdminPackages.length, 21);
assert.strictEqual(primaryAdminPackages.reduce((sum, document) => sum + document.items.length, 0), 20971);
const archiveSourcePackages = Builder.buildArchiveSourceAdminPackages({
  archive,
  primaryResult: result,
  taxonomy,
  entries
});
assert.deepStrictEqual(
  {
    documents: archiveSourcePackages.stats.documents,
    mock_exam_documents: archiveSourcePackages.stats.mock_exam_documents,
    topic_pack_documents: archiveSourcePackages.stats.topic_pack_documents,
    occurrences: archiveSourcePackages.stats.occurrences
  },
  { documents: 17, mock_exam_documents: 5, topic_pack_documents: 12, occurrences: 1972 }
);
const adminRecords = Builder.buildAdminPackageRecords(
  primaryAdminPackages.concat(archiveSourcePackages.packages),
  result.manifest.taxonomy.catalog,
  { itemChunkSize: 180 }
);
assert.strictEqual(adminRecords.stats.taxonomy_entries, 530);
assert.strictEqual(adminRecords.stats.documents, 38);
assert.strictEqual(adminRecords.stats.items, 22943);
assert.strictEqual(adminRecords.records[0].record_type, 'taxonomy');
assert.strictEqual(adminRecords.records[0].entries.length, 500);
assert.strictEqual(adminRecords.records[1].entries.length, 30);
const firstDocumentRecord = adminRecords.records.find((record) => record.record_type === 'document_chunk');
assert.ok(firstDocumentRecord.document.raw_tex);
assert.ok(firstDocumentRecord.items.length <= 180);
assert.ok(firstDocumentRecord.items.every((item) => item.source_ordinal >= 1));
const continuationRecord = adminRecords.records.find((record) =>
  record.record_type === 'document_chunk' && record.document_chunk > 1
);
assert.strictEqual(continuationRecord.document.raw_tex, '');
assert.deepStrictEqual(Builder.parseArgs(['--summary', '--chunk', '2', '--size', '50', '--clean-dir', 'tmp']), {
  archive: Builder.DEFAULT_ARCHIVE,
  output: null,
  adminPackage: null,
  cleanDir: 'tmp',
  supplementalManifest: null,
  supplementalOutput: null,
  supplementalDirs: [],
  summary: true,
  chunk: 2,
  size: 50
});
assert.deepStrictEqual(
  Builder.parseArgs(['--supplemental-manifest', 'tmp/supplemental.json', '--supplemental-dir', 'one', '--supplemental-dir', 'two']),
  {
    archive: Builder.DEFAULT_ARCHIVE,
    output: null,
    adminPackage: null,
    cleanDir: null,
    supplementalManifest: 'tmp/supplemental.json',
    supplementalOutput: null,
    supplementalDirs: ['one', 'two'],
    summary: false,
    chunk: null,
    size: null
  }
);
assert.throws(
  () => Builder.main(['--supplemental-dir', 'one']),
  /chỉ dùng cùng --supplemental-manifest hoặc --supplemental-output/
);
assert.throws(
  () => Builder.main(['--supplemental-manifest', 'tmp/supplemental.json', '--output', 'tmp/bank.jsonl']),
  /không được trộn/
);

const tempRoot = path.join(repoRoot, '.tmp-question-bank-import-' + process.pid);
assert.ok(path.relative(repoRoot, tempRoot).startsWith('.tmp-question-bank-import-'));
try {
  const jsonlOutput = Builder.writeImportArtifacts(result, path.join(tempRoot, 'bank.jsonl'), 1, 50);
  assert.strictEqual(jsonlOutput.records_written, 50);
  const lines = fs.readFileSync(jsonlOutput.jsonl, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 50);
  const firstRecord = JSON.parse(lines[0]);
  assert.strictEqual(firstRecord.schema_version, Builder.SCHEMA_VERSION);
  assert.strictEqual(firstRecord.record_type, 'question');
  assert.ok(firstRecord.question.canonical_tex);
  assert.ok(firstRecord.occurrences[0].raw_tex);
  const importDigestBefore = digest(fs.readFileSync(jsonlOutput.jsonl));
  Builder.writeImportArtifacts(result, path.join(tempRoot, 'bank.jsonl'), 1, 50);
  assert.strictEqual(digest(fs.readFileSync(jsonlOutput.jsonl)), importDigestBefore, 'JSONL output is idempotent');

  const clean = Builder.writeCleanDirectory(result, path.join(tempRoot, 'clean'));
  assert.strictEqual(clean.files.length, 21);
  assert.ok(fs.existsSync(clean.manifest));
  const cleanManifest = JSON.parse(fs.readFileSync(clean.manifest, 'utf8'));
  assert.strictEqual(cleanManifest.clean_output.file_count, 21);
  assert.strictEqual(cleanManifest.clean_output.format, 'canonical-ex-bt-loigiai');
  const cleanFile = clean.files[0];
  const cleanPath = path.join(clean.directory, ...cleanFile.clean_path.split('/'));
  const cleanTex = fs.readFileSync(cleanPath, 'utf8');
  const cleanQuestions = QuestionBank.parseTex(cleanTex);
  const sourceDocument = result.manifest.documents.find((document) => document.document_id === cleanFile.document_id);
  assert.strictEqual(cleanQuestions.length, sourceDocument.item_count);
  assert.deepStrictEqual(
    cleanQuestions.map((question) => question.question_id),
    sourceDocument.items.map((item) => item.question_id),
    'clean TeX keeps source order and IDs'
  );
  assert.ok(cleanQuestions.every((question) => ['ex', 'bt'].includes(question.raw_environment)));
  const cleanDigestBefore = digest(fs.readFileSync(cleanPath));
  Builder.writeCleanDirectory(result, path.join(tempRoot, 'clean'));
  assert.strictEqual(digest(fs.readFileSync(cleanPath)), cleanDigestBefore, 'clean TeX output is idempotent');

  const supplementalOutput = Builder.writeSupplementalManifest(
    supplemental,
    path.join(tempRoot, 'supplemental-manifest.json')
  );
  assert.ok(fs.existsSync(supplementalOutput.manifest));
  assert.ok(!fs.existsSync(path.join(tempRoot, 'question-bank.jsonl')), 'manifest-only mode must never create import JSONL');
  const persistedSupplemental = JSON.parse(fs.readFileSync(supplementalOutput.manifest, 'utf8'));
  assert.strictEqual(persistedSupplemental.schema_version, Builder.SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION);
  assert.strictEqual(persistedSupplemental.mode, 'manifest-only');
  assert.strictEqual(persistedSupplemental.stats.net_new_questions, 4121);
  const supplementalDigestBefore = digest(fs.readFileSync(supplementalOutput.manifest));
  Builder.writeSupplementalManifest(supplemental, path.join(tempRoot, 'supplemental-manifest.json'));
  assert.strictEqual(
    digest(fs.readFileSync(supplementalOutput.manifest)),
    supplementalDigestBefore,
    'supplemental manifest output is idempotent'
  );

  const adminPackageOutput = Builder.writeAdminPackageArtifacts(
    primaryAdminPackages.concat(archiveSourcePackages.packages),
    result.manifest.taxonomy.catalog,
    path.join(tempRoot, 'primary-admin-package.jsonl'),
    { source: result.manifest.source }
  );
  assert.ok(fs.existsSync(adminPackageOutput.jsonl));
  assert.ok(fs.existsSync(adminPackageOutput.manifest));
  const adminPackageManifest = JSON.parse(fs.readFileSync(adminPackageOutput.manifest, 'utf8'));
  assert.strictEqual(adminPackageManifest.schema_version, Builder.ADMIN_PACKAGE_SCHEMA_VERSION);
  assert.strictEqual(adminPackageManifest.stats.items, 22943);
  assert.strictEqual(adminPackageManifest.payload_sha256, digest(fs.readFileSync(adminPackageOutput.jsonl)));
  const packageDigestBefore = digest(fs.readFileSync(adminPackageOutput.jsonl));
  Builder.writeAdminPackageArtifacts(
    primaryAdminPackages.concat(archiveSourcePackages.packages),
    result.manifest.taxonomy.catalog,
    path.join(tempRoot, 'primary-admin-package.jsonl'),
    { source: result.manifest.source }
  );
  assert.strictEqual(digest(fs.readFileSync(adminPackageOutput.jsonl)), packageDigestBefore);

  const supplementalAdminOutput = Builder.writeAdminPackageArtifacts(
    supplemental.importPackages,
    result.manifest.taxonomy.catalog,
    path.join(tempRoot, 'supplemental-admin-package.jsonl'),
    { source: supplemental.manifest.source }
  );
  assert.strictEqual(supplementalAdminOutput.package_manifest.stats.documents, 274);
  assert.strictEqual(supplementalAdminOutput.package_manifest.stats.items, 5993);

  assert.throws(
    () => Builder.writeCleanDirectory(result, path.join(repoRoot, 'NganHang', 'forbidden-output')),
    /Không được ghi đầu ra/
  );
  assert.throws(
    () => Builder.writeSupplementalManifest(supplemental, path.join(repoRoot, 'NganHang', 'forbidden-manifest.json')),
    /Không được ghi đầu ra/
  );
  assert.throws(
    () => Builder.writeAdminPackageArtifacts(primaryAdminPackages, result.manifest.taxonomy.catalog, path.join(repoRoot, 'NganHang', 'forbidden-package.jsonl')),
    /Không được ghi đầu ra/
  );
} finally {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('question-bank import builder: all tests passed');
