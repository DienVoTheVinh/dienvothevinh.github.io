const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  let requestHeaders,requests=0;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/upload'){
      requests++;requestHeaders=req.headers;req.resume();req.on('end',()=>setTimeout(()=>{
        res.writeHead(url.searchParams.has('fail')?413:200,{'Content-Type':'application/json'});
        res.end(JSON.stringify(url.searchParams.has('reject')?{error:'Tệp bị từ chối'}:{ok:true}));
      },600));return;
    }
    if(url.pathname==='/download'){
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':524288});
      let count=0;const timer=setInterval(()=>{res.write(Buffer.alloc(65536,3));if(++count===8){clearInterval(timer);res.end();}},65);res.on('close',()=>clearInterval(timer));return;
    }
    const file=path.join(root,url.pathname==='/'?'scripts/fixtures/media-progress.html':url.pathname.slice(1));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.getByRole('button',{name:'Thử tải tệp',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.vm-progress-item[data-state=working] progress')?.value===90);
    assert.match(await page.locator('.vm-progress-item').first().innerText(),/90%[\s\S]*chờ máy chủ/);
    await page.waitForFunction(()=>document.querySelector('.vm-progress-item[data-state=done] progress')?.value===100);
    assert.equal(requestHeaders['x-fixture'],'safe');assert.match(requestHeaders['content-type'],/^multipart\/form-data; boundary=/);
    await page.getByRole('button',{name:'Thử nhận tệp',exact:true}).click();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.vm-progress-item[data-state=working] progress')).some(e=>e.value>0&&e.value<99));
    await page.waitForFunction(()=>!document.querySelector('.vm-progress-item[data-state=working]'));
    await page.getByRole('button',{name:'Mở cửa sổ thử'}).click();
    await page.getByRole('button',{name:'Thử tải trong cửa sổ'}).click();
    await page.waitForFunction(()=>document.querySelector('#vm-transfer-progress:popover-open'));
    await page.waitForFunction(()=>document.querySelector('.vm-progress-item[data-state=working] progress')?.value===90);
    assert(await page.evaluate(()=>{const box=document.getElementById('vm-transfer-progress').getBoundingClientRect();return !!document.elementFromPoint(box.x+20,box.bottom-30)?.closest('#vm-transfer-progress');}),'Progress must be above native dialogs');
    await page.getByRole('button',{name:'Đóng',exact:true}).click();
    const edge=await page.evaluate(async()=>{
      const fd=new FormData();fd.append('file',new Blob(['safe fixture']),'file.pdf');
      let r=await fetch('/upload?fail=1',{method:'POST',body:fd});const status=r.status;
      r=await fetch('/upload?reject=1',{method:'POST',body:fd});await r.json();
      let aborted=false;const controller=new AbortController(),pending=fetch('/upload',{method:'POST',body:fd,signal:controller.signal});controller.abort();try{await pending;}catch(e){aborted=e.name==='AbortError';}
      const reader=new FileReader();const text=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(new Blob(['Nội dung tiếng Việt']));});
      const blobText=await new Blob(['Ngày nộp bài']).text(),buffer=await new Blob(['123']).arrayBuffer();
      await VMProgress.run('Dựng ảnh',async task=>{task.update(25,'Bước giải mã');const canvas=document.createElement('canvas');canvas.width=canvas.height=40;await new Promise(resolve=>canvas.toBlob(resolve));});
      return {status,aborted,text,blobText,size:buffer.byteLength};
    });
    assert.deepEqual(edge,{status:413,aborted:true,text:'Nội dung tiếng Việt',blobText:'Ngày nộp bài',size:3});
    await page.waitForFunction(()=>document.querySelectorAll('.vm-progress-item[data-state=error]').length>=3);
    assert(await page.locator('.vm-progress-item[data-state=error] progress').evaluateAll(nodes=>nodes.every(n=>n.value<100)));
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Đổi nền sáng/tối'}).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.locator('.vm-progress-item').last().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
    assert.deepEqual(errors,[]);
    for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const text=fs.readFileSync(path.join(root,file),'utf8');if(text.includes('src="js/vinhmath.js'))assert(text.indexOf('src="js/vm-progress.js')<text.indexOf('src="js/vinhmath.js'),file);}
    for(const file of ['vmtool.html','vmtools/index.html','vmtools/web-entry.html','vmtools/private-image-review.html'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('js/vm-progress.js'),file);
    console.log('PASS shared progress: real multipart/headers, server acknowledgement, streamed byte download, HTTP/API errors, abort, UTF-8 reads, image encoding, top-layer dialog, mobile/themes, all shared role pages');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
