(function(){
  'use strict';
  function el(id){return document.getElementById(id);}
  function local(value){ if(!value)return ''; var d=new Date(value); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  function init(){
    var duration=el('bhTestDuration'); if(!duration||el('bhTestMode'))return;
    duration.max='1440';
    var box=document.createElement('section'); box.className='field';
    box.style.cssText='padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);margin-bottom:16px';
    box.innerHTML='<label for="bhTestMode">Cách tổ chức kiểm tra</label><select class="input" id="bhTestMode"><option value="scheduled">Theo lịch chung — mở và đóng đúng giờ</option><option value="flexible">Linh động — tính giờ riêng từ khi học sinh bắt đầu</option><option value="legacy">Thủ công — giữ cơ chế cũ</option></select><div id="bhTestOpenField" class="field" style="margin-top:12px"><label for="bhTestOpen">Giờ mở đề</label><input class="input" type="datetime-local" id="bhTestOpen"></div><p id="bhTestModeHelp" style="font-size:.85rem;color:var(--ink-2);margin-bottom:0"></p>';
    duration.closest('.field').before(box);
    if(!el('bhTestDue')) {var due=document.createElement('div');due.className='field';due.innerHTML='<label for="bhTestDue">Giờ đóng đề</label><input class="input" type="datetime-local" id="bhTestDue">';box.after(due);}
    el('bhTestMode').addEventListener('change',sync); load(null);
  }
  function sync(){
    var mode=el('bhTestMode').value, scheduled=mode==='scheduled';
    el('bhTestOpenField').hidden=!scheduled; el('bhTestOpen').required=scheduled;
    el('bhTestDue').closest('.field').hidden=mode==='flexible'; el('bhTestDue').required=scheduled;
    var duration=el('bhTestDuration');duration.closest('.field').hidden=scheduled;
    var hint=duration.parentElement.querySelector('small');if(hint)hint.textContent=mode==='flexible'?'Mỗi học sinh có đồng hồ riêng; tải lại trang không bắt đầu lại.':'Chỉ bắt đầu đếm khi giáo viên kích hoạt ca thủ công.';
    var dueHint=el('bhTestDue').parentElement.querySelector('small');if(dueHint)dueHint.textContent=scheduled?'Đề tự đóng đúng giờ; tệp đã đăng ký gửi trước hạn được tiếp tục tải.':'Giữ nguyên cơ chế cũ cho bài kiểm tra thủ công.';
    var label=el('bhTestDue').parentElement.querySelector('label');if(label)label.textContent=scheduled?'Giờ đóng đề':'Hạn đóng đề thủ công (không bắt buộc)';
    if(el('bhTestLate'))el('bhTestLate').parentElement.hidden=mode!=='legacy';
    el('bhTestModeHelp').textContent=scheduled?'Học sinh cùng dùng một lịch. Không cần bấm Mở test hay Khóa.':mode==='flexible'?'Bấm Bắt đầu kiểm tra để xem đề và chạy đồng hồ. Phiên làm bài được lưu trên máy chủ.':'Dành cho bài kiểm tra cũ hoặc khi cần giáo viên mở/đóng trực tiếp.';
  }
  function load(lesson){
    if(!el('bhTestMode'))return;
    el('bhTestMode').value=lesson?(lesson.test_mode||'legacy'):'flexible';
    el('bhTestOpen').value=local(lesson&&lesson.test_opens_at);
    el('bhTestDue').value=local(lesson&&lesson.test_deadline); sync();
  }
  function collect(data){
    var mode=el('bhTestMode').value;
    data.test_mode=mode;data.test_opens_at=mode==='scheduled'&&el('bhTestOpen').value?new Date(el('bhTestOpen').value).toISOString():null;
    data.test_deadline=mode==='flexible'?null:(el('bhTestDue').value?new Date(el('bhTestDue').value).toISOString():null);
    if(mode==='scheduled'&&(!data.test_opens_at||!data.test_deadline||data.test_deadline<=data.test_opens_at))throw new Error('Giờ đóng đề phải sau giờ mở đề.');
    if(mode==='flexible'&&(!Number.isInteger(data.test_duration_minutes)||data.test_duration_minutes<1||data.test_duration_minutes>1440))throw new Error('Thời lượng từ 1 đến 1440 phút.');
    if(mode!=='legacy'){
      var hasContent=!!(data.test_document_id||data.test_latex_content||(el('bhTestFile')&&el('bhTestFile').files.length)||(el('bhTestUrl')&&el('bhTestUrl').value.trim())||(window.pdfBlobTest));
      data.test_started_at=null;data.test_active=mode==='flexible'&&hasContent;data.test_late_policy='lock';
    }
    return data;
  }
  window.VMTestEditor={load:load,collect:collect};init();
})();
