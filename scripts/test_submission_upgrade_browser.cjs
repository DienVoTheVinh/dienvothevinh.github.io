const fs=require('fs'),assert=require('node:assert/strict'),vm=require('vm');
const {chromium}=require('playwright');
const script=name=>fs.readFileSync('js/'+name+'.js','utf8');
(async()=>{
 for(const file of ['bai-hoc.html','quan-tri-lop.html','quan-tri-bai-hoc.html','quan-tri-bao-cao-hoc-sinh.html','luyen-de.html'])for(const m of fs.readFileSync(file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1],{filename:file});
 const browser=await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
 try{
  const page=await browser.newPage();await page.route('https://fixture.test/**',r=>r.fulfill({body:'<!doctype html><body></body>',contentType:'text/html'}));await page.goto('https://fixture.test');
  await page.evaluate(()=>{
   window.sb={auth:{getSession:async()=>({data:{session:{user:{id:'student'},access_token:'fixture'}}})}};
   window.receipts={};window.active=0;window.peak=0;window.fileCalls=0;window.failIndex=2;window.finishCount=0;
   window.vmGoiHamFormData=async(_,fd)=>{
    const kind=fd.get('kind');
    if(kind==='nop_begin'){const id=fd.get('request_id');receipts[id]||={manifest:JSON.parse(fd.get('manifest')),files:{}};return {upload_id:id,uploaded_files:receipts[id].files};}
    const r=receipts[fd.get('upload_id')];
    if(kind==='nop_file'){const i=Number(fd.get('file_index'));fileCalls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,4));active--;if(i===failIndex)throw Error('Tệp đã thay đổi');r.files[i]={id:'file-'+i};return {};}
    if(kind==='nop_finish'){if(Object.keys(r.files).length!==r.manifest.length)throw Error('Incomplete');finishCount++;return {ok:true};}
   };
  });
  await page.addScriptTag({content:script('submission-upload')});
  const result=await page.evaluate(async()=>{
   const files=Array.from({length:30},(_,i)=>new File(['pdf '+i],i+'.pdf',{type:'application/pdf'}));
   let firstError='';try{await VMSubmissionUpload.upload(files,{lesson_id:'lesson',phanloai:'homework'});}catch(e){firstError=e.message;}
   const kept=Object.values(receipts)[0].files;const keptCount=Object.keys(kept).length, callsBefore=fileCalls;
   failIndex=-1;await VMSubmissionUpload.upload(files,{lesson_id:'lesson',phanloai:'homework'});
   let many=false,large=false,total=false;
   try{await VMSubmissionUpload.upload([...files,files[0]],{});}catch(e){many=/30/.test(e.message);}
   const oversized=new File(['x'],'large.pdf',{type:'application/pdf'});Object.defineProperty(oversized,'size',{value:31*1024*1024});
   try{await VMSubmissionUpload.prepare(oversized);}catch(e){large=/30 MB/.test(e.message);}
   const totals=Array.from({length:30},(_,i)=>{const f=new File(['x'],'x'+i+'.pdf',{type:'application/pdf'});Object.defineProperty(f,'size',{value:21*1024*1024});return f;});
   try{await VMSubmissionUpload.upload(totals,{});}catch(e){total=/600 MB/.test(e.message);}
   return {firstError,peak,keptCount,retried:fileCalls-callsBefore,finishCount,many,large,total};
  });
  assert.match(result.firstError,/Đã giữ/);assert.equal(result.peak,2);assert.ok(result.keptCount>0);assert.equal(result.retried,30-result.keptCount);assert.equal(result.finishCount,1);assert.ok(result.many&&result.large&&result.total);
  const largeQueue=await page.evaluate(async()=>{
   peak=0;const files=Array.from({length:3},(_,i)=>new File([new Uint8Array(9*1024*1024)],'large'+i+'.pdf',{type:'application/pdf'}));
   await VMSubmissionUpload.upload(files,{lesson_id:'large-lesson',phanloai:'homework'});return peak;
  });assert.equal(largeQueue,1);
  await page.setContent('<div class="field"><input id="bhTestDuration" type="number" value="15"><small></small></div><div class="field"><label></label><input id="bhTestDue" type="datetime-local"><small></small><div><select id="bhTestLate"></select></div></div>');
  await page.addScriptTag({content:script('lesson-test-editor')});
  assert.equal(await page.locator('#bhTestMode').inputValue(),'flexible');assert.equal(await page.locator('#bhTestDue').isVisible(),false);
  await page.locator('#bhTestMode').selectOption('scheduled');assert.equal(await page.locator('#bhTestDue').isVisible(),true);assert.equal(await page.locator('#bhTestDuration').isVisible(),false);
  await page.evaluate(()=>VMTestEditor.load({test_mode:'legacy',test_deadline:'2026-10-01T12:00:00Z'}));assert.equal(await page.locator('#bhTestMode').inputValue(),'legacy');
  const modes=await page.evaluate(()=>{VMTestEditor.load({test_mode:'flexible'});const d=VMTestEditor.collect({test_duration_minutes:45});return d;});assert.equal(modes.test_deadline,null);assert.equal(modes.test_late_policy,'lock');
  await page.setContent('<button id="nutLuu"></button>');
  await page.evaluate(()=>{
   window.VINHMATH_CONFIG={SUPABASE_URL:'https://fixture.supabase.co'};window.offset=0;window.lost=false;window.patches=[];
   window.fetch=async(url,options)=>{if(options.method==='POST')return new Response('',{status:201,headers:{Location:'https://fixture.storage.supabase.co/storage/v1/upload/resumable/test'}});if(options.method==='HEAD')return new Response(null,{status:200,headers:{'Upload-Offset':String(offset)}});if(options.method==='PATCH'){patches.push(options.body.size);offset+=options.body.size;if(!lost){lost=true;throw Error('lost response');}return new Response(null,{status:204,headers:{'Upload-Offset':String(offset)}});}};
  });
  await page.addScriptTag({content:script('lesson-file-upload')});
  const tus=await page.evaluate(async()=>{const file=new Blob([new Uint8Array(13*1024*1024)]);const result=await vmUploadLessonFile('tai-lieu','fixture.pdf',file,{contentType:'application/pdf'});return {error:result.error&&result.error.message,offset,patches};});
  assert.equal(tus.error,null);assert.equal(tus.offset,13*1024*1024);assert.deepEqual(tus.patches,[6*1024*1024,6*1024*1024,1024*1024]);
  await page.setContent('<div class="student-result-viewer-content"><section class="student-result-class-answer"><div class="student-result-files"><button class="student-result-file"><img width="100" height="200"></button><button class="student-result-file"><img width="100" height="200"></button></div></section></div>');
  await page.addStyleTag({content:fs.readFileSync('css/student-experience.css','utf8')});
  assert.equal(await page.locator('.student-result-files').evaluate(el=>getComputedStyle(el).flexDirection),'column');
  const boxes=await page.locator('.student-result-file').evaluateAll(els=>els.map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height})));assert.ok(boxes[1].y>=boxes[0].y+boxes[0].h);
  console.log('PASS: 30-file queue, independent retry, limits, modes, resumable PDF, vertical answers, all inline syntax');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
