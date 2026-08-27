'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const QuestionBank = require('../js/question-bank.js');

const fixture = String.raw`
% A commented block must never be imported:
% \begin{ex}%[0D1N1-9]\choice{A}{B}{C}{\True D}\end{ex}

\begin{vd}%[Dự án đề kiểm tra -- Nguyễn Văn A]%[1D6N4-4]
Giá trị của $2^3$ bằng
\choice
  {$4$}
  {$6$}
  {\True $8$}
  {$9$}
\loigiai{$2^3=8$.}
\end{vd}

\begin{question}%[2H3C2-1]%[Tác giả B]
Cho hình chóp $S.ABC$. Xét các khẳng định sau.
\choiceTF
  {\True $SA=SA$}
  {$AB=0$}
  {\True $A\in(ABC)$}
  {$S\in(ABC)$}
\giaibai{Hai mệnh đề thứ nhất và thứ ba đúng.}
\end{question}

\begin{cauhoi}%[0D2H3-2]
Tính $15+27$. \shortans[oly]{42}
\solution{Ta có $15+27=42$.}
\end{cauhoi}

\begin{baitap}%[1H4V2-3]
Tìm độ dài đoạn thẳng trong hình \includegraphics[width=2cm]{figures/hinh-1.png}.
\shortans[]{5}
\begin{solution}Dùng định lý Pythagore.\end{solution}
\end{baitap}

\begin{bt}
Chứng minh bất đẳng thức đã cho. \input{assets/proof-figure.tex}
\end{bt}

\begin{ex}%[0D1N1-1]
Câu hỏi có hình dựng trực tiếp.
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\choice{\True A}{B}{C}{D}
\end{ex}`;

assert.strictEqual(QuestionBank.VERSION, '1.3.0');
assert.deepStrictEqual(QuestionBank.QUESTION_ENVIRONMENTS, ['ex', 'bt', 'vd', 'cauhoi', 'question', 'baitap']);

const id = QuestionBank.parseQuestionId('1D6N4-4');
assert.ok(id);
assert.strictEqual(id.grade, 11);
assert.strictEqual(id.chapter, 6);
assert.strictEqual(id.chapter_code, '1D6');
assert.strictEqual(id.difficulty, 'NB');
assert.strictEqual(id.difficulty_rank, 1);
assert.strictEqual(id.skill, 4);
assert.strictEqual(id.skill_code, '1D6N4');
assert.strictEqual(id.skill_family, '1D6?4');
assert.strictEqual(id.variant, '4');
assert.strictEqual(id.taxonomy_key, '1D6?4-4');
assert.strictEqual(id.similarity_key, '1D6?4-4');
assert.strictEqual(QuestionBank.parseQuestionId('2H3C2-1').difficulty, 'VDC');
assert.strictEqual(QuestionBank.parseQuestionId('0D2H3-2').grade, 10);
assert.strictEqual(QuestionBank.parseQuestionId('0D2H3-2').difficulty, 'TH');
assert.strictEqual(QuestionBank.parseQuestionId('bad metadata'), null);
assert.strictEqual(QuestionBank.parseQuestionId('2D1H3-HAM-SO'), null, 'semantic suffixes are not part of the legacy author standard');
assert.strictEqual(QuestionBank.parseQuestionId('2D1D3-1'), null, 'unknown difficulty aliases must not enter the catalog');
assert.strictEqual(QuestionBank.parseQuestionId('0D0N1-1').chapter, 0, 'chapter zero is valid in the original taxonomy');

