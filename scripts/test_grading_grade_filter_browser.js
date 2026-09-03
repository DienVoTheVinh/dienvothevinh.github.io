const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const source = fs.readFileSync('quan-tri-cham-bai.html', 'utf8');
  const tokens = fs.readFileSync('css/tokens.css', 'utf8');
  const shared = fs.readFileSync('css/vinhmath.css', 'utf8');
  const inline = [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  const bodyMatch = source.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('Grading page body is missing');
  const body = bodyMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const filterFunctions = source.match(/function giaTriKhoi\(lop\)[\s\S]*?(?=function locDuLieu\(\))/);
  if (!filterFunctions) throw new Error('Grading filter functions are missing');

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${shared}\n${inline}</style></head><body>${body}</body></html>`);
    const desktop = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.chb-filter-selects select')].map((el) => el.id);
      const rects = ids.map((id) => document.getElementById(id).getBoundingClientRect());
      return {
        ids,
        sameRow: rects.every((rect) => Math.abs(rect.top - rects[0].top) < 2),
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    if (desktop.ids.join(',') !== 'selKhoi,selLop,selChuyenDe,selBai' || !desktop.sameRow || !desktop.noOverflow) {
      throw new Error(`Desktop grading filters failed: ${JSON.stringify(desktop)}`);
    }

    await page.addScriptTag({ content: `
      function $(id) { return document.getElementById(id); }
      function chamEsc(value) { return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' })[c]; }); }
      var dsLop = [], dsBai = [], dsDe = [], dangLoc = 'submitted';
      ${filterFunctions[0]}
    ` });
    const hierarchy = await page.evaluate(() => {
      dsLop = [{ id:'c1', name:'Toán 12', grade:12 }];
      dsBai = [
        { id:'b3', title:'Bài C', class_id:'c1', sort:1, created_at:'2026-01-03T00:00:00Z', topics:{ id:'t2', name:'Hàm số', sort:2 } },
        { id:'b2', title:'Bài B', class_id:'c1', sort:9, created_at:'2026-01-02T00:00:00Z', topics:{ id:'t1', name:'Mệnh đề', sort:1 } },
        { id:'b1', title:'Bài A', class_id:'c1', sort:50, created_at:'2026-01-01T00:00:00Z', topics:{ id:'t1', name:'Mệnh đề', sort:1 } },
        { id:'b4', title:'Bài tự do', class_id:'c1', sort:1, created_at:'2026-01-04T00:00:00Z', topics:null },
      ];
      capNhatDropdownKhoi();
      $('selKhoi').value = '12';
      capNhatLopTheoKhoi();
      $('selLop').value = 'c1';
      capNhatDropdownBoLoc();
      const topics = [...$('selChuyenDe').options].map((option) => ({ value:option.value, text:option.textContent }));
      const allGroups = [...$('selBai').querySelectorAll('optgroup')].map((group) => ({ label:group.label, lessons:[...group.querySelectorAll('option')].map((option) => option.value) }));
      $('selChuyenDe').value = 't1';
      capNhatBaiTheoChuyenDe();
      const selectedLessons = [...$('selBai').options].map((option) => option.value).filter(Boolean);
      return { topics, allGroups, selectedLessons };
    });
    const expectedTopics = ['', 't1', 't2', '__khac__'];
    if (hierarchy.topics.map((item) => item.value).join(',') !== expectedTopics.join(',')) {
      throw new Error(`Topic order failed: ${JSON.stringify(hierarchy)}`);
    }
    if (hierarchy.allGroups.map((item) => item.label).join('|') !== 'Chuyên đề 1: Mệnh đề|Chuyên đề 2: Hàm số|Bài giảng khác / Tự do') {
      throw new Error(`Topic grouping failed: ${JSON.stringify(hierarchy)}`);
    }
    if (hierarchy.allGroups[0].lessons.join(',') !== 'b1,b2' || hierarchy.selectedLessons.join(',') !== 'b1,b2') {
      throw new Error(`Lesson order/filter failed: ${JSON.stringify(hierarchy)}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const wrap = document.querySelector('.chb-filter-selects').getBoundingClientRect();
      const selects = [...document.querySelectorAll('.chb-filter-selects select')].map((el) => el.getBoundingClientRect());
      return {
        oneColumn: selects.every((rect, index) => index === 0 || rect.top > selects[index - 1].bottom),
        fullWidth: selects.every((rect) => Math.abs(rect.width - wrap.width) < 2),
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    if (!mobile.oneColumn || !mobile.fullWidth || !mobile.noOverflow) {
      throw new Error(`Mobile grading filters failed: ${JSON.stringify(mobile)}`);
    }
    console.log('PASS grading grade -> class -> topic -> lesson hierarchy and responsive geometry');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
