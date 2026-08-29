'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const chrome = process.env.VM_CHROME_PATH;
if (!chrome || !fs.existsSync(chrome)) throw new Error('VM_CHROME_PATH must point to Chrome');
const css = ['css/tokens.css', 'css/vinhmath.css', 'css/role-home.css'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const source = fs.readFileSync('js/role-home.js', 'utf8');

const classes = [
  {id:'c1',name:'Toán 12',grade:12},
  {id:'c2',name:'Toán 9',grade:9},
  {id:'c3',name:'Luyện thi THPT',grade:12}
];
const datasets = {
  class_students:[{student_id:'s1',class_id:'c1'},{student_id:'s2',class_id:'c1'},{student_id:'s1',class_id:'c2'}],
  lessons:[{id:'l1',title:'Hàm số',class_id:'c1',published:true,created_at:'2026-08-29',classes:{name:'Toán 12'}},{id:'l2',title:'Hình học',class_id:'c2',published:true,created_at:'2026-08-28',classes:{name:'Toán 9'}}],
  exams:[],
  submissions:[{id:'x1',status:'submitted',submitted_at:new Date().toISOString(),lessons:{title:'Hàm số',class_id:'c1'},profiles:{full_name:'Nguyễn Minh An'}},{id:'x2',status:'submitted',submitted_at:new Date(Date.now()-3600000).toISOString(),lessons:{title:'Hình học',class_id:'c2'},profiles:{full_name:'Trần Gia Hân'}}],
  schedules:[{id:'q1',class_id:'c1',weekday:(new Date().getDay() || 7),start_time:'18:00:00',end_time:'20:00:00',classes:{name:'Toán 12'}}]
};

function html() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n.wrap{max-width:1200px;margin:0 auto;padding:0 24px 80px}.greet{padding:24px 0 14px}</style></head><body><div class="wrap"><section class="greet"><h1>Chào thầy</h1></section><section class="vm-role-focus" id="vmRoleFocus"><div class="vm-role-focus-head"><div><h2 id="vmRoleTitle"></h2><p id="vmRoleSub"></p></div></div><div class="vm-role-actions" id="vmRoleActions"></div></section></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({executablePath:chrome,headless:true});
  try {
    const page = await browser.newPage();
    for (const viewport of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]) {
      await page.setViewportSize(viewport);
      await page.setContent(html(), {waitUntil:'domcontentloaded'});
      await page.evaluate(({classes,datasets}) => {
        function builder(table) {
          return {select(){return this;},in(){return this;},eq(){return this;},or(){return this;},order(){return this;},limit(){return this;},then(resolve){resolve({data:datasets[table] || []});}};
        }
        window.sb = {rpc(){return Promise.resolve({data:classes});},from(table){return builder(table);}};
      }, {classes,datasets});
      await page.addScriptTag({content:source});
      await page.evaluate(() => window.vmRoleHomeRender({id:'admin-1',role:'admin'}));
      await page.waitForSelector('.vm-staff-home-grid');
      const result = await page.evaluate(() => {
        const grid=document.querySelector('.vm-staff-home-grid'),admin=document.querySelector('.vm-staff-admin'),metrics=document.querySelectorAll('.vm-staff-metric'),pending=document.querySelectorAll('.vm-staff-pending-row'),schedule=document.querySelectorAll('.vm-staff-schedule-row');
        return {gridWidth:grid.getBoundingClientRect().width,adminVisible:!!admin&&admin.getBoundingClientRect().height>0,metrics:metrics.length,pending:pending.length,schedule:schedule.length,overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      if (!result.gridWidth || !result.adminVisible || result.metrics !== 4 || result.pending !== 2 || result.schedule !== 1 || result.overflow) throw new Error(`Staff home ${viewport.name} failed: ${JSON.stringify(result)}`);
    }
    console.log('PASS staff home overview desktop/mobile rendering');
  } finally { await browser.close(); }
})().catch((error) => {console.error(error);process.exit(1);});
