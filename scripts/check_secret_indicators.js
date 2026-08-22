const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', '.tools', '.codex-remote-attachments', 'node_modules']);
const findings = [];
const tokenPattern = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const indicators = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ['GitHub token', /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/g],
  ['Google API key', /AIza[A-Za-z0-9_-]{30,}/g],
  ['OpenAI-style API key', /sk-[A-Za-z0-9_-]{24,}/g],
  ['Postgres URI with password', /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]{8,}@/gi],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && fs.statSync(absolute).size <= 5 * 1024 * 1024) scan(absolute);
  }
}

function scan(absolute) {
  let source;
  try { source = fs.readFileSync(absolute, 'utf8'); } catch (_) { return; }
  if (source.includes('\u0000')) return;
  const relative = path.relative(root, absolute);
  for (const [label, pattern] of indicators) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) findings.push(`${label}: ${relative}`);
  }
  tokenPattern.lastIndex = 0;
  for (const token of source.match(tokenPattern) || []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') findings.push(`Supabase service_role JWT: ${relative}`);
    } catch (_) { /* Chuỗi giống JWT nhưng không giải mã được không phải bằng chứng secret. */ }
  }
}

walk(root);
if (findings.length) {
  console.error([...new Set(findings)].join('\n'));
  throw new Error(`Phát hiện ${new Set(findings).size} chỉ báo secret đặc quyền trong worktree`);
}
console.log('Privileged secret indicator scan OK (0 findings)');