const thcsId = QuestionBank.parseQuestionId('thcs-v1:6D1TH3-1');
assert.ok(thcsId, 'namespaced custom IDs are supported');
assert.strictEqual(thcsId.id, 'thcs-v1:6D1TH3-1');
assert.strictEqual(thcsId.schema_name, 'thcs-v1');
assert.strictEqual(thcsId.grade, 6);
assert.strictEqual(thcsId.difficulty, 'TH');
assert.strictEqual(thcsId.taxonomy_key, 'thcs-v1:6D1?3-1');
assert.strictEqual(QuestionBank.parseQuestionId('THCS-CHUYEN-V1:9H2VDC4-HSG').id, 'thcs-chuyen-v1:9H2VDC4-HSG');
assert.strictEqual(QuestionBank.parseQuestionId('6D1TH3-1'), null, 'custom curricula require a namespace');
assert.strictEqual(QuestionBank.extractQuestionId(String.raw`\begin{ex}%[thcs-v1:6D1TH3-1] Nội dung\end{ex}`), 'thcs-v1:6D1TH3-1');

const recoveredCommentCases = [
  {
    syntax: 'unprefixed_bracket',
    tex: String.raw`\begin{ex}%[TeamTeXHoa -- Nguyễn Văn A][2H2H2-6]
Nội dung.\end{ex}`,
    id: '2H2H2-6'
  },
  {
    syntax: 'double_bracket',
    tex: String.raw`\begin{ex}%[[2D4N1-4]]
Nội dung.\end{ex}`,
    id: '2D4N1-4'
  },
  {
    syntax: 'missing_closing_bracket',
    tex: String.raw`\begin{ex}%[2H2V2-4%[Nguồn đề]
Nội dung.\end{ex}`,
    id: '2H2V2-4'
  }
];
for (const example of recoveredCommentCases) {
  const analysis = QuestionBank.analyzeQuestionIds(example.tex);
  const question = QuestionBank.parseQuestionBlock(example.tex);
  assert.strictEqual(analysis.id, example.id);
  assert.deepStrictEqual(analysis.candidates, [example.id]);
  assert.strictEqual(analysis.recovered, true);
  assert.strictEqual(analysis.recovery_syntax, example.syntax);
  assert.strictEqual(question.question_id, example.id);
  assert.strictEqual(question.question_id_recovered, true);
  assert.strictEqual(question.question_id_recovery_syntax, example.syntax);
  assert.deepStrictEqual(question.parser_warnings, []);
}

const relaxedMultiId = QuestionBank.parseQuestionBlock(String.raw`\begin{ex}%[Tác giả][2H2H2-6][2H2V2-4]
Không được tự chọn một trong hai mã.\end{ex}`);
assert.strictEqual(relaxedMultiId.question_id, null, 'relaxed recovery requires exactly one valid candidate');
assert.deepStrictEqual(relaxedMultiId.question_id_candidates, ['2H2H2-6', '2H2V2-4']);
assert.deepStrictEqual(relaxedMultiId.parser_warnings, [{
  code: 'MULTIPLE_QUESTION_IDS',
  candidates: ['2H2H2-6', '2H2V2-4']
}]);

const standardMultiId = QuestionBank.parseQuestionBlock(String.raw`\begin{ex}%[2D1N1-1]%[2D1H1-1]
Giữ tương thích bằng mã chuẩn đầu tiên nhưng phải lưu cảnh báo.\end{ex}`);
assert.strictEqual(standardMultiId.question_id, '2D1N1-1');
assert.strictEqual(standardMultiId.question_id_recovered, false);
assert.deepStrictEqual(standardMultiId.question_id_candidates, ['2D1N1-1', '2D1H1-1']);
assert.strictEqual(standardMultiId.parser_warnings[0].code, 'MULTIPLE_QUESTION_IDS');

assert.strictEqual(
  QuestionBank.extractQuestionId(String.raw`\begin{ex}%[2D1K4]
Mã thiếu biến thể phải chờ duyệt.\end{ex}`),
  null,
  'malformed IDs must not be guessed'
);
assert.strictEqual(
  QuestionBank.extractQuestionId(String.raw`\begin{ex}
Nội dung trước.
%[Tác giả][2H2H2-6]
\end{ex}`),
  null,
  'relaxed recovery must not scan comments inside question content'
);

