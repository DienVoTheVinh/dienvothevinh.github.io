'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.VM_CHROME_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('VM_CHROME_PATH must point to Chrome');
  const html = fs.readFileSync('quan-tri-de.html','utf8');
  const body = html.match(/<body>([\s\S]*?)<script/)[1];
  const css = ['css/tokens.css','css/vinhmath.css','css/exam-admin.css']
    .map((file) => fs.readFileSync(file,'utf8')).join('\n');
  const browser = await chromium.launch({executablePath,headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1500,height:900}});
    await page.route('http://vinhmath.test/**', (route) => route.fulfill({
      status:200,
      contentType:'text/html',
      body:`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
    }));
    await page.goto('http://vinhmath.test/quan-tri-de?tab=bank#bank-overview');
    await page.addScriptTag({path:'js/question-bank.js'});
    await page.addScriptTag({path:'js/latex-view.js'});
    await page.addScriptTag({path:'js/exam-admin.js'});
    await page.evaluate(() => {
      window.confirm = () => true;
      window.fetch = async () => ({ok:true,text:async () => '\\ProvidesPackage{ex_test}\\newenvironment{ex}{}{}\\newcommand{\\choice}[4]{}\\newcommand{\\loigiai}[1]{}'});
      window.__rpcCalls = [];
      window.__compileCalls = [];
      window.__createdObjectUrls = [];
      window.__revokedObjectUrls = [];
      window.URL.createObjectURL = () => {
        const value = `blob:vinhmath-preview-${window.__createdObjectUrls.length + 1}`;
        window.__createdObjectUrls.push(value);
        return value;
      };
      window.URL.revokeObjectURL = (value) => window.__revokedObjectUrls.push(value);
      window.sb = {
        rpc: async (name,args) => {
          window.__rpcCalls.push({name,args});
          if (name === 'vm_bank_admin_taxonomy_catalog') return {data:{items:[]},error:null};
          if (name === 'vm_bank_search') return {data:{total:1,items:[{
            question_type:'true_false',grade:12,difficulty:'TH',content_latex:'Xét các mệnh đề về $f(x)$.',
            choices:[{key:'a',latex:'Mệnh đề một'},{key:'b',latex:'Mệnh đề hai'},{key:'c',latex:'Mệnh đề ba'},{key:'d',latex:'Mệnh đề bốn'}]
          }]},error:null};
          if (name === 'vm_bank_source_exam_preview') return {data:{title:'Đề nguồn an toàn',question_count:2,questions:[
            {sort:1,question_type:'multiple_choice',content_latex:'Giá trị $2^3$ bằng',choices:[{key:'A',latex:'4'},{key:'B',latex:'6'},{key:'C',latex:'8'},{key:'D',latex:'9'}]},
            {sort:2,question_type:'short_answer',content_latex:'Tính $15+27$.',choices:[{key:'short',latex:''}]}
          ]},error:null};
          if (name === 'vm_bank_exam_preview') return {data:{title:'Đề vừa tạo',question_count:1,questions:[
            {sort:1,question_type:'multiple_choice',content_latex:'Nghiệm của $x=1$ là',choices:[{key:'A',latex:'1'},{key:'B',latex:'2'},{key:'C',latex:'3'},{key:'D',latex:'4'}]}
          ]},error:null};
          return {data:null,error:{code:'PGRST202',message:'unexpected '+name}};
        },
        functions:{invoke:async (name,args) => {
          window.__compileCalls.push({name,tex:args.body.tex});
          return {data:new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),error:null};
        }}
      };
      window.VMExamAdmin._bankConfigureAccess({role:'admin'});
      window.VMExamAdmin.switchTab('bank');
    });

    const localTex = String.raw`\begin{ex}%[2D1H3-HAM-SO]
Giá trị của $2^3$ bằng
\choice{$4$}{$6$}{\True $8$}{$9$}
\loigiai{$2^3=8$.}
\end{ex}`;
    await page.evaluate(async (source) => {
      const file = new File([source],'de-local.tex',{type:'text/x-tex'});
      await window.VMExamAdmin.bankSelectFiles([file]);
      document.getElementById('exTitle').value = 'Bản soạn không được đổi';
      document.getElementById('exLatex').value = '\\begin{ex}Nội dung riêng\\end{ex}';
      window.VMExamAdmin.bankOpenLocalPreview(0);
    },localTex);
    const local = await page.evaluate(() => ({
      open:document.getElementById('bankPreviewDialog').open,
      html:document.getElementById('bankPreviewHtml').textContent,
      editable:!document.getElementById('bankPreviewToEditor').hidden,
      editor:document.getElementById('exLatex').value,
      items:window.VMExamAdmin._bankState.items.length,
      access:window.VMExamAdmin._bankState.access
    }));
    if (!local.open || !local.html.includes('Giá trị của') || !local.html.includes('Lời giải') || !local.editable) {
      throw new Error(`Local instant preview failed: ${JSON.stringify(local)}`);
    }
    await page.evaluate(() => window.VMExamAdmin.bankCompilePreviewPdf());
    await page.waitForSelector('#bankPreviewPdf iframe');
    const compiled = await page.evaluate(() => ({
      editor:document.getElementById('exLatex').value,
      title:document.getElementById('exTitle').value,
      download:!document.getElementById('bankPreviewDownload').hidden,
      href:document.getElementById('bankPreviewDownload').getAttribute('href'),
      calls:window.__compileCalls.length,
      tex:window.__compileCalls[0] && window.__compileCalls[0].tex
    }));
    if (compiled.editor !== '\\begin{ex}Nội dung riêng\\end{ex}' || compiled.title !== 'Bản soạn không được đổi' || !compiled.download || compiled.calls !== 1 || !compiled.tex.includes('Giá trị của')) {
      throw new Error(`Bank PDF changed editor state: ${JSON.stringify(compiled)}`);
    }

    await page.evaluate(() => { window.VMExamAdmin.bankClosePreview(); });
    const cleanup = await page.evaluate(() => ({
      revoked:window.__revokedObjectUrls.slice(),
      hidden:document.getElementById('bankPreviewDownload').hidden,
      href:document.getElementById('bankPreviewDownload').getAttribute('href')
    }));
    if (!cleanup.revoked.includes(compiled.href) || !cleanup.hidden || cleanup.href) throw new Error(`Bank preview Blob URL was not revoked: ${JSON.stringify(cleanup)}`);
    await page.evaluate(async () => {
      window.VMExamAdmin.bankSetView('manage',{history:'replace',scroll:false});
      await window.VMExamAdmin.bankSearch({preventDefault(){}});
    });
    await page.click('[data-bank-search-preview="0"]');
    const teacherSafe = await page.evaluate(() => ({
      html:document.getElementById('bankPreviewHtml').textContent,
      source:window.VMExamAdmin._bankState.preview.questions,
      editable:!document.getElementById('bankPreviewToEditor').hidden
    }));
    if (/ĐÚNG|SAI|Lời giải/.test(teacherSafe.html) || !teacherSafe.editable || /correct|solution|answer|\\True/i.test(JSON.stringify(teacherSafe.source))) {
      throw new Error(`Sanitized TF preview leaked answers: ${JSON.stringify(teacherSafe)}`);
    }
    await page.click('#bankPreviewToEditor');
    const openedInEditor = await page.evaluate(() => ({
      dialog:document.getElementById('bankPreviewDialog').open,
      compose:document.getElementById('panel-compose').classList.contains('active'),
      source:document.getElementById('exLatex').value
    }));
    if (openedInEditor.dialog || !openedInEditor.compose || !openedInEditor.source.includes('Xét các mệnh đề') || /\\True|\\loigiai/.test(openedInEditor.source)) {
      throw new Error(`Safe preview did not open in authoring correctly: ${JSON.stringify(openedInEditor)}`);
    }

    await page.evaluate(() => {
      window.VMExamAdmin._bankConfigureAccess({role:'teacher'});
      window.VMExamAdmin.bankOpenSearchPreview(0);
    });
    const teacherPreview = await page.evaluate(() => ({
      editable:!document.getElementById('bankPreviewToEditor').hidden,
      admin:window.VMExamAdmin._bankState.access.canAdmin,
      html:document.getElementById('bankPreviewHtml').textContent
    }));
    if (teacherPreview.admin || teacherPreview.editable || !teacherPreview.html.includes('Xét các mệnh đề')) {
      throw new Error(`Teacher preview exposed authoring handoff: ${JSON.stringify(teacherPreview)}`);
    }
    await page.evaluate(() => {
      window.VMExamAdmin.bankClosePreview();
      window.VMExamAdmin._bankConfigureAccess({role:'teacher'});
    });

    await page.evaluate(() => window.VMExamAdmin.bankOpenSourcePreview('source-1'));
    await page.waitForFunction(() => document.getElementById('bankPreviewStatus').textContent.includes('2 câu'));
    const sourcePreview = await page.evaluate(() => ({
      title:document.getElementById('bankPreviewTitle').textContent,
      html:document.getElementById('bankPreviewHtml').textContent,
      rpc:window.__rpcCalls.find((call) => call.name === 'vm_bank_source_exam_preview')
    }));
    if (sourcePreview.title !== 'Đề nguồn an toàn' || !sourcePreview.html.includes('15+27') || !sourcePreview.rpc) throw new Error(`Source preview failed: ${JSON.stringify(sourcePreview)}`);

    await page.evaluate(() => window.VMExamAdmin.bankOpenExamPreview('exam-1'));
    await page.waitForFunction(() => document.getElementById('bankPreviewTitle').textContent === 'Đề vừa tạo');
    const generatedPreview = await page.evaluate(() => ({
      html:document.getElementById('bankPreviewHtml').textContent,
      rpc:window.__rpcCalls.find((call) => call.name === 'vm_bank_exam_preview')
    }));
    if (!generatedPreview.html.includes('Nghiệm của') || !generatedPreview.rpc) throw new Error(`Generated preview failed: ${JSON.stringify(generatedPreview)}`);

    await page.evaluate(() => {
      window.VMExamAdmin.bankClosePreview();
      window.VMExamAdmin._bankConfigureAccess({role:'admin'});
      window.VMExamAdmin.switchTab('compose');
      document.getElementById('exTitle').value = 'Đề liên kết hai chiều';
      document.getElementById('exLatex').value = String.raw`\begin{ex}Câu chuyển sang kho\choice{1}{2}{\True 3}{4}\end{ex}`;
      window.VMExamAdmin.bankImportEditorSource();
    });
    const linked = await page.evaluate(() => ({
      bankActive:document.getElementById('panel-bank').classList.contains('active'),
      count:window.VMExamAdmin._bankState.items.length,
      title:document.getElementById('bankImportTitle').value
    }));
    if (!linked.bankActive || linked.count !== 1 || linked.title !== 'Đề liên kết hai chiều') throw new Error(`Editor-to-bank link failed: ${JSON.stringify(linked)}`);

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => window.VMExamAdmin.bankOpenLocalPreview(0));
    const mobile = await page.evaluate(() => ({
      width:document.getElementById('bankPreviewDialog').getBoundingClientRect().width,
      viewport:innerWidth,
      overflow:document.documentElement.scrollWidth > innerWidth + 1
    }));
    if (Math.abs(mobile.width-mobile.viewport)>1 || mobile.overflow) throw new Error(`Mobile preview overflow: ${JSON.stringify(mobile)}`);

    console.log('PASS linked question-bank HTML/PDF previews, security, editor handoff and mobile layout');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
