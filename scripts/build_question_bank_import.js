'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const QuestionBank = require('../js/question-bank.js');

const SCHEMA_VERSION = 'vinhmath.question-bank.import.v1';
const ADMIN_PACKAGE_SCHEMA_VERSION = 'vinhmath.question-bank.admin-package.v1';
const DEFAULT_ARCHIVE = path.join(__dirname, '..', 'NganHang', 'NganHangTHPT1.3.rar');
const ROUTED_DOCUMENT_PATTERN = /\/DuLieuNganHang\/(10|11|12)\/[^/]+\.tex$/i;
const SOURCE_DOCUMENT_PATTERN = /\/(?:Data_Lop12|Data_On_HK2)\/.+\.tex$/i;
const SOURCE_SUPPORT_PATTERN = /\/(?:SP_TuyenTrong05de|Ans|Ansbook|Image|Khaibao|KhaibaoBM|BG|background)\//i;
const ASSET_EXTENSIONS = ['', '.tex', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.eps'];
const SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION = 'vinhmath.question-bank.supplemental-manifest.v1';
const DEFAULT_SUPPLEMENTAL_DIRECTORIES = Object.freeze([
  path.join(__dirname, '..', 'NganHang', 'De on theo chuong T10 hk1'),
  path.join(__dirname, '..', 'NganHang', 'De On Theo Chuong Toan 12 Hk1'),
  path.join(__dirname, '..', 'NganHang', 'DeOnTheoChuong Toan 11')
]);
const SUPPLEMENTAL_MOCK_EXAM_NAME_PATTERN = /^(?:dechinhthuc|deminhhoa|dethamkhao(?:[1-9]|[1-4]\d|50))$/i;
const SUPPLEMENTAL_ANSWER_DIRECTORY_PATTERN = /(?:^|\/)(?:ans|answer|answers|ansbook)(?:\/|$)/i;

// The archive deliberately contains thousands of random lowercase control
// sequences. Only unknown 3-6 letter commands are candidates for removal;
// standard/ex_test/TikZ commands and macros declared by the source stay intact.
const ALLOWED_MACROS = new Set((`
  begin end choice choiceTF shortans loigiai giaibai solution True
  documentclass usepackage newcommand renewcommand providecommand def gdef xdef edef let
  DeclareMathOperator DeclareRobustCommand NewDocumentCommand RenewDocumentCommand
  text textbf textit textrm textsf texttt emph mbox hbox vbox par noindent label ref eqref cite
  item itemize enumerate description center flushleft flushright minipage tabular array
  align aligned alignat gathered gather split cases equation displaymath matrix pmatrix bmatrix vmatrix Vmatrix
  frac dfrac tfrac cfrac sqrt binom dbinom tbinom overline underline widehat widetilde overbrace underbrace
  bar hat dot ddot tilde acute grave breve check top bot boxed cancel
  mathbb mathbf mathcal mathscr mathrm mathsf mathtt boldsymbol operatorname mathop
  left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr
  limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle
  sin cos tan cot sec csc arcsin arccos arctan log ln lg exp lim limsup liminf max min sup inf det gcd deg ker dim arg hom
  sum prod coprod int iint iiint oint partial nabla infty prime ell hbar aleph surd
  alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega
  Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
  pm mp times div cdot ast star circ bullet cap cup uplus sqcap sqcup vee wedge setminus smallsetminus
  oplus ominus otimes oslash bigcup bigcap bigvee land lor lnot
  le leq leqslant ge geq geqslant neq ne equiv approx sim simeq cong propto asymp doteq
  prec succ preceq succeq smile frown models vdash dashv
  in notin ni subset subseteq supset supseteq nsubseteq parallel nparallel perp mid nmid
  forall exists nexists neg not implies impliedby iff mapsto to gets rightarrow leftarrow leftrightarrow
  Rightarrow Leftarrow Leftrightarrow longrightarrow longleftarrow Longrightarrow Longleftarrow
  uparrow downarrow updownarrow Uparrow Downarrow Updownarrow nearrow searrow swarrow nwarrow
  vec overrightarrow overleftarrow wideparen triangle angle measuredangle sphericalangle
  ldots cdots vdots ddots dots dotsb dotsc dotsi dotsm dotso colon quad qquad enspace thinspace hspace vspace hfill vfill
  lfloor rfloor lceil rceil lvert rvert vert mod bmod pmod pod sgn over above atop choose tag notag
  phantom vphantom hphantom smash rule raisebox rotatebox scalebox resizebox color textcolor colorbox fcolorbox
  includegraphics pgfimage includepdf input include lstinputlisting
  heva hoac orbr cases dcases syslineskipcoeff arraystretch
  immini imminiL imminiR itemchoice itemch Opensolutionfile Closesolutionfile
  cauds caukq cauhoi ex bt vd baitap point pointo pointt radius diem goc canh cao dai rong cyc
  xmin xmax ymin ymax hcone vecto dapso
  tikzset tikzstyle path coordinate draw fill filldraw shade clip node foreach pic graph scope spy
  addplot addlegendentry pattern pgfplotsset tkzDefPoint tkzDrawPoints tkzDrawSegments tkzLabelPoints
  tkzMarkAngle tkzMarkRightAngle tkzDrawCircle tkzDefMidPoint tkzInterLL tkzGetPoint
  foreachpgfmathcount pgfmathsetmacro pgfmathparse pgfmathresult
  linebreak pagebreak newpage clearpage smallskip medskip bigskip vskip hskip
  makebox framebox fbox parbox raise includeonly footnote marginpar
  hline cline multicolumn multirow rowcolor cellcolor
  tiny scriptsize footnotesize small normalsize large Large LARGE huge Huge
  rm bf it sl sc sf tt up shape series family selectfont bfseries itshape
  lq rq glqq grqq quotedblbase textquotedblleft textquotedblright
`).trim().split(/\s+/));

function normalizeArchivePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function tarExecutable(options) {
  return (options && options.tar) || process.env.VINHMATH_TAR || 'tar';
}

function listArchiveEntries(archivePath, options) {
  const output = execFileSync(tarExecutable(options), ['-tf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
  return output.split(/\r?\n/).map(normalizeArchivePath).filter(Boolean);
}

function readArchiveEntry(archivePath, entry, options) {
  return execFileSync(tarExecutable(options), ['-xOf', archivePath, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  }).replace(/^\uFEFF/, '');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function archiveRootFromEntries(entries) {
  const mapEntry = entries.find((entry) => /\/id_map\.json$/i.test(entry));
  if (!mapEntry) throw new Error('Không tìm thấy id_map.json trong ngân hàng.');
  return mapEntry.slice(0, mapEntry.lastIndexOf('/'));
}

function readTaxonomy(archivePath, entries, options) {
  const root = archiveRootFromEntries(entries);
  const idMapPath = root + '/id_map.json';
  const idvnMapPath = root + '/idvn_map.json';
  if (!entries.includes(idvnMapPath)) throw new Error('Không tìm thấy idvn_map.json trong ngân hàng.');
  const vi = JSON.parse(readArchiveEntry(archivePath, idMapPath, options));
  const slug = JSON.parse(readArchiveEntry(archivePath, idvnMapPath, options));
  const keys = Object.keys(vi).sort();
  const catalog = keys.map((key) => ({
    key,
    vi: vi[key] || null,
    slug: slug[key] || null
  }));
  return { root, idMapPath, idvnMapPath, vi, slug, keys, catalog };
}

function readOptionalArchiveJson(archivePath, entries, entryPath, options) {
  if (!entries.includes(entryPath)) return null;
  try {
    return JSON.parse(readArchiveEntry(archivePath, entryPath, options));
  } catch (_error) {
    return null;
  }
}

function inferSourceDocumentMetadata(entry, tex) {
  const normalized = normalizeArchivePath(entry);
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const stem = fileName.replace(/\.tex$/i, '');
  const lower = stem.toLowerCase();
  const isExam = /(?:^|[_ -])(?:de.?thi|ghk|hk\d*|hoc.?ky)(?:[_ -]|$)/i.test(stem);
  return {
    document_id: 'source-' + QuestionBank.hashText(normalized),
    archive_path: normalized,
    file_name: fileName,
    title: stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    grade: /(?:Data_Lop12|Data_On_HK2|L12)/i.test(normalized) ? 12 : null,
    source_kind: isExam ? 'mock_exam' : 'topic_pack',
    exam_period: /hk1|hoc.?ky.?1/i.test(lower) ? 'semester_1' : (/hk2|hoc.?ky.?2|ghk2/i.test(lower) ? 'semester_2' : null),
    question_blocks: QuestionBank.findQuestionBlocks(tex).blocks.length,
    route_status: 'catalog_only'
  };
}

function readArchiveMechanisms(archivePath, entries, taxonomy, options) {
  const statePath = taxonomy.root + '/state.json';
  const dataPath = taxonomy.root + '/data.json';
  const savedState = readOptionalArchiveJson(archivePath, entries, statePath, options) || {};
  const selectionMatrix = readOptionalArchiveJson(archivePath, entries, dataPath, options);
  const sourceDocuments = entries
    .filter((entry) => SOURCE_DOCUMENT_PATTERN.test(entry) && !SOURCE_SUPPORT_PATTERN.test(entry))
    .sort()
    .map((entry) => inferSourceDocumentMetadata(entry, readArchiveEntry(archivePath, entry, options)));
  return {
    id_convention: {
      pattern: '<grade><area><chapter><difficulty><skill>-<variant>',
      grade_codes: { '0': 10, '1': 11, '2': 12 },
      difficulty_codes: { N: 'NB', H: 'TH', T: 'TH', V: 'VD', K: 'VD', G: 'VDC', C: 'VDC' },
      taxonomy_key_pattern: '<grade><area><chapter>?<skill>-<variant>',
      similarity_rule: 'same taxonomy key independent of difficulty',
      variant_semantics: 'taxonomy subtype; repeated IDs are allowed and UID comes from canonical content'
    },
    saved_generator_state: {
      source_labels: savedState.sources || {},
      selected_collection: savedState.radio || null,
      output_modes: Array.isArray(savedState.checkbox_file) ? savedState.checkbox_file : [],
      selection_matrix: Array.isArray(selectionMatrix) ? selectionMatrix : null
    },
    source_document_candidates: sourceDocuments
  };
}

function collectDeclaredMacros(tex) {
  const declared = new Set();
  const patterns = [
    /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|NewDocumentCommand|RenewDocumentCommand)\*?\s*\{?\s*\\([A-Za-z@]+)\}?/g,
    /\\DeclareMathOperator\*?\s*\{\s*\\([A-Za-z@]+)\s*\}/g
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(tex))) declared.add(match[1]);
  });
  // Obfuscated files may inject a junk command between \def and the real
  // target (for example "\def \abcde \ymax{2}"). The last control sequence
  // before the definition body is therefore the intended declared macro.
  const defPattern = /\\(?:gdef|xdef|edef|def)\s*((?:\\[A-Za-z@]+\s*)+)(?=(?:#\d\s*)*\{)/g;
  let defMatch;
  while ((defMatch = defPattern.exec(tex))) {
    const names = Array.from(defMatch[1].matchAll(/\\([A-Za-z@]+)/g));
    if (names.length) declared.add(names[names.length - 1][1]);
  }
  return declared;
}

function sanitizeObfuscatedTex(rawTex, declaredMacros) {
  const declared = declaredMacros || new Set();
  const removed = Object.create(null);
  const masked = QuestionBank.maskComments(rawTex);
  const ranges = [];
  const pattern = /\\([a-z]{3,6})\b/g;
  let match;
  while ((match = pattern.exec(masked))) {
    const macro = match[1];
    if (ALLOWED_MACROS.has(macro) || declared.has(macro)) continue;
    ranges.push({ start: match.index, end: pattern.lastIndex });
    removed[macro] = (removed[macro] || 0) + 1;
  }
  let tex = rawTex;
  ranges.sort((a, b) => b.start - a.start).forEach((range) => {
    tex = tex.slice(0, range.start) + tex.slice(range.end);
  });
  return {
    tex,
    removed_count: ranges.length,
    removed_macros: Object.keys(removed).sort().map((name) => ({ name, count: removed[name] }))
  };
}

function inferDocumentMetadata(entry) {
  const normalized = normalizeArchivePath(entry);
  const gradeMatch = /\/DuLieuNganHang\/(10|11|12)\//i.exec(normalized);
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const stem = fileName.replace(/\.tex$/i, '');
  const lower = stem.toLowerCase();
  let expectedType = 'mixed';
  if (/dung.?sai/.test(lower) || /phan2/.test(lower)) expectedType = 'true_false';
  else if (/trac.?nghiem/.test(lower) || /phan1/.test(lower)) expectedType = 'multiple_choice';
  else if (/tra.?loi.?ngan/.test(lower)) expectedType = 'short_answer';
  else if (/tu.?luan|tuan.?luan/.test(lower)) expectedType = 'essay';
  let area = 'mixed';
  if (/dai.?so/.test(lower)) area = 'D';
  if (/hinh.?hoc/.test(lower)) area = 'H';
  const chapterMatch = /chuong[_ -]?(\d+)/i.exec(stem);
  const partMatch = /phan[_ -]?(\d+)/i.exec(stem);
  const batchMatch = /lan[_ -]?(\d+)/i.exec(stem);
  const sourceLabel = {
    multiple_choice: 'Nguồn Trắc nghiệm',
    true_false: 'Nguồn Đúng sai',
    short_answer: 'Nguồn điền khuyết',
    essay: 'Nguồn tự luận',
    mixed: 'Nguồn hỗn hợp'
  }[expectedType];
  return {
    document_id: 'doc-' + QuestionBank.hashText(normalized),
    archive_path: normalized,
    file_name: fileName,
    title: stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    grade,
    collection: 'DuLieuNganHang',
    source_kind: 'topic_pack',
    source_label: sourceLabel,
    expected_type: expectedType,
    question_mode: expectedType,
    area,
    chapter: chapterMatch ? Number(chapterMatch[1]) : null,
    part: partMatch ? Number(partMatch[1]) : null,
    batch_kind: partMatch ? 'part' : (batchMatch ? 'revision' : null),
    batch_number: partMatch ? Number(partMatch[1]) : (batchMatch ? Number(batchMatch[1]) : null)
  };
}

function taxonomyKeyForQuestion(question) {
  const info = question && question.id_info;
  if (!info) return null;
  return question.taxonomy_key || info.taxonomy_key || (info.grade_code + info.area + info.chapter + '?' + info.skill + '-' + info.variant);
}

function taxonomyForQuestion(question, taxonomy) {
  const key = taxonomyKeyForQuestion(question);
  if (!key || !Object.prototype.hasOwnProperty.call(taxonomy.vi, key)) return null;
  return {
    key,
    vi: taxonomy.vi[key] || null,
    slug: taxonomy.slug[key] || null,
    similarity_key: question.similarity_key || key,
    topic_code: question.topic_code || null,
    skill_family: question.skill_family || null,
    variant: question.variant || null
  };
}

function resolveAssetReference(ref, documentEntry, archiveEntryLookup) {
  const rawPath = normalizeArchivePath(ref.path).replace(/^['"]|['"]$/g, '');
  const documentDir = documentEntry.slice(0, documentEntry.lastIndexOf('/'));
  const archiveRoot = documentEntry.slice(0, documentEntry.indexOf('/DuLieuNganHang/'));
  const bases = [];
  if (rawPath) {
    bases.push(path.posix.normalize(documentDir + '/' + rawPath));
    bases.push(path.posix.normalize(archiveRoot + '/' + rawPath));
  }
  let matchedPath = null;
  outer: for (const base of bases) {
    for (const extension of ASSET_EXTENSIONS) {
      const candidate = normalizeArchivePath(base + extension).toLowerCase();
      if (archiveEntryLookup.has(candidate)) {
        matchedPath = archiveEntryLookup.get(candidate);
        break outer;
      }
    }
  }
  return {
    kind: ref.kind,
    command: ref.command,
    path: ref.path,
    resolved: Boolean(matchedPath),
    archive_path: matchedPath
  };
}

function validateAnswer(question) {
  const reasons = [];
  if (question.type === 'multiple_choice') {
    if (question.choices.length !== 4) reasons.push('mc_choice_count');
    if (question.correct_choice_indexes.length !== 1) reasons.push('mc_correct_answer_count');
    if (question.choices.some((choice) => !String(choice.tex || '').trim())) reasons.push('empty_choice');
  } else if (question.type === 'true_false') {
    if (question.choices.length !== 4) reasons.push('tf_choice_count');
    if (question.choices.some((choice) => !String(choice.tex || '').trim())) reasons.push('empty_choice');
  } else if (question.type === 'short_answer') {
    if (!String(question.short_answer || '').trim()) reasons.push('missing_short_answer');
  } else {
    reasons.push('unsupported_question_type');
  }
  return { valid: reasons.length === 0, reasons };
}

function classifyQuestion(question, documentMetadata, taxonomyEntry, resolvedAssets) {
  const reasons = [];
  if (!question.question_id || !question.id_info) reasons.push('missing_or_invalid_id');
  else {
    if (!question.difficulty) reasons.push('invalid_difficulty');
    if (!taxonomyEntry) reasons.push('unmapped_id');
  }
  if (!['multiple_choice', 'true_false', 'short_answer'].includes(question.type)) {
    reasons.push('unsupported_question_type');
  }
  const answer = validateAnswer(question);
  for (const reason of answer.reasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  if (question.grade !== documentMetadata.grade) reasons.push('grade_path_mismatch');
  if (resolvedAssets.some((asset) => !asset.resolved)) reasons.push('unresolved_external_asset');
  return { status: reasons.length ? 'quarantine' : 'active', reasons, answer_integrity: answer.valid };
}

function questionPayload(question) {
  return {
    uid: question.uid,
    canonical_hash: question.canonical_hash,
    normalized_environment: question.normalized_environment,
    type: question.type,
    question_id: question.question_id,
    id_info: question.id_info,
    grade: question.grade,
    area: question.area,
    chapter: question.chapter,
    chapter_code: question.chapter_code,
    topic_code: question.topic_code,
    difficulty: question.difficulty,
    difficulty_code: question.difficulty_code,
    difficulty_rank: question.difficulty_rank,
    skill: question.skill,
    skill_code: question.skill_code,
    skill_family: question.skill_family,
    variant: question.variant,
    taxonomy_key: question.taxonomy_key,
    similarity_key: question.similarity_key,
    content_tex: question.content_tex,
    choices: question.choices,
    correct_choice_indexes: question.correct_choice_indexes,
    short_answer: question.short_answer,
    solution_tex: question.solution_tex,
    asset_refs: question.asset_refs,
    embedded_graphics: question.embedded_graphics,
    canonical_tex: question.canonical_tex
  };
}

function questionImportPayload(question, occurrence, status, reasons) {
  const answer = question.type === 'short_answer'
    ? { value: question.short_answer || '', option: question.short_answer_option || null }
    : { correct_indexes: question.correct_choice_indexes || [] };
  const sourceOrder = Number(occurrence && occurrence.order || question.source_index || 0);
  const normalizedStatus = status === 'active' ? 'active' : 'quarantined';
  return {
    client_key: question.uid,
    canonical_hash: question.canonical_hash,
    legacy_code: question.question_id || null,
    question_type: question.type,
    difficulty: question.difficulty || null,
    grade: question.grade || null,
    similarity_key: question.similarity_key || null,
    taxonomy: {
      area: question.area || null,
      chapter: question.chapter || null,
      chapter_code: question.chapter_code || null,
      topic_code: question.topic_code || null,
      difficulty_rank: question.difficulty_rank || null,
      skill: question.skill || null,
      skill_code: question.skill_code || null,
      skill_family: question.skill_family || null,
      variant: question.variant || null,
      taxonomy_key: question.taxonomy_key || null,
      similarity_key: question.similarity_key || null
    },
    content_latex: question.content_tex || '',
    choices: question.choices || [],
    answer,
    solution_latex: question.solution_tex || '',
    raw_tex: occurrence && occurrence.raw_tex || question.raw_tex || question.canonical_tex || '',
    canonical_tex: question.canonical_tex || '',
    assets: occurrence && occurrence.assets || {
      has_assets: Boolean(question.asset_refs && question.asset_refs.length),
      asset_refs: question.asset_refs || [],
      embedded_graphics: question.embedded_graphics || []
    },
    status: normalizedStatus,
    quarantine_reason: normalizedStatus === 'active' ? null : (reasons || []).join('; '),
    source_ordinal: Math.max(sourceOrder, 1),
    source_location: occurrence && (
      occurrence.archive_path || occurrence.bank_relative_path || occurrence.source_relative_path
    ) || question.source_path || null,
    source_metadata: {
      occurrence_id: occurrence && occurrence.occurrence_id || null,
      source_hash: occurrence && occurrence.source_hash || question.source_hash || null,
      provenance: occurrence && occurrence.provenance || null,
      assets: occurrence && occurrence.assets || []
    }
  };
}

function documentPackagePayload(metadata, rawTex, extraMetadata = {}) {
  const relativePath = metadata.archive_path || metadata.bank_relative_path || metadata.source_relative_path || metadata.file_name;
  return {
    client_document_key: metadata.document_id,
    title: metadata.title || String(metadata.file_name || 'Nguồn TeX').replace(/\.tex$/i, ''),
    source_kind: metadata.source_kind || 'topic_pack',
    province: metadata.province || null,
    exam_year: metadata.exam_year || null,
    exam_kind: metadata.exam_kind || (metadata.source_kind === 'mock_exam' ? 'mock' : 'chapter'),
    original_filename: metadata.file_name || null,
    content_hash: sha256Text(rawTex),
    raw_tex: rawTex,
    status: metadata.status === 'archived' ? 'archived' : 'active',
    tags: [metadata.source_label, metadata.collection, metadata.source_root]
      .filter(Boolean),
    metadata: {
      source_title: metadata.title || null,
      grade: metadata.grade || null,
      source_kind: metadata.source_kind || 'topic_pack',
      expected_type: metadata.expected_type || null,
      source_label: metadata.source_label || null,
      source_id: metadata.source_id || null,
      source_root: metadata.source_root || null,
      source_relative_path: metadata.source_relative_path || null,
      area: metadata.area || null,
      chapter: metadata.chapter || null,
      part: metadata.part || null,
      batch_kind: metadata.batch_kind || null,
      batch_number: metadata.batch_number || null,
      ...extraMetadata
    },
    provenance: {
      relative_path: relativePath || null,
      source_document_id: metadata.document_id,
      imported_by: ADMIN_PACKAGE_SCHEMA_VERSION
    }
  };
}

function candidateRank(candidate) {
  return (candidate.status === 'active' ? 0 : 1000) + candidate.reasons.length;
}

function compareStableText(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  return a < b ? -1 : (a > b ? 1 : 0);
}

function walkFilesReadOnly(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const files = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .slice()
      .sort((a, b) => compareStableText(a.name, b.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(root);
  return files;
}

function supplementalSourceDescriptors(sourceDirectories, bankRoot) {
  const seen = new Set();
  return (sourceDirectories || DEFAULT_SUPPLEMENTAL_DIRECTORIES).map((directory) => path.resolve(directory))
    .filter((directory) => {
      const key = directory.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((directory) => {
      if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error('Không tìm thấy thư mục nguồn bổ sung: ' + directory);
      }
      const bankRelative = normalizeArchivePath(path.relative(bankRoot, directory));
      if (!bankRelative || bankRelative.startsWith('../')) {
        throw new Error('Thư mục nguồn bổ sung phải nằm trong NganHang: ' + directory);
      }
      return {
        source_id: 'supplemental-' + QuestionBank.hashText(bankRelative.toLowerCase()),
        absolute_path: directory,
        bank_relative_path: bankRelative,
        label: path.basename(directory)
      };
    })
    .sort((a, b) => compareStableText(a.bank_relative_path, b.bank_relative_path));
}

function extractBracketMetadata(rawTex) {
  const tags = [];
  const pattern = /%\s*\[([^\]\r\n]+)\]/g;
  let match;
  while ((match = pattern.exec(String(rawTex || '')))) {
    const value = String(match[1] || '').trim();
    if (value) tags.push(value);
  }
  return tags;
}

function compactExamStem(fileName) {
  return String(fileName || '')
    .replace(/\.tex$/i, '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function inferSupplementalDocumentMetadata(source, absolutePath, tex, located) {
  const sourceRelative = normalizeArchivePath(path.relative(source.absolute_path, absolutePath));
  const bankRelative = normalizeArchivePath(path.join(source.bank_relative_path, sourceRelative));
  const fileName = path.basename(absolutePath);
  const stem = fileName.replace(/\.tex$/i, '');
  const compactStem = compactExamStem(fileName);
  const inThptCollection = /(?:^|\/)THPT(?:\/|$)/i.test(sourceRelative);
  const namedMockExam = inThptCollection && SUPPLEMENTAL_MOCK_EXAM_NAME_PATTERN.test(compactStem);
  const answerArtifact = SUPPLEMENTAL_ANSWER_DIRECTORY_PATTERN.test(sourceRelative);
  const hasControllerSignals = /\\(?:documentclass|input|include|Opensolutionfile|inputansbox)\b/i.test(tex);
  let routeStatus = 'question_document';
  let exclusionReason = null;
  if (answerArtifact) {
    routeStatus = 'excluded';
    exclusionReason = 'generated_answer_artifact';
  } else if (!located.blocks.length) {
    routeStatus = 'excluded';
    exclusionReason = hasControllerSignals ? 'controller_tex' : 'support_tex_without_questions';
  }
  return {
    document_id: 'supp-doc-' + QuestionBank.hashText(source.source_id + '/' + sourceRelative.toLowerCase()),
    source_id: source.source_id,
    source_label: source.label,
    source_root: source.bank_relative_path,
    source_relative_path: sourceRelative,
    bank_relative_path: bankRelative,
    file_name: fileName,
    title: stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    source_kind: namedMockExam ? 'mock_exam' : 'topic_pack',
    expected_question_count: namedMockExam ? 22 : null,
    expected_type_counts: namedMockExam
      ? { multiple_choice: 12, true_false: 4, short_answer: 6, essay: 0 }
      : null,
    route_status: routeStatus,
    exclusion_reason: exclusionReason,
    parse_errors: located.errors,
    item_count: located.blocks.length
  };
}

function addCounts(target, source) {
  Object.keys(source || {}).forEach((key) => {
    target[key] = (target[key] || 0) + Number(source[key] || 0);
  });
  return target;
}

function buildSupplementalAssetIndex(sources, bankRoot) {
  const files = [];
  const byAbsolutePath = new Map();
  sources.forEach((source) => {
    walkFilesReadOnly(source.absolute_path).forEach((absolutePath) => {
      const bankRelativePath = normalizeArchivePath(path.relative(bankRoot, absolutePath));
      const sourceRelativePath = normalizeArchivePath(path.relative(source.absolute_path, absolutePath));
      const item = {
        absolute_path: absolutePath,
        absolute_key: path.resolve(absolutePath).toLowerCase(),
        source_id: source.source_id,
        source_root: source.bank_relative_path,
        source_relative_path: sourceRelativePath,
        bank_relative_path: bankRelativePath,
        bank_relative_key: bankRelativePath.toLowerCase(),
        base_name_key: path.basename(absolutePath).toLowerCase(),
        size_bytes: fs.statSync(absolutePath).size,
        sha256: null
      };
      files.push(item);
      byAbsolutePath.set(item.absolute_key, item);
    });
  });
  files.sort((a, b) => compareStableText(a.bank_relative_path, b.bank_relative_path));
  return { bank_root: bankRoot, sources, files, by_absolute_path: byAbsolutePath };
}

function ensureAssetHash(asset) {
  if (!asset.sha256) asset.sha256 = sha256File(asset.absolute_path);
  return asset.sha256;
}

function assetPathVariants(rawPath) {
  const normalized = normalizeArchivePath(rawPath)
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\/+/, '');
  if (!normalized || /[{}\\]/.test(normalized)) return [];
  const extension = path.posix.extname(normalized);
  return (extension ? [''] : ASSET_EXTENSIONS).map((suffix) => normalized + suffix);
}

function resolveSupplementalAssetReference(ref, documentAbsolutePath, source, assetIndex) {
  const variants = assetPathVariants(ref.path);
  const ranked = new Map();
  const addCandidate = (asset, rank, scope) => {
    if (!asset) return;
    const existing = ranked.get(asset.absolute_key);
    if (!existing || rank < existing.rank) ranked.set(asset.absolute_key, { asset, rank, scope });
  };
  for (const variant of variants) {
    const nativeVariant = variant.split('/').join(path.sep);
    const documentCandidate = path.resolve(path.dirname(documentAbsolutePath), nativeVariant).toLowerCase();
    addCandidate(assetIndex.by_absolute_path.get(documentCandidate), 0, 'document_relative');
    const sourceCandidate = path.resolve(source.absolute_path, nativeVariant).toLowerCase();
    addCandidate(assetIndex.by_absolute_path.get(sourceCandidate), 1, 'source_relative');
  }
  if (!ranked.size) {
    for (const variant of variants) {
      const key = normalizeArchivePath(variant).toLowerCase();
      const suffix = '/' + key;
      assetIndex.files.forEach((asset) => {
        if (asset.bank_relative_key === key || asset.bank_relative_key.endsWith(suffix)) {
          addCandidate(asset, 2, asset.source_id === source.source_id ? 'source_suffix' : 'cross_source_suffix');
        }
      });
    }
  }
  if (!ranked.size) {
    const baseNames = new Set(variants.map((variant) => path.posix.basename(variant).toLowerCase()));
    assetIndex.files.forEach((asset) => {
      if (baseNames.has(asset.base_name_key)) {
        addCandidate(asset, 3, asset.source_id === source.source_id ? 'source_basename' : 'cross_source_basename');
      }
    });
  }
  if (!ranked.size) {
    return {
      kind: ref.kind,
      command: ref.command,
      path: ref.path,
      resolved: false,
      ambiguous: false,
      resolution_scope: null,
      content_address: null,
      sha256: null,
      bank_relative_path: null,
      matched_paths: []
    };
  }
  const minimumRank = Math.min(...Array.from(ranked.values()).map((candidate) => candidate.rank));
  const candidates = Array.from(ranked.values())
    .filter((candidate) => candidate.rank === minimumRank)
    .sort((a, b) => compareStableText(a.asset.bank_relative_path, b.asset.bank_relative_path));
  const hashGroups = new Map();
  candidates.forEach((candidate) => {
    const digest = ensureAssetHash(candidate.asset);
    if (!hashGroups.has(digest)) hashGroups.set(digest, []);
    hashGroups.get(digest).push(candidate);
  });
  if (hashGroups.size !== 1) {
    return {
      kind: ref.kind,
      command: ref.command,
      path: ref.path,
      resolved: false,
      ambiguous: true,
      resolution_scope: candidates[0].scope,
      content_address: null,
      sha256: null,
      bank_relative_path: null,
      matched_paths: candidates.map((candidate) => candidate.asset.bank_relative_path)
    };
  }
  const digest = Array.from(hashGroups.keys())[0];
  const matches = hashGroups.get(digest);
  const selected = matches[0];
  return {
    kind: ref.kind,
    command: ref.command,
    path: ref.path,
    resolved: true,
    ambiguous: false,
    resolution_scope: selected.scope,
    content_address: 'sha256:' + digest,
    sha256: digest,
    bank_relative_path: selected.asset.bank_relative_path,
    matched_paths: matches.map((candidate) => candidate.asset.bank_relative_path)
  };
}

function classifySupplementalQuestion(question, taxonomyEntry, resolvedAssets) {
  const reasons = [];
  if (!question.question_id || !question.id_info) reasons.push('missing_or_invalid_id');
  else {
    if (!question.difficulty) reasons.push('invalid_difficulty');
    if (!taxonomyEntry) reasons.push('unmapped_id');
  }
  if (!['multiple_choice', 'true_false', 'short_answer'].includes(question.type)) {
    reasons.push('unsupported_question_type');
  }
  const answer = validateAnswer(question);
  answer.reasons.forEach((reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  });
  if (resolvedAssets.some((asset) => asset.ambiguous)) reasons.push('ambiguous_external_asset');
  if (resolvedAssets.some((asset) => !asset.resolved && !asset.ambiguous)) reasons.push('unresolved_external_asset');
  return { status: reasons.length ? 'quarantine' : 'active', reasons, answer_integrity: answer.valid };
}

function canonicalSha256(question) {
  return sha256Text(QuestionBank.normalizeQuestionForDedupe(question.canonical_tex));
}

function buildSupplementalQuestionBankManifest(options = {}) {
  const bankRoot = path.resolve(options.bankRoot || path.join(__dirname, '..', 'NganHang'));
  const archivePath = path.resolve(options.archive || DEFAULT_ARCHIVE);
  if (!fs.existsSync(archivePath)) throw new Error('Không tìm thấy tệp ngân hàng gốc: ' + archivePath);
  const sources = supplementalSourceDescriptors(options.sourceDirectories, bankRoot);
  const taxonomy = options.taxonomy || (() => {
    const entries = listArchiveEntries(archivePath, options);
    return readTaxonomy(archivePath, entries, options);
  })();
  const primaryResult = options.primaryResult || buildQuestionBankImport({ archive: archivePath, tar: options.tar });
  const primaryBySha256 = new Map();
  primaryResult.records.forEach((record) => {
    const digest = sha256Text(QuestionBank.normalizeQuestionForDedupe(record.question.canonical_tex));
    primaryBySha256.set(digest, {
      uid: record.uid,
      canonical_hash: record.canonical_hash,
      status: record.status
    });
  });

  const assetIndex = buildSupplementalAssetIndex(sources, bankRoot);
  const documents = [];
  const importDocumentWork = [];
  const excludedDocuments = [];
  const groups = new Map();
  const resolvedAssetCatalog = new Map();
  const sourceStats = new Map(sources.map((source) => [source.source_id, {
    source_id: source.source_id,
    label: source.label,
    directory: source.bank_relative_path,
    read_mode: 'filesystem-read-only',
    tex_files: 0,
    question_documents: 0,
    mock_exam_documents: 0,
    topic_pack_documents: 0,
    excluded_tex_files: 0,
    occurrences: 0,
    unique_questions: 0,
    primary_overlap: 0,
    net_new_questions: 0,
    question_types: { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 },
    unique_question_types: { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 },
    tex_manifest_sha256: null
  }]));
  let totalBlocks = 0;
  let parsedOccurrences = 0;
  let parserFailures = 0;
  let activeOccurrences = 0;
  let quarantineOccurrences = 0;
  let assetReferenceCount = 0;
  let resolvedAssetReferences = 0;
  let unresolvedAssetReferences = 0;
  let ambiguousAssetReferences = 0;
  let crossSourceAssetReferences = 0;

  for (const source of sources) {
    const stats = sourceStats.get(source.source_id);
    const texFiles = assetIndex.files
      .filter((file) => file.source_id === source.source_id && /\.tex$/i.test(file.absolute_path))
      .sort((a, b) => compareStableText(a.source_relative_path, b.source_relative_path));
    stats.tex_files = texFiles.length;
    const sourceDigests = [];
    texFiles.forEach((file, fileIndex) => {
      const tex = fs.readFileSync(file.absolute_path, 'utf8').replace(/^\uFEFF/, '');
      sourceDigests.push(file.source_relative_path + '\0' + sha256Text(tex));
      const located = QuestionBank.findQuestionBlocks(tex);
      const metadata = inferSupplementalDocumentMetadata(source, file.absolute_path, tex, located);
      metadata.source_order = fileIndex + 1;
      if (metadata.route_status === 'excluded') {
        stats.excluded_tex_files += 1;
        excludedDocuments.push({
          document_id: metadata.document_id,
          source_id: metadata.source_id,
          source_relative_path: metadata.source_relative_path,
          bank_relative_path: metadata.bank_relative_path,
          exclusion_reason: metadata.exclusion_reason,
          source_order: metadata.source_order
        });
        return;
      }

      stats.question_documents += 1;
      stats[metadata.source_kind === 'mock_exam' ? 'mock_exam_documents' : 'topic_pack_documents'] += 1;
      const document = {
        ...metadata,
        status: 'active',
        reasons: [],
        active_item_count: 0,
        quarantine_item_count: 0,
        question_types: { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 },
        grade_counts: {},
        items: []
      };
      const importItemRefs = [];
      const parsedForDocument = [];
      totalBlocks += located.blocks.length;
      located.blocks.forEach((block, index) => {
        const rawTex = block.raw_tex;
        const question = QuestionBank.parseQuestionBlock(rawTex, {
          sourcePath: metadata.bank_relative_path,
          index
        });
        if (!question) {
          parserFailures += 1;
          quarantineOccurrences += 1;
          document.quarantine_item_count += 1;
          document.items.push({
            order: index + 1,
            occurrence_id: 'supp-occ-unparsed-' + QuestionBank.hashText(metadata.document_id + '/' + (index + 1)),
            system_uid: null,
            canonical_sha256: null,
            canonical_hash: null,
            question_id: null,
            taxonomy_key: null,
            question_type: null,
            status: 'quarantine',
            reasons: ['parser_failure'],
            provenance: { metadata_tags: extractBracketMetadata(rawTex), source_tags: [] },
            assets: []
          });
          return;
        }
        parsedOccurrences += 1;
        parsedForDocument.push(question);
        stats.occurrences += 1;
        stats.question_types[question.type] = (stats.question_types[question.type] || 0) + 1;
        document.question_types[question.type] = (document.question_types[question.type] || 0) + 1;
        if (question.grade != null) {
          const gradeKey = String(question.grade);
          document.grade_counts[gradeKey] = (document.grade_counts[gradeKey] || 0) + 1;
        }
        const taxonomyEntry = taxonomyForQuestion(question, taxonomy);
        const resolvedAssets = question.asset_refs.map((ref) =>
          resolveSupplementalAssetReference(ref, file.absolute_path, source, assetIndex)
        );
        assetReferenceCount += resolvedAssets.length;
        resolvedAssets.forEach((asset) => {
          if (asset.resolved) {
            resolvedAssetReferences += 1;
            if (/^cross_source_/.test(asset.resolution_scope || '')) crossSourceAssetReferences += 1;
            if (!resolvedAssetCatalog.has(asset.sha256)) {
              const selectedAsset = asset.matched_paths.length
                ? assetIndex.files.find((candidate) => candidate.bank_relative_path === asset.matched_paths[0])
                : null;
              resolvedAssetCatalog.set(asset.sha256, {
                content_address: asset.content_address,
                sha256: asset.sha256,
                size_bytes: selectedAsset ? selectedAsset.size_bytes : null,
                paths: asset.matched_paths.slice()
              });
            } else {
              const catalogItem = resolvedAssetCatalog.get(asset.sha256);
              asset.matched_paths.forEach((matchedPath) => {
                if (!catalogItem.paths.includes(matchedPath)) catalogItem.paths.push(matchedPath);
              });
            }
          } else if (asset.ambiguous) ambiguousAssetReferences += 1;
          else unresolvedAssetReferences += 1;
        });
        const classification = classifySupplementalQuestion(question, taxonomyEntry, resolvedAssets);
        if (classification.status === 'active') {
          activeOccurrences += 1;
          document.active_item_count += 1;
        } else {
          quarantineOccurrences += 1;
          document.quarantine_item_count += 1;
        }
        const digest = canonicalSha256(question);
        const systemUid = 'qbs-' + digest;
        const metadataTags = extractBracketMetadata(rawTex);
        const sourceTags = metadataTags.filter((tag) => tag !== question.question_id);
        const occurrence = {
          occurrence_id: 'supp-occ-' + QuestionBank.hashText(metadata.document_id + '/' + (index + 1) + '/' + question.source_hash),
          document_id: metadata.document_id,
          source_id: metadata.source_id,
          source_root: metadata.source_root,
          source_relative_path: metadata.source_relative_path,
          bank_relative_path: metadata.bank_relative_path,
          source_kind: metadata.source_kind,
          order: index + 1,
          source_hash: question.source_hash,
          system_uid: systemUid,
          canonical_sha256: digest,
          canonical_hash: question.canonical_hash,
          question_id: question.question_id,
          taxonomy_key: taxonomyEntry ? taxonomyEntry.key : taxonomyKeyForQuestion(question),
          status: classification.status,
          reasons: classification.reasons,
          answer_integrity: classification.answer_integrity,
          provenance: { metadata_tags: metadataTags, source_tags: sourceTags },
          assets: resolvedAssets
        };
        let group = groups.get(digest);
        if (!group) {
          group = {
            system_uid: systemUid,
            canonical_sha256: digest,
            canonical_hash: question.canonical_hash,
            candidates: [],
            occurrences: []
          };
          groups.set(digest, group);
        }
        group.candidates.push({
          status: classification.status,
          reasons: classification.reasons,
          question,
          taxonomy: taxonomyEntry,
          occurrence
        });
        group.occurrences.push(occurrence);
        importItemRefs.push({ question, occurrence, classification, digest });
        document.items.push({
          order: occurrence.order,
          occurrence_id: occurrence.occurrence_id,
          system_uid: systemUid,
          canonical_sha256: digest,
          canonical_hash: question.canonical_hash,
          question_id: question.question_id,
          taxonomy_key: occurrence.taxonomy_key,
          similarity_key: question.similarity_key,
          question_type: question.type,
          difficulty: question.difficulty,
          status: classification.status,
          reasons: classification.reasons,
          provenance: occurrence.provenance,
          assets: resolvedAssets
        });
      });

      if (metadata.source_kind === 'mock_exam') {
        if (metadata.item_count !== metadata.expected_question_count) {
          document.reasons.push('mock_exam_question_count_mismatch');
        }
        const expected = metadata.expected_type_counts;
        if (Object.keys(expected).some((type) => Number(document.question_types[type] || 0) !== expected[type])) {
          document.reasons.push('mock_exam_type_distribution_mismatch');
        }
      }
      if (metadata.parse_errors.length) document.reasons.push('tex_structure_error');
      if (document.quarantine_item_count) document.reasons.push('quarantined_items_present');
      document.reasons = Array.from(new Set(document.reasons));
      if (document.reasons.length) document.status = 'quarantine';
      documents.push(document);
      importDocumentWork.push({ metadata, raw_tex: tex, item_refs: importItemRefs });
    });
    stats.tex_manifest_sha256 = sha256Text(sourceDigests.join('\n'));
  }

  const canonicalQuestions = [];
  const uniqueTypeCounts = { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 };
  const quarantineReasonCounts = Object.create(null);
  let activeQuestions = 0;
  let quarantineQuestions = 0;
  let primaryOverlap = 0;
  let duplicateGroups = 0;
  groups.forEach((group) => {
    const representative = group.candidates.slice().sort((a, b) => candidateRank(a) - candidateRank(b))[0];
    const anyActive = group.candidates.some((candidate) => candidate.status === 'active');
    const reasons = anyActive ? [] : representative.reasons.slice();
    const primary = primaryBySha256.get(group.canonical_sha256) || null;
    if (primary) primaryOverlap += 1;
    if (group.occurrences.length > 1) duplicateGroups += 1;
    if (anyActive) activeQuestions += 1;
    else {
      quarantineQuestions += 1;
      reasons.forEach((reason) => {
        quarantineReasonCounts[reason] = (quarantineReasonCounts[reason] || 0) + 1;
      });
    }
    uniqueTypeCounts[representative.question.type] = (uniqueTypeCounts[representative.question.type] || 0) + 1;
    canonicalQuestions.push({
      system_uid: group.system_uid,
      canonical_sha256: group.canonical_sha256,
      canonical_hash: group.canonical_hash,
      legacy_uid: representative.question.uid,
      status: anyActive ? 'active' : 'quarantine',
      reasons,
      question_id: representative.question.question_id,
      taxonomy_key: representative.taxonomy ? representative.taxonomy.key : taxonomyKeyForQuestion(representative.question),
      similarity_key: representative.question.similarity_key,
      skill_family: representative.question.skill_family,
      question_type: representative.question.type,
      grade: representative.question.grade,
      difficulty: representative.question.difficulty,
      answer_integrity: validateAnswer(representative.question).valid,
      has_solution: Boolean(String(representative.question.solution_tex || '').trim()),
      existing_in_primary_bank: Boolean(primary),
      primary_record: primary,
      dedupe_status: primary
        ? 'existing_primary'
        : (group.occurrences.length > 1 ? 'duplicate_supplemental' : 'new'),
      occurrence_count: group.occurrences.length,
      occurrence_refs: group.occurrences.map((occurrence) => ({
        occurrence_id: occurrence.occurrence_id,
        document_id: occurrence.document_id,
        source_id: occurrence.source_id,
        order: occurrence.order
      }))
    });
  });
  canonicalQuestions.sort((a, b) => compareStableText(a.canonical_sha256, b.canonical_sha256));

  const sourceUniqueGroups = new Map(sources.map((source) => [source.source_id, new Map()]));
  groups.forEach((group) => {
    const representative = group.candidates.slice().sort((a, b) => candidateRank(a) - candidateRank(b))[0];
    const sourceIds = new Set(group.occurrences.map((occurrence) => occurrence.source_id));
    sourceIds.forEach((sourceId) => sourceUniqueGroups.get(sourceId).set(group.canonical_sha256, {
      type: representative.question.type,
      primary: primaryBySha256.has(group.canonical_sha256)
    }));
  });
  sourceUniqueGroups.forEach((groupMap, sourceId) => {
    const stats = sourceStats.get(sourceId);
    stats.unique_questions = groupMap.size;
    groupMap.forEach((item) => {
      stats.unique_question_types[item.type] = (stats.unique_question_types[item.type] || 0) + 1;
      if (item.primary) stats.primary_overlap += 1;
      else stats.net_new_questions += 1;
    });
  });

  const occurrenceTypeCounts = { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 };
  sourceStats.forEach((stats) => addCounts(occurrenceTypeCounts, stats.question_types));
  const occurrenceReasonCounts = Object.create(null);
  groups.forEach((group) => group.occurrences.forEach((occurrence) => {
    if (occurrence.status !== 'quarantine') return;
    occurrence.reasons.forEach((reason) => {
      occurrenceReasonCounts[reason] = (occurrenceReasonCounts[reason] || 0) + 1;
    });
  }));
  const sortedReasonCounts = (counts) => Object.keys(counts).sort().reduce((result, key) => {
    result[key] = counts[key];
    return result;
  }, {});
  const sourceList = Array.from(sourceStats.values()).sort((a, b) => compareStableText(a.directory, b.directory));
  const assetCatalog = Array.from(resolvedAssetCatalog.values())
    .map((asset) => ({ ...asset, paths: asset.paths.slice().sort(compareStableText) }))
    .sort((a, b) => compareStableText(a.sha256, b.sha256));
  const primaryStat = fs.statSync(archivePath);
  const primarySha256 = sha256File(archivePath);
  const sourceFingerprint = sha256Text([
    ...sourceList.map((source) => source.source_id + '\0' + source.tex_manifest_sha256),
    ...assetCatalog.map((asset) => 'asset\0' + asset.sha256 + '\0' + asset.paths.join('|'))
  ].join('\n'));
  const stats = {
    source_directories: sources.length,
    tex_files: sourceList.reduce((sum, source) => sum + source.tex_files, 0),
    question_documents: documents.length,
    mock_exam_documents: documents.filter((document) => document.source_kind === 'mock_exam').length,
    topic_pack_documents: documents.filter((document) => document.source_kind === 'topic_pack').length,
    excluded_tex_files: excludedDocuments.length,
    total_blocks: totalBlocks,
    parsed_occurrences: parsedOccurrences,
    parser_failures: parserFailures,
    unique_questions: canonicalQuestions.length,
    duplicate_occurrences: totalBlocks - canonicalQuestions.length,
    duplicate_groups: duplicateGroups,
    primary_overlap_questions: primaryOverlap,
    net_new_questions: canonicalQuestions.length - primaryOverlap,
    active_occurrences: activeOccurrences,
    quarantine_occurrences: quarantineOccurrences,
    active_questions: activeQuestions,
    quarantine_questions: quarantineQuestions,
    question_types: occurrenceTypeCounts,
    unique_question_types: uniqueTypeCounts,
    quarantine_reasons: sortedReasonCounts(quarantineReasonCounts),
    occurrence_quarantine_reasons: sortedReasonCounts(occurrenceReasonCounts),
    asset_references: assetReferenceCount,
    resolved_asset_references: resolvedAssetReferences,
    unresolved_asset_references: unresolvedAssetReferences,
    ambiguous_asset_references: ambiguousAssetReferences,
    cross_source_asset_references: crossSourceAssetReferences,
    content_addressed_assets: assetCatalog.length
  };
  const manifest = {
    schema_version: SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION,
    manifest_id: 'qbm-' + sha256Text(primarySha256 + '\0' + sourceFingerprint),
    mode: 'manifest-only',
    write_policy: 'no-production-import',
    source: {
      bank_root: 'NganHang',
      read_mode: 'filesystem-read-only',
      source_fingerprint_sha256: sourceFingerprint,
      directories: sourceList
    },
    primary_bank: {
      archive: normalizeArchivePath(path.relative(path.join(__dirname, '..'), archivePath)),
      size_bytes: primaryStat.size,
      sha256: primarySha256,
      unique_questions: primaryResult.records.length
    },
    taxonomy: {
      id_map: taxonomy.idMapPath,
      idvn_map: taxonomy.idvnMapPath,
      count: taxonomy.keys.length
    },
    conventions: {
      classification_id: '<grade><area><chapter><difficulty><skill>-<variant>',
      system_uid: 'qbs-<sha256(canonical question)>',
      source_occurrence: 'document_id + source order',
      dedupe: 'exact canonical SHA-256 across primary archive and every supplemental source',
      source_order: 'stable path order, then original question order inside each TeX document',
      asset_resolution: 'document-relative, source-relative, then content-addressed cross-source lookup',
      quarantine: 'missing/malformed/unmapped ID, answer anomaly, unsupported essay, parser or asset anomaly'
    },
    stats,
    excluded_documents: excludedDocuments.sort((a, b) => compareStableText(a.bank_relative_path, b.bank_relative_path)),
    documents: documents.sort((a, b) => compareStableText(a.bank_relative_path, b.bank_relative_path)),
    mock_exams: documents.filter((document) => document.source_kind === 'mock_exam').map((document) => ({
      document_id: document.document_id,
      source_id: document.source_id,
      title: document.title,
      bank_relative_path: document.bank_relative_path,
      item_count: document.item_count,
      question_types: document.question_types,
      status: document.status,
      reasons: document.reasons
    })),
    assets: assetCatalog,
    canonical_questions: canonicalQuestions
  };
  const importPackages = options.includeImportPackages ? importDocumentWork.map((work) => ({
    document: documentPackagePayload(work.metadata, work.raw_tex, {
      parser_errors: work.metadata.parse_errors || [],
      question_count: work.item_refs.length,
      source_profile: 'supplemental_tex_corpus'
    }),
    items: work.item_refs.map((ref) => {
      const group = groups.get(ref.digest);
      const primary = primaryBySha256.get(ref.digest);
      const globallyActive = Boolean(
        primary && primary.status === 'active' ||
        group && group.candidates.some((candidate) => candidate.status === 'active')
      );
      return questionImportPayload(
        ref.question,
        ref.occurrence,
        globallyActive ? 'active' : ref.classification.status,
        globallyActive ? [] : ref.classification.reasons
      );
    })
  })) : null;
  return { schema_version: SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION, manifest, stats, importPackages };
}

function buildQuestionBankImport(options = {}) {
  const archivePath = path.resolve(options.archive || DEFAULT_ARCHIVE);
  if (!fs.existsSync(archivePath)) throw new Error('Không tìm thấy tệp ngân hàng: ' + archivePath);
  const entries = listArchiveEntries(archivePath, options);
  const entryLookup = new Map(entries.map((entry) => [entry.toLowerCase(), entry]));
  const taxonomy = readTaxonomy(archivePath, entries, options);
  const archiveMechanisms = readArchiveMechanisms(archivePath, entries, taxonomy, options);
  const documentEntries = entries.filter((entry) => ROUTED_DOCUMENT_PATTERN.test(entry)).sort();
  if (!documentEntries.length) throw new Error('Không tìm thấy tài liệu DuLieuNganHang để nhập.');

  const documents = [];
  const cleanDocuments = [];
  const groups = new Map();
  let totalRemovedMacros = 0;
  let totalBlocks = 0;
  let activeOccurrences = 0;
  let quarantineOccurrences = 0;

  for (const entry of documentEntries) {
    const source = readArchiveEntry(archivePath, entry, options);
    const declaredMacros = collectDeclaredMacros(source);
    const located = QuestionBank.findQuestionBlocks(source);
    const metadata = inferDocumentMetadata(entry);
    const document = { ...metadata, item_count: located.blocks.length, parse_errors: located.errors, items: [] };
    const cleanBlocks = [];
    totalBlocks += located.blocks.length;

    located.blocks.forEach((block, index) => {
      const rawTex = block.raw_tex;
      const sanitized = sanitizeObfuscatedTex(rawTex, declaredMacros);
      totalRemovedMacros += sanitized.removed_count;
      const question = QuestionBank.parseQuestionBlock(sanitized.tex, { sourcePath: entry, index });
      if (!question) {
        const fallbackHash = QuestionBank.hashText(rawTex);
        document.items.push({
          order: index + 1,
          uid: 'qb-unparsed-' + fallbackHash,
          canonical_hash: null,
          question_id: null,
          taxonomy_key: null,
          status: 'quarantine',
          reasons: ['parser_failure']
        });
        quarantineOccurrences += 1;
        cleanBlocks.push(rawTex);
        return;
      }
      question.source_hash = QuestionBank.hashText(rawTex);
      question.raw_tex = rawTex;
      cleanBlocks.push(question.canonical_tex);
      const taxonomyEntry = taxonomyForQuestion(question, taxonomy);
      const resolvedAssets = question.asset_refs.map((ref) => resolveAssetReference(ref, entry, entryLookup));
      const classification = classifyQuestion(question, metadata, taxonomyEntry, resolvedAssets);
      if (classification.status === 'active') activeOccurrences += 1;
      else quarantineOccurrences += 1;

      const occurrence = {
        document_id: metadata.document_id,
        archive_path: entry,
        source_kind: metadata.source_kind,
        source_label: metadata.source_label,
        source_batch: metadata.batch_number == null ? null : { kind: metadata.batch_kind, number: metadata.batch_number },
        order: index + 1,
        source_hash: question.source_hash,
        question_id: question.question_id,
        taxonomy_key: taxonomyEntry ? taxonomyEntry.key : taxonomyKeyForQuestion(question),
        status: classification.status,
        reasons: classification.reasons,
        answer_integrity: classification.answer_integrity,
        assets: resolvedAssets,
        macro_cleanup: {
          removed_count: sanitized.removed_count,
          removed_macros: sanitized.removed_macros
        },
        raw_tex: rawTex
      };
      const candidate = {
        status: classification.status,
        reasons: classification.reasons,
        question,
        taxonomy: taxonomyEntry,
        occurrence
      };
      let group = groups.get(question.canonical_hash);
      if (!group) {
        group = { canonical_hash: question.canonical_hash, uid: question.uid, candidates: [], occurrences: [] };
        groups.set(question.canonical_hash, group);
      }
      group.candidates.push(candidate);
      group.occurrences.push(occurrence);
      document.items.push({
        order: index + 1,
        uid: question.uid,
        canonical_hash: question.canonical_hash,
        question_id: question.question_id,
        taxonomy_key: occurrence.taxonomy_key,
        similarity_key: question.similarity_key,
        question_type: question.type,
        difficulty: question.difficulty,
        status: classification.status,
        reasons: classification.reasons
      });
    });
    documents.push(document);
    cleanDocuments.push({
      document_id: metadata.document_id,
      archive_path: entry,
      grade: metadata.grade,
      file_name: metadata.file_name,
      item_count: cleanBlocks.length,
      canonical_blocks: cleanBlocks
    });
  }

  const records = [];
  for (const group of groups.values()) {
    const representative = group.candidates.slice().sort((a, b) => candidateRank(a) - candidateRank(b))[0];
    const anyActive = group.candidates.some((candidate) => candidate.status === 'active');
    const reasons = anyActive ? [] : representative.reasons.slice();
    records.push({
      schema_version: SCHEMA_VERSION,
      record_type: 'question',
      uid: group.uid,
      canonical_hash: group.canonical_hash,
      status: anyActive ? 'active' : 'quarantine',
      reasons,
      taxonomy: representative.taxonomy,
      question: questionPayload(representative.question),
      occurrences: group.occurrences
    });
  }

  const activeRecords = records.filter((record) => record.status === 'active').length;
  const quarantineRecords = records.length - activeRecords;
  const quarantineReasonCounts = Object.create(null);
  records.filter((record) => record.status === 'quarantine').forEach((record) => {
    record.reasons.forEach((reason) => {
      quarantineReasonCounts[reason] = (quarantineReasonCounts[reason] || 0) + 1;
    });
  });
  const reasonCounts = Object.keys(quarantineReasonCounts).sort().reduce((result, key) => {
    result[key] = quarantineReasonCounts[key];
    return result;
  }, {});
  const stat = fs.statSync(archivePath);
  const stats = {
    documents: documents.length,
    taxonomy_entries: taxonomy.keys.length,
    total_blocks: totalBlocks,
    unique_questions: records.length,
    duplicate_occurrences: totalBlocks - records.length,
    active_occurrences: activeOccurrences,
    quarantine_occurrences: quarantineOccurrences,
    active_questions: activeRecords,
    quarantine_questions: quarantineRecords,
    removed_noise_macros: totalRemovedMacros,
    quarantine_reasons: reasonCounts
  };
  const archiveLabel = normalizeArchivePath(options.archiveLabel || path.relative(path.join(__dirname, '..'), archivePath));
  const manifest = {
    schema_version: SCHEMA_VERSION,
    source: {
      archive: archiveLabel,
      size_bytes: stat.size,
      sha256: sha256File(archivePath),
      read_mode: 'tar-stream-only',
      archive_root: taxonomy.root
    },
    taxonomy: {
      id_map: taxonomy.idMapPath,
      idvn_map: taxonomy.idvnMapPath,
      count: taxonomy.keys.length,
      catalog: taxonomy.catalog
    },
    conventions: archiveMechanisms.id_convention,
    archive_profile: {
      saved_generator_state: archiveMechanisms.saved_generator_state,
      source_document_candidates: archiveMechanisms.source_document_candidates
    },
    stats,
    documents
  };
  return { schema_version: SCHEMA_VERSION, archivePath, records, manifest, stats, cleanDocuments };
}

function buildPrimaryAdminPackages(result) {
  const recordByHash = new Map(result.records.map((record) => [record.canonical_hash, record]));
  const cleanByDocument = new Map(result.cleanDocuments.map((document) => [document.document_id, document]));
  return result.manifest.documents.map((metadata) => {
    const clean = cleanByDocument.get(metadata.document_id);
    const rawTex = clean ? clean.canonical_blocks.join('\n\n') + '\n' : '';
    const items = metadata.items.map((item) => {
      const record = recordByHash.get(item.canonical_hash);
      if (!record) return null;
      const occurrence = record.occurrences.find((candidate) =>
        candidate.document_id === metadata.document_id && Number(candidate.order) === Number(item.order)
      ) || record.occurrences[0];
      return questionImportPayload(record.question, occurrence, record.status, record.reasons);
    }).filter(Boolean);
    return {
      document: documentPackagePayload(metadata, rawTex, {
        parser_errors: metadata.parse_errors || [],
        question_count: items.length,
        source_profile: 'primary_topic_bank'
      }),
      items
    };
  });
}

function buildArchiveSourceAdminPackages(options = {}) {
  const archivePath = path.resolve(options.archive || DEFAULT_ARCHIVE);
  const entries = options.entries || listArchiveEntries(archivePath, options);
  const entryLookup = new Map(entries.map((entry) => [entry.toLowerCase(), entry]));
  const taxonomy = options.taxonomy || readTaxonomy(archivePath, entries, options);
  const primaryResult = options.primaryResult || buildQuestionBankImport({ archive: archivePath, tar: options.tar });
  const primaryBySha256 = new Map(primaryResult.records.map((record) => [
    sha256Text(QuestionBank.normalizeQuestionForDedupe(record.question.canonical_tex)),
    record
  ]));
  const work = [];
  const groups = new Map();
  const sourceEntries = entries
    .filter((entry) => SOURCE_DOCUMENT_PATTERN.test(entry) && !SOURCE_SUPPORT_PATTERN.test(entry))
    .sort(compareStableText);

  sourceEntries.forEach((entry) => {
    const rawTex = readArchiveEntry(archivePath, entry, options);
    const declaredMacros = collectDeclaredMacros(rawTex);
    const located = QuestionBank.findQuestionBlocks(rawTex);
    const metadata = {
      ...inferSourceDocumentMetadata(entry, rawTex),
      source_label: 'Nguồn đề gốc NganHangTHPT1.3',
      source_root: 'NganHangTHPT1.3'
    };
    const refs = [];
    located.blocks.forEach((block, index) => {
      const sanitized = sanitizeObfuscatedTex(block.raw_tex, declaredMacros);
      const question = QuestionBank.parseQuestionBlock(sanitized.tex, { sourcePath: entry, index });
      if (!question) return;
      question.source_hash = QuestionBank.hashText(block.raw_tex);
      question.raw_tex = block.raw_tex;
      const taxonomyEntry = taxonomyForQuestion(question, taxonomy);
      const assets = question.asset_refs.map((ref) => resolveAssetReference(ref, entry, entryLookup));
      const classification = classifySupplementalQuestion(question, taxonomyEntry, assets);
      const digest = canonicalSha256(question);
      const occurrence = {
        occurrence_id: 'archive-source-occ-' + QuestionBank.hashText(metadata.document_id + '/' + (index + 1)),
        document_id: metadata.document_id,
        archive_path: entry,
        source_kind: metadata.source_kind,
        order: index + 1,
        source_hash: question.source_hash,
        question_id: question.question_id,
        taxonomy_key: taxonomyEntry ? taxonomyEntry.key : taxonomyKeyForQuestion(question),
        status: classification.status,
        reasons: classification.reasons,
        answer_integrity: classification.answer_integrity,
        assets,
        raw_tex: block.raw_tex
      };
      refs.push({ question, occurrence, classification, digest });
      if (!groups.has(digest)) groups.set(digest, []);
      groups.get(digest).push({ classification });
    });
    work.push({ metadata, raw_tex: rawTex, refs });
  });

  const packages = work.map((source) => ({
    document: documentPackagePayload(source.metadata, source.raw_tex, {
      parser_errors: [],
      question_count: source.refs.length,
      source_profile: 'archive_source_documents'
    }),
    items: source.refs.map((ref) => {
      const primary = primaryBySha256.get(ref.digest);
      const globallyActive = Boolean(
        primary && primary.status === 'active' ||
        groups.get(ref.digest).some((candidate) => candidate.classification.status === 'active')
      );
      return questionImportPayload(
        ref.question,
        ref.occurrence,
        globallyActive ? 'active' : ref.classification.status,
        globallyActive ? [] : ref.classification.reasons
      );
    })
  }));
  return {
    packages,
    stats: {
      documents: packages.length,
      mock_exam_documents: packages.filter((item) => item.document.source_kind === 'mock_exam').length,
      topic_pack_documents: packages.filter((item) => item.document.source_kind === 'topic_pack').length,
      occurrences: packages.reduce((sum, item) => sum + item.items.length, 0),
      unique_questions: groups.size,
      primary_overlap_questions: Array.from(groups.keys()).filter((digest) => primaryBySha256.has(digest)).length
    }
  };
}

function selectChunk(records, chunk, size) {
  if (chunk == null && size == null) return { records, chunk: null };
  const normalizedSize = Number(size);
  const normalizedChunk = chunk == null ? 1 : Number(chunk);
  if (!Number.isInteger(normalizedSize) || normalizedSize <= 0) throw new Error('--size phải là số nguyên dương.');
  if (!Number.isInteger(normalizedChunk) || normalizedChunk <= 0) throw new Error('--chunk bắt đầu từ 1.');
  const start = (normalizedChunk - 1) * normalizedSize;
  return {
    records: records.slice(start, start + normalizedSize),
    chunk: {
      number: normalizedChunk,
      size: normalizedSize,
      start_index: start,
      end_index_exclusive: Math.min(start + normalizedSize, records.length),
      total_chunks: Math.ceil(records.length / normalizedSize),
      total_records: records.length
    }
  };
}

function resolveOutputPaths(outputPath) {
  const resolved = path.resolve(outputPath);
  const directoryMode = /[\\\/]$/.test(outputPath) || (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory());
  if (directoryMode) {
    return {
      jsonl: path.join(resolved, 'question-bank.jsonl'),
      manifest: path.join(resolved, 'manifest.json')
    };
  }
  if (/\.jsonl$/i.test(resolved)) {
    return { jsonl: resolved, manifest: resolved.replace(/\.jsonl$/i, '.manifest.json') };
  }
  return { jsonl: resolved + '.jsonl', manifest: resolved + '.manifest.json' };
}

function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

function assertOutsideSourceBank(targetPath) {
  const bankRoot = path.resolve(__dirname, '..', 'NganHang');
  const target = path.resolve(targetPath);
  const relative = path.relative(bankRoot, target);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) {
    throw new Error('Không được ghi đầu ra vào thư mục NganHang nguồn.');
  }
}

function serializeJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

function writeImportArtifacts(result, outputPath, chunk, size) {
  const output = resolveOutputPaths(outputPath);
  assertOutsideSourceBank(output.jsonl);
  assertOutsideSourceBank(output.manifest);
  const selected = selectChunk(result.records, chunk, size);
  const manifest = {
    ...result.manifest,
    output: {
      jsonl_file: path.basename(output.jsonl),
      manifest_file: path.basename(output.manifest),
      records_written: selected.records.length,
      chunk: selected.chunk
    }
  };
  writeAtomic(output.jsonl, serializeJsonl(selected.records));
  writeAtomic(output.manifest, JSON.stringify(manifest, null, 2) + '\n');
  return { ...output, records_written: selected.records.length, chunk: selected.chunk, manifest };
}

function buildAdminPackageRecords(packages, taxonomyCatalog, options = {}) {
  const itemChunkSize = Number(options.itemChunkSize || 180);
  if (!Number.isInteger(itemChunkSize) || itemChunkSize < 1 || itemChunkSize > 250) {
    throw new Error('Kích thước lô admin phải từ 1 đến 250 câu.');
  }
  const records = [];
  const taxonomy = Array.isArray(taxonomyCatalog) ? taxonomyCatalog : [];
  for (let offset = 0; offset < taxonomy.length; offset += 500) {
    records.push({
      schema_version: ADMIN_PACKAGE_SCHEMA_VERSION,
      record_type: 'taxonomy',
      entries: taxonomy.slice(offset, offset + 500),
      taxonomy_offset: offset,
      taxonomy_total: taxonomy.length
    });
  }
  (packages || []).forEach((pkg) => {
    if (!pkg || !pkg.document || !Array.isArray(pkg.items) || !pkg.items.length) return;
    const chunks = Math.ceil(pkg.items.length / itemChunkSize);
    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
      const offset = chunkIndex * itemChunkSize;
      records.push({
        schema_version: ADMIN_PACKAGE_SCHEMA_VERSION,
        record_type: 'document_chunk',
        client_document_key: pkg.document.client_document_key,
        document: chunkIndex === 0
          ? {
              ...pkg.document,
              metadata: {
                ...(pkg.document.metadata || {}),
                import_state: chunks === 1 ? 'complete' : 'staged',
                expected_count: pkg.items.length
              }
            }
          : {
              client_document_key: pkg.document.client_document_key,
              content_hash: pkg.document.content_hash,
              raw_tex: '',
              metadata: {
                import_state: chunkIndex + 1 === chunks ? 'complete' : 'staged',
                expected_count: pkg.items.length
              }
            },
        items: pkg.items.slice(offset, offset + itemChunkSize),
        item_offset: offset,
        document_total_items: pkg.items.length,
        document_chunk: chunkIndex + 1,
        document_chunks: chunks
      });
    }
  });
  const importRecords = records.filter((record) => record.record_type === 'document_chunk');
  const totalItems = (packages || []).reduce((sum, pkg) => sum + (pkg.items || []).length, 0);
  records.forEach((record, index) => {
    record.package_record = index + 1;
    record.package_records = records.length;
    record.package_total_items = totalItems;
  });
  return {
    records,
    stats: {
      taxonomy_entries: taxonomy.length,
      documents: (packages || []).filter((pkg) => pkg && pkg.items && pkg.items.length).length,
      document_chunks: importRecords.length,
      items: totalItems,
      package_records: records.length
    }
  };
}

function writeAdminPackageArtifacts(packages, taxonomyCatalog, outputPath, options = {}) {
  const output = resolveOutputPaths(outputPath);
  assertOutsideSourceBank(output.jsonl);
  assertOutsideSourceBank(output.manifest);
  const built = buildAdminPackageRecords(packages, taxonomyCatalog, options);
  writeAtomic(output.jsonl, serializeJsonl(built.records));
  const packageManifest = {
    schema_version: ADMIN_PACKAGE_SCHEMA_VERSION,
    mode: 'admin-local-stream-import',
    write_policy: 'outside-source-bank-only',
    payload_file: path.basename(output.jsonl),
    payload_sha256: sha256File(output.jsonl),
    stats: built.stats,
    source: options.source || null
  };
  writeAtomic(output.manifest, JSON.stringify(packageManifest, null, 2) + '\n');
  return { ...output, package_manifest: packageManifest, records_written: built.records.length };
}

function resolveSupplementalManifestPath(outputPath) {
  const resolved = path.resolve(outputPath);
  const directoryMode = /[\\\/]$/.test(outputPath) || (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory());
  if (directoryMode) return path.join(resolved, 'supplemental-question-bank.manifest.json');
  return /\.json$/i.test(resolved) ? resolved : resolved + '.json';
}

function writeSupplementalManifest(result, outputPath) {
  const target = resolveSupplementalManifestPath(outputPath);
  assertOutsideSourceBank(target);
  const manifest = result && result.manifest ? result.manifest : result;
  if (!manifest || manifest.schema_version !== SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Manifest nguồn bổ sung không hợp lệ.');
  }
  writeAtomic(target, JSON.stringify(manifest, null, 2) + '\n');
  return { manifest: target, stats: manifest.stats };
}

function writeCleanDirectory(result, cleanDirectory) {
  const root = path.resolve(cleanDirectory);
  assertOutsideSourceBank(root);
  fs.mkdirSync(root, { recursive: true });
  const files = [];
  for (const document of result.cleanDocuments) {
    const relativeSource = document.archive_path.replace(/^.*\/DuLieuNganHang\//i, '');
    const relativeOutput = normalizeArchivePath(relativeSource);
    const target = path.join(root, ...relativeOutput.split('/'));
    const header = [
      '% VinhMath Question Bank - canonical TeX',
      '% Source: ' + document.archive_path,
      '% Grade: ' + document.grade,
      '% Items: ' + document.item_count,
      ''
    ].join('\n');
    const content = header + document.canonical_blocks.join('\n\n') + '\n';
    writeAtomic(target, content);
    files.push({
      document_id: document.document_id,
      source_archive_path: document.archive_path,
      clean_path: relativeOutput,
      grade: document.grade,
      item_count: document.item_count,
      sha256: sha256Text(content)
    });
  }
  const manifestPath = path.join(root, 'clean-manifest.json');
  const manifest = {
    schema_version: SCHEMA_VERSION,
    source: result.manifest.source,
    taxonomy: result.manifest.taxonomy,
    conventions: result.manifest.conventions,
    archive_profile: result.manifest.archive_profile,
    stats: result.stats,
    clean_output: {
      format: 'canonical-ex-bt-loigiai',
      file_count: files.length,
      files
    },
    documents: result.manifest.documents
  };
  writeAtomic(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { directory: root, manifest: manifestPath, files, clean_manifest: manifest };
}

function parseArgs(argv) {
  const options = {
    archive: DEFAULT_ARCHIVE,
    output: null,
    adminPackage: null,
    cleanDir: null,
    supplementalManifest: null,
    supplementalOutput: null,
    supplementalDirs: [],
    summary: false,
    chunk: null,
    size: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--archive') options.archive = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--admin-package') options.adminPackage = argv[++i];
    else if (arg === '--clean-dir') options.cleanDir = argv[++i];
    else if (arg === '--supplemental-manifest') options.supplementalManifest = argv[++i];
    else if (arg === '--supplemental-output') options.supplementalOutput = argv[++i];
    else if (arg === '--supplemental-dir') options.supplementalDirs.push(argv[++i]);
    else if (arg === '--summary') options.summary = true;
    else if (arg === '--chunk') options.chunk = Number(argv[++i]);
    else if (arg === '--size') options.size = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error('Tùy chọn không hợp lệ: ' + arg);
  }
  return options;
}

function usage() {
  return [
    'Dùng: node scripts/build_question_bank_import.js [tùy chọn]',
    '  --archive <file.rar>   Tệp nguồn (mặc định: NganHang/NganHangTHPT1.3.rar)',
    '  --output <đường_dẫn>   Ghi JSONL và manifest',
    '  --admin-package <file> Gói JSONL để admin nhập kho, gồm ngân hàng chính và đề nguồn trong RAR',
    '  --clean-dir <thư_mục>  Ghi 21 tệp TeX sạch và clean-manifest.json',
    '  --supplemental-manifest <file>  Chỉ ghi manifest cho 3 thư mục TeX bổ sung',
    '  --supplemental-output <file>    Gói JSONL admin cho 3 thư mục TeX bổ sung',
    '  --supplemental-dir <dir>        Thay nguồn bổ sung (có thể lặp lại)',
    '  --summary              In thống kê JSON',
    '  --chunk <N> --size <M> Chỉ ghi lô N (đếm từ 1), mỗi lô M câu',
    '  --help                 Xem trợ giúp'
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage() + '\n');
    return null;
  }
  if (options.supplementalDirs.length && !options.supplementalManifest && !options.supplementalOutput) {
    throw new Error('--supplemental-dir chỉ dùng cùng --supplemental-manifest hoặc --supplemental-output.');
  }
  if (options.supplementalManifest || options.supplementalOutput) {
    if (options.output || options.adminPackage || options.cleanDir) {
      throw new Error('Chế độ nguồn bổ sung không được trộn với đầu ra ngân hàng chính.');
    }
    const supplemental = buildSupplementalQuestionBankManifest({
      archive: options.archive,
      sourceDirectories: options.supplementalDirs.length ? options.supplementalDirs : DEFAULT_SUPPLEMENTAL_DIRECTORIES,
      includeImportPackages: Boolean(options.supplementalOutput)
    });
    const writtenManifest = options.supplementalManifest
      ? writeSupplementalManifest(supplemental, options.supplementalManifest)
      : null;
    const writtenPackage = options.supplementalOutput
      ? writeAdminPackageArtifacts(
          supplemental.importPackages,
          supplemental.manifest.taxonomy && supplemental.manifest.taxonomy.catalog || readTaxonomy(
            path.resolve(options.archive),
            listArchiveEntries(path.resolve(options.archive))
          ).catalog,
          options.supplementalOutput,
          { source: supplemental.manifest.source }
        )
      : null;
    const supplementalSummary = {
      ...supplemental.stats,
      manifest: writtenManifest && writtenManifest.manifest || null,
      package: writtenPackage && writtenPackage.jsonl || null,
      mode: options.supplementalOutput ? 'admin-local-stream-import' : 'manifest-only'
    };
    if (options.summary) process.stdout.write(JSON.stringify(supplementalSummary, null, 2) + '\n');
    else if (writtenPackage) process.stdout.write('Đã tạo gói admin nguồn bổ sung: ' + writtenPackage.jsonl + '\n');
    else process.stdout.write('Đã tạo manifest nguồn bổ sung: ' + writtenManifest.manifest + '\n');
    return { supplemental, writtenManifest, writtenPackage, summary: supplementalSummary };
  }
  const result = buildQuestionBankImport({ archive: options.archive });
  let written = null;
  let adminPackage = null;
  let clean = null;
  if (options.output) written = writeImportArtifacts(result, options.output, options.chunk, options.size);
  if (options.adminPackage) {
    const archiveSources = buildArchiveSourceAdminPackages({ archive: options.archive, primaryResult: result });
    const packages = buildPrimaryAdminPackages(result).concat(archiveSources.packages);
    adminPackage = writeAdminPackageArtifacts(
      packages,
      result.manifest.taxonomy.catalog,
      options.adminPackage,
      { source: { ...result.manifest.source, archive_source_documents: archiveSources.stats } }
    );
  }
  if (options.cleanDir) clean = writeCleanDirectory(result, options.cleanDir);
  const summary = { ...result.stats };
  if (written) {
    summary.output = {
      jsonl: written.jsonl,
      manifest: written.manifest,
      records_written: written.records_written,
      chunk: written.chunk
    };
  }
  if (adminPackage) summary.admin_package = {
    jsonl: adminPackage.jsonl,
    manifest: adminPackage.manifest,
    records_written: adminPackage.records_written
  };
  if (clean) {
    summary.clean_output = {
      directory: clean.directory,
      manifest: clean.manifest,
      files_written: clean.files.length
    };
  }
  if (options.summary || (!options.output && !options.cleanDir)) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  else if (clean && !written) process.stdout.write('Đã tạo ' + clean.files.length + ' tệp TeX sạch: ' + clean.directory + '\n');
  else process.stdout.write('Đã tạo ' + written.records_written + ' bản ghi: ' + written.jsonl + '\n');
  return { result, written, adminPackage, clean, summary };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write('Lỗi tạo ngân hàng: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  SCHEMA_VERSION,
  ADMIN_PACKAGE_SCHEMA_VERSION,
  SUPPLEMENTAL_MANIFEST_SCHEMA_VERSION,
  DEFAULT_ARCHIVE,
  DEFAULT_SUPPLEMENTAL_DIRECTORIES,
  ROUTED_DOCUMENT_PATTERN,
  SOURCE_DOCUMENT_PATTERN,
  SOURCE_SUPPORT_PATTERN,
  SUPPLEMENTAL_MOCK_EXAM_NAME_PATTERN,
  SUPPLEMENTAL_ANSWER_DIRECTORY_PATTERN,
  ALLOWED_MACROS,
  listArchiveEntries,
  readArchiveEntry,
  readTaxonomy,
  readArchiveMechanisms,
  inferSourceDocumentMetadata,
  collectDeclaredMacros,
  sanitizeObfuscatedTex,
  inferDocumentMetadata,
  taxonomyKeyForQuestion,
  taxonomyForQuestion,
  resolveAssetReference,
  validateAnswer,
  classifyQuestion,
  walkFilesReadOnly,
  supplementalSourceDescriptors,
  extractBracketMetadata,
  inferSupplementalDocumentMetadata,
  buildSupplementalAssetIndex,
  resolveSupplementalAssetReference,
  classifySupplementalQuestion,
  canonicalSha256,
  questionImportPayload,
  documentPackagePayload,
  buildQuestionBankImport,
  buildPrimaryAdminPackages,
  buildArchiveSourceAdminPackages,
  buildSupplementalQuestionBankManifest,
  selectChunk,
  resolveOutputPaths,
  resolveSupplementalManifestPath,
  serializeJsonl,
  writeImportArtifacts,
  buildAdminPackageRecords,
  writeAdminPackageArtifacts,
  writeSupplementalManifest,
  writeCleanDirectory,
  parseArgs,
  usage,
  main
};
