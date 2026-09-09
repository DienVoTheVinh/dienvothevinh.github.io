import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
import {linkedPasswordLogin} from '../vmtools-license/login.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&['https://vinhmath.com','https://www.vinhmath.com'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(req.method!=='POST'||origin&&!headers['Access-Control-Allow-Origin'])throw Error();const raw=await req.text();if(raw.length>2000)throw Error();const input=JSON.parse(raw);
 const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});let session:any=null;
 await linkedPasswordLogin(input,{
  account:async(email:string)=>{const {data,error}=await db.from('vmtools_accounts').select('auth_user_id').eq('email',email).maybeSingle();if(error)throw Error();return data?{...data,status:'active'}:null;},
  identity:async(id:string)=>{const {data,error}=await db.auth.admin.getUserById(id);return error?null:data.user;},
  signIn:async(email:string,password:string)=>{const r=await auth.auth.signInWithPassword({email,password});session=r.data.session;return r;}
 });
 // This restores the same website identity. VMTools service status is enforced
 // separately and must not lock an independently active classroom service.
 return Response.json({session},{headers});
 }catch{return Response.json({error:'Email hoặc mật khẩu VinhMath không đúng.'},{status:401,headers});}
});
