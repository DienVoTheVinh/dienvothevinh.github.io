// Email linking is an alias, never an Auth account migration.
export const MAIL_NOT_CONFIGURED='Chưa cấu hình dịch vụ gửi email xác nhận. Chưa có liên kết nào được tạo.';
export function mailConfig(env:(name:string)=>string|undefined) {
 const key=env('RESEND_API_KEY'),from=env('VINHMATH_EMAIL_FROM');
 if(!key||!from)throw Error(MAIL_NOT_CONFIGURED);
 return {key,from};
}
export async function tokenHash(token:string) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function checkAuthEmail(db:any,email:string,userId:string) {
 // Use the supported server Admin API. Never grant SELECT on auth.users.
 for(let page=1;page<=100;page++) {
  const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});
  if(error||!Array.isArray(data?.users))throw Error('Chưa kiểm tra được email. Vui lòng thử lại.');
  if(data.users.some((u:any)=>u.id!==userId&&u.email?.toLowerCase()===email))throw Error('Email đã thuộc tài khoản khác');
  if(data.users.length<1000)return;
 }
 throw Error('Chưa kiểm tra được toàn bộ tài khoản. Vui lòng liên hệ quản trị.');
}
export async function requestTeacherEmail(db:any,actor:string,userId:string,email:string,name:string,env:(key:string)=>string|undefined,send=fetch) {
 const config=mailConfig(env);
 await checkAuthEmail(db,email,userId);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const hash=await tokenHash(token);
 const {data:expiresAt,error}=await db.rpc('vm_teacher_email_request',{p_actor:actor,p_user:userId,p_email:email,p_hash:hash});
 if(error)throw Error(error.message);
 const url='https://vinhmath.com/xac-nhan-email#'+token;
 const safeName=String(name||'giáo viên').replace(/[\r\n]/g,' ').slice(0,160);
 try {
  const response=await send('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Idempotency-Key':'teacher-email-'+hash},
   body:JSON.stringify({from:config.from,to:[email],subject:'VinhMath — Xác nhận liên kết email giáo viên',text:`Xin chào ${safeName},\n\nQuản trị VinhMath đề nghị liên kết địa chỉ email này với tài khoản của ${safeName}.\n\nNếu đây là tài khoản của bạn, mở đường dẫn dưới đây rồi bấm Xác nhận:\n${url}\n\nĐường dẫn có hiệu lực 30 phút. Nếu thông tin không đúng, không xác nhận và báo lại quản trị.\n\nTài khoản, mật khẩu, lớp học và dữ liệu hiện tại được giữ nguyên. Xác nhận email không tự cấp gói dịch vụ trả phí.`})
  });
  if(!response.ok)throw Error('mail delivery failed');
  const result=await response.json();if(!result?.id)throw Error('mail delivery not acknowledged');
  const saved=await db.from('vm_teacher_email_requests').update({status:'sent'}).eq('user_id',userId).eq('token_hash',hash).eq('status','sending');
  if(saved.error)throw Error('mail state failed');
 } catch {
  await db.from('vm_teacher_email_requests').update({status:'failed'}).eq('user_id',userId).eq('token_hash',hash).eq('status','sending');
  throw Error('Chưa hoàn tất gửi thư xác nhận. Liên kết chưa được kích hoạt; vui lòng thử lại sau một phút.');
 }
 return {ok:true,pending:true,email,expiresAt};
}