const report = QuestionBank.parseDocument(fixture, { sourcePath: 'fixture.tex' });
assert.deepStrictEqual(report.errors, []);
assert.strictEqual(report.questions.length, 6, 'must extract every supported environment and ignore commented blocks');
assert.deepStrictEqual(report.stats, {
  total: 6,
  multiple_choice: 2,
  true_false: 1,
  short_answer: 2,
  essay: 1
});

const mc = report.questions[0];
assert.strictEqual(mc.raw_environment, 'vd');
assert.strictEqual(mc.normalized_environment, 'ex');
assert.strictEqual(mc.type, 'multiple_choice');
assert.strictEqual(mc.question_id, '1D6N4-4', 'author metadata must not be mistaken for the ID');
assert.strictEqual(mc.grade, 11);
assert.strictEqual(mc.difficulty, 'NB');
assert.strictEqual(mc.taxonomy_key, '1D6?4-4');
assert.strictEqual(mc.similarity_key, '1D6?4-4');
assert.strictEqual(mc.choices.length, 4);
assert.deepStrictEqual(mc.correct_choice_indexes, [2]);
assert.strictEqual(mc.choices[2].tex, '$8$');
assert.strictEqual(mc.solution_tex, '$2^3=8$.');
assert.ok(!mc.content_tex.includes('Nguyễn Văn A'));
assert.ok(mc.canonical_tex.startsWith('\\begin{ex}%[1D6N4-4]'));
assert.ok(mc.canonical_tex.includes('\\loigiai{$2^3=8$.}'));
assert.ok(!mc.canonical_tex.includes('Dự án đề kiểm tra'));
assert.ok(mc.raw_tex.includes('Nguyễn Văn A'), 'raw TeX must remain untouched for audit/re-import');

const tf = report.questions[1];
assert.strictEqual(tf.type, 'true_false');
assert.strictEqual(tf.normalized_environment, 'ex');
assert.deepStrictEqual(tf.correct_choice_indexes, [0, 2]);
assert.strictEqual(tf.grade, 12);
assert.strictEqual(tf.difficulty, 'VDC');
assert.strictEqual(tf.solution_source, 'giaibai');
assert.ok(tf.canonical_tex.includes('\\choiceTF'));

const short = report.questions[2];
assert.strictEqual(short.raw_environment, 'cauhoi');
assert.strictEqual(short.normalized_environment, 'bt');
assert.strictEqual(short.type, 'short_answer');
assert.strictEqual(short.short_answer, '42');
assert.strictEqual(short.short_answer_option, 'oly');
assert.strictEqual(short.solution_source, 'solution');
assert.ok(short.canonical_tex.startsWith('\\begin{bt}%[0D2H3-2]'));
assert.ok(!short.canonical_tex.includes('\\shortans'), 'canonical short-answer TeX must use VinhMath bt + loigiai only');
assert.ok(short.canonical_tex.includes('\\loigiai{\\textbf{Câu trả lời:} 42'));
assert.ok(short.canonical_tex.includes('Ta có $15+27=42$.}'));

const shortRoundTrip = QuestionBank.parseQuestionBlock(short.canonical_tex);
assert.strictEqual(shortRoundTrip.type, 'short_answer', 'canonical bt + loigiai must remain a short-answer question');
assert.strictEqual(shortRoundTrip.short_answer, '42');
assert.strictEqual(shortRoundTrip.solution_tex, 'Ta có $15+27=42$.');
assert.strictEqual(shortRoundTrip.canonical_tex, short.canonical_tex, 'canonical short TeX must be idempotent');
assert.strictEqual(shortRoundTrip.canonical_hash, short.canonical_hash);
assert.strictEqual(shortRoundTrip.uid, short.uid);

