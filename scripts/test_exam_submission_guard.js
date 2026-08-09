const fs = require('fs');

const source = fs.readFileSync('luyen-de.html', 'utf8');
const start = source.indexOf('async function vmCapNhatVaXacNhanLuotLam');
const end = source.indexOf('async function nopBaiExam', start);
if (start < 0 || end < 0) throw new Error('Missing guarded attempt submission helper');
const helperSource = source.slice(start, end);

function makeClient(responses) {
  let maybeSingleCalls = 0;
  const query = {
    update() { return this; },
    select() { return this; },
    eq() { return this; },
    maybeSingle() { return Promise.resolve(responses[maybeSingleCalls++]); },
  };
  return { client: { from() { return query; } }, calls: () => maybeSingleCalls };
}

(async () => {
  const verifiedRow = { id: 'attempt-1', submitted_at: '2026-08-09T12:00:00Z' };
  let mock = makeClient([{ data: null, error: null }, { data: verifiedRow, error: null }]);
  let helper = new Function('sb', 'currentAttempt', `${helperSource}; return vmCapNhatVaXacNhanLuotLam;`)(mock.client, { id: 'attempt-1' });
  let result = await helper({ submitted_at: verifiedRow.submitted_at }, 'id, submitted_at');
  if (result.data !== verifiedRow || result.error || mock.calls() !== 2) {
    throw new Error(`Zero-row update was not verified safely: ${JSON.stringify(result)}`);
  }

  mock = makeClient([{ data: null, error: null }, { data: null, error: null }]);
  helper = new Function('sb', 'currentAttempt', `${helperSource}; return vmCapNhatVaXacNhanLuotLam;`)(mock.client, { id: 'attempt-2' });
  result = await helper({ submitted_at: verifiedRow.submitted_at }, 'id, submitted_at');
  if (!result.error || !/tải lại trang/i.test(result.error.message)) {
    throw new Error(`Missing friendly recovery message after an unverified update: ${JSON.stringify(result)}`);
  }

  const retry = source.slice(source.indexOf('async function lamLuotMoi'), source.indexOf('function exitWorkspace'));
  const resetIndex = retry.indexOf('currentAttempt = {');
  const reopenIndex = retry.indexOf('moPhongTuLuan(currentExam, false)');
  if (resetIndex < 0 || reopenIndex < 0 || resetIndex > reopenIndex || !/is_practice:\s*true/.test(retry.slice(resetIndex, reopenIndex))) {
    throw new Error('Essay retry reuses the submitted official attempt');
  }

  console.log('PASS submission zero-row guard and isolated essay practice retry');
})().catch((error) => { console.error(error); process.exit(1); });
