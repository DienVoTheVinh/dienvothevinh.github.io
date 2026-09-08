const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const portals=[
  {id:'um',name:'UYENMATH',login_suffix:'hsum',teacher_login_suffix:'gvum',experience_mode:'full_site',is_active:true},
  {id:'tt',name:'Toán Thầy Trường',login_suffix:'hstt',teacher_login_suffix:'gvtt',experience_mode:'full_site',is_active:true},
  {id:'demo',name:'Thi thử',login_suffix:'hsdemo',teacher_login_suffix:'gvdemo',experience_mode:'exam_only',is_active:true},
  {id:'paused',name:'Paused',login_suffix:'hsxx',teacher_login_suffix:'gvxx',experience_mode:'full_site',is_active:false}
];
(async()=>{
  const server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(!path.extname(file))file+='.html';
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    const ext=path.extname(file);res.setHeader('content-type',ext==='.html'?'text/html; charset=utf-8':ext==='.css'?'text/css':'application/octet-stream');
    let content=fs.readFileSync(file);
    if(ext==='.html')content=content.toString().replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi,'');
    res.end(content);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.VM_CHROME_PATH,headless:true});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.$=id=>document.getElementById(id);window.daKetNoi=()=>false;});
    await page.route('https://**/*',route=>route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/quan-tri-tai-khoan');
    await page.evaluate(async list=>{
      window.sb={from(){let rows=list;const q={select(){return q;},eq(k,v){rows=rows.filter(x=>x[k]===v);return q;},in(k,v){rows=rows.filter(x=>v.includes(x[k]));return q;},order(){return Promise.resolve({data:rows});}};return q;}};
      await ttTaiPhamViTaiKhoan();ttDatMatKhauMacDinh();ttDoiPhamVi();
    },portals);
    assert.equal(await page.locator('#ttPhamVi option').count(),4);
    for(const [scope,suffix] of [['um','um'],['tt','tt']]){
      await page.selectOption('#ttPhamVi',scope);await page.selectOption('#ttLoai','portal_hs');await page.fill('#ttHoTen','Nguyễn Văn An');
      await page.evaluate(()=>ttXemTruoc());
      assert((await page.locator('#ttPreviewOne').textContent()).includes('@hs'+suffix));
      await page.selectOption('#ttLoai','portal_gv');assert((await page.locator('#ttPreviewOne').textContent()).includes('@gv'+suffix));
      assert((await page.locator('#ttPhamViMoTa').textContent()).includes('trang chủ thương hiệu'));
    }
    await page.click('#ttModeBulk');await page.fill('#ttBulkNames','Nguyễn Văn An\nTrần Văn Bình');
    assert((await page.locator('#ttBulkScopeNote').textContent()).includes('@hstt'));
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      assert(await page.locator('#ttPhamVi').isVisible());
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Unexpected horizontal overflow at '+width);
      await page.screenshot({path:'.tools/test-artifacts/brand-accounts-'+width+'.png',fullPage:true});
    }
    // Execute the real conversion UI with both success and non-2xx responses.
    const tenantHtml=fs.readFileSync('quan-tri-khong-gian.html','utf8');
    const conversionCode=tenantHtml.slice(tenantHtml.indexOf('var migrationRunning=false;'),tenantHtml.indexOf("document.getElementById('builderNamespace').addEventListener"));
    await page.setContent('<select id="tenantTeacher"><option value="teacher">Teacher</option></select><select id="tenantClass"><option value="class">Class</option></select><button onclick="migrateAccounts(true)">Check</button><button onclick="migrateAccounts(false)">Apply</button><pre id="migrationResult"></pre>');
    await page.evaluate(()=>{window.currentTenant={id:'um',name:'UYENMATH'};Object.defineProperty(window,'status',{configurable:true,value:(message,type)=>window.lastStatus={message,type}});window.clearStatus=()=>{};window.confirm=()=>true;});
    await page.addScriptTag({content:conversionCode});
    await page.evaluate(async()=>{
      window.sb={functions:{invoke:async()=>({data:{dryRun:true,preflight:{tenantSlug:'uyenmath',skippedCount:1,changeCount:1,loginMapping:[{from:'done@hsum',to:'done@hsum',unchanged:true,skipped:true},{from:'new@hs',to:'new@hsum',skipped:false}]}}})}};
      await migrateAccounts(true);
    });
    assert((await page.locator('#migrationResult').textContent()).includes('Giữ nguyên: 1'));
    await page.evaluate(async()=>{
      sb.functions.invoke=async()=>({error:{message:'non-2xx',context:{json:async()=>({error:'Tên đăng nhập đã tồn tại'})}}});
      await migrateAccounts(false);
    });
    assert((await page.locator('#migrationResult').textContent()).includes('Tên đăng nhập đã tồn tại'));
    assert(!(await page.locator('#migrationResult').textContent()).includes('hoàn tác'));
    assert.equal(await page.locator('button:disabled').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS browser: UM/Truong/exam selection, teacher/student suffixes, bulk mode, desktop/mobile layout');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
