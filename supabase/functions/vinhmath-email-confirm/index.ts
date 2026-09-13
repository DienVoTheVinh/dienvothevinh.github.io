import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
import {checkAuthEmail,tokenHash} from '../_shared/teacher-email.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// This endpoint uses a 256-bit, expiring, single-use email capability instead of a login JWT.
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&['https://vinhmath.com','https://www.vinhmath.com'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(origin&&!headers['Access-Control-Allow-Origin'])return Response.json({error:'Nguồn truy cập không hợp lệ'},{status:403,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 try {
  const raw=await req.text();if(raw.length>1024)throw Error('Yêu cầu không hợp lệ');
  const p=JSON.parse(raw);
  if(!['preview','confirm'].includes(p.action)||typeof p.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token))throw Error('Liên kết không hợp lệ hoặc đã hết hạn');
  const hash=await tokenHash(p.token);
  const {data:r,error}=await db.from('vm_teacher_email_requests').select('user_id,email,status,expires_at').eq('token_hash',hash).maybeSingle();
  if(error||!r||!['sent','confirmed'].includes(r.status)||Date.parse(r.expires_at)<=Date.now())throw Error('Liên kết không hợp lệ hoặc đã hết hạn');
  if(p.action==='preview') {
   const {data:profile,error:profileError}=await db.from('profiles').select('full_name').eq('id',r.user_id).eq('role','teacher').maybeSingle();
   if(profileError||!profile)throw Error('Không tìm thấy giáo viên');
   return Response.json({email:r.email,name:profile.full_name,confirmed:r.status==='confirmed'},{headers});
  }
  await checkAuthEmail(db,r.email,r.user_id);
  const result=await db.rpc('vm_teacher_email_confirm',{p_hash:hash});
  if(result.error)throw Error(result.error.message);
  return Response.json({ok:true},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Chưa xác nhận được email'},{status:400,headers});}
});