const formattedCanonicalShortTex = String.raw`\begin{bt}%[2D1H1-1]
Tính giá trị gần đúng.
\loigiai{\textbf{Câu trả lời:} $5{,}93$

Làm tròn đến hàng phần trăm.}
\end{bt}`;
const formattedCanonicalShort = QuestionBank.parseQuestionBlock(formattedCanonicalShortTex);
assert.strictEqual(formattedCanonicalShort.type, 'short_answer');
assert.strictEqual(formattedCanonicalShort.short_answer, '$5{,}93$');
assert.strictEqual(formattedCanonicalShort.solution_tex, 'Làm tròn đến hàng phần trăm.');
assert.strictEqual(formattedCanonicalShort.canonical_tex, formattedCanonicalShortTex);
assert.strictEqual(
  QuestionBank.parseQuestionBlock(formattedCanonicalShort.canonical_tex).canonical_hash,
  formattedCanonicalShort.canonical_hash,
  'canonical bt + loigiai stays identity-stable without shortans'
);

assert.strictEqual(QuestionBank.parseQuestionId('1D6G4-4').difficulty, 'VDC');
assert.strictEqual(QuestionBank.parseQuestionId('1D6T4-4').difficulty, 'TH');

const shortWithAsset = report.questions[3];
assert.strictEqual(shortWithAsset.solution_source, 'solution');
assert.strictEqual(shortWithAsset.solution_tex, 'Dùng định lý Pythagore.');
assert.strictEqual(shortWithAsset.has_assets, true);
assert.deepStrictEqual(shortWithAsset.asset_refs[0], {
  kind: 'media',
  command: 'includegraphics',
  path: 'figures/hinh-1.png',
  external: true
});

const essay = report.questions[4];
assert.strictEqual(essay.type, 'essay');
assert.strictEqual(essay.normalized_environment, 'bt');
assert.strictEqual(essay.question_id, null);
assert.strictEqual(essay.has_assets, true);
assert.strictEqual(essay.asset_refs[0].command, 'input');

const tikz = report.questions[5];
assert.strictEqual(tikz.has_assets, true);
assert.deepStrictEqual(tikz.embedded_graphics, ['tikz']);

for (const question of report.questions) {
  assert.match(question.source_hash, /^[0-9a-f]{16}$/);
  assert.match(question.canonical_hash, /^[0-9a-f]{16}$/);
  assert.match(question.uid, /^qb-[0-9a-f]{16}$/);
  assert.strictEqual(question.source_path, 'fixture.tex');
  assert.ok(question.raw_tex.length > 0);
  assert.ok(question.canonical_tex.length > 0);
}

const sameQuestionDifferentAuthor = fixture.replace('Nguyễn Văn A', 'Tác giả hoàn toàn khác');
const reparsed = QuestionBank.parseTex(sameQuestionDifferentAuthor)[0];
assert.notStrictEqual(mc.source_hash, reparsed.source_hash, 'source hash audits the exact imported source');
assert.strictEqual(mc.canonical_hash, reparsed.canonical_hash, 'canonical hash ignores author-only metadata');
assert.strictEqual(mc.uid, reparsed.uid, 'UID stays stable when only author metadata changes');

const sameQuestionDifferentTaxonomy = fixture.replace('1D6N4-4', '1D6H4-4');
const reclassified = QuestionBank.parseTex(sameQuestionDifferentTaxonomy)[0];
assert.strictEqual(mc.canonical_hash, reclassified.canonical_hash, 'taxonomy edits must not create a duplicate question');
assert.strictEqual(mc.uid, reclassified.uid, 'immutable question UID must not depend on its editable taxonomy code');
assert.strictEqual(mc.similarity_key, reclassified.similarity_key, 'difficulty changes stay in the same taxonomy family');
assert.notStrictEqual(
  QuestionBank.parseQuestionId('1D6N4-4').similarity_key,
  QuestionBank.parseQuestionId('1D6N4-5').similarity_key,
  'the final ID segment distinguishes mathematical subtypes in id_map'
);

assert.strictEqual(
  QuestionBank.hashText('Một câu\r\n'),
  QuestionBank.hashText('Một câu\n'),
  'line-ending changes must not alter hashes'
);

