import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
import {VM_FEATURES} from '../_shared/vmtools-access.ts';
import {TRIAL_FEATURES} from '../_shared/vmtools-trial.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function query(q:any){const {data,error}=await q;if(error)throw Error(error.message);return data;}
const fail=(message:string):never=>{throw Error(message);};
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&['https://vinhmath.com','https://www.vinhmath.com'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 try{
  if(origin&&!headers['Access-Control-Allow-Origin'])fail('Nguồn truy cập không hợp lệ');
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  const {data,error}=await db.auth.getUser(token);if(error||!data.user)return Response.json({error:'Cần đăng nhập'},{status:401,headers});
  const user=data.user,profile=await query(db.from('profiles').select('role').eq('id',user.id).single());if(profile.role!=='admin')return Response.json({error:'Chỉ quản trị được truy cập'},{status:403,headers});
  const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
  if(!await query(db.rpc('vmtools_auth_session',{p_user:user.id,p_session:claims.session_id})))fail('Phiên đăng nhập đã kết thúc');
  const raw=await req.text();if(raw.length>16000)fail('Yêu cầu quá lớn');const p=JSON.parse(raw);
  if(['experience-get','experience-save'].includes(p.action)){
   const owner=await query(db.from('vmtools_accounts').select('id').eq('auth_user_id',user.id).eq('role','owner').eq('status','active').maybeSingle());if(!owner)fail('Chỉ chủ sở hữu được mở trải nghiệm');
   if(p.action==='experience-save'){
    if(!['closed','teachers','everyone'].includes(p.audience)||!Array.isArray(p.features)||p.features.some((f:any)=>!TRIAL_FEATURES.includes(f))||p.audience!=='closed'&&!p.features.length)fail('Chọn đối tượng và ít nhất một tính năng');
    await query(db.from('vmtools_web_experience').update({audience:p.audience,features:[...new Set(p.features)],updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',1));
    await query(db.from('vmtools_audit').insert({actor:owner.id,action:'web-experience',details:{audience:p.audience,features:p.features}}));
   }
   return Response.json({policy:await query(db.from('vmtools_web_experience').select('audience,features,updated_at').eq('id',1).single())},{headers});
  }
  if(p.action==='list'){
   const [teachers,classroom,vmtools,payments,vmPayments]=await Promise.all([
    query(db.from('profiles').select('id,full_name,username,email').eq('role','teacher').order('full_name').limit(2000)),
    query(db.from('teacher_service_accounts').select('*').limit(2000)),
    query(db.from('vmtools_accounts').select('id,auth_user_id,email,status,plan,paid_until,web_enabled,app_enabled,download_enabled,features,max_devices').eq('role','user').limit(2000)),
    query(db.from('teacher_service_payments').select('id,user_id,plan,amount,note,expires_at,created_at').order('created_at',{ascending:false}).limit(100)),
    query(db.from('vmtools_payments').select('id,account_id,amount,note,paid_until,created_at').order('created_at',{ascending:false}).limit(100))]);
   return Response.json({teachers,classroom,vmtools,payments,vmPayments,classroomEnforced:true},{headers});
  }
  if(!['classroom','vmtools'].includes(p.service))fail('Dịch vụ không hợp lệ');
  const target=await query(db.from('profiles').select('id').eq('id',p.userId).eq('role','teacher').maybeSingle());if(!target)fail('Không tìm thấy giáo viên');
  let owner:any=null,account:any=null;
  if(p.service==='vmtools'){
   owner=await query(db.from('vmtools_accounts').select('id').eq('auth_user_id',user.id).eq('role','owner').eq('status','active').maybeSingle());if(!owner)fail('Chưa có quyền quản trị VMTools');
   account=await query(db.from('vmtools_accounts').select('id').eq('auth_user_id',p.userId).maybeSingle());if(!account&&p.action!=='link')fail('Hãy liên kết email thật trước khi cấp hạn cho tài khoản cũ.');
  }
  if(p.action==='link'){
   if(p.service!=='vmtools'||account)fail('Tài khoản đã liên kết hoặc dịch vụ không hợp lệ');
   const email=String(p.email||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.endsWith('.vinhmath.com'))fail('Nhập email thật của giáo viên');
   await query(db.rpc('vm_teacher_link_email',{p_actor:user.id,p_user:p.userId,p_email:email}));
   return Response.json({ok:true},{headers});
  }
  if(p.action==='permissions'){
   if(p.service!=='vmtools'||!Array.isArray(p.features)||p.features.some((f:any)=>!VM_FEATURES.includes(f))||['appEnabled','webEnabled','downloadEnabled'].some(k=>typeof p[k]!=='boolean'))fail('Quyền sử dụng không hợp lệ');
   await query(db.from('vmtools_accounts').update({app_enabled:p.appEnabled,web_enabled:p.webEnabled,download_enabled:p.downloadEnabled,features:[...new Set(p.features)]}).eq('id',account.id));
   return Response.json({ok:true},{headers});
  }
  if(p.action==='renew'){
   if(p.confirm!==true||!['monthly','yearly','custom','lifetime'].includes(p.plan)||!Number.isInteger(p.units)||p.units<1||p.units>120||!Number.isFinite(p.amount)||p.amount<0||typeof p.note!=='string'||p.note.length>500)fail('Hãy kiểm tra và xác nhận thông tin');
   const args={p_actor:p.service==='vmtools'?owner.id:user.id,p_request:p.requestId,p_plan:p.plan,p_units:p.units,p_until:p.until,p_amount:p.amount,p_note:p.note};
   const expiresAt=await query(db.rpc(p.service==='vmtools'?'vmtools_renew':'teacher_service_renew',{...args,...(p.service==='vmtools'?{p_account:account.id}:{p_user:p.userId})}));return Response.json({ok:true,expiresAt},{headers});
  }
  if(p.action==='status'){
   if(!['active','pending','blocked'].includes(p.status))fail('Trạng thái không hợp lệ');
   if(p.service==='vmtools'){
    const a=await query(db.from('vmtools_accounts').select('*').eq('id',account.id).single());
    await query(db.rpc('vmtools_account_save',{p_actor:owner.id,p_id:a.id,p_name:a.name,p_status:p.status,p_days:a.offline_days,p_devices:a.max_devices,p_features:a.features,p_web:a.web_enabled}));
   }else await query(db.from('teacher_service_accounts').upsert({user_id:p.userId,status:p.status,updated_at:new Date().toISOString()},{onConflict:'user_id'}));
   return Response.json({ok:true},{headers});
  }
  return fail('Thao tác không hợp lệ');
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Chưa xử lý được yêu cầu'},{status:400,headers});}
});
