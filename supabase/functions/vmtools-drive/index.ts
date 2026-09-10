import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
import {decryptSecret,googleClientConfig,randomToken,refreshAccessToken,sha256Hex} from '../_shared/google_oauth.ts';
import {vmAccess} from '../_shared/vmtools-access.ts';
import {webTrial} from '../_shared/vmtools-trial.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const scope='https://www.googleapis.com/auth/drive.file',limit=20*1024*1024;
async function q(query:any){const {data,error}=await query;if(error)throw Error(error.message);return data;}
async function google(path:string,token:string,init:RequestInit={}){const r=await fetch('https://www.googleapis.com/drive/v3/'+path,{...init,headers:{authorization:'Bearer '+token,...init.headers}});if(!r.ok)throw Error('Google Drive chưa xử lý được yêu cầu. Kiểm tra kết nối và dung lượng Drive.');return r;}
const fields='id,name,modifiedTime,size,webViewLink';
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&['https://vinhmath.com','https://www.vinhmath.com'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  if(req.method!=='POST'||origin&&!headers['Access-Control-Allow-Origin'])throw Error('Yêu cầu không hợp lệ');
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer /i,''),{data,error}=await db.auth.getUser(jwt);
  if(error||!data.user)return Response.json({error:'Cần đăng nhập giáo viên VinhMath'},{status:401,headers});
  const user=data.user,claims=JSON.parse(atob(jwt.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
  if(!await q(db.rpc('vmtools_auth_session',{p_user:user.id,p_session:claims.session_id})))throw Error('Phiên đăng nhập đã kết thúc');
  const profile=await q(db.from('profiles').select('role').eq('id',user.id).maybeSingle());if(!['teacher','admin','student'].includes(profile?.role))return Response.json({error:'Tài khoản chưa được phép liên kết Drive'},{status:403,headers});
  const raw=await req.text();if(new TextEncoder().encode(raw).length>limit)throw Error('Bài giảng vượt 20 MB. Hãy tách bớt trang PDF trước khi lưu lên Drive.');const p=JSON.parse(raw);
  const connection=await q(db.from('vmtools_drive_connections').select('*').eq('user_id',user.id).maybeSingle());
  if(p.action==='status')return Response.json({connected:!!connection?.granted_scopes?.includes(scope),email:connection?.google_email||null},{headers});
  if(p.action==='disconnect'){await q(db.from('vmtools_drive_connections').delete().eq('user_id',user.id));return Response.json({ok:true},{headers});}
  const account=await q(db.from('vmtools_accounts').select('*').eq('auth_user_id',user.id).maybeSingle()),policy=await q(db.from('vmtools_web_experience').select('audience,features').eq('id',1).single());
  if(!vmAccess(account,profile.role).web&&!webTrial(policy,profile.role,account).allowed)return Response.json({error:'VMTools web chưa được kích hoạt hoặc trải nghiệm đã đóng'},{status:403,headers});
  if(p.action==='connect'){
   const state=randomToken();await q(db.from('google_oauth_states').insert({state_hash:await sha256Hex(state),user_id:user.id,purpose:'vmtools',expires_at:new Date(Date.now()+600000).toISOString()}));
   const cfg=googleClientConfig(),params=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.callbackUrl,response_type:'code',scope:'openid email '+scope,access_type:'offline',include_granted_scopes:'true',prompt:'consent',state});
   return Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params},{headers});
  }
  if(!connection?.granted_scopes?.includes(scope))throw Error('Hãy liên kết Google Drive trước');
  const token=await refreshAccessToken(await decryptSecret(connection.refresh_token_ciphertext));
  const owned="trashed = false and appProperties has { key='vmtools_owner' and value='"+user.id+"' }";
  if(p.action==='list'){
   const params=new URLSearchParams({q:owned+" and mimeType != 'application/vnd.google-apps.folder'",fields:'nextPageToken,files('+fields+')',pageSize:'50',orderBy:'modifiedTime desc'});
   if(p.pageToken){if(typeof p.pageToken!=='string'||p.pageToken.length>2000)throw Error('Trang không hợp lệ');params.set('pageToken',p.pageToken);}
   return Response.json(await(await google('files?'+params,token)).json(),{headers});
  }
  if(p.action==='load'){
   if(typeof p.id!=='string'||!/^[-\w]{10,200}$/.test(p.id))throw Error('Tệp không hợp lệ');
   const info=await(await google('files/'+p.id+'?fields=id,size,trashed,appProperties',token)).json();
   if(info.trashed||info.appProperties?.vmtools_owner!==user.id||Number(info.size)>limit)throw Error('Không có quyền mở tệp này hoặc tệp quá lớn');
   const doc=await(await google('files/'+p.id+'?alt=media',token)).json();return Response.json({doc},{headers});
  }
  if(p.action==='save'){
   const doc=p.doc;if(doc?.format!=='vmtools-workspace'||doc.version!==1||typeof doc.title!=='string'||doc.title.length>160||!doc.geometry||!doc.notebook)throw Error('Bài giảng VMTools không hợp lệ');
   const search=new URLSearchParams({q:owned+" and mimeType = 'application/vnd.google-apps.folder'",fields:'files(id)',pageSize:'1'});
   let folder=(await(await google('files?'+search,token)).json()).files?.[0]?.id;
   if(!folder)folder=(await(await google('files?fields=id',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'VMTools · Bài giảng',mimeType:'application/vnd.google-apps.folder',appProperties:{vmtools_owner:user.id}})})).json()).id;
   const content=JSON.stringify(doc),name=(doc.title.replace(/[\\/:*?"<>|]/g,' ').trim()||'Bài giảng')+' · '+new Date().toISOString().replace(/[:.]/g,'-')+'.vmtool';
   const start=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields='+fields,{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json','X-Upload-Content-Type':'application/json'},body:JSON.stringify({name,parents:[folder],appProperties:{vmtools_owner:user.id},mimeType:'application/json'})});
   const destination=start.headers.get('location');if(!start.ok||!destination||new URL(destination).origin!=='https://www.googleapis.com')throw Error('Chưa tạo được phiên lưu Drive');
   const upload=await fetch(destination,{method:'PUT',headers:{'Content-Type':'application/json'},body:content});if(!upload.ok)throw Error('Lưu Drive chưa hoàn tất. Bản trong máy vẫn được giữ.');
   return Response.json({file:await upload.json()},{headers});
  }
  throw Error('Thao tác không hợp lệ');
 }catch(e){const message=(e as Error).message;return Response.json({error:/refresh|invalid_grant|token|secret/i.test(message)?'Kết nối Google cần được cấp lại. Hãy liên kết Drive lại.':message},{status:400,headers});}
});
