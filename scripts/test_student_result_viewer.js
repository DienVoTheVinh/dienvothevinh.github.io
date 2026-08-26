const fs = require('fs');
const vm = require('vm');

const lesson = fs.readFileSync('bai-hoc.html','utf8');
const results = fs.readFileSync('js/student-results.js','utf8');
const viewer = fs.readFileSync('js/student-result-viewer.js','utf8');
const css = fs.readFileSync('css/student-result-viewer.css','utf8');
const expect = (value,message) => { if (!value) throw new Error(message); };

new vm.Script(viewer,{filename:'student-result-viewer.js'});
new vm.Script(results,{filename:'student-results.js'});

expect(lesson.includes("score, assessment_level, feedback"), 'Lesson result query must load assessment_level.');
expect(lesson.includes('vm-lesson-assessment') && lesson.includes('VMStudentResultUI.assessment'), 'Lesson result must render the shared assessment UI.');
expect(!/data-answer-image[^>]+onclick="vmMoTepDapAn/.test(lesson), 'Common answer images must not open a locked blob tab.');
expect(lesson.includes('VMStudentResultUI.openMedia(items, itemIndex'), 'Common answer images must use the in-page gallery.');
expect(results.includes('data-result-media-group') && results.includes('VMStudentResultUI.openMedia'), 'Results page images must use the same gallery.');
expect(!results.includes('class="student-result-file" href="'), 'Result images must not open as standalone tabs.');
expect(results.includes("form.append('kind', 'result_file')") && results.includes("form.append('collection', collection)"), 'Result files must load through the authorized private proxy.');
expect(results.includes("request.append('kind', 'class_answer_get')") && results.includes("form.append('kind', 'class_answer_file')"), 'Results must load the protected common answer for the selected lesson.');
expect(results.includes("String(answer.lesson_id || '') !== String(item.lesson_id)"), 'Results must reject a common answer belonging to another lesson.');
expect(results.includes('classAnswerHtml +') && results.includes('Đáp án chung của bài giảng'), 'Results must render the selected lesson common answer in the unified view.');
for (const marker of ['data-media-action="prev"','data-media-action="next"','data-media-action="fullscreen"','data-media-thumbs','requestFullscreen','ArrowLeft','ArrowRight']) {
  expect(viewer.includes(marker), `Shared result viewer is missing ${marker}.`);
}
expect(viewer.includes("document.createElement('dialog')") && viewer.includes('viewer.showModal()') && viewer.includes("viewer.addEventListener('cancel'"), 'Shared result gallery must enter the browser top layer above the result dialog.');
expect(viewer.includes('safeMediaUrl') && viewer.includes("url.protocol === 'https:'") && viewer.includes("url.protocol === 'blob:'"), 'Gallery URLs must be protocol-allowlisted before assigning image or fallback links.');
expect(css.includes('100420') && css.includes('position:fixed;inset:0') && css.includes('@media(max-width:680px)'), 'Shared viewer must stay visible and responsive above lesson dialogs.');
console.log('PASS unified student assessment and in-page result gallery contracts');
