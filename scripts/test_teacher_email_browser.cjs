const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://vinhmath.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="services-content"></main>'}));
  await page.goto('https://vinhmath.test/');
  await page.evaluate(()=>{
   window.fixture={teachers:[{id:'teacher',role:'teacher',full_name:'Cô Thử nghiệm',email:'teacher@example.test'}],classroom:[],vmtools:[],payments:[],vmPayments:[],devices:[],emailRequests:[]};window.configured=false;
   window.sb={functions:{invoke:async(name,{body})=>{if(body.action==='list')return {data:window.fixture};if(body.action==='link'){if(!window.configured)return {data:{error:'Chưa cấu hình dịch vụ gửi email xác nhận. Chưa có liên kết nào được tạo.'}};window.fixture.emailRequests=[{user_id:'teacher',email:body.email,status:'sent',expires_at:new Date(Date.now()+1800000).toISOString()}];return {data:{pending:true,email:body.email}};}if(body.action==='link-cancel'){window.fixture.emailRequests[0].status='cancelled';return {data:{ok:true}};}throw Error('Unexpected request');}}};
  });
  await page.addScriptTag({path:path.resolve('js/teacher-services.js')});
  await page.getByRole('button',{name:'Liên kết email',exact:true}).click();
  assert.equal(await page.locator('dialog input[name=email]').inputValue(),'teacher@example.test');
  await page.getByRole('button',{name:'Gửi thư xác nhận',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Chưa cấu hình'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Gửi thư xác nhận',exact:true}).isEnabled(),true);
  await page.evaluate(()=>window.configured=true);
  await page.getByRole('button',{name:'Gửi thư xác nhận',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Đã gửi thư xác nhận'}).waitFor();
  assert.equal(await page.locator('[data-service=vmtools] .service-badge').innerText(),'Chờ xác nhận email');
  await page.locator('dialog [data-cancel]').click();
  await page.getByRole('button',{name:'Liên kết email',exact:true}).click();
  await page.getByRole('button',{name:'Hủy yêu cầu liên kết'}).click();
  await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('[data-service=vmtools] .service-badge').innerText(),'Đã hủy xác nhận');
  const preview=await browser.newPage(),actions=[];preview.on('pageerror',e=>errors.push(e.message));
  await preview.route('https://vinhmath.test/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('xac-nhan-email.html','utf8').replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g,'').replace(/<link\b[^>]*>/g,'')}));
  await preview.route('https://server.test/**',r=>{actions.push(r.request().postDataJSON().action);return r.fulfill({contentType:'application/json',body:JSON.stringify(actions.at(-1)==='preview'?{email:'teacher@example.test',name:'Cô Thử nghiệm'}:{ok:true})});});
  await preview.goto('https://vinhmath.test/xac-nhan-email#'+'a'.repeat(64));
  await preview.evaluate(()=>window.VINHMATH_CONFIG={SUPABASE_URL:'https://server.test',SUPABASE_ANON_KEY:'public-test-key'});
  await preview.addScriptTag({path:path.resolve('js/email-confirm.js')});
  await preview.locator('#email-confirm').waitFor({state:'visible'});assert.deepEqual(actions,['preview']);assert.equal(new URL(preview.url()).hash,'');
  await preview.locator('#email-confirm').click();await preview.locator('#email-message').filter({hasText:'Đã xác nhận'}).waitFor();assert.deepEqual(actions,['preview','confirm']);assert.equal(await preview.locator('#email-confirm').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS browser: send failure visible, pending state, cancel request, preview does not confirm, explicit confirmation, token removed from address');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
