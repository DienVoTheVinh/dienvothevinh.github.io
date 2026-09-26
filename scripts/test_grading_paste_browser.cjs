const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'../quan-tri-cham-bai.html'),'utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.VM_CHROME_PATH});
  try{
    const page=await browser.newPage();
    const fragments=source.split('\n').filter(line=>line.includes("s.id +") && (line.includes('Chọn ảnh / PDF từ máy') || line.includes('id="stagezone-') || line.includes('id="filecham-')));
    assert.equal(fragments.length,3);
    let html='';
    for(const id of ['first','second']) html+='<div id="sub-'+id+'">'+fragments.map(line=>Function('s','return '+line.trim().replace(/\+\s*$/,''))({id})).join('')+'</div>';
    html+=source.match(/<button[^\n]+dapAnFiles[^\n]+\n\s*<div class="chb-answer-drop"[\s\S]+?<input type="file" id="dapAnFiles"[^>]+>/)[0];
    await page.setContent(html);
    await page.evaluate(()=>{window.$=id=>document.getElementById(id);window.received=[];window.chamThemFile=(id,files)=>received.push({id,count:files.length});window.dapAnThemFile=files=>received.push({id:'shared',count:files.length});});
    await page.addScriptTag({content:source.match(/window.addEventListener\('paste', function \(e\) \{[\s\S]+?\n\}\);/)[0]});
    await page.addScriptTag({content:source.match(/document.addEventListener\('paste', function \(event\) \{[\s\S]+?\n\}\);/)[0]});
    let chooserCount=0;page.on('filechooser',()=>chooserCount++);
    for(const selector of ['#stagezone-first','#stagezone-second','#dapAnDrop']){
      await page.locator(selector).click();
      await page.evaluate(()=>{var data=new DataTransfer();data.items.add(new File(['fixture'],'image.png',{type:'image/png'}));document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    }
    assert.equal(chooserCount,0,'Paste targets must never open the native picker');
    assert.deepEqual(await page.evaluate(()=>received),[{id:'first',count:1},{id:'second',count:1},{id:'shared',count:1}]);
    const chooser=page.waitForEvent('filechooser');
    await page.locator('#sub-second').getByRole('button',{name:'Chọn ảnh / PDF từ máy'}).click();
    await (await chooser).setFiles({name:'feedback.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
    assert.equal(chooserCount,1);
    assert.deepEqual((await page.evaluate(()=>received)).at(-1),{id:'second',count:1});
    console.log('PASS independent paste/pick controls: correct submission target and shared answers');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
