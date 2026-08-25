const fs = require('fs');
const assert = require('assert');

const reader = fs.readFileSync('js/latex-view.js','utf8');
const lesson = fs.readFileSync('bai-hoc.html','utf8');
const edge = fs.readFileSync('supabase/functions/latex/index.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20260825151000_latex_tikz_shared_cache.sql','utf8');
const shell = fs.readFileSync('js/vinhmath.js','utf8');

assert(reader.includes("purpose: 'tikz'") && reader.includes('cache_version: 4'));
assert(reader.includes("vmTikzGioiHan('invoke', 50000)") && reader.includes('new AbortController()'));
assert(reader.includes('vmTikzVoiGioiHan') && reader.includes('controller.abort()'));
assert(reader.includes("digest('SHA-256'") && reader.includes("vinhmath-tikz-v4"));
assert(reader.includes("alpha:true") && reader.includes("background:'rgba(0,0,0,0)'"));
assert(reader.includes('IntersectionObserver') && reader.includes('vmTikzAutoQueue'));
assert(reader.includes('vmRenderTikzEntriesNhanh') && reader.includes('splice(0, 12)'));
assert(lesson.includes('vmDisableGlobalTikzAuto') && lesson.includes('vmBienDichLoTikz'));
assert(lesson.includes("alpha: true") && lesson.includes("background:'rgba(0,0,0,0)'"));
assert(!lesson.includes('.vm-tex-tikz canvas { display:block; width:auto; max-width:100%; height:auto; margin:auto; background:#fff; }'));
assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY') && edge.includes('latex-render-cache'));
assert(edge.includes('jsr:@supabase/supabase-js@2.112.3'));
assert(edge.includes('purpose === "tikz"') && edge.includes('SHA-256'));
assert(edge.includes('standalone && tikzCount > 0 && tikzCount <= 16'));
assert(edge.includes('inflight') && edge.includes('x-vinhmath-cache'));
assert(edge.includes('ownsJob') && edge.includes('COALESCED'));
assert(edge.includes('const CACHE_VERSION = 4') && !edge.includes('const cacheVersion ='));
assert(edge.includes('TIKZ_TIMEOUT_MS') && edge.includes('DOCUMENT_TIMEOUT_MS') && edge.includes('cachedBytes.length <= MAX_PDF_BYTES'));
assert(edge.includes('EdgeRuntime.waitUntil'));
assert(migration.includes("'latex-render-cache'") && migration.includes('public=false'));
assert(reader.includes('vmTikzViewportAnToan') && reader.includes('vmTikzPdfThuTu.length > 72'));
assert(reader.includes("vmTikzGioiHan('pdfjs', 12000)") && reader.includes('window._vmTikzPdfJsPromise = null'));
assert(reader.includes('vm-tex-tikz-retry') && reader.includes('Không còn dữ liệu nguồn để kết xuất hình này'));
assert(reader.includes('patterns.meta') && reader.includes('decorations.text') && reader.includes('usepgfplotslibrary{fillbetween}'));
assert(reader.includes('@{0,2}input') && reader.includes('write18') && reader.includes('pdfshellescape') && reader.includes('filecontents\\*?'));
assert(lesson.includes('fallbackWorker()') && !lesson.includes('Promise.all(figures.map(vmBienDichMotTikz))'));
assert(shell.includes("/^vinhmath-tikz-v\\d+$/.test(name)") && shell.includes('caches.delete(name)'));

console.log('PASS shared TikZ cache, lazy batching and transparent dark-mode canvas');
