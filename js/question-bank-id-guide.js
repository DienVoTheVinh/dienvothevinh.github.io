(function () {
  'use strict';
  var state = { rows:[], grade:'10', query:'', loaded:false, schemas:[] };
  var gradeMap = {'0':'10','1':'11','2':'12'};
  var areaMap = {D:'Đại số / Giải tích',H:'Hình học',C:'Chuyên đề'};
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function normalize(map) {
    return Object.keys(map || {}).map(function (key) {
      var match=/^([012])([A-Z])(\d+)\?(\d+)-(\d+)$/.exec(String(key).toUpperCase()); if(!match)return null;
      var info=map[key]||{}; return {key:key,grade:gradeMap[match[1]],area:match[2],chapter:Number(match[3]),skill:Number(match[4]),variant:Number(match[5]),chapterName:String(info.chap_name||''),lessonName:String(info.lesson_name||''),typeName:String(info.type_name||'')};
    }).filter(Boolean).sort(function(a,b){return a.key.localeCompare(b.key,'vi',{numeric:true});});
  }
  function render() {
    var host=document.getElementById('bankIdReferenceTable'),status=document.getElementById('bankIdReferenceStatus'); if(!host)return;
    var query=state.query.toLocaleLowerCase('vi');
    var rows=state.rows.filter(function(row){return row.grade===state.grade&&(!query||[row.key,row.chapterName,row.lessonName,row.typeName,areaMap[row.area]].join(' ').toLocaleLowerCase('vi').includes(query));});
    if(status)status.textContent=state.loaded?rows.length.toLocaleString('vi-VN')+' / '+state.rows.filter(function(r){return r.grade===state.grade;}).length.toLocaleString('vi-VN')+' họ mã khối '+state.grade:'Đang tải ma trận gốc…';
    host.innerHTML=rows.length?'<table><thead><tr><th>Họ mã</th><th>Ví dụ ID</th><th>Mảng / chương</th><th>Bài / kỹ năng</th><th>Dạng toán</th></tr></thead><tbody>'+rows.map(function(row){return '<tr><td><code>'+esc(row.key)+'</code></td><td><code>'+esc(row.key.replace('?','H'))+'</code></td><td><b>'+esc(areaMap[row.area]||row.area)+'</b><small>'+esc(row.chapterName)+'</small></td><td><b>'+esc(row.lessonName)+'</b><small>Kỹ năng '+row.skill+'</small></td><td>'+esc(row.typeName)+'</td></tr>';}).join('')+'</tbody></table>':'<div class="bank-id-reference-empty">Không có mã phù hợp bộ lọc.</div>';
  }
  async function load() {
    if(state.loaded){render();return;} var status=document.getElementById('bankIdReferenceStatus'); if(status)status.textContent='Đang tải 530 họ mã từ id_map gốc…';
    try{var response=await fetch('NganHang/NganHangTHPT1.3/id_map.json',{cache:'force-cache'});if(!response.ok)throw new Error('HTTP '+response.status);state.rows=normalize(await response.json());state.loaded=true;render();}
    catch(error){if(status)status.textContent='Chưa tải được ma trận ID. Hãy tải lại trang rồi thử lại.';}
  }
  function schemaForm(){
    var codes={};try{codes=JSON.parse(String((document.getElementById('bankIdMapCodes')||{}).value||'{}'));}catch(_){return null;}
    return {name:String((document.getElementById('bankIdMapSchema')||{}).value||'').trim().toLowerCase(),order:String((document.getElementById('bankIdMapOrder')||{}).value||'').split(',').map(function(part){return part.trim().toLowerCase();}).filter(Boolean),codes:codes,separators:{default:String((document.getElementById('bankIdMapSeparator')||{}).value||''),variant:String((document.getElementById('bankIdMapVariantSeparator')||{}).value||'-')}};
  }
  function generatedMapping(parsed,form){
    if(!parsed||!form||form.order.length!==6)return '';
    var values={grade:String(parsed.grade_code),area:String(parsed.area),chapter:String(parsed.chapter),difficulty:String(parsed.difficulty_code),skill:String(parsed.skill),variant:String(parsed.variant)};
    return form.order.map(function(segment,index){var raw=values[segment],map=form.codes&&form.codes[segment]||{},semantic=segment==='difficulty'?parsed.difficulty:null,mapped=Object.prototype.hasOwnProperty.call(map,raw)?map[raw]:(semantic&&Object.prototype.hasOwnProperty.call(map,semantic)?map[semantic]:raw),separator=index===0?'':(segment==='variant'?form.separators.variant:form.separators.default);return separator+String(mapped==null?'':mapped);}).join('');
  }
  function previewMapping(){
    var oldId=String((document.getElementById('bankIdMapOld')||{}).value||'').trim().toUpperCase(),newId=String((document.getElementById('bankIdMapNew')||{}).value||'').trim().toUpperCase(),schema=String((document.getElementById('bankIdMapSchema')||{}).value||'').trim().toLowerCase(),out=document.getElementById('bankIdMapOutput');
    var parsed=window.VinhMathQuestionBank&&window.VinhMathQuestionBank.parseQuestionId(oldId);if(!out)return;
    if(!parsed||!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(schema)){out.textContent='Cần một ID gốc hợp lệ và tên phiên bản 3–32 ký tự.';out.classList.remove('ready');return '';}
    if(!newId)newId=generatedMapping(parsed,schemaForm());
    if(!newId){out.textContent='Chưa thể sinh mã mới. Kiểm tra đủ 6 phần và JSON đổi mã.';out.classList.remove('ready');return '';}
    out.dataset.mappedCode=newId;out.textContent='Xem trước: legacy-v1:'+oldId+' → '+schema+':'+newId+'. UID QB và mã gốc vẫn giữ nguyên.';out.classList.add('ready');return newId;
  }
  function rpc(name,args){if(!window.sb||typeof window.sb.rpc!=='function')return Promise.reject(new Error('Chưa kết nối máy chủ.'));return window.sb.rpc(name,args||{}).then(function(result){if(result.error)throw result.error;return result.data;});}
  async function saveSchema(){
    var out=document.getElementById('bankIdMapOutput'),name=String((document.getElementById('bankIdMapSchema')||{}).value||'').trim().toLowerCase();
    var order=String((document.getElementById('bankIdMapOrder')||{}).value||'').split(',').map(function(part){return part.trim().toLowerCase();}).filter(Boolean);
    var codes;try{codes=JSON.parse(String((document.getElementById('bankIdMapCodes')||{}).value||'{}'));}catch(_){if(out)out.textContent='Bảng đổi mã phải là JSON hợp lệ.';return;}
    if(out)out.textContent='Đang lưu chuẩn '+name+'…';
    try{await rpc('vm_bank_admin_save_id_schema',{p_schema:{schema_name:name,label:name,segment_order:order,segment_codes:codes,separators:{default:String((document.getElementById('bankIdMapSeparator')||{}).value||''),variant:String((document.getElementById('bankIdMapVariantSeparator')||{}).value||'-')},is_active:true}});await loadSchemas(true);if(out){out.textContent='Đã lưu chuẩn '+name+'. Chuẩn legacy-v1 vẫn được khóa và giữ nguyên.';out.classList.add('ready');}}
    catch(error){if(out){out.textContent='Chưa lưu được chuẩn: '+String(error.message||error);out.classList.remove('ready');}}
  }
  async function saveAlias(){
    var mapped=previewMapping(),out=document.getElementById('bankIdMapOutput');if(!out||!out.classList.contains('ready')||!mapped)return;
    var oldId=String((document.getElementById('bankIdMapOld')||{}).value||'').trim().toUpperCase(),newId=String((document.getElementById('bankIdMapNew')||{}).value||'').trim()||mapped,schema=String((document.getElementById('bankIdMapSchema')||{}).value||'').trim().toLowerCase();
    out.textContent='Đang lưu ánh xạ…';
    try{await rpc('vm_bank_admin_upsert_id_alias',{p_schema_name:schema,p_legacy_code:oldId,p_mapped_code:newId});out.textContent='Đã lưu: legacy-v1:'+oldId+' → '+schema+':'+newId+'. UID và mã gốc không thay đổi.';out.classList.add('ready');}
    catch(error){out.textContent='Chưa lưu được ánh xạ: '+String(error.message||error);out.classList.remove('ready');}
  }
  async function loadSchemas(force){
    if(state.schemas.length&&!force)return;try{var data=await rpc('vm_bank_admin_id_schemas');state.schemas=Array.isArray(data&&data.schemas)?data.schemas:[];var list=document.getElementById('bankIdSchemaNames');if(list)list.innerHTML=state.schemas.filter(function(schema){return !schema.is_locked;}).map(function(schema){return '<option value="'+esc(schema.schema_name)+'">'+esc(schema.label||schema.schema_name)+'</option>';}).join('');}catch(_){}
  }
  function useSavedSchema(){
    var name=String((document.getElementById('bankIdMapSchema')||{}).value||'').trim().toLowerCase(),schema=state.schemas.find(function(item){return item.schema_name===name;});if(!schema||schema.is_locked)return;
    document.getElementById('bankIdMapOrder').value=(schema.segment_order||[]).join(',');document.getElementById('bankIdMapCodes').value=JSON.stringify(schema.segment_codes||{});document.getElementById('bankIdMapSeparator').value=String(schema.separators&&schema.separators.default||'');document.getElementById('bankIdMapVariantSeparator').value=String(schema.separators&&schema.separators.variant||'-');previewMapping();
  }
  document.addEventListener('DOMContentLoaded',function(){
    var details=document.getElementById('bankUsageGuide'),button=document.getElementById('bankIdReferenceLoad'),search=document.getElementById('bankIdReferenceSearch');
    if(details)details.addEventListener('toggle',function(){if(details.open){load();loadSchemas(false);}});if(button)button.addEventListener('click',load);if(search)search.addEventListener('input',function(){state.query=search.value.trim();render();});
    document.querySelectorAll('.bank-id-grade-tabs [data-grade]').forEach(function(item){item.addEventListener('click',function(){state.grade=item.getAttribute('data-grade');document.querySelectorAll('.bank-id-grade-tabs [data-grade]').forEach(function(tab){tab.classList.toggle('active',tab===item);});render();});});
    var preview=document.getElementById('bankIdMapPreview');if(preview)preview.addEventListener('click',previewMapping);
    var schemaName=document.getElementById('bankIdMapSchema');if(schemaName)schemaName.addEventListener('change',useSavedSchema);
    var schemaSave=document.getElementById('bankIdSchemaSave'),aliasSave=document.getElementById('bankIdAliasSave');if(schemaSave)schemaSave.addEventListener('click',saveSchema);if(aliasSave)aliasSave.addEventListener('click',saveAlias);
  });
})();