// Verify that the same artifact exposes a browser global without CommonJS.
const umdSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'question-bank.js'), 'utf8');
const browserContext = { TextEncoder, self: {} };
vm.runInNewContext(umdSource, browserContext, { filename: 'question-bank.js' });
assert.ok(browserContext.self.VinhMathQuestionBank);
assert.strictEqual(browserContext.self.VinhMathQuestionBank.parseTex(fixture).length, 6);

// A bounded smoke test against the newly supplied real bank proves compatibility
// with its ex_test author metadata and mixed MC/TF/short-answer structure.
const realBankFile = path.join(
  __dirname,
  '..',
  'NganHang',
  'DeOnTheoChuong Toan 11',
  'THPT',
  'De1-Xacsuat.tex'
);
if (fs.existsSync(realBankFile)) {
  const realQuestions = QuestionBank.parseTex(fs.readFileSync(realBankFile, 'utf8'), {
    sourcePath: path.relative(path.join(__dirname, '..'), realBankFile)
  });
  assert.ok(realQuestions.length >= 10, 'real bank file should yield a meaningful batch');
  assert.ok(realQuestions.some((question) => question.type === 'multiple_choice'));
  assert.ok(realQuestions.some((question) => question.type === 'true_false'));
  assert.ok(realQuestions.some((question) => question.type === 'short_answer'));
  assert.ok(realQuestions.some((question) => question.question_id === '1D9H2-3'));
  assert.ok(realQuestions.every((question) => /^\\begin\{(?:ex|bt)\}/.test(question.canonical_tex)));
}

// These are the nine audited source occurrences whose leading metadata has one
// safely recoverable taxonomy ID. Two De1 copies are the same canonical item,
// so the regression must remain exactly nine occurrences / eight questions.
const auditedRecoveryFiles = [
  ['De on theo chuong T10 hk1', 'CK1-K12', 'De1.tex'],
  ['De on theo chuong T10 hk1', 'Toan10', 'Hethucluong-de4.tex'],
  ['De on theo chuong T10 hk1', 'Toan10', 'Vecto-de1.tex'],
  ['De on theo chuong T10 hk1', 'Toan10', 'Vecto-de2.tex'],
  ['De on theo chuong T10 hk1', 'Toan10', 'Vecto-de6.tex'],
  ['De on theo chuong T10 hk1', 'Toan12 HK1 DeOn', 'CK1-K12', 'De1.tex'],
  ['De On Theo Chuong Toan 12 Hk1', 'De On Theo Chuong Toan 12 Hk1', 'Toan12', 'Vecto-de5.tex'],
  ['DeOnTheoChuong Toan 11', 'THPT', 'Dethamkhao2.tex'],
  ['DeOnTheoChuong Toan 11', 'THPT', 'Hamso-de7.tex']
].map((segments) => path.join(__dirname, '..', 'NganHang', ...segments));

if (auditedRecoveryFiles.every((file) => fs.existsSync(file))) {
  const recoveredQuestions = auditedRecoveryFiles.flatMap((file) =>
    QuestionBank.parseTex(fs.readFileSync(file, 'utf8'), { sourcePath: file })
      .filter((question) => question.question_id_recovered)
  );
  assert.strictEqual(recoveredQuestions.length, 9, 'audited corpus must recover exactly nine occurrences');
  assert.strictEqual(
    new Set(recoveredQuestions.map((question) => question.canonical_hash)).size,
    8,
    'the nine recovered occurrences must represent exactly eight canonical questions'
  );
  assert.deepStrictEqual(
    recoveredQuestions.reduce((counts, question) => {
      counts[question.question_id_recovery_syntax] = (counts[question.question_id_recovery_syntax] || 0) + 1;
      return counts;
    }, {}),
    {
      unprefixed_bracket: 7,
      missing_closing_bracket: 1,
      double_bracket: 1
    }
  );
}

console.log('question-bank parser: all tests passed');
