import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
import {linkedPasswordLogin} from './login.ts';
import {vmAccess} from '../_shared/vmtools-access.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const features=['ink','pdf','geometry2d','geometry3d','graphs','calculator','export'];
const encoder=new TextEncoder();
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64=(b:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(b)));
function requireValue(ok:unknown,message:string){if(!ok)throw new Error(message);}
async function result(q:any){const {data,error}=await q;if(error)throw new Error(error.message);return data;}
async function rpc(name:string,args:any){return result(db.rpc(name,args));}
async function audit(actor:string,account:string|null,action:string,details:any={}){await result(db.from('vmtools_audit').insert({actor,account_id:account,action,details}));}
let signer:CryptoKey|null=null;
async function sign(payload:any){if(!signer){const k=await result(db.from('vmtools_server_keys').select('private_jwk').eq('id',1).single());signer=await crypto.subtle.importKey('jwk',k.private_jwk,{name:'Ed25519'},false,['sign']);}const text=JSON.stringify(payload);return {payload:text,signature:b64(await crypto.subtle.sign('Ed25519',signer,encoder.encode(text)))};}
async function session(token:string){requireValue(typeof token==='string'&&token.length<12000,'Cần đăng nhập');const {data,error}=await db.auth.getUser(token);requireValue(!error&&data.user,'Phiên đăng nhập không hợp lệ');const claims=JSON.parse(new TextDecoder().decode(bytes(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))));requireValue(await rpc('vmtools_auth_session',{p_user:data.user!.id,p_session:claims.session_id}),'Phiên đăng nhập đã kết thúc');return data.user!;}
async function latestRelease(){
 const r=await result(db.from('vmtools_releases').select('version,title,notes,published_at').eq('published',true).order('published_at',{ascending:false}).limit(1).maybeSingle());
 return r?{...r,published:true,windows_url:'https://vinhmath.com/vmtool?tab=download&platform=win32',macos_url:'https://vinhmath.com/vmtool?tab=download&platform=darwin'}:null;
}
const origins=new Set(['https://vinhmath.com','https://www.vinhmath.com']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin');const headers:any={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Headers']='authorization,x-client-info,apikey,content-type';headers['Access-Control-Allow-Methods']='POST,OPTIONS';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response('{}',{status:405,headers});
 try{
  requireValue(!origin||origin==='null'||origins.has(origin),'Nguồn truy cập không hợp lệ');
  const raw=await req.text();requireValue(raw.length<40000,'Yêu cầu quá lớn');const body=JSON.parse(raw);
  if (['public-catalog','web-catalog','download'].includes(body.action)) {
   const release = await latestRelease();
   const files = release ? await result(db.from('vmtools_release_files').select('id,version,platform,arch,kind,file_name,size,sha256,notarized').eq('version',release.version)) : [];
   if(body.action==='public-catalog') return Response.json({release,files},{headers});
   const user=await session(body.token);
   const profile=await result(db.from('profiles').select('role').eq('id',user.id).maybeSingle());
   const account=await result(db.from('vmtools_accounts').select('name,email,role,status,plan,paid_until,web_enabled,app_enabled,download_enabled').eq('auth_user_id',user.id).maybeSingle());
   const access=vmAccess(account,profile?.role||'');
   if(body.action==='web-catalog')return Response.json({account,access,release,files},{headers});
   if(!access.download)return Response.json({error:'Quyền tải VMTools chưa được kích hoạt hoặc đã hết hạn. Vui lòng liên hệ thầy Vinh.'},{status:403,headers});
   requireValue(typeof body.fileId==='string'&&body.fileId.length===36,'Tệp tải không hợp lệ');
   const file=await result(db.from('vmtools_release_files').select('storage_path,file_name,release:vmtools_releases!inner(published)').eq('id',body.fileId).eq('release.published',true).maybeSingle());
   requireValue(file,'Bộ cài chưa được công bố');
   const link=await result(db.storage.from('vmtools-releases').createSignedUrl(file.storage_path,90,{download:file.file_name}));
   return Response.json({url:link.signedUrl,expiresIn:90},{headers});
  }

  requireValue(typeof body.publicKey==='string'&&body.publicKey.length<200,'Khóa thiết bị không hợp lệ');
  const publicBytes=bytes(body.publicKey);const key=await crypto.subtle.importKey('spki',publicBytes,{name:'Ed25519'},false,['verify']);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',publicBytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(body.action==='challenge')return Response.json({nonce:await rpc('vmtools_challenge',{p_key:hash})},{headers});
  requireValue(typeof body.payload==='string'&&body.payload.length<24000&&typeof body.signature==='string'&&body.signature.length<200,'Yêu cầu không hợp lệ');
  requireValue(await crypto.subtle.verify('Ed25519',key,bytes(body.signature),encoder.encode(body.nonce+'\n'+body.payload)),'Chữ ký thiết bị không hợp lệ');
  requireValue(await rpc('vmtools_consume_challenge',{p_id:body.nonce,p_key:hash}),'Yêu cầu đã dùng hoặc hết hạn');
  const p=JSON.parse(body.payload);
  if(p.action==='login'){
   const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   p.token=await linkedPasswordLogin(p,{
    account:(email:string)=>result(db.from('vmtools_accounts').select('auth_user_id,status').eq('email',email).maybeSingle()),
    identity:async(id:string)=>{const {data,error}=await db.auth.admin.getUserById(id);return error?null:data.user;},
    signIn:(email:string,password:string)=>auth.auth.signInWithPassword({email,password}),
   });
   delete p.password;
  }
  if(p.action==='register'||p.action==='login'){
   const user=await session(p.token);const account=await result(db.from('vmtools_accounts').select('id,status,web_enabled').eq('auth_user_id',user.id).maybeSingle());
   requireValue(account&&account.status!=='blocked','Tài khoản chưa được cấp hoặc đã bị khóa');
   requireValue(p.platform!=='web'||account.web_enabled,'Tài khoản chưa được bật VMTools trên VinhMath');
   requireValue(['win32','darwin','web'].includes(p.platform)&&typeof p.name==='string','Thiết bị không hợp lệ');
   await rpc('vmtools_register',{p_account:account.id,p_key:hash,p_public:body.publicKey,p_name:p.name,p_platform:p.platform});
  }
  const device=await result(db.from('vmtools_devices').select('*').eq('key_hash',hash).maybeSingle());
  requireValue(device,'Thiết bị chưa được đăng ký');
  const a=await result(db.from('vmtools_accounts').select('*').eq('id',device.account_id).single());
  if(p.action==='status'||p.action==='register'||p.action==='login'){
   const release=await latestRelease();
   const teacher=a.role==='owner'||(await result(db.from('profiles').select('role').eq('id',a.auth_user_id).maybeSingle()))?.role==='teacher';
   let reason=!teacher?'teacher-required':a.status!=='active'?'account-'+a.status:device.status!=='active'?'device-'+device.status:device.platform==='web'&&!a.web_enabled?'web-disabled':device.platform!=='web'&&a.app_enabled===false?'app-disabled':a.role!=='owner'&&a.plan!=='lifetime'&&(!a.paid_until||Date.parse(a.paid_until)<=Date.now())?'expired':null;
   const summary={id:a.id,email:a.email,name:a.name,role:a.role,plan:a.plan,paidUntil:a.paid_until,webEnabled:a.web_enabled,device:device.name};
   if(reason)return Response.json({denied:true,reason,account:summary,release},{headers});
   const config=await result(db.from('vmtools_config').select('offline_days').eq('id',1).single());
   const issuedAt=Date.now(),offlineAllowanceMs=(a.offline_days??config.offline_days)*86400000,paidUntil=['owner','lifetime'].includes(a.plan)?null:Date.parse(a.paid_until);
   const lease=await sign({version:1,app:'vn.vmtools.classroom',userId:a.id,deviceKey:hash,leaseId:crypto.randomUUID(),revision:a.revision,plan:a.plan,issuedAt,offlineAllowanceMs,offlineUntil:Math.min(issuedAt+offlineAllowanceMs,paidUntil??Infinity),paidUntil,features:a.role==='owner'?features:a.features});
   await result(db.from('vmtools_devices').update({last_seen:new Date().toISOString()}).eq('key_hash',hash));
   return Response.json({lease,account:summary,release},{headers});
  }
  requireValue(a.role==='owner'&&a.status==='active'&&device.status==='active'&&device.platform!=='web','Không có quyền quản trị từ thiết bị này');
  let output:any={ok:true};
  if(p.action==='list'){
   const [accounts,devices,config,events]=await Promise.all([result(db.from('vmtools_accounts').select('*').order('created_at',{ascending:false}).limit(1000)),result(db.from('vmtools_devices').select('key_hash,account_id,name,platform,status,last_seen').limit(5000)),result(db.from('vmtools_config').select('*').eq('id',1).single()),result(db.from('vmtools_audit').select('*').order('at',{ascending:false}).limit(50))]);output={accounts,devices,config,events};
  }else if(p.action==='publish-release'){
   requireValue(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(p.version)&&typeof p.title==='string'&&p.title.length>0&&p.title.length<=100&&typeof p.notes==='string'&&p.notes.length<=4000,'Phiên bản hoặc mô tả không hợp lệ');
   for(const value of [p.windowsUrl,p.macosUrl]){const u=new URL(value);requireValue(u.protocol==='https:'&&['vinhmath.com','www.vinhmath.com','github.com','drive.google.com'].includes(u.hostname)&&!u.username&&!u.password,'Chỉ dùng đường dẫn tải chính thức HTTPS');}
   const previous=await result(db.from('vmtools_releases').select('version').eq('published',true).order('published_at',{ascending:false}).limit(1).maybeSingle());if(previous){const x=p.version.split('.').map(Number),y=previous.version.split('.').map(Number),i=x.findIndex((n:number,i:number)=>n!==y[i]);requireValue(i>=0&&x[i]>y[i],'Bản công bố phải mới hơn bản hiện tại');}
   await result(db.from('vmtools_releases').insert({version:p.version,title:p.title,notes:p.notes,windows_url:p.windowsUrl,macos_url:p.macosUrl,published:true,actor:a.id}));await audit(a.id,null,'release-published',{version:p.version});
  }else if(p.action==='create'){
   requireValue((p.plan==='pending'||p.confirmGrant===true)&&['pending','monthly','yearly','custom','lifetime'].includes(p.plan)&&Number.isInteger(p.units)&&p.units>=1&&p.units<=120&&Number.isFinite(p.amount)&&p.amount>=0&&(p.plan!=='custom'||Date.parse(p.until)>Date.now()),'Hãy kiểm tra gói, số tiền và xác nhận cấp hạn');
   const email=String(p.email||'').trim().toLowerCase();requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/@(?:gv|gv[a-z0-9]+)\.vinhmath\.com$/.test(email)&&email.length<=254&&String(p.name||'').length<=160,'Email hoặc tên không hợp lệ');
   requireValue(!await result(db.from('vmtools_accounts').select('id').eq('email',email).maybeSingle()),'Email đã có tài khoản VMTools');
   let id=await rpc('vmtools_auth_id',{p_email:email}),created=false;
   if(id){requireValue(p.linkExisting===true,'Email đã có trên VinhMath. Chọn liên kết tài khoản hiện có; mật khẩu cũ được giữ nguyên.');const profile=await result(db.from('profiles').select('role').eq('id',id).maybeSingle());requireValue(profile&&['teacher','admin'].includes(profile.role),'Chỉ liên kết tài khoản giáo viên VinhMath.');}
   else{requireValue(typeof p.password==='string'&&p.password.length>=12&&p.password.length<=128,'Mật khẩu ban đầu cần 12–128 ký tự');const {data,error}=await db.auth.admin.createUser({email,password:p.password,email_confirm:true,user_metadata:{full_name:p.name||email},app_metadata:{vinhmath_role:'teacher'}});if(error)throw error;id=data.user.id;created=true;}
   try{if(created){const profile=await result(db.from('profiles').update({role:'teacher',full_name:p.name||email,email,username:'gv_'+id.replaceAll('-','').slice(0,20)}).eq('id',id).select('id').single());requireValue(profile,'Không tạo được hồ sơ giáo viên');}output={id:await rpc('vmtools_provision',{p_actor:a.id,p_user:id,p_email:email,p_name:p.name||'',p_web:p.webEnabled===true,p_plan:p.plan,p_units:p.units,p_until:p.until,p_amount:p.amount})};}catch(e){if(created){const rollback=await db.auth.admin.deleteUser(id);if(rollback.error)throw Error('Chưa hoàn tất cấp quyền và chưa hoàn tác được tài khoản tạm. Liên hệ quản trị.');}throw e;}

   await audit(a.id,output.id,'account-created',{email,linkedExisting:!created});
  }else if(p.action==='save'){
   requireValue(Array.isArray(p.features)&&p.features.every((f:string)=>features.includes(f)),'Quyền không hợp lệ');
   await rpc('vmtools_account_save',{p_actor:a.id,p_id:p.id,p_name:p.name,p_status:p.status,p_days:p.offlineDays,p_devices:p.maxDevices,p_features:[...new Set(p.features)],p_web:p.webEnabled===true});
  }else if(p.action==='renew'){
   output={paidUntil:await rpc('vmtools_renew',{p_actor:a.id,p_account:p.id,p_request:p.requestId,p_plan:p.plan,p_units:p.units,p_until:p.until,p_amount:p.amount,p_note:p.note})};
  }else if(p.action==='device')await rpc('vmtools_device_status',{p_actor:a.id,p_key:p.key,p_status:p.status});
  else if(p.action==='config'){
   requireValue(Number.isInteger(p.offlineDays)&&p.offlineDays>=1&&p.offlineDays<=365,'Số ngày ngoại tuyến: 1–365');
   await result(db.from('vmtools_config').update({offline_days:p.offlineDays}).eq('id',1));await audit(a.id,null,'offline-default',{days:p.offlineDays});
  }else throw Error('Thao tác không được hỗ trợ');
  return Response.json(output,{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Không xử lý được yêu cầu'},{status:400,headers});}
});
